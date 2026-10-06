# Order-Q (Fase 0–2)

## Jalankan
1. `docker-compose up -d` (Postgres 5432, Redis 6379)
2. Salin `.env.example` → `apps/api/.env`, isi `DATABASE_URL`, `JWT_SECRET`.
3. Backend:
   - `npm --workspace @order-q/api install` (butuh network; argon2 native)
   - `npm run db:generate --workspace @order-q/api`
   - `npm run db:migrate --workspace @order-q/api`
   - `npm run db:seed --workspace @order-q/api`
   - `npm run start:dev --workspace @order-q/api` → `http://localhost:3000/v1`, docs `/docs`
4. Akun demo (PIN `123456`): Adi (kasir), Budi (maker), Sinta (owner). Outlet demo `Kopi Senja Demo`.

## Endpoint penting
- `POST /v1/auth/pin-login`, `POST /v1/auth/refresh`
- `POST /v1/shifts/open`, `GET /v1/shifts/current`, `GET /v1/shifts/:id/summary`, `POST /v1/shifts/:id/close`
- `GET /v1/menus` (dengan `maxPortion`, `availability`), `POST /v1/menus`, `PATCH /v1/menus/:id`, `PATCH /v1/menus/:id/toggle`
- `GET/POST /v1/ingredients`, `GET /v1/ingredients/low-stock`, `POST /v1/ingredients/:id/adjust`
- `GET/PUT /v1/recipes/:menuId`
- `POST /v1/stock/check`, `GET /v1/stock/moves`
- `POST /v1/orders/checkout` (header `idempotency-key: uuid`), `POST /v1/orders/validate`
- `GET /v1/tickets`, `PATCH /v1/tickets/subtickets/:id/status`, `POST /v1/tickets/:id/complete`, `POST /v1/tickets/:id/cancel`
- `POST /v1/payments/qris`, `GET /v1/payments/:ticketId/status`, `POST /v1/payments/qris/cancel`, `POST /v1/payments/webhooks/qris`
- `GET/PATCH /v1/settings`
- WS: `ticket:created`, `ticket:updated`, `subticket:updated`, `ticket:ready`, `stock:changed`, `shift:closed`

## MOCK QRIS
- Default `QRIS_ENABLED=false` → gateway mock. `POST /v1/payments/qris` mengembalikan `qrCode` base64 + `expiresAt` (+5 mnt).
- Webhook: `POST /v1/payments/webhooks/qris` dengan `{ paymentId, status: 'paid' }`.
- Timeout otomatis: job tiap 60 dtk membatalkan tiket QRIS pending >5 mnt + kembalikan stok.

## Test
- Unit: `apps/api/src/common/money.test.ts` (total, maxPortion, variance, split).
- Integrasi/konkurensi: gunakan 2 checkout paralel pada bahan 1 porsi → 1 berhasil; webhook dikirim 2x idempoten (cek `status=PAID` tetap 1 efek).
