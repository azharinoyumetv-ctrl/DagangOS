# Geraina unified public website

Published on 28 October 2026 from commit `0571776bf399a4c56a7470f78077d2ff5f2b9432`. The owner accepted the unified design and animated hero and requested that it replace the old versions behind the existing main DagangOS navigation link. The live website checks and the existing app regression CI job passed.

Entry: https://dagangos.com/ → Produk → Geraina. Canonical destination: https://dagangos.com/geraina. Local preview: http://127.0.0.1:8792/geraina.

## Agreed navigation

The owner clarified that the old Ekosistem/Kontak links leaving Geraina were the problem. The primary navigation now stays in the product: Fitur, Solusi, Harga, Android and Kontak. Kontak opens `/geraina#kontak`; it does not go to the parent website. The DagangOS ecosystem link is explicitly separate in the footer.

## Changes

- Retains the cleaner forest-green/light design preferred by the owner, with the original six feature modules and four-step solution workflow.
- Restores the original retail illustration as the hero visual, including the corner brand emblem. Uses the existing image unchanged with responsive framing; replaces the earlier summary card.
- Restores the original camera drift, light sweep, three floating particles, floating emblem and two pulsing rings with their original durations. Includes pause/resume, offscreen pausing and reduced-motion support. Motion uses CSS transforms/opacity rather than per-frame JavaScript.
- One server-rendered header/footer source is used on home, pricing and Android pages. Mobile menu supports Escape and remains usable with JavaScript disabled.
- A valid account shows Buka Dashboard. Missing/expired/unavailable sessions preserve usable public navigation without clearing account storage.
- Public URL variants, including `/geraina/` and the old index document, redirect to `/geraina`, retaining query parameters and section navigation.
- The main DagangOS navigation already uses `/geraina`. That existing destination is retained; both old designs are replaced by the unified page, rather than creating another landing URL. The journey DagangOS → Produk → Geraina is verified on desktop and mobile.
- A website-only boundary ensures React login/register navigation to public marketing pages loads the unified page rather than the old client-side landing/pricing components. No native APK source or backend payment code changed.
- Pricing forms, subscription/add-on handling, Android release metadata and signed APK bytes are preserved.

## Verification

- `npm test`: **38 passed**, zero failures/skips.
- `node scripts/verify-geraina-unified-preview.mjs`: **31 browser checks passed**, zero page errors and zero API mutations. Home, pricing and Android tested at 1440, 1024, 768, 393 and 320 pixels, including the main DagangOS navigation journey and the original animated retail hero.
- Checks include internal contact navigation, slash/query/hash handling, mobile menu, public transitions from login, signed-in/expired/unavailable session states, and no-JavaScript mobile navigation.
- New navigation/buttons/small labels meet the 4.5:1 text contrast target; the minimum measured ratio is 4.95. The hero pause control measures 14.07.
- Browser verification confirms eight live CSS animations, changing rendered frames, working pause/resume, offscreen pause/re-entry, and zero active hero animations under reduced-motion preference. Evidence includes `hero-motion-before.png` and `hero-motion-after.png`.
- Screenshots were visually inspected. An early full-page capture omitted a lazy-loaded phone image; capture now scrolls/decodes images before saving. Early test locators were corrected for the chat's duplicate close labels and the account header's mobile visibility, then the complete suite passed.
- The same 31 browser checks passed against **https://dagangos.com** after confirming the deployed page contained the new unified layout and animated hero. Desktop and phone screenshots were visually inspected. The verifier's report scope label was then made target-neutral; its assertions were unchanged.
- Direct live HEAD requests confirm `/geraina` returns 200; `/geraina/` and `/geraina/index.html` return 308 to `/geraina`. Pricing and Android slash variants also return 308 to their canonical paths.
- TestSprite test **Official Geraina Android download matches its public checksum and metadata** (`6aeabb04-2f07-46ac-ab0e-b5d7a715ae0c`) passed in run `448d55e0-b20a-4ccd-816d-359a2207bab0` after deployment. This checks download regression, not the whole app or every new hero interaction. APK version remains **1.2.14**, SHA-256 `d6ff4cebc6c56cac62e07633731beac88e12ef9ee3c80cb6bb494d21f7283ac5`; merchant writes: zero. [TestSprite result](https://www.testsprite.com/dashboard/tests/1466ba50-a196-4dc9-a160-f14658033239/test/6aeabb04-2f07-46ac-ab0e-b5d7a715ae0c).

Evidence: `tmp/geraina-unified-preview/verification.json`, `worker-tests.log`, and viewport screenshots; live proof in `tmp/geraina-unified-live/verification.json` and screenshots. The committed verification record is `docs/geraina-unified-site-verification.json`.

## Publication

Published through the existing DagangOS main-branch deployment: [run 40549631388](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40549631388). Deployment, Cloudflare zone audit, public accessibility and app regression checks passed. No APK rebuild or backend payment changes were required. Public verification blocked merchant mutations and sent no emails. Existing unrelated GerainaOS working-tree changes were preserved.

## Owner's hero follow-up

During the DapurOS unification, the owner requested the larger original hero proportions and removal of visible animation controls on both products. The Geraina hero now uses the original approximately 702 × 570-pixel desktop visual, with 520-pixel tablet and 430-pixel phone frames. Autoplay, offscreen pausing and reduced-motion preference remain; the visible controller is removed. The revised browser suite adds 1920-pixel coverage and checks frame dimensions and absence of controls. All **34 local and 34 live browser checks** and **44 Worker tests** passed. Published with the DapurOS cleanup from revision `0432aa37e90fd055d63461baab0350962e59dd14`; the sections above record the earlier published revision. The shared TestSprite checkout regression passed for both products without creating a payment. See `docs/DAPUROS-UNIFIED-SITE.md` for the current deployment and test run. The broader current app CI job remains in progress.

The owner then clarified that the desktop image was still too narrow. The subsequent [landscape-width correction](HERO-LANDSCAPE-CORRECTION.md), source `95f24410762342dd59d6f9c1514ced68fd2febf1`, supersedes the dimensions above with a wide 16:9 desktop frame, approximately 1024 × 576 pixels at the owner's 1685-pixel viewport. The correction preserves automatic animation without visible controls.
