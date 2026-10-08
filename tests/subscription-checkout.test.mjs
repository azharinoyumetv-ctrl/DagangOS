import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { handleSubscriptionCheckout, selection, signReceipt, readReceipt, verifiedStatus } from '../src/subscription-checkout.js';

// Workers expose Web Crypto natively; the existing Node 18 CI runner does not.
globalThis.crypto ??= webcrypto;

const env = { MIDTRANS_SERVER_KEY: 'test-only-server-secret', MIDTRANS_ENVIRONMENT: 'sandbox' };
const snapToken = 'f15304df-522e-41ee-af62-ffb73a9f7581';
const cart = { ...selection('geraina', 'starter', 'monthly'), orderId: `DG-geraina-${'a'.repeat(32)}`, expires: Date.now() + 3600000 };

async function submit(override = {}, headers = {}) {
  return handleSubscriptionCheckout(new Request('https://dagangos.com/geraina/checkout', {
    method: 'POST', headers: { Origin: 'https://dagangos.com', 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ cart: await signReceipt(cart, env.MIDTRANS_SERVER_KEY), name: 'Checkout Test', email: 'review@example.test', business: 'Review Store', ...override }),
  }), env);
}

test('all six paid packages expose native checkout without JavaScript or a login gate', async () => {
  for (const module of ['geraina', 'dapuros']) for (const tier of ['starter', 'pro', 'business']) for (const period of ['monthly', 'yearly']) {
    const response = await handleSubscriptionCheckout(new Request(`https://dagangos.com/${module}/checkout?plan=${tier}&period=${period}`), env);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /method="post"/);
    assert.match(body, /Lanjutkan ke Pembayaran/);
    assert.match(body, /Tidak perlu membuat akun/);
    assert.match(body, /tidak menarik dana atau mengaktifkan paket/);
    assert.ok(body.includes(selection(module, tier, period).amount.toLocaleString('id-ID')));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('invalid tiers, periods and forged receipt tokens are rejected', async () => {
  assert.equal(selection('geraina', 'trial', 'monthly'), null);
  assert.equal(selection('dapuros', 'starter', 'weekly'), null);
  assert.equal(selection('geraina', '__proto__', 'monthly'), null);
  assert.equal(selection('geraina', 'toString', 'monthly'), null);
  assert.equal(selection('__proto__', 'starter', 'monthly'), null);
  const token = await signReceipt(cart, env.MIDTRANS_SERVER_KEY);
  assert.deepEqual(await readReceipt(token, env.MIDTRANS_SERVER_KEY), cart);
  assert.equal(await readReceipt(token, 'other-secret'), null);
  const forged = await signReceipt({ ...cart, amount: 1 }, env.MIDTRANS_SERVER_KEY);
  assert.equal(await readReceipt(forged, env.MIDTRANS_SERVER_KEY), null);
  const response = await handleSubscriptionCheckout(new Request('https://dagangos.com/geraina/order?receipt=forged&transaction_status=settlement'), env);
  assert.equal(response.status, 404);
});

test('checkout stores authoritative amounts in Midtrans, excludes credit cards, and only returns an unpaid order', async t => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://app.sandbox.midtrans.com/snap/v1/transactions');
    payload = JSON.parse(options.body);
    return Response.json({ token: snapToken, redirect_url: 'https://evil.test/phishing' }, { status: 201 });
  });
  const response = await submit({ amount: '1', plan: 'business' });
  assert.equal(response.status, 303);
  assert.equal(payload.transaction_details.gross_amount, 149000);
  assert.equal(payload.item_details[0].price, 149000);
  assert.ok(!payload.enabled_payments.includes('credit_card'));
  assert.ok(payload.callbacks.finish.startsWith('https://dagangos.com/geraina/order?receipt='));
  assert.equal(payload.custom_field2, 'geraina:starter:monthly:manual-fulfilment');
  const location = new URL(response.headers.get('Location'), 'https://dagangos.com');
  const receipt = await readReceipt(location.searchParams.get('receipt'), env.MIDTRANS_SERVER_KEY);
  assert.equal(receipt.snapToken, snapToken);
  assert.equal(receipt.amount, 149000);
  assert.ok(!JSON.stringify(receipt).includes('review@example.test'));
});

test('rejected gateway requests return an honest payment error, never success', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error_messages: ['Merchant inactive'] }, { status: 403 }));
  const response = await submit();
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Location'), null);
  assert.match(await response.text(), /Tidak ada paket yang diaktifkan/);
});

test('invalid customer input, cross-site submits, honeypots and expired carts never call the gateway', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call gateway'); });
  assert.equal((await submit({ email: 'invalid' })).status, 400);
  assert.equal((await submit({ website: 'bot.test' })).status, 400);
  assert.equal((await submit({}, { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await submit({ cart: await signReceipt({ ...cart, expires: 1 }, env.MIDTRANS_SERVER_KEY) })).status, 400);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('payment status requires a provider-confirmed matching order and amount', () => {
  const data = { order_id: cart.orderId, gross_amount: '149000.00', currency: 'IDR', transaction_status: 'settlement' };
  assert.equal(verifiedStatus(data, cart), 'paid');
  assert.equal(verifiedStatus({ ...data, gross_amount: '1.00' }, cart), 'unverified');
  assert.equal(verifiedStatus({ ...data, order_id: 'other' }, cart), 'unverified');
  assert.equal(verifiedStatus({ ...data, transaction_status: 'expire' }, cart), 'failed');
  assert.equal(verifiedStatus({ ...data, transaction_status: 'pending' }, cart), 'pending');
  assert.equal(verifiedStatus({ ...data, transaction_status: 'capture', fraud_status: 'challenge' }, cart), 'pending');
});

test('return URL status cannot fake successful payment or activation', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status_code: '404' }));
  const receipt = await signReceipt({ ...cart, snapToken }, env.MIDTRANS_SERVER_KEY);
  const response = await handleSubscriptionCheckout(new Request(`https://dagangos.com/geraina/order?receipt=${receipt}&transaction_status=settlement`), env);
  const html = await response.text();
  assert.match(html, /Menunggu pembayaran/);
  assert.match(html, /paket belum aktif/);
  assert.doesNotMatch(html, /Pembayaran terkonfirmasi/);
  assert.ok(html.includes(`https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`));
});
