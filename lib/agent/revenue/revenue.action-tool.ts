import { RevenueOpportunity } from '@/types/revenue';
import { PolicyDecision, evaluateOpportunity, canRetryPayment } from '@/lib/policy/policy-check';
import { RazorpayService } from '@/lib/payment/razorpay.service';
import { RazorpayProvider } from '@/lib/payment/razorpay.provider';
import { PaymentStore } from '@/lib/payment/payment.store';
import { AuditService } from '@/lib/audit/audit.service';

export type RevenueActionResultStatus =
  | 'rejected'
  | 'pending_approval'
  | 'link_created'
  | 'provider_error'
  | 'unsupported';

export interface ExecuteRevenueActionContext {
  attemptCount?: number;
  lastAttemptAt?: string | Date | null;
  nowDate?: Date;
  humanApproved?: boolean;
  customerName?: string;
  customerEmail?: string;
  customerContact?: string;
  merchantId?: string;
  productId?: string;
  notes?: Record<string, string>;
}

export interface ExecuteRevenueActionInput {
  opportunity: RevenueOpportunity;
  context?: ExecuteRevenueActionContext;
}

export interface RevenueActionResult {
  success: boolean;
  status: RevenueActionResultStatus;
  opportunityId: string;
  sourceOrderId?: string;
  policyDecision: PolicyDecision;
  paymentLink?: {
    id: string;
    shortUrl: string;
    amountPaise: number;
    currency: 'INR';
    status: string;
    description: string;
  };
  reasoning: string;
  error?: {
    code: string;
    message: string;
  };
}

