import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { Miniflare, createFetchMock } from 'miniflare';
import { selection, signReceipt } from '../src/subscription-checkout.js';
import { observeAcquisition } from '../src/affiliate-program.js';

const origin = 'https://dagangos.com';
const ownerId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const signingKey = 'fixture-signing-key';
const paymentUrl = 'https://checkout.xendit.co/web/affiliate-test-only';
const headers = { headers: { 'Content-Type': 'application/json' } };
const migrations = await Promise.all(['0001_affiliate_program.sql', '0002_affiliate_attributions.sql', '0003_affiliate_payout_policy.sql', '0004_affiliate_enrollment.sql', '0005_affiliate_reconciliation.sql', '0006_affiliate_bank_details.sql']
  .map(file => readFile(`migrations/${file}`, 'utf8')));

async function setup(t, scope, conversionDays = null) {
  const mock = createFetchMock();
  mock.disableNetConnect();
  const stateRoot = resolve('.wrangler');
  await mkdir(stateRoot, { recursive: true });
  const state = await mkdtemp(join(stateRoot, 'affiliate-test-'));
  const filenames = ['src/subscription-checkout.js', 'src/xendit-payments.js', 'src/affiliate-program.js', 'src/subscription-products.js'];
  const worker = new Miniflare({
    modules: [
      { type: 'ESModule', path: resolve('affiliate-test-worker.mjs'), contents: `
        import { handleAffiliate, reconcileAffiliateBatch } from './src/affiliate-program.js';
        import { handleSubscriptionCheckout } from './src/subscription-checkout.js';
        export default { async fetch(request, env) {
          if (new URL(request.url).pathname === '/__test/reconcile') return Response.json(await reconcileAffiliateBatch(env, Number(new URL(request.url).searchParams.get('now'))));
          return await handleAffiliate(request, env) || await handleSubscriptionCheckout(request, env) || new Response('', {status: 404});
        } };
      ` },
      ...await Promise.all(filenames.map(async path => ({ type: 'ESModule', path: resolve(path), contents: await readFile(path, 'utf8') }))),
    ],
    compatibilityDate: '2026-06-27',
    d1Databases: ['AFFILIATE_DB'],
    d1Persist: state,
    bindings: {
      AFFILIATE_CHECKOUT: 'on', AFFILIATE_ADMIN_TOKEN: 'operator-fixture',
      RESEND_API_KEY: 'mail-fixture',
      AFFILIATE_BANK_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      SUBSCRIPTION_SIGNING_KEY: signingKey, XENDIT_SECRET_KEY: 'gateway-fixture',
      XENDIT_WEBHOOK_TOKEN: 'webhook-fixture', GERAINA_BACKEND_ORIGIN: 'geraina.test', BACKEND_ORIGIN: 'dapuros.test',
    },
    fetchMock: mock,
  });
  t.after(async () => {
    await worker.dispose();
    if (dirname(resolve(state)) === stateRoot) await rm(state, { recursive: true, force: true });
  });
  const db = await worker.getD1Database('AFFILIATE_DB');
  // D1 exec expects a complete SQL statement on each line.
  for (const migration of migrations) await db.exec(migration.trim().replace(/;\n\n/g, ';\u0000').replace(/\n/g, ' ').replace(/\u0000/g, '\n'));
  if (scope) await db.prepare("INSERT INTO affiliate_policy VALUES (1, 'pilot-1', ?, 30, ?)").bind(scope, conversionDays).run();
  const fetch = (path, options = {}) => worker.dispatchFetch(origin + path, { redirect: 'manual', ...options });
  const createAccount = (code, email, admin = true) => fetch('/api/affiliate/admin/accounts', {
    method: 'POST', headers: admin ? { Authorization: 'Bearer operator-fixture' } : {},
    body: JSON.stringify({ code, email, name: `${code} <operator entry>` }),
  });
  const enrolled = await createAccount('PROMOTE01', 'affiliate@example.test');
  assert.equal(enrolled.status, 201, await enrolled.clone().text());
  const { accessCode } = await enrolled.json();
  return { fetch, db, mock, createAccount, accessCode };
}

