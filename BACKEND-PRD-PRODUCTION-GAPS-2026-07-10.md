# PRD + System Design: Closing the Production Gaps
DagangOS Ecosystem (DapurOS + GerainaOS) · 2026-07-10 · Owner: FAJAR

## 0. Scope and why it's shaped this way

This is **not** a backend rewrite. The 2026-07-10 code audit and live verification on `dagangos.com` confirmed that auth, multi-store/multi-tenant scoping, orders, KDS, tables, products, inventory, purchasing, staff, customers, debt tracking, and the Integrations save flow are real, working, and pulling from MongoDB in production today. Rewriting those would throw away tested, live code to solve a problem that doesn't exist there.

What's actually broken, confirmed by reading the code and clicking the live app on your real account:

| Gap | Evidence | Where |
|---|---|---|
| P&L ("Laba Rugi") report | Hardcoded `profitData` array, no backend endpoint exists at all. Confirmed live: showed ~17jt revenue on a store with Rp 0 real transactions. | `Reports.jsx`, both apps |
| Cashflow ("Arus Kas") report | Same — hardcoded `cfData`, no backend endpoint. Confirmed live. | `Reports.jsx`, both apps |
| Inventory turnover stat | Hardcoded `"4.2x / bulan"`, never computed. Confirmed live with 0 SKU. | `Reports.jsx`, both apps |
| Printer test | Button is a bare `alert()`, never talks to a printer. Confirmed live. | `Settings.jsx`, both apps |
| WhatsApp | Frontend has a "bring your own" provider/token field with no real Meta integration behind it | `Integrations.jsx`, both apps |
| GerainaOS EDC | DapurOS has an EDC *simulator* (BCA/Mandiri/BRI/BNI); GerainaOS has no EDC flow of any kind | GerainaOS POS |
| Subscription billing | `/api/pricing/upgrade` exists and is called correctly, but the frontend fakes a success message even when the call fails, and there's no real payment gateway behind it yet | `Pricing.jsx`, `routes_pricing.py` |

Note: e-Faktur/PPN export was originally scoped here too, but dropped per your call — most stores on this platform aren't PKP-registered, so a tax-compliance feature aimed at a small minority of tenants wasn't worth building right now. Revisit if/when PKP merchants become a meaningful share of the base.

Everything below is scoped to exactly these gaps. Auth, orders, inventory, etc. are explicitly **out of scope** — don't touch them except where a new feature needs to read from them (e.g., reporting reads `orders` and `products`, it doesn't change them).

### Timeline reality check

You asked for "days." Most of this is engineering-only work that can genuinely ship in days: the reporting engine, printer integration, and the billing/WhatsApp/EDC *code* can all be built and tested against sandbox credentials this week. But three things have turnaround time outside engineering's control, regardless of how fast the code ships:

- **WhatsApp message templates** need Meta's approval before you can send business-initiated messages (receipt notifications, order-ready pings). Submission is fast; approval isn't guaranteed to be.
- **Xendit/Midtrans** are already pending on your end — nothing to design around, just a config value that goes live the moment you paste in the key.
- **Bank EDC certification** (BCA/Mandiri/BRI/BNI) is not an API-key integration. Every bank I'm aware of requires a merchant agreement, a certification/testing cycle with their acquiring team, and in most cases a physical device pairing process — that's weeks-to-months, not days, and it's a business/legal process, not an engineering one. I'm designing the software so it's ready the moment that partnership lands, but I want to be upfront that "days" doesn't apply to this one piece no matter how the code is written. If a faster path matters more than the specific banks, Xendit and Midtrans both sell card-present/EDC products under the same merchant agreement you're already setting up — worth a conversation with them once their approval comes through, as a parallel option rather than a replacement for the bank route.

Plan: everything ships **wired but gracefully inactive** until its credential/approval lands — never a fake success, always a clear "not configured yet" state the merchant can see. That's the thread running through every section below.

## 1. Cross-cutting design principle: "configured or honest, never fake"

Every integration in this PRD follows the same rule, because the fake-success-on-failure bug already found in `Settings.jsx`, `PaymentConfig.jsx`, and `Pricing.jsx` is the actual root cause of "it does nothing when I click it" — not literally missing buttons, but buttons that lie.

