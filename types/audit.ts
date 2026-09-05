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
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'REVENUE_OPPORTUNITY_EVALUATED'
  | 'REVENUE_ANALYSIS_ABSTAINED'
  | 'REVENUE_OPPORTUNITY_APPROVED'
  | 'PAYMENT_LINK_CREATED'
  | 'PAYMENT_RECOVERED';

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType: AuditEventType;
  proposalId: string;
  merchantId: string;
  productId: string;
  metadata: Record<string, unknown>;
}
