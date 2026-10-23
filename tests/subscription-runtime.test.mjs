import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare, createFetchMock } from 'miniflare';
import { selection, signReceipt } from '../src/subscription-checkout.js';

// Run the real checkout module in workerd. Node fetch mocks alone do not catch
// unsupported Workers options (notably redirect: 'error'). No real network calls.
const secret = 'runtime-test-key-only';
const source = await readFile(new URL('../src/subscription-checkout.js', import.meta.url), 'utf8');
const ownerId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const paymentUrl = 'https://checkout.xendit.co/web/abcdef123456abcdef123456';
const mockHeaders = { headers: { 'Content-Type': 'application/json' } };

async function runtime(t) {
  const mock = createFetchMock();
  mock.disableNetConnect();
  const worker = new Miniflare({
    modules: [
      { type: 'ESModule', path: resolve('src/subscription-checkout.js'), contents: `${source}\nexport default { fetch: handleSubscriptionCheckout };` },
      { type: 'ESModule', path: resolve('src/xendit-payments.js'), contents: await readFile('src/xendit-payments.js', 'utf8') },
    ],
    compatibilityDate: '2026-06-27',
    bindings: { SUBSCRIPTION_SIGNING_KEY: secret, XENDIT_SECRET_KEY: 'xendit-runtime-key', XENDIT_WEBHOOK_TOKEN: 'runtime-webhook-token', GERAINA_BACKEND_ORIGIN: 'geraina-runtime.test', BACKEND_ORIGIN: 'dapuros-runtime.test' },
    fetchMock: mock,
  });
  t.after(() => worker.dispose());
  return { mock, worker };
}

function cart(module) {
  return { ...selection(module, 'starter', 'monthly'), provider: 'xendit', orderId: `DG-${module}-${'a'.repeat(32)}`, expires: Date.now() + 3600000 };
}

async function submit(worker, choice) {
  return worker.dispatchFetch(`https://dagangos.com/${choice.module}/checkout`, {
    method: 'POST', redirect: 'manual',
    headers: { Origin: 'https://dagangos.com', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ cart: await signReceipt(choice, secret), access_token: 'runtime.test.token-not-a-real-account' }).toString(),
  });
}

test('Workers runtime sends expired sessions back to sign-in instead of a connection error', async t => {
  const { mock, worker } = await runtime(t);
  for (const module of ['geraina', 'dapuros']) {
    mock.get(`https://${module}-runtime.test`).intercept({ path: '/api/subscriptions/orders', method: 'POST' }).reply(401, { detail: 'Invalid or expired token' }, mockHeaders);
    const response = await submit(worker, cart(module));
    assert.equal(response.status, 303, await response.text());
    assert.match(response.headers.get('Location'), new RegExp(`^/${module}/login\\?next=`));
  }
  mock.assertNoPendingInterceptors();
});

test('Workers runtime reaches Xendit after binding the authenticated account and storing its receipt', async t => {
  const { mock, worker } = await runtime(t);
  for (const module of ['geraina', 'dapuros']) {
    const choice = cart(module);
    const backend = mock.get(`https://${module}-runtime.test`);
    backend.intercept({ path: '/api/subscriptions/orders', method: 'POST' }).reply(200, { order_id: choice.orderId, owner_id: ownerId, store_id: storeId, amount: choice.amount, email: 'runtime@example.com' }, mockHeaders);
    backend.intercept({ path: `/api/subscriptions/orders/${choice.orderId}/reference`, method: 'POST' }).reply(200, { ok: true }, mockHeaders);
    mock.get('https://api.xendit.co').intercept({ path: '/v2/invoices', method: 'POST' }).reply(201, { id: 'abcdef123456abcdef123456', external_id: choice.orderId, amount: choice.amount, currency: 'IDR', invoice_url: paymentUrl }, mockHeaders);
    const response = await submit(worker, choice);
    assert.equal(response.status, 303, await response.text());
    assert.equal(response.headers.get('Location'), paymentUrl);
  }
  mock.assertNoPendingInterceptors();
});

test('Workers runtime verifies paid status through Xendit without following redirects', async t => {
  const { mock, worker } = await runtime(t);
  const choice = cart('geraina');
  mock.get('https://api.xendit.co').intercept({ path: `/v2/invoices?external_id=${choice.orderId}&limit=10`, method: 'GET' }).reply(200, [{ external_id: choice.orderId, amount: choice.amount, currency: 'IDR', status: 'PAID', paid_amount: choice.amount, paid_at: '2026-10-23T05:00:00Z' }], mockHeaders);
  const response = await worker.dispatchFetch('https://dagangos.com/api/subscriptions/payment-status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipt: await signReceipt({ ...choice, ownerId, storeId }, secret) }),
  });
  const result = await response.json();
  assert.equal(result.status, 'paid');
  assert.equal(result.ownerId, ownerId);
  assert.equal(result.paidAt, '2026-10-23T05:00:00.000Z');
  mock.assertNoPendingInterceptors();
});
