import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway, CreatePaymentParams, CreatePaymentResult, WebhookVerificationResult } from './payment-gateway.interface';
import { createHmac } from 'crypto';

interface XenditQRISResponse {
  id: string;
  external_id: string;
  qr_string: string;
  callback_url: string;
  status: string;
  amount: number;
  expired_at: string;
}

@Injectable()
export class XenditPaymentGateway implements PaymentGateway {
  name = 'xendit';
  private readonly secretKey: string;
  private readonly callbackUrl: string;
  private readonly baseUrl = 'https://api.xendit.co';

  constructor(private configService: ConfigService) {
    this.secretKey = this.configService.get('QRIS_API_KEY') || '';
    this.callbackUrl = `${this.configService.get('APP_URL') || 'http://localhost:3000'}/v1/webhooks/qris`;
  }

  private getAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`;
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const response = await fetch(`${this.baseUrl}/qr_codes`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_id: params.orderId,
        type: 'DYNAMIC',
        callback_url: params.callbackUrl || this.callbackUrl,
        amount: params.amount,
        description: params.description,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Xendit QRIS error: ${JSON.stringify(error)}`);
    }

    const data: XenditQRISResponse = await response.json();

    return {
      paymentId: data.id,
      paymentUrl: data.qr_string,
      qrCode: data.qr_string,
      expiresAt: new Date(data.expired_at),
      rawResponse: data,
    };
  }

  async verifyWebhook(payload: any, signature: string): Promise<WebhookVerificationResult> {
    // Verify Xendit webhook signature
    const expectedSignature = createHmac('sha256', this.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (signature !== expectedSignature) {
      return { valid: false, status: 'failed' };
    }

    const paymentId = payload.id;
    const status = payload.status === 'PAID' ? 'paid' : payload.status === 'EXPIRED' ? 'expired' : 'failed';

    return {
      valid: true,
      paymentId,
      status,
      amount: payload.amount,
      rawData: payload,
    };
  }

  async handleCallback(data: any): Promise<any> {
    // Xendit uses webhook, not callback
    return this.verifyWebhook(data, '');
  }
}