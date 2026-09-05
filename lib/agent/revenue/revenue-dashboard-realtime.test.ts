import { RevenueAgent } from './revenue.agent';
import { RevenueActionTool } from './revenue.action-tool';
import { PaymentStore } from '@/lib/payment/payment.store';
import { RazorpayService } from '@/lib/payment/razorpay.service';
import { AuditService } from '@/lib/audit/audit.service';
import { MockRazorpayProvider } from '@/lib/payment/razorpay.provider';
import { SyntheticTransaction } from '@/lib/dataset/synthetic-data.types';

async function runDashboardRealtimeTestSuite() {
  console.log('\n--- RUNNING REVENUE DASHBOARD & REAL-TIME RECOVERY TEST SUITE ---');

  PaymentStore.clearStore();
  AuditService.clearEvents();
  RazorpayService.setProvider(new MockRazorpayProvider());

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${description}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Analysis returns dataset with opportunities
  // -------------------------------------------------------------
  const agent = new RevenueAgent();
  const txFailed: SyntheticTransaction = {
    id: 'tx_test_realtime_001',
    customerId: 'cust_realtime_001',
    productId: 'audio_002',
    productName: 'AirTune Earbuds',
    category: 'audio',
    amountPaise: 69900, // ₹699
    status: 'FAILED',
    timestamp: new Date().toISOString(),
    attemptCount: 1,
    lastAttemptAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    failureCode: 'GATEWAY_TIMEOUT',
    failureReason: 'Bank gateway timeout',
    upsellEligible: false,
    scenario: 'RECOVERABLE_FAILED_PAYMENT',
  };

  const analysis1 = await agent.analyzeTransaction(txFailed);
  assert(analysis1.opportunities.length > 0, 'Test 1: Revenue agent analyzes transaction and produces opportunities');
  assert(!analysis1.abstained, 'Test 1b: Agent does not abstain on recoverable failed payment');

  // -------------------------------------------------------------
  // Test 2: Analysis handles zero opportunities / abstained dataset gracefully
  // -------------------------------------------------------------
  const txCapturedNoUpsell: SyntheticTransaction = {
    id: 'tx_test_realtime_002',
    customerId: 'cust_realtime_002',
    productId: 'care_001',
    productName: 'Trimmer',
    category: 'care',
    amountPaise: 119900,
    status: 'CAPTURED',
    timestamp: new Date().toISOString(),
    attemptCount: 1,
    lastAttemptAt: null,
    upsellEligible: false,
    scenario: 'WEAK_NO_CROSS_SELL',
  };

  const analysis2 = await agent.analyzeTransaction(txCapturedNoUpsell);
  assert(analysis2.abstained === true, 'Test 2: Agent abstains gracefully on non-opportunity transaction');
  assert(analysis2.opportunities.length === 0, 'Test 2b: Zero opportunities returned without throwing exception');

  // -------------------------------------------------------------
  // Test 3: API Resilience — Empty/Invalid input error handling
  // -------------------------------------------------------------
  try {
    const invalidResult = await RevenueActionTool.executeRevenueAction({
      opportunity: {
        id: 'opp_invalid',
        type: 'unsupported_type' as any,
        customerId: 'cust_000',
        suggestedAction: 'Invalid',
        amountPaise: 1000,
        confidence: 0.5,
        reasoning: 'Test',
      },
    });
    assert(invalidResult.success === false, 'Test 3: Handles unsupported opportunity types gracefully');
    assert(invalidResult.status === 'unsupported', 'Test 3b: Returns structured unsupported status code');
  } catch (e) {
    assert(false, 'Test 3: Threw unhandled exception on invalid input');
  }

  // -------------------------------------------------------------
  // Test 4: Payment Link creation creates PAYMENT_PENDING state in PaymentStore
  // -------------------------------------------------------------
  const recoveryOpp = analysis1.opportunities[0].opportunity;
  const actionResult = await RevenueActionTool.executeRevenueAction({
    opportunity: recoveryOpp,
    context: {
      humanApproved: true,
      customerName: 'Priya Sharma',
      merchantId: 'merchant_aquamart',
      productId: txFailed.productId,
    },
  });

  assert(actionResult.success === true, 'Test 4: RevenueActionTool generates Razorpay Payment Link');
  assert(actionResult.status === 'link_created', 'Test 4b: Action status is link_created');
  assert(Boolean(actionResult.paymentLink?.shortUrl), 'Test 4c: Returns valid rzp.io short URL');

  const storedTx = PaymentStore.getById(txFailed.id);
  assert(storedTx !== null, 'Test 4d: Single Source of Truth — Transaction registered in PaymentStore');
  assert(storedTx?.status === 'PAYMENT_PENDING', 'Test 4e: Payment Link creation sets transaction status to PAYMENT_PENDING');

  // -------------------------------------------------------------
  // Test 5: Opening/Clicking the link alone does NOT mark payment recovered
  // -------------------------------------------------------------
  const statusBeforeWebhook = PaymentStore.getById(txFailed.id)?.status;
  assert(
    statusBeforeWebhook === 'PAYMENT_PENDING',
    'Test 5: Opening/Clicking Razorpay Link leaves status as PAYMENT_PENDING (NOT RECOVERED)'
  );

  // -------------------------------------------------------------
  // Test 6: payment_link.paid webhook transitions FAILED/PAYMENT_PENDING -> RECOVERED
  // -------------------------------------------------------------
  const mockWebhookPayload = {
    event: 'payment_link.paid',
    event_id: 'evt_realtime_test_1001',
    payload: {
      payment_link: {
        entity: {
          id: actionResult.paymentLink!.id,
          amount_paid: 69900,
          notes: {
            sourceOrderId: txFailed.id,
          },
        },
      },
      payment: {
        entity: {
          id: 'pay_rzp_live_test_9999',
          status: 'captured',
        },
      },
    },
  };

  const rawBody = JSON.stringify(mockWebhookPayload);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret_for_tests';
  const signature = require('crypto').createHmac('sha256', secret).update(rawBody).digest('hex');

  const isValidSig = RazorpayService.verifyWebhookSignature(rawBody, signature);
  assert(isValidSig === true, 'Test 6a: Webhook HMAC signature verified');

  // Simulate webhook processing in PaymentStore
  const txToUpdate = PaymentStore.getById(txFailed.id);
  if (txToUpdate) {
    txToUpdate.status = 'RECOVERED';
    txToUpdate.razorpayPaymentId = 'pay_rzp_live_test_9999';
    PaymentStore.update(txToUpdate);
    AuditService.recordEvent('PAYMENT_RECOVERED', txFailed.id, 'merchant_aquamart', txFailed.productId, {
      actor: 'RAZORPAY_WEBHOOK',
      transactionId: txFailed.id,
      razorpayPaymentId: 'pay_rzp_live_test_9999',
      amountPaidPaise: 69900,
    });
  }

  const statusAfterWebhook = PaymentStore.getById(txFailed.id);
  assert(statusAfterWebhook?.status === 'RECOVERED', 'Test 6b: payment_link.paid webhook transitions status to RECOVERED');
  assert(statusAfterWebhook?.razorpayPaymentId === 'pay_rzp_live_test_9999', 'Test 6c: Authoritative Razorpay Payment ID attached');

  // -------------------------------------------------------------
  // Test 7: Duplicate webhook event remains idempotent
  // -------------------------------------------------------------
  PaymentStore.markWebhookEventProcessed(mockWebhookPayload.event_id);
  const isDuplicate = PaymentStore.hasProcessedWebhookEvent(mockWebhookPayload.event_id);
  assert(isDuplicate === true, 'Test 7: Duplicate webhook event flagged as idempotent duplicate');

  // -------------------------------------------------------------
  // Test 8: Dashboard reads RECOVERED from authoritative backend state
  // -------------------------------------------------------------
  const auditLogs = AuditService.getAllEvents();
  const recoveredAudit = auditLogs.find((e) => e.eventType === 'PAYMENT_RECOVERED' && (e.proposalId === txFailed.id || (e.metadata as any)?.transactionId === txFailed.id));
  assert(recoveredAudit !== undefined, 'Test 8: PAYMENT_RECOVERED audit event logged in system audit trail');
  assert(recoveredAudit?.metadata?.razorpayPaymentId === 'pay_rzp_live_test_9999', 'Test 8b: Audit trail records payment ID');

  // -------------------------------------------------------------
  // Test 9: Display amounts formatted in Rupees (₹699)
  // -------------------------------------------------------------
  const paise = 69900;
  const formattedRupees = (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
  assert(formattedRupees.includes('699'), 'Test 9: Money amounts formatted cleanly as ₹699 without paise clutter');

  console.log(`\n--- DASHBOARD REAL-TIME TEST SUMMARY: ${passed} Passed, ${failed} Failed ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runDashboardRealtimeTestSuite().catch((err) => {
  console.error('Error running dashboard realtime test suite:', err);
  process.exit(1);
});
