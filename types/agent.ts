import { Product } from '@/types/catalog';
import { PurchaseIntent } from '@/lib/intent/intent.schema';
import { BuyerRecommendation } from '@/lib/agent/buyer/buyer.schema';
import { PurchaseProposal } from '@/types/purchase';
import { PaymentTransaction } from '@/types/payment';

export type AgentActor = 'USER' | 'AGENT';

export type AgentErrorCode =
  | 'VOICE_UNAVAILABLE'
  | 'INTENT_FAILED'
  | 'NO_PRODUCTS'
  | 'PRODUCT_UNAVAILABLE'
  | 'PROPOSAL_FAILED'
  | 'PAYMENT_FAILED'
  | 'VERIFICATION_FAILED';

export type AgentSessionState =
  | 'IDLE'
  | 'ACTIVATING'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SEARCHING'
  | 'EVALUATING'
  | 'PRESENTING_RESULTS'
  | 'AWAITING_SELECTION'
  | 'PRODUCT_SELECTED'
  | 'PROPOSAL_READY'
  | 'AWAITING_HUMAN_APPROVAL'
  | 'PAYMENT_INITIATED'
  | 'VERIFYING'
  | 'CAPTURED'
  | 'SPEAKING';

export interface AgentTurn {
  turnId: string;
  sessionId: string;
  actor: AgentActor;
  input: string;
  interpretedIntent: PurchaseIntent | null;
  toolCalls: { step?: number; tool: string; input: unknown; resultSummary: string }[];
  observations: string[];
  response: string;
  timestamp: number;
}

export interface AgentSession {
  sessionId: string;
  state: AgentSessionState;
  error: { code: AgentErrorCode; message: string } | null;
  turns: AgentTurn[];
  currentIntent: PurchaseIntent | null;
  currentRecommendations: BuyerRecommendation | null;
  selectedProduct: Product | null;
  proposal: PurchaseProposal | null;
  paymentTransaction: PaymentTransaction | null;
  createdAt: number;
  updatedAt: number;
}
