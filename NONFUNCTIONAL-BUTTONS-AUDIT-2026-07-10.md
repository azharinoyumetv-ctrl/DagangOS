# Non-Functional Dashboard Elements — DapurOS & GerainaOS
Date: 2026-07-10 · Method: static code read (grep for dead handlers + manual read of the highest-risk pages: Reports, Settings, Pricing, PaymentConfig, Integrations, QrMenu). Not exhaustive across all 44+ pages per app — see "What I haven't checked" at the bottom.

Both apps share the same frontend lineage (identical `client.js`/`AuthContext.jsx` earlier confirmed this), so every bug below exists **in both DapurOS and GerainaOS** unless noted otherwise.

## A. Worst one: buttons that claim success even when the save actually failed

This is more dangerous than a dead button — it actively tells the user something worked when it didn't, so nobody notices until data is missing later.

- **`pages/settings/Settings.jsx:33-40`** — `handleSave`. On `.catch()`, shows `"Pengaturan ... berhasil disimpan! (Local Mode)"` — a fake success message — no matter why the save failed.
- **`pages/payments/PaymentConfig.jsx:397-416`** — `handleSave`. Same pattern: `.catch()` shows `"Konfigurasi pembayaran ... berhasil disimpan! (Local Mode)"` regardless of the actual error.
- **`pages/Pricing.jsx:44-56`** — `handleUpgrade`. Worst of the three: on failure it calls `setPlan(tierId)` (client-side-only state update) **and** shows `"Sukses mengubah paket ke ..."`. A failed plan upgrade will visually look like it succeeded in the UI even though the backend (`POST /api/pricing/upgrade`, which does exist and works) never recorded it.

**Fix direction:** in all three, the `.catch()` block should show a real error message (and log it), not a fake success. Delete the "(Local Mode)" fallback entirely — it reads like a leftover from offline-demo development.

## B. Whole report tabs are hardcoded fake data, not your real numbers

`pages/reports/Reports.jsx` (both apps, identical):

- **"Laba Rugi" (P&L) tab** (line ~187, `profitData`) — six months of Jan–Jun revenue/cost/profit are literal hardcoded numbers. There is no backend endpoint for profit/loss at all (`routes_pricing.py`, `routes_orders.py`, etc. — nothing named profit/P&L exists). This tab will show the same numbers to every store, forever, regardless of actual sales.
- **"Arus Kas" (cashflow) tab** (line ~215, `cfData`) — same problem, hardcoded weekly inflow/outflow. No backend endpoint exists.
- **"Stok/Inventaris" tab** — "Rasio Turn-Over Stok" stat (line ~141) is hardcoded `"4.2x / bulan"`, never computed from real data.

This is a bigger gap than a UI bug — it's a missing feature (no backend aggregation for profit/cashflow) currently disguised as a working report. Worth deciding now: hide these two tabs before launch, or scope the backend work to make them real. Shipping fabricated financial numbers to a merchant is the kind of thing that erodes trust fast once someone notices the numbers never change.

## C. Buttons that are pure no-ops (alert() only, no backend call)

- **`Reports.jsx:266`** (Pajak tab) — "Unduh Format e-Faktur CSV" button just pops `alert("Laporan e-Faktur DJP siap diunduh...")`. No file is generated, no request is made.
- **`Settings.jsx:185`** — "Test print struk" button just pops `alert("Mengirim struk test print...")`. Doesn't talk to a printer.
- **`products/QrMenu.jsx:151`** — button just `alert()`s the QR URL text instead of showing/copying/opening it (DapurOS only — GerainaOS doesn't have a QR menu page).

## What's actually fine (checked, not a bug)

- `Integrations.jsx` — save button and the WhatsApp test-send button both make real API calls and handle real responses. Not a dead page.
- `Dashboard.jsx` — pulls all stat cards from real endpoints (`/orders/stats`, `/products`, `/debt/receivables`, etc.), no hardcoded numbers found.
- Most other `alert()` calls in the codebase (Sales, POS, Attendance, StockTransfer, AccountsPayable/Receivable, GoodsReceiving, KdsScreen, PurchaseOrder) are legitimate success/error messages shown *after* a real `api.post()` call — just using `alert()` instead of a toast, which is a UX smell, not a functionality bug.

## Live verification on dagangos.com (logged into the real "Dapur Global" account)

Went through the actual production dashboard after the code read. Confirmed, live:

- **Laba Rugi and Arus Kas tabs really do show fake data on a real account.** The store has Rp 0 in real transactions today, yet Laba Rugi shows a rising Jan–Jun revenue chart up to ~17jt and Arus Kas shows weekly cash movement up to 6jt. Same for the inventory tab's turnover stat: "0 SKU" registered, but "Rasio Turn-Over Stok: 4.2x / bulan" is displayed anyway.
- **"Unduh Format e-Faktur CSV" and "Kirim Test Print Ke Printer" are confirmed no-ops.** Clicking either freezes the page with a native browser `alert()` popup (had to dismiss it to continue) — no file downloads, nothing gets sent to a printer.
- **New finding, not in the original code read:** `dagangos.com/dapuros/app/pricing` renders a completely blank page inside the dashboard shell (sidebar loads, content area is empty) — the app's route table (`App.js`, `getAppSubRoutes()`) simply has no `pricing` entry registered under `/app/*`. I checked where the sidebar's actual "Upgrade Sekarang" button points, though, and it correctly links to the *working* standalone page at `/dapuros/pricing` — so this particular blank route isn't reachable from any button in the UI today. Still worth adding a catch-all/404 inside the app shell so a stray link or typo doesn't silently show a blank screen.
- **Possible bigger culprit for "the app does nothing when I click it":** the first time I opened Settings → Langganan & Tagihan, the tab genuinely hung — repeated clicks and screenshots timed out for over 30 seconds before it finally loaded. A second attempt right after loaded instantly. That pattern (slow-then-fast) is the classic signature of a backend that spins down when idle and takes 30–60 seconds to "wake up" on the first request — common on free/hobby tiers of Render and similar hosts. If your backend is on a plan that sleeps after inactivity, that alone could explain a lot of "I clicked it and nothing happened" reports better than any single dead button — the click did register, the backend was just asleep. Worth checking your hosting plan's idle/sleep behavior directly; I can't see your Render dashboard from here.
- Confirmed the billing tab itself is honest, not broken: it currently shows "Paket Multi-Branch — AKTIF" and a clear note that automatic upgrade isn't live yet ("hubungi sales untuk aktivasi manual"). I did not click "Upgrade Sekarang" or submit any purchase/plan-change during this test, to avoid mutating your real account's billing state without asking first.

## What I haven't checked

I read the highest-risk pages (anything with "save," "export," "print," "upgrade," or "test" actions) plus grepped every `.jsx` file for empty/no-op `onClick` handlers and fake-success `.catch()` blocks. I did not read all 44 pages in each app line by line, and I have no live URL or running dev server to click through — so this won't catch bugs that only show up at runtime (broken state updates, wrong prop names, silently-failing effects) rather than in the code's structure. If you can give me a URL or spin up the dev server, I can drive it directly through the browser and verify these plus catch anything static reading missed — that would be the more rigorous next step.
