# Production Readiness Audit — DagangOS Ecosystem
Date: 2026-07-10 · Scope: Portal (Worker), DapurOS, GerainaOS · Method: static code review (no live deploy access, no e2e run)

This picks up from `LAPORAN-PERBAIKAN.md` (2026-07-03) and `DEPLOY-CHECKLIST.md`. Short version: the critical auth backdoors described in the July 3 report are genuinely gone from the code. What's left is mostly platform-side configuration you need to verify yourself, two still-open items your own checklist already flagged, and some dead code worth deleting before launch.

## 1. Already fixed (verified in code today)

- **Universal backdoor password** (`dagangos123`/`demo123456` accepted for any account) — gone. `routes_auth.py` login only checks `bcrypt` hash match.
- **Silent mock auto-login** — `AuthContext.jsx` now explicitly treats a `mock_master_token` as "no session" and forces login; it no longer fabricates a session for anonymous visitors.
- **Category route collision** (`/api/products/categories` vs `/api/inventory/categories`) — resolved, only one route registers it.
- **Git remote placeholder** — fixed, points to the real repo.
- **`websockets` dependency for DapurOS's real-time KDS** — present in `DapurOS/requirements.txt`. (GerainaOS has no WebSocket routes at all, so it doesn't need this package — the earlier concern I had about it missing there was a false alarm.)
- **Real credentials on disk** — both `backend/.env` files now hold only local-dev placeholders (`mongodb://localhost:27017`, `JWT_SECRET_KEY=change-me`) with a comment directing real values to platform env vars. `auth.py` also has a boot-time guard: it refuses to start with the default secret if `ENV=production`.

## 2. Critical — verify on the actual deploy platform (I can't see these from the repo)

1. **Confirm `JWT_SECRET_KEY` and MongoDB Atlas credentials are actually rotated and set as real env vars on Render/Cloudflare**, not just locally. The code will only block a boot with the placeholder secret if `ENV=production` is also set — confirm that variable is set too.
2. **Confirm `CORS_ORIGINS` on the live backend is `https://dagangos.com`**, not the localhost default still sitting in the local `.env`.
3. **Confirm the GitHub Actions secret `REPO_READ_TOKEN` is valid and CI is green** for all three repos — can't check this from a local checkout.
4. **Re-run the Playwright suite** (`DapurOS/tests/e2e/dapuros-prd-suite.mjs`) before shipping. The July 3 report claims 14/14 passing, but there have been commits since (`Worker CORS allowlist + module-routing invariant`, `WhatsApp Test button`, landing redesigns) that touch auth/routing paths — I have not re-run the suite myself, so treat that 14/14 as stale until confirmed.

## 3. Still open — carried over from your own checklist, not yet fixed

5. **Swagger/OpenAPI docs are public.** Neither `DapurOS/backend/server.py` nor `GerainaOS/backend/server.py` sets `docs_url=None`, and the Cloudflare Worker (`src/index.js` line 26) explicitly proxies `/docs` and `/openapi.json` to the backend at the edge. Anyone can currently browse your full API surface at `dagangos.com/docs`. Fix: `FastAPI(title=..., docs_url=None, redoc_url=None, openapi_url=None)` in both backends, or gate it behind an env flag.
6. **Worker leaks stack traces.** The catch-all error handler in `src/index.js` (line ~164) returns `globalErr.stack` as plain text on any unhandled 500. Replace with a generic error message and log the stack server-side only.
7. **Payment/EDC is still simulated** (Xendit QRIS/e-wallet, EDC terminals) — this is a known, intentional gap per your own notes, not a regression. Just don't market or enable "real card payments" until a live gateway is wired in, and keep the seeded placeholder keys (`xnd_live_...` in `mockDb.js`) out of any database that isn't the demo one.

## 4. Cleanup — not launch-blocking, but worth doing

8. **Dead mock-data layer is still shipping.** `frontend/src/api/mockDb.js` (fake suppliers, customers, Xendit merchant IDs) and a ~150-line `handleMockRequest()` function in `client.js` are both still in the bundle. The only thing stopping them from being live is that the one line that would activate them is commented out (`client.js` ~line 172). It's inert today, but it's a landmine: if anyone re-enables that interceptor, the app starts silently serving fake data instead of hitting the real backend, and it would look like it's "working." Recommend deleting both files rather than leaving them disabled — same for DapurOS and GerainaOS (duplicated in both).
9. **Stale comments referencing mock behavior** in `GoodsReceiving.jsx`, `SupplierInvoice.jsx` (mention `mockDb` but don't actually use it), and `routes_kds.py` ("dummy time elapsed" comment on code that actually computes real elapsed time from `created_at`). Harmless, just confusing — worth a pass.
10. **Large binaries sitting in the repo**: `document_test2.pdf` (8.7MB), `document_test3.pdf` (4MB), `geraina-pos-debug.apk` (11.9MB), plus `.wrangler/`, `test-results/`, `dist/`. Confirm these are gitignored / not part of what actually deploys.

## 5. What I did not check

I did not have access to the live Render/Cloudflare dashboards, GitHub Actions run history, or a running MongoDB instance, so items in Section 2 are unverified by me — they're read directly off your own `DEPLOY-CHECKLIST.md` as still-required steps. I also did not execute the Playwright suite or do a live two-account tenant-isolation test; the code path for store scoping (`auth.py::_resolve_store`, scoped by `owner_user_id` from the JWT) reads correctly, but that's a code read, not a live test.

## Bottom line

No live auth backdoors found. The two concrete code fixes still needed are small (disable `/docs`, stop leaking stack traces). The rest is deploy-platform configuration you need to confirm yourself, plus optional cleanup of dead mock code. Given the deadline, I'd prioritize: rotate secrets + confirm `ENV=production` + `CORS_ORIGINS` on the real platform → disable `/docs` → re-run the Playwright suite → ship. The mock-data cleanup and stale comments can happen after launch.
