# AGENTS.md — DompetKu (FinansialKu)

Aplikasi Manajemen Keuangan Pribadi, Multi-Akun & Pindah Dana berbasis Google Apps Script + Google Sheets + Alpine.js + Tailwind CSS.

## Architecture

- Backend: `Code.gs` (Google Apps Script), database: Google Sheets (sheet names: Accounts, Transactions, Transfers, Categories, Users, Settings).
- Frontend: `Index.html` → `dist/index.html`. All Alpine state lives in `JavaScript.html` (`appData()`); `Stylesheet.html` holds shared CSS. Both are inlined into each page by `build.js`.
- Runtime: `google.script.run` inside Apps Script, else `runApi()` → `fetchFromAppsScript()` POSTing `{ action, args }` to each URL in `WEB_APP_URLS`. The Apps Script POST must use header `'Content-Type': 'text/plain;charset=utf-8'`.
- `doGet()` in `Code.gs` serves `Index.html`. `doPost()` is the JSON API entrypoint; only actions in `ALLOWED_ACTIONS` are permitted.

## Commands

```bash
npm install
npm run build            # build.js → dist/
npm run dev              # serve dist/ via `serve`
npm run deploy:firebase  # build & deploy to Firebase Hosting
# atau jalankan deploy-firebase.bat di Windows
```

## Build & deploy

- **Never edit `dist/` directly**. Change source files in root and rebuild.
- `build.js` inlines `Stylesheet.html` + `JavaScript.html` into every `*.html` except those two, replaces `<?!= serverData ?>` with `{}`, copies PWA assets + `manifest.json` + `sw.js`, and lowercases output names (`Index.html` → `dist/index.html`).
- `dist/`, `node_modules/`, and `.firebase/` are gitignored.
- Hosting options:
  - **Firebase Hosting**: `firebase.json` + `.firebaserc` + `deploy-firebase.bat` (or `npm run deploy:firebase`).
  - **Vercel**: `vercel.json`: `{ cleanUrls: true, outputDirectory: "dist" }`.

## Environment & API layer

- `DEV_WEB_APP_URL` / `PROD_WEB_APP_URL` in `JavaScript.html` are placeholders (`..._WEB_APP_URL_HERE/exec`). `WEB_APP_URLS = [PROD_WEB_APP_URL]`.
- To connect a real backend: deploy `Code.gs` as a web app (execute-as "Me", access "Anyone"), paste the `/exec` URL into `WEB_APP_URLS`, rebuild.
- On standalone / local mode without a URL, the app works flawlessly with local storage cache and seeded demo accounts.

## Frontend–backend sync rules

- Every function called via `runApi('name')` must be in `ALLOWED_ACTIONS` inside `doPost()`.
- `getAllData(isAdmin)` returns: `accounts`, `transactions`, `transfers`, `categories`, `settings` (plus `users` when `isAdmin` is true).
- Sheet schema changes require coordinated updates: `setupDatabase()` headers, `getSheetData` row mapping, and frontend getters.
- Backend save/update functions accept PascalCase and camelCase keys.

## Caching

- Backend: `getAllData()` caches under `DOMPETKU_DATA_ADMIN` / `DOMPETKU_DATA_PUBLIC` (60s TTL) via `CacheService.getScriptCache()`.
- **Call `clearDataCache()` after every write**.
- Frontend: `localStorage` keys `DOMPETKU_LANDING_DATA` (fast first paint) and session keys (`DOMPETKU_TOKEN`, `DOMPETKU_USER`, `theme`).

## Data model

- `Wallets`: WalletID, NamaDompet, Deskripsi, Ikon, Warna, OwnerUserID, IsActive, CreatedAt
- `Accounts`: AccountID, WalletID, NamaAkun, TipeAkun, NomorAkun, SaldoAwal, SaldoSekarang, Warna, Ikon, IsActive
- `Transactions`: TransactionID, WalletID, Tanggal, TipeTransaksi, AccountID, CategoryID, Nominal, Deskripsi, BuktiUrl, KasirUsername
- `Transfers`: TransferID, WalletID, Tanggal, FromAccountID, ToAccountID, Nominal, BiayaAdmin, TotalKeluar, Catatan, KasirUsername
- `Categories`: CategoryID, WalletID, NamaKategori, Tipe, Ikon, Warna, BudgetBulanan, Urutan, IsActive
- `Users`: UserID, Username, Password, Role, FullName, Pin, IsActive, AssignedWallets
- `Settings`: SettingKey, SettingValue

