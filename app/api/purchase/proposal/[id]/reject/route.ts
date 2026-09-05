import { NextRequest, NextResponse } from 'next/server';
import { ApprovalService } from '@/lib/purchase/approval.service';
import { PurchaseService } from '@/lib/purchase/purchase.service';

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

    const result = await ApprovalService.rejectProposal(id);
    if (!result.success) {
      if (result.error?.code === 'INVALID_PROPOSAL_STATUS') {
        const proposal = PurchaseService.getProposal(id);
        if (proposal && proposal.status === 'REJECTED') {
          return NextResponse.json({
            success: true,
            proposal,
            message: 'Proposal is already rejected.',
          });
        }
      }

      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to reject proposal.',
        },
      },
      { status: 500 }
    );
  }
}
