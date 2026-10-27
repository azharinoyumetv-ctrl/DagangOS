# DapurOS unified public website

Prepared on 28 October 2026 at the owner's request to apply the Geraina landing-page cleanup to DapurOS. Publication and live verification are pending.

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

After deployment serves the new DapurOS document, run the DapurOS browser suite against `https://dagangos.com`. Run existing TestSprite checkout test `e8c8bbdd-63d4-4197-ae73-43b27c686e60` to verify signed DapurOS/Geraina pricing and rejection of invalid sessions without creating invoices. Record the actual verdict and deployment revision in `docs/dapuros-unified-site-verification.json`.