- Every integration has a `status` field: `not_configured | configured_untested | active | error`.
- A missing credential is a **502 `integration_not_configured`** from the backend, not a silently swallowed error.
- The frontend renders that as a visible, honest state ("WhatsApp belum dikonfigurasi — tambahkan token di Integrasi") — never a green success toast.
- No `.catch()` block anywhere in this scope is allowed to show a success message. This is a blanket rule for the three files above and every new save flow added below.

## 2. Reporting engine (P&L, cashflow, inventory turnover)

### 2.1 Data model additions

Two things are genuinely missing from the data model, not just from the UI — you can't build a truthful P&L without them:

**`expenses` collection (new)** — operating costs that aren't COGS and aren't a supplier invoice: rent, utilities, salaries, marketing. Without this, "net profit" is really just gross margin wearing a net-profit label.

| Field | Type | Notes |
|---|---|---|
| id, store_id | string | scoped like every other collection |
| category | string | rent, utilities, salary, marketing, other |
| description | string | |
| amount | number | IDR |
| paid_at | ISO datetime | when cash actually left, not when it was logged |
| created_by | string | user id |

**`cash_ledger` (materialized, not a new collection)** — cashflow is computed, not stored: it's a union of `orders.paid_at` (in), `debt_receivables` payments (in), `debt_payables` payments (out), `expenses.paid_at` (out), `purchase_orders`/`supplier_invoices` payments (out). No schema change needed here, just an aggregation.

### 2.2 API contract

```
GET /api/reports/profit?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=month|week
→ { periods: [{ label, revenue, cogs, operating_expenses, net_profit }], generated_at }

GET /api/reports/cashflow?from=&to=&granularity=week
→ { periods: [{ label, cash_in, cash_out, net }], generated_at }

GET /api/reports/inventory/turnover?from=&to=
→ { turnover_ratio, cogs_in_period, avg_inventory_value, formula: "cogs / avg_inventory_value" }

POST /api/expenses            body: { category, description, amount, paid_at }
GET  /api/expenses?from=&to=
DELETE /api/expenses/{id}
```

`revenue` = sum of paid order totals excluding tax, in range. `cogs` = sum over paid orders of `line_item.qty * product.cost` (falls back to 0 with a `cogs_incomplete: true` flag on the response if any product in range is missing a `cost` value — surfaced in the UI as a banner, not silently wrong). `avg_inventory_value` = average of (stock × cost) sampled at period start and end.

If there are zero orders in range, return real zeros with `periods: []` or all-zero rows — not omitted, not hardcoded placeholders. An empty state that says "belum ada data" is honest; a chart with numbers from nowhere is not.

### 2.3 Frontend change