function cart(module, period, id) {
  return { ...selection(module, 'starter', period), provider: 'xendit', orderId: `DG-${module}-${id.repeat(32)}`, expires: Date.now() + 3600000 };
}

async function submit(fetch, order, cookie, extra = {}) {
  return fetch(`/${order.module}/checkout`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams({ cart: await signReceipt(order, signingKey), access_token: 'authenticated.sandbox-owner.test', ...extra }).toString(),
  });
}

function backend(mock, order, { email = 'merchant@example.test', eligible = true, times = 1, signupAt = new Date(Date.now() - 86400000).toISOString() } = {}) {
  const api = mock.get(`https://${order.module}.test`);
  api.intercept({ path: '/api/subscriptions/orders', method: 'POST' }).reply(200,
    { order_id: order.orderId, amount: order.amount, owner_id: ownerId, store_id: storeId, affiliate_eligible: eligible, affiliate_signup_at: signupAt, email },
    headers).times(times);
  return api;
}

test('one affiliate account serves current and future products and keeps dashboard access private', async t => {
  const { db, fetch, createAccount, accessCode } = await setup(t);
  assert.equal((await createAccount('OTHER123', 'other@example.test', false)).status, 403);
  assert.equal((await createAccount('promote01', 'unique@example.test')).status, 409);
  await db.prepare("INSERT INTO affiliate_products (id, name, destination, mode) VALUES ('future-app', 'Future & App', '/produk', 'tracking')").run();
  const legacy = await fetch('/affiliate');
  assert.equal(legacy.status, 308);
  assert.equal(legacy.headers.get('Location'), '/affiliate-program');
  const landing = await fetch('/affiliate-program');
  assert.equal(landing.headers.get('Referrer-Policy'), 'same-origin');
  const publicPage = await landing.text();
  assert.match(publicPage, /Kode akses dasbor/);
  assert.match(publicPage, /Rp 149\.000/);
  assert.match(publicPage, /tanggal 25/);
  assert.match(publicPage, /masa tunggu 30 hari/);
  assert.match(publicPage, /belum berjalan otomatis/);
  const login = await fetch('/affiliate-program/login', { method: 'POST', headers: { Origin: origin }, body: new URLSearchParams({ access: accessCode }).toString() });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('Location'), '/affiliate-program');
  assert.match(login.headers.get('Set-Cookie'), /Path=\/affiliate-program;/);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const chooser = await fetch('/affiliate-program/promote01');
  assert.match(await chooser.text(), /Future &amp; App/);
  assert.equal((await fetch('/affiliate/PROMOTE01/laundryos')).status, 404);
  const web = await fetch('/affiliate/PROMOTE01/web');
  assert.equal(new URL(web.headers.get('Location')).origin, 'https://wmp.dagangos.com');
  assert.equal(new URL(web.headers.get('Location')).pathname, '/api/affiliate/referral');
  const dapur = await fetch('/affiliate-program/PROMOTE01/dapuros');
  assert.equal(dapur.headers.get('Location'), `${origin}/dapuros`);
  assert.match(dapur.headers.get('Set-Cookie'), /__Host-dg-ref-dapuros=.*HttpOnly/);
  await fetch('/affiliate/PROMOTE01/geraina', { method: 'HEAD' });
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_visits').first('count'), 2);
  const dashboardResponse = await fetch('/affiliate-program', { headers: { Cookie: cookie } });
  const dashboard = await dashboardResponse.text();
  assert.match(dashboard, /PROMOTE01 &lt;operator entry&gt;/);
  assert.match(dashboard, /DagangOS Web/);
  assert.match(dashboard, /LaundryOS/);
  assert.match(dashboard, /dagangos\.com\/affiliate-program\/PROMOTE01\/future-app/);
  assert.doesNotMatch(dashboard, /affiliate@example|merchant@example/);
  assert.equal(dashboardResponse.headers.get('Cache-Control'), 'no-store');
});

