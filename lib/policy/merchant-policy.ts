export const MERCHANT_POLICY = {
  maxAutoApproveAmountPaise: 50_000,       // ₹500
  maxAmountSanityCeilingPaise: 1_000_000,  // ₹10,000
  maxDiscountPercent: 10,
  maxUpsellItemsPerProposal: 1,
  maxRetryAttempts: 2,
  retryCooldownMinutes: 30,
} as const;
