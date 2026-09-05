'use client';

import React, { useState, useEffect } from 'react';
import { RevenueOpportunity } from '@/types/revenue';

export const RevenueRecoveryWidget: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [paymentLink, setPaymentLink] = useState<{
    id: string;
    shortUrl: string;
    amountPaise: number;
    currency: string;
    status: string;
  } | null>(null);

  const [txStatus, setTxStatus] = useState<'FAILED' | 'LINK_CREATED' | 'RECOVERED'>('FAILED');
  const [razorpayPaymentId, setRazorpayPaymentId] = useState<string | null>(null);
  const [recoveredAt, setRecoveredAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDevTools, setShowDevTools] = useState(false);

  const opportunity: RevenueOpportunity = {
    id: 'opp_tx_synth_001_recovery',
    type: 'failed_payment_recovery',
    sourceOrderId: 'tx_synth_001',
    customerId: 'cust_synth_001',
    suggestedAction: 'Send payment recovery link for Wireless Headphones',
    amountPaise: 69900, // ₹699.00
    confidence: 0.95,
    reasoning: 'Gateway timeout during checkout attempt.',
  };

  // Poll server state while link is created
  useEffect(() => {
    if (txStatus !== 'LINK_CREATED') return;

    let ignore = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/revenue/status?id=${opportunity.sourceOrderId}`);
        const result = await res.json();
        if (!ignore && result.success && result.statuses) {
          const statusInfo = result.statuses[opportunity.sourceOrderId!];
          if (statusInfo && statusInfo.status === 'RECOVERED') {
            setTxStatus('RECOVERED');
            setRazorpayPaymentId(statusInfo.razorpayPaymentId || 'pay_verified_webhook');
            setRecoveredAt(statusInfo.recoveredAt || new Date().toISOString());
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.warn('Widget status poll error:', err);
      }
    }, 3000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [txStatus, opportunity.sourceOrderId]);

  const handleApproveRecovery = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/agent/revenue/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity,
          context: {
            humanApproved: true, // Explicit merchant approval
            customerName: 'Priya Sharma',
            customerEmail: 'priya.sharma@example.com',
            customerContact: '9876543210',
            merchantId: 'merchant_aquamart',
            productId: 'audio_002',
          },
        }),
      });

      const data = await res.json();
      if (!data.success || !data.paymentLink) {
        throw new Error(data.error?.message || 'Failed to create Razorpay Payment Link.');
      }

      setPaymentLink(data.paymentLink);
      setTxStatus('LINK_CREATED');
    } catch (err: any) {
      setErrorMsg(err.message || 'Action execution error.');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateWebhook = async () => {
    setErrorMsg(null);
    try {
      const payload = {
        event: 'payment_link.paid',
        event_id: `evt_widget_${Date.now()}`,
        payload: {
          payment_link: {
            entity: {
              id: paymentLink?.id || 'plink_sim_001',
              amount_paid: 69900,
              notes: { sourceOrderId: opportunity.sourceOrderId },
            },
          },
          payment: {
            entity: {
              id: `pay_widget_${Date.now()}`,
              status: 'captured',
            },
          },
        },
      };

      const res = await fetch('/api/payment/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'mock_webhook_secret_for_tests',
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.success) {
        setTxStatus('RECOVERED');
        setRazorpayPaymentId(payload.payload.payment.entity.id);
        setRecoveredAt(new Date().toISOString());
      } else {
        setErrorMsg(result.error?.message || 'Webhook simulation failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error simulating webhook.');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto my-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-2xl">
      {/* Widget Title Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 text-lg shadow-lg">
            ₹
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              Revenue Recovery Agent — NovaBazaar
            </h3>
            <p className="text-xs text-slate-400">
              Autonomous Merchant Revenue Optimization Engine
            </p>
          </div>
        </div>

        {/* Transaction Status Pill */}
        <span
          className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
            txStatus === 'RECOVERED'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
              : txStatus === 'LINK_CREATED'
              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }`}
        >
          {txStatus === 'RECOVERED'
            ? '🟢 PAYMENT RECOVERED (₹699)'
            : txStatus === 'LINK_CREATED'
            ? '🟡 PAYMENT PENDING'
            : '⚠️ FAILED PAYMENT'}
        </span>
      </div>

      {/* Opportunity Details Card */}
      <div className="mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">
              Opportunity Identified
            </span>
            <h4 className="text-sm font-semibold text-white mt-1">
              Wireless Noise-Canceling Headphones
            </h4>
            <p className="text-xs text-slate-400">
              Customer: Priya Sharma (priya.sharma@example.com)
            </p>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold text-emerald-400">₹699</span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-xs text-amber-200">
          <strong>Failure Diagnosis:</strong> Gateway Timeout during original checkout.
          <br />
          <strong>Policy Bound:</strong> Amount ₹699 &gt; ₹500 threshold ➔{' '}
          <span className="underline font-semibold">Human Merchant Approval Required</span>.
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="mt-3 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-xs text-red-200">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* Action Execution Area */}
      <div className="mt-5 space-y-3">
        {txStatus === 'FAILED' && (
          <button
            type="button"
            onClick={handleApproveRecovery}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-semibold text-sm shadow-lg hover:shadow-emerald-500/20 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span>Executing Policy Engine &amp; Calling Razorpay...</span>
            ) : (
              <>
                <span>⚡ Approve &amp; Generate Razorpay Payment Link</span>
              </>
            )}
          </button>
        )}

        {txStatus === 'LINK_CREATED' && paymentLink && (
          <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/50 space-y-3">
            <div className="flex items-center justify-between text-xs text-blue-200">
              <span>Razorpay Payment Link ID:</span>
              <span className="font-mono text-white font-bold">{paymentLink.id}</span>
            </div>

            <div className="flex items-center justify-between text-xs text-blue-200">
              <span>Razorpay Short URL:</span>
              <a
                href={paymentLink.shortUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-emerald-400 hover:underline truncate max-w-[240px]"
              >
                {paymentLink.shortUrl}
              </a>
            </div>

            {/* Direct Pay Button */}
            <a
              href={paymentLink.shortUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block w-full text-center py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-colors"
            >
              💳 Open Live Razorpay Test Checkout Page
            </a>

            <p className="text-[11px] text-blue-300/80 italic text-center">
              Listening for Razorpay payment_link.paid webhook... Status will automatically update when paid.
            </p>
          </div>
        )}

        {txStatus === 'RECOVERED' && (
          <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-600/70 text-xs text-emerald-100 space-y-2 text-center shadow-lg">
            <div className="text-sm font-bold text-emerald-300">🎉 PAYMENT RECOVERED</div>
            <p>Payment verified via Razorpay Webhook (payment_link.paid).</p>
            <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-emerald-200 pt-1">
              <div>Amount: ₹699</div>
              <div>Payment ID: {razorpayPaymentId || 'pay_verified'}</div>
            </div>
          </div>
        )}

        {/* Developer Fold */}
        <div className="pt-2 border-t border-slate-800 text-right">
          <button
            type="button"
            onClick={() => setShowDevTools(!showDevTools)}
            className="text-[10px] text-slate-500 hover:text-slate-400 font-mono"
          >
            {showDevTools ? 'Hide Dev Tools' : 'Show Dev Tools'}
          </button>
          {showDevTools && txStatus === 'LINK_CREATED' && (
            <button
              type="button"
              onClick={handleSimulateWebhook}
              className="mt-2 w-full py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
            >
              🔄 Send Simulated payment_link.paid Webhook
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
