# Shared product media gallery

The reusable gallery reads a manifest for Geraina or DapurOS and displays published entries that match the selected product and locale. The public product pages currently use their product-specific showcases. The shared gallery is available for review in the isolated browser fixture.

Entries specify a unique `id`, `productId`, `type`, root-relative `src`, `headline`, `description`, `alt`, `locale`, `order`, `device`, `featureId`, and `status`. Videos also require a `poster`. Keep new entries in `draft` status until the media and copy are reviewed. The sample manifests use existing Android captures with fixture data.

Run `node product-media/validate.mjs` from the DagangOS root to check the manifests and their PNGs. Run `node product-media/verify.cjs` with Playwright and Chromium installed to check the rendered gallery. Set `CHROME_PATH` to a local Chrome executable if needed.

The build and verification scripts use Geraina's frontend dependencies when `GerainaOS/frontend/node_modules` is present. For a standalone checkout, set `NODE_PATH` to a directory containing React, React DOM, webpack, and Playwright. Run `node product-media/build.cjs` to rebuild the browser bundle.
