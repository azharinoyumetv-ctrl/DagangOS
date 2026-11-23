// Hosted Payment Links keep payment details at Xendit. Only server credentials
// and server-confirmed invoice data are used here; browser redirects are not proof.
const API = 'https://api.xendit.co';
const SESSION_ID = /^ps-[a-f0-9]{24}$/;
const PAYMENT_ID = /^py-[a-f0-9-]{36}$/;
const PAYMENT_REQUEST_ID = /^pr-[a-f0-9-]{36}$/;
const SESSION_CREATION_TIMEOUT = 60_000;

export function subscriptionReference(value) {
  if (typeof value !== 'string') return null;
  return /^(DG-(?:geraina|dapuros)-[a-f0-9]{32})(?:_[a-zA-Z0-9_-]{1,80})?$/.exec(value)?.[1] || null;
}

export function invoiceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['checkout.xendit.co', 'checkout-staging.xendit.co'].includes(url.hostname)
      && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export async function xenditRequest(env, path, body, version) {
  if (!env.XENDIT_SECRET_KEY) throw new Error('Xendit is not configured');
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${btoa(`${env.XENDIT_SECRET_KEY}:`)}`, 'Content-Type': 'application/json', Accept: 'application/json',
      ...(version ? { 'api-version': version } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(`Xendit request failed (HTTP ${response.status})`);
  return data;
}

export async function findInvoice(env, orderId) {
  const data = await xenditRequest(env, `/v2/invoices?external_id=${encodeURIComponent(orderId)}&limit=10`);
  if (!Array.isArray(data)) throw new Error('Invalid Xendit invoice response');
  const matches = data.filter(invoice => invoice.external_id === orderId);
  if (matches.length > 1) throw new Error('Ambiguous Xendit invoice reference');
  return matches[0] || null;
}

async function sessionUrl(value, env) {
  let url = invoiceUrl(value);
  if (!url && typeof value === 'string' && /^https:\/\/xen\.to\/[a-zA-Z0-9_-]+$/.test(value)) {
    // Resolve the provider's short link before the redirect. Installed Android
    // apps associate checkout returns with the full Xendit checkout hostname.
    const response = await fetch(value, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) url = invoiceUrl(response.headers.get('Location'));
  }
  if (!url) return null;
  const expected = env.XENDIT_ENVIRONMENT === 'sandbox' ? 'checkout-staging.xendit.co' : 'checkout.xendit.co';
  return new URL(url).hostname === expected ? url : null;
}

export async function claimPaymentSession(db, orderId) {
  const result = await db.prepare(`
    INSERT INTO subscription_payment_sessions (order_id, claim_deadline) VALUES (?, ?)
    ON CONFLICT (order_id) DO NOTHING
  `).bind(orderId, Date.now() + SESSION_CREATION_TIMEOUT).run();
  return result.meta.changes === 1;
}

export async function createPaymentSession(env, cart, email, receipt, productName) {
  const db = env.AFFILIATE_DB;
  const returnUrl = `https://dagangos.com/${cart.module}/order?receipt=${encodeURIComponent(receipt)}`;
  const description = cart.kind === 'addon'
    ? `${productName} — ${cart.addonId === 'extra_device' ? 'Device kasir tambahan' : 'Outlet tambahan'}`
    : `${productName} ${cart.tier} — ${cart.period === 'yearly' ? '12 bulan' : '1 bulan'}`;
  try {
    const session = await xenditRequest(env, '/sessions', {
      reference_id: cart.orderId, session_type: 'PAY', mode: 'PAYMENT_LINK',
      capture_method: 'AUTOMATIC', allow_save_payment_method: 'DISABLED', currency: 'IDR', country: 'ID', amount: cart.amount,
      description, success_return_url: returnUrl, cancel_return_url: returnUrl, locale: 'id',
      ...(email ? { customer: {
        reference_id: cart.orderId, type: 'INDIVIDUAL', email,
        individual_detail: { given_names: 'Pelanggan DagangOS' },
      } } : {}),
    });
    const url = await sessionUrl(session.payment_link_url, env);
    if (!url || !SESSION_ID.test(session.payment_session_id) || session.reference_id !== cart.orderId
      || session.amount !== cart.amount || session.currency !== 'IDR'
      || session.session_type !== 'PAY' || session.mode !== 'PAYMENT_LINK' || session.status !== 'ACTIVE') {
      throw new Error('Invalid Xendit payment session');
    }
    // Publish the provider URL only after the order can be reconciled by session ID.
    const saved = await db.prepare(`
      UPDATE subscription_payment_sessions SET session_id = ?
      WHERE order_id = ? AND session_id IS NULL AND claim_deadline > ?
    `).bind(session.payment_session_id, cart.orderId, Date.now()).run();
    if (saved.meta.changes !== 1) throw new Error('Payment session claim expired');
    return url;
  } catch (error) {
    // The checkout URL has not been issued to the customer if no session ID was saved.
    await db.prepare(`
      UPDATE subscription_payment_sessions SET claim_deadline = 0
      WHERE order_id = ? AND session_id IS NULL
    `).bind(cart.orderId).run();
    throw error;
  }
}

