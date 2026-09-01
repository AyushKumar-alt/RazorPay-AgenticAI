import { NextRequest, NextResponse } from 'next/server';
import { IntentService } from '@/lib/intent/intent.service';
import { ParseIntentRequest } from '@/types/intent';

export async function POST(request: NextRequest) {
  try {
    const body: ParseIntentRequest = await request.json();

    if (!body || typeof body.message !== 'string' || body.message.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: 'A valid non-empty "message" string is required.',
        },
        { status: 400 }
      );
    }

    const service = new IntentService();
    const intent = await service.parseIntent(body.message, body.previousIntent);

    return NextResponse.json({
      success: true,
      intent,
    });
  } catch (err: any) {
    const errorMessage =
      err instanceof Error ? err.message : 'An error occurred while parsing intent.';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 400 }
    );
  }
}
