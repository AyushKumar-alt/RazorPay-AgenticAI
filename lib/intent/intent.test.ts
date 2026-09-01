import { IntentService } from './intent.service';
import { MockAIProvider } from '@/lib/ai/mock';
import { PurchaseIntent } from './intent.schema';

async function runTests() {
  console.log('--- RUNNING PHASE 2 INTENT TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  const mockProvider = new MockAIProvider();
  const service = new IntentService(mockProvider);

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // TEST 1: "I need a 1L stainless steel bottle under ₹2,000."
  try {
    const res = await service.parseIntent('I need a 1L stainless steel bottle under ₹2,000.');
    assert(
      res.category === 'water_bottle' &&
        res.constraints.capacity === '1L' &&
        res.constraints.material === 'stainless_steel' &&
        res.budget.maxPaise === 200000,
      'Test 1: Standard 1L stainless steel bottle under ₹2,000',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 1', err.message);
  }

  // TEST 2: "Find me a bottle for travel around ₹1,500."
  try {
    const res = await service.parseIntent('Find me a bottle for travel around ₹1,500.');
    assert(
      res.category === 'water_bottle' &&
        res.preferences.useCase === 'travel' &&
        res.budget.maxPaise === 150000,
      'Test 2: Bottle for travel around ₹1,500',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 2', err.message);
  }

  // TEST 3: "Make it 1 litre." with previous intent (category: water_bottle, maxPaise: 200000)
  try {
    const prevIntent: PurchaseIntent = {
      category: 'water_bottle',
      constraints: {},
      preferences: {},
      budget: { maxPaise: 200000 },
      missingInformation: [],
      confidence: 1,
    };
    const res = await service.parseIntent('Make it 1 litre.', prevIntent);
    assert(
      res.category === 'water_bottle' &&
        res.constraints.capacity === '1L' &&
        res.budget.maxPaise === 200000,
      'Test 3: Conversational update "Make it 1 litre" preserves budget',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 3', err.message);
  }

  // TEST 4: "Find me a good bottle." (Ambiguous)
  try {
    const res = await service.parseIntent('Find me a good bottle.');
    assert(
      res.category === 'water_bottle' &&
        !res.constraints.capacity &&
        !res.constraints.material &&
        !res.budget.maxPaise &&
        (res.missingInformation.length > 0 || Object.keys(res.constraints).length === 0),
      'Test 4: Ambiguous "Find me a good bottle" does not invent constraints',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 4', err.message);
  }

  // TEST 5: "I want something under ₹2 lakh."
  try {
    const res = await service.parseIntent('I want something under ₹2 lakh.');
    assert(
      res.budget.maxPaise === 20000000,
      'Test 5: Large monetary amount ₹2 lakh = 20,000,000 paise',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 5', err.message);
  }

  // TEST 6: "I want a 1L steel bottle under ₹2,000."
  try {
    const res = await service.parseIntent('I want a 1L steel bottle under ₹2,000.');
    assert(
      res.constraints.material === 'stainless_steel' &&
        res.constraints.capacity === '1L' &&
        res.budget.maxPaise === 200000,
      'Test 6: Steel maps to stainless_steel',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 6', err.message);
  }

  // TEST 7: "Actually, increase my budget to ₹2,500."
  try {
    const prevIntent: PurchaseIntent = {
      category: 'water_bottle',
      constraints: { capacity: '1L', material: 'stainless_steel' },
      preferences: {},
      budget: { maxPaise: 200000 },
      missingInformation: [],
      confidence: 1,
    };
    const res = await service.parseIntent('Actually, increase my budget to ₹2,500.', prevIntent);
    assert(
      res.budget.maxPaise === 250000 &&
        res.constraints.capacity === '1L' &&
        res.constraints.material === 'stainless_steel',
      'Test 7: Budget increase to ₹2,500 preserves existing constraints',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 7', err.message);
  }

  // TEST 8: Invalid / empty message handling
  try {
    await service.parseIntent('   ');
    assert(false, 'Test 8: Empty message should throw error');
  } catch (err: any) {
    assert(
      err.message.includes('cannot be empty'),
      'Test 8: Controlled validation error on empty message'
    );
  }

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
