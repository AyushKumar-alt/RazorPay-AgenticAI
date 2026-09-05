import { RevenueActionTool } from './revenue.action-tool';
import { RazorpayService } from '@/lib/payment/razorpay.service';
import { MockRazorpayProvider, RazorpayProvider } from '@/lib/payment/razorpay.provider';
import { AuditService } from '@/lib/audit/audit.service';
import { RevenueOpportunity } from '@/types/revenue';

async function runRevenueActionToolTests() {
  console.log('--- RUNNING REVENUE ACTION TOOL TEST SUITE ---');
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

  // Setup Mock Razorpay Provider
  const mockProvider = new MockRazorpayProvider();
  RazorpayService.setProvider(mockProvider);
  AuditService.clearEvents();

  // Test 1: Valid auto-approved recovery action creates payment link
  try {
    const opp: RevenueOpportunity = {
      id: 'opp_tx_101_recovery',
      type: 'failed_payment_recovery',
      sourceOrderId: 'tx_101',
      customerId: 'cust_301',
      suggestedAction: 'Send recovery link for FlexiCord Cable',
      amountPaise: 39900, // ₹399 <= ₹500 limit -> Auto approved
      confidence: 0.9,
      reasoning: 'Transient gateway timeout error.',
    };

    const res = await RevenueActionTool.executeRevenueAction({
      opportunity: opp,
      context: {
        customerEmail: 'cust301@example.com',
      },
    });

    assert(res.success === true, 'Test 1: Auto-approved recovery action succeeds');
    assert(res.status === 'link_created', 'Test 1b: Status is link_created');
    assert(
      !!res.paymentLink && res.paymentLink.shortUrl.startsWith('https://rzp.io/i/mock_'),
      'Test 1c: Payment link shortUrl generated successfully'
    );

    // Audit check
    const events = AuditService.getEventsForProposal('tx_101');
    const approvedEvent = events.find((e) => e.eventType === 'REVENUE_OPPORTUNITY_APPROVED');
    const linkEvent = events.find((e) => e.eventType === 'PAYMENT_LINK_CREATED');
    assert(!!approvedEvent, 'Test 1d: REVENUE_OPPORTUNITY_APPROVED audit event logged');
    assert(!!linkEvent, 'Test 1e: PAYMENT_LINK_CREATED audit event logged');
  } catch (err: any) {
    assert(false, 'Test 1: Exception in auto-approved recovery test', err.message);
  }

  // Test 2: Policy rejection (amount exceeds sanity ceiling) prevents Razorpay call
  AuditService.clearEvents();
  try {
    const excessiveOpp: RevenueOpportunity = {
      id: 'opp_tx_102_excessive',
      type: 'failed_payment_recovery',
      sourceOrderId: 'tx_102',
      customerId: 'cust_302',
      suggestedAction: 'Send recovery link',
      amountPaise: 2000000, // 20,000 INR > 10,000 INR ceiling limit
      confidence: 0.9,
      reasoning: 'Excessive amount test',
    };

    const res = await RevenueActionTool.executeRevenueAction({
      opportunity: excessiveOpp,
    });

    assert(res.success === false, 'Test 2: Rejects excessive amount opportunity');
    assert(res.status === 'rejected', 'Test 2b: Status is rejected');
    assert(
      res.error?.code === 'POLICY_REJECTED',
      'Test 2c: Structured error code is POLICY_REJECTED'
    );
    const linkEvents = AuditService.getAllEvents().filter((e) => e.eventType === 'PAYMENT_LINK_CREATED');
    assert(linkEvents.length === 0, 'Test 2d: Razorpay link creation was NOT called on policy rejection');
  } catch (err: any) {
    assert(false, 'Test 2: Exception in policy rejection test', err.message);
  }

  // Test 3: Human approval required prevents execution when humanApproved is missing
  AuditService.clearEvents();
  try {
    const highValueOpp: RevenueOpportunity = {
      id: 'opp_tx_103_high',
      type: 'failed_payment_recovery',
      sourceOrderId: 'tx_103',
      customerId: 'cust_303',
      suggestedAction: 'Send recovery link for Nexa Hub',
      amountPaise: 249900, // ₹2,499 > ₹500 -> Requires Human Approval
      confidence: 0.88,
      reasoning: 'High value purchase recovery',
    };

    const res = await RevenueActionTool.executeRevenueAction({
      opportunity: highValueOpp,
      context: {
        humanApproved: false, // Explicitly false or omitted
      },
    });

    assert(res.success === false, 'Test 3: Unapproved high-value recovery is not executed');
    assert(res.status === 'pending_approval', 'Test 3b: Status is pending_approval');
    const linkEvents = AuditService.getAllEvents().filter((e) => e.eventType === 'PAYMENT_LINK_CREATED');
    assert(linkEvents.length === 0, 'Test 3c: Razorpay was NOT called without human approval');
  } catch (err: any) {
    assert(false, 'Test 3: Exception in human approval requirement test', err.message);
  }

  // Test 4: Human approval allows execution when humanApproved is true
  AuditService.clearEvents();
  try {
    const highValueOpp: RevenueOpportunity = {
      id: 'opp_tx_103_high',
      type: 'failed_payment_recovery',
      sourceOrderId: 'tx_103',
      customerId: 'cust_303',
      suggestedAction: 'Send recovery link for Nexa Hub',
      amountPaise: 249900,
      confidence: 0.88,
      reasoning: 'High value purchase recovery',
    };

    const res = await RevenueActionTool.executeRevenueAction({
      opportunity: highValueOpp,
      context: {
        humanApproved: true, // Explicitly granted by server
      },
    });

    assert(res.success === true, 'Test 4: High-value recovery executes when humanApproved is true');
    assert(res.status === 'link_created', 'Test 4b: Status is link_created');
    assert(!!res.paymentLink, 'Test 4c: Payment link returned');
  } catch (err: any) {
    assert(false, 'Test 4: Exception in human approved execution test', err.message);
  }

  // Test 5: Retry limit prevents execution
  AuditService.clearEvents();
  try {
    const opp: RevenueOpportunity = {
      id: 'opp_tx_104_retry',
      type: 'failed_payment_recovery',
      sourceOrderId: 'tx_104',
      customerId: 'cust_304',
      suggestedAction: 'Retry payment link',
      amountPaise: 39900,
      confidence: 0.9,
      reasoning: 'Max retries test',
    };

    const res = await RevenueActionTool.executeRevenueAction({
      opportunity: opp,
      context: {
        attemptCount: 3, // Max limit reached (3)
      },
    });

    assert(res.success === false, 'Test 5: Fails when max retry attempts reached');
    assert(res.status === 'rejected', 'Test 5b: Status is rejected');
    assert(
      Boolean(res.error?.message?.includes('Maximum retry attempts reached')),
      'Test 5c: Error message specifies max retry attempts'
    );
  } catch (err: any) {
    assert(false, 'Test 5: Exception in retry limit test', err.message);
  }

  // Test 6: Cooldown prevents execution
  AuditService.clearEvents();
  try {
    const opp: RevenueOpportunity = {
      id: 'opp_tx_105_cooldown',
      type: 'failed_payment_recovery',
      sourceOrderId: 'tx_105',
      customerId: 'cust_305',
      suggestedAction: 'Retry payment link',
      amountPaise: 39900,
      confidence: 0.9,
      reasoning: 'Cooldown test',
    };

    const now = new Date();
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000); // 10 mins ago < 15 min cooldown

    const res = await RevenueActionTool.executeRevenueAction({
      opportunity: opp,
      context: {
        attemptCount: 1,
        lastAttemptAt: tenMinsAgo,
        nowDate: now,
      },
    });

    assert(res.success === false, 'Test 6: Fails when cooldown is active');
    assert(res.status === 'rejected', 'Test 6b: Status is rejected');
    assert(
      Boolean(res.error?.message?.includes('Retry cooldown active')),
      'Test 6c: Error message specifies cooldown active'
    );
  } catch (err: any) {
    assert(false, 'Test 6: Exception in cooldown test', err.message);
  }

  // Test 7: Provider failure returns structured provider_error
  AuditService.clearEvents();
  try {
    const opp: RevenueOpportunity = {
      id: 'opp_tx_106_fail',
      type: 'failed_payment_recovery',
      sourceOrderId: 'tx_106',
      customerId: 'cust_306',
      suggestedAction: 'Send recovery link',
      amountPaise: 39900,
      confidence: 0.9,
      reasoning: 'Failing provider test',
    };

    const failingProvider: RazorpayProvider = {
      createOrder: async () => ({ id: '', amount: 0, currency: 'INR', receipt: '' }),
      createPaymentLink: async () => {
        throw new Error('Razorpay Gateway 503 Service Unavailable');
      },
      fetchPayment: async () => ({}),
      fetchOrder: async () => ({}),
    };

    const res = await RevenueActionTool.executeRevenueAction(
      {
        opportunity: opp,
      },
      failingProvider
    );

    assert(res.success === false, 'Test 7: Handles provider failure gracefully');
    assert(res.status === 'provider_error', 'Test 7b: Status is provider_error');
    assert(
      Boolean(res.error?.message?.includes('503 Service Unavailable')),
      'Test 7c: Error message preserves provider error detail'
    );
  } catch (err: any) {
    assert(false, 'Test 7: Exception in provider failure test', err.message);
  }

  console.log(`\n--- TEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runRevenueActionToolTests().catch((err) => {
  console.error('Unhandled error in revenue action tool test runner:', err);
  process.exit(1);
});
