export interface ProductPair {
  id: string;
  conceptualPair: string;
  primaryProductId: string;
  partnerProductId: string;
  reason: string;
}

export const PRODUCT_PAIRS: ProductPair[] = [
  {
    id: 'pair_mouse_pad',
    conceptualPair: 'Wireless Mouse ↔ Mouse Pad',
    primaryProductId: 'elec_002', // SwiftLink Wireless Ergonomic Mouse (₹699)
    partnerProductId: 'elec_007', // ErgoGlide Non-Slip Gaming Mouse Pad (₹399)
    reason: 'Customer buying a wireless mouse will need a high-precision anti-slip mouse pad (₹399) for smooth tracking and desk surface protection.',
  },
  {
    id: 'pair_keyboard_wristrest',
    conceptualPair: 'Mechanical Keyboard ↔ Wrist Rest',
    primaryProductId: 'elec_003', // KeyPro Compact Mechanical Keyboard (₹3,499)
    partnerProductId: 'elec_008', // ErgoRest Memory Foam Keyboard Wrist Rest (₹499)
    reason: 'Customer purchasing a mechanical keyboard benefits from an ergonomic memory foam wrist rest (₹499) to prevent wrist strain during long typing sessions.',
  },
  {
    id: 'pair_laptop_sleeve',
    conceptualPair: 'Laptop Stand ↔ Laptop Sleeve',
    primaryProductId: 'office_002', // Ergofit Aluminum Ergonomic Laptop Stand (₹999)
    partnerProductId: 'office_007', // ShieldPro Padded Water-Resistant 15.6" Laptop Sleeve (₹699)
    reason: 'Customer purchasing a laptop stand will need a padded water-resistant laptop sleeve (₹699) for safely transporting their laptop on the go.',
  },
  {
    id: 'pair_headphones_stand',
    conceptualPair: 'Wireless Headphones ↔ Headphone Stand',
    primaryProductId: 'audio_001', // StudioPro Over-Ear Wireless Headphones (₹4,999)
    partnerProductId: 'audio_006', // MountPro Aluminum Desk Headphone Stand Holder (₹599)
    reason: 'Customer buying over-ear headphones will appreciate an aluminum headphone stand (₹599) to safely store and organize their headphones on their desk.',
  },
  {
    id: 'pair_phone_case',
    conceptualPair: 'Power Bank ↔ MagSafe Phone Case',
    primaryProductId: 'mobile_002', // PowerCore 10000mAh Compact Power Bank (₹1,299)
    partnerProductId: 'mobile_006', // ArmorShield MagSafe Shockproof Clear Phone Case (₹399)
    reason: 'Customer buying mobile power accessories will want a MagSafe clear phone case (₹399) to protect their device while charging on the move.',
  },
  {
    id: 'pair_webcam_ringlight',
    conceptualPair: 'Webcam ↔ Ring Light',
    primaryProductId: 'elec_004', // ClarityView 1080p Full HD Webcam (₹2,299)
    partnerProductId: 'elec_009', // LuminaRing 10-Inch Desktop LED Selfie Ring Light (₹799)
    reason: 'Customer buying a HD webcam needs a desktop LED ring light (₹799) to provide professional lighting for video calls and streaming.',
  },
  {
    id: 'pair_lunchbox_bottle',
    conceptualPair: 'Lunch Box ↔ Water Bottle',
    primaryProductId: 'home_002', // MealFresh Stainless Steel Lunch Box (₹899)
    partnerProductId: 'home_007', // AquaThermal 750ml Stainless Steel Water Bottle (₹499)
    reason: 'Customer ordering a lunch box will need an insulated stainless steel water bottle (₹499) to complete their daily meal hydration setup.',
  },
  {
    id: 'pair_kettle_mug',
    conceptualPair: 'Electric Kettle ↔ Travel Coffee Mug',
    primaryProductId: 'home_001', // AquaBoil Electric Kettle 1.5L (₹1,499)
    partnerProductId: 'home_008', // ThermoBrew Stainless Steel Travel Coffee Mug 450ml (₹499)
    reason: 'Customer buying an electric kettle will love an insulated stainless steel travel mug (₹499) to keep their hot coffee or tea warm everywhere.',
  },
  {
    id: 'pair_running_socks',
    conceptualPair: 'Running Cap ↔ Athletic Performance Socks',
    primaryProductId: 'fashion_002', // FlexStride Running Cap (₹499)
    partnerProductId: 'fashion_006', // FlexStride Breathable Athletic Cushion Socks 3-Pack (₹349)
    reason: 'Customer buying running gear will need moisture-wicking athletic performance socks (₹349) for workout comfort.',
  },
  {
    id: 'pair_yogamat_blocks',
    conceptualPair: 'Yoga Mat ↔ Yoga Foam Block Set',
    primaryProductId: 'fit_001', // ProGrip Non-Slip Yoga Mat 6mm (₹1,299)
    partnerProductId: 'fit_007', // FlexBalance High-Density Yoga Foam Block Set 2-Pack (₹449)
    reason: 'Customer purchasing a yoga mat will benefit from a high-density yoga foam block set (₹449) for deepening stretches and posture support.',
  },
];

export function findPairForProduct(productId: string): ProductPair | undefined {
  return PRODUCT_PAIRS.find(
    (pair) => pair.primaryProductId === productId || pair.partnerProductId === productId
  );
}

export function resolvePairPartnerId(productId: string): string | undefined {
  const pair = findPairForProduct(productId);
  if (!pair) return undefined;
  if (pair.primaryProductId === productId) {
    return pair.partnerProductId;
  }
  return pair.primaryProductId;
}