test('email verification creates an affiliate once and can recover dashboard access', async t => {
  const { fetch, db, mock } = await setup(t, 'merchant_product', 90);
  const messages = [];
  mock.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' }).reply(options => {
    messages.push(new Response(options.body).json());
    return { statusCode: 200, data: { id: 'email-fixture' }, responseOptions: headers };
  }).times(2);
  const register = () => fetch('/affiliate-program/register', { method: 'POST',
    headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.10' },
    body: new URLSearchParams({ name: 'Mitra Testing', email: 'test@example.test' }).toString() });
  const initialRegistration = await register();
  assert.equal(initialRegistration.status, 200, `${await initialRegistration.clone().text()} mocked messages=${messages.length}`);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliates').first('count'), 1);
  const link = new URL((await messages[0]).text.match(/https:\/\/\S+/)[0]);
  const verify = link.pathname;
  assert.equal((await fetch(verify)).status, 200);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliates').first('count'), 1);
  const verifyBody = new URLSearchParams({token: verify.split('/').pop()}).toString();
  assert.equal((await fetch('/affiliate-program/verify', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: verifyBody })).status, 403);
  const created = await fetch('/affiliate-program/verify', { method: 'POST', headers: { Origin: origin }, body: verifyBody });
  assert.equal(created.status, 200);
  const body = await created.text();
  const code = body.match(/Kode afiliasi Anda: <strong>([A-F0-9]+)<\/strong>/)[1];
  const oldCookie = created.headers.get('Set-Cookie').split(';')[0];
  assert.match(await (await fetch('/affiliate-program', { headers: { Cookie: oldCookie } })).text(), new RegExp(code));
  assert.equal((await fetch('/affiliate-program/verify', { method: 'POST', headers: { Origin: origin }, body: verifyBody })).status, 410);
  assert.equal((await register()).status, 200);
  const recovery = new URL((await messages[1]).text.match(/https:\/\/\S+/)[0]).pathname;
  const recovered = await fetch('/affiliate-program/verify', { method: 'POST', headers: { Origin: origin }, body: new URLSearchParams({token: recovery.split('/').pop()}).toString() });
  assert.equal(recovered.status, 200);
  assert.match(await recovered.text(), new RegExp(code));
  assert.match(await (await fetch('/affiliate-program', { headers: { Cookie: oldCookie } })).text(), /Kode akses dasbor/);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliates').first('count'), 2);
  mock.assertNoPendingInterceptors();
});

test('enrollment rejects cross-site requests, expired links, and repeated email requests', async t => {
  const { fetch, db, mock } = await setup(t, 'merchant_product', 90);
  const messages = [];
  mock.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' }).reply(options => {
    messages.push(new Response(options.body).json());
    return { statusCode: 200, data: { id: 'email-fixture' }, responseOptions: headers };
  }).times(3);
  const registration = originHeader => fetch('/affiliate-program/register', { method: 'POST',
    headers: { Origin: originHeader, 'CF-Connecting-IP': '192.0.2.11' },
    body: new URLSearchParams({ name: 'Partner', email: 'partner@example.test' }).toString() });
  assert.equal((await registration('https://evil.test')).status, 403);
  for (let i = 0; i < 3; i++) assert.equal((await registration(origin)).status, 200);
  assert.equal((await registration(origin)).status, 429);
  const verification = new URL((await messages[0]).text.match(/https:\/\/\S+/)[0]).pathname;
  const visit = await fetch(verification);
  assert.equal(visit.headers.get('Referrer-Policy'), 'origin');
  await db.prepare('UPDATE affiliate_verification_requests SET expires_at = ?').bind(Date.now() - 1).run();
  assert.equal((await fetch(verification)).status, 410);
  assert.equal((await fetch('/affiliate-program/verify', { method: 'POST', headers: { Origin: origin }, body: new URLSearchParams({token: verification.split('/').pop()}).toString() })).status, 410);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliates').first('count'), 1);
  mock.assertNoPendingInterceptors();
});

