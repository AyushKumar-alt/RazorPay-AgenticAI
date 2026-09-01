import { NextRequest, NextResponse } from 'next/server';
import { ApprovalService } from '@/lib/purchase/approval.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Proposal ID is required.',
          },
        },
        { status: 400 }
      );
    }

    const result = await ApprovalService.approveProposal(id);
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
          message: err.message || 'Failed to approve proposal.',
        },
      },
      { status: 500 }
    );
  }
}
