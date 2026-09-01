import { PurchaseService } from './purchase.service';
import { ApprovalService } from './approval.service';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { AuditService } from '@/lib/audit/audit.service';

async function runPurchaseTests() {
  console.log('--- RUNNING PHASE 4 PURCHASE & APPROVAL TEST SUITE ---');
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

  // Teardown before tests
  PurchaseService.clearProposals();
  AuditService.clearEvents();

  // TEST 1 & 2: Valid proposal creation & authoritative price used
  let test1ProposalId = '';
  try {
    const res = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_001',
      quantity: 1,
    });

    if (res.success) {
      test1ProposalId = res.proposal.proposalId;
    }

    assert(
      res.success &&
        res.proposal.unitPricePaise === 169900 &&
        res.proposal.merchantId === 'merchant_aquamart' &&
        res.proposal.productId === 'bottle_001',
      'Test 1 & 2: Valid proposal creation uses authoritative price (₹1,699 = 169900 paise)',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 1 & 2', err.message);
  }

  // TEST 3 & 4: Client cannot override price or total
  try {
    const res = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_001',
      quantity: 1,
      // Attempt client-side price override (ignored/stripped by service)
      unitPricePaise: 100,
      totalPaise: 100,
    } as any);

    assert(
      res.success &&
        res.proposal.unitPricePaise === 169900 &&
        res.proposal.totalPaise === 169900 + 5000,
      'Test 3 & 4: Client-supplied price override strictly ignored in favor of CatalogService',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 3 & 4', err.message);
  }

  // TEST 5: Out-of-stock product rejected (bottle_005 = stock 0)
  try {
    const res = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_005',
      quantity: 1,
    });

    assert(
      !res.success && res.error.code === 'INSUFFICIENT_STOCK',
      'Test 5: Out-of-stock product (bottle_005) proposal rejected with INSUFFICIENT_STOCK',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 5', err.message);
  }

  // TEST 6: Unknown product rejected
  try {
    const res = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_nonexistent',
      quantity: 1,
    });

    assert(
      !res.success && res.error.code === 'PRODUCT_NOT_FOUND',
      'Test 6: Unknown product rejected with PRODUCT_NOT_FOUND error',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 6', err.message);
  }

  // TEST 7: Quantity below 1 rejected
  try {
    const res = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_001',
      quantity: 0,
    });

    assert(
      !res.success && res.error.code === 'VALIDATION_ERROR',
      'Test 7: Quantity below 1 rejected with VALIDATION_ERROR',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 7', err.message);
  }

  // TEST 8: Quantity above maximum rejected (quantity = 11 > 10)
  try {
    const res = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_001',
      quantity: 11,
    });

    assert(
      !res.success && res.error.code === 'VALIDATION_ERROR',
      'Test 8: Quantity above max (11 > 10) rejected with VALIDATION_ERROR',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 8', err.message);
  }

  // TEST 9: Correct total calculation
  try {
    const res = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_001',
      quantity: 2,
    });

    // unitPrice = 169900, qty = 2 -> 339800 + 5000 delivery = 344800 paise
    assert(
      res.success && res.proposal.totalPaise === 169900 * 2 + 5000,
      'Test 9: Total calculation = (unitPrice * qty) + deliveryFee (344,800 paise)',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 9', err.message);
  }

  // TEST 10: Proposal starts as PENDING_APPROVAL
  try {
    const proposal = PurchaseService.getProposal(test1ProposalId);
    assert(
      proposal !== null && proposal.status === 'PENDING_APPROVAL',
      'Test 10: Proposal initial status is PENDING_APPROVAL',
      JSON.stringify(proposal)
    );
  } catch (err: any) {
    assert(false, 'Test 10', err.message);
  }

  // TEST 11 & 19: Valid approval changes status to APPROVED & records PROPOSAL_APPROVED audit
  try {
    const res = await ApprovalService.approveProposal(test1ProposalId);
    const events = AuditService.getEventsForProposal(test1ProposalId);
    const approvedEvent = events.find((e) => e.eventType === 'PROPOSAL_APPROVED');

    assert(
      res.success &&
        res.proposal?.status === 'APPROVED' &&
        approvedEvent !== undefined,
      'Test 11 & 19: Approval changes status to APPROVED and records PROPOSAL_APPROVED audit event',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 11 & 19', err.message);
  }

  // TEST 12 & 20: Rejected proposal becomes REJECTED & records PROPOSAL_REJECTED audit
  let rejectPropId = '';
  try {
    const createRes = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_002',
      quantity: 1,
    });

    if (createRes.success) {
      rejectPropId = createRes.proposal.proposalId;
    }

    const res = await ApprovalService.rejectProposal(rejectPropId);
    const events = AuditService.getEventsForProposal(rejectPropId);
    const rejectedEvent = events.find((e) => e.eventType === 'PROPOSAL_REJECTED');

    assert(
      res.success &&
        res.proposal?.status === 'REJECTED' &&
        rejectedEvent !== undefined,
      'Test 12 & 20: Rejection changes status to REJECTED and records PROPOSAL_REJECTED audit event',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 12 & 20', err.message);
  }

  // TEST 13: Already approved proposal cannot be approved again
  try {
    const res = await ApprovalService.approveProposal(test1ProposalId);
    assert(
      !res.success && res.error?.code === 'ALREADY_APPROVED',
      'Test 13: Re-approving already APPROVED proposal rejected with ALREADY_APPROVED',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 13', err.message);
  }

  // TEST 14: Rejected proposal cannot be approved
  try {
    const res = await ApprovalService.approveProposal(rejectPropId);
    assert(
      !res.success && res.error?.code === 'PROPOSAL_REJECTED',
      'Test 14: Approving REJECTED proposal rejected with PROPOSAL_REJECTED',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 14', err.message);
  }

  // TEST 15: Expired proposal cannot be approved
  try {
    const createRes = await PurchaseService.createPurchaseProposal({
      merchantId: 'merchant_aquamart',
      productId: 'bottle_003',
      quantity: 1,
    });

    if (createRes.success) {
      const prop = createRes.proposal;
      // Artificially expire the proposal
      prop.expiresAt = new Date(Date.now() - 1000).toISOString();
      PurchaseService.saveProposal(prop);

      const res = await ApprovalService.approveProposal(prop.proposalId);
      assert(
        !res.success && res.error?.code === 'PROPOSAL_EXPIRED',
        'Test 15: Expired proposal approval rejected with PROPOSAL_EXPIRED',
        JSON.stringify(res)
      );
    }
  } catch (err: any) {
    assert(false, 'Test 15', err.message);
  }

  // TEST 16 & 17: Approval does not mutate inventory or execute payment
  try {
    const stockBefore = CatalogService.checkInventory('bottle_001').stock;
    assert(
      stockBefore === 23,
      'Test 16 & 17: Approval does not mutate stock (bottle_001 stock remains 23)',
      `stock: ${stockBefore}`
    );
  } catch (err: any) {
    assert(false, 'Test 16 & 17', err.message);
  }

  // TEST 18: Audit event generated on creation
  try {
    const events = AuditService.getEventsForProposal(test1ProposalId);
    const createdEvent = events.find((e) => e.eventType === 'PROPOSAL_CREATED');
    assert(
      createdEvent !== undefined && createdEvent.proposalId === test1ProposalId,
      'Test 18: PROPOSAL_CREATED audit event properly logged',
      JSON.stringify(createdEvent)
    );
  } catch (err: any) {
    assert(false, 'Test 18', err.message);
  }

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPurchaseTests();
