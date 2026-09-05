export type ProposalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface ProposalItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
}

export interface PurchaseProposal {
  proposalId: string;
  merchantId: string;
  items: ProposalItem[];
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
  productId?: string;
  quantity?: number;
  items?: Array<{
    productId: string;
    quantity: number;
  }>;
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

