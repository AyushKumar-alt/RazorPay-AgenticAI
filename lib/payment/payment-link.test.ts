import { RazorpayService } from './razorpay.service';
import { MockRazorpayProvider, RazorpayProvider } from './razorpay.provider';
import { AuditService } from '@/lib/audit/audit.service';

async function runPaymentLinkTests() {
  console.log('--- RUNNING RAZORPAY PAYMENT LINK TEST SUITE ---');
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

  // Setup mock provider for test environment
  const mockProvider = new MockRazorpayProvider();
  RazorpayService.setProvider(mockProvider);
  AuditService.clearEvents();

  // Test 1: MockRazorpayProvider.createPaymentLink directly
  try {
    const rawLink = await mockProvider.createPaymentLink({
      amountPaise: 69900,
      currency: 'INR',
      description: 'Test Recovery Payment Link',
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
      },
    });

    assert(
      rawLink.id.startsWith('plink_mock_') && rawLink.shortUrl.startsWith('https://rzp.io/i/mock_'),
      'Test 1: MockRazorpayProvider generates valid plink ID and rzp.io shortUrl',
      JSON.stringify(rawLink)
    );
    assert(
      rawLink.amount === 69900 && rawLink.currency === 'INR',
      'Test 1b: Mock provider reflects amount and currency correctly'
    );
  } catch (err: any) {
    assert(false, 'Test 1: Exception thrown in direct provider call', err.message);
  }

  // Test 2: RazorpayService.createRecoveryPaymentLink with valid inputs
  AuditService.clearEvents();
  try {
    const res = await RazorpayService.createRecoveryPaymentLink({
      sourceOrderId: 'tx_failed_1001',
      amountPaise: 249900,
      description: 'Laptop Stand Payment Recovery',
      merchantId: 'merchant_aquamart',
      productId: 'elec_001',
      customerName: 'Alice Tech',
      customerEmail: 'alice@example.com',
    });

    assert(res.success === true, 'Test 2: createRecoveryPaymentLink succeeds with valid parameters');
    assert(
      !!res.paymentLink && res.paymentLink.shortUrl.includes('rzp.io'),
      'Test 2b: Recovery link contains valid shortUrl'
    );
    assert(
      res.paymentLink?.amountPaise === 249900,
      'Test 2c: Recovery link preserves correct amount in paise'
    );

    // Audit event verification
    const auditEvents = AuditService.getEventsForProposal('tx_failed_1001');
    assert(
      auditEvents.length === 1 && auditEvents[0].eventType === 'PAYMENT_LINK_CREATED',
      'Test 2d: PAYMENT_LINK_CREATED audit event logged for source order ID'
    );
    assert(
      auditEvents[0].metadata.actor === 'REVENUE_ACTION_TOOL',
      'Test 2e: Audit event metadata identifies actor as REVENUE_ACTION_TOOL'
    );
  } catch (err: any) {
    assert(false, 'Test 2: Exception in createRecoveryPaymentLink', err.message);
  }

  // Test 3: Reject missing sourceOrderId
  try {
    const res = await RazorpayService.createRecoveryPaymentLink({
      sourceOrderId: '',
      amountPaise: 50000,
      description: 'Missing order ID test',
    });

    assert(
      res.success === false && res.error?.code === 'INVALID_RECOVERY_INPUT',
      'Test 3: Rejects recovery link creation when sourceOrderId is empty'
    );
  } catch (err: any) {
    assert(false, 'Test 3: Exception in missing sourceOrderId test', err.message);
  }

  // Test 4: Reject non-positive amount
  try {
    const res = await RazorpayService.createRecoveryPaymentLink({
      sourceOrderId: 'tx_failed_1002',
      amountPaise: 0,
      description: 'Zero amount test',
    });

    assert(
      res.success === false && res.error?.code === 'INVALID_RECOVERY_INPUT',
      'Test 4: Rejects recovery link creation when amountPaise is 0 or negative'
    );
  } catch (err: any) {
    assert(false, 'Test 4: Exception in non-positive amount test', err.message);
  }

  // Test 5: Provider error handling
  try {
    const failingProvider: RazorpayProvider = {
      createOrder: async () => ({ id: '', amount: 0, currency: 'INR', receipt: '' }),
      createPaymentLink: async () => {
        throw new Error('Razorpay Gateway API 500 Server Error');
      },
      fetchPayment: async () => ({}),
      fetchOrder: async () => ({}),
    };

    const res = await RazorpayService.createRecoveryPaymentLink(
      {
        sourceOrderId: 'tx_failed_1003',
        amountPaise: 99900,
        description: 'Failing provider test',
      },
      failingProvider
    );

    assert(
      res.success === false &&
        res.error?.code === 'RAZORPAY_PROVIDER_ERROR' &&
        res.error.message.includes('500 Server Error'),
      'Test 5: Gracefully catches provider exceptions and returns structured RAZORPAY_PROVIDER_ERROR'
    );
  } catch (err: any) {
    assert(false, 'Test 5: Uncaught exception during provider error test', err.message);
  }

  console.log(`\n--- TEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentLinkTests().catch((err) => {
  console.error('Unhandled error in payment link test runner:', err);
  process.exit(1);
});
