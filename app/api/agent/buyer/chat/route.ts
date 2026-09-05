import { NextRequest, NextResponse } from 'next/server';
import { ChatShoppingService } from '@/lib/agent/buyer/chat-shopping.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body must contain a non-empty "message" string.',
          },
        },
        { status: 400 }
      );
    }

    const result = await ChatShoppingService.processTurn({
      message: body.message,
      history: Array.isArray(body.history) ? body.history : [],
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'An unexpected error occurred in chat shopping endpoint.',
        },
      },
      { status: 500 }
    );
  }
}

