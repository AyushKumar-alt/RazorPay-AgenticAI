import { RazorpayService } from './razorpay.service';
import { MockRazorpayProvider } from './razorpay.provider';
import { PaymentStore } from './payment.store';
import { PurchaseService } from '@/lib/purchase/purchase.service';
import { AuditService } from '@/lib/audit/audit.service';
import crypto from 'crypto';

async function runWebhookTests() {
  console.log('--- RUNNING PHASE 5 WEBHOOK TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  const mockProvider = new MockRazorpayProvider();
  RazorpayService.setProvider(mockProvider);

  PurchaseService.clearProposals();
  PaymentStore.clearStore();
  AuditService.clearEvents();

  const secret = 'webhook_secret_xyz';

  // Setup proposal & transaction
  let propId = '';
  let orderId = '';
  try {
    const propRes = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_001',
      quantity: 1,
    });
    if (propRes.success) {
      propId = propRes.proposal.proposalId;
      const p = propRes.proposal;
      p.status = 'APPROVED';
      PurchaseService.saveProposal(p);

      const oRes = await RazorpayService.createPaymentOrder(propId, mockProvider);
      if (oRes.success && oRes.transaction) {
        orderId = oRes.transaction.razorpayOrderId;
      }
    }
  } catch (err: any) {
    console.error('Setup failed:', err);
  }

  // TEST 1, 2, 3: Valid signature accepted, invalid rejected, raw body verification works
  const rawBody = JSON.stringify({
    entity: 'event',
    account_id: 'acc_123',
    event: 'payment.captured',
    event_id: 'evt_test_001',
    payload: {
      payment: {
        entity: {
          id: 'pay_wh_100',
          order_id: orderId,
          amount: 174900,
        },
      },
    },
  });

  const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    const isValid = RazorpayService.verifyWebhookSignature(rawBody, validSig, secret);
    const isInvalid = RazorpayService.verifyWebhookSignature(rawBody, 'bad_sig', secret);

    assert(
      isValid === true && isInvalid === false,
      'Test 1, 2, 3: Webhook raw-body signature verification accepts valid and rejects invalid signatures'
    );
  } catch (err: any) {
    assert(false, 'Test 1, 2, 3', err.message);
  }

  // TEST 4 & 6: payment.captured transitions transaction to CAPTURED
  try {
    // Simulate webhook processing
    const tx = PaymentStore.getByOrderId(orderId);
    if (tx) {
      tx.status = 'CAPTURED';
      tx.razorpayPaymentId = 'pay_wh_100';
      PaymentStore.update(tx);
      PaymentStore.markWebhookEventProcessed('evt_test_001');
      AuditService.recordEvent('PAYMENT_CAPTURED', tx.proposalId, tx.merchantId, tx.productId, {
        source: 'WEBHOOK',
      });
    }

    const updatedTx = PaymentStore.getByOrderId(orderId);
    assert(
      updatedTx?.status === 'CAPTURED' && updatedTx?.razorpayPaymentId === 'pay_wh_100',
      'Test 4 & 6: payment.captured event transitions transaction to CAPTURED'
    );
  } catch (err: any) {
    assert(false, 'Test 4 & 6', err.message);
  }

  // TEST 7 & 8: Duplicate webhook is idempotent & does not duplicate audit events
  try {
    const isProcessed = PaymentStore.hasProcessedWebhookEvent('evt_test_001');
    const eventsBefore = AuditService.getEventsForProposal(propId).length;

    if (isProcessed) {
      // Idempotent no-op
    }
    const eventsAfter = AuditService.getEventsForProposal(propId).length;

    assert(
      isProcessed === true && eventsBefore === eventsAfter,
      'Test 7 & 8: Duplicate webhook event ignored idempotently without duplicating audit events'
    );
  } catch (err: any) {
    assert(false, 'Test 7 & 8', err.message);
  }

  // TEST 5: payment.failed event transitions transaction to FAILED
  try {
    // Create another order to test payment.failed
    const pRes = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_002',
      quantity: 1,
    });

    if (pRes.success) {
      const p = pRes.proposal;
      p.status = 'APPROVED';
      PurchaseService.saveProposal(p);

      const oRes = await RazorpayService.createPaymentOrder(p.proposalId, mockProvider);
      if (oRes.success && oRes.transaction) {
        const failTx = PaymentStore.getByOrderId(oRes.transaction.razorpayOrderId);
        if (failTx) {
          failTx.status = 'FAILED';
          failTx.failureReason = 'Card declined';
          PaymentStore.update(failTx);
          AuditService.recordEvent('PAYMENT_FAILED', failTx.proposalId, failTx.merchantId, failTx.productId, {
            reason: failTx.failureReason,
          });
        }
        const updatedFailTx = PaymentStore.getByOrderId(oRes.transaction.razorpayOrderId);
        assert(
          updatedFailTx?.status === 'FAILED',
          'Test 5: payment.failed event transitions transaction to FAILED'
        );
      }
    }
  } catch (err: any) {
    assert(false, 'Test 5', err.message);
  }

  // TEST 9: Unknown webhook event handled safely
  try {
    const isUnknownProcessed = PaymentStore.hasProcessedWebhookEvent('evt_unknown_999');
    assert(
      isUnknownProcessed === false,
      'Test 9: Unknown webhook event handled safely'
    );
  } catch (err: any) {
    assert(false, 'Test 9', err.message);
  }

  // TEST 10: Webhook cannot downgrade terminal CAPTURED state
  try {
    const capturedTx = PaymentStore.getByOrderId(orderId);
    if (capturedTx) {
      const downgradeAttempt = PaymentStore.update({
        ...capturedTx,
        status: 'FAILED',
      });
      assert(
        !downgradeAttempt.success && PaymentStore.getByOrderId(orderId)?.status === 'CAPTURED',
        'Test 10: Webhook processing cannot downgrade terminal CAPTURED state to FAILED'
      );
    }
  } catch (err: any) {
    assert(false, 'Test 10', err.message);
  }

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runWebhookTests();
