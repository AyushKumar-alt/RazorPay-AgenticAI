import { NextRequest, NextResponse } from 'next/server';
import { PurchaseService } from '@/lib/purchase/purchase.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = await PurchaseService.createPurchaseProposal(body);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to create purchase proposal.',
        },
      },
      { status: 500 }
    );
  }
}
