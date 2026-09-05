import {
  generateSyntheticDataset,
  SYNTHETIC_DATASET,
  METRICS_BATCH,
  calculateBaselineAOV,
} from './synthetic-data.generator';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { evaluateOpportunity, canRetryPayment } from '@/lib/policy/policy-check';
import { RevenueOpportunity } from '@/types/revenue';

async function runSyntheticDatasetTests() {
  console.log('--- RUNNING PHASE 8C SYNTHETIC DATASET TEST SUITE ---');
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

  // --- 1. DETERMINISM TEST ---
  try {
    const dataset1 = generateSyntheticDataset(42);
    const dataset2 = generateSyntheticDataset(42);
    const json1 = JSON.stringify(dataset1);
    const json2 = JSON.stringify(dataset2);

    assert(
      dataset1.length === 30 && json1 === json2,
      'Test 1: Dataset generation is 100% deterministic for seed 42 (produces identical 30 records)'
    );
  } catch (err: any) {
    assert(false, 'Test 1: Determinism', err.message);
  }

  // --- 2. REAL CATALOG PRODUCT INTEGRITY TEST ---
  try {
    const allProductsValid = SYNTHETIC_DATASET.every((record) => {
      const product = CatalogService.getProductById(record.productId);
      return (
        product !== null &&
        product.name === record.productName &&
        product.category === record.category
      );
    });

    assert(
      allProductsValid,
      'Test 2: Every generated product ID exists in the real NovaBazaar catalog and matches catalog metadata'
    );
  } catch (err: any) {
    assert(false, 'Test 2: Catalog Integrity', err.message);
  }

  // --- 3. MONETARY INTEGER PAISE CONSTRAINT TEST ---
  try {
    const allPaiseValid = SYNTHETIC_DATASET.every(
      (r) => Number.isInteger(r.amountPaise) && r.amountPaise > 0
    );

    assert(
      allPaiseValid,
      'Test 3: All monetary amounts are valid integer paise > 0 (no floating point currency values)'
    );
  } catch (err: any) {
    assert(false, 'Test 3: Monetary Integer Paise', err.message);
  }

  // --- 4. FAILED RECORDS FAILURE INFO TEST ---
  try {
    const failedRecords = SYNTHETIC_DATASET.filter((r) => r.status === 'FAILED');
    const allFailedValid =
      failedRecords.length > 0 &&
      failedRecords.every(
        (r) => !!r.failureCode && !!r.failureReason && r.attemptCount >= 1
      );

    assert(
      allFailedValid && failedRecords.length === 12,
      `Test 4: All ${failedRecords.length} failed payment records contain valid failure codes, failure reasons, and attempt counts`
    );
  } catch (err: any) {
    assert(false, 'Test 4: Failed Record Info', err.message);
  }

  // --- 5. ABANDONED RECORDS CLEAN BOUNDARY TEST ---
  try {
    const abandonedRecords = SYNTHETIC_DATASET.filter((r) => r.status === 'ABANDONED');
    const allAbandonedValid =
      abandonedRecords.length > 0 &&
      abandonedRecords.every(
        (r) =>
          r.attemptCount === 0 &&
          r.lastAttemptAt === null &&
          r.failureCode === undefined &&
          r.failureReason === undefined
      );

    assert(
      allAbandonedValid && abandonedRecords.length === 5,
      `Test 5: All ${abandonedRecords.length} abandoned checkout records correctly omit payment-success or payment-failure info`
    );
  } catch (err: any) {
    assert(false, 'Test 5: Abandoned Record Info', err.message);
  }

  // --- 6. REALISTIC SCENARIO DISTRIBUTION & COVERAGE TEST ---
  try {
    const scenarioCounts = new Map<string, number>();
    SYNTHETIC_DATASET.forEach((r) => {
      scenarioCounts.set(r.scenario, (scenarioCounts.get(r.scenario) || 0) + 1);
    });

    const hasRecoverable = (scenarioCounts.get('RECOVERABLE_FAILED_PAYMENT') || 0) === 5;
    const hasDiscount = (scenarioCounts.get('FAILED_PAYMENT_BOUNDED_DISCOUNT') || 0) === 3;
    const hasRetryLimit = (scenarioCounts.get('FAILED_PAYMENT_RETRY_LIMIT') || 0) === 2;
    const hasCooldown = (scenarioCounts.get('FAILED_PAYMENT_COOLDOWN') || 0) === 2;
    const hasUpsell = (scenarioCounts.get('STRONG_UPSELL_CROSS_SELL') || 0) === 4;
    const hasWeakUpsell = (scenarioCounts.get('WEAK_NO_CROSS_SELL') || 0) === 3;
    const hasHumanUp = (scenarioCounts.get('UPSELL_REQUIRES_HUMAN_APPROVAL') || 0) === 2;
    const hasAutoUp = (scenarioCounts.get('UPSELL_AUTO_APPROVED') || 0) === 2;
    const hasOOS = (scenarioCounts.get('OUT_OF_STOCK_COMPLEMENTARY') || 0) === 2;
    const hasAbandoned = (scenarioCounts.get('ABANDONED_CHECKOUT') || 0) === 5;

    const distributionValid =
      hasRecoverable &&
      hasDiscount &&
      hasRetryLimit &&
      hasCooldown &&
      hasUpsell &&
      hasWeakUpsell &&
      hasHumanUp &&
      hasAutoUp &&
      hasOOS &&
      hasAbandoned;

    assert(
      distributionValid && scenarioCounts.size === 10,
      'Test 6: Synthetic dataset contains both positive & negative cases across all 10 target scenarios (30 total records)'
    );
  } catch (err: any) {
    assert(false, 'Test 6: Scenario Distribution', err.message);
  }

  // --- 7. PHASE 8B POLICY BOUNDARY COMPLIANCE TEST ---
  try {
    // A. Verify auto-approved vs human approval limits
    const autoRec = SYNTHETIC_DATASET.find((r) => r.scenario === 'UPSELL_AUTO_APPROVED');
    const humanRec = SYNTHETIC_DATASET.find((r) => r.scenario === 'UPSELL_REQUIRES_HUMAN_APPROVAL');

    const oppAuto: RevenueOpportunity = {
      id: 'opp_test_auto',
      type: 'upsell',
      customerId: autoRec!.customerId,
      suggestedAction: 'Recommend cable',
      amountPaise: 39_900, // ₹399 <= 50,000p
      itemCount: 1,
      confidence: 0.9,
      reasoning: 'Auto approve test',
    };
    const decAuto = evaluateOpportunity(oppAuto);

    const oppHuman: RevenueOpportunity = {
      id: 'opp_test_human',
      type: 'upsell',
      customerId: humanRec!.customerId,
      suggestedAction: 'Recommend hub',
      amountPaise: 249_900, // ₹2,499 > 50,000p
      itemCount: 1,
      confidence: 0.95,
      reasoning: 'Human approval test',
    };
    const decHuman = evaluateOpportunity(oppHuman);

    // B. Verify retry limit policy check against synthetic records
    const retryLimitRec = SYNTHETIC_DATASET.find((r) => r.scenario === 'FAILED_PAYMENT_RETRY_LIMIT');
    const retryCheck = canRetryPayment(
      retryLimitRec!.attemptCount,
      retryLimitRec!.lastAttemptAt ? new Date(retryLimitRec!.lastAttemptAt) : null
    );

    // C. Verify cooldown policy check against synthetic records
    const cooldownRec = SYNTHETIC_DATASET.find((r) => r.scenario === 'FAILED_PAYMENT_COOLDOWN');
    const cooldownCheck = canRetryPayment(
      cooldownRec!.attemptCount,
      cooldownRec!.lastAttemptAt ? new Date(cooldownRec!.lastAttemptAt) : null
    );

    const policyCompliant =
      decAuto.allowed &&
      !decAuto.requiresApproval &&
      decHuman.allowed &&
      decHuman.requiresApproval &&
      !retryCheck.allowed &&
      !cooldownCheck.allowed;

    assert(
      policyCompliant,
      'Test 7: Synthetic dataset correctly exercises Phase 8B policy bounds (auto-approval, human approval, retry limits, cooldown)'
    );
  } catch (err: any) {
    assert(false, 'Test 7: Policy Boundary Compliance', err.message);
  }

  // --- 8. METRICS_BATCH & BASELINE AOV TEST ---
  try {
    assert(
      METRICS_BATCH.length === 20,
      'Test 8A: METRICS_BATCH contains exactly 20 deterministic records'
    );

    const metrics = calculateBaselineAOV(METRICS_BATCH);
    const capturedInBatch = METRICS_BATCH.filter((r) => r.status === 'CAPTURED');

    assert(
      metrics.capturedCount === capturedInBatch.length &&
        metrics.totalRevenuePaise > 0 &&
        metrics.aovPaise > 0,
      `Test 8B: Baseline AOV calculated strictly from ${metrics.capturedCount} captured transactions (AOV: ₹${metrics.aovRupees.toFixed(2)})`
    );
  } catch (err: any) {
    assert(false, 'Test 8: Metrics Batch & AOV', err.message);
  }

  console.log(`\nPHASE 8C SYNTHETIC DATASET TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSyntheticDatasetTests();
