'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatRupees } from '@/lib/money/money';

interface BoundCheck {
  rule: string;
  passed: boolean;
  detail?: string;
}

interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  boundsChecked: BoundCheck[];
}

interface RevenueOpportunity {
  id: string;
  type: string;
  sourceOrderId?: string;
  customerId: string;
  suggestedAction: string;
  amountPaise: number;
  discountPercent?: number;
  itemCount?: number;
  confidence: number;
  reasoning: string;
}

interface AnalyzedTransactionItem {
  transaction: {
    id: string;
    customerId: string;
    productId: string;
    productName: string;
    category: string;
    amountPaise: number;
    status: 'FAILED' | 'ABANDONED' | 'CAPTURED';
    timestamp: string;
    attemptCount: number;
    lastAttemptAt: string | null;
    failureCode?: string;
    failureReason?: string;
    upsellEligible: boolean;
    scenario: string;
  };
  analysis: {
    transactionId: string;
    opportunities: Array<{
      opportunity: RevenueOpportunity;
      policyDecision: PolicyDecision;
    }>;
    abstained: boolean;
    explanation: string;
  };
}

interface SummaryMetrics {
  totalAnalyzed: number;
  totalOpportunities: number;
  policyRejectedCount: number;
  humanApprovalCount: number;
  autoActionCount: number;
  abstainedCount: number;
}

interface PaymentLinkInfo {
  id: string;
  shortUrl: string;
  amountPaise: number;
  currency: string;
  status: string;
  description: string;
}

interface RecoveryStatusInfo {
  status: 'LINK_CREATED' | 'PAYMENT_PENDING' | 'RECOVERED' | 'FAILED' | 'EXPIRED';
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  amountPaise?: number;
  recoveredAt?: string;
  recoverySource?: string;
}