test('bank destination is encrypted and saved only after same-session email verification', async t => {
  const { fetch, db, mock, accessCode } = await setup(t, 'merchant_product', 90);
  const login = await fetch('/affiliate-program/login', {method:'POST',headers:{Origin:origin},body:new URLSearchParams({access:accessCode}).toString()});
  const cookie=login.headers.get('Set-Cookie').split(';')[0];
  const messages=[];
  mock.get('https://api.resend.com').intercept({path:'/emails',method:'POST'}).reply(options=>{
    messages.push(new Response(options.body).json());
    return {statusCode:200,data:{id:'test'},responseOptions:headers};
  });
  const fields={email:'affiliate@example.test',bank:'ID_BCA',account_name:'Ayu Test',account_number:'1234567890'};
  const submitBank=(fields,cookieValue=cookie)=>fetch('/affiliate-program/bank',{method:'POST',
    headers:{Origin:origin,Cookie:cookieValue},body:new URLSearchParams(fields).toString()});
  assert.equal((await submitBank({...fields,email:'other@example.test'})).status,400);
  assert.equal((await submitBank(fields)).status,200);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_bank_destinations').first('count'),0);
  const pending=await db.prepare('SELECT * FROM affiliate_bank_change_requests').first();
  assert.doesNotMatch(JSON.stringify(pending),/1234567890|Ayu Test/);
  const link=new URL((await messages[0]).text.match(/https:\/\/\S+/)[0]).pathname;
  assert.equal((await fetch(link)).status,401);
  const confirmBody=new URLSearchParams({token:link.split('/').pop()}).toString();
  assert.equal((await fetch('/affiliate-program/bank/verify',{method:'POST',headers:{Origin:'https://evil.test',Cookie:cookie},body:confirmBody})).status,403);
  const confirm=()=>fetch('/affiliate-program/bank/verify',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:confirmBody});
  assert.equal((await confirm()).status,200);
  assert.equal((await confirm()).status,410);
  const row=await db.prepare('SELECT * FROM affiliate_bank_destinations').first();
  assert.equal(row.bank_code,'ID_BCA');assert.equal(row.last_four,'7890');
  assert.doesNotMatch(JSON.stringify(row),/1234567890|Ayu Test/);
  const key=await crypto.subtle.importKey('raw',new Uint8Array(32),'AES-GCM',false,['decrypt']);
  const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(row.nonce,'hex'),additionalData:new TextEncoder().encode(row.affiliate_id)},key,Buffer.from(row.encrypted_details,'hex'));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(decrypted)),{name:'Ayu Test',number:'1234567890'});
  assert.match(await (await fetch('/affiliate-program',{headers:{Cookie:cookie}})).text(),/ID_BCA ···· 7890/);
  mock.assertNoPendingInterceptors();
});

