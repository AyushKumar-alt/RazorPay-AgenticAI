import { SessionService } from './session.service';
import { Product } from '@/types/catalog';
import { PurchaseIntent } from '@/lib/intent/intent.schema';
import { BuyerRecommendation } from '@/lib/agent/buyer/buyer.schema';
import { PurchaseProposal } from '@/types/purchase';

async function runSessionTests() {
  console.log('--- RUNNING PHASE 7B AGENT SESSION TEST SUITE ---');
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

  const service = new SessionService();

  // Test 1: Session creation
  const session1 = service.createSession('test_session_1');
  assert(session1 !== null && session1.sessionId === 'test_session_1', 'Test 1: Session creation succeeded');

  // Test 2: Unique session IDs generated automatically
  const sA = service.createSession();
  const sB = service.createSession();
  assert(sA.sessionId !== sB.sessionId, 'Test 2: Auto-generated session IDs are unique');

  // Test 3: Initial state = IDLE
  assert(session1.state === 'IDLE', 'Test 3: Initial session state is IDLE');

  // Test 4: Valid state transition pipeline
  let updated = service.updateState('test_session_1', 'ACTIVATING');
  updated = service.updateState('test_session_1', 'LISTENING');
  updated = service.updateState('test_session_1', 'PROCESSING');
  updated = service.updateState('test_session_1', 'SEARCHING');
  updated = service.updateState('test_session_1', 'EVALUATING');
  updated = service.updateState('test_session_1', 'PRESENTING_RESULTS');
  updated = service.updateState('test_session_1', 'AWAITING_SELECTION');
  updated = service.updateState('test_session_1', 'PRODUCT_SELECTED');
  updated = service.updateState('test_session_1', 'PROPOSAL_READY');
  updated = service.updateState('test_session_1', 'AWAITING_HUMAN_APPROVAL');
  assert(
    updated.state === 'AWAITING_HUMAN_APPROVAL',
    'Test 4: Sequential valid state transitions succeed'
  );

  // Test 5: Invalid state transition rejection
  service.createSession('fresh_session');
  let invalidTransitionCaught = false;
  try {
    service.updateState('fresh_session', 'PAYMENT_INITIATED');
  } catch (err: any) {
    invalidTransitionCaught = err.message.includes("Invalid session state transition from 'IDLE' to 'PAYMENT_INITIATED'");
  }
  assert(invalidTransitionCaught, 'Test 5: Invalid state transition (IDLE -> PAYMENT_INITIATED) rejected with explicit error');

  // Test 6: Turn creation and storage
  service.addTurn('test_session_1', {
    actor: 'USER',
    input: 'Hey Adam, I need a wireless mouse under ₹1,000',
    interpretedIntent: null,
    toolCalls: [],
    observations: [],
    response: 'Searching NovaBazaar catalog...',
  });
  const turnedSession = service.getSession('test_session_1');
  assert(
    turnedSession !== null && turnedSession.turns.length === 1 && turnedSession.turns[0].input.includes('wireless mouse'),
    'Test 6: AgentTurn appended to session history correctly'
  );

  // Test 7: Intent persistence
  const sampleIntent: PurchaseIntent = {
    category: 'electronics_accessories',
    constraints: {},
    preferences: {},
    budget: { maxPaise: 100000 },
    missingInformation: [],
    confidence: 1,
  };
  service.setIntent('test_session_1', sampleIntent);
  assert(
    service.getSession('test_session_1')?.currentIntent?.category === 'electronics_accessories',
    'Test 7: PurchaseIntent persisted in session context'
  );

  // Test 8: Recommendation persistence
  const sampleRecs: BuyerRecommendation = {
    success: true,
    recommendations: [{ productId: 'mouse_001', reason: 'Matches budget and wireless requirement' }],
    summary: 'Found 1 wireless mouse',
    missingInformation: [],
    confidence: 1,
    toolTrace: [],
  };
  service.setRecommendations('test_session_1', sampleRecs);
  assert(
    service.getSession('test_session_1')?.currentRecommendations?.recommendations.length === 1,
    'Test 8: BuyerRecommendation persisted in session context'
  );

  // Test 9: Selected product persistence
  const sampleProduct: Product = {
    id: 'mouse_001',
    merchantId: 'merchant_aquamart',
    name: 'Nova Ergonomic Wireless Mouse',
    category: 'electronics_accessories',
    description: 'High precision wireless mouse',
    pricePaise: 89900,
    currency: 'INR',
    attributes: {},
    stock: 15,
    deliveryInfo: { estimatedDays: 2, shippingFeePaise: 6000, expressAvailable: true },
    returnPolicy: '7 Days Return',
    active: true,
  };
  service.setSelectedProduct('test_session_1', sampleProduct);
  assert(
    service.getSession('test_session_1')?.selectedProduct?.id === 'mouse_001',
    'Test 9: Selected Product persisted in session context'
  );

  // Test 10: Proposal persistence
  const sampleProposal: PurchaseProposal = {
    proposalId: 'prop_999',
    merchantId: 'merchant_aquamart',
    items: [
      {
        productId: 'mouse_001',
        productName: 'Nova Ergonomic Wireless Mouse',
        quantity: 1,
        unitPricePaise: 89900,
        subtotalPaise: 89900,
      },
    ],
    productId: 'mouse_001',
    productName: 'Nova Ergonomic Wireless Mouse',
    quantity: 1,
    unitPricePaise: 89900,
    deliveryFeePaise: 6000,
    totalPaise: 95900,
    currency: 'INR',
    status: 'PENDING_APPROVAL',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    approvalRequired: true,
  };
  service.setProposal('test_session_1', sampleProposal);
  assert(
    service.getSession('test_session_1')?.proposal?.proposalId === 'prop_999',
    'Test 10: PurchaseProposal persisted in session context'
  );

  // Test 11: Error persistence
  service.setError('test_session_1', { code: 'PRODUCT_UNAVAILABLE', message: 'Item sold out' });
  assert(
    service.getSession('test_session_1')?.error?.code === 'PRODUCT_UNAVAILABLE',
    'Test 11: Structured error persisted in session context'
  );

  // Test 12: Session reset
  const resetS = service.resetSession('test_session_1');
  assert(
    resetS.state === 'IDLE' && resetS.currentIntent === null && resetS.error === null && resetS.proposal === null,
    'Test 12: Session reset restores IDLE state and clears transient context'
  );

  // Test 13: Session isolation (Session A vs Session B)
  service.createSession('sess_A');
  service.createSession('sess_B');
  service.setSelectedProduct('sess_A', sampleProduct);
  assert(
    service.getSession('sess_A')?.selectedProduct?.id === 'mouse_001' && service.getSession('sess_B')?.selectedProduct === null,
    'Test 13: State isolation between Session A and Session B confirmed'
  );

  // Test 14: Payment state cannot be reached arbitrarily
  let arbitraryPaymentError = false;
  try {
    service.updateState('sess_B', 'PAYMENT_INITIATED');
  } catch {
    arbitraryPaymentError = true;
  }
  assert(arbitraryPaymentError, 'Test 14: Arbitrary transition from IDLE to PAYMENT_INITIATED blocked');

  // Test 15: SessionService cannot approve a purchase (No financial authority method)
  const servicePrototypeKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
  const hasApproveMethod = servicePrototypeKeys.some((k) => k.toLowerCase().includes('approve'));
  assert(
    !hasApproveMethod,
    'Test 15: SessionService has zero approval methods (Human Gate security boundary preserved)'
  );

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSessionTests();
