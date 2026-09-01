import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/lib/catalog/catalog.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Product ID is required' },
      { status: 400 }
    );
  }

  const product = CatalogService.getProductById(id);

  if (!product) {
    return NextResponse.json(
      { success: false, error: `Product with ID '${id}' not found` },
      { status: 404 }
    );
  }

  const inventory = CatalogService.checkInventory(id);

  return NextResponse.json({
    success: true,
    product,
    inventory: {
      inStock: inventory.available,
      stock: inventory.stock,
    },
  });
}
