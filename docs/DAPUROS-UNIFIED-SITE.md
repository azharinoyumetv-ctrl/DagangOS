# DapurOS unified public website

Published on 28 October 2026 from revision `0432aa37e90fd055d63461baab0350962e59dd14` at the owner's request to apply the Geraina landing-page cleanup to DapurOS. Live DapurOS and Geraina website verification passed.

Entry: https://dagangos.com/ → Produk → DapurOS. Canonical destination: https://dagangos.com/dapuros.

## Confirmed problem

Live browser inspection reproduced two different pages: `/dapuros` returned the newer static marketing page with no hero motion, while `/dapuros/` returned the older React landing with a different headline, navigation and animated kitchen illustration. The old contact navigation left DapurOS for `/sumber-daya`. Before screenshots are in `tmp/dapuros-unified-before/`.

## Result

- The existing main portal journey remains **DagangOS → Produk → DapurOS**, using `/dapuros`.
- `/dapuros/`, `/dapuros/index.html` and internal marketing HTML aliases redirect to the canonical public page. Pricing slash aliases redirect to `/dapuros/pricing`. Query parameters and browser section fragments are retained. Application and checkout routes are excluded from canonicalization.
- Home and pricing share one DapurOS header/footer source. Fitur, Solusi, Harga and Kontak remain within DapurOS; the parent ecosystem link is separate in the footer.
- The cleaner light/orange layout retains DapurOS's six restaurant feature areas and four-step order workflow. The original kitchen illustration is unchanged, with camera drift, light sweep, three particles, floating emblem and pulsing rings at their original durations.
- Both DapurOS and Geraina retain the original large cinematic proportions: the desktop hero visual is about 702 × 570 pixels at wide viewports, with 520-pixel tablet and 430-pixel phone frames. The owner requested removal of visible animation controls; motion runs automatically, pauses offscreen, and respects reduced-motion preference. The mobile navigation works without JavaScript and supports Escape when enhanced.
- Website React links back from login/register load the canonical public page rather than reviving the alternate landing/pricing component.
- Account navigation validates against the DapurOS backend module. Public page rendering does not wait for account lookup, and account storage is preserved if validation expires or the network is unavailable.
- Existing pricing forms, billing choices, subscription implementation and backend payment code are unchanged. No DapurOS application repository or Android package changes are required.

## Local verification

- `npm test`: **44 passed**, zero failures/skips, including six DapurOS routing/content/form regression tests.
- DapurOS browser verification: **28 checks passed** across 1920, 1440, 1024, 768, 393 and 320 pixels, including desktop/phone main-portal navigation, slash/query/fragment handling, internal contact/chat, public links from login, account states, no-JavaScript navigation and actual changing animation frames. The large desktop frame and absence of animation controls are asserted.
- Geraina browser regression: **34 checks passed** against the same modified Worker, including the Android public page, enlarged original retail hero and absence of animation controls.
- Zero browser page errors and zero API mutations in both suites. The browser harness intercepts API calls and blocks non-GET methods. It sends no messages, emails or real payments.
- New DapurOS text contrast samples measure at least **5.73:1**, above the 4.5:1 target. Desktop, phone and narrow pricing screenshots were visually inspected.
- The first DapurOS browser-harness launch exposed a copied dependency-directory typo; corrected to the verified installed DapurOS Playwright path, then the entire suite passed. No app behavior fix was needed for that harness error.

Evidence: `tmp/dapuros-unified-preview/verification.json`, `tmp/dapuros-geraina-regression/verification.json` and their screenshots. Reproduction and verification scripts are in `scripts/verify-dapuros-unified-preview.mjs` and `scripts/verify-geraina-unified-preview.mjs`.

## Publication verification

- Deployment [40553669313](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40553669313) published the tested source. Deployment, Cloudflare zone audit and public accessibility checks passed. The broader existing app regression job is still preparing its browser environment; it is not included in the passed website totals.
- The live-page probe confirmed the new document/version on both products and absence of the removed animation controls before running hosted verification.
- **28 DapurOS and 34 Geraina live browser checks passed**, zero page errors and zero API mutations. All six viewport widths, original large hero dimensions, real animation frames, offscreen/reduced-motion behavior, product-local navigation and account states were checked. The live DapurOS desktop screenshot was visually inspected.
- Live HEAD checks confirm `/dapuros` returns 200; `/dapuros/` and `/dapuros/index.html` return 308 to `/dapuros`. `/dapuros/pricing/` redirects to canonical pricing, and Geraina's existing slash redirect is preserved.
- TestSprite **`e8c8bbdd-63d4-4197-ae73-43b27c686e60` — Checkout rejects invalid sessions through the backend instead of a Worker connection error — passed**, run `984bd625-56c0-4379-bbfe-0b49dd365625`, completed `2026-10-27T17:49:28.194Z`. It checked both products' signed yearly Starter choices, preserved package selection through sign-in, and rejected invalid sessions without creating a payment. [TestSprite result](https://www.testsprite.com/dashboard/tests/1466ba50-a196-4dc9-a160-f14658033239/test/e8c8bbdd-63d4-4197-ae73-43b27c686e60).

Live evidence: `tmp/dapuros-unified-live/verification.json`, `tmp/dapuros-geraina-live-regression/verification.json`, `tmp/dapuros-unified-testsprite.json`, and viewport screenshots. Committed record: `docs/dapuros-unified-site-verification.json`.
