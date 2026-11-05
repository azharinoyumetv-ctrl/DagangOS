// Records the built DapurOS browser app using only a disposable local database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const app = path.join(root, 'DapurOS');
const build = path.join(app, 'frontend/build');
const out = path.join(root, 'tmp/dapuros-showcase-capture');
const { chromium } = require(path.join(app, 'frontend/node_modules/playwright'));
const { expect } = require(path.join(app, 'frontend/node_modules/@playwright/test'));
const { MongoMemoryReplSet } = require(path.join(root, 'tmp/offline-mongo/node_modules/mongodb-memory-server'));
const origin = 'https://dagangos.com';
const base = 'http://127.0.0.1:18765';
const fixtureKey = randomBytes(32).toString('hex');
const profileSizes = { phone: [412, 915], tablet: [1280, 800], desktop: [1440, 900] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(endpoint, { method = 'GET', body, token, headers } = {}) {
  const response = await fetch(base + endpoint, {
    method, headers: { 'Content-Type': 'application/json', 'X-DagangOS-Module': 'dapuros', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`${method} ${endpoint.split('?')[0].replace(/\b[a-f0-9]{64}\b/g, '[sample-qr]')}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function isolatedContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'id-ID', timezoneId: 'Asia/Jakarta', reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      const headers = { ...request.headers() };
      delete headers.host;
      delete headers['content-length'];
      return route.fulfill({ response: await route.fetch({ url: base + url.pathname + url.search, headers, maxRedirects: 0 }) });
    }
    for (const [directory, relative] of [[path.join(root, 'public'), url.pathname], [build, url.pathname.replace(/^\/dapuros/, '')]]) {
      const file = path.resolve(directory, '.' + relative);
      if (file.startsWith(directory + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file });
    }
    if (request.isNavigationRequest() && url.pathname.startsWith('/dapuros/')) return route.fulfill({ path: path.join(build, 'index.html') });
    return route.fulfill({ status: 404, body: 'Local asset unavailable' });
  });
  return context;
}

async function record(page, name, action) {
  const directory = path.join(out, name);
  fs.mkdirSync(directory, { recursive: true });
  const frames = [{ at: 0, bytes: await page.screenshot({ type: 'jpeg', quality: 93 }) }];
  const session = await page.context().newCDPSession(page);
  const start = performance.now();
  session.on('Page.screencastFrame', ({ data, sessionId }) => {
    frames.push({ at: performance.now() - start, bytes: Buffer.from(data, 'base64') });
    session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  try { await action(); }
  finally { await session.send('Page.stopScreencast'); await session.detach(); }
  const duration = (performance.now() - start) / 1000;
  const concat = ['ffconcat version 1.0'];
  frames.forEach((frame, index) => {
    const file = `${String(index).padStart(4, '0')}.jpg`;
    fs.writeFileSync(path.join(directory, file), frame.bytes);
    concat.push(`file '${file}'`, 'option framerate 30', `duration ${Math.max(.034, ((frames[index + 1]?.at ?? duration * 1000) - frame.at) / 1000).toFixed(4)}`);
  });
  concat.push(`file '${String(frames.length - 1).padStart(4, '0')}.jpg'`, 'option framerate 30');
  fs.writeFileSync(path.join(directory, 'capture.ffconcat'), concat.join('\n') + '\n');
  assert(frames.length > 2, `No screen changes in ${name}`);
  return { name, duration, frames: frames.length };
}

async function captureProfile(browser, device, [width, height]) {
  const context = await isolatedContext(browser, { width, height });
  const guests = await isolatedContext(browser, { width, height });
  const errors = [], recordings = [];
  const staff = await context.newPage(), guest = await guests.newPage(), kitchen = await context.newPage();
  for (const page of [staff, guest, kitchen]) page.on('pageerror', error => errors.push(error.message));
  const shot = async (page, name, locator) => {
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(out, `${device}-${name}.png`);
    if (locator) await locator.screenshot({ path: file, animations: 'disabled' });
    else await page.screenshot({ path: file, animations: 'disabled' });
  };
  const focus = async locator => locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const go = (page, route) => page.goto(origin + '/dapuros/' + route);

  try {
    await go(staff, 'register');
    await staff.getByTestId('register-store-input').fill('Dapur Senja · Contoh');
    await staff.getByTestId('register-email-input').fill(`dapur-senja-${device}@example.com`);
    await staff.getByTestId('register-password-input').fill('DapurShowcaseFixture-2026');
    await staff.getByTestId('register-submit-btn').click();
    await expect(staff.getByTestId('app-layout')).toBeVisible({ timeout: 20000 });
    const { user, token } = await staff.evaluate(() => ({ user: JSON.parse(localStorage.dapuros_user), token: localStorage.dapuros_token }));
    await api('/__e2e/plan', { method: 'POST', headers: { 'X-E2E-Fixture': fixtureKey }, body: { store_id: user.store_id, plan: 'business' } });
    const write = (endpoint, body) => api('/api' + endpoint, { method: 'POST', body, token });
    const read = endpoint => api('/api' + endpoint, { token });
    const product = (name, category, description, price) => write('/products', { name, category, description, price, cost: 8000, stock: 40, unit: 'porsi' });
    const food = await product('Nasi Ayam Bakar', 'Makanan', 'Ayam bakar, nasi hangat, sambal, dan lalapan.', 32000);
    const side = await product('Tempe Mendoan', 'Makanan', 'Tempe hangat dengan sambal kecap.', 14000);
    const drink = await product('Es Teh Lemon', 'Minuman', 'Teh segar dengan perasan lemon.', 12000);
    const floor = (await read('/floors'))[0] || await write('/floors', { name: 'Ruang makan' });
    const addTable = label => write('/tables', { floor_id: floor.id, label, capacity: 4 });
    const table = await addTable('Meja 03');
    const reserved = await addTable('Meja 08');

    await go(staff, 'app/qr-menu');
    await staff.getByTestId('qr-table-select').selectOption(table.id);
    await staff.getByTestId('qr-enable').click();
    const link = staff.getByTestId('qr-public-link');
    await expect(link).toBeVisible();
    const qrUrl = new URL(await link.getAttribute('href'));
    assert.equal(qrUrl.origin, origin);
    assert.equal(qrUrl.pathname, '/dapuros/qr-order');
    if (device === 'phone') await shot(staff, 'qr-card', staff.getByTestId('qr-print-card'));
    await guest.goto(qrUrl.href);
    const guestRequests = [];
    guest.on('request', request => { if (request.url().includes('/api/public/qr/')) guestRequests.push(request); });
    await expect(guest.getByText('Meja belum dibuka.', { exact: false })).toBeVisible();
    await guest.getByTestId(`guest-add-${food.id}`).click();
    await expect(guest.getByTestId('guest-send-order')).toBeDisabled();

    await go(staff, 'app/pos');
    const tableCard = staff.getByTestId(`table-card-${table.id}`);
    await tableCard.click();
    const open = staff.getByRole('button', { name: 'Buka Meja / Tempatkan Tamu', exact: true });
    await expect(open).toBeEnabled();
    await focus(open);
    const openTable = async () => {
      await pause(900);
      await open.click();
      await expect(staff.getByRole('button', { name: 'Ambil Pesanan', exact: false })).toBeVisible();
      await pause(1100);
    };
    if (device === 'phone') recordings.push(await record(staff, 'staff-open', openTable));
    else {
      await open.click();
      await expect(staff.getByRole('button', { name: 'Ambil Pesanan', exact: true })).toBeVisible();
    }
    await read(`/tables/${table.id}/session`);

    await guest.reload();
    await expect(guest.getByTestId(`guest-product-${food.id}`)).toBeVisible();
    await expect(guest.getByText('Meja belum dibuka.', { exact: false })).toHaveCount(0);
    await shot(guest, 'qr');
    const submit = async () => {
      await pause(700);
      await guest.getByTestId(`guest-add-${food.id}`).click();
      await guest.getByLabel(`Catatan ${food.name}`).fill('Sambal dipisah');
      const send = guest.getByTestId('guest-send-order');
      await expect(send).toBeEnabled();
      await focus(send);
      await pause(900);
      await send.click();
      await expect(guest.getByTestId('guest-order-success')).toBeVisible();
      await guest.evaluate(() => scrollTo(0, 0));
      await pause(1100);
    };
    if (device === 'phone') recordings.push(await record(guest, 'guest-send', submit));
    else await submit();
    assert(guestRequests.some(request => request.method() === 'POST'));
    assert(guestRequests.every(request => !request.headers().authorization));
    const [order, ...others] = await read('/orders');
    assert(order && !others.length && order.payment_status === 'pending' && order.items[0].note === 'Sambal dipisah');
    assert.equal((await read(`/tables/${table.id}/session`)).grand_total, order.total);

    await staff.reload();
    await tableCard.click();
    const bill = staff.getByText('Daftar Tagihan Sesi:', { exact: true });
    await expect(staff.getByText(`1x ${food.name}`, { exact: true })).toBeVisible();
    await focus(bill);
    await shot(staff, 'kasir');

    // Add real sample orders through the same API so wider KDS views show a queue.
    if (device !== 'phone') for (const [label, item] of [['Meja 04', side], ['Meja 06', drink]]) {
      const extraTable = await addTable(label);
      await write(`/tables/${extraTable.id}/session`, {});
      const qr = await write(`/tables/${extraTable.id}/qr-link`, { enabled: true });
      const extraToken = new URL(qr.url).searchParams.get('token');
      await api(`/api/public/qr/${extraToken}/orders`, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: { items: [{ product_id: item.id, quantity: 1, expected_price: item.price, note: '' }] } });
    }
    await go(kitchen, 'app/kds');
    const ticket = kitchen.locator('[data-testid^="kds-ticket-"]').filter({ hasText: food.name });
    await expect(ticket).toContainText('SAMBAL DIPISAH', { ignoreCase: true });
    const cook = async () => {
      await pause(800);
      await ticket.getByRole('button', { name: 'Mulai Masak' }).click();
      await expect(ticket).toContainText('Cooking');
      await pause(1100);
      await shot(kitchen, 'dapur');
      await ticket.getByRole('button', { name: 'Tandai Siap (Ready)', exact: true }).click();
      await expect(ticket.getByText('Ready', { exact: true })).toBeVisible();
      await pause(1000);
    };
    if (device === 'phone') recordings.push(await record(kitchen, 'kitchen-ready', cook));
    else await cook();

    await go(staff, 'app/pos');
    const reserveCard = staff.getByTestId(`table-card-${reserved.id}`);
    await reserveCard.click();
    await staff.getByTestId('reservation-open').click();
    await staff.getByTestId('reservation-name').fill('Rombongan Senja');
    await staff.getByTestId('reservation-party-size').fill('3');
    await staff.getByTestId('reservation-note').fill('Dekat jendela');
    await expect(staff.getByTestId('reservation-modal')).toContainText('Business');
    await shot(staff, 'reservasi-form');
    await staff.getByTestId('reservation-save').click();
    await expect(staff.getByTestId('reservation-details')).toContainText('Rombongan Senja');
    await focus(staff.getByTestId('reservation-seat'));
    await shot(staff, 'reservasi-held');
    await staff.getByTestId('reservation-seat').click();
    await expect(staff.getByTestId('seated-reservation-name')).toContainText('Rombongan Senja');
    await focus(staff.getByTestId('seated-reservation-name'));
    await shot(staff, 'reservasi-seated');
    assert.equal((await read(`/tables/${reserved.id}/session`)).session.reservation.customer_name, 'Rombongan Senja');
    if (device === 'desktop') {
      await write('/ingredients', { name: 'Beras', stock: 12000, unit: 'g', min_stock: 3000 });
      await write('/ingredients', { name: 'Ayam', stock: 18000, unit: 'g', min_stock: 5000 });
      await write('/ingredients', { name: 'Sambal', stock: 4500, unit: 'g', min_stock: 1000 });
      await write(`/tables/${table.id}/checkout`, { payment_method: 'cash', cash_received: 50000 });
      await go(staff, 'app/products/ingredients');
      await expect(staff.getByTestId('app-layout')).toBeVisible();
      await expect(staff.getByText('Bahan Baku', { exact: false }).first()).toBeVisible();
      await pause(1200);
      await shot(staff, 'ingredients');
      await go(staff, 'app/reports/sales');
      await expect(staff.getByTestId('app-layout')).toBeVisible();
      await expect(staff.getByText('Laporan', { exact: false }).first()).toBeVisible();
      await pause(1200);
      await shot(staff, 'reports');
    }
    await write(`/tables/${table.id}/qr-link`, { enabled: false });
    assert.deepEqual(errors, []);
    console.log(`Captured ${device}: menu, table bill, kitchen and three reservation states.`);
    return { device, width, height, recordings, verified: ['staff opens table', 'guest submits without staff login', 'one matching table bill and kitchen ticket', 'ticket cooking and ready', 'Business reservation saved and seated'] };
  } finally {
    await guests.close();
    await context.close();
  }
}

async function main() {
  assert(fs.existsSync(path.join(build, 'index.html')), 'Build the DapurOS frontend first.');
  fs.mkdirSync(out, { recursive: true });
  let mongo, backend, browser;
  try {
    mongo = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: path.join(root, 'tmp/mongodb-bin') }, replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' } });
    const permitted = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'COMSPEC']);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => permitted.has(key.toUpperCase())));
    Object.assign(env, { ENV: 'test', MONGO_URL: mongo.getUri(), DB_NAME: 'dapuros_e2e_media_' + randomUUID().replaceAll('-', ''), JWT_SECRET_KEY: randomBytes(48).toString('hex'), E2E_FIXTURE_KEY: fixtureKey, PYTHONUNBUFFERED: '1' });
    const log = fs.openSync(path.join(out, 'backend.log'), 'w');
    backend = spawn(path.join(root, 'GerainaOS/backend/venv/Scripts/python.exe'), ['-m', 'uvicorn', 'e2e.backend:app', '--host', '127.0.0.1', '--port', '18765'], { cwd: app, env, windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    let ready = false;
    for (let attempt = 0; attempt < 100 && backend.exitCode === null; attempt++) {
      try { if ((await api('/api/health')).ok) { ready = true; break; } } catch {}
      await pause(200);
    }
    assert(ready && backend.exitCode === null, 'Local capture backend failed to start.');
    // A second listener on this port cannot pass the per-run fixture key check.
    await api('/__e2e/reset', { method: 'POST', headers: { 'X-E2E-Fixture': fixtureKey }, body: {} });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const profiles = [];
    for (const [device, size] of Object.entries(profileSizes)) profiles.push(await captureProfile(browser, device, size));
    fs.writeFileSync(path.join(out, 'capture.json'), JSON.stringify({ status: 'passed', data: 'Synthetic restaurant data via actual DapurOS routes', profiles }, null, 2) + '\n');
  } finally {
    if (browser) await browser.close();
    if (backend && backend.exitCode === null) { backend.kill(); await new Promise(resolve => backend.once('close', resolve)); }
    if (mongo) await mongo.stop().catch(error => console.warn('Fixture shutdown:', error.message));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
