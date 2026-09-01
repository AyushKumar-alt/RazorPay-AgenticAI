export type AuditEventType =
  | 'PROPOSAL_CREATED'
  | 'PROPOSAL_APPROVED'
  | 'PROPOSAL_REJECTED'
  | 'PROPOSAL_EXPIRED'
  | 'PAYMENT_ORDER_CREATED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_VERIFICATION_FAILED';

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType: AuditEventType;
  proposalId: string;
  merchantId: string;
  productId: string;
  metadata: Record<string, unknown>;
}
