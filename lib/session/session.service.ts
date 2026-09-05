import {
  AgentSession,
  AgentSessionState,
  AgentTurn,
  AgentErrorCode,
} from '@/types/agent';
import { Product } from '@/types/catalog';
import { PurchaseIntent } from '@/lib/intent/intent.schema';
import { BuyerRecommendation } from '@/lib/agent/buyer/buyer.schema';
import { PurchaseProposal } from '@/types/purchase';
import { PaymentTransaction } from '@/types/payment';

// Valid deterministic transition map
const ALLOWED_TRANSITIONS: Record<AgentSessionState, AgentSessionState[]> = {
  IDLE: ['ACTIVATING', 'PRODUCT_SELECTED', 'IDLE'],
  ACTIVATING: ['LISTENING', 'PRODUCT_SELECTED', 'IDLE'],
  LISTENING: ['PROCESSING', 'SPEAKING', 'PRODUCT_SELECTED', 'IDLE'],
  PROCESSING: ['SEARCHING', 'SPEAKING', 'PRODUCT_SELECTED', 'IDLE'],
  SEARCHING: ['EVALUATING', 'SPEAKING', 'PRODUCT_SELECTED', 'IDLE'],
  EVALUATING: ['PRESENTING_RESULTS', 'SPEAKING', 'PRODUCT_SELECTED', 'IDLE'],
  PRESENTING_RESULTS: ['AWAITING_SELECTION', 'SPEAKING', 'PRODUCT_SELECTED', 'PAYMENT_INITIATED', 'IDLE'],
  SPEAKING: ['AWAITING_SELECTION', 'LISTENING', 'PROPOSAL_READY', 'PRESENTING_RESULTS', 'PRODUCT_SELECTED', 'PAYMENT_INITIATED', 'IDLE'],
  AWAITING_SELECTION: ['PRODUCT_SELECTED', 'PRESENTING_RESULTS', 'SPEAKING', 'LISTENING', 'PROCESSING', 'PAYMENT_INITIATED', 'IDLE'],
  PRODUCT_SELECTED: ['PROPOSAL_READY', 'AWAITING_HUMAN_APPROVAL', 'PAYMENT_INITIATED', 'SPEAKING', 'PRODUCT_SELECTED', 'IDLE'],
  PROPOSAL_READY: ['AWAITING_HUMAN_APPROVAL', 'PAYMENT_INITIATED', 'PRODUCT_SELECTED', 'SPEAKING', 'IDLE'],
  AWAITING_HUMAN_APPROVAL: ['PAYMENT_INITIATED', 'PRODUCT_SELECTED', 'SPEAKING', 'IDLE'],
  PAYMENT_INITIATED: ['VERIFYING', 'PRODUCT_SELECTED', 'IDLE'],
  VERIFYING: ['CAPTURED', 'PRODUCT_SELECTED', 'IDLE'],
  CAPTURED: ['PRODUCT_SELECTED', 'IDLE'],
};

export class SessionService {
  private sessions: Map<string, AgentSession> = new Map();

  /**
   * Create a new isolated AgentSession with initial state IDLE.
   */
  public createSession(sessionId?: string): AgentSession {
    const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const newSession: AgentSession = {
      sessionId: id,
      state: 'IDLE',
      error: null,
      turns: [],
      currentIntent: null,
      currentRecommendations: null,
      selectedProduct: null,
      proposal: null,
      paymentTransaction: null,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, newSession);
    return { ...newSession };
  }

  /**
   * Get an existing session by ID.
   */
  public getSession(sessionId: string): AgentSession | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  /**
   * Update session state enforcing deterministic transition map.
   */
  public updateState(sessionId: string, newState: AgentSessionState): AgentSession {
    const session = this.mustGetSession(sessionId);

    if (session.state !== newState) {
      const allowed = ALLOWED_TRANSITIONS[session.state] || [];
      if (!allowed.includes(newState)) {
        throw new Error(
          `Invalid session state transition from '${session.state}' to '${newState}'.`
        );
      }
    }

    session.state = newState;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  /**
   * Add a turn to the session history.
   */
  public addTurn(
    sessionId: string,
    turnInput: Omit<AgentTurn, 'turnId' | 'sessionId' | 'timestamp'> & {
      turnId?: string;
      timestamp?: number;
    }
  ): AgentSession {
    const session = this.mustGetSession(sessionId);
    const now = Date.now();

    const turn: AgentTurn = {
      turnId: turnInput.turnId || `turn_${now}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId: session.sessionId,
      actor: turnInput.actor,
      input: turnInput.input,
      interpretedIntent: turnInput.interpretedIntent,
      toolCalls: turnInput.toolCalls || [],
      observations: turnInput.observations || [],
      response: turnInput.response,
      timestamp: turnInput.timestamp || now,
    };

    session.turns.push(turn);
    session.updatedAt = now;
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  public setIntent(sessionId: string, intent: PurchaseIntent | null): AgentSession {
    const session = this.mustGetSession(sessionId);
    session.currentIntent = intent;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  public setRecommendations(
    sessionId: string,
    recommendations: BuyerRecommendation | null
  ): AgentSession {
    const session = this.mustGetSession(sessionId);
    session.currentRecommendations = recommendations;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  public setSelectedProduct(sessionId: string, product: Product | null): AgentSession {
    const session = this.mustGetSession(sessionId);
    session.selectedProduct = product;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  public setProposal(sessionId: string, proposal: PurchaseProposal | null): AgentSession {
    const session = this.mustGetSession(sessionId);
    session.proposal = proposal;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  public setPaymentTransaction(
    sessionId: string,
    transaction: PaymentTransaction | null
  ): AgentSession {
    const session = this.mustGetSession(sessionId);
    session.paymentTransaction = transaction;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  public setError(
    sessionId: string,
    error: { code: AgentErrorCode; message: string } | null
  ): AgentSession {
    const session = this.mustGetSession(sessionId);
    session.error = error;
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  /**
   * Reset session back to IDLE state clearing transient context.
   */
  public resetSession(sessionId: string): AgentSession {
    const session = this.mustGetSession(sessionId);
    const now = Date.now();

    session.state = 'IDLE';
    session.error = null;
    session.currentIntent = null;
    session.currentRecommendations = null;
    session.selectedProduct = null;
    session.proposal = null;
    session.paymentTransaction = null;
    session.updatedAt = now;

    this.sessions.set(sessionId, session);
    return { ...session };
  }

  private mustGetSession(sessionId: string): AgentSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session with ID '${sessionId}' not found.`);
    }
    return session;
  }
}
