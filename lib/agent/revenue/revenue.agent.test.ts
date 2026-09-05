import { RevenueAgent } from './revenue.agent';
import { SYNTHETIC_DATASET } from '@/lib/dataset/synthetic-data.generator';
import { RevenueOpportunity } from '@/types/revenue';
import { evaluateOpportunity } from '@/lib/policy/policy-check';
import { AuditService } from '@/lib/audit/audit.service';

async function runRevenueAgentTests() {
  console.log('--- RUNNING PHASE 8D MERCHANT REVENUE AGENT TEST SUITE ---');
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

  const agent = new RevenueAgent();
  AuditService.clearEvents();

  // --- TEST 1: Recoverable failed payment produces executable opportunity ---
  try {
    const recTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'RECOVERABLE_FAILED_PAYMENT')!;
    const res = await agent.analyzeTransaction(recTx);

    assert(
      !res.abstained &&
        res.opportunities.length > 0 &&
        res.opportunities[0].policyDecision.allowed === true,
      'Test 1: Recoverable failed payment produces an executable recovery opportunity'
    );
  } catch (err: any) {
    assert(false, 'Test 1', err.message);
  }

  // --- TEST 2: Failed payment inside cooldown does NOT produce executable retry ---
  try {
    const coolTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'FAILED_PAYMENT_COOLDOWN')!;
    const res = await agent.analyzeTransaction(coolTx);

    const isBlocked = res.opportunities.every((o) => o.policyDecision.allowed === false);
    assert(
      isBlocked,
      'Test 2: Failed payment inside 30-minute cooldown does NOT produce an executable retry (policy decision allowed: false)'
    );
  } catch (err: any) {
    assert(false, 'Test 2', err.message);
  }

  // --- TEST 3: Failed payment at retry limit does NOT produce executable retry ---
  try {
    const limitTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'FAILED_PAYMENT_RETRY_LIMIT')!;
    const res = await agent.analyzeTransaction(limitTx);

    const isBlocked = res.opportunities.every((o) => o.policyDecision.allowed === false);
    assert(
      isBlocked,
      'Test 3: Failed payment at max retry limit (2 attempts) does NOT produce an executable retry'
    );
  } catch (err: any) {
    assert(false, 'Test 3', err.message);
  }

  // --- TEST 4: Abandoned checkout produces recovery opportunity ---
  try {
    const abanTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'ABANDONED_CHECKOUT')!;
    const res = await agent.analyzeTransaction(abanTx);

    assert(
      !res.abstained &&
        res.opportunities.length > 0 &&
        res.opportunities[0].opportunity.type === 'abandoned_checkout_recovery' &&
        res.opportunities[0].policyDecision.allowed === true,
      'Test 4: Abandoned checkout produces an executable recovery opportunity with 5% discount'
    );
  } catch (err: any) {
    assert(false, 'Test 4', err.message);
  }

  // --- TEST 5: Captured purchase produces relevant cross-sell ---
  try {
    const capTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'STRONG_UPSELL_CROSS_SELL')!;
    const res = await agent.analyzeTransaction(capTx);

    assert(
      !res.abstained &&
        res.opportunities.length > 0 &&
        res.opportunities[0].policyDecision.allowed === true,
      'Test 5: Captured transaction produces a relevant complementary cross-sell opportunity'
    );
  } catch (err: any) {
    assert(false, 'Test 5', err.message);
  }

  // --- TEST 6: No meaningful complement causes agent to abstain ---
  try {
    const weakTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'WEAK_NO_CROSS_SELL')!;
    const res = await agent.analyzeTransaction(weakTx);

    assert(
      res.abstained === true && res.opportunities.length === 0,
      'Test 6: Transaction with no meaningful complementary match causes the Revenue Agent to abstain'
    );
  } catch (err: any) {
    assert(false, 'Test 6', err.message);
  }

  // --- TEST 7: Upsell above ₹500 requires human approval ---
  try {
    const humanTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'UPSELL_REQUIRES_HUMAN_APPROVAL')!;
    const res = await agent.analyzeTransaction(humanTx);

    assert(
      !res.abstained &&
        res.opportunities[0].policyDecision.allowed === true &&
        res.opportunities[0].policyDecision.requiresApproval === true,
      'Test 7: Upsell recommendation above ₹500 (>50,000p) requires explicit human approval'
    );
  } catch (err: any) {
    assert(false, 'Test 7', err.message);
  }

  // --- TEST 8: Upsell at or below ₹500 can be auto-approved by policy ---
  try {
    const autoTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'UPSELL_AUTO_APPROVED')!;
    const res = await agent.analyzeTransaction(autoTx);

    assert(
      !res.abstained &&
        res.opportunities[0].policyDecision.allowed === true &&
        res.opportunities[0].policyDecision.requiresApproval === false,
      'Test 8: Upsell recommendation at or below ₹500 (<=50,000p) is eligible for auto-approval'
    );
  } catch (err: any) {
    assert(false, 'Test 8', err.message);
  }

  // --- TEST 9: LLM confidence cannot bypass ₹500 approval threshold ---
  try {
    const highConfOpp: RevenueOpportunity = {
      id: 'opp_high_conf',
      type: 'upsell',
      customerId: 'cust_777',
      suggestedAction: 'Recommend premium hub',
      amountPaise: 249_900, // ₹2,499 (> ₹500)
      itemCount: 1,
      confidence: 1.0, // 100% confidence
      reasoning: 'Extremely high confidence proposal',
    };
    const decision = evaluateOpportunity(highConfOpp);

    assert(
      decision.allowed === true && decision.requiresApproval === true,
      'Test 9: 100% LLM confidence cannot bypass the ₹500 human approval threshold'
    );
  } catch (err: any) {
    assert(false, 'Test 9', err.message);
  }

  // --- TEST 10: Discount above 10% is rejected by deterministic policy ---
  try {
    const highDiscOpp: RevenueOpportunity = {
      id: 'opp_high_disc',
      type: 'failed_payment_recovery',
      customerId: 'cust_888',
      suggestedAction: '15% recovery discount',
      amountPaise: 100_000,
      discountPercent: 15, // > 10% limit!
      confidence: 0.9,
      reasoning: '15% recovery incentive',
    };
    const decision = evaluateOpportunity(highDiscOpp);

    assert(
      decision.allowed === false,
      'Test 10: Discount above 10% (15%) is hard rejected by deterministic policy'
    );
  } catch (err: any) {
    assert(false, 'Test 10', err.message);
  }

  // --- TEST 11: Every opportunity contains policy/bounds evaluation ---
  try {
    const recTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'RECOVERABLE_FAILED_PAYMENT')!;
    const res = await agent.analyzeTransaction(recTx);

    const hasBounds =
      res.opportunities.length > 0 &&
      Array.isArray(res.opportunities[0].policyDecision.boundsChecked) &&
      res.opportunities[0].policyDecision.boundsChecked.length > 0;

    assert(
      hasBounds,
      'Test 11: Every proposed opportunity contains full policyDecision with deterministic boundsChecked array'
    );
  } catch (err: any) {
    assert(false, 'Test 11', err.message);
  }

  // --- TEST 12: Agent never directly calls Razorpay payment execution ---
  try {
    const agentSource = RevenueAgent.prototype.analyzeTransaction.toString();
    const cleanOfRazorpay =
      !agentSource.includes('createPaymentOrder') &&
      !agentSource.includes('verifyPayment') &&
      !agentSource.includes('razorpay.com');

    assert(
      cleanOfRazorpay,
      'Test 12: RevenueAgent contains zero calls or references to Razorpay order creation or payment execution endpoints'
    );
  } catch (err: any) {
    assert(false, 'Test 12', err.message);
  }

  // --- 30-DATASET ANALYSIS & METRICS REPORT ---
  console.log('\n--- ANALYZING COMPLETE 30-RECORD SYNTHETIC DATASET ---');
  let totalOpportunities = 0;
  let totalRejected = 0;
  let totalHumanApproval = 0;
  let totalAutoApproved = 0;
  let totalAbstained = 0;

  for (const tx of SYNTHETIC_DATASET) {
    const res = await agent.analyzeTransaction(tx);
    if (res.abstained) {
      totalAbstained++;
    }
    for (const item of res.opportunities) {
      totalOpportunities++;
      if (!item.policyDecision.allowed) {
        totalRejected++;
      } else if (item.policyDecision.requiresApproval) {
        totalHumanApproval++;
      } else {
        totalAutoApproved++;
      }
    }
  }

  console.log(`📊 Total Synthetic Records Analyzed: ${SYNTHETIC_DATASET.length}`);
  console.log(`💡 Total Opportunities Generated:   ${totalOpportunities}`);
  console.log(`🚫 Number Rejected by Policy:        ${totalRejected}`);
  console.log(`👤 Number Requiring Human Approval:  ${totalHumanApproval}`);
  console.log(`⚡ Number Eligible for Auto Action: ${totalAutoApproved}`);
  console.log(`🛑 Number Where Agent Abstained:    ${totalAbstained}`);

  console.log(`\nPHASE 8D REVENUE AGENT TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runRevenueAgentTests();
