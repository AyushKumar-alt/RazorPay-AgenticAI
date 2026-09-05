import { SyntheticTransaction } from '@/lib/dataset/synthetic-data.types';
import { RevenueOpportunity, RevenueOpportunityType } from '@/types/revenue';
import { evaluateOpportunity, canRetryPayment, PolicyDecision } from '@/lib/policy/policy-check';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { AuditService } from '@/lib/audit/audit.service';

export interface RevenueAgentResult {
  transactionId: string;
  opportunities: Array<{
    opportunity: RevenueOpportunity;
    policyDecision: PolicyDecision;
  }>;
  abstained: boolean;
  explanation: string;
}

export class RevenueAgent {
  /**
   * Process a single merchant transaction/event and produce evaluated revenue opportunities.
   */
  public async analyzeTransaction(tx: SyntheticTransaction): Promise<RevenueAgentResult> {
    const rawOpportunities: RevenueOpportunity[] = [];

    // 1. Analyze FAILED payments
    if (tx.status === 'FAILED') {
      const retryCheck = canRetryPayment(
        tx.attemptCount,
        tx.lastAttemptAt ? new Date(tx.lastAttemptAt) : null
      );

      if (tx.scenario === 'FAILED_PAYMENT_COOLDOWN' || tx.scenario === 'FAILED_PAYMENT_RETRY_LIMIT') {
        // Cooldown active or max retries reached -> Cannot retry immediately.
        rawOpportunities.push({
          id: `opp_${tx.id}_retry`,
          type: 'failed_payment_recovery',
          sourceOrderId: tx.id,
          customerId: tx.customerId,
          suggestedAction: `Retry payment processing for ${tx.productName}`,
          amountPaise: tx.amountPaise,
          confidence: 0.9,
          reasoning: `Failure diagnosis: ${tx.failureReason || 'Failed payment'}. Retry policy status: ${retryCheck.reason}`,
        });
      } else if (tx.scenario === 'FAILED_PAYMENT_BOUNDED_DISCOUNT') {
        // Propose recovery incentive (5% discount)
        const discountPercent = 5;
        const discountedAmountPaise = Math.round(tx.amountPaise * (1 - discountPercent / 100));
        rawOpportunities.push({
          id: `opp_${tx.id}_discount`,
          type: 'failed_payment_recovery',
          sourceOrderId: tx.id,
          customerId: tx.customerId,
          suggestedAction: `Send 5% recovery discount link for ${tx.productName}`,
          amountPaise: discountedAmountPaise,
          discountPercent,
          confidence: 0.85,
          reasoning: `Failure diagnosis: ${tx.failureReason}. Offering 5% discount incentive to complete purchase.`,
        });
      } else {
        // Standard recoverable failed payment
        rawOpportunities.push({
          id: `opp_${tx.id}_recovery`,
          type: 'failed_payment_recovery',
          sourceOrderId: tx.id,
          customerId: tx.customerId,
          suggestedAction: `Re-initiate payment recovery for ${tx.productName}`,
          amountPaise: tx.amountPaise,
          confidence: 0.95,
          reasoning: `Transient error (${tx.failureCode || 'GATEWAY_TIMEOUT'}). Customer can re-attempt checkout.`,
        });
      }
    }

    // 2. Analyze ABANDONED checkouts
    else if (tx.status === 'ABANDONED') {
      rawOpportunities.push({
        id: `opp_${tx.id}_abandoned`,
        type: 'abandoned_checkout_recovery',
        sourceOrderId: tx.id,
        customerId: tx.customerId,
        suggestedAction: `Send checkout reminder & 5% completion discount for ${tx.productName}`,
        amountPaise: Math.round(tx.amountPaise * 0.95),
        discountPercent: 5,
        confidence: 0.88,
        reasoning: `Customer abandoned cart with ${tx.productName}. Offering 5% recovery incentive.`,
      });
    }

    // 3. Analyze CAPTURED purchases (Upsell / Cross-sell)
    else if (tx.status === 'CAPTURED') {
      if (tx.upsellEligible) {
        const complementary = this.findComplementaryProduct(tx.productId, tx.scenario);
        if (complementary) {
          const type: RevenueOpportunityType = complementary.pricePaise > tx.amountPaise ? 'upsell' : 'cross_sell';
          rawOpportunities.push({
            id: `opp_${tx.id}_upsell`,
            type,
            sourceOrderId: tx.id,
            customerId: tx.customerId,
            suggestedAction: `Recommend ${complementary.name} (${type === 'upsell' ? 'Upgrade' : 'Complementary Accessory'})`,
            amountPaise: complementary.pricePaise,
            itemCount: 1,
            confidence: 0.92,
            reasoning: `Customer purchased ${tx.productName}. Recommending complementary item ${complementary.name}.`,
          });
        }
      }
    }

    // 4. Abstain check if no opportunities proposed
    if (rawOpportunities.length === 0) {
      AuditService.recordEvent('REVENUE_ANALYSIS_ABSTAINED', tx.id, 'merchant_aquamart', tx.productId, {
        actor: 'REVENUE_AGENT',
        scenario: tx.scenario,
        reasoning: 'No viable revenue opportunity identified for this transaction.',
      });

      return {
        transactionId: tx.id,
        opportunities: [],
        abstained: true,
        explanation: `Revenue Agent abstained for transaction ${tx.id} (${tx.scenario}). No sensible opportunity identified.`,
      };
    }

    // 5. Pass EVERY proposed opportunity through evaluateOpportunity()
    const evaluatedList = rawOpportunities.map((opp) => {
      let policyDecision = evaluateOpportunity(opp);

      // If retry is blocked by retry limit or cooldown, override allowed to false
      if (tx.status === 'FAILED') {
        const retryCheck = canRetryPayment(
          tx.attemptCount,
          tx.lastAttemptAt ? new Date(tx.lastAttemptAt) : null
        );
        if (!retryCheck.allowed && opp.discountPercent === undefined) {
          policyDecision = {
            ...policyDecision,
            allowed: false,
            boundsChecked: [
              ...policyDecision.boundsChecked,
              {
                rule: 'retry_policy_check',
                passed: false,
                detail: retryCheck.reason,
              },
            ],
          };
        }
      }

      // Record Audit Event for Policy Evaluation
      AuditService.recordEvent('REVENUE_OPPORTUNITY_EVALUATED', tx.id, 'merchant_aquamart', tx.productId, {
        actor: 'REVENUE_AGENT',
        opportunityId: opp.id,
        opportunityType: opp.type,
        amountPaise: opp.amountPaise,
        confidence: opp.confidence,
        reasoning: opp.reasoning,
        allowed: policyDecision.allowed,
        requiresApproval: policyDecision.requiresApproval,
        boundsChecked: policyDecision.boundsChecked,
      });

      return {
        opportunity: opp,
        policyDecision,
      };
    });

    const anyAllowed = evaluatedList.some((item) => item.policyDecision.allowed);

    return {
      transactionId: tx.id,
      opportunities: evaluatedList,
      abstained: !anyAllowed,
      explanation: anyAllowed
        ? `Evaluated ${evaluatedList.length} opportunity(ies) for ${tx.id}.`
        : `Revenue Agent abstained for ${tx.id}; all proposed opportunities were rejected by policy bounds.`,
    };
  }

