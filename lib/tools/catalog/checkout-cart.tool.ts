import { CartService } from '@/lib/cart/cart.service';
import {
  CheckoutCartInputSchema,
  CheckoutCartOutput,
} from './catalog-tool.types';

export async function executeCheckoutCart(rawInput: unknown): Promise<CheckoutCartOutput> {
  const parseResult = CheckoutCartInputSchema.safeParse(rawInput || {});
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid checkoutCart input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const merchantId = parseResult.data.merchantId || 'merchant_aquamart';

  try {
    const proposal = await CartService.checkoutCart(merchantId);
    return {
      success: true,
      proposal,
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to execute cart checkout.',
      },
    };
  }
}
