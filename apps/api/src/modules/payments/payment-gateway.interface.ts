export interface PaymentGateway {
  name: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  verifyWebhook(payload: any, signature: string): Promise<WebhookVerificationResult>;
  handleCallback(data: any): Promise<CallbackResult>;
}

export interface CreatePaymentParams {
  amount: number; // in smallest currency unit
  orderId: string;
  description: string;
  callbackUrl: string;
  redirectUrl?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentResult {
  paymentId: string;
  paymentUrl?: string; // for QRIS, this is the QR code image URL or deep link
  qrCode?: string; // base64 QR code or QR string
  expiresAt: Date;
  rawResponse: any;
}

export interface WebhookVerificationResult {
  valid: boolean;
  paymentId?: string;
  status: 'paid' | 'failed' | 'expired';
  amount?: number;
  rawData?: any;
}

export interface CallbackResult {
  success: boolean;
  paymentId: string;
  status: 'paid' | 'failed' | 'expired';
  amount?: number;
}