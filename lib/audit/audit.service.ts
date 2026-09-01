import { AuditEvent, AuditEventType } from '@/types/audit';

export class AuditService {
  private static events: AuditEvent[] = [];
  private static eventCounter = 1;

  public static recordEvent(
    eventType: AuditEventType,
    proposalId: string,
    merchantId: string,
    productId: string,
    metadata: Record<string, unknown> = {}
  ): AuditEvent {
    const event: AuditEvent = {
      eventId: `evt_${Date.now()}_${this.eventCounter++}`,
      timestamp: new Date().toISOString(),
      eventType,
      proposalId,
      merchantId,
      productId,
      metadata,
    };

    this.events.push(event);
    return event;
  }

  public static getEventsForProposal(proposalId: string): AuditEvent[] {
    return this.events.filter((e) => e.proposalId === proposalId);
  }

  public static getAllEvents(): AuditEvent[] {
    return [...this.events];
  }

  public static clearEvents(): void {
    this.events = [];
    this.eventCounter = 1;
  }
}
