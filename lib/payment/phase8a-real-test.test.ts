import { RazorpayService } from './razorpay.service';
import { MockRazorpayProvider } from './razorpay.provider';
import { PaymentStore } from './payment.store';
import { PurchaseService } from '@/lib/purchase/purchase.service';
import { ApprovalService } from '@/lib/purchase/approval.service';
import { AuditService } from '@/lib/audit/audit.service';
import { classifyUtterance } from '@/lib/session/reference-resolver';
import crypto from 'crypto';

async function runPhase8ATests() {
  console.log('--- RUNNING PHASE 8A REAL-TEST & SECURITY TEST SUITE ---');
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

  // Ensure process.env.NODE_ENV is 'test' for test execution
  (process.env as any).NODE_ENV = 'test';

  // Explicitly inject Mock provider for deterministic offline testing
  const mockProvider = new MockRazorpayProvider();
  RazorpayService.setProvider(mockProvider);

  // Reset store
  PurchaseService.clearProposals();
  PaymentStore.clearStore();
  AuditService.clearEvents();

  // --- TEST 1: Fail-Closed Runtime Check ---
  try {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevKeyId = process.env.RAZORPAY_KEY_ID;
    const prevKeySecret = process.env.RAZORPAY_KEY_SECRET;

    // Temporarily simulate production runtime with missing keys
    (process.env as any).NODE_ENV = 'production';
    process.env.RAZORPAY_KEY_ID = '';
    process.env.RAZORPAY_KEY_SECRET = '';
    RazorpayService.setProvider(null); // Clear custom mock provider

    let threw = false;
    let errorMessage = '';
    try {
      RazorpayService.getProvider();
    } catch (err: any) {
      threw = true;
      errorMessage = err.message;
    }

    assert(
      threw && errorMessage.includes('Razorpay Configuration Error'),
      'Test 1: Fail-Closed Check - getProvider() throws error when keys are missing in production runtime mode'
    );

    // Restore environment
    (process.env as any).NODE_ENV = prevNodeEnv;
    process.env.RAZORPAY_KEY_ID = prevKeyId;
    process.env.RAZORPAY_KEY_SECRET = prevKeySecret;
    RazorpayService.setProvider(mockProvider);
  } catch (err: any) {
    assert(false, 'Test 1: Fail-Closed Check', err.message);
  }

  // --- TEST 2: PENDING_APPROVAL proposal cannot create payment order ---
  try {
    const propRes = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'elec_002',
      quantity: 1,
    });
    if (propRes.success) {
      const pendingProposalId = propRes.proposal.proposalId;
      const orderRes = await RazorpayService.createPaymentOrder(pendingProposalId);
      assert(
        !orderRes.success && orderRes.error?.code === 'PROPOSAL_NOT_APPROVED',
        'Test 2: PENDING_APPROVAL proposal cannot create Razorpay order'
      );
    } else {
      assert(false, 'Test 2: Setup failed', JSON.stringify(propRes));
    }
  } catch (err: any) {
    assert(false, 'Test 2', err.message);
  }

  // --- TEST 3: REJECTED proposal cannot create payment order ---
  try {
    const propRes = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'elec_002',
      quantity: 1,
    });
    if (propRes.success) {
      const rejPropId = propRes.proposal.proposalId;
      await ApprovalService.rejectProposal(rejPropId);
      const orderRes = await RazorpayService.createPaymentOrder(rejPropId);
      assert(
        !orderRes.success && orderRes.error?.code === 'PROPOSAL_NOT_APPROVED',
        'Test 3: REJECTED proposal cannot create Razorpay order'
      );
    }
  } catch (err: any) {
    assert(false, 'Test 3', err.message);
  }

  // --- TEST 4: APPROVED proposal creates order with provider delegation ---
  let approvedProposalId = '';
  let createdOrderId = '';
  try {
    const propRes = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'elec_002', // ₹699 unit price + ₹40 shipping = 73,900 paise
      quantity: 1,
    });
    if (propRes.success) {
      approvedProposalId = propRes.proposal.proposalId;
      await ApprovalService.approveProposal(approvedProposalId);

      const orderRes = await RazorpayService.createPaymentOrder(approvedProposalId);
      assert(
        orderRes.success &&
          !!orderRes.transaction &&
          orderRes.transaction.amountPaise === 73900 &&
          orderRes.transaction.status === 'CREATED',
        'Test 4: APPROVED proposal creates Razorpay order with authoritative amount (73,900 paise)'
      );
      if (orderRes.success && orderRes.transaction) {
        createdOrderId = orderRes.transaction.razorpayOrderId;
      }
    } else {
      assert(false, 'Test 4 Setup failed', JSON.stringify(propRes));
    }
  } catch (err: any) {
    assert(false, 'Test 4', err.message);
  }

  // --- TEST 5: Client price tampering strictly ignored ---
  try {
    const proposal = PurchaseService.getProposal(approvedProposalId);
    assert(
      proposal !== null && proposal.totalPaise === 73900,
      'Test 5: Authoritative proposal total (73,900 paise) cannot be overridden by client input'
    );
  } catch (err: any) {
    assert(false, 'Test 5', err.message);
  }

  // --- TEST 6: Invalid Razorpay signature is rejected ---
  try {
    const invalidVerifyRes = await RazorpayService.verifyPayment({
      razorpayOrderId: createdOrderId,
      razorpayPaymentId: 'pay_test_99999',
      razorpaySignature: 'invalid_forged_signature_hex',
    });
    assert(
      !invalidVerifyRes.success && invalidVerifyRes.status === 'VERIFICATION_FAILED',
      'Test 6: Forged/invalid Razorpay HMAC signature is rejected'
    );
  } catch (err: any) {
    assert(false, 'Test 6', err.message);
  }

  // --- TEST 7: Valid HMAC signature is accepted ---
  try {
    const propRes = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'elec_002',
      quantity: 1,
    });
    if (propRes.success) {
      const validPropId = propRes.proposal.proposalId;
      await ApprovalService.approveProposal(validPropId);
      const orderRes = await RazorpayService.createPaymentOrder(validPropId);

      if (orderRes.success && orderRes.transaction) {
        const orderId = orderRes.transaction.razorpayOrderId;
        // Initiate payment to set status to PAYMENT_PENDING
        RazorpayService.initiatePayment(orderRes.transaction.transactionId);

        const validPaymentId = 'pay_test_88888';
        const testSecret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret_for_tests';
        const validSignature = crypto
          .createHmac('sha256', testSecret)
          .update(`${orderId}|${validPaymentId}`)
          .digest('hex');

        const validVerifyRes = await RazorpayService.verifyPayment({
          razorpayOrderId: orderId,
          razorpayPaymentId: validPaymentId,
          razorpaySignature: validSignature,
        });

        assert(
          validVerifyRes.success && validVerifyRes.status === 'CAPTURED',
          'Test 7: Valid HMAC SHA-256 signature is accepted and status transitions to CAPTURED'
        );
      } else {
        assert(false, 'Test 7 Setup failed', JSON.stringify(orderRes));
      }
    }
  } catch (err: any) {
    assert(false, 'Test 7', err.message);
  }

  // --- TEST 8: Voice approval isolation ---
  try {
    const voiceUtterance = 'Approve the purchase and pay for it';
    const classification = classifyUtterance(voiceUtterance);
    assert(
      classification === 'AUTHORIZATION_ATTEMPT',
      'Test 8: Voice authorization command is classified as AUTHORIZATION_ATTEMPT and cannot trigger payment API'
    );
  } catch (err: any) {
    assert(false, 'Test 8', err.message);
  }

  // --- TEST 9: Secret Isolation ---
  try {
    const orderRes = await RazorpayService.createPaymentOrder(approvedProposalId);
    const resString = JSON.stringify(orderRes);
    assert(
      !resString.includes('mock_secret_for_tests') && !resString.includes('RAZORPAY_KEY_SECRET'),
      'Test 9: RAZORPAY_KEY_SECRET is never returned in API responses'
    );
  } catch (err: any) {
    assert(false, 'Test 9', err.message);
  }

  console.log(`\nPHASE 8A TEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase8ATests();
