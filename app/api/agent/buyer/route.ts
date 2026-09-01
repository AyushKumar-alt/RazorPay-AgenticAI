import { NextRequest, NextResponse } from 'next/server';
import { BuyerAgent } from '@/lib/agent/buyer/buyer.agent';
import { PurchaseIntentSchema } from '@/lib/intent/intent.schema';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || !body.intent) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body must contain a valid "intent" object.',
          },
        },
        { status: 400 }
      );
    }

    // Server-side validation of incoming PurchaseIntent
    const parseIntentResult = PurchaseIntentSchema.safeParse(body.intent);
    if (!parseIntentResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid PurchaseIntent: ${parseIntentResult.error.issues.map((i) => i.message).join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    const agent = new BuyerAgent();
    const result = await agent.run({
      intent: parseIntentResult.data,
      userMessage: typeof body.userMessage === 'string' ? body.userMessage : undefined,
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
          code: 'TOOL_EXECUTION_ERROR',
          message: err.message || 'An unexpected error occurred in buyer agent API endpoint.',
        },
      },
      { status: 500 }
    );
  }
}
