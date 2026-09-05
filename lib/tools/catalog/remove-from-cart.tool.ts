import { removeFromCart } from '@/lib/cart/cart.service';
import {
  RemoveFromCartInputSchema,
  RemoveFromCartOutput,
} from './catalog-tool.types';

export async function executeRemoveFromCart(rawInput: unknown): Promise<RemoveFromCartOutput> {
  const parseResult = RemoveFromCartInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid removeFromCart input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const { productId } = parseResult.data;

  try {
    const updatedCart = removeFromCart(productId);
    return {
      success: true,
      productId,
      cart: updatedCart,
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to remove item from cart.',
      },
    };
  }
}
