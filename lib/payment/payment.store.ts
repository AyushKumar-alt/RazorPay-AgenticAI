import { PaymentTransaction, PaymentStatus } from '@/types/payment';

export class PaymentStore {
  private static transactions = new Map<string, PaymentTransaction>();
  private static proposalToTransaction = new Map<string, string>();
  private static orderToTransaction = new Map<string, string>();
  private static paymentToTransaction = new Map<string, string>();
  private static processedWebhookEvents = new Set<string>();

  // Valid State Transitions Map
  private static ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    CREATED: ['PAYMENT_PENDING', 'FAILED'],
    PAYMENT_PENDING: ['AUTHORIZED', 'CAPTURED', 'FAILED', 'VERIFICATION_FAILED'],
    AUTHORIZED: ['CAPTURED', 'FAILED', 'VERIFICATION_FAILED'],
    VERIFICATION_FAILED: ['PAYMENT_PENDING'],
    CAPTURED: ['CAPTURED'], // Idempotent terminal state
    FAILED: ['FAILED'],     // Terminal state
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
