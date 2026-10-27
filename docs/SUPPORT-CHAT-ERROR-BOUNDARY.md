# Public support chat error boundary

28 October 2026. A production request to `/api/support-chat` reproduced an HTTP 200 response whose `reply` contained a provider authentication diagnostic and an internal `hermes model` command. The chat displayed that string as a normal answer.

## Correction

- The Worker separates failed service responses from public answers. Non-success responses, explicit error flags, invalid bodies, authentication diagnostics, internal commands, credential-like strings and diagnostic warning banners return a neutral, product-specific help message.
- The browser independently rejects those response forms and never displays a raw server error or JavaScript exception. Errors are not added to assistant conversation history; send controls recover so a later request can succeed.
- Provider calls are bounded to 35 seconds and browser requests to 40 seconds. A rate-limit response has its own safe, customer-facing message.
- Existing local feature/package/account guidance still works when the provider is unavailable. Corrected the Pro keyword match so the Indonesian word `produk` no longer overrides a feature question with a pricing answer.
- Visitor messages remain unchanged. Public support stays read-only. The support script URL is versioned so a reload uses the corrected code. No payment, Android, or merchant account code changed.

## Verification

- **48 automated tests passed**, including realistic HTTP 200 login warnings, malformed responses, HTTP 401/403/429/500/502/503, transport errors, timeouts, safe answers and local guidance without a provider.
- **30 local browser checks passed** across Geraina, DapurOS and the main portal. Tests include the exact reported warning, a future unknown warning, raw private error bodies, failure flags, invalid JSON, network failure, rate limiting, normal answers, recovery/history handling and phone behavior. API responses are intercepted; these checks send no real messages to a provider, customer or inbox.
- A customer-facing fallback screenshot was visually inspected. Evidence is in `tmp/support-chat-errors-local/verification.json` and screenshots; the unit log is `tmp/support-chat-unit-tests.log`.

## Hermes login

SSH confirmed the gateway is running and the selected provider is Nous. A filtered, refresh-free status check reported `logged_in: false`, `has_refresh_token: false`, and `relogin_required: true` with `invalid_grant`. No credential values were printed. The selected model remains `stepfun/step-3.7-flash:free`, and `platform_toolsets.api_server` is an empty list.

The installed CLI's supported recovery is `hermes model --no-browser`, then choose the existing Nous provider and approve the browser device authorization. This reauthentication is pending the owner's approval. Do not publish device codes or tokens in this document. After authorization, retain the existing model and verify the read-only public API before reporting the login restored.

The Website Master checkout/payment working-tree changes were inspected only for context and remain untouched. The public error boundary is deployed through the DagangOS repository.

## Publication and live verification

Published from `7a4b6a62715aaf3868709803bb2b9be585f4fef7`, [deployment 40562469162](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40562469162). Deployment, Cloudflare zone audit and public accessibility jobs passed; the broader existing app CI suite is still running.

- **30 live browser checks passed**, with no page errors, after confirming the versioned protected chat script had reached production. The scenarios use intercepted API responses and create no real customer messages.
- Real requests to all three public chat surfaces returned **503 `support_unavailable` with a safe message** while the provider was genuinely logged out. No provider name, internal command, credential detail or raw error appeared. Local Geraina and DapurOS feature guidance still returned 200 independently of Nous, including a question containing `produk`.
- TestSprite **`e8c8bbdd-63d4-4197-ae73-43b27c686e60` — Checkout rejects invalid sessions through the backend instead of a Worker connection error — passed**, run `78649ead-3526-40e5-90ec-210fe8fc7f64`. This is adjacent pricing/session regression coverage; chat failure behavior is verified by the unit/browser/API checks above. [TestSprite result](https://www.testsprite.com/dashboard/tests/1466ba50-a196-4dc9-a160-f14658033239/test/e8c8bbdd-63d4-4197-ae73-43b27c686e60).

Evidence: `tmp/support-chat-errors-live/verification.json`, its screenshots, `tmp/support-chat-real-api-check.json` and `tmp/support-chat-testsprite.json`. Current committed summary: `docs/support-chat-error-verification.json`.

**Login remains pending the owner's browser authorization.** Publishing the error boundary does not restore the provider login or prove model inference is working. The first device-authorization window timed out without approval. The owner must first sign in at `https://portal.nousresearch.com/login`; then generate a fresh authorization link in the prepared SSH session. Verify the final account state and actual read-only inference after approval. Reloading the website removes the old, in-memory warning transcript; messages are not persisted in browser storage.
