import {
  CatalogToolName,
  CatalogToolErrorResponse,
  SearchCatalogOutput,
  GetProductOutput,
  CheckInventoryOutput,
  GetPriceOutput,
  RecommendRelatedProductsOutput,
  AddToCartOutput,
  RemoveFromCartOutput,
  UpdateCartQuantityOutput,
  GetCartOutput,
  CheckoutCartOutput,
} from './catalog-tool.types';
import { searchCatalog } from './search-catalog.tool';
import { getProduct } from './get-product.tool';
import { checkInventory } from './check-inventory.tool';
import { getPrice } from './get-price.tool';
import { recommendRelatedProducts } from './recommend-related-products.tool';
import { executeAddToCart } from './add-to-cart.tool';
import { executeRemoveFromCart } from './remove-from-cart.tool';
import { executeUpdateCartQuantity } from './update-cart-quantity.tool';
import { executeGetCart } from './get-cart.tool';
import { executeCheckoutCart } from './checkout-cart.tool';

export const catalogTools = {
  searchCatalog,
  getProduct,
  checkInventory,
  getPrice,
  recommendRelatedProducts,
  addToCart: executeAddToCart,
  removeFromCart: executeRemoveFromCart,
  updateCartQuantity: executeUpdateCartQuantity,
  getCart: executeGetCart,
  checkoutCart: executeCheckoutCart,
};

export async function executeCatalogTool(
  toolName: CatalogToolName | string,
  input: unknown
): Promise<
  | SearchCatalogOutput
  | GetProductOutput
  | CheckInventoryOutput
  | GetPriceOutput
  | RecommendRelatedProductsOutput
  | AddToCartOutput
  | RemoveFromCartOutput
  | UpdateCartQuantityOutput
  | GetCartOutput
  | CheckoutCartOutput
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
    case 'recommendRelatedProducts':
      return recommendRelatedProducts(input);
    case 'addToCart':
      return executeAddToCart(input);
    case 'removeFromCart':
      return executeRemoveFromCart(input);
    case 'updateCartQuantity':
      return executeUpdateCartQuantity(input);
    case 'getCart':
      return executeGetCart(input);
    case 'checkoutCart':
      return executeCheckoutCart(input);
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



