import { z } from 'zod';
import { Product } from '@/types/catalog';
import { Cart } from '@/lib/cart/cart.service';
import { PurchaseProposal } from '@/types/purchase';

export type CatalogToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'PRODUCT_NOT_FOUND'
  | 'MERCHANT_NOT_FOUND'
  | 'UNKNOWN_TOOL'
  | 'INTERNAL_ERROR';

export interface CatalogToolError {
  code: CatalogToolErrorCode;
  message: string;
}

export interface CatalogToolErrorResponse {
  success: false;
  error: CatalogToolError;
}

// --- TOOL 1: searchCatalog ---
export const SearchCatalogInputSchema = z.object({
  merchantId: z.string().optional(),
  category: z.string().optional(),
  maxPricePaise: z.number().int().nonnegative().optional(),
  minPricePaise: z.number().int().nonnegative().optional(),
  capacity: z.string().optional(),
  material: z.string().optional(),
  color: z.string().optional(),
  insulation: z.boolean().optional(),
  inStock: z.boolean().optional(),
  search: z.string().optional(),
});

export type SearchCatalogInput = z.infer<typeof SearchCatalogInputSchema>;

export interface SearchCatalogSuccessOutput {
  success: true;
  count: number;
  products: Product[];
}

export type SearchCatalogOutput = SearchCatalogSuccessOutput | CatalogToolErrorResponse;

// --- TOOL 2: getProduct ---
export const GetProductInputSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
});

export type GetProductInput = z.infer<typeof GetProductInputSchema>;

export interface GetProductSuccessOutput {
  success: true;
  product: Product;
}

export type GetProductOutput = GetProductSuccessOutput | CatalogToolErrorResponse;

// --- TOOL 3: checkInventory ---
export const CheckInventoryInputSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
});

export type CheckInventoryInput = z.infer<typeof CheckInventoryInputSchema>;

export interface CheckInventorySuccessOutput {
  success: true;
  productId: string;
  stock: number;
  inStock: boolean;
}

export type CheckInventoryOutput = CheckInventorySuccessOutput | CatalogToolErrorResponse;

// --- TOOL 4: getPrice ---
export const GetPriceInputSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
});

export type GetPriceInput = z.infer<typeof GetPriceInputSchema>;

export interface GetPriceSuccessOutput {
  success: true;
  productId: string;
  pricePaise: number;
  currency: string;
}

export type GetPriceOutput = GetPriceSuccessOutput | CatalogToolErrorResponse;

// --- TOOL 5: recommendRelatedProducts ---
export const RecommendRelatedProductsInputSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
});

export type RecommendRelatedProductsInput = z.infer<typeof RecommendRelatedProductsInputSchema>;

export interface RecommendRelatedProductsSuccessOutput {
  success: true;
  sourceProductId: string;
  recommendedProduct: Product;
  reason: string;
}

export type RecommendRelatedProductsOutput =
  | RecommendRelatedProductsSuccessOutput
  | CatalogToolErrorResponse;

// --- TOOL 6: addToCart ---
export const AddToCartInputSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.number().int().positive().optional().default(1),
});

export type AddToCartInput = z.infer<typeof AddToCartInputSchema>;

export interface AddToCartSuccessOutput {
  success: true;
  productId: string;
  quantityAdded: number;
  cart: Cart;
}

export type AddToCartOutput = AddToCartSuccessOutput | CatalogToolErrorResponse;

// --- TOOL 7: removeFromCart ---
export const RemoveFromCartInputSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
});

export type RemoveFromCartInput = z.infer<typeof RemoveFromCartInputSchema>;

export interface RemoveFromCartSuccessOutput {
  success: true;
  productId: string;
  cart: Cart;
}

export type RemoveFromCartOutput = RemoveFromCartSuccessOutput | CatalogToolErrorResponse;

// --- TOOL 8: updateCartQuantity ---
export const UpdateCartQuantityInputSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.number().int(),
});

export type UpdateCartQuantityInput = z.infer<typeof UpdateCartQuantityInputSchema>;

export interface UpdateCartQuantitySuccessOutput {
  success: true;
  productId: string;
  newQuantity: number;
  cart: Cart;
}

export type UpdateCartQuantityOutput = UpdateCartQuantitySuccessOutput | CatalogToolErrorResponse;

// --- TOOL 9: getCart ---
export const GetCartInputSchema = z.object({});

export type GetCartInput = z.infer<typeof GetCartInputSchema>;

export interface GetCartSuccessOutput {
  success: true;
  cart: Cart;
}

export type GetCartOutput = GetCartSuccessOutput | CatalogToolErrorResponse;

// --- TOOL 10: checkoutCart ---
export const CheckoutCartInputSchema = z.object({
  merchantId: z.string().optional().default('merchant_aquamart'),
});

export type CheckoutCartInput = z.infer<typeof CheckoutCartInputSchema>;

export interface CheckoutCartSuccessOutput {
  success: true;
  proposal: PurchaseProposal;
}

export type CheckoutCartOutput = CheckoutCartSuccessOutput | CatalogToolErrorResponse;

// --- REGISTRY TYPING ---
export type CatalogToolName =
  | 'searchCatalog'
  | 'getProduct'
  | 'checkInventory'
  | 'getPrice'
  | 'recommendRelatedProducts'
  | 'addToCart'
  | 'removeFromCart'
  | 'updateCartQuantity'
  | 'getCart'
  | 'checkoutCart';