// Normalize the new provider response into the evidence shape already used by
// activation and affiliate reconciliation. Session completion alone is insufficient.
export async function findCheckoutPayment(env, cart, db = env.AFFILIATE_DB) {
  const row = db && await db.prepare(`
    SELECT session_id, claim_deadline FROM subscription_payment_sessions WHERE order_id = ?
  `).bind(cart.orderId).first();
  if (!row) return cart.paymentSession ? null : findInvoice(env, cart.orderId);
  if (!row.session_id) {
    return { external_id: cart.orderId, amount: cart.amount, currency: 'IDR',
      status: row.claim_deadline > Date.now() ? 'PENDING' : 'FAILED' };
  }
  const session = await xenditRequest(env, `/sessions/${encodeURIComponent(row.session_id)}`);
  if (session.payment_session_id !== row.session_id || session.reference_id !== cart.orderId
    || session.amount !== cart.amount || session.currency !== 'IDR'
    || session.session_type !== 'PAY' || session.mode !== 'PAYMENT_LINK') throw new Error('Mismatched Xendit payment session');
  const evidence = { id: row.session_id, external_id: cart.orderId, amount: cart.amount, currency: 'IDR' };
  if (session.status === 'ACTIVE') return { ...evidence, status: 'PENDING', invoice_url: await sessionUrl(session.payment_link_url, env) };
  if (['EXPIRED', 'CANCELED'].includes(session.status)) return { ...evidence, status: 'EXPIRED' };
  if (session.status !== 'COMPLETED' || !PAYMENT_ID.test(session.payment_id)
    || !PAYMENT_REQUEST_ID.test(session.payment_request_id)) throw new Error('Unverified Xendit payment session');
  const payment = await xenditRequest(env, `/v3/payments/${encodeURIComponent(session.payment_id)}`, undefined, '2024-11-11');
  if (payment.payment_id !== session.payment_id || payment.payment_request_id !== session.payment_request_id
    || payment.business_id !== session.business_id || subscriptionReference(payment.reference_id) !== cart.orderId
    || payment.currency !== 'IDR' || payment.request_amount !== cart.amount || payment.status !== 'SUCCEEDED'
    || payment.captures?.length !== 1 || payment.captures[0]?.capture_amount !== cart.amount
    || !Number.isFinite(Date.parse(payment.captures[0]?.capture_timestamp))) throw new Error('Unverified Xendit payment capture');
  return { ...evidence, status: 'PAID', paid_amount: cart.amount, paid_at: payment.captures[0].capture_timestamp,
    payment_id: payment.payment_id, payment_reference: payment.reference_id };
}

export function verifiedInvoiceStatus(invoice, cart) {
  if (!invoice) return 'pending';
  if (invoice.external_id !== cart.orderId || Number(invoice.amount) !== cart.amount || invoice.currency !== 'IDR') return 'unverified';
  if (['PAID', 'SETTLED'].includes(invoice.status)) {
    return Number(invoice.paid_amount) === cart.amount && Number.isFinite(Date.parse(invoice.paid_at)) ? 'paid' : 'unverified';
  }
  if (['EXPIRED', 'FAILED'].includes(invoice.status)) return 'failed';
  if (['REFUNDED', 'VOIDED'].includes(invoice.status)) return 'refunded';
  return invoice.status === 'PENDING' ? 'pending' : 'unverified';
}

export async function createPaymentLink(env, cart, email, receipt, productName) {
  const finish = `https://dagangos.com/${cart.module}/order?receipt=${encodeURIComponent(receipt)}`;
  const itemName = cart.kind === 'addon' ? `${cart.addonId === 'extra_device' ? 'Device kasir tambahan' : 'Outlet tambahan'} — 1 bulan` : `${cart.module} ${cart.tier}`;
  const result = await xenditRequest(env, '/v2/invoices', {
    external_id: cart.orderId, amount: cart.amount, currency: 'IDR',
    description: cart.kind === 'addon' ? `${productName} ${itemName}` : `${productName} ${cart.tier} — ${cart.period === 'yearly' ? '12 bulan' : '1 bulan'}`,
    invoice_duration: 86400, should_send_email: false,
    ...(email ? { payer_email: email } : {}),
    success_redirect_url: finish, failure_redirect_url: finish,
    // Let Xendit show the merchant's activated channels. Hard-coded filtering can
    // hide the only approved channel and leave customers unable to pay.
    items: [{ name: itemName, quantity: 1, price: cart.amount }],
  });
  const url = invoiceUrl(result.invoice_url);
  if (!url || result.external_id !== cart.orderId || Number(result.amount) !== cart.amount || result.currency !== 'IDR') throw new Error('Invalid Xendit payment link');
  return url;
}

export function equalToken(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
