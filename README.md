# Order-Q (Fase 0–2)

Kasir pelayanan F&B berbasis **tiket antrean** untuk cafe dan UMKM. Satu pesanan menjadi
1 tiket dengan N sub-tiket per stasiun (BAR / KITCHEN / PASTRY). Stok dikurangi otomatis
berdasar resep (BOM) saat checkout. Pembayaran tunai dan QRIS (mock di dev, Xendit di
production), split bill, tutup shift dengan rekap selisih kas, estimasi waktu tunggu
berupa rentang, prioritas antrean transparan, dan data struk siap cetak.

## Stack & struktur monorepo

- **Mobile**: React Native (Expo, TS) — `apps/mobile` — *(belum dikerjakan; 0 layar)*
- **Backend**: NestJS 10 + Prisma 5 + PostgreSQL — `apps/api`
- **Real-time**: Socket.IO — event `ticket:created`, `ticket:updated`, `ticket:eta-updated`,
  `subticket:updated`, `ticket:ready`, `station:queue-updated`, `stock:changed`, `shift:closed`
- **Shared**: kontrak & enum — `packages/shared` (enum harus sama nilai dengan Prisma: UPPERCASE)
- Redis opsional di dev (compose menyediakan; API tidak menggunakannya).

## Menjalankan dari mesin lain (backend)

Prasyarat: Node >= 20, PostgreSQL 16 (lokal atau Docker), npm.

1. Database: `docker-compose up -d` (postgres:5432, redis:6379), atau Postgres lokal.
   Buat database `orderq` dan `orderq_test` (test **menolak jalan** jika `DATABASE_URL_TEST`
   kosong atau sama dengan `DATABASE_URL`).
2. `npm install` di root (workspaces).
3. `Copy-Item .env.example apps/api/.env`, lalu isi minimal `DATABASE_URL`,
   `DATABASE_URL_TEST`, dan `JWT_SECRET` acak ≥ 32 karakter. `QRIS_ENABLED=false` untuk dev.
4. `npm run db:generate --workspace @order-q/api`
5. `npx prisma migrate deploy` di `apps/api` (juga ke `orderq_test` untuk test).
6. `npm run db:seed --workspace @order-q/api` — outlet demo `Kopi Senja Demo`, PIN `123456`:
   Adi (CASHIER), Budi (MAKER, BAR), Citra (MAKER, BAR+KITCHEN), Sinta (OWNER).
7. `npm run start:prod --workspace @order-q/api` → API `http://localhost:3000/v1`,
   Swagger `http://localhost:3000/docs` (nonaktif di production kecuali `ENABLE_DOCS=true`).

Buat shift: `POST /v1/shifts/open { openingCash: 100000 }`, lalu **login ulang** agar JWT
membawa `shiftId` (checkout menolak 400 tanpa shift aktif di token).

## Uang & pembulatan

Semua amount integer rupiah; tarif pajak/service integer basis points (1100 = 11%).
Satu sumber kebenaran: `apps/api/src/common/money.ts`. Urutan: **diskon → service → pajak**:
diskon dihitung dari subtotal, service dari subtotal setelah diskon, pajak dari
subtotal−diskon+service. Tiap komponen dibulatkan ke rupiah terdekat (half-up).
`allocateSplit(total, n)` memakai largest-remainder sehingga jumlah bagian persis = total.

## Zona waktu & mobile

Batas hari untuk nomor tiket/shift/laporan memakai `Outlet.timezone` (default
`Asia/Jakarta`) lewat fungsi murni `common/time/outlet-time.ts` — hasil tidak bergantung
`TZ` mesin. Checkout menerima `clientTicketId` (UUID, unik per outlet; dipakai sebagai
kunci idempotensi bersama `Idempotency-Key`), `customerName`, dan `tableLabel` (string
bebas; ikut ke struk). `TRUST_PROXY` mengatur Express trust proxy.

