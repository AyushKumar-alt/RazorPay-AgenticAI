import { CatalogService } from '@/lib/catalog/catalog.service';
import {
  CheckInventoryInputSchema,
  CheckInventoryOutput,
} from './catalog-tool.types';

export async function checkInventory(rawInput: unknown): Promise<CheckInventoryOutput> {
  const parseResult = CheckInventoryInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid checkInventory input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const { productId } = parseResult.data;
  const result = CatalogService.checkInventory(productId);

  if (!result.product) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found for inventory check.`,
      },
    };
  }

  return {
    success: true,
    productId,
    stock: result.stock,
    inStock: result.available,
  };
}
