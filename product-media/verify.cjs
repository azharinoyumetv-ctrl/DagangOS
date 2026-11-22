const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { extname, resolve, sep } = require('node:path');
const { createRequire } = require('node:module');

const frontendRequire = createRequire(resolve(__dirname, '../GerainaOS/frontend/package.json'));
const { chromium } = frontendRequire('playwright');
const root = resolve(__dirname, '../public');
const contentTypes = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const product = { '/geraina': 'geraina', '/dapuros': 'dapuros' }[pathname];
  if (product) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/product-media/gallery.css"><div data-product-media="${product}" lang="id-ID"></div><script defer src="/product-media/gallery.js"></script></html>`);
    return;
  }

  const file = resolve(root, `.${pathname}`);
  if (!file.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});

async function verifyImages(browser, base) {
  for (const [product, count] of [['geraina', 2], ['dapuros', 1]]) {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.goto(`${base}/${product}`);
      const gallery = page.locator('.pm-gallery');
      await gallery.waitFor();
      assert.equal(await gallery.locator('.pm-card').count(), count);
      const trigger = gallery.locator('.pm-image').first();
      await trigger.click();
      await page.locator('.pm-dialog[open]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.pm-dialog[open]').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement === document.querySelector('.pm-image'));
      await page.close();
    }
  }
}

async function verifyMediaStates(browser, base) {
  const page = await browser.newPage();
  const poster = '/assets/geraina-android/phone-dashboard.png';
  const common = { productId: 'geraina', locale: 'id-ID', status: 'published', description: 'Example', alt: 'Example' };
  await page.route('**/product-media/geraina.json', route => route.fulfill({ json: [
    { ...common, id: 'broken', type: 'image', src: '/missing.png', headline: 'Broken', order: 1 },
    { ...common, id: 'draft', type: 'image', src: poster, headline: 'Draft', status: 'draft', order: 1 },
    { ...common, id: 'image', type: 'image', src: poster, headline: 'Image', order: 2 },
    { ...common, id: 'video', type: 'video', src: '/test.mp4', poster, headline: 'Video', order: 3 },
  ] }));
  const requests = [];
  await page.route('**/test.mp4', route => {
    requests.push(route.request());
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`${base}/geraina`);
  await page.waitForFunction(() => document.querySelectorAll('.pm-card').length === 2);
  assert.deepEqual(await page.locator('.pm-caption h3').allTextContents(), ['Video', 'Image']);
  assert.equal(requests.length, 0);
  await page.locator('.pm-image').first().click();
  await page.getByRole('alert').waitFor();
  assert.ok(requests.length > 0);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.pm-dialog > p').last().textContent(), 'Image');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.pm-dialog > p').last().textContent(), 'Video');
  await page.close();

  const missing = await browser.newPage();
  await missing.route('**/product-media/geraina.json', route => route.fulfill({ status: 404, body: '' }));
  const manifest = missing.waitForResponse(/product-media\/geraina\.json$/);
  await missing.goto(`${base}/geraina`);
  assert.equal((await manifest).status(), 404);
  assert.equal(await missing.locator('.pm-gallery').count(), 0);
  await missing.close();
}

async function main() {
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await verifyImages(browser, base);
    await verifyMediaStates(browser, base);
    console.log('Shared gallery verified on mobile and desktop, including keyboard navigation and missing media.');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
