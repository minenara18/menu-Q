# Order-Q (Fase 0–2)

Kasir pelayanan F&B berbasis **tiket antrean** untuk cafe dan UMKM. Satu pesanan menjadi
1 tiket dengan N sub-tiket per stasiun (BAR / KITCHEN / PASTRY). Stok dikurangi otomatis
berdasar resep (BOM) saat checkout. Pembayaran tunai dan QRIS (mock di dev, Xendit di
production), split bill, tutup shift dengan rekap selisih kas, estimasi waktu tunggu
berupa rentang.

## Stack & struktur monorepo

- **Mobile**: React Native (Expo, TS) — `apps/mobile` — *(Fase 2 mobile, belum dikerjakan; 0 layar)*
- **Backend**: NestJS 10 + Prisma 5 + PostgreSQL — `apps/api`
- **Real-time**: Socket.IO — event `ticket:created`, `ticket:updated`, `subticket:updated`, `ticket:ready`, `stock:changed`, `shift:closed`
- **Shared**: kontrak & enum — `packages/shared`
- Redis opsional di dev (compose menyediakan; API saat ini belum memakai Redis — aman tanpa Redis)

```
apps/api          NestJS API (prisma/, src/, jest.integration.config.js)
apps/mobile       RN/Expo (hanya tokens.ts, 0 layar)
packages/shared   enum & zod contract bersama (enum harus sama nilai dengan Prisma: UPPERCASE)
```

## Menjalankan dari mesin lain (backend)

Prasyarat: Node >= 20, PostgreSQL 16 (lokal atau Docker), npm.

1. Database:
   - Docker: `docker-compose up -d` (postgres:5432, redis:6379), atau pakai Postgres lokal
   - Buat database `orderq` (dan `orderq_test` untuk integration test)
2. `npm install` di root (workspaces)
3. `copy .env.example apps/api/.env` (PowerShell: `Copy-Item`), isi minimal:
   - `DATABASE_URL` → `postgresql://orderq:orderq_dev_password@localhost:5432/orderq?schema=public`
   - `DATABASE_URL_TEST` → `.../orderq_test?schema=public` (integration test **menolak jalan** jika kosong atau sama dengan `DATABASE_URL`)
   - `JWT_SECRET` → string acak ≥ 32 karakter
   - `QRIS_ENABLED=false` untuk dev (mock QRIS)
4. `npm run db:generate --workspace @order-q/api`
5. `npx prisma migrate deploy` di `apps/api` (menerapkan semua migration yang ter-commit)
6. `npm run db:seed --workspace @order-q/api` — outlet demo `Kopi Senja Demo`, PIN `123456`:
   - Adi (CASHIER, `00000000-0000-0000-0000-000000000501`)
   - Budi (MAKER, stasiun BAR, `00000000-0000-0000-0000-000000000502`)
   - Sinta (OWNER, `00000000-0000-0000-0000-000000000503`)
   - Menu: Kopi Susu, Americano, Latte, Mie Goreng, Croissant (ID prefix `00000000-0000-0000-0000-0000000004xx`)
7. `npm run start:prod --workspace @order-q/api` (atau `start:dev`) → API `http://localhost:3000/v1`, Swagger `http://localhost:3000/docs`
8. Buat shift: `POST /v1/shifts/open` `{ openingCash: 100000 }` — lalu **login ulang** agar JWT
   membawa `shiftId` (checkout menolak 400 jika token tidak punya shift aktif).

## Akun & alur bisnis utama

Login: `POST /v1/auth/pin-login` `{ outletId, userId, pin }`.

Urutan kasir: buka shift → tambah menu ke keranjang → `POST /v1/orders/checkout`
(header `Idempotency-Key: <uuid>`; body `{ items: [{menuId, qty}], orderType, payments, idempotencyKey, discount? }`)
→ stasiun kerja (maker) set sub-tiket `IN_PROGRESS` → `READY` →
`POST /v1/tickets/:id/complete` (kasir) → `POST /v1/shifts/:id/close` (rekap `expectedCash`/`variance`).

Split bill: `payments` boleh lebih dari satu asalkan totalnya = total tiket (tiket tetap satu).
Diskon tiket: opsional `{ discount: { type: 'amount' | 'percent', value } }` — divalidasi dan masuk ke total.

Pembatalan tiket berbayar & tutup shift dengan `|variance| > outlet.varianceThreshold` (default 10000)
memerlukan **PIN owner** yang aktif di outlet yang sama (argon2 verify, rate-limit 5x → lockout 15 menit,
tercatat di `audit_logs` sebagai `PIN_APPROVE` / `MANAGER_PIN_FAILED`).

Maker hanya melihat & mengubah sub-tiket stasiunnya (BUDI → BAR).

## MOCK QRIS (dev)

