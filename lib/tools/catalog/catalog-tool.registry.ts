import {
  CatalogToolName,
  CatalogToolErrorResponse,
  SearchCatalogOutput,
  GetProductOutput,
  CheckInventoryOutput,
  GetPriceOutput,
} from './catalog-tool.types';
import { searchCatalog } from './search-catalog.tool';
import { getProduct } from './get-product.tool';
import { checkInventory } from './check-inventory.tool';
import { getPrice } from './get-price.tool';

export const catalogTools = {
  searchCatalog,
  getProduct,
  checkInventory,
  getPrice,
};

export async function executeCatalogTool(
  toolName: CatalogToolName | string,
  input: unknown
): Promise<
  | SearchCatalogOutput
  | GetProductOutput
  | CheckInventoryOutput
  | GetPriceOutput
  | CatalogToolErrorResponse
> {
  switch (toolName) {
    case 'searchCatalog':
      return searchCatalog(input);
    case 'getProduct':
      return getProduct(input);
    case 'checkInventory':
      return checkInventory(input);
    case 'getPrice':
      return getPrice(input);
    default:
      return {
        success: false,
        error: {
          code: 'UNKNOWN_TOOL',
          message: `Unsupported catalog tool '${toolName}'.`,
        },
      };
  }
}
