# Uji end-to-end terhadap backend lokal (online)

## Otomatis (dijalankan di mesin pengembang)

`scripts/e2e-smoke.mjs` menjalankan alur: login PIN → buka shift → validate → checkout tunai →
hubungkan Socket.IO → ubah status subtiket → verifikasi event diterima. Jalankan backend lebih dulu:

```bash
# terminal 1
npm run db:generate --workspace @order-q/api
npx prisma migrate deploy             # di apps/api
npm run db:seed --workspace @order-q/api
npm run start:prod --workspace @order-q/api

# terminal 2
EXPO_PUBLIC_API_URL=http://localhost:3000 node apps/mobile/scripts/e2e-smoke.mjs
```

## Manual dengan Expo Go (TIDAK TERVERIFIKASI di mesin ini)

1. Pastikan HP dan komputer satu jaringan. Cari IP LAN komputer (`ipconfig` / `ifconfig`), mis. `192.168.1.10`.
2. Set `EXPO_PUBLIC_API_URL=http://192.168.1.10:3000` sebelum `npx expo start`, atau isi alamat itu di
   layar **Setup Perangkat** saat pertama membuka aplikasi. **Jangan pakai `localhost`** di HP —
   `localhost` berarti perangkat itu sendiri.
3. Buka Expo Go, scan QR. Di Setup Perangkat pilih perangkat **Kasir**, kode outlet `DEMO01`, alamat server IP LAN.
4. Login sebagai Adi (PIN `123456`), buka shift dengan kas awal `100000`.
5. Tambah Kopi Susu ke keranjang → Bayar → uang pas → tiket `A-001` muncul di layar Sukses.
6. Di HP/perangkat kedua, Setup → **Dapur-KDS** → login sebagai Budi (PIN `123456`). Subtiket BAR
   muncul di kolom **Baru**; tekan **Mulai**, lalu **Selesai**. Perhatikan timer SLA berubah warna.
7. Di perangkat ketiga, Setup → **Display** → minta owner (Sinta) membuat kode pairing dari aplikasi
   Kasir (`POST /v1/auth/display-pair-code` dengan token owner), masukkan 6 digit di Display. Nomor
   tiket muncul saat subtiket siap.
8. Matikan Wi-Fi sejenak pada KDS: badge **OFFLINE** muncul dan daftar tetap terisi (polling 5 detik).

Kesesuaian visual, haptic, dan suara di perangkat nyata harus diverifikasi dengan langkah di atas.
