import { updateCartQuantity } from '@/lib/cart/cart.service';
import {
  UpdateCartQuantityInputSchema,
  UpdateCartQuantityOutput,
} from './catalog-tool.types';

export async function executeUpdateCartQuantity(rawInput: unknown): Promise<UpdateCartQuantityOutput> {
  const parseResult = UpdateCartQuantityInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid updateCartQuantity input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const { productId, quantity } = parseResult.data;

  try {
    const updatedCart = updateCartQuantity(productId, quantity);
    return {
      success: true,
      productId,
      newQuantity: quantity,
      cart: updatedCart,
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to update cart quantity.',
      },
    };
  }
}
