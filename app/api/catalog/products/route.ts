import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { ProductFilter } from '@/types/catalog';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const category = searchParams.get('category') || undefined;
  const maxPricePaiseRaw = searchParams.get('maxPricePaise');
  const minPricePaiseRaw = searchParams.get('minPricePaise');
  const inStockRaw = searchParams.get('inStock');
  const merchantId = searchParams.get('merchantId') || undefined;
  const search = searchParams.get('search') || undefined;

  // Extract custom attribute filters (e.g. capacity, material)
  const capacity = searchParams.get('capacity') || undefined;
  const material = searchParams.get('material') || undefined;

  const attributes: Record<string, string> = {};
  if (capacity) attributes.capacity = capacity;
  if (material) attributes.material = material;

  const maxPricePaise = maxPricePaiseRaw ? parseInt(maxPricePaiseRaw, 10) : undefined;
  const minPricePaise = minPricePaiseRaw ? parseInt(minPricePaiseRaw, 10) : undefined;
  const inStock = inStockRaw !== null ? inStockRaw === 'true' : undefined;

  const filters: ProductFilter = {
    category,
    maxPricePaise: maxPricePaise !== undefined && !isNaN(maxPricePaise) ? maxPricePaise : undefined,
    minPricePaise: minPricePaise !== undefined && !isNaN(minPricePaise) ? minPricePaise : undefined,
    inStock,
    merchantId,
    search,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
  };

  const merchant = CatalogService.getMerchant(merchantId);
  const products = CatalogService.searchProducts(filters);

  return NextResponse.json({
    success: true,
    merchant: merchant ? { id: merchant.id, name: merchant.name, currency: merchant.currency } : null,
    total: products.length,
    filtersApplied: filters,
    products,
  });
}
