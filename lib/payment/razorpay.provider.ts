export interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status?: string;
}

export interface RazorpayProvider {
  createOrder(input: {
    amountPaise: number;
    currency: 'INR';
    receipt: string;
  }): Promise<RazorpayOrderResponse>;

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