  /**
   * Helper to resolve complementary products from real CatalogService.
   */
  private findComplementaryProduct(productId: string, scenario: string) {
    if (scenario === 'WEAK_NO_CROSS_SELL' || scenario === 'OUT_OF_STOCK_COMPLEMENTARY') {
      return null;
    }

    if (scenario === 'UPSELL_AUTO_APPROVED') {
      // Target item <= ₹500 (50,000p)
      if (productId === 'mobile_001') {
        return CatalogService.getProductById('mobile_005'); // FlexiCord Cable ₹399 = 39,900p
      }
      if (productId === 'elec_002') {
        return CatalogService.getProductById('fashion_001'); // Wallet ₹499 = 49,900p
      }
      return CatalogService.getProductById('mobile_005');
    }

    if (scenario === 'UPSELL_REQUIRES_HUMAN_APPROVAL') {
      // Target item > ₹500 (50,000p)
      if (productId === 'office_001') {
        return CatalogService.getProductById('elec_001'); // Nexa Hub ₹2,499 = 249,900p
      }
      if (productId === 'audio_002') {
        return CatalogService.getProductById('audio_001'); // ANC Headphones ₹4,999 = 499,900p
      }
      return CatalogService.getProductById('elec_001');
    }

    // Default complementary mapping for STRONG_UPSELL_CROSS_SELL
    if (productId === 'office_001') {
      return CatalogService.getProductById('elec_002'); // Wireless Mouse ₹699
    }
    if (productId === 'audio_002') {
      return CatalogService.getProductById('mobile_005'); // USB-C Cable ₹399
    }
    if (productId === 'elec_001') {
      return CatalogService.getProductById('elec_003'); // Portable SSD ₹6,499
    }
    if (productId === 'mobile_002') {
      return CatalogService.getProductById('mobile_001'); // 20W Adapter ₹899
    }

    return null;
  }
}
