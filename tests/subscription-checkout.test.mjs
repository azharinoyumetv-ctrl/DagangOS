import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { handleSubscriptionCheckout as checkout, renderSubscriptionPricing, selection, signReceipt, readReceipt, verifiedStatus } from '../src/subscription-checkout.js';

globalThis.crypto ??= webcrypto;
const env = { SUBSCRIPTION_SIGNING_KEY: 'test-only-secret', XENDIT_SECRET_KEY: 'xnd_development_test_only', XENDIT_WEBHOOK_TOKEN: 'test-webhook-token' };
const paymentUrl = 'https://checkout.xendit.co/web/abcdef123456abcdef123456';
const ownerId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const cart = { ...selection('geraina', 'starter', 'monthly'), provider: 'xendit', orderId: `DG-geraina-${'a'.repeat(32)}`, expires: Date.now() + 3600000 };
const boundCart = { ...cart, ownerId, storeId };
const sign = value => signReceipt(value, env.SUBSCRIPTION_SIGNING_KEY);
const post = (url, body) => new Request(`https://dagangos.com${url}`, { method: 'POST', body: JSON.stringify(body) });
async function submit(override = {}, headers = {}, chosen = cart) {
  return checkout(new Request(`https://dagangos.com/${chosen.module}/checkout`, {
    method: 'POST', headers: { Origin: 'https://dagangos.com', 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ cart: await sign(chosen), access_token: 'test.account.token-for-checkout-only', ...override }),
  }), env);
}
function mockCheckout(t, options = {}) {
  const calls = [], invoices = [];
  t.mock.method(globalThis, 'fetch', async (address, request) => {
    const url = new URL(address), body = JSON.parse(request.body || '{}');
    calls.push({ url, body, headers: request.headers });
    if (url.pathname === '/api/subscriptions/orders') {
      if (options.prepareError) return Response.json(options.prepareError.body, { status: options.prepareError.status });
      return Response.json({ owner_id: ownerId, store_id: storeId, order_id: body.orderId, amount: selection(request.headers['X-DagangOS-Module'], body.tier, body.period).amount, email: 'owner@example.test', ...(options.active ? { active_subscription: options.active } : {}) });
    }
    if (url.pathname.endsWith('/reference')) return Response.json({ ok: true }, { status: options.referenceError ? 503 : 200 });
    assert.equal(address, 'https://api.xendit.co/v2/invoices');
    invoices.push(body);
    return options.gatewayError ? Response.json({}, { status: 403 }) : Response.json({ external_id: body.external_id, amount: body.amount, currency: 'IDR', invoice_url: paymentUrl, id: 'abcdef123456abcdef123456' }, { status: 201 });
  });
  return { calls, invoices };
}

test('all twelve pricing choices go directly to Xendit with the correct account and catalogue amount', async t => {
  const { calls, invoices } = mockCheckout(t);
  for (const module of ['geraina', 'dapuros']) for (const period of ['monthly', 'yearly']) {
    const html = await renderSubscriptionPricing(await readFile(`public/marketing/${module}-pricing.html`, 'utf8'), module, new Request(`https://dagangos.com/${module}/pricing?period=${period}`), env);
    assert.ok(html.includes(`value="${period}" aria-pressed="true"`));
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}|name="(?:name|email|business)"/);
    for (const tier of ['starter', 'pro', 'business']) {
      const card = html.match(new RegExp(`<article[^>]+id="plan-${tier}"[^>]*>([\\s\\S]*?)</article>`))[1];
      const signed = card.match(/name="cart"[^>]* value="([^"]+)"/)[1];
      const chosen = await readReceipt(signed, env.SUBSCRIPTION_SIGNING_KEY);
      assert.deepEqual([chosen.module, chosen.tier, chosen.period], [module, tier, period]);
      assert.equal(chosen.amount, selection(module, tier, period).amount);
      assert.ok(card.includes(`>Rp ${chosen.amount.toLocaleString('id-ID')}</p>`));
      const response = await submit({ cart: signed, amount: '1', name: 'Unneeded', business: 'Unneeded' }, {}, chosen);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('Location'), paymentUrl);
      const payload = invoices.at(-1);
      assert.equal(payload.amount, chosen.amount);
      assert.equal(payload.items[0].price, chosen.amount);
      assert.equal(payload.payer_email, 'owner@example.test');
      assert.equal(payload.external_id, chosen.orderId);
      assert.equal(payload.currency, 'IDR');
      assert.equal(payload.should_send_email, false);
      assert.equal(payload.enabled_payments, undefined);
      const reference = new URL(payload.success_redirect_url).searchParams.get('receipt');
      const receipt = await readReceipt(reference, env.SUBSCRIPTION_SIGNING_KEY);
      assert.equal(receipt.ownerId, ownerId);
      assert.equal(receipt.storeId, storeId);
      assert.equal(calls.at(-2).body.receipt, reference);
      assert.ok(!JSON.stringify(receipt).includes('owner@example.test'));
    }
  }
  assert.equal(invoices.length, 12);
});