test('Geraina annual checkout verifies the offer, creates one invoice, and records one settled commission and reversal', async t => {
  const { fetch, db, mock } = await setup(t, 'merchant_product');
  const order = cart('geraina', 'yearly', 'a');
  const referral = await fetch('/affiliate/PROMOTE01/geraina');
  const cookie = referral.headers.get('Set-Cookie').split(';')[0];
  const api = backend(mock, order, { times: 3 });
  const quote = await submit(fetch, order, cookie);
  assert.equal(quote.status, 200);
  const html = await quote.text();
  assert.match(html, /Rp 1\.490\.000/);
  assert.match(html, /Rp 1\.341\.000/);
  assert.match(html, />Lanjut ke pembayaran<\/button>/);
  const confirm_referral = html.match(/name="confirm_referral" value="([^"]+)"/)[1];
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_acquisitions').first('count'), 0);
  api.intercept({ path: `/api/subscriptions/orders/${order.orderId}/reference`, method: 'POST' }).reply(200, { ok: true }, headers).times(2);
  const xendit = mock.get('https://api.xendit.co');
  xendit.intercept({ path: '/v2/invoices', method: 'POST' }).reply(201,
    { external_id: order.orderId, amount: 1341000, currency: 'IDR', invoice_url: paymentUrl }, headers);
  const continued = await submit(fetch, order, cookie, { confirm_referral });
  assert.equal(continued.status, 303, await continued.clone().text());
  assert.equal(continued.headers.get('Location'), paymentUrl);
  const retry = await submit(fetch, order, cookie, { confirm_referral });
  assert.match(retry.headers.get('Location'), /^\/geraina\/order\?/);
  const receipt = new URL(retry.headers.get('Location'), origin).searchParams.get('receipt');
  const invoicePath = `/v2/invoices?external_id=${order.orderId}&limit=10`;
  const paidAt = '2026-11-15T02:00:00.000Z';
  const invoice = { external_id: order.orderId, amount: 1341000, paid_amount: 1341000, currency: 'IDR', paid_at: paidAt };
  const check = () => fetch('/api/subscriptions/payment-status', { method: 'POST', body: JSON.stringify({ receipt }) });
  xendit.intercept({ path: invoicePath }).reply(200, [{ ...invoice, status: 'PAID' }], headers);
  assert.deepEqual(await (await check()).json(), {
    orderId: order.orderId, module: 'geraina', tier: 'starter', period: 'yearly', amount: 1341000,
    ownerId, storeId, status: 'paid', paidAt, paymentUrl: null, acquisition: true, baseAmount: 1490000,
  });
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_ledger').first('count'), 0);
  xendit.intercept({ path: invoicePath }).reply(200, [{ ...invoice, status: 'SETTLED' }], headers).times(10);
  for (const result of await Promise.all(Array.from({ length: 10 }, check))) assert.equal((await result.json()).status, 'paid');
  assert.deepEqual((await db.prepare('SELECT kind, amount FROM affiliate_ledger').all()).results, [{ kind: 'commission', amount: 14900 }]);
  xendit.intercept({ path: invoicePath }).reply(200, [{ ...invoice, status: 'REFUNDED' }], headers);
  assert.equal((await (await check()).json()).status, 'refunded');
  xendit.intercept({ path: invoicePath }).reply(200, [{ ...invoice, status: 'SETTLED' }], headers);
  assert.equal((await (await check()).json()).status, 'refunded');
  assert.deepEqual((await db.prepare('SELECT kind, amount FROM affiliate_ledger ORDER BY kind').all()).results,
    [{ kind: 'commission', amount: 14900 }, { kind: 'reversal', amount: -14900 }]);
  mock.assertNoPendingInterceptors();
});

test('a self-referral stays full price and the global acquisition slot blocks a concurrent product checkout', async t => {
  const { fetch, db, mock } = await setup(t, 'global');
  const self = await fetch('/affiliate/PROMOTE01/dapuros');
  const cookie = self.headers.get('Set-Cookie').split(';')[0];
  const order = cart('dapuros', 'monthly', 'a');
  const other = cart('geraina', 'monthly', 'b');
  const api = backend(mock, order, { email: 'Affiliate@example.test' });
  backend(mock, other);
  api.intercept({ path: `/api/subscriptions/orders/${order.orderId}/reference`, method: 'POST' }).reply(200, { ok: true }, headers);
  mock.get('https://api.xendit.co').intercept({ path: '/v2/invoices', method: 'POST' })
    .reply(201, { external_id: order.orderId, amount: 249000, currency: 'IDR', invoice_url: paymentUrl }, headers);
  assert.equal((await submit(fetch, order, cookie)).headers.get('Location'), paymentUrl);
  assert.equal((await submit(fetch, other, '')).status, 409);
  assert.deepEqual(await db.prepare('SELECT affiliate_id, charged_amount FROM affiliate_acquisitions').first(),
    { affiliate_id: null, charged_amount: 249000 });
  mock.assertNoPendingInterceptors();
});

