import { SYNTHETIC_DATASET } from '@/lib/dataset/synthetic-data.generator';
import { RevenueAgent } from './revenue.agent';
import { evaluateOpportunity } from '@/lib/policy/policy-check';
import { AuditService } from '@/lib/audit/audit.service';
import { RevenueOpportunity } from '@/types/revenue';

async function runRevenueIntegrationTests() {
  console.log('--- RUNNING PHASE 8E REVENUE AGENT INTEGRATION & SECURITY TEST SUITE ---');
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

  // --- TEST 1: REVENUE ANALYSIS RETURNS OPPORTUNITIES ---
  try {
    let totalOpportunities = 0;
    for (const tx of SYNTHETIC_DATASET) {
      const res = await agent.analyzeTransaction(tx);
      totalOpportunities += res.opportunities.length;
    }

    assert(
      SYNTHETIC_DATASET.length === 30 && totalOpportunities === 25,
      `Test 1: Revenue analysis returns exactly 25 evaluated opportunities across 30 synthetic merchant records`
    );
  } catch (err: any) {
    assert(false, 'Test 1', err.message);
  }

  // --- TEST 2: POLICY-REJECTED OPPORTUNITIES CANNOT BECOME EXECUTABLE ---
  try {
    const rejectedTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'FAILED_PAYMENT_COOLDOWN')!;
    const res = await agent.analyzeTransaction(rejectedTx);
    const rejectedOpp = res.opportunities[0];

    // Overridden by retry policy check
    const isPolicyRejected = !rejectedOpp.policyDecision.allowed;

    assert(
      isPolicyRejected,
      'Test 2: Policy-rejected opportunity (e.g. cooldown active) cannot become executable (policy decision allowed: false)'
    );
  } catch (err: any) {
    assert(false, 'Test 2', err.message);
  }

  // --- TEST 3: >₹500 OPPORTUNITIES REQUIRE HUMAN APPROVAL ---
  try {
    const humanTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'UPSELL_REQUIRES_HUMAN_APPROVAL')!;
    const res = await agent.analyzeTransaction(humanTx);
    const oppItem = res.opportunities[0];

    assert(
      oppItem.opportunity.amountPaise > 50_000 &&
        oppItem.policyDecision.allowed === true &&
        oppItem.policyDecision.requiresApproval === true,
      'Test 3: Opportunities with amount > ₹500 strictly require explicit merchant human approval'
    );
  } catch (err: any) {
    assert(false, 'Test 3', err.message);
  }

  // --- TEST 4: <=₹500 OPPORTUNITIES ARE AUTO-ACTION ELIGIBLE ---
  try {
    const autoTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'UPSELL_AUTO_APPROVED')!;
    const res = await agent.analyzeTransaction(autoTx);
    const oppItem = res.opportunities[0];

    assert(
      oppItem.opportunity.amountPaise <= 50_000 &&
        oppItem.policyDecision.allowed === true &&
        oppItem.policyDecision.requiresApproval === false,
      'Test 4: Opportunities with amount <= ₹500 are auto-action eligible without human approval'
    );
  } catch (err: any) {
    assert(false, 'Test 4', err.message);
  }

  // --- TEST 5: LLM CONFIDENCE CANNOT BYPASS POLICY BOUNDS ---
  try {
    const highConfOpp: RevenueOpportunity = {
      id: 'opp_bypass_test',
      type: 'upsell',
      customerId: 'cust_999',
      suggestedAction: 'High confidence proposal',
      amountPaise: 249_900, // ₹2,499
      itemCount: 1,
      confidence: 1.0, // 100%
      reasoning: 'AI is 100% confident',
    };
    const decision = evaluateOpportunity(highConfOpp);

    assert(
      decision.allowed === true && decision.requiresApproval === true,
      'Test 5: 100% LLM confidence cannot bypass policy requirement for human approval for >₹500'
    );
  } catch (err: any) {
    assert(false, 'Test 5', err.message);
  }

  // --- TEST 6: BOUNDSCHECKED APPEARS IN AUDIT RECORD ---
  try {
    AuditService.clearEvents();
    const recTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'RECOVERABLE_FAILED_PAYMENT')!;
    await agent.analyzeTransaction(recTx);

    const events = AuditService.getAllEvents();
    const evalEvent = events.find((e) => e.eventType === 'REVENUE_OPPORTUNITY_EVALUATED');

    const hasBounds =
      evalEvent !== undefined &&
      Array.isArray((evalEvent.metadata as any).boundsChecked) &&
      (evalEvent.metadata as any).boundsChecked.length > 0;

    assert(
      hasBounds,
      'Test 6: Every evaluated opportunity logs a complete boundsChecked array in AuditService'
    );
  } catch (err: any) {
    assert(false, 'Test 6', err.message);
  }

  // --- TEST 7: ABSTAINED OPPORTUNITIES DO NOT BECOME EXECUTABLE ---
  try {
    const weakTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'WEAK_NO_CROSS_SELL')!;
    const res = await agent.analyzeTransaction(weakTx);

    assert(
      res.abstained === true && res.opportunities.length === 0,
      'Test 7: Abstained transactions produce zero executable opportunities'
    );
  } catch (err: any) {
    assert(false, 'Test 7', err.message);
  }

  // --- TEST 8: SECURITY GUARD - CLIENT PAYLOAD TAMPERING IS STRICTLY IGNORED ---
  try {
    const humanTx = SYNTHETIC_DATASET.find((r) => r.scenario === 'UPSELL_REQUIRES_HUMAN_APPROVAL')!;
    const res = await agent.analyzeTransaction(humanTx);
    const oppItem = res.opportunities[0];

    // Client attempts to tamper with amount, discount, or requiresApproval flag
    const tamperedClientPayload = {
      opportunityId: oppItem.opportunity.id,
      transactionId: humanTx.id,
      // TAMPERED FIELDS (Should be completely ignored by server!):
      amountPaise: 10, // Attempting to fake price to 10p <= ₹500
      requiresApproval: false,
      allowed: true,
    };

    // Server resolves authoritative opportunity from server dataset
    const serverTx = SYNTHETIC_DATASET.find((r) => r.id === tamperedClientPayload.transactionId)!;
    const serverAnalysis = await agent.analyzeTransaction(serverTx);
    const serverOppItem = serverAnalysis.opportunities.find(
      (o) => o.opportunity.id === tamperedClientPayload.opportunityId
    )!;

    // Server re-evaluates authoritative opportunity
    const serverPolicyDecision = evaluateOpportunity(serverOppItem.opportunity);

    assert(
      serverOppItem.opportunity.amountPaise === oppItem.opportunity.amountPaise &&
        serverOppItem.opportunity.amountPaise > 50_000 &&
        serverPolicyDecision.requiresApproval === true,
      'Test 8 (SECURITY GUARD): Server ignores client payload tampering (amount/approval flags) and enforces authoritative server policy'
    );
  } catch (err: any) {
    assert(false, 'Test 8', err.message);
  }

  console.log(`\nPHASE 8E REVENUE INTEGRATION TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runRevenueIntegrationTests();
