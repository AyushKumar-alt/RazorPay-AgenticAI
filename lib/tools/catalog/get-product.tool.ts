import { CatalogService } from '@/lib/catalog/catalog.service';
import {
  GetProductInputSchema,
  GetProductOutput,
} from './catalog-tool.types';

export async function getProduct(rawInput: unknown): Promise<GetProductOutput> {
  const parseResult = GetProductInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid getProduct input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const { productId } = parseResult.data;
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

  return {
    success: true,
    product,
  };
}
