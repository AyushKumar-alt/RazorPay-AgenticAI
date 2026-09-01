import { NextRequest, NextResponse } from 'next/server';
import { RazorpayService } from '@/lib/payment/razorpay.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'razorpayOrderId, razorpayPaymentId, and razorpaySignature are required.',
          },
        },
        { status: 400 }
      );
    }

    const result = await RazorpayService.verifyPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

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
          message: err.message || 'Failed to verify payment.',
        },
      },
      { status: 500 }
    );
  }
}