Dengan `QRIS_ENABLED=false`:
- `POST /v1/payments/qris` `{ ticketId }` → `{ paymentId, qrCode (base64), expiresAt }` (+5 mnt)
- Simulasikan pembayaran: `POST /v1/payments/webhooks/qris` `{ paymentId, status: 'paid', outletId }`
- Timeout otomatis: tiap 60 detik, tiket QRIS PENDING > 5 menit dibatalkan, **stok dikembalikan** (`stock_moves` REFUND), tiket `CANCELLED`

Production: `QRIS_ENABLED=true` wajib (aplikasi **gagal boot** tanpa itu), plus `QRIS_MERCHANT_ID`,
`QRIS_API_KEY`, `QRIS_WEBHOOK_SECRET`. Mock gateway tidak dipakai di production; webhook Xendit
diverifikasi HMAC-SHA256 terhadap `QRIS_WEBHOOK_SECRET` (ditolak jika secret/signature tidak valid).

## Test

```
npm test --workspace @order-q/api                 # unit (money: total, maxPortion, variance, split)
npm run test:integration --workspace @order-q/api # integrasi (DATABASE_URL_TEST, reset+seed tiap test)
```

Integration mencakup: konkurensi checkout (5 paralel pada stok 1 porsi → tepat 1 berhasil, sisanya 409),
idempotensi (Idempotency-Key & webhook 2x), QRIS timeout mengembalikan stok, split payment, tutup shift
(variance/manager PIN/immutability/forceClose), RBAC kasir vs owner vs maker, diskon, webhook Xendit.
Terakhir dijalankan: **12/12 lulus (stabil pada 3x run)**.

## Endpoint penting

- `POST /v1/auth/pin-login`, `POST /v1/auth/refresh`, `GET /v1/auth/me`
- `POST /v1/shifts/open`, `GET /v1/shifts/current`, `GET /v1/shifts/:id/summary`, `POST /v1/shifts/:id/close`
- `GET /v1/menus` (dengan `maxPortion`, `availability`), `POST /v1/menus`, `PATCH /v1/menus/:id`, `PATCH /v1/menus/:id/toggle`
- `GET/POST /v1/ingredients`, `GET /v1/ingredients/low-stock`, `POST /v1/ingredients/:id/adjust`
- `GET/PUT /v1/recipes/:menuId`
- `POST /v1/stock/check`, `GET /v1/stock/moves`
- `POST /v1/orders/checkout` (header `idempotency-key: uuid`), `POST /v1/orders/validate`
- `GET /v1/tickets`, `PATCH /v1/tickets/subtickets/:id/status`, `PATCH /v1/tickets/:id/status`, `POST /v1/tickets/:id/complete`, `POST /v1/tickets/:id/cancel`
- `POST /v1/payments/qris`, `GET /v1/payments/:ticketId/status`, `POST /v1/payments/qris/cancel`, `POST /v1/payments/webhooks/qris`
- `GET/PATCH /v1/settings`, `GET/POST/PATCH /v1/users`, `GET /v1/categories`, `GET /v1/stations`

## Status jujur (per 19 Nov 2026)

Terverifikasi berjalan di sesi ini (build 0 error, lint 0 error, unit 4/4, integration 12/12):
- Backend API hidup: boot, semua modul & route terdaftar, smoke test HTTP penuh (login → shift → 2 macam pembayaran → sub-tiket → complete → cancel → QRIS webhook → tutup shift) dan WebSocket `ticket:created` diterima client.
- Konkurensi checkout tidak memungkinkan oversell (atomic conditional decrement + per-shift advisory lock).
- Idempotensi checkout via `Payment.idempotencyKey` (unique).

Belum / tidak terverifikasi / tidak termasuk scope:
- **Mobile: 0 layar** (tidak dikerjakan di sesi ini).
- **Fase 3 offline-first** (outbox, sync) belum dikerjakan.
- Xendit **belum diuji terhadap sandbox/production nyata** — hanya verifikasi signature lokal (HMAC). Alur QRIS yang diuji adalah gateway mock.
- Cetak struk/printer belum diimplementasikan (hanya konfigurasi `.env`).
- `partialReadyPolicy = CALL_PER_STATION` belum diuji otomatis; `WAIT_ALL` berfungsi.
- Notifikasi/customer-facing display belum ada.

## Utang & berikutnya

- 210+ lint warnings (kebanyakan `consistent-type-imports`, `no-floating-promises`, `any`) — 0 error.
- Maker station assignment saat ini tunggal per user (`User.stationId`); multi-stasiun per maker belum didukung.
- Lockout PIN manager disimpan in-memory per proses API (bukan terdistribusi/Redis) — reset saat restart.
- Refund tunai mengembalikan kas secara penuh (tidak ada partial refund).
