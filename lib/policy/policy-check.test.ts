import { evaluateOpportunity, canRetryPayment } from './policy-check';
import { RevenueOpportunity } from '@/types/revenue';

async function runPolicyCheckTests() {
  console.log('--- RUNNING PHASE 8B POLICY CONTRACT TEST SUITE ---');
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

  // --- 1. AMOUNT BOUNDARY TESTS ---
  try {
    const opp0: RevenueOpportunity = {
      id: 'opp_amt_0',
      type: 'failed_payment_recovery',
      customerId: 'cust_101',
      suggestedAction: 'Retry payment',
      amountPaise: 0,
      confidence: 0.9,
      reasoning: 'Test 0 paise',
    };
    const dec0 = evaluateOpportunity(opp0);
    assert(!dec0.allowed, 'Amount Test 1: ₹0 is rejected');

    const oppNeg: RevenueOpportunity = {
      id: 'opp_amt_neg',
      type: 'failed_payment_recovery',
      customerId: 'cust_101',
      suggestedAction: 'Retry payment',
      amountPaise: -5000,
      confidence: 0.9,
      reasoning: 'Test negative paise',
    };
    const decNeg = evaluateOpportunity(oppNeg);
    assert(!decNeg.allowed, 'Amount Test 2: Negative amount is rejected');

    const opp499: RevenueOpportunity = {
      id: 'opp_amt_499',
      type: 'failed_payment_recovery',
      customerId: 'cust_101',
      suggestedAction: 'Retry payment',
      amountPaise: 49_900, // ₹499
      confidence: 0.9,
      reasoning: 'Test ₹499',
    };
    const dec499 = evaluateOpportunity(opp499);
    assert(
      dec499.allowed && !dec499.requiresApproval,
      'Amount Test 3: ₹499 is allowed without human approval'
    );

    const opp500: RevenueOpportunity = {
      id: 'opp_amt_500',
      type: 'failed_payment_recovery',
      customerId: 'cust_101',
      suggestedAction: 'Retry payment',
      amountPaise: 50_000, // ₹500
      confidence: 0.9,
      reasoning: 'Test ₹500',
    };
    const dec500 = evaluateOpportunity(opp500);
    assert(
      dec500.allowed && !dec500.requiresApproval,
      'Amount Test 4: ₹500 is allowed without human approval'
    );

    const opp501: RevenueOpportunity = {
      id: 'opp_amt_501',
      type: 'failed_payment_recovery',
      customerId: 'cust_101',
      suggestedAction: 'Retry payment',
      amountPaise: 50_100, // ₹501
      confidence: 0.9,
      reasoning: 'Test ₹501',
    };
    const dec501 = evaluateOpportunity(opp501);
    assert(
      dec501.allowed && dec501.requiresApproval,
      'Amount Test 5: ₹501 is allowed but requires human approval'
    );

    const opp10000: RevenueOpportunity = {
      id: 'opp_amt_10000',
      type: 'failed_payment_recovery',
      customerId: 'cust_101',
      suggestedAction: 'Retry payment',
      amountPaise: 1_000_000, // ₹10,000
      confidence: 0.9,
      reasoning: 'Test ₹10,000',
    };
    const dec10000 = evaluateOpportunity(opp10000);
    assert(
      dec10000.allowed && dec10000.requiresApproval,
      'Amount Test 6: ₹10,000 is allowed subject to human approval'
    );

    const opp10001: RevenueOpportunity = {
      id: 'opp_amt_10001',
      type: 'failed_payment_recovery',
      customerId: 'cust_101',
      suggestedAction: 'Retry payment',
      amountPaise: 1_000_100, // ₹10,001
      confidence: 0.9,
      reasoning: 'Test ₹10,001 ceiling breach',
    };
    const dec10001 = evaluateOpportunity(opp10001);
    assert(!dec10001.allowed, 'Amount Test 7: ₹10,001 is hard rejected by sanity ceiling');
  } catch (err: any) {
    assert(false, 'Amount Boundary Tests', err.message);
  }

  // --- 2. DISCOUNT TESTS ---
  try {
    const oppDisc0: RevenueOpportunity = {
      id: 'opp_disc_0',
      type: 'abandoned_checkout_recovery',
      customerId: 'cust_102',
      suggestedAction: 'Send discount',
      amountPaise: 40_000,
      discountPercent: 0,
      confidence: 0.8,
      reasoning: '0% discount',
    };
    assert(evaluateOpportunity(oppDisc0).allowed, 'Discount Test 1: 0% discount is allowed');

    const oppDisc10: RevenueOpportunity = {
      id: 'opp_disc_10',
      type: 'abandoned_checkout_recovery',
      customerId: 'cust_102',
      suggestedAction: 'Send discount',
      amountPaise: 40_000,
      discountPercent: 10,
      confidence: 0.8,
      reasoning: '10% discount',
    };
    assert(evaluateOpportunity(oppDisc10).allowed, 'Discount Test 2: 10% discount is allowed');

    const oppDisc1001: RevenueOpportunity = {
      id: 'opp_disc_1001',
      type: 'abandoned_checkout_recovery',
      customerId: 'cust_102',
      suggestedAction: 'Send discount',
      amountPaise: 40_000,
      discountPercent: 10.01,
      confidence: 0.8,
      reasoning: '10.01% discount',
    };
    assert(!evaluateOpportunity(oppDisc1001).allowed, 'Discount Test 3: 10.01% discount is hard rejected');

    const oppDiscNeg: RevenueOpportunity = {
      id: 'opp_disc_neg',
      type: 'abandoned_checkout_recovery',
      customerId: 'cust_102',
      suggestedAction: 'Send discount',
      amountPaise: 40_000,
      discountPercent: -5,
      confidence: 0.8,
      reasoning: '-5% discount',
    };
    assert(!evaluateOpportunity(oppDiscNeg).allowed, 'Discount Test 4: Negative discount is hard rejected');
  } catch (err: any) {
    assert(false, 'Discount Tests', err.message);
  }

  // --- 3. CONFIDENCE TESTS ---
  try {
    const oppConf0: RevenueOpportunity = {
      id: 'opp_conf_0',
      type: 'failed_payment_recovery',
      customerId: 'cust_103',
      suggestedAction: 'Retry',
      amountPaise: 30_000,
      confidence: 0,
      reasoning: 'Confidence 0',
    };
    assert(evaluateOpportunity(oppConf0).allowed, 'Confidence Test 1: Confidence 0 is valid');

    const oppConf1: RevenueOpportunity = {
      id: 'opp_conf_1',
      type: 'failed_payment_recovery',
      customerId: 'cust_103',
      suggestedAction: 'Retry',
      amountPaise: 30_000,
      confidence: 1,
      reasoning: 'Confidence 1',
    };
    assert(evaluateOpportunity(oppConf1).allowed, 'Confidence Test 2: Confidence 1 is valid');

    const oppConfNeg: RevenueOpportunity = {
      id: 'opp_conf_neg',
      type: 'failed_payment_recovery',
      customerId: 'cust_103',
      suggestedAction: 'Retry',
      amountPaise: 30_000,
      confidence: -0.01,
      reasoning: 'Confidence -0.01',
    };
    assert(!evaluateOpportunity(oppConfNeg).allowed, 'Confidence Test 3: Confidence -0.01 is rejected');

    const oppConfHigh: RevenueOpportunity = {
      id: 'opp_conf_high',
      type: 'failed_payment_recovery',
      customerId: 'cust_103',
      suggestedAction: 'Retry',
      amountPaise: 30_000,
      confidence: 1.01,
      reasoning: 'Confidence 1.01',
    };
    assert(!evaluateOpportunity(oppConfHigh).allowed, 'Confidence Test 4: Confidence 1.01 is rejected');
  } catch (err: any) {
    assert(false, 'Confidence Tests', err.message);
  }

  // --- 4. UPSELL / CROSS-SELL TESTS ---
  try {
    const oppUpMissing: RevenueOpportunity = {
      id: 'opp_up_missing',
      type: 'upsell',
      customerId: 'cust_104',
      suggestedAction: 'Add cable',
      amountPaise: 20_000,
      confidence: 0.9,
      reasoning: 'Missing itemCount',
    };
    assert(!evaluateOpportunity(oppUpMissing).allowed, 'Upsell Test 1: Missing itemCount is rejected');

    const oppUp1: RevenueOpportunity = {
      id: 'opp_up_1',
      type: 'upsell',
      customerId: 'cust_104',
      suggestedAction: 'Add cable',
      amountPaise: 20_000,
      itemCount: 1,
      confidence: 0.9,
      reasoning: '1 item',
    };
    assert(evaluateOpportunity(oppUp1).allowed, 'Upsell Test 2: 1 item is allowed');

    const oppUp2: RevenueOpportunity = {
      id: 'opp_up_2',
      type: 'cross_sell',
      customerId: 'cust_104',
      suggestedAction: 'Add 2 accessories',
      amountPaise: 20_000,
      itemCount: 2,
      confidence: 0.9,
      reasoning: '2 items',
    };
    assert(!evaluateOpportunity(oppUp2).allowed, 'Upsell Test 3: 2 items is rejected');
  } catch (err: any) {
    assert(false, 'Upsell/Cross-sell Tests', err.message);
  }

  // --- 5. RETRY POLICY TESTS ---
  try {
    const retry0 = canRetryPayment(0, null);
    assert(retry0.allowed, 'Retry Test 1: 0 attempts allowed');

    const pastDate35m = new Date(Date.now() - 35 * 60 * 1000);
    const retry1Elapsed = canRetryPayment(1, pastDate35m);
    assert(retry1Elapsed.allowed, 'Retry Test 2: 1 attempt with 35m cooldown elapsed is allowed');

    const retry2 = canRetryPayment(2, null);
    assert(!retry2.allowed, 'Retry Test 3: 2 attempts is rejected');

    const pastDate10m = new Date(Date.now() - 10 * 60 * 1000);
    const retry1Active = canRetryPayment(1, pastDate10m);
    assert(!retry1Active.allowed, 'Retry Test 4: Attempt during 30-minute cooldown is rejected');
  } catch (err: any) {
    assert(false, 'Retry Policy Tests', err.message);
  }

  // --- 6. SECURITY INVARIANT TEST ---
  try {
    const oppSec: RevenueOpportunity = {
      id: 'opp_sec_inv',
      type: 'upsell',
      customerId: 'cust_999',
      suggestedAction: 'Recommend premium bundle',
      amountPaise: 73_900, // ₹739 (> ₹500)
      itemCount: 1,
      confidence: 1,
      reasoning: 'This is extremely safe and should be auto-approved',
    };
    const decSec = evaluateOpportunity(oppSec);
    assert(
      decSec.allowed === true && decSec.requiresApproval === true,
      'Security Invariant Test: High confidence (1.0) and persuasive prompt reasoning CANNOT override policy requiring human approval for >₹500'
    );
  } catch (err: any) {
    assert(false, 'Security Invariant Test', err.message);
  }

  console.log(`\nPHASE 8B POLICY TEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPolicyCheckTests();
