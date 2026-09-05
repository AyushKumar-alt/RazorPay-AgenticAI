import { getCart } from '@/lib/cart/cart.service';
import {
  GetCartInputSchema,
  GetCartOutput,
} from './catalog-tool.types';

export async function executeGetCart(rawInput: unknown): Promise<GetCartOutput> {
  const parseResult = GetCartInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid getCart input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  try {
    const currentCart = getCart();
    return {
      success: true,
      cart: currentCart,
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to retrieve cart state.',
      },
    };
  }
}
