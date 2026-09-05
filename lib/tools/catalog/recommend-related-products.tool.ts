import { CatalogService } from '@/lib/catalog/catalog.service';
import { findPairForProduct, resolvePairPartnerId } from '@/lib/catalog/product-pairs';
import {
  RecommendRelatedProductsInputSchema,
  RecommendRelatedProductsOutput,
} from './catalog-tool.types';

export async function recommendRelatedProducts(rawInput: unknown): Promise<RecommendRelatedProductsOutput> {
  const parseResult = RecommendRelatedProductsInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid recommendRelatedProducts input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const { productId } = parseResult.data;

  const sourceProduct = CatalogService.getProductById(productId);
  if (!sourceProduct) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: `Source product with ID '${productId}' was not found in catalog.`,
      },
    };
  }

  const partnerId = resolvePairPartnerId(productId);
  const pair = findPairForProduct(productId);

  if (!partnerId || !pair) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: `No related product recommendation found for product ID '${productId}'.`,
      },
    };
  }

  const recommendedProduct = CatalogService.getProductById(partnerId);
  if (!recommendedProduct) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: `Recommended partner product with ID '${partnerId}' was not found in catalog.`,
      },
    };
  }

  return {
    success: true,
    sourceProductId: productId,
    recommendedProduct,
    reason: pair.reason,
  };
}
