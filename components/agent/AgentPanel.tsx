import React from 'react';
import { AgentSession } from '@/types/agent';
import { Product } from '@/types/catalog';
import { AgentVoiceOrb } from './AgentVoiceOrb';
import { VoiceTranscript } from './VoiceTranscript';
import { ProductRecommendations } from './ProductRecommendations';
import { ProposalCard } from './ProposalCard';

interface AgentPanelProps {
  session: AgentSession | null;
  isOpen: boolean;
  onClose: () => void;
  catalogProducts?: Product[];
  onSelectProduct?: (productId: string) => void;
  onApproveProposal?: () => void;
  onRejectProposal?: () => void;
  isVoiceSupported?: boolean;
  onMicToggle?: () => void;
  onClearChat?: () => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  session,
  isOpen,
  onClose,
  catalogProducts = [],
  onSelectProduct,
  onApproveProposal,
  onRejectProposal,
  isVoiceSupported = true,
  onMicToggle,
  onClearChat,
}) => {
  if (!isOpen || !session) {
    return null;
  }

  const getStatusDescription = () => {
    switch (session.state) {
      case 'LISTENING':
        return "I'm listening... Tell me what you're looking for.";
      case 'PROCESSING':
        return 'Understanding your request...';
      case 'SEARCHING':
        return 'Checking NovaBazaar catalog...';
      case 'EVALUATING':
        return 'Comparing candidate products and stock...';
      case 'PRESENTING_RESULTS':
      case 'AWAITING_SELECTION':
        return 'I found matching options. Select one or say "the second one".';
      case 'PRODUCT_SELECTED':
        return 'Product selected. Preparing purchase proposal...';
      case 'PROPOSAL_READY':
      case 'AWAITING_HUMAN_APPROVAL':
        return 'Purchase proposal prepared. Human authorization required.';
      case 'PAYMENT_INITIATED':
        return 'Opening Razorpay Checkout...';
      case 'VERIFYING':
        return 'Verifying payment HMAC signature...';
      case 'CAPTURED':
        return 'Payment verified and captured successfully!';
      case 'IDLE':
      default:
        return 'Say "Hey Adam" or click the microphone to start shopping.';
    }
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden transition-all duration-200"
      aria-label="Adam Shopping Agent Panel"
    >
      {/* Panel Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
        <div className="flex items-center space-x-2.5">
          <AgentVoiceOrb state={session.state} size="sm" />
          <div>
            <h3 className="font-semibold text-sm leading-none text-white">
              Adam — NovaBazaar Agent
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Bounded Autonomous Agent
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onMicToggle && (
            <button
              type="button"
              onClick={onMicToggle}
              disabled={!isVoiceSupported}
              className={`p-1.5 rounded-full text-xs transition-colors ${
                session.state === 'LISTENING'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="Toggle microphone"
              aria-label="Toggle microphone"
            >
              🎙
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close Adam Panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Panel Main Body */}
      <div className="p-4 max-h-[80vh] overflow-y-auto space-y-4">
        {/* Status banner */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700">
          {getStatusDescription()}
        </div>

        {/* Structured error display if present */}
        {session.error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            <strong>Error ({session.error.code})</strong>: {session.error.message}
          </div>
        )}

        {/* Conversation Transcript */}
        <VoiceTranscript turns={session.turns} onClearChat={onClearChat} />

        {/* Product Recommendations */}
        <ProductRecommendations
          recommendations={session.currentRecommendations}
          catalogProducts={catalogProducts}
          onSelectProduct={onSelectProduct}
          selectedProductId={session.selectedProduct?.id}
        />

        {/* Purchase Proposal Card */}
        <ProposalCard
          proposal={session.proposal}
          onApproveClick={onApproveProposal}
          onRejectClick={onRejectProposal}
          isLoading={
            session.state === 'PAYMENT_INITIATED' || session.state === 'VERIFYING'
          }
        />
      </div>
    </div>
  );
};
