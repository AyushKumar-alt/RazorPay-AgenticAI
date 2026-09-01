import { z } from 'zod';
import { Product } from '@/types/catalog';

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

// --- REGISTRY TYPING ---
export type CatalogToolName =
  | 'searchCatalog'
  | 'getProduct'
  | 'checkInventory'
  | 'getPrice';
