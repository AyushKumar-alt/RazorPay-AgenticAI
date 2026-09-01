import { PurchaseService } from './purchase.service';
import { AuditService } from '@/lib/audit/audit.service';
import { ProposalActionResponse } from '@/types/purchase';

export class ApprovalService {
  /**
   * Explicit Human Approval Gate.
   * Transitions status from PENDING_APPROVAL -> APPROVED.
   * Strictly read-only: Executing approval does NOT call payment or mutate inventory.
   */
  public static async approveProposal(proposalId: string): Promise<ProposalActionResponse> {
    const proposal = PurchaseService.getProposal(proposalId);

    if (!proposal) {
      return {
        success: false,
        error: {
          code: 'PROPOSAL_NOT_FOUND',
          message: `Purchase proposal '${proposalId}' was not found.`,
        },
      };
    }

    if (proposal.status === 'EXPIRED') {
      return {
        success: false,
        error: {
          code: 'PROPOSAL_EXPIRED',
          message: `Purchase proposal '${proposalId}' has expired and cannot be approved.`,
        },
      };
    }

    if (proposal.status === 'REJECTED') {
      return {
        success: false,
        error: {
          code: 'PROPOSAL_REJECTED',
          message: `Purchase proposal '${proposalId}' was previously rejected and cannot be approved.`,
        },
      };
    }

    if (proposal.status === 'APPROVED') {
      return {
        success: false,
        error: {
          code: 'ALREADY_APPROVED',
          message: `Purchase proposal '${proposalId}' has already been approved.`,
        },
      };
    }

    if (proposal.status !== 'PENDING_APPROVAL') {
      return {
        success: false,
        error: {
          code: 'INVALID_PROPOSAL_STATUS',
          message: `Proposal status '${proposal.status}' cannot be approved.`,
        },
      };
    }

    // Transition status to APPROVED
    proposal.status = 'APPROVED';
    PurchaseService.saveProposal(proposal);

    // Record audit event
    AuditService.recordEvent('PROPOSAL_APPROVED', proposalId, proposal.merchantId, proposal.productId, {
      actor: 'USER',
      approvedAt: new Date().toISOString(),
      authorizedAction: 'HUMAN_EXPLICIT_APPROVAL',
      paymentExecuted: false,
    });

    return {
      success: true,
      proposal,
    };
  }

  /**
   * Explicit Human Rejection.
   * Transitions status from PENDING_APPROVAL -> REJECTED.
   */
  public static async rejectProposal(proposalId: string): Promise<ProposalActionResponse> {
    const proposal = PurchaseService.getProposal(proposalId);

    if (!proposal) {
      return {
        success: false,
        error: {
          code: 'PROPOSAL_NOT_FOUND',
          message: `Purchase proposal '${proposalId}' was not found.`,
        },
      };
    }

    if (proposal.status !== 'PENDING_APPROVAL') {
      return {
        success: false,
        error: {
          code: 'INVALID_PROPOSAL_STATUS',
          message: `Proposal status '${proposal.status}' cannot be rejected.`,
        },
      };
    }

    // Transition status to REJECTED
    proposal.status = 'REJECTED';
    PurchaseService.saveProposal(proposal);

    // Record audit event
    AuditService.recordEvent('PROPOSAL_REJECTED', proposalId, proposal.merchantId, proposal.productId, {
      rejectedAt: new Date().toISOString(),
    });

    return {
      success: true,
      proposal,
    };
  }
}
