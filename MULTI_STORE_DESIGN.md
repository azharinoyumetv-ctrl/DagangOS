# DagangOS — Multi-Store Account Model (Design Doc)

**Status:** Proposal for review (no code changed yet)
**Author:** Prepared for FAJAR
**Date:** 2026-07-04
**Decisions locked:**
- One account → many stores, one store per module; Suite shows only activated modules; new module = new store under the same account.
- **New stores start clean** (skeleton only, no demo content).
- **Only OWNERS are platform accounts.** Staff are store-scoped records (PIN/role), never central auth users. Keeps the `users` collection small.
- **Payments split in two:** your gateway bills owners for *subscriptions only*; each store's customer transactions run on the *owner's own* payment credentials (BYO), not through you.

---

## 1. The model in plain words

- **Account = identity (owner).** One email + password. The paying subscriber. This is the only thing stored centrally per business.
- **Store = a business workspace, tied to one module.** A DapurOS store (restaurant) or a Geraina store (shop). Its own products, orders, staff, books.
- **One account owns many stores.** Fully separated data per store.
- **Staff live inside a store**, not in the platform account list. Cashiers/managers are `staff` records with a role + PIN, used for the in-app role switcher and sales attribution. They do **not** each become a login account in your database.
- **The Suite switcher only shows modules you've activated** (modules you have a store for).
- **To try a new module,** an existing owner logs in and creates a *new store* for that module — same account, no second signup.

> Example: You register "Dapur Global" on DapurOS. Later you want retail. You log in → **＋ Coba modul lain → Geraina** → name it "Toko Global". Now the Suite shows both. Menu and shop products never mix — two separate stores.

---

## 2. Why the current code can't do this yet

1. **`users` doc embeds a single `store_id` + `store_name` + `plan`.** Identity and store are fused.
2. **The JWT bakes in `store_id`.** A token can only point at one store, so switching modules can't switch stores.
3. **Every route reads `user["store_id"]`.** No notion of "which store am I acting in now."

Two things to remove while we rewrite `register`:

- **Backdoor staff logins.** `register` auto-creates `manager@geraina.com` / `cashier@geraina.com` / `warehouse@geraina.com` with the shared password `geraina123`, each a full `users` record. This is both a security hole *and* exactly the DB bloat you're worried about. **Removed completely** — staff are store-scoped, not accounts.
- **Heavy demo seed** (~6 products, categories, brands, fake payment keys). Replaced with a clean skeleton.

---

## 3. Target data model

### 3.1 `users` — OWNERS ONLY (identity + billing)
The central collection holds one record per paying owner. Nothing else. It will never grow with staff.
```jsonc
{
  "id": "uuid",
  "email": "azharinoyume@gmail.com",
  "password_hash": "...",
  "name": "Azhar",
  "plan": "multibranch",            // billing lives on the ACCOUNT, covers all their stores
  "trial_ends_at": "2026-07-17...", // account-level trial
  "last_active_store_id": "uuid",   // where to land on next login (optional)
  "created_at": "..."
}
```
Removed from the user: `store_id`, `store_name`, per-store `plan`. Identity no longer "is" a store.

### 3.2 `stores` — workspace (gains `module`)
```jsonc
{
  "id": "uuid",
  "name": "Dapur Global",
  "module": "dapuros",          // NEW — "dapuros" | "geraina"
  "owner_user_id": "uuid",      // the ONLY account tied to this store
  "created_at": "..."
}
```
A user's stores = `stores.find({ owner_user_id: user.id })`. **No link table needed** — because only owners are accounts, `owner_user_id` is enough.

### 3.3 Staff stay store-scoped (unchanged, but never accounts)
`staff` records already carry `store_id`, name, role, phone, status. We add a `pin` for in-app login/role-switch and sales attribution. Staff **never** get a `users` record. This is what keeps your central DB from "exploding."
```jsonc
// staff (scoped to a store)
{ "id": "uuid", "store_id": "uuid", "name": "Dewi", "role": "Cashier", "pin_hash": "...", "status": "Aktif" }
```
> How staff "log in": the store runs under the owner's session on a device; a staff **selects their name, then enters their PIN** to clock in and attribute transactions. Standard POS pattern — no platform account per cashier.
> **PIN collisions are fine:** login is keyed on `(staff name/id + PIN)`, not PIN alone, so two staff sharing the same 4-digit PIN never clash. Uniqueness is enforced per `(store_id, name)`, and the PIN only has to match the selected staff.

