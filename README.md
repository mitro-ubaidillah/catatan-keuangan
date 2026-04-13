# Bot Catat Keuangan (WA + Telegram) - DB First

Arsitektur bot sekarang menggunakan **database sebagai penyimpanan utama** (tanpa ketergantungan Google Sheets/Drive untuk pencatatan harian).

## Fitur

- Registrasi user:
  - `/daftar Mitro`
  - `/register Mitro`
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
- Web dashboard:
  - Login/Register user
  - User dashboard (ringkasan finansial + data terbaru)
  - Superadmin dashboard (kelola user, role, aktif/nonaktif)

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

## Role Dashboard

- `user`: lihat dashboard milik sendiri
- `superadmin`: lihat dashboard global + manajemen user

## Aksi Superadmin

- Ubah role user ↔ superadmin
- Aktif/nonaktifkan user
- Pantau total user, transaksi, aset

## Catatan Migrasi

- Command `/sheet` saat ini non-aktif dan akan memberi pesan bahwa mode spreadsheet dimatikan.
- Jika nanti perlu export laporan, tambahkan fitur `/export` (CSV atau sinkronisasi opsional ke Sheets).

## Catatan WA reverse engineering

Pendekatan WA non-resmi tetap berisiko suspend. Gunakan nomor cadangan.
