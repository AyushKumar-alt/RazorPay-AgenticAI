import { CatalogService } from '@/lib/catalog/catalog.service';
import { PurchaseService } from '@/lib/purchase/purchase.service';

export interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
}

export interface Cart {
  items: CartItem[];
  subtotalPaise: number;
}

export class CartService {
  // Authoritative in-memory cart store (productId -> quantity)
  private static cartItems = new Map<string, number>();

  /**
   * Add a product to the cart.
   * All prices are read strictly from catalog.data.ts via CatalogService.
   * Any caller-supplied prices are strictly ignored.
   */
  public static addToCart(productId: string, quantity: number = 1): Cart {
    if (quantity <= 0) {
      return this.getCart();
    }

    const product = CatalogService.getProductById(productId);
    if (!product) {
      throw new Error(`Product '${productId}' not found in catalog.data.ts.`);
    }

    const existingQty = this.cartItems.get(productId) || 0;
    this.cartItems.set(productId, existingQty + quantity);

    return this.getCart();
  }

  /**
   * Remove a product from the cart.
   */
  public static removeFromCart(productId: string): Cart {
    this.cartItems.delete(productId);
    return this.getCart();
  }

  /**
   * Update the quantity of a product in the cart.
   * quantity <= 0 removes the item.
   */
  public static updateCartQuantity(productId: string, quantity: number): Cart {
    if (quantity <= 0) {
      return this.removeFromCart(productId);
    }

    const product = CatalogService.getProductById(productId);
    if (!product) {
      throw new Error(`Product '${productId}' not found in catalog.data.ts.`);
    }

    this.cartItems.set(productId, quantity);
    return this.getCart();
  }

  /**
   * Retrieve current cart state.
   * subtotalPaise is ALWAYS computed fresh from current items and catalog.data.ts prices.
   * Never cached or stale.
   */
  public static getCart(): Cart {
    const items: CartItem[] = [];
    let subtotalPaise = 0;

    for (const [productId, quantity] of this.cartItems.entries()) {
      const product = CatalogService.getProductById(productId);
      if (product && quantity > 0) {
        const itemSubtotal = product.pricePaise * quantity;
        items.push({
          productId: product.id,
          productName: product.name,
          quantity,
          unitPricePaise: product.pricePaise, // Always read from catalog.data.ts
          subtotalPaise: itemSubtotal,
        });
        subtotalPaise += itemSubtotal;
      }
    }

    return {
      items,
      subtotalPaise,
    };
  }

  /**
   * Create an authoritative PurchaseProposal from current cart items for checkout flow.
   */
  public static async checkoutCart(merchantId: string = 'merchant_aquamart') {
    const cart = this.getCart();
    if (cart.items.length === 0) {
      throw new Error('Cart is empty.');
    }

    const res = await PurchaseService.createPurchaseProposal({
      merchantId,
      items: cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    if (!res.success) {
      throw new Error(res.error.message);
    }

    return res.proposal;
  }

  /**
   * Reset store (used for test teardown).
   */
  public static clearCart(): void {
    this.cartItems.clear();
  }
}

// Standalone function exports matching requirements
export const addToCart = (productId: string, quantity: number = 1) =>
  CartService.addToCart(productId, quantity);

export const removeFromCart = (productId: string) =>
  CartService.removeFromCart(productId);

export const updateCartQuantity = (productId: string, quantity: number) =>
  CartService.updateCartQuantity(productId, quantity);

export const getCart = () => CartService.getCart();

export const clearCart = () => CartService.clearCart();
