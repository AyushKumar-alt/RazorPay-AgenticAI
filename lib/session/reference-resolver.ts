import { BuyerRecommendation } from '@/lib/agent/buyer/buyer.schema';
import { Product } from '@/types/catalog';
import { CatalogService } from '@/lib/catalog/catalog.service';

export interface ResolvedReference {
  resolvedProductId: string | null;
  resolvedIndex: number | null;
  product: Product | null;
  resolutionType: 'ORDINAL' | 'RELATIVE' | 'CHEAPEST' | 'UNKNOWN';
}

const ORDINAL_PATTERNS: { pattern: RegExp; index: number }[] = [
  { pattern: /\b(first|1st|option 1|number 1|#1)\b/i, index: 0 },
  { pattern: /\b(second|2nd|option 2|number 2|#2)\b/i, index: 1 },
  { pattern: /\b(third|3rd|option 3|number 3|#3)\b/i, index: 2 },
  { pattern: /\b(fourth|4th|option 4|number 4|#4)\b/i, index: 3 },
  { pattern: /\b(fifth|5th|option 5|number 5|#5)\b/i, index: 4 },
];

/**
 * Deterministic reference resolver mapping natural language utterances (e.g. "the second one", "option 2", "the cheapest mouse")
 * against current recommendation set.
 */
export function resolveProductReference(
  utterance: string,
  recommendations: BuyerRecommendation | null,
  currentlySelectedProduct?: Product | null
): ResolvedReference {
  if (!utterance || utterance.trim() === '') {
    return { resolvedProductId: null, resolvedIndex: null, product: null, resolutionType: 'UNKNOWN' };
  }

  const text = utterance.toLowerCase().trim();

  if (!recommendations || !recommendations.recommendations || recommendations.recommendations.length === 0) {
    if (currentlySelectedProduct && (text.includes('it') || text.includes('that') || text.includes('this'))) {
      return {
        resolvedProductId: currentlySelectedProduct.id,
        resolvedIndex: null,
        product: currentlySelectedProduct,
        resolutionType: 'RELATIVE',
      };
    }
    return { resolvedProductId: null, resolvedIndex: null, product: null, resolutionType: 'UNKNOWN' };
  }

  const recList = recommendations.recommendations;

  // 1. Explicit Ordinal Matching ("the second one", "option 2", "number 2", "the 1st mouse")
  for (const { pattern, index } of ORDINAL_PATTERNS) {
    if (pattern.test(text)) {
      if (index >= 0 && index < recList.length) {
        const pId = recList[index].productId;
        const product = CatalogService.getProductById(pId);
        return { resolvedProductId: pId, resolvedIndex: index, product, resolutionType: 'ORDINAL' };
      }
      // If ordinal index exceeds recommendation list length, return null explicitly
      return { resolvedProductId: null, resolvedIndex: null, product: null, resolutionType: 'UNKNOWN' };
    }
  }

  // 2. Cheapest / Price Reference ("the cheapest one", "cheaper one")
  if (text.includes('cheapest') || text.includes('cheaper')) {
    let lowestIdx = 0;
    let lowestPrice = Infinity;

    recList.forEach((r, idx) => {
      const p = CatalogService.getProductById(r.productId);
      if (p && p.pricePaise < lowestPrice) {
        lowestPrice = p.pricePaise;
        lowestIdx = idx;
      }
    });

    const pId = recList[lowestIdx].productId;
    const product = CatalogService.getProductById(pId);
    return { resolvedProductId: pId, resolvedIndex: lowestIdx, product, resolutionType: 'CHEAPEST' };
  }

  // 3. Generic Relative References ("that one", "this one", "that product", "it")
  if (
    text.includes('that one') ||
    text.includes('this one') ||
    text.includes('that product') ||
    text.includes('that mouse') ||
    text.includes('it')
  ) {
    if (recList.length === 1) {
      const pId = recList[0].productId;
      const product = CatalogService.getProductById(pId);
      return { resolvedProductId: pId, resolvedIndex: 0, product, resolutionType: 'RELATIVE' };
    }
    if (currentlySelectedProduct) {
      return {
        resolvedProductId: currentlySelectedProduct.id,
        resolvedIndex: null,
        product: currentlySelectedProduct,
        resolutionType: 'RELATIVE',
      };
    }
  }

  return { resolvedProductId: null, resolvedIndex: null, product: null, resolutionType: 'UNKNOWN' };
}

/**
 * Pure helper to classify user utterance type for multi-turn routing.
 */
export type UtteranceType =
  | 'AUTHORIZATION_ATTEMPT'
  | 'PRODUCT_SELECTION'
  | 'PRODUCT_QUESTION'
  | 'ATTRIBUTE_INQUIRY'
  | 'PRICE_REFINEMENT'
  | 'GENERAL_SHOPPING_SEARCH';

export function classifyUtterance(utterance: string): UtteranceType {
  const text = utterance.toLowerCase().trim();

  // Financial authorization attempts (voice MUST NOT execute these)
  if (
    text.includes('approve') ||
    text.includes('pay for it') ||
    text.includes('pay now') ||
    text.includes('authorize') ||
    (text.includes('buy it') && !text.includes('second') && !text.includes('first') && !text.includes('option')) ||
    (text.includes('purchase it') && !text.includes('second') && !text.includes('first'))
  ) {
    return 'AUTHORIZATION_ATTEMPT';
  }

  // Product selection commands ("I'll take the second one", "Buy the second mouse", "Select option 2")
  if (
    text.includes("i'll take") ||
    text.includes('ill take') ||
    text.includes('i want') ||
    text.includes('select') ||
    text.includes('buy the') ||
    text.includes('get the') ||
    text.includes('choose')
  ) {
    return 'PRODUCT_SELECTION';
  }

  // Price refinement ("Show me something cheaper", "Find something cheaper")
  if (text.includes('cheaper') || text.includes('less expensive') || text.includes('lower price')) {
    return 'PRICE_REFINEMENT';
  }

  // Product questions / info ("What's the second one?", "Tell me about option 2")
  if (text.startsWith('what is') || text.startsWith("what's") || text.includes('tell me about') || text.includes('describe')) {
    return 'PRODUCT_QUESTION';
  }

  // Attribute inquiry ("Is it wireless?", "How much is it?", "Is it in stock?", "Does it have bluetooth?", "What material is it?")
  if (
    text.includes('is it') ||
    text.includes('how much') ||
    text.includes('in stock') ||
    text.includes('what material') ||
    text.includes('does it have') ||
    text.includes('wireless')
  ) {
    return 'ATTRIBUTE_INQUIRY';
  }

  return 'GENERAL_SHOPPING_SEARCH';
}