`Reports.jsx` "Laba Rugi" and "Arus Kas" tabs: delete `profitData`/`cfData` arrays entirely, call the endpoints above, render loading/empty states. Inventory tab: replace the hardcoded `4.2x` with the real `turnover_ratio` (format `Nx / bulan` only when there's enough data to compute one full period — otherwise show "Data belum cukup").

### 2.4 Acceptance criteria

- A store with zero orders shows Rp 0 everywhere on these tabs, not fabricated figures.
- A store with real orders shows numbers that reconcile: sum of `revenue` across all periods in a range equals the sum of paid order totals from `/api/orders` over the same range (this is your regression test — assert it in the Playwright suite).
- Adding an expense immediately changes `net_profit` on the next fetch.

## 3. Printer integration

Browsers can't talk to a USB thermal printer directly, so "real" here means picking the mechanism that actually works for how these merchants are set up, not chasing a single elegant solution. Support two modes, store-configurable in Settings → Printer:

**Mode A — Local/USB (default, works everywhere).** The printer is installed as the OS default/shared printer (how basically every 80mm thermal printer in Indonesian warungs is set up today). Replace the fake "Kirim Test Print" button with: render an actual formatted 80mm receipt in a print-only view (existing receipt template, reused) and call `window.print()`. This is real — it produces an actual physical printout — and needs zero new backend work. This alone fixes the confirmed-live no-op.

**Mode B — Network (ESC/POS over LAN).** For printers with an Ethernet/WiFi interface (common on newer 80mm thermal printers), add a backend endpoint that opens a raw TCP socket to the printer's IP on port 9100 and sends ESC/POS bytes directly — this is the standard "raw print" protocol nearly every thermal printer brand implements, and it lets the kitchen printer (DapurOS KDS) print unattended without a browser tab open.

```
POST /api/settings/printer/test    body: { mode: "local" | "network", ip?: string }
→ mode=local: { ok: true, render_url } (frontend opens this and calls window.print())
→ mode=network: attempts the socket send server-side, { ok, error? }
```

If `mode=network` and the IP is unset or unreachable, return a real connection error — not a success alert.

## 4. WhatsApp — Meta Cloud API (you already have the Meta Business account)

### 4.0 Live-tested blocker, found while writing this PRD

You sent a real test message through your WABA and it reached Meta but failed with error `130497` — "Business account is restricted from messaging users in this country." Before assuming Indonesia is blanket-restricted: the webhook payload shows `display_phone_number: "15556166855"` — a US-format `555` number, which is the pattern Meta auto-issues as a free **developer test number** when a WhatsApp Business app is first created. Test numbers are sandboxed to a short allow-list of manually-added recipients and are not meant for general sending, which reads as exactly this error to an unlisted recipient. This is very likely a test-number limitation, not a country ban — but I can't confirm that from here, only from what the webhook shows.

Action before any of Section 4 is worth building against: in Meta Business Manager → WhatsApp Manager → Phone Numbers, register your actual Indonesian business number as the production sender (needs to receive an SMS/voice OTP to verify), and complete Business Verification for the WABA if you haven't. Meta's own guidance also notes country-messaging restrictions are tied to completing a "scaling path" toward higher messaging tiers, and — per current third-party documentation — Indonesia and Brazil have been called out as cases where cross-country messaging may stay restricted even after that path completes, so plan on sending exclusively from a verified Indonesian number rather than relying on cross-border sending capacity. Re-test with the real number once it's added before writing more integration code against this account — worth ten minutes to confirm before Section 4.2's client code depends on it.

One more thing from that test: the access token you pasted into chat is now sitting in this conversation's history in plaintext — treat it as burned and regenerate it in Meta Business Settings, token exposure aside from whether it's short-lived.

Sources: [WhatsApp Error 130497: What It Means and How to Fix It](https://www.vmoscloud.com/blog/whatsapp-error-130497), [Developer Community: How to fix 130497](https://developers.facebook.com/community/threads/1545915766783370/)

**Status: implemented on GerainaOS backend, 2026-07-10.** `whatsapp_client.py` rewritten for Meta Cloud API (`send_meta_message` for template sends, `send_text_message` for in-session replies), `GET`/`POST /api/webhooks/whatsapp` added to `routes_webhooks.py` with mandatory signature verification, `routes_settings.py`'s test endpoint and `routes_orders.py`/`routes_purchase.py`'s auto-send hooks switched over, `Integrations.jsx` updated to collect Phone Number ID / Access Token / Webhook Verify Token instead of the old Fonnte/Wablas provider+token fields. Not yet ported to DapurOS — do that once this is verified working end-to-end on GerainaOS (blocked on the test-number issue above).

Correction to the original plan below: the prior BYO WhatsApp integration was not a placeholder — `whatsapp_client.py` already had a real, working Fonnte/Wablas integration (auto-receipt on checkout, auto-PO-to-supplier), found while implementing this section. This work replaces that unofficial gateway with the official Meta Cloud API per your request, it isn't filling an empty gap.

Replace the free-text "provider" field in `Integrations.jsx` with the actual fields Meta's Cloud API needs, and make the test-send button hit the real Graph API.

### 4.1 Store-level config (encrypted at rest, not plaintext in Mongo)

| Field | Notes |
|---|---|
| phone_number_id | the registered sending number's ID |
| access_token | permanent system-user access token, encrypt with a server-side key (not the JWT secret — a separate `FIELD_ENCRYPTION_KEY`) — currently stored plaintext in `integrations`, encryption-at-rest is still open |
| webhook_verify_token | for Meta's webhook handshake, one shared callback URL routes to the right tenant by matching this |
| template_receipt / template_po | template names, default to `dagangos_order_receipt` / `dagangos_po_notify`, overridable once approved under different names |

### 4.2 What's built vs. still open

- `whatsapp_client.py`: done. Wraps `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`. The version is a config value (`META_GRAPH_API_VERSION` env var, defaults `v21.0`) — verify it's still current against Meta's changelog before this has been sitting untouched for long.
- **Message templates**: already approved in Meta Business Manager per FAJAR — the long pole most integrations wait on is already cleared here. Still needs confirming: whether the approved template's name and body/parameter layout match what `whatsapp_client.py` currently assumes (`dagangos_order_receipt` / `dagangos_po_notify`, params in the order documented as `TEMPLATE_RECEIPT_BODY_ID` / `TEMPLATE_PO_BODY_ID`) — if the real approved template uses a different name or parameter count/order, update those constants and the `params` list at each call site (`routes_orders.py`, `routes_purchase.py`) to match, since Meta will reject a template call whose parameter count doesn't line up with what was approved.
- `GET`/`POST /api/webhooks/whatsapp`: done, single shared URL for every tenant, routes by `webhook_verify_token` (GET) / `phone_number_id` (POST), signature-verified via `WHATSAPP_APP_SECRET` (fails closed if that env var isn't set — this was upgraded from "optional" in the original draft, since an unsigned public webhook is an open relay).
- Test-send: done, uses Meta's built-in `hello_world` utility template so it works today without waiting on your custom templates' approval.

### 4.3 Where it plugs into existing flows

Order checkout (`routes_orders.py`) and purchase order creation (`routes_purchase.py`) both already had a WhatsApp send hook (previously Fonnte/Wablas) — swapped in place to call `send_meta_message` with the template + ordered params instead of a freeform string. Both remain best-effort: a WhatsApp failure never blocks the order or the PO.

## 5. GerainaOS EDC (card-present payments)

### 5.1 Design: a pluggable adapter, not a bank-specific integration

```python
class EDCProvider(Protocol):
    async def charge(self, amount: int, terminal_id: str, order_id: str) -> EDCResult: ...
    async def get_status(self, reference: str) -> EDCResult: ...

class EDCResult(BaseModel):
    status: Literal["pending", "approved", "declined", "error"]
    reference: str
    card_last4: str | None
    bank: str | None
```

One interface, one implementation per bank once each partnership is certified (`BCAEDCProvider`, `MandiriEDCProvider`, etc.), selected per-store by config. This means GerainaOS gets the same EDC UI DapurOS already has (bring the simulator over as the starting point — it's good UI, just needs a real backend behind it eventually), and the day a bank certification completes, it's a new adapter class, not a redesign.

### 5.2 Until certification lands

Ship the adapter interface and a `SimulatedEDCProvider` (same simulation DapurOS already has), but **label it as simulation in the UI** — a visible badge, not a hidden detail — so nobody mistakes a test transaction for a real one. This is materially different from today's DapurOS EDC screen, which doesn't make the simulation status obvious. Route to `POST /api/payments/edc/charge`; the response includes `simulated: true` whenever the active provider is the simulator, and the frontend must render that state distinctly (e.g., a persistent orange banner during the flow), not just in fine print.

This is deliberately last in the build order (see Section 7): once Xendit or Midtrans keys land, GerainaOS customers already have a real non-cash payment path (QRIS/e-wallet — the `xendit_client.py` integration for order-time payment already exists in code, it's just waiting on approved API keys same as subscription billing). EDC stops being the only way to take a non-cash payment, so there's no pressure to rush the bank side once that's in place.

### 5.3 Acceptance criteria

- Switching a store's configured EDC provider from simulator to a real bank adapter requires no frontend changes — only a config value and a new provider class.
- The simulated/real state is unmistakable to the cashier on screen, not just in an API field nobody reads.

## 6. Subscription billing (Xendit / Midtrans, keys pending)

### 6.1 What changes

`POST /api/pricing/upgrade` gains a real payment step instead of immediately activating the plan:

```
POST /api/pricing/upgrade   body: { tier_id }
→ if no gateway configured:  502 { error: "payment_gateway_not_configured" }
→ if configured:              200 { payment_url, invoice_id, expires_at }
```

Plan activation moves to the **webhook**, not the upgrade call — `routes_webhooks.py` already has the skeleton (currently gated by `ALLOW_WEBHOOK_SIMULATE`, which is correctly `false` in your env). On a verified `PAID` webhook event, flip `user.plan` server-side. The frontend never sets plan state optimistically — that's precisely the bug that made a failed upgrade look successful live in the code you already have.

### 6.2 What you can do today without the keys

You told me you want to be able to charge subscriptions manually right now, before Xendit/Midtrans approve. Add an admin-only endpoint:

```
POST /api/admin/stores/{store_id}/plan   body: { tier_id, reason }
```

Owner-only (you), audit-logged, lets you flip a store to a paid plan by hand exactly like the honest "hubungi sales untuk aktivasi manual" message already live on the billing tab describes — except right now that message is true by accident (there's no real gateway), and this endpoint makes the manual path an actual documented feature instead of an implicit gap.

### 6.3 The moment the API keys arrive

No code changes — `Integrations.jsx`'s existing Xendit/Midtrans panels already collect `secret_key`/`server_key`. The backend checks for a non-empty configured key before attempting a real charge; paste the key in, the `payment_gateway_not_configured` state clears itself.

## 7. Sequencing (days, given the gaps-only scope)

Build order: **GerainaOS first, then port to DapurOS.** The two backends are already maintained as synced duplicates (`SYNC: KEEP IN SYNC` comments exist throughout the current codebase), and the earlier audit confirmed `client.js`/`AuthContext.jsx` are byte-identical across both apps. So for every item below: implement and verify against GerainaOS, then copy the same module/component into DapurOS and re-run the acceptance check there — don't design or debug the same feature twice. GerainaOS also has the added motivation of being the one that needs EDC built from scratch rather than adapted from an existing simulator.

Ordered by dependency and by what unblocks the most user-visible pain first:

1. **Fix the fake-success `.catch()` blocks** in `Settings.jsx`, `PaymentConfig.jsx`, `Pricing.jsx` (both apps) — smallest change, biggest trust fix, do this first regardless of everything else.
2. **Reporting engine** (P&L, cashflow, turnover) — self-contained, no external dependency, directly fixes the most visible "fake numbers" complaint.
3. **Printer Mode A (local/USB)** — no backend work, fixes a confirmed-live dead button same day.
4. **Subscription billing** gateway-agnostic scaffolding + admin manual-activation endpoint — unblocks you charging stores today.
5. **WhatsApp Cloud API** — *in progress on GerainaOS.* Submit message templates to Meta immediately if you haven't (longest external turnaround in this list); backend/frontend code is done pending the test-number fix in 4.0.
6. **Printer Mode B (network/ESC-POS)** — nice-to-have, do if time allows.
7. **EDC adapter interface + simulator** — build the interface and bring the simulator to GerainaOS now, once Xendit/Midtrans give GerainaOS a real non-cash payment path (item 4). Real bank adapters are a separate, longer-running workstream gated on the bank partnerships, not on this sprint.

## 8. What I didn't verify and you should before building

- The current Meta Graph API version and exact template-approval requirements — check Meta's developer docs at build time; `v21.0` is a config default, not a guarantee it's still current.
- Whether `routes_webhooks.py`'s existing Xendit/Midtrans handlers already match those providers' real webhook payload shapes, or were only ever exercised against the simulator — read that file against each gateway's real webhook docs before relying on it.
- Which of the four banks (BCA/Mandiri/BRI/BNI) is actually worth pursuing first for EDC certification — that's a business decision (existing banking relationship, merchant fees, terminal cost) I don't have the information to make for you.
- Encryption-at-rest for `integrations.whatsapp.access_token` (and the Xendit/Midtrans secret keys next to it) — currently stored plaintext in Mongo like the rest of that collection. Worth a `FIELD_ENCRYPTION_KEY`-based encryption pass across all of `integrations` before this is holding real production credentials, not just this PRD's WhatsApp fields.
