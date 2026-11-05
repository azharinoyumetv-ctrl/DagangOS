import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('../DapurOS/frontend/node_modules/playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out = 'tmp/dapuros-showcase-review';
mkdirSync(out, { recursive: true });
const settled = page => page.waitForFunction(() => document.querySelector('[data-showcase-deck]')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('.gshow-scene').length === 1);
try {
  let views = 0;
  for (const width of [320, 393, 768, 1280, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8795/dapuros');
    await settled(page);
    for (const device of ['phone', 'tablet', 'desktop']) {
      await page.locator(`[data-showcase-device="${device}"]`).click();
      await settled(page);
      for (const feature of ['qr', 'kasir', 'dapur', 'reservasi']) {
        await page.locator(`[data-showcase-feature="${feature}"]`).click();
        await settled(page);
        const scene = page.locator('.gshow-scene');
        assert.equal(await scene.getAttribute('data-device'), device);
        assert.equal(await scene.getAttribute('data-feature'), feature);
        const geometry = await scene.locator('img').evaluate(img => { const r = img.getBoundingClientRect(), s = document.querySelector('[data-showcase-stage]').getBoundingClientRect(); return { ratio: r.width / r.height, natural: img.naturalWidth / img.naturalHeight, fits: r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1 }; });
        assert(Math.abs(geometry.ratio - geometry.natural) < .015 && geometry.fits);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        views++;
        if (feature === 'reservasi') {
          assert(await page.locator('[data-showcase-variants]').isVisible());
          assert.match(await page.locator('[data-showcase-variants]').innerText(), /Business/);
          for (const variant of ['', 'held', 'seated']) {
            const button = page.locator(`[data-showcase-variant="${variant}"]`);
            await button.click(); await settled(page);
            assert.equal(await button.getAttribute('aria-pressed'), 'true');
            const expected = variant === '' ? 'reservasi-form' : `reservasi-${variant}`;
            assert((await page.locator('.gshow-scene img').getAttribute('src')).includes(expected));
          }
        }
      }
    }
    await page.locator('.gshow-scene-button').click();
    await page.waitForFunction(() => document.querySelector('.gshow-dialog-image')?.hasAttribute('src'));
    assert(await page.locator('dialog').evaluate(dialog => dialog.open));
    await page.keyboard.press('Escape');
    assert(!(await page.locator('dialog').evaluate(dialog => dialog.open)));
    const video = page.locator('#dapuros-promo-video');
    assert(await video.evaluate(v => v.paused && v.currentTime === 0));
    await page.locator('[data-video-play]').click();
    await page.waitForFunction(() => { const v = document.querySelector('#dapuros-promo-video'); return !v.paused && v.currentTime > .1 && v.videoWidth === 720 && v.videoHeight === 1280; });
    assert(Math.abs(await video.evaluate(v => v.duration) - 25) < .2);
    await page.locator('#galeri-dapuros').screenshot({ path: `${out}/gallery-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Passed width ${width}`);
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto('http://127.0.0.1:8795/dapuros'); await settled(page);
  await page.locator('[data-slide-next]').click();
  await page.waitForFunction(() => document.getAnimations().some(a => a.effect?.getTiming().duration === 380));
  await settled(page);
  assert.equal(await page.locator('.gshow-scene').getAttribute('data-feature'), 'kasir');
  console.log(`Passed ${views} device and feature views, reservation steps, image viewer, video playback, and animation.`);
} finally { await browser.close(); }
