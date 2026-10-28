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

## Hermes subscription connection

Initial inspection found a logged-out Nous global default, with `invalid_grant`. After the owner clarified that Telegram uses the existing Codex subscription, inspecting only session routing metadata found its saved override: `openai-codex`, model `gpt-6-luna`. Hermes already held a working ChatGPT login for that provider. The expired Nous device approval was therefore the wrong recovery path for the intended connection.

The server default now uses `openai-codex` and `gpt-6-luna`, matching Telegram. Only the two existing model/provider settings changed; the parsed configuration was compared against the original with those exact changes, and a private server backup was saved. No provider API key was created, no credit purchase was made, and no credential values were printed. Telegram's saved override remains separate. The gateway was restarted successfully.

Verified actual inference through the authenticated local API: HTTP 200, the requested connection-test answer, 4.69 seconds, and the persisted API session model `gpt-6-luna`. Authenticated `/v1/toolsets` returned 28 entries and **zero enabled toolsets**; `platform_toolsets.api_server` remains an empty YAML list. Website visitors do not gain Telegram, mail, shell, or other operator tools.

The Website Master checkout/payment working-tree changes were inspected only for context and remain untouched. The public error boundary is deployed through the DagangOS repository.

## Publication and live verification

Published from `7a4b6a62715aaf3868709803bb2b9be585f4fef7`, [deployment 40562469162](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40562469162). Deployment, Cloudflare zone audit, public accessibility and the broader existing Geraina app CI job all passed.

- **30 live browser checks passed**, with no page errors, after confirming the versioned protected chat script had reached production. The scenarios use intercepted API responses and create no real customer messages.
- Real requests to all three public chat surfaces returned **503 `support_unavailable` with a safe message** while the provider was genuinely logged out. No provider name, internal command, credential detail or raw error appeared. Local Geraina and DapurOS feature guidance still returned 200 independently of Nous, including a question containing `produk`.
- TestSprite **`e8c8bbdd-63d4-4197-ae73-43b27c686e60` — Checkout rejects invalid sessions through the backend instead of a Worker connection error — passed**, run `78649ead-3526-40e5-90ec-210fe8fc7f64`. This is adjacent pricing/session regression coverage; chat failure behavior is verified by the unit/browser/API checks above. [TestSprite result](https://www.testsprite.com/dashboard/tests/1466ba50-a196-4dc9-a160-f14658033239/test/e8c8bbdd-63d4-4197-ae73-43b27c686e60).

Evidence: `tmp/support-chat-errors-live/verification.json`, its screenshots, `tmp/support-chat-real-api-check.json` and `tmp/support-chat-testsprite.json`. Current committed summary: `docs/support-chat-error-verification.json`.

**Subscription inference is restored.** After the server correction, real `Halo` requests through all three public surfaces returned HTTP 200 with nonempty replies and no provider diagnostics: Geraina 4.06 seconds, DapurOS 3.38 seconds, and DagangOS 4.78 seconds. These messages bypass the local FAQ branches and exercise the live relay and provider. Evidence: `tmp/support-chat-subscription-connection.json`. The public error boundary remains active for future provider failures. Reloading the website removes the old, in-memory warning transcript; messages are not persisted in browser storage. No new Nous authorization is needed for this restored Codex route.
