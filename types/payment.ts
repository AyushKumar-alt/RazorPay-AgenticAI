export type PaymentStatus =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'VERIFICATION_FAILED'
  | 'RECOVERED';

export interface PaymentTransaction {
  transactionId: string;
  proposalId: string;
  merchantId: string;
  productId: string;

  razorpayOrderId: string;
  razorpayPaymentId?: string;

  amountPaise: number;
  currency: 'INR';

  status: PaymentStatus;

  createdAt: string;
  updatedAt: string;

  failureReason?: string;
}

export interface CreatePaymentOrderInput {
  proposalId: string;
}

export interface CreatePaymentOrderResponse {
  success: boolean;
  transaction?: {
    transactionId: string;
    razorpayOrderId: string;
    amountPaise: number;
    currency: 'INR';
    status: PaymentStatus;
  };
  keyId?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface VerifyPaymentInput {
  transactionId?: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  status?: PaymentStatus;
  error?: {
    code: string;
    message: string;
  };
}

export interface CreateRecoveryPaymentLinkInput {
  sourceOrderId: string;
  amountPaise: number;
  description: string;
  merchantId?: string;
  productId?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerContact?: string;
  notes?: Record<string, string>;
}

export interface CreateRecoveryPaymentLinkResponse {
  success: boolean;
  paymentLink?: {
    id: string;
    shortUrl: string;
    amountPaise: number;
    currency: 'INR';
    status: string;
    description: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

