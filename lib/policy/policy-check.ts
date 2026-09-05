import { RevenueOpportunity } from '@/types/revenue';
import { MERCHANT_POLICY } from './merchant-policy';

export interface BoundCheck {
  rule: string;
  passed: boolean;
  detail?: string;
}

export interface PolicyDecision {
  opportunity: RevenueOpportunity;
  boundsChecked: BoundCheck[];
  allowed: boolean;
  requiresApproval: boolean;
}

export function evaluateOpportunity(opp: RevenueOpportunity): PolicyDecision {
  const boundsChecked: BoundCheck[] = [];

  // 1. Confidence range check (0 <= confidence <= 1)
  const confidencePassed =
    typeof opp.confidence === 'number' && opp.confidence >= 0 && opp.confidence <= 1;
  boundsChecked.push({
    rule: 'confidence_within_valid_range',
    passed: confidencePassed,
    detail: `confidence: ${opp.confidence} (allowed range 0.0 - 1.0)`,
  });

  // 2. Amount sanity ceiling check (amountPaise > 0 AND amountPaise <= 1,000,000)
  const amountPassed =
    typeof opp.amountPaise === 'number' &&
    opp.amountPaise > 0 &&
    opp.amountPaise <= MERCHANT_POLICY.maxAmountSanityCeilingPaise;
  boundsChecked.push({
    rule: 'amount_within_sanity_ceiling',
    passed: amountPassed,
    detail: `${opp.amountPaise}p (allowed range 1p - ${MERCHANT_POLICY.maxAmountSanityCeilingPaise}p)`,
  });

  // 3. Type-specific checks
  let typeRulePassed = true;

  if (opp.type === 'failed_payment_recovery' || opp.type === 'abandoned_checkout_recovery') {
    if (opp.discountPercent !== undefined) {
      const discountPassed =
        typeof opp.discountPercent === 'number' &&
        opp.discountPercent >= 0 &&
        opp.discountPercent <= MERCHANT_POLICY.maxDiscountPercent;
      if (!discountPassed) {
        typeRulePassed = false;
      }
      boundsChecked.push({
        rule: 'discount_within_max_percent',
        passed: discountPassed,
        detail: `${opp.discountPercent}% (max ${MERCHANT_POLICY.maxDiscountPercent}%, min 0%)`,
      });
    }
  } else if (opp.type === 'upsell' || opp.type === 'cross_sell') {
    const itemCountPassed =
      typeof opp.itemCount === 'number' &&
      opp.itemCount > 0 &&
      opp.itemCount <= MERCHANT_POLICY.maxUpsellItemsPerProposal;
    if (!itemCountPassed) {
      typeRulePassed = false;
    }
    boundsChecked.push({
      rule: 'item_count_within_max_limit',
      passed: itemCountPassed,
      detail: `itemCount: ${opp.itemCount} (max ${MERCHANT_POLICY.maxUpsellItemsPerProposal}, min 1)`,
    });
  }

  // 4. Determine overall allowed status
  const allowed = confidencePassed && amountPassed && typeRulePassed;

  // 5. Auto-approval threshold check (amountPaise <= 50,000)
  const withinAutoApprove = opp.amountPaise <= MERCHANT_POLICY.maxAutoApproveAmountPaise;
  boundsChecked.push({
    rule: 'within_auto_approve_amount',
    passed: withinAutoApprove,
    detail: `${opp.amountPaise}p (auto-approve limit ${MERCHANT_POLICY.maxAutoApproveAmountPaise}p)`,
  });

  // 6. Mandatory requiresApproval determination
  // If allowed, requiresApproval is true whenever amount > 50,000 paise
  const requiresApproval = allowed ? !withinAutoApprove : false;

  return {
    opportunity: opp,
    boundsChecked,
    allowed,
    requiresApproval,
  };
}

export function canRetryPayment(
  attemptsSoFar: number,
  lastAttemptAt: Date | null,
  nowDate: Date = new Date()
): {
  allowed: boolean;
  reason: string;
} {
  if (attemptsSoFar >= MERCHANT_POLICY.maxRetryAttempts) {
    return {
      allowed: false,
      reason: `Maximum retry attempts reached (${attemptsSoFar}/${MERCHANT_POLICY.maxRetryAttempts}).`,
    };
  }

  if (lastAttemptAt) {
    const elapsedMinutes = (nowDate.getTime() - lastAttemptAt.getTime()) / (1000 * 60);
    if (elapsedMinutes < MERCHANT_POLICY.retryCooldownMinutes) {
      const remainingMinutes = Math.ceil(MERCHANT_POLICY.retryCooldownMinutes - elapsedMinutes);
      return {
        allowed: false,
        reason: `Retry cooldown active. Please wait ${remainingMinutes} more minute(s) before retrying (cooldown: ${MERCHANT_POLICY.retryCooldownMinutes} mins).`,
      };
    }
  }

  return {
    allowed: true,
    reason: 'Payment retry permitted within policy bounds.',
  };
}
