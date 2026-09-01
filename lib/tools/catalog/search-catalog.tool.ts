import { CatalogService } from '@/lib/catalog/catalog.service';
import { ProductFilter } from '@/types/catalog';
import {
  SearchCatalogInputSchema,
  SearchCatalogOutput,
} from './catalog-tool.types';

export async function searchCatalog(rawInput: unknown): Promise<SearchCatalogOutput> {
  const parseResult = SearchCatalogInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid searchCatalog input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      },
    };
  }

  const input = parseResult.data;

  // Build structured ProductFilter for CatalogService
  const attributes: Record<string, string> = {};
  if (input.capacity) attributes.capacity = input.capacity;
  if (input.material) attributes.material = input.material;
  if (input.color) attributes.color = input.color;
  if (input.insulation !== undefined) attributes.insulation = String(input.insulation);

  const filter: ProductFilter = {
    merchantId: input.merchantId,
    category: input.category,
    maxPricePaise: input.maxPricePaise,
    minPricePaise: input.minPricePaise,
    inStock: input.inStock,
    search: input.search,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
  };

  const products = CatalogService.searchProducts(filter);

  return {
    success: true,
    count: products.length,
    products,
  };
}
