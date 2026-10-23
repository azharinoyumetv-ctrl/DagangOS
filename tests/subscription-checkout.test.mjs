import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { handleSubscriptionCheckout as checkout, renderSubscriptionPricing, selection, signReceipt, readReceipt, verifiedStatus } from '../src/subscription-checkout.js';

globalThis.crypto ??= webcrypto;
const env = { MIDTRANS_SERVER_KEY: 'test-only-secret', MIDTRANS_ENVIRONMENT: 'sandbox' };
const snapToken = 'f15304df-522e-41ee-af62-ffb73a9f7581';
const ownerId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const cart = { ...selection('geraina', 'starter', 'monthly'), orderId: `DG-geraina-${'a'.repeat(32)}`, expires: Date.now() + 3600000 };
const boundCart = { ...cart, ownerId, storeId };
const sign = value => signReceipt(value, env.MIDTRANS_SERVER_KEY);
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
      return Response.json({ owner_id: ownerId, store_id: storeId, order_id: body.orderId, amount: selection(request.headers['X-DagangOS-Module'], body.tier, body.period).amount, email: 'owner@example.test' });
    }
    if (url.pathname.endsWith('/reference')) return Response.json({ ok: true }, { status: options.referenceError ? 503 : 200 });
    assert.equal(address, 'https://app.sandbox.midtrans.com/snap/v1/transactions');
    invoices.push(body);
    return options.gatewayError ? Response.json({}, { status: 403 }) : Response.json({ token: snapToken, redirect_url: 'https://evil.test/phishing' }, { status: 201 });
  });
  return { calls, invoices };
}

test('all twelve pricing choices go directly to Midtrans with the correct account and catalogue amount', async t => {
  const { calls, invoices } = mockCheckout(t);
  for (const module of ['geraina', 'dapuros']) for (const period of ['monthly', 'yearly']) {
    const html = await renderSubscriptionPricing(await readFile(`public/marketing/${module}-pricing.html`, 'utf8'), module, new Request(`https://dagangos.com/${module}/pricing?period=${period}`), env);
    assert.ok(html.includes(`value="${period}" aria-pressed="true"`));
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}|name="(?:name|email|business)"/);
    for (const tier of ['starter', 'pro', 'business']) {
      const card = html.match(new RegExp(`<article[^>]+id="plan-${tier}"[^>]*>([\\s\\S]*?)</article>`))[1];
      const signed = card.match(/name="cart"[^>]* value="([^"]+)"/)[1];
      const chosen = await readReceipt(signed, env.MIDTRANS_SERVER_KEY);
      assert.deepEqual([chosen.module, chosen.tier, chosen.period], [module, tier, period]);
      assert.equal(chosen.amount, selection(module, tier, period).amount);
      assert.ok(card.includes(`>Rp ${chosen.amount.toLocaleString('id-ID')}</p>`));
      const response = await submit({ cart: signed, amount: '1', name: 'Unneeded', business: 'Unneeded' }, {}, chosen);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('Location'), `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`);
      const payload = invoices.at(-1);
      assert.equal(payload.transaction_details.gross_amount, chosen.amount);
      assert.equal(payload.item_details[0].price, chosen.amount);
      assert.deepEqual(payload.customer_details, { email: 'owner@example.test' });
      assert.equal(payload.custom_field1, ownerId);
      assert.equal(payload.custom_field3, storeId);
      assert.equal(payload.custom_field2, `${module}:${tier}:${period}:automatic`);
      assert.ok(!payload.enabled_payments.includes('credit_card'));
      const reference = new URL(payload.callbacks.finish).searchParams.get('receipt');
      const receipt = await readReceipt(reference, env.MIDTRANS_SERVER_KEY);
      assert.equal(receipt.ownerId, ownerId);
      assert.equal(receipt.storeId, storeId);
      assert.equal(calls.at(-2).body.receipt, reference);
      assert.equal(calls.at(-1).headers['X-Override-Notification'], 'https://dagangos.com/api/subscriptions/webhook');
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
  assert.match(await response.text(), /Tidak ada paket yang diaktifkan/);
});

test('payment verification requires matching order, amount, currency and accepted fraud status', () => {
  const data = { order_id: cart.orderId, gross_amount: '149000.00', currency: 'IDR', transaction_status: 'settlement' };
  assert.equal(verifiedStatus(data, cart), 'paid');
  for (const overrides of [{ gross_amount: '1.00' }, { order_id: 'other' }, { currency: 'USD' }]) assert.equal(verifiedStatus({ ...data, ...overrides }, cart), 'unverified');
  assert.equal(verifiedStatus({ ...data, transaction_status: 'expire' }, cart), 'failed');
  assert.equal(verifiedStatus({ ...data, fraud_status: 'challenge' }, cart), 'pending');
  assert.equal(verifiedStatus({ ...data, transaction_status: 'capture', fraud_status: 'challenge' }, cart), 'pending');
});

test('payment service returns provider-confirmed account-bound data and rejects forged references', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ order_id: cart.orderId, gross_amount: '149000.00', currency: 'IDR', transaction_status: 'settlement', settlement_time: '2026-10-23 12:00:00' }));
  const response = await checkout(post('/api/subscriptions/payment-status', { receipt: await sign(boundCart), status: 'failed', ownerId: 'attacker' }), env);
  const data = await response.json();
  assert.deepEqual([data.status, data.ownerId, data.storeId, data.paidAt], ['paid', ownerId, storeId, '2026-10-23T05:00:00.000Z']);
  assert.equal((await checkout(post('/api/subscriptions/payment-status', { receipt: 'forged' }), env)).status, 403);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('only signed Midtrans notifications trigger independent backend reconciliation', async t => {
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, 'https://geraina-os.vercel.app/api/subscriptions/reconcile');
    assert.deepEqual(JSON.parse(request.body), { orderId: cart.orderId });
    return Response.json({ status: 'paid', activation: 'active' });
  });
  const data = { order_id: cart.orderId, status_code: '200', gross_amount: '149000.00', transaction_status: 'settlement' };
  assert.equal((await checkout(post('/api/subscriptions/webhook', data), env)).status, 403);
  const hash = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(`${cart.orderId}200149000.00${env.MIDTRANS_SERVER_KEY}`));
  data.signature_key = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  assert.equal((await checkout(post('/api/subscriptions/webhook', data), env)).status, 200);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('return URLs cannot fake payment and only confirmed backend activation produces an active result', async t => {
  const url = `https://dagangos.com/geraina/order?receipt=${await sign(boundCart)}&transaction_status=settlement`;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status_code: '404' }));
  assert.match(await (await checkout(new Request(url), env)).text(), /Menunggu pembayaran/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async address => address.includes('/v2/') ? Response.json({ order_id: cart.orderId, gross_amount: '149000.00', transaction_status: 'settlement', settlement_time: '2026-10-23 12:00:00' }) : Response.json({ status: 'paid', activation: 'active', expires_at: '2026-11-23T05:00:00Z' }));
  const html = await (await checkout(new Request(url), env)).text();
  assert.match(html, /paket aktif/);
  assert.match(html, /diaktifkan otomatis/);
  assert.match(html, /\/geraina\/app\/dashboard/);
  assert.doesNotMatch(html, /Aktivasi paket dilakukan oleh tim/);
});
