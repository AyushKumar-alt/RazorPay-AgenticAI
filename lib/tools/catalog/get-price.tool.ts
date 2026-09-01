import { CatalogService } from '@/lib/catalog/catalog.service';
import {
  GetPriceInputSchema,
  GetPriceOutput,
} from './catalog-tool.types';

export async function getPrice(rawInput: unknown): Promise<GetPriceOutput> {
  const parseResult = GetPriceInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid getPrice input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const { productId } = parseResult.data;
  const priceInfo = CatalogService.getCurrentPrice(productId);

  if (!priceInfo || !priceInfo.active) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found or is inactive.`,
      },
    };
  }

  return {
    success: true,
    productId,
    pricePaise: priceInfo.pricePaise,
    currency: priceInfo.currency,
  };
}
