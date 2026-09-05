export type RevenueOpportunityType =
  | 'failed_payment_recovery'
  | 'abandoned_checkout_recovery'
  | 'upsell'
  | 'cross_sell';

export interface RevenueOpportunity {
  id: string;
  type: RevenueOpportunityType;
  sourceOrderId?: string;
  customerId: string;

  suggestedAction: string;

  amountPaise: number;

  discountPercent?: number;

  itemCount?: number;

  confidence: number;

  reasoning: string;
}