test('DapurOS uses its own list price and QR reconciliation requires matching settlement evidence', async t => {
  const { fetch, db, mock } = await setup(t, 'merchant_product');
  const { headers: referralHeaders } = await fetch('/affiliate/PROMOTE01/dapuros');
  const cookie = referralHeaders.get('Set-Cookie').split(';')[0];
  const order = cart('dapuros', 'monthly', 'b');
  const api = backend(mock, order, { times: 2 });
  const quote = await (await submit(fetch, order, cookie)).text();
  assert.match(quote, /Rp 224\.100/);
  const confirm_referral = quote.match(/name="confirm_referral" value="([^"]+)"/)[1];
  api.intercept({ path: `/api/subscriptions/orders/${order.orderId}/reference`, method: 'POST' }).reply(200, { ok: true }, headers);
  const xendit = mock.get('https://api.xendit.co');
  xendit.intercept({ path: '/v2/invoices', method: 'POST' })
    .reply(201, { external_id: order.orderId, amount: 224100, currency: 'IDR', invoice_url: paymentUrl }, headers);
  assert.equal((await submit(fetch, order, cookie, { confirm_referral })).headers.get('Location'), paymentUrl);
  xendit.intercept({ path: `/v2/invoices?external_id=${order.orderId}&limit=10` }).reply(200, [{
    external_id: order.orderId, amount: 224100, paid_amount: 224100, currency: 'IDR', status: 'PAID', paid_at: '2026-11-15T02:00:00.000Z',
  }], headers).times(2);
  const reconcile = () => fetch('/api/affiliate/admin/reconcile', {
    method: 'POST', headers: { Authorization: 'Bearer operator-fixture' },
    body: JSON.stringify({ orderId: order.orderId, verifySettlement: true }),
  });
  const query = `/transactions?types=PAYMENT&reference_id=${order.orderId}&currency=IDR&limit=10`;
  const transaction = { id: 'txn_qr_fixture', reference_id: order.orderId, type: 'PAYMENT', currency: 'IDR',
    amount: 224100, cashflow: 'MONEY_IN', status: 'SUCCESS', settlement_status: 'SETTLED' };
  xendit.intercept({ path: query }).reply(200, { has_more: false, data: [{ ...transaction, amount: 1 }] }, headers);
  assert.equal((await (await reconcile()).json()).acquisitionState, 'paid');
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_ledger').first('count'), 0);
  xendit.intercept({ path: query }).reply(200, { has_more: false, data: [transaction] }, headers);
  assert.equal((await (await reconcile()).json()).acquisitionState, 'settled');
  assert.deepEqual(await db.prepare('SELECT kind, amount, provider_reference FROM affiliate_ledger').first(),
    { kind: 'commission', amount: 24900, provider_reference: 'txn_qr_fixture' });
  mock.assertNoPendingInterceptors();
});

