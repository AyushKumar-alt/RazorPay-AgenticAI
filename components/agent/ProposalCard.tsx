import React from 'react';
import { PurchaseProposal } from '@/types/purchase';

interface ProposalCardProps {
  proposal: PurchaseProposal | null;
  onApproveClick?: () => void;
  onRejectClick?: () => void;
  isLoading?: boolean;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onApproveClick,
  onRejectClick,
  isLoading = false,
}) => {
  if (!proposal) {
    return null;
  }

  const unitPrice = (proposal.unitPricePaise / 100).toLocaleString('en-IN');
  const deliveryFee = (proposal.deliveryFeePaise / 100).toLocaleString('en-IN');
  const totalAmount = (proposal.totalPaise / 100).toLocaleString('en-IN');

  return (
    <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h4 className="font-semibold text-slate-900 text-sm">Purchase Proposal</h4>
          <p className="text-xs text-slate-500">ID: {proposal.proposalId}</p>
        </div>
        <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          Human Approval Required
        </span>
      </div>

      {/* Itemized calculation table */}
      <div className="space-y-1.5 text-xs text-slate-600">
        <div className="flex justify-between font-medium text-slate-800">
          <span>
            {proposal.productName} (x{proposal.quantity})
          </span>
          <span>₹{unitPrice}</span>
        </div>
        <div className="flex justify-between">
          <span>Estimated Delivery Fee</span>
          <span>₹{deliveryFee}</span>
        </div>
        <div className="border-t border-slate-100 pt-2 flex justify-between font-bold text-sm text-slate-900">
          <span>Total Order Value</span>
          <span className="text-blue-700">₹{totalAmount}</span>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-100 text-xs text-blue-800">
        🔒 <strong>Financial Security Gate</strong>: Voice cannot authorize payments. Human explicit approval required.
      </div>

      {/* Action Buttons (Presentational ONLY in Phase 7C) */}
      <div className="flex items-center space-x-2 pt-1">
        <button
          type="button"
          onClick={onApproveClick}
          disabled={isLoading}
          className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : 'Approve & Pay'}
        </button>

        <button
          type="button"
          onClick={onRejectClick}
          disabled={isLoading}
          className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
};
