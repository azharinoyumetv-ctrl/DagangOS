// Hosted Payment Links keep payment details at Xendit. Only server credentials
// and server-confirmed invoice data are used here; browser redirects are not proof.
const API = 'https://api.xendit.co';

export function invoiceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['checkout.xendit.co', 'checkout-staging.xendit.co'].includes(url.hostname)
      && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export async function xenditRequest(env, path, body) {
  if (!env.XENDIT_SECRET_KEY) throw new Error('Xendit is not configured');
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${btoa(`${env.XENDIT_SECRET_KEY}:`)}`, 'Content-Type': 'application/json', Accept: 'application/json' },
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

export async function createPaymentLink(env, cart, email, receipt) {
  const finish = `https://dagangos.com/${cart.module}/order?receipt=${encodeURIComponent(receipt)}`;
  const itemName = cart.kind === 'addon' ? `${cart.addonId === 'extra_device' ? 'Device kasir tambahan' : 'Outlet tambahan'} — 1 bulan` : `${cart.module} ${cart.tier}`;
  const result = await xenditRequest(env, '/v2/invoices', {
    external_id: cart.orderId, amount: cart.amount, currency: 'IDR',
    description: cart.kind === 'addon' ? `Geraina POS ${itemName}` : `${cart.module === 'geraina' ? 'Geraina POS' : 'DapurOS'} ${cart.tier} — ${cart.period === 'yearly' ? '12 bulan' : '1 bulan'}`,
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
