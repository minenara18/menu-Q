import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway, CreatePaymentParams, CreatePaymentResult, WebhookVerificationResult } from './payment-gateway.interface';
import { createHmac, timingSafeEqual } from 'crypto';

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

    const data = (await response.json()) as XenditQRISResponse;

    return {
      paymentId: data.id,
      paymentUrl: data.qr_string,
      qrCode: data.qr_string,
      expiresAt: new Date(data.expired_at),
      rawResponse: data,
    };
  }

  async verifyWebhook(payload: any, signature: string): Promise<WebhookVerificationResult> {
    // Xendit webhook is verified against the webhook/callback secret from the environment.
    // If the secret is not configured the webhook is always rejected.
    const webhookSecret = this.configService.get('app.qris.webhookSecret') || this.secretKey;
    if (!webhookSecret || !signature) {
      return { valid: false, status: 'failed' };
    }

    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const a = Buffer.from(String(signature), 'utf8');
    const b = Buffer.from(expectedSignature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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