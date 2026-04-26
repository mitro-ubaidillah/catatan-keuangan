# Bot Catat Keuangan (WA + Telegram) - DB First

Arsitektur bot sekarang menggunakan **database sebagai penyimpanan utama** (tanpa ketergantungan Google Sheets/Drive untuk pencatatan harian).

## Fitur

- Registrasi user:
  - `/daftar Mitro`
  - `/register Mitro`
  - Bot kirim link onboarding web untuk set email/password
- Catat transaksi:
  - `/pengeluaran beli bakso 10000`
  - `/pemasukan bonus tahunan 3000000`
- Catat aset/tabungan:
  - `/menabung emas antam sejumlah 10 gram`
- Statistik dari database:
  - `/statistik`
  - `/statistik 2026`
  - `/statistik 2026-04`
- Health check:
  - `/health` atau `/ping`
- Cek profil/status user:
  - `/profil`
  - `/profile`
  - `/status`
- Export file Excel:
  - `/export`
  - Bot akan mengirim file `.xls` berisi sheet `Transactions` dan `Assets`
- Web dashboard:
  - Login/Register user
  - User dashboard (ringkasan finansial + data terbaru)
  - Superadmin dashboard (kelola user, role, aktif/nonaktif)
  - Chart pertumbuhan user + log aktivitas terbaru
- Subscription:
  - Trial otomatis untuk user baru
  - Pembatasan akses transaksi/stat saat subscription non-aktif
  - Manajemen subscription dari dashboard superadmin
- Reliabilitas bot:
  - Idempotency incoming message (hindari proses duplikat)
  - Rate limit command berat (`/statistik`, `/export`)
  - Queue job command berat
  - Retry kirim pesan ke Telegram/WhatsApp dengan exponential backoff

## Arsitektur Baru (DB First)

- Channel adapter: Telegram + WhatsApp
- Command parser: ekstraksi intent + payload dari pesan chat
- Storage utama: SQLite (Prisma)
- Web layer: Express + session cookie signed (HMAC)
- UI layer: TailwindCSS (CDN) + Vanilla JS
- Entitas inti:
  - `User`
  - `Transaction`
  - `Asset`

## Struktur

- `src/adapters`: konektor channel
- `src/core`: parser + command handler
- `src/services/db.ts`: Prisma client
- `src/services/userRegistry.ts`: registrasi/mapping user
- `src/services/financeStore.ts`: simpan transaksi/aset + statistik
- `prisma/schema.prisma`: skema database
- `src/web/server.ts`: route dashboard web
- `src/web/service.ts`: auth user web + admin management

## Setup

1. Install Node.js 20+
2. Copy env:

```bash
cp .env.example .env
```

3. Install dependency:

```bash
npm install
```

4. Isi env web minimal:

```env
WEB_BASE_URL="http://localhost:3000"
SESSION_SECRET="ganti-dengan-secret-panjang-min-16-karakter"
SUPERADMIN_EMAIL="admin@contoh.com"
SUPERADMIN_PASSWORD="password-admin-awal"
```

5. Generate Prisma client dan migrate schema:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name db_first_with_web_auth
```

6. Jalankan bot + web:

```bash
npm run dev
```

7. Akses web:
- `http://localhost:3000/login`
- `http://localhost:3000/register`
- Superadmin otomatis di-bootstrap dari env saat server start

8. Alur onboarding Telegram -> Web:
1. User kirim `/daftar Nama` di Telegram
2. Bot mengirim link onboarding (`/onboarding/:token`)
3. User buka link dan set `nama + email + password`
4. Setelah submit, user otomatis login ke dashboard web

## Role Dashboard

- `user`: lihat dashboard milik sendiri
- `superadmin`: lihat dashboard global + manajemen user

## Aksi Superadmin

- Ubah role user ↔ superadmin
- Aktif/nonaktifkan user
- Delete user dan restore user
- Pantau total user, transaksi, aset

## Catatan Migrasi

- Command `/sheet` saat ini non-aktif dan akan memberi pesan bahwa mode spreadsheet dimatikan.

## Catatan WA reverse engineering

Pendekatan WA non-resmi tetap berisiko suspend. Gunakan nomor cadangan.