test('scheduled reconciliation retries paid sales independently and records a settled commission once', async t => {
  const { fetch, db, mock } = await setup(t, 'merchant_product', 90);
  const affiliateId = await db.prepare("SELECT id FROM affiliates WHERE code = 'PROMOTE01'").first('id');
  const now = Date.now();
  const insert = db.prepare(`INSERT INTO affiliate_acquisitions
    (order_id, scope_key, product_id, owner_id, store_id, affiliate_id, policy_version, tier, period,
     list_amount, monthly_amount, charged_amount, quote_expires, state)
    VALUES (?, ?, 'geraina', ?, ?, ?, 'pilot-1', 'starter', 'monthly', 149000, 149000, 134100, ?, 'paid')`);
  const orders = ['a', 'b'].map(letter => `DG-geraina-${letter.repeat(32)}`);
  for (const order of orders) await insert.bind(order, `scope:${order}`, ownerId, storeId, affiliateId, now + 10000).run();
  const xendit = mock.get('https://api.xendit.co');
  const path = order => `/v2/invoices?external_id=${order}&limit=10`;
  const invoice = { external_id: orders[0], amount: 134100, paid_amount: 134100, currency: 'IDR', status: 'SETTLED', paid_at: new Date(now).toISOString() };
  xendit.intercept({ path: path(orders[0]) }).reply(200, [invoice], headers);
  xendit.intercept({ path: path(orders[1]) }).reply(500, {error: 'temporary'}, headers);
  assert.deepEqual(await (await fetch(`/__test/reconcile?now=${now}`)).json(), {checked: 2, failed: 1});
  assert.deepEqual((await db.prepare('SELECT order_id, kind, amount FROM affiliate_ledger').all()).results,
    [{order_id: orders[0], kind: 'commission', amount: 14900}]);
  assert.equal(await db.prepare('SELECT state FROM affiliate_acquisitions WHERE order_id = ?').bind(orders[1]).first('state'), 'paid');
  assert.deepEqual(await (await fetch(`/__test/reconcile?now=${now + 1000}`)).json(), {checked: 0, failed: 0});
  xendit.intercept({ path: path(orders[0]) }).reply(200, [invoice], headers);
  xendit.intercept({ path: path(orders[1]) }).reply(200, [{...invoice, external_id: orders[1]}], headers);
  assert.deepEqual(await (await fetch(`/__test/reconcile?now=${now + 3600001}`)).json(), {checked: 2, failed: 0});
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_ledger').first('count'), 2);
  mock.assertNoPendingInterceptors();
});

test('a trial referral follows the verified owner to a different browser and stays tied to its product', async t => {
  const { fetch, db, mock } = await setup(t, 'merchant_product', 30);
  const referral = await fetch('/affiliate/PROMOTE01/geraina');
  const cookie = referral.headers.get('Set-Cookie').split(';')[0];
  const path = '/api/affiliate/signup?product=geraina';
  const preview = await fetch(path, { headers: { Cookie: cookie } });
  assert.deepEqual(await preview.json(), { available: true, code: 'PROMOTE01' });
  const claim = headers => fetch(path, { method: 'POST', headers: { Origin: origin, Cookie: cookie, ...headers } });
  assert.equal((await claim({})).status, 401);
  const started = new Date(Date.now() - 86400000).toISOString();
  mock.get('https://geraina.test').intercept({ path: '/api/auth/me', method: 'GET' }).reply(200,
    { id: ownerId, role: 'Owner', current_module: 'geraina', is_store_owner: true, plan: 'trial', email: 'merchant@example.test', affiliate_signup_at: started }, headers);
  assert.deepEqual(await (await claim({ Authorization: 'Bearer authenticated.sandbox-owner.test' })).json(),
    { available: true, code: 'PROMOTE01' });
  const stored = await db.prepare('SELECT owner_id, product_id, source, expires_at FROM affiliate_attributions').first();
  assert.deepEqual(stored, { owner_id: ownerId, product_id: 'geraina', source: 'signup_link', expires_at: Date.parse(started) + 30 * 86400000 });
  const geraina = cart('geraina', 'yearly', 'a');
  const dapur = cart('dapuros', 'monthly', 'b');
  backend(mock, geraina);
  backend(mock, dapur);
  const gerainaQuote = await (await submit(fetch, geraina)).text();
  assert.match(gerainaQuote, /Kode afiliasi <strong>PROMOTE01<\/strong> diterapkan/);
  assert.match(gerainaQuote, /Rp 1\.341\.000/);
  const dapurQuote = await (await submit(fetch, dapur)).text();
  assert.match(dapurQuote, /Punya kode afiliasi\?/);
  assert.doesNotMatch(dapurQuote, /PROMOTE01|Rp 224\.100/);
  mock.assertNoPendingInterceptors();
});

