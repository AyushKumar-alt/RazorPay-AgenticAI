import { NextRequest, NextResponse } from 'next/server';
import { PaymentStore } from '@/lib/payment/payment.store';
import { AuditService } from '@/lib/audit/audit.service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');

    const auditEvents = AuditService.getAllEvents();
    const statuses: Record<
      string,
      {
        status: string;
        razorpayPaymentId?: string;
        razorpayOrderId?: string;
        amountPaise?: number;
        recoveredAt?: string;
        recoverySource?: string;
      }
    > = {};

    // Collect all audit events for recovery
    const recoveryAuditMap = new Map<string, any>();
    for (const evt of auditEvents) {
      if (evt.eventType === 'PAYMENT_RECOVERED') {
        const orderId = evt.proposalId || (evt.metadata as any)?.transactionId || (evt.metadata as any)?.sourceOrderId;
        if (orderId) {
          recoveryAuditMap.set(orderId, evt);
        }
      }
    }

    if (idParam) {
      const ids = idParam.split(',').map((s) => s.trim());
      for (const id of ids) {
        const tx = PaymentStore.getById(id);
        const recoveryAudit = recoveryAuditMap.get(id);

        if (tx) {
          statuses[id] = {
            status: tx.status,
            razorpayPaymentId: tx.razorpayPaymentId || recoveryAudit?.metadata?.razorpayPaymentId,
            razorpayOrderId: tx.razorpayOrderId,
            amountPaise: tx.amountPaise,
            recoveredAt: tx.status === 'RECOVERED' ? tx.updatedAt : recoveryAudit?.timestamp,
            recoverySource: 'Razorpay payment_link.paid',
          };
        } else if (recoveryAudit) {
          statuses[id] = {
            status: 'RECOVERED',
            razorpayPaymentId: recoveryAudit.metadata?.razorpayPaymentId,
            amountPaise: recoveryAudit.metadata?.amountPaidPaise,
            recoveredAt: recoveryAudit.timestamp,
            recoverySource: 'Razorpay payment_link.paid',
          };
        }
      }
    } else {
      // Return all tracked transactions
      const recoveryAuditKeys = Array.from(recoveryAuditMap.keys());
      for (const id of recoveryAuditKeys) {
        const recoveryAudit = recoveryAuditMap.get(id);
        const tx = PaymentStore.getById(id);
        statuses[id] = {
          status: tx?.status || 'RECOVERED',
          razorpayPaymentId: tx?.razorpayPaymentId || recoveryAudit.metadata?.razorpayPaymentId,
          razorpayOrderId: tx?.razorpayOrderId,
          amountPaise: tx?.amountPaise || recoveryAudit.metadata?.amountPaidPaise,
          recoveredAt: tx?.updatedAt || recoveryAudit.timestamp,
          recoverySource: 'Razorpay payment_link.paid',
        };
      }
    }

    return NextResponse.json({
      success: true,
      statuses,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to retrieve revenue statuses.',
        },
      },
      { status: 500 }
    );
  }
}
