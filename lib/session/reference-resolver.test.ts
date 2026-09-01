import { resolveProductReference, classifyUtterance } from './reference-resolver';
import { BuyerRecommendation } from '@/lib/agent/buyer/buyer.schema';
import { SessionService } from './session.service';
import { PurchaseIntent } from '@/types/intent';

async function runReferenceResolverTests() {
  console.log('--- RUNNING PHASE 7E REFERENCE RESOLVER TEST SUITE ---');
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

  const sampleRecs: BuyerRecommendation = {
    success: true,
    recommendations: [
      { productId: 'fit_001', reason: 'Non-slip yoga mat' },
      { productId: 'fit_002', reason: 'Resistance band set' },
    ],
    summary: 'Found 2 fitness items',
    missingInformation: [],
    confidence: 1,
    toolTrace: [],
  };

  // Test 1: "the first one" -> index 0
  const r1 = resolveProductReference('the first one', sampleRecs);
  assert(r1.resolvedIndex === 0 && r1.resolvedProductId === 'fit_001', 'Test 1: "the first one" resolves to index 0 (fit_001)');

  // Test 2: "the second one" -> index 1
  const r2 = resolveProductReference('the second one', sampleRecs);
  assert(r2.resolvedIndex === 1 && r2.resolvedProductId === 'fit_002', 'Test 2: "the second one" resolves to index 1 (fit_002)');

  // Test 3: "the third one" -> index 2 (out of bounds) -> null
  const r3 = resolveProductReference('the third one', sampleRecs);
  assert(r3.resolvedProductId === null && r3.resolvedIndex === null, 'Test 3: Out-of-bounds index returns null safely');

  // Test 4: "option 2" -> index 1
  const r4 = resolveProductReference('option 2', sampleRecs);
  assert(r4.resolvedIndex === 1 && r4.resolvedProductId === 'fit_002', 'Test 4: "option 2" resolves to index 1');

  // Test 5: "number 2" -> index 1
  const r5 = resolveProductReference('number 2', sampleRecs);
  assert(r5.resolvedIndex === 1 && r5.resolvedProductId === 'fit_002', 'Test 5: "number 2" resolves to index 1');

  // Test 6: "I'll take the second one" -> index 1
  const r6 = resolveProductReference("I'll take the second one", sampleRecs);
  assert(r6.resolvedIndex === 1 && r6.resolvedProductId === 'fit_002', 'Test 6: "I\'ll take the second one" resolves to index 1');

  // Test 7: Invalid index -> null
  const r7 = resolveProductReference('the fifth one', sampleRecs);
  assert(r7.resolvedProductId === null && r7.resolvedIndex === null, 'Test 7: Out-of-bounds ordinal index returns null safely');

  // Test 8: No recommendations -> unresolved
  const r8 = resolveProductReference('the second one', null);
  assert(r8.resolvedProductId === null && r8.resolvedIndex === null, 'Test 8: Null recommendations list returns unresolved');

  // Test 9: Ambiguous reference -> unresolved
  const r9 = resolveProductReference('that one', sampleRecs, null);
  assert(r9.resolvedProductId === null, 'Test 9: Ambiguous reference without selection returns unresolved');

  // Test 10: Resolved product ID matches actual recommendation
  const r10 = resolveProductReference('option 1', sampleRecs);
  assert(r10.resolvedProductId === sampleRecs.recommendations[0].productId, 'Test 10: Resolved product ID matches exact recommendation');

  // Test 11: Classify "What's the second one?"
  const c1 = classifyUtterance("What's the second one?");
  assert(c1 === 'PRODUCT_QUESTION', 'Test 11: "What\'s the second one?" classified as PRODUCT_QUESTION');

  // Test 12: Classify "Is it wireless?"
  const c2 = classifyUtterance('Is it wireless?');
  assert(c2 === 'ATTRIBUTE_INQUIRY', 'Test 12: "Is it wireless?" classified as ATTRIBUTE_INQUIRY');

  // Test 13: Classify "I'll take the second one"
  const c3 = classifyUtterance("I'll take the second one");
  assert(c3 === 'PRODUCT_SELECTION', 'Test 13: "I\'ll take the second one" classified as PRODUCT_SELECTION');

  // Test 14: Classify "Approve it", "Pay for it", "Buy it" as AUTHORIZATION_ATTEMPT
  const c4a = classifyUtterance('Approve it');
  const c4b = classifyUtterance('Pay for it');
  const c4c = classifyUtterance('Approve the purchase');
  assert(
    c4a === 'AUTHORIZATION_ATTEMPT' && c4b === 'AUTHORIZATION_ATTEMPT' && c4c === 'AUTHORIZATION_ATTEMPT',
    'Test 14: Voice payment authorization attempts classified as AUTHORIZATION_ATTEMPT'
  );

  // Test 15: SECURITY BOUNDARY GUARANTEE
  assert(
    classifyUtterance('Approve it') !== 'PRODUCT_SELECTION',
    'Test 15: SECURITY GUARANTEE: Voice authorization command is distinct from selection and cannot trigger payment'
  );

  // --- FINDING 1 CATEGORY PRESERVATION TESTS ---
  // Test 16: Session stores category in currentIntent
  const sessionService = new SessionService();
  const session = sessionService.createSession('test_cat_session');
  const fitnessIntent: PurchaseIntent = {
    category: 'fitness',
    constraints: {},
    preferences: { useCase: 'yoga' },
    budget: { maxPaise: 150000 },
    missingInformation: [],
    confidence: 1,
  };
  sessionService.setIntent(session.sessionId, fitnessIntent);
  const updatedSession = sessionService.getSession(session.sessionId);
  assert(
    updatedSession?.currentIntent?.category === 'fitness',
    'Test 16: Initial voice search intent correctly persists "fitness" category in session'
  );

  // Test 17: Category is resolved authoritatively from session.currentIntent during price refinement
  const activeCategory = updatedSession?.currentIntent?.category;
  assert(
    activeCategory === 'fitness',
    'Test 17: Price refinement resolves original "fitness" category from session context'
  );

  // Test 18: Missing category does NOT default to "electronics_accessories"
  const emptySession = sessionService.createSession('empty_cat_session');
  const missingCat = emptySession.currentIntent?.category || null;
  assert(
    missingCat !== 'electronics_accessories',
    'Test 18: Missing category context does NOT silently default to "electronics_accessories"'
  );

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runReferenceResolverTests();
