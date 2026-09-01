import { PurchaseService } from '@/lib/purchase/purchase.service';
import { ApprovalService } from '@/lib/purchase/approval.service';
import { RazorpayService } from '@/lib/payment/razorpay.service';

async function runPaymentApiSecurityTests() {
  console.log('--- RUNNING PHASE 7E PAYMENT API SECURITY BOUNDARY TEST SUITE ---');
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

  // Clear previous proposals
  PurchaseService.clearProposals();

  // Step 1: Create a purchase proposal in PENDING_APPROVAL status using valid seed product ID elec_002
  const propRes = await PurchaseService.createPurchaseProposal({
    merchantId: 'merchant_aquamart',
    productId: 'elec_002',
    quantity: 1,
  });

  assert(propRes.success === true, 'Setup: PurchaseProposal created successfully');
  if (!propRes.success) return;

  const proposal = propRes.proposal;
  assert(proposal.status === 'PENDING_APPROVAL', 'Setup: Initial proposal status is PENDING_APPROVAL');

  // Test 1: SECURITY INVARIANT — Attempting to create a payment order for PENDING_APPROVAL proposal MUST BE REJECTED
  const orderRes1 = await RazorpayService.createPaymentOrder(proposal.proposalId);
  assert(
    orderRes1.success === false,
    'Security Test 1: Unapproved proposal payment order creation rejected by server'
  );
  if (!orderRes1.success && orderRes1.error) {
    assert(
      orderRes1.error.code === 'PROPOSAL_NOT_APPROVED',
      'Security Test 1: Error code is PROPOSAL_NOT_APPROVED'
    );
  }

  // Test 2: Attempting to create order for REJECTED proposal MUST BE REJECTED
  await ApprovalService.rejectProposal(proposal.proposalId);
  const rejectedProposal = PurchaseService.getProposal(proposal.proposalId);
  assert(rejectedProposal?.status === 'REJECTED', 'Setup: Proposal status transitioned to REJECTED');

  const orderRes2 = await RazorpayService.createPaymentOrder(proposal.proposalId);
  assert(
    orderRes2.success === false,
    'Security Test 2: Rejected proposal payment order creation rejected by server'
  );

  // Test 3: Create a new proposal and approve it via ApprovalService
  const propRes2 = await PurchaseService.createPurchaseProposal({
    merchantId: 'merchant_aquamart',
    productId: 'elec_001',
    quantity: 1,
  });
  if (!propRes2.success) return;
  const proposal2 = propRes2.proposal;

  const approveRes = await ApprovalService.approveProposal(proposal2.proposalId);
  assert(approveRes.success === true, 'Setup: Human Approval Gate transitions status to APPROVED');

  // Test 4: APPROVED proposal proceeds to Razorpay order creation
  const orderRes3 = await RazorpayService.createPaymentOrder(proposal2.proposalId);
  assert(
    orderRes3.success === true,
    'Security Test 3: APPROVED proposal successfully creates Razorpay payment order'
  );
  if (orderRes3.success && orderRes3.transaction) {
    assert(
      orderRes3.transaction.status === 'CREATED',
      'Security Test 3: Transaction status is CREATED'
    );
    assert(
      typeof orderRes3.transaction.razorpayOrderId === 'string',
      'Security Test 3: Valid Razorpay Order ID generated'
    );
  }

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentApiSecurityTests();