WebSocket mewajibkan JWT. Maker hanya bisa masuk room stasiunnya; layar display
memakai token read-only dari `POST /v1/auth/display-token` dan hanya menerima
`ticket:ready` / `ticket:eta-updated` berisi nomor, status, dan ETA.

## Test

```
npm run build --workspace @order-q/api
npm run lint --workspace @order-q/api
npm test --workspace @order-q/api
npm run test:integration --workspace @order-q/api
```

CI GitHub Actions (`.github/workflows/ci.yml`) menjalankan keempatnya pada push/PR dengan
service container PostgreSQL. **Status CI TIDAK TERVERIFIKASI** sampai run pertama di GitHub terlihat.

Terakhir dijalankan lokal: build 0 error, lint 0 error, **unit 48/48**, **integrasi 33/33**
(dijalankan juga dengan `TZ=UTC` dan `TZ=Asia/Jakarta`). Integration mencakup konkurensi
(stok 1 porsi dan kombinasi terbalik A,B vs B,A), idempotensi `clientTicketId`+header
(422 untuk body beda), QRIS timeout aman multi-instance, refresh reuse, lockout persisten,
split payment, tutup shift, RBAC multi-stasiun, WAIT_ALL & CALL_PER_STATION, ETA/EMA,
receipt/reprint, isolasi room WebSocket + token display, dan webhook Xendit.

## Endpoint penting

- `GET /health`, `GET /health/ready` (tanpa auth, bebas throttler)
- `POST /v1/auth/pin-login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`,
  `POST /v1/auth/display-token`, `GET /v1/auth/me`
- `POST /v1/shifts/open`, `GET /v1/shifts/current`, `GET /v1/shifts/:id/summary`, `POST /v1/shifts/:id/close`
- `GET/POST /v1/menus`, `GET/POST /v1/ingredients`, `GET/PUT /v1/recipes/:menuId`, `POST /v1/stock/check`
- `POST /v1/orders/checkout` (header `idempotency-key: uuid` atau field `clientTicketId`),
  `POST /v1/orders/validate`
- `GET /v1/tickets`, `GET /v1/tickets/:id/receipt?width=32|48`, `POST /v1/tickets/:id/reprint`
- `POST /v1/tickets/subtickets/:id/priority/bump`, `PATCH /v1/tickets/subtickets/:id/status`,
  `POST /v1/tickets/:id/complete`, `POST /v1/tickets/:id/cancel`
- `GET /v1/stations/:id/queue`, `PUT /v1/users/:id/stations`, `GET/PATCH /v1/settings`

## Status jujur (per Sesi C)

Terverifikasi: boot & smoke HTTP, WebSocket, anti-oversell, idempotensi per outlet + hash,
lockout PIN persisten bertahap, rotasi refresh + pencabutan family, helm/CORS/Swagger production,
ETA rentang + EMA + prioritas SLA/bump, receipt & ESC/POS + audit reprint, konkurensi multi-bahan,
partial-ready dua mode, maker multi-stasiun, log terstruktur ber-request-id dengan redaksi.

Belum / di luar scope:
- **Mobile: 0 layar** dan **Fase 3 offline-first** belum dikerjakan.
- Xendit baru diverifikasi HMAC lokal (mock gateway yang diuji), bukan sandbox nyata.
- Printer fisik dikerjakan di mobile; backend hanya menyiapkan data/byte ESC/POS.
- Customer-facing display baru di level kontrak/token & event; layar mobile belum dibuat.

## Utang tersisa

- ~216 lint warning (0 error); aturan promise ketat sudah ERROR pada modul kritis.
- Refund tunai penuh (belum partial refund).
- `User.stationId` dipertahankan untuk kompatibilitas transisi (di samping `UserStation`).
- CI GitHub Actions: workflow sudah ada dan diperbaiki urutannya; status run terbaru harus dicek
  di tab Actions / API publik GitHub.
