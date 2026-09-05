import { CatalogService } from '@/lib/catalog/catalog.service';
import {
  SyntheticTransaction,
  SyntheticScenarioType,
  BaselineMetrics,
} from './synthetic-data.types';

/**
 * Deterministic Pseudo-Random Number Generator (PRNG) using LCG.
 * Fixed seed (default = 42) ensures identical data output across all execution runs.
 */
function createPRNG(seed: number = 42) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Specification for generating 30 deterministic synthetic merchant records.
 */
interface ScenarioSpec {
  scenario: SyntheticScenarioType;
  productId: string;
  status: 'FAILED' | 'ABANDONED' | 'CAPTURED';
  attemptCount: number;
  lastAttemptMinutesAgo: number | null;
  failureCode?: string;
  failureReason?: string;
  upsellEligible: boolean;
}

const SCENARIO_SPECS: ScenarioSpec[] = [
  // 1. Recoverable Failed Payments (5)
  {
    scenario: 'RECOVERABLE_FAILED_PAYMENT',
    productId: 'elec_002', // SwiftLink Wireless Mouse (₹699)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 45,
    failureCode: 'GATEWAY_TIMEOUT',
    failureReason: 'Bank gateway timed out during processing.',
    upsellEligible: false,
  },
  {
    scenario: 'RECOVERABLE_FAILED_PAYMENT',
    productId: 'mobile_001', // VoltFast 20W Adapter (₹899)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 50,
    failureCode: 'NETWORK_FLAKE',
    failureReason: 'Network connection interrupted during 3D secure check.',
    upsellEligible: false,
  },
  {
    scenario: 'RECOVERABLE_FAILED_PAYMENT',
    productId: 'audio_002', // AirTune Wireless Earbuds (₹1,999)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 40,
    failureCode: 'OTP_EXPIRED',
    failureReason: 'Customer OTP expired before submission.',
    upsellEligible: false,
  },
  {
    scenario: 'RECOVERABLE_FAILED_PAYMENT',
    productId: 'office_002', // StudioGlow LED Desk Lamp (₹1,299)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 65,
    failureCode: 'GATEWAY_TIMEOUT',
    failureReason: 'Payment gateway timeout.',
    upsellEligible: false,
  },
  {
    scenario: 'RECOVERABLE_FAILED_PAYMENT',
    productId: 'home_001', // AeroBrew Electric Kettle (₹1,499)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 55,
    failureCode: 'BANK_DOWNTIME',
    failureReason: 'Issuing bank undergoing scheduled maintenance.',
    upsellEligible: false,
  },

  // 2. Failed Payment Requiring Bounded Discount (3)
  {
    scenario: 'FAILED_PAYMENT_BOUNDED_DISCOUNT',
    productId: 'travel_001', // NomadPro Travel Backpack (₹2,999)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 60,
    failureCode: 'INSUFFICIENT_FUNDS',
    failureReason: 'Card limit exceeded or insufficient funds.',
    upsellEligible: false,
  },
  {
    scenario: 'FAILED_PAYMENT_BOUNDED_DISCOUNT',
    productId: 'care_001', // Precision Pro Cordless Trimmer (₹1,199)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 70,
    failureCode: 'PAYMENT_DECLINED',
    failureReason: 'Card declined by issuing bank.',
    upsellEligible: false,
  },
  {
    scenario: 'FAILED_PAYMENT_BOUNDED_DISCOUNT',
    productId: 'bottle_001', // HydroPeak Insulated Bottle (₹799)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 90,
    failureCode: 'INSUFFICIENT_FUNDS',
    failureReason: 'Insufficient balance.',
    upsellEligible: false,
  },

  // 3. Failed Payment at Retry Limit (2)
  {
    scenario: 'FAILED_PAYMENT_RETRY_LIMIT',
    productId: 'elec_003', // TeraBolt Portable SSD (₹6,499)
    status: 'FAILED',
    attemptCount: 2,
    lastAttemptMinutesAgo: 120,
    failureCode: 'MAX_RETRIES_EXCEEDED',
    failureReason: 'Maximum payment retry threshold reached (2 attempts).',
    upsellEligible: false,
  },
  {
    scenario: 'FAILED_PAYMENT_RETRY_LIMIT',
    productId: 'audio_001', // SoundPulse ANC Headphones (₹4,999)
    status: 'FAILED',
    attemptCount: 2,
    lastAttemptMinutesAgo: 180,
    failureCode: 'MAX_RETRIES_EXCEEDED',
    failureReason: 'Maximum payment retry threshold reached (2 attempts).',
    upsellEligible: false,
  },

  // 4. Failed Payment Still Inside Cooldown (2)
  {
    scenario: 'FAILED_PAYMENT_COOLDOWN',
    productId: 'mobile_002', // PowerVault Power Bank (₹1,299)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 10,
    failureCode: 'COOLDOWN_ACTIVE',
    failureReason: 'Attempt rejected; 30-minute retry cooldown active.',
    upsellEligible: false,
  },
  {
    scenario: 'FAILED_PAYMENT_COOLDOWN',
    productId: 'office_001', // ErgoStand Laptop Stand (₹1,799)
    status: 'FAILED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 15,
    failureCode: 'COOLDOWN_ACTIVE',
    failureReason: 'Attempt rejected; 30-minute retry cooldown active.',
    upsellEligible: false,
  },

  // 5. Strong Cross-Sell / Upsell Opportunity (4)
  {
    scenario: 'STRONG_UPSELL_CROSS_SELL',
    productId: 'office_001', // ErgoStand Laptop Stand (₹1,799)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 120,
    upsellEligible: true,
  },
  {
    scenario: 'STRONG_UPSELL_CROSS_SELL',
    productId: 'audio_002', // AirTune Earbuds (₹1,999)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 150,
    upsellEligible: true,
  },
  {
    scenario: 'STRONG_UPSELL_CROSS_SELL',
    productId: 'elec_001', // Nexa USB-C Hub (₹2,499)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 90,
    upsellEligible: true,
  },
  {
    scenario: 'STRONG_UPSELL_CROSS_SELL',
    productId: 'mobile_002', // Power Bank (₹1,299)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 200,
    upsellEligible: true,
  },

  // 6. Weak / No Meaningful Cross-Sell (3)
  {
    scenario: 'WEAK_NO_CROSS_SELL',
    productId: 'care_001', // Trimmer (₹1,199)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 300,
    upsellEligible: false,
  },
  {
    scenario: 'WEAK_NO_CROSS_SELL',
    productId: 'home_001', // Kettle (₹1,499)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 240,
    upsellEligible: false,
  },
  {
    scenario: 'WEAK_NO_CROSS_SELL',
    productId: 'travel_001', // Backpack (₹2,999)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 180,
    upsellEligible: false,
  },

  // 7. Upsell Requiring Human Approval (> ₹500 = >50,000p) (2)
  {
    scenario: 'UPSELL_REQUIRES_HUMAN_APPROVAL',
    productId: 'office_001', // Laptop Stand (bought) -> Upsell Hub elec_001 (₹2,499 > ₹500)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 110,
    upsellEligible: true,
  },
  {
    scenario: 'UPSELL_REQUIRES_HUMAN_APPROVAL',
    productId: 'audio_002', // Earbuds (bought) -> Upsell Headphones audio_001 (₹4,999 > ₹500)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 130,
    upsellEligible: true,
  },

  // 8. Upsell Within Auto-Approval Bound (<= ₹500 = <=50,000p) (2)
  {
    scenario: 'UPSELL_AUTO_APPROVED',
    productId: 'mobile_001', // 20W Adapter (bought) -> Upsell FlexiCord Cable mobile_005 (₹399 <= ₹500)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 95,
    upsellEligible: true,
  },
  {
    scenario: 'UPSELL_AUTO_APPROVED',
    productId: 'elec_002', // Mouse (bought) -> Upsell Wallet fashion_001 (₹499 <= ₹500)
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 105,
    upsellEligible: true,
  },

  // 9. Out-of-Stock / No Valid Complementary Product (2)
  {
    scenario: 'OUT_OF_STOCK_COMPLEMENTARY',
    productId: 'bottle_001',
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 140,
    upsellEligible: true,
  },
  {
    scenario: 'OUT_OF_STOCK_COMPLEMENTARY',
    productId: 'office_002',
    status: 'CAPTURED',
    attemptCount: 1,
    lastAttemptMinutesAgo: 160,
    upsellEligible: true,
  },

  // 10. Abandoned Checkout (5)
  {
    scenario: 'ABANDONED_CHECKOUT',
    productId: 'elec_001', // USB-C Hub
    status: 'ABANDONED',
    attemptCount: 0,
    lastAttemptMinutesAgo: null,
    upsellEligible: false,
  },
  {
    scenario: 'ABANDONED_CHECKOUT',
    productId: 'audio_001', // ANC Headphones
    status: 'ABANDONED',
    attemptCount: 0,
    lastAttemptMinutesAgo: null,
    upsellEligible: false,
  },
  {
    scenario: 'ABANDONED_CHECKOUT',
    productId: 'mobile_002', // Power Bank
    status: 'ABANDONED',
    attemptCount: 0,
    lastAttemptMinutesAgo: null,
    upsellEligible: false,
  },
  {
    scenario: 'ABANDONED_CHECKOUT',
    productId: 'travel_001', // Travel Backpack
    status: 'ABANDONED',
    attemptCount: 0,
    lastAttemptMinutesAgo: null,
    upsellEligible: false,
  },
  {
    scenario: 'ABANDONED_CHECKOUT',
    productId: 'care_001', // Trimmer
    status: 'ABANDONED',
    attemptCount: 0,
    lastAttemptMinutesAgo: null,
    upsellEligible: false,
  },
];

