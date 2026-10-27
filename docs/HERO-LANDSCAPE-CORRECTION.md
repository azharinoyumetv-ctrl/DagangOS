# Landscape hero correction — Geraina and DapurOS

28 October 2026. The owner clarified that restoring height had not restored the width shown in the reference.

## Reproduction and correction

At a 1685-pixel viewport, the published Geraina image measured **702 × 570 pixels**, an almost square 1.23:1 frame. The reference's narrow-window layout measured **860 × 520 pixels**, a landscape 1.65:1 frame. The mismatch was the desktop layout's 1220-pixel container and fixed image height, rather than a missing animation.

Both products now use a wider hero container and **16:9 desktop image frame**. At the same 1685-pixel viewport, the corrected image measures approximately **1024 × 576 pixels**: 46% wider without reducing its height. Tablet and phone layouts retain their existing generous frames. Animation is automatic and the visible controls remain removed. Image assets, navigation, pricing and application code are unchanged.

## Verification

- Local browser suites passed: **37 Geraina checks and 30 DapurOS checks**, covering 1920, 1685, 1440, 1024, 768, 393 and 320-pixel widths.
- Assertions explicitly check the landscape ratio, a minimum 1000-pixel image width at the owner's desktop viewport, use of the available page width, real animation, absence of controls, navigation and account states. Both suites reported zero page errors and zero API mutations.
- Screenshots at the owner's viewport were visually inspected before publication. Evidence: `tmp/wide-landscape-hero/geometry.json`, `proposed-1685.png`, and the local browser suites' screenshots and reports.

Publication source: `95f24410762342dd59d6f9c1514ced68fd2febf1`, [deployment 40556159957](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40556159957). Both updated pages were confirmed live before hosted verification.

- **67 live browser checks passed**: 37 Geraina and 30 DapurOS. Both live desktop frames measured **1024.34 × 576.19 pixels** at a 1685-pixel viewport. Live screenshots were visually inspected.
- An additional local geometry matrix passed at 22 product/viewport combinations, including 1200 and 1201 pixels around the new tablet breakpoint, plus 2560, 1920, 1685, 1440, 1280, 1024, 768, 393 and 320 pixels. No horizontal overflow or visible animation controls were found.
- TestSprite **`e8c8bbdd-63d4-4197-ae73-43b27c686e60` — Checkout rejects invalid sessions through the backend instead of a Worker connection error — passed** in run `21c5eb36-4685-4b7a-b78d-5c70d46d6341`, completed `2026-10-27T18:06:09.790Z`. This is pricing/session regression coverage for both products; the browser suites verify hero geometry and motion. No payment was created. [TestSprite result](https://www.testsprite.com/dashboard/tests/1466ba50-a196-4dc9-a160-f14658033239/test/e8c8bbdd-63d4-4197-ae73-43b27c686e60).
- Deployment, Cloudflare zone audit and public accessibility jobs passed. The broader existing application CI suite is still running; it is excluded from the website check totals.

Current verification record: `docs/hero-landscape-verification.json`. Live evidence is in `tmp/wide-landscape-geraina-live/` and `tmp/wide-landscape-dapuros-live/`; viewport geometry is in `tmp/wide-landscape-hero/responsive-geometry.json`. No application, backend, pricing or Android package source changed in this correction.