test('anonymous buyers sign in with their selection preserved and no order created', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not create an order'); });
  const response = await submit({ access_token: '' });
  const location = new URL(response.headers.get('Location'), 'https://dagangos.com');
  assert.equal(location.pathname, '/geraina/login');
  assert.equal(location.searchParams.get('next'), '/geraina/pricing?period=monthly&plan=starter&checkout=1');
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('changing an active Geraina term requires an explicit full-price confirmation before any invoice', async t => {
  const { calls, invoices } = mockCheckout(t, { active: { tier: 'pro', period: 'yearly', expires_at: '2027-10-27T00:00:00Z' } });
  const response = await submit();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Konfirmasi perubahan paket/);
  assert.match(html, /harga penuh/);
  assert.match(html, /sisa waktu paket lama tidak dikreditkan/);
  assert.match(html, /Kembali tanpa membeli/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(invoices.length, 0);
  assert.equal(calls.length, 1);
  const confirmed = await submit({ confirm_change: 'yes' });
  assert.equal(confirmed.status, 303);
  assert.equal(confirmed.headers.get('Location'), paymentUrl);
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].amount, 149000);
});

test('active purchases, unauthorized roles and failed persistence cannot create gateway invoices', async t => {
  for (const options of [{ prepareError: { status: 409, body: { detail: { code: 'subscription_active' } } } }, { prepareError: { status: 403, body: {} } }, { referenceError: true }]) {
    const { invoices } = mockCheckout(t, options);
    const response = await submit();
    if (options.prepareError?.status === 409) assert.match(await response.text(), /Paket Anda sudah aktif/);
    else assert.equal(response.status, options.referenceError ? 502 : 403);
    assert.equal(invoices.length, 0);
    t.mock.restoreAll();
  }
});

