import { Injectable } from '@nestjs/common';
import { PaymentGateway, CreatePaymentParams, CreatePaymentResult, WebhookVerificationResult, CallbackResult } from './payment-gateway.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  name = 'mock';

  private pendingPayments = new Map<string, {
    params: CreatePaymentParams;
    status: 'pending' | 'paid' | 'failed' | 'expired';
    createdAt: Date;
  }>();

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const paymentId = `mock_${uuidv4()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    this.pendingPayments.set(paymentId, {
      params,
      status: 'pending',
      createdAt: new Date(),
    });

    // Generate mock QR code (base64 SVG)
    const qrCode = this.generateMockQRCode(paymentId, params.amount);

    return {
      paymentId,
      paymentUrl: `http://localhost:3000/mock-payment/${paymentId}`,
      qrCode,
      expiresAt,
      rawResponse: { paymentId, amount: params.amount },
    };
  }

  async verifyWebhook(payload: any, signature: string): Promise<WebhookVerificationResult> {
    // Mock webhook verification - always valid in mock mode
    const paymentId = payload.paymentId || payload.external_id;
    const payment = this.pendingPayments.get(paymentId);

    if (!payment) {
      return { valid: false, status: 'failed' };
    }

    const status = payload.status || 'paid';
    payment.status = status;

    return {
      valid: true,
      paymentId,
      status: status as 'paid' | 'failed' | 'expired',
      amount: payload.amount,
      rawData: payload,
    };
  }

  async handleCallback(data: any): Promise<CallbackResult> {
    const paymentId = data.paymentId;
    const payment = this.pendingPayments.get(paymentId);

    if (!payment) {
      return { success: false, paymentId, status: 'failed' };
    }

    const status = data.status || 'paid';
    payment.status = status;

    return {
      success: true,
      paymentId,
      status: status as 'paid' | 'failed' | 'expired',
      amount: data.amount,
    };
  }

  // Helper for testing - simulate payment completion
  async simulatePayment(paymentId: string, status: 'paid' | 'failed' = 'paid') {
    const payment = this.pendingPayments.get(paymentId);
    if (payment) {
      payment.status = status;
      // In real implementation, this would trigger webhook
    }
  }

  // Helper for testing - simulate expiration
  async checkExpirations() {
    const now = new Date();
    for (const [id, payment] of this.pendingPayments.entries()) {
      if (payment.status === 'pending' && now > new Date(payment.createdAt.getTime() + 5 * 60 * 1000)) {
        payment.status = 'expired';
      }
    }
  }

  private generateMockQRCode(paymentId: string, amount: number): string {
    const data = `mock://payment/${paymentId}?amount=${amount}`;
    // Simple base64 SVG QR code placeholder
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" font-size="12">${data}</text></svg>`;
    return Buffer.from(svg).toString('base64');
  }
}