export default function RevenueWorkspacePage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<AnalyzedTransactionItem[]>([]);
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Real-time Payment Links & Authoritative Recovery State
  const [paymentLinks, setPaymentLinks] = useState<Record<string, PaymentLinkInfo>>({});
  const [recoveryStatuses, setRecoveryStatuses] = useState<Record<string, RecoveryStatusInfo>>({});
  const [expandedDevTools, setExpandedDevTools] = useState<Record<string, boolean>>({});

  // Polling ref to track active polling
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAnalysis = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/revenue/analyze', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setData(result.results || []);
        setSummary(result.summary || null);
      } else {
        setErrorMsg(result.error?.message || 'Failed to analyze revenue dataset.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error communicating with revenue agent endpoint.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/api/revenue/analyze', { method: 'POST' });
        const result = await res.json();
        if (!ignore) {
          if (result.success) {
            setData(result.results || []);
            setSummary(result.summary || null);
          } else {
            setErrorMsg(result.error?.message || 'Failed to analyze revenue dataset.');
          }
        }
      } catch (err: any) {
        if (!ignore) {
          setErrorMsg(err.message || 'Error communicating with revenue agent endpoint.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  // Poll server every 3-5 seconds for transactions with pending payment links
  useEffect(() => {
    const pendingTxIds = Object.keys(recoveryStatuses).filter((txId) => {
      const s = recoveryStatuses[txId]?.status;
      return s === 'LINK_CREATED' || s === 'PAYMENT_PENDING';
    });

    if (pendingTxIds.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    async function pollStatuses() {
      try {
        const idsQuery = pendingTxIds.join(',');
        const res = await fetch(`/api/revenue/status?id=${encodeURIComponent(idsQuery)}`);
        const result = await res.json();

        if (result.success && result.statuses) {
          setRecoveryStatuses((prev) => {
            const next = { ...prev };
            let hasChanged = false;

            for (const txId of pendingTxIds) {
              const serverStatus = result.statuses[txId];
              if (serverStatus && serverStatus.status === 'RECOVERED') {
                next[txId] = {
                  status: 'RECOVERED',
                  razorpayPaymentId: serverStatus.razorpayPaymentId,
                  razorpayOrderId: serverStatus.razorpayOrderId,
                  amountPaise: serverStatus.amountPaise,
                  recoveredAt: serverStatus.recoveredAt || new Date().toISOString(),
                  recoverySource: serverStatus.recoverySource || 'Razorpay payment_link.paid',
                };
                hasChanged = true;
              }
            }

            return hasChanged ? next : prev;
          });
        }
      } catch (err) {
        console.warn('Status polling error:', err);
      }
    }

    // Run poll immediately on registration
    pollStatuses();

    // Set 3-second interval polling
    pollingRef.current = setInterval(pollStatuses, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [recoveryStatuses]);

  // Handle generating a real Razorpay Payment Link via RevenueActionTool
  const handleGeneratePaymentLink = async (
    opportunity: RevenueOpportunity,
    transactionId: string,
    productId: string,
    requiresApproval: boolean
  ) => {
    setActionLoadingId(opportunity.id);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/agent/revenue/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity,
          context: {
            humanApproved: requiresApproval ? true : false,
            customerName: opportunity.customerId,
            merchantId: 'merchant_aquamart',
            productId,
          },
        }),
      });

      const result = await res.json();

      if (result.success && result.paymentLink) {
        setPaymentLinks((prev) => ({
          ...prev,
          [opportunity.id]: result.paymentLink,
        }));

        setRecoveryStatuses((prev) => ({
          ...prev,
          [transactionId]: {
            status: 'LINK_CREATED',
            amountPaise: opportunity.amountPaise,
            razorpayOrderId: result.paymentLink.id,
          },
        }));
      } else {
        setErrorMsg(result.error?.message || result.reasoning || 'Failed to generate Razorpay payment link.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error generating Razorpay payment link.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Developer Test Tool: Trigger simulated webhook
  const handleSimulateWebhookEvent = async (transactionId: string, paymentLinkId?: string) => {
    setErrorMsg(null);
    try {
      const mockEventId = `evt_sim_${Date.now()}`;
      const payload = {
        event: 'payment_link.paid',
        event_id: mockEventId,
        payload: {
          payment_link: {
            entity: {
              id: paymentLinkId || `plink_sim_${transactionId}`,
              amount_paid: 69900,
              notes: {
                sourceOrderId: transactionId,
              },
            },
          },
          payment: {
            entity: {
              id: `pay_sim_${Date.now()}`,
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
        // Trigger status revalidation immediately
        setRecoveryStatuses((prev) => ({
          ...prev,
          [transactionId]: {
            status: 'RECOVERED',
            razorpayPaymentId: payload.payload.payment.entity.id,
            amountPaise: 69900,
            recoveredAt: new Date().toISOString(),
            recoverySource: 'Razorpay payment_link.paid (Simulated Webhook)',
          },
        }));
      } else {
        setErrorMsg(result.error?.message || 'Simulated webhook failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error sending simulated webhook.');
    }
  };

  const toggleDevTools = (oppId: string) => {
    setExpandedDevTools((prev) => ({
      ...prev,
      [oppId]: !prev[oppId],
    }));
  };

  // Calculate summary counts including live recovered state
  const recoveredCount = Object.values(recoveryStatuses).filter((s) => s.status === 'RECOVERED').length;
  const recoveredTotalPaise = Object.values(recoveryStatuses)
    .filter((s) => s.status === 'RECOVERED')
    .reduce((sum, s) => sum + (s.amountPaise || 0), 0);

  const filteredData = data.filter((item) => {
    const tx = item.transaction;
    const opps = item.analysis?.opportunities || [];
    const statusInfo = recoveryStatuses[tx.id];

    const matchesSearch =
      searchQuery === '' ||
      tx.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.productName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'RECOVERED') return statusInfo?.status === 'RECOVERED';
    if (activeFilter === 'PAYMENT_PENDING') return statusInfo?.status === 'LINK_CREATED' || statusInfo?.status === 'PAYMENT_PENDING';
    if (activeFilter === 'ABSTAINED') return item.analysis?.abstained;
    if (activeFilter === 'HUMAN_APPROVAL_REQUIRED') {
      return opps.some((o) => o.policyDecision.allowed && o.policyDecision.requiresApproval);
    }
    if (activeFilter === 'AUTO_ACTION_ELIGIBLE') {
      return opps.some((o) => o.policyDecision.allowed && !o.policyDecision.requiresApproval);
    }
    if (activeFilter === 'POLICY_REJECTED') {
      return opps.some((o) => !o.policyDecision.allowed);
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-emerald-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 text-lg">
            ₹
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              REVENUE AGENT
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-medium">
                Merchant Intelligence
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Autonomous Recovery Engine • Policy Controls • Razorpay Webhook Revalidation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAnalysis}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-600/20"
          >
            {loading ? 'Analyzing...' : '🔄 Run Analysis'}
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition"
          >
            Back to Store
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        {/* Error Banner */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAnalysis}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-md transition"
              >
                Retry
              </button>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 font-bold hover:text-white px-2">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Top Summary Metrics Cards */}
        {summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">Transactions Analyzed</span>
              <span className="text-2xl font-bold text-white">{summary.totalAnalyzed}</span>
            </div>
            <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/40">
              <span className="text-xs text-indigo-300 block mb-1">Opportunities Detected</span>
              <span className="text-2xl font-bold text-indigo-400">{summary.totalOpportunities}</span>
            </div>
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/40">
              <span className="text-xs text-rose-300 block mb-1">Policy Rejected</span>
              <span className="text-2xl font-bold text-rose-400">{summary.policyRejectedCount}</span>
            </div>
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/40">
              <span className="text-xs text-amber-300 block mb-1">Human Approval Required</span>
              <span className="text-2xl font-bold text-amber-400">{summary.humanApprovalCount}</span>
            </div>
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/40">
              <span className="text-xs text-emerald-300 block mb-1">Auto-Action Eligible</span>
              <span className="text-2xl font-bold text-emerald-400">{summary.autoActionCount}</span>
            </div>
            <div className="p-4 rounded-xl bg-teal-950/60 border border-teal-700/60 shadow-lg shadow-teal-500/10">
              <span className="text-xs text-teal-300 block mb-1 font-semibold">Recovered Revenue</span>
              <span className="text-2xl font-bold text-teal-300">{formatRupees(recoveredTotalPaise)}</span>
              <span className="text-[10px] text-teal-400 block mt-0.5">{recoveredCount} transaction(s)</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">Agent Abstained</span>
              <span className="text-2xl font-bold text-slate-400">{summary.abstainedCount}</span>
            </div>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/60 animate-pulse h-20" />
            ))}
          </div>
        ) : null}

        {/* Filter Controls & Search */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'ALL', label: 'All Items' },
              { id: 'HUMAN_APPROVAL_REQUIRED', label: 'Human Approval (>₹500)' },
              { id: 'AUTO_ACTION_ELIGIBLE', label: 'Auto-Action Eligible (≤₹500)' },
              { id: 'POLICY_REJECTED', label: 'Policy Rejected' },
              { id: 'ABSTAINED', label: 'Abstained' },
              { id: 'PAYMENT_PENDING', label: '🟡 Pending Payment' },
              { id: 'RECOVERED', label: '🟢 Recovered' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setActiveFilter(btn.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeFilter === btn.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search customer, transaction ID, product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-80 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Loading Skeleton */}
        {loading && data.length === 0 && (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 animate-pulse space-y-4">
                <div className="h-6 bg-slate-800 rounded w-1/3" />
                <div className="h-4 bg-slate-800 rounded w-2/3" />
                <div className="h-24 bg-slate-800/60 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredData.length === 0 && (
          <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
            <div className="text-3xl">🔍</div>
            <h3 className="text-base font-bold text-white">No Revenue Opportunities Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No transactions match the selected filter or search query. Try clearing your search or switching filters.
            </p>
            <button
              onClick={() => {
                setActiveFilter('ALL');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Opportunity Cards List */}
        <div className="space-y-6">
          {filteredData.map((item) => {
            const tx = item.transaction;
            const opps = item.analysis?.opportunities || [];
            const recoveryInfo = recoveryStatuses[tx.id];
            const isRecovered = recoveryInfo?.status === 'RECOVERED';
            const isPendingPayment = recoveryInfo?.status === 'LINK_CREATED' || recoveryInfo?.status === 'PAYMENT_PENDING';

            return (
              <div
                key={tx.id}
                className={`p-6 rounded-2xl border transition-all shadow-xl space-y-4 ${
                  isRecovered
                    ? 'bg-emerald-950/30 border-emerald-500/50 shadow-emerald-500/10'
                    : isPendingPayment
                    ? 'bg-blue-950/30 border-blue-500/40'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {/* Transaction Header Info */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-bold text-indigo-400">{tx.id}</span>
                    <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-mono">
                      Customer: {tx.customerId}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-md font-bold uppercase ${
                        isRecovered
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                          : tx.status === 'FAILED'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : tx.status === 'ABANDONED'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {isRecovered ? 'FAILED → RECOVERED' : tx.status}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">{tx.category}</span>
                    <span className="text-sm font-bold text-white">{formatRupees(tx.amountPaise)}</span>
                  </div>
                </div>

                {/* Event Details */}
                <div className="text-sm text-slate-300 space-y-1">
                  <p>
                    <strong className="text-slate-400">Product:</strong> {tx.productName}
                  </p>
                  {tx.failureReason && (
                    <p className="text-rose-400">
                      <strong className="text-slate-400">Diagnosis:</strong> {tx.failureReason}
                    </p>
                  )}
                  {tx.status === 'ABANDONED' && (
                    <p className="text-amber-400">
                      <strong className="text-slate-400">Diagnosis:</strong> Customer abandoned checkout cart.
                    </p>
                  )}
                </div>

                {/* Abstained View */}
                {item.analysis?.abstained && opps.length === 0 && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                      <span>{item.analysis.explanation}</span>
                    </div>
                    <span className="px-3 py-1 rounded-md bg-slate-800 text-slate-400 font-bold">
                      🛑 AGENT ABSTAINED
                    </span>
                  </div>
                )}

                {/* Evaluated Opportunities */}
                {opps.map(({ opportunity: opp, policyDecision: pd }) => {
                  const paymentLink = paymentLinks[opp.id];
                  const isDevOpen = expandedDevTools[opp.id] || false;

                  return (
                    <div
                      key={opp.id}
                      className={`p-5 rounded-xl border space-y-4 ${
                        isRecovered
                          ? 'bg-emerald-950/40 border-emerald-700/60'
                          : isPendingPayment
                          ? 'bg-blue-950/40 border-blue-700/50'
                          : !pd.allowed
                          ? 'bg-rose-950/20 border-rose-800/40'
                          : pd.requiresApproval
                          ? 'bg-amber-950/20 border-amber-800/40'
                          : 'bg-emerald-950/20 border-emerald-800/40'
                      }`}
                    >
                      {/* Opportunity Summary Line */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="text-xs uppercase tracking-wider font-bold text-indigo-400 block">
                            Opportunity Type: {opp.type.replace(/_/g, ' ')}
                          </span>
                          <h4 className="text-base font-bold text-white mt-0.5">{opp.suggestedAction}</h4>
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Opportunity Value</span>
                          <span className="text-base font-bold text-emerald-400">
                            {formatRupees(opp.amountPaise)}
                            {opp.discountPercent !== undefined && ` (${opp.discountPercent}% off)`}
                          </span>
                        </div>
                      </div>

                      {/* Reasoning */}
                      <p className="text-xs text-slate-300 italic bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                        &quot;{opp.reasoning}&quot;
                      </p>

                      {/* Deterministic Policy Bounds Checked Box */}
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                          Deterministic Policy Bounds Evaluation:
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          {pd.boundsChecked.map((b, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span>{b.passed ? '✓' : '⚠️'}</span>
                              <span className={b.passed ? 'text-slate-300' : 'text-amber-400 font-bold'}>
                                {b.rule}: {b.detail}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* LIVE MERCHANT RECOVERY STATUS CARDS */}

                      {/* STATE 1: PAYMENT RECOVERED (Verified via Webhook) */}
                      {isRecovered && (
                        <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-600/70 text-emerald-100 space-y-2.5 shadow-lg">
                          <div className="flex items-center justify-between border-b border-emerald-800/80 pb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                              🟢 PAYMENT RECOVERED
                            </span>
                            <span className="text-xs font-mono text-emerald-300 font-bold">
                              Transaction State: FAILED → RECOVERED
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                            <div>
                              <span className="text-emerald-400/80 block">Recovered Amount:</span>
                              <span className="text-lg font-bold text-white">{formatRupees(opp.amountPaise)}</span>
                            </div>
                            <div>
                              <span className="text-emerald-400/80 block">Razorpay Payment ID:</span>
                              <span className="font-mono text-white font-semibold">
                                {recoveryInfo?.razorpayPaymentId || 'pay_verified_webhook'}
                              </span>
                            </div>
                            <div>
                              <span className="text-emerald-400/80 block">Recovery Source:</span>
                              <span className="text-white font-medium">
                                {recoveryInfo?.recoverySource || 'Razorpay payment_link.paid'}
                              </span>
                            </div>
                            <div>
                              <span className="text-emerald-400/80 block">Confirmed At:</span>
                              <span className="text-white font-medium">
                                {recoveryInfo?.recoveredAt
                                  ? new Date(recoveryInfo.recoveredAt).toLocaleTimeString()
                                  : 'Just now'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* STATE 2: PAYMENT PENDING / LINK CREATED */}
                      {!isRecovered && isPendingPayment && paymentLink && (
                        <div className="p-4 rounded-xl bg-blue-950/60 border border-blue-700/60 text-blue-100 space-y-3 shadow-md">
                          <div className="flex items-center justify-between border-b border-blue-800/80 pb-2">
                            <span className="text-xs font-bold text-blue-300 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                              🟡 PAYMENT PENDING
                            </span>
                            <span className="text-[11px] text-blue-300 font-mono">
                              Polling for Razorpay Webhook...
                            </span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-blue-300">Razorpay Payment Link ID:</span>
                              <span className="font-mono text-white font-bold">{paymentLink.id}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-blue-300">Razorpay Short URL:</span>
                              <a
                                href={paymentLink.shortUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-emerald-400 hover:underline truncate max-w-[260px]"
                              >
                                {paymentLink.shortUrl}
                              </a>
                            </div>
                          </div>

                          {/* Customer Checkout Call to Action */}
                          <a
                            href={paymentLink.shortUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block w-full text-center py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition-colors cursor-pointer"
                          >
                            💳 Open Live Razorpay Test Checkout Page (Customer View)
                          </a>

                          <p className="text-[11px] text-blue-300/80 italic text-center">
                            Opening the Razorpay link allows the customer to complete payment. Status will automatically update to RECOVERED when Razorpay verifies the webhook.
                          </p>
                        </div>
                      )}

                      {/* STATE 3: ACTION BAR (Before Link Creation) */}
                      {!isRecovered && !isPendingPayment && (
                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">LLM Confidence:</span>
                            <span className="text-xs font-mono font-bold text-indigo-300">
                              {(opp.confidence * 100).toFixed(0)}%
                            </span>
                          </div>

                          <div>
                            {!pd.allowed ? (
                              <span className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold">
                                🚫 REJECTED BY POLICY
                              </span>
                            ) : pd.requiresApproval ? (
                              <button
                                onClick={() => handleGeneratePaymentLink(opp, tx.id, tx.productId, true)}
                                disabled={actionLoadingId === opp.id}
                                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-lg shadow-amber-600/20 disabled:opacity-50 cursor-pointer"
                              >
                                {actionLoadingId === opp.id
                                  ? 'Executing Policy & Creating Link...'
                                  : '⚡ Approve & Generate Razorpay Payment Link'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleGeneratePaymentLink(opp, tx.id, tx.productId, false)}
                                disabled={actionLoadingId === opp.id}
                                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                              >
                                {actionLoadingId === opp.id
                                  ? 'Generating Link...'
                                  : '⚡ Auto-Execute & Create Payment Link (≤₹500)'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* DE-EMPHASIZED COLLAPSIBLE DEVELOPER / TEST TOOLS */}
                      <div className="pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => toggleDevTools(opp.id)}
                          className="text-[11px] text-slate-500 hover:text-slate-400 flex items-center gap-1 font-mono transition"
                        >
                          <span>{isDevOpen ? '▼' : '►'}</span>
                          <span>Developer / Test Tools</span>
                        </button>

                        {isDevOpen && (
                          <div className="mt-3 p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                            <span className="text-[11px] text-slate-400 block">
                              Automated Webhook Simulation (Developer Test Tool):
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSimulateWebhookEvent(tx.id, paymentLink?.id)}
                              className="w-full py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
                            >
                              🔄 Send Simulated payment_link.paid Webhook to /api/payment/webhook
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