test('a code entered after the conversion window cannot restart that window', async t => {
  const { fetch, db, mock } = await setup(t, 'merchant_product', 30);
  const order = cart('dapuros', 'monthly', 'd');
  backend(mock, order, { signupAt: new Date(Date.now() - 31 * 86400000).toISOString() });
  const response = await submit(fetch, order, '', { affiliate_code: 'PROMOTE01' });
  const html = await response.text();
  assert.doesNotMatch(html, /Rp 224\.100/);
  assert.match(html, /Masa berlaku kode afiliasi sudah berakhir/);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_attributions').first('count'), 0);
  mock.assertNoPendingInterceptors();
});

test('settlement after the saved referral deadline does not create commission', async t => {
  const { fetch, db, mock } = await setup(t, 'merchant_product', 30);
  const order = cart('dapuros', 'monthly', 'e');
  const api = backend(mock, order, { times: 2 });
  const quote = await (await submit(fetch, order, '', { affiliate_code: 'PROMOTE01' })).text();
  const confirm_referral = quote.match(/name="confirm_referral" value="([^"]+)"/)[1];
  api.intercept({ path: `/api/subscriptions/orders/${order.orderId}/reference`, method: 'POST' }).reply(200, { ok: true }, headers);
  mock.get('https://api.xendit.co').intercept({ path: '/v2/invoices', method: 'POST' }).reply(201,
    { external_id: order.orderId, amount: 224100, currency: 'IDR', invoice_url: paymentUrl }, headers);
  assert.equal((await submit(fetch, order, '', { confirm_referral })).status, 303);
  const deadline = await db.prepare('SELECT expires_at FROM affiliate_attributions').first('expires_at');
  const acquisition = await db.prepare('SELECT * FROM affiliate_acquisitions').first();
  await observeAcquisition(db, acquisition, { external_id: order.orderId, amount: 224100, paid_amount: 224100,
    currency: 'IDR', status: 'SETTLED', paid_at: new Date(deadline + 1).toISOString() });
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_ledger').first('count'), 0);
  mock.assertNoPendingInterceptors();
});

test('first checkout lets the owner claim a valid code once and shows the new total before payment', async t => {
  const { fetch, db, mock, createAccount } = await setup(t, 'merchant_product', 30);
  assert.equal((await createAccount('ANOTHER01', 'another@example.test')).status, 201);
  const order = cart('dapuros', 'monthly', 'c');
  const api = backend(mock, order, { times: 5 });
  const review = await (await submit(fetch, order)).text();
  assert.match(review, /name="affiliate_code"/);
  assert.match(review, /Rp 249\.000/);
  const invalid = await (await submit(fetch, order, '', { affiliate_code: 'INVALID01' })).text();
  assert.match(invalid, /Kode afiliasi tidak dapat digunakan/);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_attributions').first('count'), 0);
  const quote = await (await submit(fetch, order, '', { affiliate_code: 'promote01' })).text();
  assert.match(quote, /PROMOTE01/);
  assert.match(quote, /Rp 224\.100/);
  const repeat = await (await submit(fetch, order, '', { affiliate_code: 'ANOTHER01' })).text();
  assert.match(repeat, /PROMOTE01/);
  assert.doesNotMatch(repeat, /ANOTHER01/);
  assert.equal(await db.prepare('SELECT source FROM affiliate_attributions').first('source'), 'checkout_code');
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM affiliate_acquisitions').first('count'), 0);
  const confirm_referral = quote.match(/name="confirm_referral" value="([^"]+)"/)[1];
  api.intercept({ path: `/api/subscriptions/orders/${order.orderId}/reference`, method: 'POST' }).reply(200, { ok: true }, headers);
  mock.get('https://api.xendit.co').intercept({ path: '/v2/invoices', method: 'POST' })
    .reply(201, { external_id: order.orderId, amount: 224100, currency: 'IDR', invoice_url: paymentUrl }, headers);
  assert.equal((await submit(fetch, order, '', { confirm_referral })).headers.get('Location'), paymentUrl);
  assert.equal(await db.prepare('SELECT charged_amount FROM affiliate_acquisitions').first('charged_amount'), 224100);
  mock.assertNoPendingInterceptors();
});
