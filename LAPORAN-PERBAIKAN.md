# Laporan Perbaikan DagangOS — Menuju Production Ready

Tanggal: 3 Juli 2026 · Cakupan: DapurOS (utama), GerainaOS, portal

## Perbaikan Keamanan (kritis)

1. **Backdoor kata sandi universal dihapus** — `DapurOS/backend/routes_auth.py` sebelumnya menerima `dagangos123`/`demo123456` sebagai kata sandi untuk **semua akun**. Kini kata sandi demo hanya berlaku untuk akun demo resmi (`admin@dagangos.com` dkk).
2. **Auto-login diam-diam dihapus** — `AuthContext.jsx` (DapurOS & GerainaOS) sebelumnya otomatis membuat sesi demo `mock_master_token` untuk semua pengunjung tanpa token, sehingga halaman login tidak pernah muncul. Kini pengunjung tanpa sesi diarahkan ke login; demo tetap 1-klik lewat tombol resmi. Sesi tersimpan hanya dipertahankan saat backend offline (mode kasir offline), dan token kedaluwarsa (401) memaksa login ulang.
3. **Kredensial**: `backend/.env` berisi kredensial MongoDB Atlas & JWT secret asli (untungnya tidak ter-commit di git). Ditambahkan `backend/.env.example` sebagai templat. **Disarankan: rotasi password Atlas & JWT secret tersebut karena pernah tersimpan di disk bersama proyek.**

## Fitur PRD yang Hilang — Kini Diimplementasikan

4. **Modul Spoilage Log (PRD 3.2.3)** — sebelumnya tidak ada sama sekali di backend; form "Catat Bahan Terbuang" hanya menimpa stok dan membuang alasan tanpa jejak audit. Kini:
   - `POST /api/ingredients/{id}/spoilage` — potong stok atomik (ditolak jika stok kurang) + simpan log audit.
   - `GET /api/ingredients/spoilage/logs` — riwayat lengkap; `GET /api/ingredients/spoilage/reasons` — alasan resmi.
   - Alasan baku Indonesia: *Kedaluwarsa (Expired)*, *Tumpah / Rusak Fisik (Spilled)*, *Kesalahan Pembuatan (Prep Error)* (alias Inggris lama tetap diterima).
   - Frontend `Ingredients.jsx`: form memakai endpoint baru + tabel "Riwayat Bahan Terbuang" dengan `data-testid` untuk pengujian.
   - Broadcast WebSocket `STOCK_UPDATE` setelah pencatatan.

## Bug yang Diperbaiki

5. **WebSocket real-time mati di produksi** — `requirements.txt` tidak memuat pustaka `websockets`, sehingga uvicorn menolak koneksi `wss://…/api/ws/{store_id}` (404). Ditambahkan `websockets==12.0`. (Ini penyebab KDS tidak pernah update real-time.)
6. **Rute kategori saling menimpa** (DapurOS & GerainaOS) — `routes_products.py` dan `routes_inventory.py` sama-sama mendaftarkan `GET /api/products/categories`; halaman "Kategori" menerima daftar string alih-alih objek. Endpoint kasir dipindah ke `/api/products/category-names`; POS diperbarui.
7. **Peran (RBAC) tidak konsisten** — register membuat user berperan `admin`, padahal `RoleGuard` hanya mengenal `Owner/Manager/Cashier/Warehouse` (akun `admin` kehilangan akses modul). Kini register memberi `Owner`, `require_admin` menerima keduanya, dan `RoleGuard` memetakan `admin` → setara Owner (kompatibel dengan akun lama).
8. **Berkas mati** — `DapurOS/routes_floormap.jsx` (tersasar di root) dan `frontend/src/floormap/FloorMap.jsx` tidak direferensikan siapa pun; folder `pages/floormap` kosong. Belum dihapus (butuh izin hapus berkas) — aman dihapus manual.

## Verifikasi (Playwright — 14/14 LULUS)

Suite: `DapurOS/tests/e2e/dapuros-prd-suite.mjs` (cara pakai di `tests/e2e/README.md`).

Login SSO + tombol demo 1-klik · denah meja 3 lantai (Lantai 1, Lantai 2 VIP, Rooftop) dengan status meja & CRUD meja/lantai · daftar BOM + modal spoilage + riwayat & pengurangan stok · KDS render + filter stasiun · Menu QR (QRCodeSVG) · Simulator EDC (BCA/Mandiri/BRI/BNI) · WebSocket konek + PONG · semua halaman utama bebas blank-screen & tanpa uncaught error.

Alur penuh juga diverifikasi via API: buka sesi meja → status *Seated* → pesanan dine-in → stok terpotong atomik → tiket KDS muncul di stasiun benar (Bar utk minuman) → status *Cooking* → split bill equal (per orang benar termasuk pajak/service) → checkout → meja kembali *Vacant*.

Keamanan diverifikasi: kata sandi universal kini ditolak (401) pada akun nyata; login demo resmi tetap berfungsi; register menghasilkan peran `Owner`.

## Rekomendasi Berikutnya

Rotasi kredensial Atlas & JWT secret; nonaktifkan `ALLOW_WEBHOOK_SIMULATE` di produksi; pertimbangkan menonaktifkan `mock_master_token` (akses demo tanpa tanda tangan JWT) lewat env flag di produksi; hapus dua berkas mati di atas; samakan struktur GerainaOS bila fitur F&B tidak dipakai.
