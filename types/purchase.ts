export type ProposalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface PurchaseProposal {
  proposalId: string;
  merchantId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPricePaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  currency: 'INR';
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string;
  approvalRequired: true;
}

export interface CreateProposalInput {
  merchantId: string;
  productId: string;
  quantity: number;
}

export interface CreateProposalResponse {
  success: boolean;
  proposal?: PurchaseProposal;
  error?: {
    code: string;
    message: string;
  };
}

export interface ProposalActionResponse {
  success: boolean;
  proposal?: PurchaseProposal;
  error?: {
    code: string;
    message: string;
  };
}
