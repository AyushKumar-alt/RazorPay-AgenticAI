import { Merchant, Product, ProductFilter } from '@/types/catalog';
import { DEMO_MERCHANT, SEED_PRODUCTS } from './catalog.data';

export class CatalogService {
  private static merchant: Merchant = DEMO_MERCHANT;
  private static products: Product[] = SEED_PRODUCTS;

  /**
   * Retrieve merchant details.
   */
  public static getMerchant(merchantId?: string): Merchant | null {
    if (merchantId && merchantId !== this.merchant.id) {
      return null;
    }
    return this.merchant;
  }

  /**
   * Retrieve all active products in the catalog.
   */
  public static getAllProducts(): Product[] {
    return this.products.filter((p) => p.active);
  }

  /**
   * Retrieve a single product by unique ID.
   */
  public static getProductById(productId: string): Product | null {
    const product = this.products.find((p) => p.id === productId);
    if (!product || !product.active) {
      return null;
    }
    return product;
  }

  /**
   * Deterministic & RAG-enhanced relevance search over catalog products.
   * Ranks matching products by keyword relevance, token match, and category alignment.
   */
  public static searchProducts(filters: ProductFilter = {}): Product[] {
    const rawSearch = (filters.search || '').trim().toLowerCase();

    const STOP_WORDS = new Set([
      'do', 'you', 'u', 'have', 'is', 'are', 'was', 'were', 'there', 'here', 'any', 'some', 'sell',
      'carry', 'i', 'want', 'to', 'buy', 'need', 'a', 'an', 'the', 'can', 'get', 'show', 'me',
      'looking', 'for', 'search', 'find', 'in', 'catalog', 'stock', 'also', 'too', 'please', 'thanks',
      'thank', 'ordering', 'it', 'its', 'they', 'that', 'this', 'work', 'home', 'travel', 'gym',
      'item', 'items', 'product', 'products', 'one', 'ones'
    ]);

    // 1. Initial Filtering (merchantId, category, price bounds, inStock, attributes)
    let candidates = this.products.filter((product) => {
      if (!product.active) return false;

      if (filters.merchantId && product.merchantId !== filters.merchantId) return false;

      if (filters.category) {
        const target = filters.category.toLowerCase().trim();
        const prodCat = product.category.toLowerCase().trim();

        const isCategoryMatch =
          prodCat === target ||
          (target === 'electronics_accessories' && prodCat === 'electronics') ||
          (target === 'electronics' && prodCat === 'electronics_accessories') ||
          (target === 'water_bottle' && prodCat === 'lifestyle') ||
          (target === 'lifestyle' && prodCat === 'water_bottle') ||
          (target === 'office_study' && prodCat === 'office') ||
          (target === 'home_kitchen' && prodCat === 'home') ||
          (target === 'personal_care' && prodCat === 'care');

        if (!isCategoryMatch) return false;
      }

      if (filters.maxPricePaise !== undefined && product.pricePaise > filters.maxPricePaise) return false;
      if (filters.minPricePaise !== undefined && product.pricePaise < filters.minPricePaise) return false;
      if (filters.inStock === true && product.stock <= 0) return false;

      if (filters.attributes && Object.keys(filters.attributes).length > 0) {
        for (const [attrKey, attrVal] of Object.entries(filters.attributes)) {
          const productAttrVal = product.attributes[attrKey];
          if (productAttrVal === undefined) return false;
          if (String(productAttrVal).toLowerCase().trim() !== String(attrVal).toLowerCase().trim()) return false;
        }
      }

      return true;
    });

    if (!rawSearch) {
      return candidates;
    }

    // 2. Extract cleaned query & tokens for RAG scoring
    const cleanedQuery = rawSearch
      .split(/\s+/)
      .filter((w) => !STOP_WORDS.has(w))
      .join(' ');

    const tokens = (cleanedQuery.length > 0 ? cleanedQuery : rawSearch)
      .split(/\s+/)
      .filter((w) => !STOP_WORDS.has(w) && w.length >= 2);

    // Singular/plural variants of tokens
    const tokenVariants: string[] = [];
    tokens.forEach((t) => {
      tokenVariants.push(t);
      if (t.endsWith('s') && t.length > 3) tokenVariants.push(t.slice(0, -1));
      else if (t.length > 2) tokenVariants.push(t + 's');
    });

    // 3. Relevance Scoring Function
    const scoredProducts: { product: Product; score: number }[] = [];

    for (const product of candidates) {
      let score = 0;
      const nameLower = product.name.toLowerCase();
      const descLower = product.description.toLowerCase();
      const catLower = product.category.toLowerCase();
      const attrStr = JSON.stringify(product.attributes).toLowerCase();

      // Exact substring match (full raw or cleaned query)
      if (cleanedQuery.length > 0 && nameLower.includes(cleanedQuery)) score += 100;
      else if (rawSearch.length > 0 && nameLower.includes(rawSearch)) score += 80;

      if (cleanedQuery.length > 0 && descLower.includes(cleanedQuery)) score += 40;
      if (cleanedQuery.length > 0 && catLower.includes(cleanedQuery)) score += 50;

      // Token level match
      for (const tok of tokenVariants) {
        if (!tok) continue;
        if (nameLower.includes(tok)) score += 45;
        if (catLower.includes(tok)) score += 35;
        if (descLower.includes(tok)) score += 15;
        if (attrStr.includes(tok)) score += 10;
      }

      if (score > 0) {
        scoredProducts.push({ product, score });
      }
    }

    // Sort products by relevance score descending
    scoredProducts.sort((a, b) => b.score - a.score);

    return scoredProducts.map((sp) => sp.product);
  }

  /**
   * Check live stock availability for a product.
   */
  public static checkInventory(productId: string): {
    available: boolean;
    stock: number;
    product: Product | null;
  } {
    const product = this.getProductById(productId);
    if (!product) {
      return { available: false, stock: 0, product: null };
    }
    return {
      available: product.stock > 0,
      stock: product.stock,
      product,
    };
  }

  /**
   * Retrieve authoritative price for a product.
   */
  public static getCurrentPrice(productId: string): {
    pricePaise: number;
    currency: string;
    active: boolean;
  } | null {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return null;
    return {
      pricePaise: product.pricePaise,
      currency: product.currency,
      active: product.active,
    };
  }
}