Relational links:
- `Accounts.WalletID → Wallets.WalletID`
- `Transactions.WalletID → Wallets.WalletID`
- `Transactions.AccountID → Accounts.AccountID`
- `Transactions.CategoryID → Categories.CategoryID`
- `Transfers.WalletID → Wallets.WalletID`
- `Transfers.FromAccountID → Accounts.AccountID`
- `Transfers.ToAccountID → Accounts.AccountID`
- `Categories.WalletID → Wallets.WalletID` (or `'*'` for global categories)

Business rules:
- Multi-Dompet: Data accounts, transaksi, transfer, dan kategori terisolasi per Dompet (`WalletID`). Mengganti dompet aktif memfilter seluruh tampilan secara independen.
- Hak Akses User & Superadmin:
  - `superadmin`: Akses penuh ke seluruh dompet (`*`) dan menu Manajemen Pengguna. Satu-satunya peran yang dapat membuat dompet baru. Dapat menambah, mengedit, mengaktifkan/menonaktifkan, dan menghapus user.
  - `admin`: Mengelola dompet dan mutasi yang ditugaskan (`AssignedWallets`). Dapat mengedit dompet, serta menambah, mengedit, dan menghapus akun dan kategori (tidak dapat membuat dompet baru).
  - `user`: Mencatat dan melihat transaksi pada dompet yang diizinkan; dapat mengedit dompet yang ditugaskan, serta menambah dan mengedit akun dan kategori, namun TIDAK diizinkan membuat dompet baru, maupun menghapus akun, dompet, dan kategori.
- Pindah Dana: `FromAccountID !== ToAccountID`, Saldo `FromAccount` harus mencukupi `(Nominal + BiayaAdmin)`.
- Pengurangan dan penambahan saldo dilakukan secara sinkron/atomik.
- Kategori Baku Sistem: Setiap dompet wajib memiliki 3 kategori sistem permanen bertipe `PENGELUARAN`:
  1. `Operasional`: Kategori beban operasional utama untuk Laporan Laba/Rugi & Operasional.
  2. `Bagi Hasil`: Kategori alokasi bagi hasil / dividen usaha.
  3. `Admin Bank`: Kategori baku untuk menampung seluruh biaya administrasi transfer bank / transaksi keuangan.
  - Sifat Kategori Sistem: Kategori ini bersifat permanen dan dilindungi penuh. Tombol edit dan hapus ditiadakan; pengguna maupun admin tidak dapat mengedit atau menghapus kategori baku ini.
- Biaya Admin Transfer & Sinkronisasi Laporan:
  - Setiap mutasi pindah dana dengan `BiayaAdmin > 0` otomatis dicatat/disinkronkan sebagai transaksi pengeluaran kategori `Admin Bank` (`TXN-ADM-[TransferID]`).
  - Transaksi admin bank terintegrasi ke Laporan Keuangan, Laporan Operasional, dan Category Breakdown tanpa double-deduction (pengurangan saldo akun sudah dihitung sekali saat eksekusi transfer).
  - Menghapus transaksi atau transfer membalikkan saldo akun ke kondisi semula serta menghapus transaksi biaya admin pasangannya secara bersih.
- Laporan Operasional: Perhitungan beban dan pengurangan laba murni hanya berasal dari kategori pengeluaran yang dipilih pengguna (biaya lain-lain di luar kategori terpilih ditiadakan dari tabel rekapitulasi operasional).


## Conventions

- API responses: `{ success: boolean, message: string, data?: any }`.
- Backend dates: `dd/MM/yyyy HH:mm`.
- IDs: `'PREFIX-' + new Date().getTime()`.
- Booleans stored as `'TRUE'`/`'FALSE'`.
- Default Superadmin seeded by `setupDatabase()`: `superadmin` / `admin123`.
- Actions tambahan: `saveWallet`, `deleteWallet`, `saveUser`, `deleteUser`, `archiveYearData`, `getArchiveYears`, `getArchiveData`, `restoreArchiveData`.
- Tutup Buku & Arsip Tahunan: Memindahkan baris transaksi & transfer tahun target ke tab `Archive_Transactions_YYYY` & `Archive_Transfers_YYYY`, mereset sheet transaksi aktif, dan mengunci `SaldoAwal` = `SaldoSekarang` untuk setiap akun secara atomik.
