# Geraina unified public website preview

Prepared and reviewed on 28 October 2026. The owner accepted the unified design and animated hero and requested that it replace the old versions behind the existing main DagangOS navigation link. Publication and live verification are in progress.

Preview: http://127.0.0.1:8792/geraina

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
- TestSprite cannot target the local preview. Hosted checks and the public browser verification will run after publication has actually reached the site.

Evidence: `tmp/geraina-unified-preview/verification.json`, `worker-tests.log`, and viewport screenshots. The preview server runs locally in execution session 48008; leave it available for owner review.

## Publication

The owner's preview review is complete. Publish through the existing DagangOS main-branch deployment. No APK rebuild or backend payment changes are required. Public verification blocks merchant mutations and sends no emails. Existing unrelated GerainaOS working-tree changes are preserved.
