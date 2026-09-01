import { BuyerAgent } from './buyer.agent';
import { PurchaseIntent } from '@/lib/intent/intent.schema';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { BuyerRecommendation } from './buyer.schema';

async function runBuyerAgentTests() {
  console.log('--- RUNNING PHASE 3B BUYER AGENT TEST SUITE ---');
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

  const agent = new BuyerAgent();

  const canonicalIntent: PurchaseIntent = {
    category: 'water_bottle',
    constraints: {
      capacity: '1L',
      material: 'stainless_steel',
      inStock: true,
    },
    preferences: {
      useCase: 'travel',
    },
    budget: {
      maxPaise: 200000,
    },
    missingInformation: [],
    confidence: 0.95,
  };

  // TEST 1: Canonical request (1L stainless steel bottle under ₹2,000)
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return {
          tool: 'searchCatalog',
          input: {
            category: 'water_bottle',
            capacity: '1L',
            material: 'stainless_steel',
            maxPricePaise: 200000,
            inStock: true,
          },
        };
      }
      return {
        success: true,
        recommendations: [
          { productId: 'bottle_001', reason: 'Matches 1L stainless steel bottle under ₹2,000' },
          { productId: 'bottle_002', reason: 'Insulated 1L bottle under budget' },
        ],
        summary: 'Recommended HydroPro 1L and EcoSteel 1L.',
        missingInformation: [],
        confidence: 0.95,
        toolTrace: [],
      };
    });

    assert(
      res.success &&
        res.recommendation.recommendations.length === 2 &&
        res.recommendation.recommendations.some((r) => r.productId === 'bottle_001'),
      'Test 1: Canonical shopping request returns valid recommendations',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 1', err.message);
  }

  // TEST 2: Agent uses searchCatalog
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'searchCatalog', input: { category: 'water_bottle' } };
      }
      return {
        success: true,
        recommendations: [{ productId: 'bottle_001', reason: 'Found' }],
        summary: 'OK',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });

    const usedSearchCatalog = res.success
      ? res.recommendation.toolTrace.some((t) => t.tool === 'searchCatalog')
      : false;
    assert(
      res.success && usedSearchCatalog,
      'Test 2: Agent tool trace confirms searchCatalog execution',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 2', err.message);
  }

  // TEST 3 & 4: Grounded recommendations (retrievedProductIds check)
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'searchCatalog', input: { category: 'water_bottle' } };
      }
      return {
        success: true,
        recommendations: [{ productId: 'bottle_001', reason: 'Grounded product' }],
        summary: 'Grounded',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });

    assert(
      res.success && res.recommendation.recommendations[0]?.productId === 'bottle_001',
      'Test 3 & 4: Recommendation is grounded in tool results',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 3 & 4', err.message);
  }

  // TEST 5: Product above ₹2,000 cannot be recommended (bottle_004 = ₹2,499)
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'getProduct', input: { productId: 'bottle_004' } };
      }
      return {
        success: true,
        recommendations: [{ productId: 'bottle_004', reason: 'Expensive bottle' }],
        summary: 'Over budget',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });

    assert(
      res.success && res.recommendation.recommendations.length === 0,
      'Test 5: Product above maxPaise budget (bottle_004 = ₹2,499) rejected by application safety validator',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 5', err.message);
  }

  // TEST 6: Out-of-stock product cannot be recommended when inStock = true (bottle_005 = stock 0)
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'getProduct', input: { productId: 'bottle_005' } };
      }
      return {
        success: true,
        recommendations: [{ productId: 'bottle_005', reason: 'Out of stock bottle' }],
        summary: 'Out of stock',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });

    assert(
      res.success && res.recommendation.recommendations.length === 0,
      'Test 6: Out-of-stock product (bottle_005) rejected by application safety validator',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 6', err.message);
  }

  // TEST 7: Capacity hard constraint is enforced
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'getProduct', input: { productId: 'bottle_006' } }; // bottle_006 is 750ml
      }
      return {
        success: true,
        recommendations: [{ productId: 'bottle_006', reason: '750ml bottle' }],
        summary: 'Wrong capacity',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });

    assert(
      res.success && res.recommendation.recommendations.length === 0,
      'Test 7: 750ml bottle rejected when hard capacity constraint is 1L',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 7', err.message);
  }

  // TEST 8: Material hard constraint is enforced
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'getProduct', input: { productId: 'bottle_008' } }; // bottle_008 is plastic
      }
      return {
        success: true,
        recommendations: [{ productId: 'bottle_008', reason: 'Plastic bottle' }],
        summary: 'Wrong material',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });

    assert(
      res.success && res.recommendation.recommendations.length === 0,
      'Test 8: Plastic bottle rejected when hard material constraint is stainless_steel',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 8', err.message);
  }

  // TEST 9: Fabricated product ID is rejected
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'searchCatalog', input: { category: 'water_bottle' } };
      }
      return {
        success: true,
        recommendations: [{ productId: 'fake_bottle_999', reason: 'Hallucinated bottle' }],
        summary: 'Fake ID',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });

    assert(
      res.success && res.recommendation.recommendations.length === 0,
      'Test 9: Fabricated product ID (fake_bottle_999) rejected by grounding check',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 9', err.message);
  }

  // TEST 10: Unknown tool request handled safely
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'unknownToolName' as any, input: {} };
      }
      return {
        success: true,
        recommendations: [],
        summary: 'Handled unknown tool',
        missingInformation: [],
        confidence: 0.5,
        toolTrace: [],
      };
    });

    const unknownToolHandled = res.success
      ? res.recommendation.toolTrace.some((t) => t.resultSummary.includes('UNKNOWN_TOOL'))
      : false;
    assert(
      res.success && unknownToolHandled,
      'Test 10: Unknown tool request handled safely with UNKNOWN_TOOL error in toolTrace',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 10', err.message);
  }


  // TEST 11: Tool loop stops after 8 rounds
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      return { tool: 'checkInventory', input: { productId: 'bottle_001' } };
    });

    assert(
      !res.success && res.error.code === 'AGENT_MAX_ROUNDS',
      'Test 11: Agent tool loop terminates cleanly with AGENT_MAX_ROUNDS after 8 rounds',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 11', err.message);
  }

  // TEST 12: Tool execution errors handled as controlled errors
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      throw new Error('Database connection failed inside tool');
    });

    assert(
      !res.success && res.error.code === 'TOOL_EXECUTION_ERROR',
      'Test 12: Tool execution error caught and returned as controlled TOOL_EXECUTION_ERROR',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 12', err.message);
  }

  // TEST 13: Ambiguous intent produces no fabricated constraints
  try {
    const ambiguousIntent: PurchaseIntent = {
      category: 'water_bottle',
      constraints: {},
      preferences: {},
      budget: {},
      missingInformation: ['capacity', 'budget'],
      confidence: 0.6,
    };

    const res = await agent.run({ intent: ambiguousIntent }, async (step) => {
      return {
        success: true,
        recommendations: [],
        summary: 'Please specify capacity and budget preference.',
        missingInformation: ['capacity', 'budget'],
        confidence: 0.6,
        toolTrace: [],
      };
    });

    assert(
      res.success &&
        res.recommendation.recommendations.length === 0 &&
        res.recommendation.missingInformation.includes('capacity'),
      'Test 13: Ambiguous intent returns empty recommendations and explicit missingInformation',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 13', err.message);
  }

  // TEST 14: Tool trace records execution order
  try {
    const res = await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'searchCatalog', input: { category: 'water_bottle' } };
      }
      if (step === 2) {
        return { tool: 'getPrice', input: { productId: 'bottle_001' } };
      }
      return {
        success: true,
        recommendations: [{ productId: 'bottle_001', reason: 'Verified' }],
        summary: 'Done',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });

    const stepsOrdered =
      res.success &&
      res.recommendation.toolTrace.length === 2 &&
      res.recommendation.toolTrace[0].step === 1 &&
      res.recommendation.toolTrace[1].step === 2;

    assert(
      res.success && stepsOrdered,
      'Test 14: Tool trace preserves step execution order (step 1, step 2)',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 14', err.message);
  }

  // TEST 15: Read-only guarantee (state immutability)
  try {
    const countBefore = CatalogService.getAllProducts().length;
    await agent.run({ intent: canonicalIntent }, async (step) => {
      if (step === 1) {
        return { tool: 'searchCatalog', input: { category: 'water_bottle' } };
      }
      return {
        success: true,
        recommendations: [{ productId: 'bottle_001', reason: 'Read only' }],
        summary: 'Read only',
        missingInformation: [],
        confidence: 1,
        toolTrace: [],
      };
    });
    const countAfter = CatalogService.getAllProducts().length;

    assert(
      countBefore === countAfter,
      'Test 15: BuyerAgent execution does not mutate catalog state (Read-only guarantee)',
      `before: ${countBefore}, after: ${countAfter}`
    );
  } catch (err: any) {
    assert(false, 'Test 15', err.message);
  }

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runBuyerAgentTests();