export class RevenueActionTool {
  /**
   * Execute an authorized revenue action for recovery opportunities.
   * Strictly enforces PolicyEngine evaluation and server-verified approval before calling Razorpay.
   */
  public static async executeRevenueAction(
    input: ExecuteRevenueActionInput,
    customProvider?: RazorpayProvider
  ): Promise<RevenueActionResult> {
    const { opportunity, context = {} } = input;

    // 1. Validate supported opportunity type
    if (
      opportunity.type !== 'failed_payment_recovery' &&
      opportunity.type !== 'abandoned_checkout_recovery'
    ) {
      const decision = evaluateOpportunity(opportunity);
      return {
        success: false,
        status: 'unsupported',
        opportunityId: opportunity.id,
        sourceOrderId: opportunity.sourceOrderId,
        policyDecision: decision,
        reasoning: `Opportunity type '${opportunity.type}' is not supported by RevenueActionTool recovery execution.`,
        error: {
          code: 'UNSUPPORTED_OPPORTUNITY_TYPE',
          message: `RevenueActionTool only handles recovery opportunities. Received '${opportunity.type}'.`,
        },
      };
    }

    // 2. Re-run Policy Engine evaluation authoritatively
    const policyDecision = evaluateOpportunity(opportunity);

    // 3. Re-run retry policy check for failed payments if attempt history is provided
    let retryAllowed = true;
    let retryReason = 'Retry policy passed.';

    if (opportunity.type === 'failed_payment_recovery') {
      const attemptCount = context.attemptCount ?? 0;
      const lastAttemptAt = context.lastAttemptAt
        ? new Date(context.lastAttemptAt)
        : null;
      const nowDate = context.nowDate ?? new Date();

      if (attemptCount > 0 || lastAttemptAt) {
        const retryCheck = canRetryPayment(attemptCount, lastAttemptAt, nowDate);
        retryAllowed = retryCheck.allowed;
        retryReason = retryCheck.reason;
      }
    }

    // 4. Check if policy or retry limit blocks execution
    if (!policyDecision.allowed || !retryAllowed) {
      const rejectionReason = !policyDecision.allowed
        ? 'Policy Engine bounds check failed.'
        : retryReason;

      AuditService.recordEvent(
        'REVENUE_OPPORTUNITY_EVALUATED',
        opportunity.sourceOrderId || opportunity.id,
        context.merchantId || 'merchant_aquamart',
        context.productId || 'product_unknown',
        {
          actor: 'REVENUE_ACTION_TOOL',
          opportunityId: opportunity.id,
          allowed: false,
          reasoning: rejectionReason,
        }
      );

      return {
        success: false,
        status: 'rejected',
        opportunityId: opportunity.id,
        sourceOrderId: opportunity.sourceOrderId,
        policyDecision,
        reasoning: `Action execution rejected: ${rejectionReason}`,
        error: {
          code: 'POLICY_REJECTED',
          message: rejectionReason,
        },
      };
    }

    // 5. Check human approval requirement
    if (policyDecision.requiresApproval && context.humanApproved !== true) {
      AuditService.recordEvent(
        'REVENUE_OPPORTUNITY_EVALUATED',
        opportunity.sourceOrderId || opportunity.id,
        context.merchantId || 'merchant_aquamart',
        context.productId || 'product_unknown',
        {
          actor: 'REVENUE_ACTION_TOOL',
          opportunityId: opportunity.id,
          allowed: true,
          requiresApproval: true,
          humanApproved: false,
          reasoning: 'Execution paused awaiting explicit human approval.',
        }
      );

      return {
        success: false,
        status: 'pending_approval',
        opportunityId: opportunity.id,
        sourceOrderId: opportunity.sourceOrderId,
        policyDecision,
        reasoning: `Opportunity amount (₹${(opportunity.amountPaise / 100).toFixed(
          2
        )}) exceeds auto-approval ceiling. Human merchant approval required before Razorpay execution.`,
      };
    }

    // 6. Action is fully allowed & approved -> Record REVENUE_OPPORTUNITY_APPROVED
    const sourceOrderId = opportunity.sourceOrderId || opportunity.id;
    const merchantId = context.merchantId || 'merchant_aquamart';
    const productId = context.productId || 'product_unknown';

    AuditService.recordEvent(
      'REVENUE_OPPORTUNITY_APPROVED',
      sourceOrderId,
      merchantId,
      productId,
      {
        actor: context.humanApproved ? 'HUMAN_MERCHANT' : 'AUTO_APPROVE_POLICY',
        opportunityId: opportunity.id,
        amountPaise: opportunity.amountPaise,
        suggestedAction: opportunity.suggestedAction,
      }
    );

    // 7. Call RazorpayService.createRecoveryPaymentLink()
    const linkResponse = await RazorpayService.createRecoveryPaymentLink(
      {
        sourceOrderId,
        amountPaise: opportunity.amountPaise,
        description: opportunity.suggestedAction,
        merchantId,
        productId,
        customerId: opportunity.customerId,
        customerName: context.customerName,
        customerEmail: context.customerEmail,
        customerContact: context.customerContact,
        notes: context.notes,
      },
      customProvider
    );

    if (!linkResponse.success || !linkResponse.paymentLink) {
      return {
        success: false,
        status: 'provider_error',
        opportunityId: opportunity.id,
        sourceOrderId,
        policyDecision,
        reasoning: linkResponse.error?.message || 'Razorpay Payment Link creation failed.',
        error: linkResponse.error || {
          code: 'RAZORPAY_PROVIDER_ERROR',
          message: 'Razorpay Payment Link creation failed.',
        },
      };
    }

    // Register transaction state in PaymentStore for single source of truth
    let existingTx = PaymentStore.getById(sourceOrderId);
    if (!existingTx) {
      PaymentStore.create({
        transactionId: sourceOrderId,
        proposalId: sourceOrderId,
        merchantId,
        productId,
        razorpayOrderId: linkResponse.paymentLink.id,
        amountPaise: opportunity.amountPaise,
        currency: 'INR',
        status: 'PAYMENT_PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      existingTx.status = 'PAYMENT_PENDING';
      existingTx.razorpayOrderId = linkResponse.paymentLink.id;
      PaymentStore.update(existingTx);
    }

    return {
      success: true,
      status: 'link_created',
      opportunityId: opportunity.id,
      sourceOrderId,
      policyDecision,
      paymentLink: linkResponse.paymentLink,
      reasoning: `Successfully generated Razorpay recovery payment link: ${linkResponse.paymentLink.shortUrl}`,
    };
  }
}
