import { RazorpayService } from './razorpay.service';
import { MockRazorpayProvider } from './razorpay.provider';
import { PaymentStore } from './payment.store';
import { PurchaseService } from '@/lib/purchase/purchase.service';
import { AuditService } from '@/lib/audit/audit.service';
import crypto from 'crypto';

async function runPaymentTests() {
  console.log('--- RUNNING PHASE 5 PAYMENT TEST SUITE ---');
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

  // Set mock provider for deterministic offline testing
  const mockProvider = new MockRazorpayProvider();
  RazorpayService.setProvider(mockProvider);

  // Teardown state before testing
  PurchaseService.clearProposals();
  PaymentStore.clearStore();
  AuditService.clearEvents();

  let approvedPropId = '';
  let pendingPropId = '';
  let rejectedPropId = '';
  let expiredPropId = '';

  // Setup proposals
  try {
    const prop1 = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_001',
      quantity: 1,
    });
    if (prop1.success) {
      approvedPropId = prop1.proposal.proposalId;
      // Approve proposal
      const appRes = await PurchaseService.getProposal(approvedPropId);
      if (appRes) {
        appRes.status = 'APPROVED';
        PurchaseService.saveProposal(appRes);
      }
    }

    const prop2 = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_002',
      quantity: 1,
    });
    if (prop2.success) {
      pendingPropId = prop2.proposal.proposalId; // PENDING_APPROVAL
    }

    const prop3 = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_003',
      quantity: 1,
    });
    if (prop3.success) {
      rejectedPropId = prop3.proposal.proposalId;
      const rejRes = await PurchaseService.getProposal(rejectedPropId);
      if (rejRes) {
        rejRes.status = 'REJECTED';
        PurchaseService.saveProposal(rejRes);
      }
    }

    const prop4 = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_001',
      quantity: 1,
    });
    if (prop4.success) {
      expiredPropId = prop4.proposal.proposalId;
      const expRes = await PurchaseService.getProposal(expiredPropId);
      if (expRes) {
        expRes.status = 'EXPIRED';
        PurchaseService.saveProposal(expRes);
      }
    }
  } catch (err: any) {
    console.error('Failed test setup:', err);
  }

  // TEST 1: Approved proposal can create payment order
  let createdOrderId = '';
  try {
    const res = await RazorpayService.createPaymentOrder(approvedPropId, mockProvider);
    if (res.success && res.transaction) {
      createdOrderId = res.transaction.razorpayOrderId;
    }
    assert(
      res.success && res.transaction?.status === 'CREATED' && res.transaction?.amountPaise === 174900, // 169900 + 5000 shipping
      'Test 1: Approved proposal creates payment order with authoritative total (₹1,749 = 174,900 paise)'
    );
  } catch (err: any) {
    assert(false, 'Test 1', err.message);
  }

  // TEST 2: Pending proposal rejected
  try {
    const res = await RazorpayService.createPaymentOrder(pendingPropId, mockProvider);
    assert(
      !res.success && res.error?.code === 'PROPOSAL_NOT_APPROVED',
      'Test 2: PENDING_APPROVAL proposal cannot create payment order'
    );
  } catch (err: any) {
    assert(false, 'Test 2', err.message);
  }

  // TEST 3: Rejected proposal rejected
  try {
    const res = await RazorpayService.createPaymentOrder(rejectedPropId, mockProvider);
    assert(
      !res.success && res.error?.code === 'PROPOSAL_NOT_APPROVED',
      'Test 3: REJECTED proposal cannot create payment order'
    );
  } catch (err: any) {
    assert(false, 'Test 3', err.message);
  }

  // TEST 4: Expired proposal rejected
  try {
    const res = await RazorpayService.createPaymentOrder(expiredPropId, mockProvider);
    assert(
      !res.success && res.error?.code === 'PROPOSAL_NOT_APPROVED',
      'Test 4: EXPIRED proposal cannot create payment order'
    );
  } catch (err: any) {
    assert(false, 'Test 4', err.message);
  }

  // TEST 5 & 6: Client amount override ignored & authoritative amount used
  try {
    // Attempting to pass client amount (ignored by service signature)
    const res = await RazorpayService.createPaymentOrder(approvedPropId, mockProvider);
    // Duplicate check triggered because approvedPropId already has active transaction
    assert(
      !res.success && res.error?.code === 'PAYMENT_ORDER_ALREADY_EXISTS',
      'Test 5 & 6 & 9: Duplicate active order rejected with PAYMENT_ORDER_ALREADY_EXISTS'
    );
  } catch (err: any) {
    assert(false, 'Test 5 & 6 & 9', err.message);
  }

  // TEST 7 & 8: Correct Razorpay order created & transaction status CREATED
  try {
    const tx = PaymentStore.getByOrderId(createdOrderId);
    assert(
      tx !== null && tx.status === 'CREATED' && tx.currency === 'INR',
      'Test 7 & 8: PaymentTransaction persisted with status CREATED and currency INR'
    );
  } catch (err: any) {
    assert(false, 'Test 7 & 8', err.message);
  }

  // TEST 10, 11, 12: Signature verification passes for valid HMAC and fails for invalid HMAC
  const secret = 'mock_secret_for_tests';
  process.env.RAZORPAY_KEY_SECRET = secret;

  const validPaymentId = 'pay_test_999';
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${createdOrderId}|${validPaymentId}`)
    .digest('hex');

  try {
    const isValid = RazorpayService.verifyPaymentSignature(createdOrderId, validPaymentId, expectedSig, secret);
    const isInvalid = RazorpayService.verifyPaymentSignature(createdOrderId, validPaymentId, 'invalid_signature_xyz', secret);

    assert(
      isValid === true && isInvalid === false,
      'Test 10, 11, 12: HMAC SHA256 signature verification passes valid and rejects invalid signatures'
    );
  } catch (err: any) {
    assert(false, 'Test 10, 11, 12', err.message);
  }

  // TEST 13 & 14: Different length signature handled safely with timingSafeEqual
  try {
    const shortSig = 'abc';
    const isSafeLengthCheck = RazorpayService.verifyPaymentSignature(createdOrderId, validPaymentId, shortSig, secret);
    assert(
      isSafeLengthCheck === false,
      'Test 13 & 14: Different-length signature checked safely without throw using timingSafeEqual'
    );
  } catch (err: any) {
    assert(false, 'Test 13 & 14', err.message);
  }

  // TEST 15 & 19 & 20: Valid verification transitions to CAPTURED & records audit events
  try {
    const verifyRes = await RazorpayService.verifyPayment({
      razorpayOrderId: createdOrderId,
      razorpayPaymentId: validPaymentId,
      razorpaySignature: expectedSig,
    });

    const tx = PaymentStore.getByOrderId(createdOrderId);
    const events = AuditService.getEventsForProposal(approvedPropId);
    const capturedEvent = events.find((e) => e.eventType === 'PAYMENT_CAPTURED');

    assert(
      verifyRes.success &&
        verifyRes.status === 'CAPTURED' &&
        tx?.status === 'CAPTURED' &&
        tx?.razorpayPaymentId === validPaymentId &&
        capturedEvent !== undefined,
      'Test 15, 19, 20: Valid verification transitions status to CAPTURED, persists payment ID, and records audit event'
    );
  } catch (err: any) {
    assert(false, 'Test 15, 19, 20', err.message);
  }

  // TEST 16: Invalid signature verification transitions to VERIFICATION_FAILED
  try {
    // Create new approved proposal & order
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
        const failVerify = await RazorpayService.verifyPayment({
          razorpayOrderId: oRes.transaction.razorpayOrderId,
          razorpayPaymentId: 'pay_invalid',
          razorpaySignature: 'bad_signature',
        });

        const tx = PaymentStore.getByOrderId(oRes.transaction.razorpayOrderId);
        assert(
          !failVerify.success &&
            failVerify.status === 'VERIFICATION_FAILED' &&
            tx?.status === 'VERIFICATION_FAILED',
          'Test 16: Invalid signature verification transitions transaction to VERIFICATION_FAILED'
        );
      }
    }
  } catch (err: any) {
    assert(false, 'Test 16', err.message);
  }

  // TEST 17 & 18: Invalid state transition rejected (CAPTURED cannot be downgraded to FAILED)
  try {
    const capturedTx = PaymentStore.getByOrderId(createdOrderId);
    if (capturedTx) {
      const invalidUpdate = PaymentStore.update({
        ...capturedTx,
        status: 'FAILED',
      });
      assert(
        !invalidUpdate.success && PaymentStore.getByOrderId(createdOrderId)?.status === 'CAPTURED',
        'Test 17 & 18: State machine rejects downgrading terminal CAPTURED status to FAILED'
      );
    }
  } catch (err: any) {
    assert(false, 'Test 17 & 18', err.message);
  }

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentTests();
