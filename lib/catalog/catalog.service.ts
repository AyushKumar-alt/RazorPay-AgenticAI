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
   * Deterministic search and filtering over catalog products.
   * Uses exact unit price bounds (in integer paise) and simple text matching.
   */
  public static searchProducts(filters: ProductFilter = {}): Product[] {
    return this.products.filter((product) => {
      if (!product.active) return false;

      // Filter by Merchant ID if specified
      if (filters.merchantId && product.merchantId !== filters.merchantId) {
        return false;
      }

      // Filter by Category
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

        if (!isCategoryMatch) {
          return false;
        }
      }

      // Filter by Price Bounds (in integer paise)
      if (filters.maxPricePaise !== undefined && product.pricePaise > filters.maxPricePaise) {
        return false;
      }
      if (filters.minPricePaise !== undefined && product.pricePaise < filters.minPricePaise) {
        return false;
      }

      // Filter by Stock Availability
      if (filters.inStock === true && product.stock <= 0) {
        return false;
      }

      // Filter by Attributes (e.g. capacity=1L, material=stainless_steel)
      if (filters.attributes && Object.keys(filters.attributes).length > 0) {
        for (const [attrKey, attrVal] of Object.entries(filters.attributes)) {
          const productAttrVal = product.attributes[attrKey];
          if (productAttrVal === undefined) return false;
          if (
            String(productAttrVal).toLowerCase().trim() !==
            String(attrVal).toLowerCase().trim()
          ) {
            return false;
          }
        }
      }

      // Deterministic Substring Search against name, description, category
      if (filters.search && filters.search.trim() !== '') {
        const query = filters.search.toLowerCase().trim();
        const matchesName = product.name.toLowerCase().includes(query);
        const matchesDesc = product.description.toLowerCase().includes(query);
        const matchesCat = product.category.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesCat) {
          return false;
        }
      }

      return true;
    });
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