test('legacy checkout links return to the chosen pricing period without creating an invoice', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('GET must not create an invoice'); });
  for (const module of ['geraina', 'dapuros']) {
    const response = await checkout(new Request(`https://dagangos.com/${module}/checkout?plan=pro&period=yearly`), env);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), `/${module}/pricing?period=yearly#plan-pro`);
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('forged amounts, cross-site submits, honeypots, expired carts and bound receipts never call payment services', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call payment services'); });
  assert.equal(selection('geraina', '__proto__', 'monthly'), null);
  assert.equal(selection('__proto__', 'starter', 'monthly'), null);
  assert.equal(selection('dapuros', 'starter', 'weekly'), null);
  for (const override of [{ cart: await sign({ ...cart, amount: 1 }) }, { website: 'bot.test' }, { cart: await sign({ ...cart, expires: 1 }) }, { cart: await sign(boundCart) }]) assert.equal((await submit(override)).status, 400);
  for (const Origin of ['https://attacker.test', 'null']) assert.equal((await submit({}, { Origin })).status, 403);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('gateway rejection reports unpaid failure instead of redirecting or activating a plan', async t => {
  mockCheckout(t, { gatewayError: true });
  const response = await submit();
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Location'), null);
  assert.match(await response.text(), /Status pembuatan pesanan belum dapat dipastikan/);
});

test('Xendit verification requires exact external reference, amount, currency and confirmed paid amount', () => {
  const data = { external_id: cart.orderId, amount: 149000, currency: 'IDR', status: 'PAID', paid_amount: 149000, paid_at: '2026-10-23T05:00:00Z' };
  assert.equal(verifiedStatus(data, cart), 'paid');
  for (const overrides of [{ amount: 1 }, { external_id: 'other' }, { currency: 'USD' }, { paid_amount: 1 }, { paid_at: null }]) assert.equal(verifiedStatus({ ...data, ...overrides }, cart), 'unverified');
  assert.equal(verifiedStatus({ ...data, status: 'PENDING' }, cart), 'pending');
  assert.equal(verifiedStatus({ ...data, status: 'EXPIRED' }, cart), 'failed');
});

test('payment service only returns independently verified Xendit invoice data', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ external_id: cart.orderId, amount: 149000, currency: 'IDR', status: 'PAID', paid_amount: 149000, paid_at: '2026-10-23T05:00:00Z' }]));
  const response = await checkout(post('/api/subscriptions/payment-status', { receipt: await sign(boundCart), status: 'failed', ownerId: 'attacker' }), env);
  const data = await response.json();
  assert.deepEqual([data.status, data.ownerId, data.storeId, data.paidAt], ['paid', ownerId, storeId, '2026-10-23T05:00:00.000Z']);
  assert.equal((await checkout(post('/api/subscriptions/payment-status', { receipt: 'forged' }), env)).status, 403);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('only Xendit verification-token notifications trigger independent reconciliation', async t => {
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, 'https://geraina-os.vercel.app/api/subscriptions/reconcile');
    assert.deepEqual(JSON.parse(request.body), { orderId: cart.orderId });
    return Response.json({ status: 'paid', activation: 'active' });
  });
  const data = { external_id: cart.orderId, status: 'PAID' };
  assert.equal((await checkout(post('/api/subscriptions/webhook', data), env)).status, 403);
  const request = post('/api/subscriptions/webhook', data);
  request.headers.set('x-callback-token', env.XENDIT_WEBHOOK_TOKEN);
  assert.equal((await checkout(request, env)).status, 200);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('the shared Xendit webhook routes Web orders only to the fixed WMP endpoint', async t => {
  const data = { external_id: ownerId, id: 'abcdef123456abcdef123456', status: 'PAID' };
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, 'https://wmp.dagangos.com/api/webhooks/payments/xendit');
    assert.equal(request.redirect, 'manual');
    assert.equal(request.headers['x-callback-token'], env.XENDIT_WEBHOOK_TOKEN);
    assert.deepEqual(JSON.parse(request.body), data);
    return Response.json({ received: true });
  });
  const request = post('/api/subscriptions/webhook', data);
  request.headers.set('x-callback-token', env.XENDIT_WEBHOOK_TOKEN);
  assert.equal((await checkout(request, env)).status, 200);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('browser return parameters cannot fake payment and only backend activation shows an active package', async t => {
  const url = 'https://dagangos.com/geraina/order?receipt=' + await sign(boundCart) + '&status=PAID';
  t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  assert.match(await (await checkout(new Request(url), env)).text(), /Menunggu pembayaran/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async address => address.startsWith('https://api.xendit.co')
    ? Response.json([{ external_id: cart.orderId, amount: 149000, currency: 'IDR', status: 'PAID', paid_amount: 149000, paid_at: '2026-10-23T05:00:00Z' }])
    : Response.json({ status: 'paid', activation: 'active', expires_at: '2026-11-23T05:00:00Z' }));
  const html = await (await checkout(new Request(url), env)).text();
  assert.match(html, /paket aktif/);
  assert.match(html, /diaktifkan otomatis/);
  assert.doesNotMatch(html, /Aktivasi paket dilakukan oleh tim/);
});
