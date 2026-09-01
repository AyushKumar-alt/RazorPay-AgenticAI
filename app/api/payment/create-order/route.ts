import { NextRequest, NextResponse } from 'next/server';
import { RazorpayService } from '@/lib/payment/razorpay.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { proposalId } = body;
    if (!proposalId || typeof proposalId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'proposalId is required as a non-empty string.',
          },
        },
        { status: 400 }
      );
    }

    // Ignore client-supplied price or amount overrides
    const result = await RazorpayService.createPaymentOrder(proposalId);
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
          message: err.message || 'Failed to create payment order.',
        },
      },
      { status: 500 }
    );
  }
}
