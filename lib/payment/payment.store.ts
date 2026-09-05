import { PaymentTransaction, PaymentStatus } from '@/types/payment';

const globalForPayment = globalThis as unknown as {
  __nova_transactions__?: Map<string, PaymentTransaction>;
  __nova_proposalToTx__?: Map<string, string>;
  __nova_orderToTx__?: Map<string, string>;
  __nova_paymentToTx__?: Map<string, string>;
  __nova_webhooks__?: Set<string>;
};

if (!globalForPayment.__nova_transactions__) globalForPayment.__nova_transactions__ = new Map();
if (!globalForPayment.__nova_proposalToTx__) globalForPayment.__nova_proposalToTx__ = new Map();
if (!globalForPayment.__nova_orderToTx__) globalForPayment.__nova_orderToTx__ = new Map();
if (!globalForPayment.__nova_paymentToTx__) globalForPayment.__nova_paymentToTx__ = new Map();
if (!globalForPayment.__nova_webhooks__) globalForPayment.__nova_webhooks__ = new Set();

export class PaymentStore {
  private static transactions = globalForPayment.__nova_transactions__!;
  private static proposalToTransaction = globalForPayment.__nova_proposalToTx__!;
  private static orderToTransaction = globalForPayment.__nova_orderToTx__!;
  private static paymentToTransaction = globalForPayment.__nova_paymentToTx__!;
  private static processedWebhookEvents = globalForPayment.__nova_webhooks__!;

  // Valid State Transitions Map
  private static ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    CREATED: ['PAYMENT_PENDING', 'CAPTURED', 'FAILED', 'VERIFICATION_FAILED', 'RECOVERED'],
    PAYMENT_PENDING: ['AUTHORIZED', 'CAPTURED', 'FAILED', 'VERIFICATION_FAILED', 'RECOVERED'],
    AUTHORIZED: ['CAPTURED', 'FAILED', 'VERIFICATION_FAILED', 'RECOVERED'],
    VERIFICATION_FAILED: ['PAYMENT_PENDING', 'RECOVERED'],
    CAPTURED: ['CAPTURED'], // Idempotent terminal state
    FAILED: ['FAILED', 'RECOVERED'], // FAILED state can transition to RECOVERED when payment_link.paid webhook arrives
    RECOVERED: ['RECOVERED'], // Idempotent terminal state
  };

  public static create(transaction: PaymentTransaction): PaymentTransaction {
    this.transactions.set(transaction.transactionId, transaction);
    this.proposalToTransaction.set(transaction.proposalId, transaction.transactionId);
    this.orderToTransaction.set(transaction.razorpayOrderId, transaction.transactionId);
    if (transaction.razorpayPaymentId) {
      this.paymentToTransaction.set(transaction.razorpayPaymentId, transaction.transactionId);
    }
    return transaction;
  }

  public static getById(transactionId: string): PaymentTransaction | null {
    return this.transactions.get(transactionId) || null;
  }

  public static getByProposalId(proposalId: string): PaymentTransaction | null {
    const txId = this.proposalToTransaction.get(proposalId);
    return txId ? this.getById(txId) : null;
  }

  public static getByOrderId(razorpayOrderId: string): PaymentTransaction | null {
    const txId = this.orderToTransaction.get(razorpayOrderId);
    return txId ? this.getById(txId) : null;
  }

  public static getByPaymentId(razorpayPaymentId: string): PaymentTransaction | null {
    const txId = this.paymentToTransaction.get(razorpayPaymentId);
    return txId ? this.getById(txId) : null;
  }

  /**
   * Find an active payment transaction for a proposal (CREATED, PAYMENT_PENDING, AUTHORIZED).
   */
  public static getActiveTransactionByProposalId(proposalId: string): PaymentTransaction | null {
    const tx = this.getByProposalId(proposalId);
    if (!tx) return null;
    const activeStates: PaymentStatus[] = ['CREATED', 'PAYMENT_PENDING', 'AUTHORIZED'];
    if (activeStates.includes(tx.status)) {
      return tx;
    }
    return null;
  }

  /**
   * Update transaction enforcing valid state machine transitions.
   */
  public static update(transaction: PaymentTransaction): { success: true; transaction: PaymentTransaction } | { success: false; error: string } {
    const existing = this.getById(transaction.transactionId);
    if (!existing) {
      return { success: false, error: `Transaction ${transaction.transactionId} not found.` };
    }

    const currentStatus = existing.status;
    const nextStatus = transaction.status;

    // Check allowed transition
    const allowed = this.ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      return {
        success: false,
        error: `Invalid status transition from '${currentStatus}' to '${nextStatus}'.`,
      };
    }

    transaction.updatedAt = new Date().toISOString();
    this.transactions.set(transaction.transactionId, transaction);

    if (transaction.razorpayPaymentId) {
      this.paymentToTransaction.set(transaction.razorpayPaymentId, transaction.transactionId);
    }

    return { success: true, transaction };
  }

  // Webhook Idempotency Tracking
  public static hasProcessedWebhookEvent(eventId: string): boolean {
    return this.processedWebhookEvents.has(eventId);
  }

  public static markWebhookEventProcessed(eventId: string): void {
    this.processedWebhookEvents.add(eventId);
  }

  public static clearStore(): void {
    this.transactions.clear();
    this.proposalToTransaction.clear();
    this.orderToTransaction.clear();
    this.paymentToTransaction.clear();
    this.processedWebhookEvents.clear();
  }
}
