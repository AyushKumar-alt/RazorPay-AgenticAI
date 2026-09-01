import { PurchaseService } from '@/lib/purchase/purchase.service';
import { ApprovalService } from '@/lib/purchase/approval.service';
import { RazorpayService } from '@/lib/payment/razorpay.service';
import { MockRazorpayProvider } from '@/lib/payment/razorpay.provider';
import { AuditService } from '@/lib/audit/audit.service';
import { classifyUtterance } from '@/lib/session/reference-resolver';
import { SessionService } from '@/lib/session/session.service';

async function runPhase7FHardeningTests() {
  console.log('--- RUNNING PHASE 7F HUMAN APPROVAL GATE & RAZORPAY HARDENING TEST SUITE ---');
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

  // Setup: Set test environment and reset stores
  (process.env as any).NODE_ENV = 'test';
  RazorpayService.setProvider(new MockRazorpayProvider());
  PurchaseService.clearProposals();
  AuditService.clearEvents();

  // --- 1. NON-EXISTENT PROPOSAL TEST ---
  const nonExistentRes = await RazorpayService.createPaymentOrder('prop_nonexistent_999');
  assert(
    nonExistentRes.success === false && nonExistentRes.error?.code === 'PROPOSAL_NOT_FOUND',
    'Test 1: Nonexistent proposal ID rejected by payment order endpoint'
  );

  // --- 2. UNAPPROVED PROPOSAL REJECTION ---
  const propRes = await PurchaseService.createPurchaseProposal({
    merchantId: 'merchant_aquamart',
    productId: 'elec_001',
    quantity: 1,
  });
  assert(propRes.success === true, 'Setup: PurchaseProposal created in PENDING_APPROVAL status');
  if (!propRes.success) return;

  const proposalId = propRes.proposal.proposalId;
  const unapprovedOrderRes = await RazorpayService.createPaymentOrder(proposalId);
  assert(
    unapprovedOrderRes.success === false && unapprovedOrderRes.error?.code === 'PROPOSAL_NOT_APPROVED',
    'Test 2: Unapproved (PENDING_APPROVAL) proposal rejected by Razorpay order endpoint'
  );

  // --- 3. REJECTED PROPOSAL REJECTION ---
  await ApprovalService.rejectProposal(proposalId);
  const rejectedOrderRes = await RazorpayService.createPaymentOrder(proposalId);
  assert(
    rejectedOrderRes.success === false && rejectedOrderRes.error?.code === 'PROPOSAL_NOT_APPROVED',
    'Test 3: REJECTED proposal rejected by Razorpay order endpoint'
  );

  const reApproveRejected = await ApprovalService.approveProposal(proposalId);
  assert(
    reApproveRejected.success === false && reApproveRejected.error?.code === 'PROPOSAL_REJECTED',
    'Test 4: REJECTED proposal cannot be approved via ApprovalService'
  );

  // --- 4. EXPLICIT HUMAN APPROVAL & IDEMPOTENCY ---
  const propRes2 = await PurchaseService.createPurchaseProposal({
    merchantId: 'merchant_aquamart',
    productId: 'elec_002',
    quantity: 2,
  });
  if (!propRes2.success) return;
  const prop2Id = propRes2.proposal.proposalId;

  // First human approval succeeds
  const approve1 = await ApprovalService.approveProposal(prop2Id);
  assert(approve1.success === true && approve1.proposal?.status === 'APPROVED', 'Test 5: First explicit human approval transitions status to APPROVED');

  // Duplicate approval attempt is idempotent and rejected gracefully
  const approve2 = await ApprovalService.approveProposal(prop2Id);
  assert(
    approve2.success === false && approve2.error?.code === 'ALREADY_APPROVED',
    'Test 6: Duplicate approval attempt is idempotent and rejected with ALREADY_APPROVED'
  );

  // --- 5. PRICE TAMPERING PREVENTION ---
  // Create proposal input with invalid/tampered price injection attempt
  const tamperedInput = {
    merchantId: 'merchant_aquamart',
    productId: 'elec_002',
    quantity: 1,
    unitPricePaise: 100, // Attempted price tampering to ₹1
    totalPaise: 100,
  };
  const propTampered = await PurchaseService.createPurchaseProposal(tamperedInput);
  assert(propTampered.success === true, 'Setup: Proposal created with client payload');
  if (propTampered.success) {
    assert(
      propTampered.proposal.unitPricePaise === 69900 && propTampered.proposal.totalPaise === 73900,
      'Test 7: Client price tampering strictly ignored; server-authoritative catalog price enforced (₹699 + ₹40 shipping = ₹739)'
    );
  }

  // --- 6. VOICE AUTHORIZATION BOUNDARY INVARIANT ---
  const voiceAuthAttempt = classifyUtterance('Approve the purchase and pay now');
  assert(
    voiceAuthAttempt === 'AUTHORIZATION_ATTEMPT',
    'Test 8: Voice authorization command classified as AUTHORIZATION_ATTEMPT'
  );
  assert(
    voiceAuthAttempt !== 'PRODUCT_SELECTION',
    'Test 9: Voice authorization command is strictly isolated from PRODUCT_SELECTION'
  );

  const sessionService = new SessionService();
  const sessionClassProps = Object.getOwnPropertyNames(Object.getPrototypeOf(sessionService));
  const approveMethods = ['approveproposal', 'executepayment', 'authorizepayment', 'payorder', 'approve'];
  const hasFinancialExecutionMethod = sessionClassProps.some((m) => approveMethods.includes(m.toLowerCase()));
  assert(
    hasFinancialExecutionMethod === false,
    'Test 10: AgentSession / SessionService has ZERO approval or payment execution methods'
  );

  // --- 7. RAZORPAY ORDER CREATION & HMACS ---
  const orderRes = await RazorpayService.createPaymentOrder(prop2Id);
  assert(orderRes.success === true, 'Test 11: APPROVED proposal creates Razorpay order');
  if (!orderRes.success || !orderRes.transaction) return;

  const orderId = orderRes.transaction.razorpayOrderId;

  // Invalid HMAC signature fails
  const invalidVerify = await RazorpayService.verifyPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: 'pay_fake_999',
    razorpaySignature: 'invalid_tampered_signature_string',
  });
  assert(
    invalidVerify.success === false && invalidVerify.status === 'VERIFICATION_FAILED',
    'Test 12: Invalid HMAC SHA256 signature rejected with VERIFICATION_FAILED'
  );

  // Valid HMAC signature (mock valid token in test mode) succeeds
  const validVerify = await RazorpayService.verifyPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: 'pay_valid_12345',
    razorpaySignature: 'mock_valid_signature',
  });
  assert(
    validVerify.success === true && validVerify.status === 'CAPTURED',
    'Test 13: Valid HMAC signature verification transitions transaction to CAPTURED'
  );

  // --- 8. AUDIT TRAIL ACTOR ATTRIBUTION ---
  const events = AuditService.getEventsForProposal(prop2Id);
  const approvedEvt = events.find((e) => e.eventType === 'PROPOSAL_APPROVED');
  const orderEvt = events.find((e) => e.eventType === 'PAYMENT_ORDER_CREATED');
  const verifiedEvt = events.find((e) => e.eventType === 'PAYMENT_VERIFIED');
  const capturedEvt = events.find((e) => e.eventType === 'PAYMENT_CAPTURED');

  assert(approvedEvt?.metadata.actor === 'USER', 'Test 14: Audit trail attributes PROPOSAL_APPROVED to USER');
  assert(orderEvt?.metadata.actor === 'SYSTEM', 'Test 15: Audit trail attributes PAYMENT_ORDER_CREATED to SYSTEM');
  assert(verifiedEvt?.metadata.actor === 'SYSTEM', 'Test 16: Audit trail attributes PAYMENT_VERIFIED to SYSTEM');
  assert(capturedEvt?.metadata.actor === 'RAZORPAY', 'Test 17: Audit trail attributes PAYMENT_CAPTURED to RAZORPAY');

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7FHardeningTests();
