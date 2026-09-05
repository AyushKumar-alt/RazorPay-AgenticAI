export type SyntheticScenarioType =
  | 'RECOVERABLE_FAILED_PAYMENT'
  | 'FAILED_PAYMENT_BOUNDED_DISCOUNT'
  | 'FAILED_PAYMENT_RETRY_LIMIT'
  | 'FAILED_PAYMENT_COOLDOWN'
  | 'STRONG_UPSELL_CROSS_SELL'
  | 'WEAK_NO_CROSS_SELL'
  | 'UPSELL_REQUIRES_HUMAN_APPROVAL'
  | 'UPSELL_AUTO_APPROVED'
  | 'OUT_OF_STOCK_COMPLEMENTARY'
  | 'ABANDONED_CHECKOUT';

export interface SyntheticTransaction {
  id: string; // Synthetic event ID e.g., "tx_synth_001"
  customerId: string; // e.g., "cust_101"
  productId: string; // Must exist in CatalogService
  productName: string; // Resolved from CatalogService
  category: string; // Resolved from CatalogService
  amountPaise: number; // Integer paise
  status: 'FAILED' | 'ABANDONED' | 'CAPTURED';
  timestamp: string; // ISO string
  attemptCount: number; // Attempts so far (0, 1, 2)
  lastAttemptAt: string | null; // ISO string or null
  failureCode?: string; // Error code if failed
  failureReason?: string; // Failure message
  upsellEligible: boolean; // Flag indicating if transaction is open for upsell/cross-sell
  scenario: SyntheticScenarioType; // Scenario classification tag
}

export interface BaselineMetrics {
  totalRevenuePaise: number;
  capturedCount: number;
  aovPaise: number;
  aovRupees: number;
}
