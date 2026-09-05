import { addToCart } from '@/lib/cart/cart.service';
import { CatalogService } from '@/lib/catalog/catalog.service';
import {
  AddToCartInputSchema,
  AddToCartOutput,
} from './catalog-tool.types';

export async function executeAddToCart(rawInput: unknown): Promise<AddToCartOutput> {
  const parseResult = AddToCartInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid addToCart input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const { productId, quantity } = parseResult.data;

  // Verify product exists in catalog
  const product = CatalogService.getProductById(productId);
  if (!product) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found in catalog.`,
      },
    };
  }

  try {
    const updatedCart = addToCart(productId, quantity);
    return {
      success: true,
      productId,
      quantityAdded: quantity,
      cart: updatedCart,
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to add item to cart.',
      },
    };
  }
}