### 3.4 Everything else
No change — all data collections already scope by `store_id`, so multi-store isolation "just works."

### 3.5 Rule for Phase 1
**One store per module per account**, so `(account, module)` uniquely identifies a store — no picker needed. (Phase 2 relaxes this for franchises with several outlets of the same module.)

---

## 4. Payments — two separate layers (who's liable for what)

This is a core boundary, so it's explicit:

| Layer | Who pays whom | Whose credentials | Your liability |
|---|---|---|---|
| **Platform billing (subscription)** | Owner → **you** | **DagangOS's** Xendit/Midtrans account | Yes — this is your revenue, you handle it |
| **Merchant transactions** (a café's customer buying coffee) | Customer → **the store owner** | **The owner's own** payment provider keys (BYO) | **None** — money never touches you |

Consequences for the build:
- **Per-store `payments_config` / `integrations` are BYO and start EMPTY.** The owner enters their *own* QRIS/Xendit/Midtrans/bank details. We stop seeding fake `xnd_live_...` keys.
- **The subscription-tier lock stays** (paid plans disabled until *your* billing gateway is ready). It only governs platform billing — it does **not** touch a merchant's ability to take payments, which is their own gateway.
- Clean separation means you are never a payment intermediary for merchant sales — no PCI/settlement burden for their transactions.

---

## 5. Store resolution — the key mechanism

Both frontends already send `X-DagangOS-Module: dapuros | geraina`. We reuse it.

- **JWT carries identity only** (`sub` = user_id, `email`). No `store_id` in the token.
- New dependency **`get_current_store(user, X-DagangOS-Module)`** resolves the owner's store for that module and returns it. Routes use `store["id"]` instead of `user["store_id"]`.

```python
# auth.py (sketch)
async def get_current_store(user = Depends(get_current_user),
                            module: str = Header(alias="X-DagangOS-Module", default="dapuros")):
    db = get_db()
    store = await db.stores.find_one({"owner_user_id": user["id"], "module": module.lower()})
    if not store:
        raise HTTPException(status_code=409, detail="no_store_for_module")  # frontend offers to create
    return store
```

**Security:** resolution is always scoped to the caller's own stores; a spoofed header can never reach another account's store.
**Benefit:** one token works across all modules — switching in the Suite is just a different header, no re-login.

---

## 6. Auth flows

### 6.1 Register — brand-new owner (INVITE-ONLY)
`POST /api/auth/register` (header `X-DagangOS-Module`, body includes `invite_code`)
0. **Require a valid, unused `invite_code`** → else `403 invite_required`. Registration is closed to the public until your billing gateway is live. You mint codes yourself (see 6.6). On success the code is marked consumed.
1. Reject if email exists.
2. Create `users` (owner identity, `plan: "trial"`).
3. Create `stores` with `module` from header, `owner_user_id`.
4. **Seed clean skeleton only:** an empty/default Units list + a Settings doc so the app boots — **no products, no fake payment keys, no staff accounts.**
5. Return identity token.

### 6.2 Add a module to an existing account (NEW)
`POST /api/auth/stores` — authenticated, body `{ module, store_name }`
1. If the account already has a store for that module → `409 already_exists`.
2. Create `stores` (module) + clean skeleton.
3. Return the new store summary.

### 6.3 Login
`POST /api/auth/login` — verify email + password against `users` (owners only) → identity token. The app then sends `X-DagangOS-Module`; if `get_current_store` returns `409 no_store_for_module`, show **"Anda belum punya toko [DapurOS] — buat sekarang?"** → calls 6.2.

### 6.4 Me / bootstrap
`GET /api/auth/me` returns identity **+ the account's stores**:
```jsonc
{
  "id": "...", "email": "...", "name": "...", "plan": "multibranch",
  "stores": [
    { "store_id": "...", "name": "Dapur Global", "module": "dapuros" },
    { "store_id": "...", "name": "Toko Global",  "module": "geraina" }
  ]
}
```
The Suite switcher renders modules straight from `stores[]`.

### 6.5 Staff management (owner-driven, store-local)
`POST /api/staff` (owner only) creates a `staff` record with **name + role + PIN** **inside the current store** — no `users` record, no email/password account. This is how "the owner registers staff" without central bloat.
Staff sign-in is **name-then-PIN**: the app lists the store's staff, the person picks their name and enters their PIN. Because the match is on `(selected staff + PIN)`, two staff with the same PIN never collide — the PIN is only validated against the chosen name.

### 6.6 Invites (platform admin → new owners)
`invites` collection: `{ code, created_by, email (optional), used_by, used_at, expires_at }`. You create codes via an admin-only endpoint (`POST /api/admin/invites`) or directly in Atlas. Register consumes a code. Keeps signups closed until billing is ready. When the gateway launches, we flip a single flag (`REGISTRATION_OPEN`) to allow public trial signups without a code.

---

## 7. API summary

| Method | Path | Change | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | modified | New owner + first store (clean seed, no staff) |
| POST | `/api/auth/login` | modified | Identity token (no store baked in) |
| GET  | `/api/auth/me` | modified | Identity + `stores[]` |
| POST | `/api/auth/stores` | **new** | Add a module-store to existing account |
| GET  | `/api/auth/stores` | **new** | List the account's stores (Suite) |
| POST/PUT/DELETE | `/api/staff` | modified | Store-scoped staff w/ PIN, not accounts |
| —    | all data routes | modified | `user["store_id"]` → `Depends(get_current_store)` |

---

## 8. Frontend changes

- **`client.js`** — already sends `X-DagangOS-Module`. Add a response interceptor: on `409 no_store_for_module`, route to an "activate this module" screen.
- **Suite switcher** — render tiles from `me.stores` (only activated modules) + a **＋ Coba modul lain** tile → create-store dialog → `POST /auth/stores`.
- **Login/Register pages** — register offers "Buat akun baru" vs "Sudah punya akun? Masuk & tambah modul."
- **Store settings → Payments** — copy makes clear these are the *owner's own* provider keys; empty by default.
- **Auth context** — hold identity + `stores[]` + current module.

---

## 9. Migration (existing data)

Small, since demo data is being wiped.
1. For each existing `stores` doc: set `module` (your "Dapur Global" → `dapuros`; default others `dapuros`).
2. Ensure `stores.owner_user_id` is set from the matching user's embedded `store_id`.
3. Move `plan`/`trial_ends_at` onto the account (yours is already `plan: multibranch`).
4. **Delete the seeded staff `users` accounts** (`manager@`/`cashier@`/`warehouse@…`, password `geraina123`) — they should never have been accounts.
5. Wipe demo products/categories/brands (clean-start choice); blank the fake payment keys.
6. Keep embedded `users.store_id` as a fallback during rollout; drop after verification.

A one-off idempotent script (`scripts/migrate_multistore.py`) run against Atlas does all of this.

---

## 10. Phasing (each stage verified with Playwright before the next)

- **Stage 0 — safe now (independent):** subscription-tier lock + BOM fixes. Done, pushable anytime.
- **Stage 1 — data + auth core:** `stores.module`, `get_current_store`, slim register (clean seed, no staff accounts), migration script, empty BYO payment defaults. Verify register/login/data-scoping.
- **Stage 2 — add-module + me.stores:** `POST/GET /auth/stores`, `/me` returns `stores[]`. Verify creating a 2nd module-store.
- **Stage 3 — Suite switcher + activate-module UX:** frontend tiles, 409 handling, register-page choice. Verify one account / two modules / isolated catalogs.
- **Stage 4 — staff PIN + cleanup:** store-scoped staff with PIN; drop legacy embedded `store_id`.

---

## 11. Decisions locked (all confirmed)
Multi-store · billing per account · **owners-only accounts, staff store-scoped by PIN** · new stores = **bare skeleton** · **platform billing separate from merchant BYO payments** · one store per module per account (Phase 1) · **registration INVITE-ONLY** until billing gateway is live (flip `REGISTRATION_OPEN` later).

Nothing outstanding — ready to build Stage 1 on your go.
