export interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status?: string;
}

export interface RazorpayPaymentLinkInput {
  amountPaise: number;
  currency: 'INR';
  description: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  expireBy?: number;
}

export interface RazorpayPaymentLinkResponse {
  id: string;
  shortUrl: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
}

export interface RazorpayProvider {
  createOrder(input: {
    amountPaise: number;
    currency: 'INR';
    receipt: string;
  }): Promise<RazorpayOrderResponse>;

  createPaymentLink(input: RazorpayPaymentLinkInput): Promise<RazorpayPaymentLinkResponse>;

  fetchPayment(paymentId: string): Promise<Record<string, unknown>>;

  fetchOrder(orderId: string): Promise<Record<string, unknown>>;
}

export class RazorpayHttpProvider implements RazorpayProvider {
  private getKeyCredentials(): { keyId: string; keySecret: string } {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    if (!keyId || !keySecret) {
      throw new Error('Razorpay Configuration Error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are required.');
    }

    return { keyId, keySecret };
  }

  public async createOrder(input: {
    amountPaise: number;
    currency: 'INR';
    receipt: string;
  }): Promise<RazorpayOrderResponse> {
    const { keyId, keySecret } = this.getKeyCredentials();
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      receipt: data.receipt,
      status: data.status,
    };
  }

  public async createPaymentLink(input: RazorpayPaymentLinkInput): Promise<RazorpayPaymentLinkResponse> {
    const { keyId, keySecret } = this.getKeyCredentials();
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const payload: Record<string, unknown> = {
      amount: input.amountPaise,
      currency: input.currency,
      description: input.description,
    };

    if (input.customer) {
      payload.customer = input.customer;
    }
    if (input.notes) {
      payload.notes = input.notes;
    }
    if (input.expireBy) {
      payload.expire_by = input.expireBy;
    }

    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay Payment Link API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      shortUrl: data.short_url,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      customer: data.customer,
      notes: data.notes,
    };
  }

  public async fetchPayment(paymentId: string): Promise<Record<string, unknown>> {
    const { keyId, keySecret } = this.getKeyCredentials();
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: authHeader },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Razorpay payment ${paymentId}`);
    }
    return response.json();
  }

  public async fetchOrder(orderId: string): Promise<Record<string, unknown>> {
    const { keyId, keySecret } = this.getKeyCredentials();
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: { Authorization: authHeader },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Razorpay order ${orderId}`);
    }
    return response.json();
  }
}

export class MockRazorpayProvider implements RazorpayProvider {
  private orderCounter = 1;
  private paymentLinkCounter = 1;

  public async createOrder(input: {
    amountPaise: number;
    currency: 'INR';
    receipt: string;
  }): Promise<RazorpayOrderResponse> {
    const orderId = `order_mock_${Date.now()}_${this.orderCounter++}`;
    return {
      id: orderId,
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      status: 'created',
    };
  }

  public async createPaymentLink(input: RazorpayPaymentLinkInput): Promise<RazorpayPaymentLinkResponse> {
    const linkId = `plink_mock_${Date.now()}_${this.paymentLinkCounter++}`;
    return {
      id: linkId,
      shortUrl: `https://rzp.io/i/mock_${linkId}`,
      status: 'created',
      amount: input.amountPaise,
      currency: input.currency,
      description: input.description,
      customer: input.customer,
      notes: input.notes,
    };
  }

  public async fetchPayment(paymentId: string): Promise<Record<string, unknown>> {
    return {
      id: paymentId,
      entity: 'payment',
      status: 'captured',
      amount: 154900,
      currency: 'INR',
    };
  }

  public async fetchOrder(orderId: string): Promise<Record<string, unknown>> {
    return {
      id: orderId,
      entity: 'order',
      status: 'paid',
      amount: 154900,
    };
  }
}

