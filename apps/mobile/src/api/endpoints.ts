import type {
  LoginOptionsResponse,
  DisplayTokenResponse,
  CheckoutRequest,
  CheckoutResponse,
  Ticket,
  MenuItem,
  Shift,
  SubTicketStatus,
} from '@order-q/shared';
import { apiFetch, type ApiOptions } from './client';

export type { LoginOptionsResponse, DisplayTokenResponse, CheckoutResponse, Ticket, MenuItem, Shift };

export const endpoints = {
  loginOptions: (outletCode: string) =>
    apiFetch<LoginOptionsResponse>(`/v1/auth/login-options?outletCode=${encodeURIComponent(outletCode)}`),

  login: (outletCode: string, userId: string, pin: string) =>
    apiFetch<{ accessToken: string; refreshToken: string }>('/v1/auth/pin-login', {
      method: 'POST',
      body: { outletCode, userId, pin },
    }),

  displayPairCode: (token: string) =>
    apiFetch<{ code: string; expiresInSeconds: number }>('/v1/auth/display-pair-code', {
      method: 'POST',
      token,
    }),

  displayPair: (code: string) =>
    apiFetch<DisplayTokenResponse>('/v1/auth/display-pair', {
      method: 'POST',
      body: { code },
    }),

  currentShift: (token: string) => apiFetch<Shift | null>('/v1/shifts/current', { token }),

  openShift: (token: string, openingCash: number) =>
    apiFetch<Shift>('/v1/shifts/open', { method: 'POST', token, body: { openingCash } }),

  menus: (token: string) => apiFetch<MenuItem[]>('/v1/menus', { token }),

  tickets: (token: string) =>
    apiFetch<{ tickets: Ticket[]; total: number }>('/v1/tickets', { token }),

  validate: (token: string, items: CheckoutRequest['items']) =>
    apiFetch<{ valid: boolean; subtotal: number; total: number; eta: { min: number; max: number } }>('/v1/orders/validate', {
      method: 'POST',
      token,
      body: { items },
    }),

  checkout: (token: string, body: CheckoutRequest, idempotencyKey: string) =>
    apiFetch<CheckoutResponse>('/v1/orders/checkout', {
      method: 'POST',
      token,
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  receipt: (token: string, ticketId: string) =>
    apiFetch<{ receipt: CheckoutResponse['receipt']; text: string[]; escpos: string }>(
      `/v1/tickets/${ticketId}/receipt?width=32`,
      { token },
    ),

  updateSubticket: (token: string, subticketId: string, status: SubTicketStatus) =>
    apiFetch(`/v1/tickets/subtickets/${subticketId}/status`, {
      method: 'PATCH',
      token,
      body: { status },
    }),

  pairOptions: (options: ApiOptions) => apiFetch('/v1/auth/display-pair', options),
};