/**
 * Generate 30 deterministic synthetic merchant transaction records using seed 42.
 */
export function generateSyntheticDataset(
  seed: number = 42,
  baseDate: Date = new Date()
): SyntheticTransaction[] {
  const prng = createPRNG(seed);
  const now = baseDate;

  return SCENARIO_SPECS.map((spec, index) => {
    // Resolve product from real catalog
    const product = CatalogService.getProductById(spec.productId);
    if (!product) {
      throw new Error(`Synthetic dataset generation error: Product ID '${spec.productId}' not found in CatalogService.`);
    }

    const idNum = String(index + 1).padStart(3, '0');
    const custNum = String(Math.floor(prng() * 900) + 100);

    const timestampDate = new Date(now.getTime() - (index * 15 + Math.floor(prng() * 10)) * 60 * 1000);
    const timestamp = timestampDate.toISOString();

    let lastAttemptAt: string | null = null;
    if (spec.lastAttemptMinutesAgo !== null) {
      const lastAttemptDate = new Date(now.getTime() - spec.lastAttemptMinutesAgo * 60 * 1000);
      lastAttemptAt = lastAttemptDate.toISOString();
    }

    return {
      id: `tx_synth_${idNum}`,
      customerId: `cust_${custNum}`,
      productId: product.id,
      productName: product.name,
      category: product.category,
      amountPaise: product.pricePaise,
      status: spec.status,
      timestamp,
      attemptCount: spec.attemptCount,
      lastAttemptAt,
      failureCode: spec.failureCode,
      failureReason: spec.failureReason,
      upsellEligible: spec.upsellEligible,
      scenario: spec.scenario,
    };
  });
}

/**
 * Canonical 30-record synthetic dataset generated with seed 42.
 */
export const SYNTHETIC_DATASET: SyntheticTransaction[] = generateSyntheticDataset(42);

/**
 * Deterministic 20-record subset/batch for AOV experiment (baseline vs agent ON).
 */
export const METRICS_BATCH: SyntheticTransaction[] = SYNTHETIC_DATASET.slice(0, 20);

/**
 * Calculate baseline Average Order Value (AOV) strictly from captured/successful transactions.
 * Failed and abandoned transactions are revenue opportunities, not realized revenue.
 */
export function calculateBaselineAOV(records: SyntheticTransaction[]): BaselineMetrics {
  const capturedList = records.filter((r) => r.status === 'CAPTURED');
  const totalRevenuePaise = capturedList.reduce((sum, r) => sum + r.amountPaise, 0);
  const capturedCount = capturedList.length;
  const aovPaise = capturedCount > 0 ? Math.round(totalRevenuePaise / capturedCount) : 0;
  const aovRupees = aovPaise / 100;

  return {
    totalRevenuePaise,
    capturedCount,
    aovPaise,
    aovRupees,
  };
}
