import { NextRequest, NextResponse } from 'next/server';
import { RazorpayService } from '@/lib/payment/razorpay.service';
import { PaymentStore } from '@/lib/payment/payment.store';
import { AuditService } from '@/lib/audit/audit.service';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WEBHOOK_SIGNATURE_INVALID',
            message: 'Missing x-razorpay-signature header.',
          },
        },
        { status: 400 }
      );
    }

    // Cryptographic signature verification over raw request body
    const isValidSignature = RazorpayService.verifyWebhookSignature(rawBody, signature);
    if (!isValidSignature) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WEBHOOK_SIGNATURE_INVALID',
            message: 'Webhook HMAC signature verification failed.',
          },
        },
        { status: 400 }
      );
    }

    // Signature valid -> parse JSON
    const payload = JSON.parse(rawBody);
    const eventId = payload.event_id || payload.id || `evt_${Date.now()}`;
    const eventType = payload.event;

    // Webhook Idempotency Check
    if (PaymentStore.hasProcessedWebhookEvent(eventId)) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: `Webhook event '${eventId}' was already processed.`,
      });
    }

    PaymentStore.markWebhookEventProcessed(eventId);

    const paymentEntity = payload.payload?.payment?.entity || {};
    const orderEntity = payload.payload?.order?.entity || {};

    const razorpayOrderId = paymentEntity.order_id || orderEntity.id;
    const razorpayPaymentId = paymentEntity.id;

    if (razorpayOrderId) {
      const tx = PaymentStore.getByOrderId(razorpayOrderId);
      if (tx) {
        if (eventType === 'payment.captured' || eventType === 'order.paid') {
          if (tx.status !== 'CAPTURED') {
            tx.status = 'CAPTURED';
            if (razorpayPaymentId) tx.razorpayPaymentId = razorpayPaymentId;
            PaymentStore.update(tx);

            AuditService.recordEvent('PAYMENT_CAPTURED', tx.proposalId, tx.merchantId, tx.productId, {
              transactionId: tx.transactionId,
              razorpayOrderId,
              razorpayPaymentId: razorpayPaymentId || tx.razorpayPaymentId,
              source: 'WEBHOOK',
              event: eventType,
            });
          }
        } else if (eventType === 'payment.failed') {
          if (tx.status !== 'CAPTURED') {
            tx.status = 'FAILED';
            tx.failureReason = paymentEntity.error_description || 'Payment failed via Razorpay Webhook';
            PaymentStore.update(tx);

            AuditService.recordEvent('PAYMENT_FAILED', tx.proposalId, tx.merchantId, tx.productId, {
              transactionId: tx.transactionId,
              razorpayOrderId,
              razorpayPaymentId,
              source: 'WEBHOOK',
              errorDescription: tx.failureReason,
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: true,
      event: eventType,
      eventId,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to process webhook.',
        },
      },
      { status: 500 }
    );
  }
}
