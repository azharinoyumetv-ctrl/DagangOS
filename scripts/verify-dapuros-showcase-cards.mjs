import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../DapurOS/frontend/node_modules/playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 393, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8795/dapuros#fitur');
    const cards = page.locator('[data-dapuros-feature-image]');
    assert.equal(await cards.count(), 6);
    for (let i = 0; i < 6; i++) {
      const card = cards.nth(i);
      await card.locator('img').evaluate(image => image.decode());
      await card.click();
      await page.waitForFunction(() => document.querySelector('.gshow-dialog-image')?.hasAttribute('src'));
      assert.equal(new URL(await page.locator('.gshow-dialog-image').getAttribute('src')).pathname, await card.getAttribute('data-feature-src'));
      await page.keyboard.press('Escape');
      assert(await card.evaluate(element => document.activeElement === element));
    }
    assert(await page.getByText('Reservasi · Paket Business').isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    await page.locator('#fitur').screenshot({ path: `tmp/dapuros-showcase-review/cards-${width}.png` });
    await page.close();
    console.log(`Cards passed at ${width}px`);
  }
} finally { await browser.close(); }
