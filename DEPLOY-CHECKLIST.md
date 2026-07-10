# Deploy Checklist: DagangOS Ecosystem (Portal + DapurOS + GerainaOS)
**Tanggal:** _isi saat deploy_ | **Deployer:** FAJAR

Arsitektur: Cloudflare Worker `dagangos-portal` (routing `/`, `/dapuros/*`, `/geraina/*`, proxy `/api/*` → `BACKEND_ORIGIN`) · FastAPI + MongoDB Atlas (backend) · GitHub Actions (build kedua SPA dari repo DapurOS & GerainaOS → `dist/` → `wrangler deploy`).

### Pra-Deploy — WAJIB sebelum rilis pertama ini
- [ ] **Rotasi kredensial MongoDB Atlas** (`geraina_user`) — password lama pernah tersimpan plaintext di `.env`. Buat user/password baru di Atlas, lalu set di env platform backend (BUKAN di file).
- [ ] **Ganti `JWT_SECRET_KEY`** dengan secret acak baru (`openssl rand -hex 32`). Catatan: semua sesi login lama otomatis tidak berlaku — pengguna login ulang.
- [ ] Set env backend production: `MONGO_URL`, `DB_NAME`, `JWT_SECRET_KEY`, `CORS_ORIGINS=https://dagangos.com`, `ALLOW_WEBHOOK_SIMULATE=false`, `ENV=production` (mengaktifkan guard anti `change-me`).
- [ ] `pip install -r requirements.txt` di backend memuat `websockets==12.0` (real-time KDS) — verifikasi log startup TIDAK memuat "No supported WebSocket library".
- [ ] Perbaiki remote git repo utama: `git remote set-url origin git@github.com:azharinoyumetv-ctrl/<nama-repo-sebenarnya>.git` (saat ini masih placeholder `<repository>`).
- [ ] Push ketiga repo (dagangos-main, DapurOS, GerainaOS) → memicu GitHub Actions.
- [ ] Secret CI `REPO_READ_TOKEN` masih berlaku (workflow checkout DapurOS/GerainaOS).
- [ ] CI hijau: build GerainaOS & DapurOS sukses, `node build.js` menghasilkan `dist/` lengkap (`index.html`, `dapuros/`, `geraina/`).
- [ ] Tidak ada kredensial di repo: `git grep -I "mongodb+srv\|dagangos123\|mock_master_token"` harus kosong di ketiga repo.

### Deploy
- [ ] `wrangler deploy` (atau via CI) — set `BACKEND_ORIGIN` sebagai var Worker bila backend bukan `api.dagangos.com`.
- [ ] Smoke test portal: `https://dagangos.com/` render, form login SSO tampil TANPA tombol demo.
- [ ] Smoke test SPA: `/dapuros/login` dan `/geraina/login` render; deep-link `/dapuros/app/pos` tanpa sesi → diarahkan ke login.
- [ ] Smoke test API via edge: `POST https://dagangos.com/api/auth/register` (akun uji baru) → 200; login password salah → 401; password `dagangos123` pada akun uji → 401.
- [ ] Smoke test WebSocket: `wss://dagangos.com/api/ws/{store_id}` konek & balas PONG. Catatan: verifikasi Worker meneruskan upgrade WebSocket ke origin — jika gagal, arahkan WS langsung ke host backend.
- [ ] Alur inti DapurOS: buka sesi meja → pesanan → tiket muncul di KDS → checkout → meja Vacant.
- [ ] GerainaOS: klik tombol **Suite** → menu ekosistem muncul (bukan layar putih), pindah aplikasi tanpa login ulang.
- [ ] Pantau 15 menit: error rate Worker (Cloudflare dashboard) & log backend.

### Pasca-Deploy
- [ ] Uji register akun asli end-to-end + 1 transaksi nyata di kedua aplikasi.
- [ ] Verifikasi data tenant terisolasi (akun A tidak melihat data akun B).
- [ ] Update catatan rilis / tandai versi (`git tag v1.0.0`).
- [ ] Hapus akun/database uji dari Atlas.

### Pemicu Rollback (putuskan SEBELUM deploy)
- Error rate `/api/*` > 5% selama 5 menit → rollback Worker (`wrangler rollback`) / redeploy versi sebelumnya.
- Login atau register gagal untuk akun valid → rollback backend.
- KDS tidak menerima tiket real-time > 10 menit → periksa websockets lib & proxy WS; rollback bila perlu.
- Layar putih di salah satu SPA → rollback Worker ke build sebelumnya.

### Catatan Risiko Tersisa
- Panel Integrasi menampilkan placeholder API key (xnd_live_..., dsb.) dari seed — pastikan tidak pernah diisi kunci asli di database demo.
- EDC & beberapa alur pembayaran masih simulasi (belum terhubung gateway nyata) — jangan aktifkan untuk transaksi kartu sungguhan.
- Backend menyajikan `/docs` (Swagger) publik — pertimbangkan menonaktifkan di production (`FastAPI(docs_url=None)`).
