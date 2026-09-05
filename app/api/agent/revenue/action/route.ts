import { NextRequest, NextResponse } from 'next/server';
import { RevenueActionTool } from '@/lib/agent/revenue/revenue.action-tool';
import { RevenueOpportunity } from '@/types/revenue';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { opportunity, context } = body;

    if (!opportunity || !opportunity.id || !opportunity.type) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'A valid RevenueOpportunity object is required.',
          },
        },
        { status: 400 }
      );
    }

    // Execute revenue action via bounded action tool
    const result = await RevenueActionTool.executeRevenueAction({
      opportunity: opportunity as RevenueOpportunity,
      context,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to execute revenue action.',
        },
      },
      { status: 500 }
    );
  }
}
