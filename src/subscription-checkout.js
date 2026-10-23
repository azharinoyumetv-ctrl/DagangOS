// Subscription orders belong to a verified account and product store. Product backends
// grant access only after checking payment truth with this central payment service.
export const CATALOG = {
  geraina: { name: 'Geraina POS', prices: { starter: [149000, 1490000], pro: [349000, 3490000], business: [549000, 5490000] } },
  dapuros: { name: 'DapurOS', prices: { starter: [249000, 2490000], pro: [499000, 4990000], business: [749000, 7490000] } },
};
const encoder = new TextEncoder();
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => `Rp ${Number(value).toLocaleString('id-ID')}`;
const label = value => value[0].toUpperCase() + value.slice(1);
const securityHeaders = {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  // Preserve Origin on native same-origin POSTs without leaking external referrers.
  'Referrer-Policy': 'same-origin', 'X-Robots-Tag': 'noindex, follow',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
function page(module, title, body, status = 200, refresh = false) {
  const product = CATALOG[module];
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh ? '<meta http-equiv="refresh" content="10">' : ''}<title>${escape(title)} — ${product.name}</title><link rel="icon" href="/assets/brand/${module}-icon.png"><link rel="stylesheet" href="/product-public.css"><link rel="stylesheet" href="/subscription-checkout.css"></head><body class="checkout ${module}"><header class="topbar"><div class="shell topbar__inner"><a class="brand" href="/${module}"><img src="/assets/brand/${module}-icon.png" alt="">${product.name}</a><nav class="nav"><a href="/${module}/pricing">Kembali ke paket</a></nav></div></header><main class="checkout-shell"><p class="eyebrow">LANGGANAN DAGANGOS</p><h1>${escape(title)}</h1>${body}</main><footer class="footer"><div class="shell footer__inner"><span>PT DagangOS Digital Indonesia</span><a href="mailto:contact@dagangos.com">contact@dagangos.com</a></div></footer></body></html>`, { status, headers: securityHeaders });
}
export function selection(module, tier, period) {
  if (!Object.hasOwn(CATALOG, module)) return null;
  const product = CATALOG[module];
  if (!Object.hasOwn(product.prices, tier) || !['monthly', 'yearly'].includes(period)) return null;
  return { module, tier, period, amount: product.prices[tier][period === 'yearly' ? 1 : 0] };
}
export async function renderSubscriptionPricing(html, module, request, env) {
  const period = new URL(request.url).searchParams.get('period') === 'yearly' ? 'yearly' : 'monthly';
  const secret = env.MIDTRANS_SERVER_KEY;
  const expires = Date.now() + 3600000;
  const replacements = {
    MONTHLY_SELECTED: String(period === 'monthly'),
    YEARLY_SELECTED: String(period === 'yearly'),
    PAYMENT_DISABLED: secret ? '' : ' disabled',
    PAYMENT_NOTICE: secret ? '' : '<p class="pricing-note" role="alert">Pembayaran belum tersedia. Hubungi contact@dagangos.com untuk informasi paket.</p>',
  };
  const tiers = Object.keys(CATALOG[module].prices);
  await Promise.all(tiers.flatMap(tier => ['monthly', 'yearly'].map(async billing => {
    const cart = selection(module, tier, billing);
    const key = `${tier}_${billing}`.toUpperCase();
    replacements[`${key}_PRICE`] = money(cart.amount);
    replacements[`${key}_PERIOD`] = billing === 'yearly'
      ? `/tahun · setara ${money(Math.round(cart.amount / 12))}/bulan`
      : '/bulan';
    replacements[`${key}_CART`] = secret ? await signReceipt({ ...cart, orderId: `DG-${module}-${crypto.randomUUID().replace(/-/g, '')}`, expires }, secret) : '';
  })));
  for (const tier of tiers) {
    for (const field of ['PRICE', 'PERIOD', 'CART']) {
      replacements[`${tier.toUpperCase()}_${field}`] = replacements[`${tier}_${period}_${field}`.toUpperCase()];
    }
  }
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key) => replacements[key] ?? placeholder);
}
function summary(cart) {
  return `<dl class="order-details"><dt>Produk</dt><dd>${CATALOG[cart.module].name}</dd><dt>Paket</dt><dd>${label(cart.tier)}</dd><dt>Periode</dt><dd>${cart.period === 'yearly' ? '12 bulan' : '1 bulan'}</dd><dt>Total pembayaran</dt><dd class="order-total">${money(cart.amount)}</dd></dl><p class="muted">Satu pembayaran untuk periode yang dipilih. Tidak ada penagihan otomatis. Add-on tidak termasuk dalam pesanan ini.</p>`;
}
async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(`dagangos-subscription-receipt-v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unbase64(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export async function signReceipt(value, secret) {
  const payload = b64url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload));
  return `${payload}.${b64url(new Uint8Array(signature))}`;
}
export async function readReceipt(token, secret) {
  try {
    if (!token || token.length > 4000) return null;
    const [payload, signature, extra] = token.split('.');
    if (extra || !await crypto.subtle.verify('HMAC', await signingKey(secret), unbase64(signature), encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(unbase64(payload)));
    const cart = selection(data.module, data.tier, data.period);
    if (!cart || data.amount !== cart.amount || !/^DG-(geraina|dapuros)-[a-f0-9]{32}$/.test(data.orderId)) return null;
    if ((data.ownerId !== undefined || data.storeId !== undefined) && ![data.ownerId, data.storeId].every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))) return null;
    return data;
  } catch { return null; }
}
function paymentHost(env) {
  return env.MIDTRANS_ENVIRONMENT === 'sandbox' ? 'app.sandbox.midtrans.com' : 'app.midtrans.com';
}
function paymentUrl(token, env) {
  return `https://${paymentHost(env)}/snap/v2/vtweb/${encodeURIComponent(token)}`;
}
export function verifiedStatus(data, cart) {
  if (data.order_id !== cart.orderId || Number(data.gross_amount) !== cart.amount || (data.currency && data.currency !== 'IDR')) return 'unverified';
  if (data.transaction_status === 'settlement' && (!data.fraud_status || data.fraud_status === 'accept') || (data.transaction_status === 'capture' && data.fraud_status === 'accept')) return 'paid';
  if (['cancel', 'deny', 'expire', 'failure'].includes(data.transaction_status)) return 'failed';
  if (['refund', 'partial_refund', 'chargeback', 'partial_chargeback'].includes(data.transaction_status)) return 'refunded';
  return 'pending';
}
async function backend(module, env, path, { token, body } = {}) {
  const host = module === 'geraina' ? (env.GERAINA_BACKEND_ORIGIN || 'geraina-os.vercel.app') : (env.BACKEND_ORIGIN || 'dapuros.vercel.app');
  const response = await fetch(`https://${host}/api/subscriptions${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DagangOS-Module': module, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function paymentStatus(cart, env) {
  let data = {}, status = 'unverified';
  try {
    const host = env.MIDTRANS_ENVIRONMENT === 'sandbox' ? 'api.sandbox.midtrans.com' : 'api.midtrans.com';
    const response = await fetch(`https://${host}/v2/${cart.orderId}/status`, { headers: { Authorization: `Basic ${btoa(`${env.MIDTRANS_SERVER_KEY}:`)}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000), redirect: 'error' });
    data = await response.json();
    if (response.ok && String(data.status_code) !== '404') status = verifiedStatus(data, cart);
    else if (String(data.status_code) === '404') status = 'pending';
  } catch { /* Preserve unverified; a network error never grants access. */ }
  const timestamp = data.settlement_time || data.transaction_time;
  const paidDate = typeof timestamp === 'string' ? new Date(timestamp.replace(' ', 'T') + (/(Z|[+-]\d{2}:?\d{2})$/.test(timestamp) ? '' : '+07:00')) : null;
  return {
    orderId: cart.orderId, module: cart.module, tier: cart.tier, period: cart.period, amount: cart.amount,
    ownerId: cart.ownerId, storeId: cart.storeId, status,
    paidAt: status === 'paid' && paidDate && Number.isFinite(paidDate.getTime()) ? paidDate.toISOString() : null,
  };
}
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function signIn(module, cart, destination = 'login') {
  const next = `/${module}/pricing?period=${cart.period}&plan=${cart.tier}&checkout=1`;
  return new Response(null, { status: 303, headers: { Location: `/${module}/${destination}?next=${encodeURIComponent(next)}`, 'Cache-Control': 'no-store' } });
}
async function paymentService(request, env, pathname) {
  if (!['/api/subscriptions/payment-status', '/api/subscriptions/webhook'].includes(pathname)) return null;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.MIDTRANS_SERVER_KEY) return json({ error: 'Payment service unavailable' }, 503);
  const raw = await request.text();
  if (raw.length > 16000) return json({ error: 'Request too large' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!data || typeof data !== 'object') return json({ error: 'Invalid request' }, 400);
  if (pathname.endsWith('/payment-status')) {
    const receipt = await readReceipt(data.receipt, env.MIDTRANS_SERVER_KEY);
    if (!receipt?.ownerId || !receipt.storeId) return json({ error: 'Invalid payment reference' }, 403);
    return json(await paymentStatus(receipt, env));
  }
  const module = /^DG-(geraina|dapuros)-[a-f0-9]{32}$/.exec(data.order_id || '')?.[1];
  if (!module || !/^[a-f0-9]{128}$/i.test(data.signature_key || '')) return json({ error: 'Invalid notification' }, 403);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-512', encoder.encode(`${data.order_id}${data.status_code}${data.gross_amount}${env.MIDTRANS_SERVER_KEY}`)));
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ data.signature_key.toLowerCase().charCodeAt(index);
  if (difference) return json({ error: 'Invalid notification signature' }, 403);
  try {
    // The backend reads its own stored reference and independently checks this service.
    const result = await backend(module, env, '/reconcile', { body: { orderId: data.order_id } });
    return result.response.ok || result.response.status === 404 ? json({ received: true }) : json({ error: 'Activation will be retried' }, 503);
  } catch { return json({ error: 'Activation will be retried' }, 503); }
}
export async function handleSubscriptionCheckout(request, env) {
  const url = new URL(request.url);
  const service = await paymentService(request, env, url.pathname);
  if (service) return service;
  const match = url.pathname.match(/^\/(geraina|dapuros)\/(checkout|order)$/);
  if (!match) return null;
  const [, module, route] = match;
  if (!['GET', 'HEAD', 'POST'].includes(request.method) || (route === 'order' && request.method === 'POST')) return page(module, 'Metode tidak didukung', '<p>Silakan buka halaman checkout.</p>', 405);
  const secret = env.MIDTRANS_SERVER_KEY;
  if (route === 'order') {
    const receipt = secret && await readReceipt(url.searchParams.get('receipt'), secret);
    if (!receipt || receipt.module !== module || (receipt.snapToken !== undefined && !/^[a-f0-9-]{36}$/.test(receipt.snapToken))) return page(module, 'Pesanan tidak ditemukan', '<p>Tautan pesanan tidak valid. Silakan gunakan tautan asli setelah checkout.</p>', 404);
    let { status } = await paymentStatus(receipt, env);
    let activation = 'pending', expiresAt;
    if (receipt.ownerId && ['paid', 'failed', 'refunded'].includes(status)) {
      try {
        const result = await backend(module, env, '/reconcile', { body: { orderId: receipt.orderId } });
        if (result.response.ok) {
          status = result.data.status;
          activation = result.data.activation;
          expiresAt = result.data.expires_at;
        }
      } catch { /* Payment stays paid; activation retries through the webhook or refresh. */ }
    }
    const messages = {
      pending: ['Menunggu pembayaran', 'Pesanan dibuat. Pembayaran belum terkonfirmasi dan paket belum aktif.'],
      paid: ['Pembayaran terkonfirmasi', 'Midtrans telah mengonfirmasi pembayaran. Aktivasi paket dilakukan oleh tim DagangOS untuk akun Anda. Hubungi contact@dagangos.com dengan nomor pesanan ini.'],
      failed: ['Pembayaran tidak selesai', 'Pembayaran dibatalkan, kedaluwarsa, atau ditolak. Paket tidak diaktifkan. Silakan buat pesanan baru.'],
      refunded: ['Pembayaran dikembalikan / disengketakan', 'Status pembayaran bukan langganan aktif. Hubungi tim DagangOS untuk tindak lanjut.'],
      unverified: ['Status belum dapat diverifikasi', 'Kami belum bisa memastikan status pembayaran. Jangan membayar ulang sebelum memeriksa transaksi sebelumnya.'],
    };
    if (receipt.ownerId && status === 'paid') messages.paid = activation === 'active'
      ? ['Pembayaran berhasil — paket aktif', `Paket ${label(receipt.tier)} sudah diaktifkan otomatis untuk akun Anda.${expiresAt ? ` Berlaku hingga ${new Date(expiresAt).toLocaleDateString('id-ID')}.` : ''}`]
      : activation === 'superseded'
        ? ['Pembayaran tercatat', 'Akun Anda sudah memiliki langganan yang lebih baru. Buka aplikasi untuk melihat paket aktif.']
        : ['Pembayaran berhasil — aktivasi sedang diproses', 'Pembayaran sudah terkonfirmasi. Sistem sedang menyelesaikan aktivasi akun Anda secara otomatis. Jangan membayar ulang.'];
    const [heading, explanation] = messages[status] || messages.unverified;
    const waiting = Boolean(receipt.ownerId && (status === 'pending' || status === 'paid' && activation === 'pending'));
    return page(module, heading, `<section class="card"><p class="badge">${escape(status.toUpperCase())}</p><p>${explanation}</p><p>Nomor pesanan<br><strong class="reference">${escape(receipt.orderId)}</strong></p>${summary(receipt)}${activation === 'active' || activation === 'superseded' ? `<a class="button" href="/${module}/app/dashboard">Buka ${CATALOG[module].name}</a>` : ''}${status === 'pending' && receipt.snapToken ? `<a class="button" href="${paymentUrl(receipt.snapToken, env)}" rel="noreferrer">Buka Pembayaran Midtrans</a>` : ''}<a class="button button--quiet" href="${escape(url.pathname + url.search)}">Periksa Status Pembayaran</a>${waiting ? '<p class="muted">Status diperbarui otomatis setiap 10 detik. Anda tidak perlu menghubungi tim untuk aktivasi.</p>' : ''}${env.MIDTRANS_ENVIRONMENT === 'sandbox' ? '<p class="notice">SANDBOX: pembayaran uji, bukan transaksi asli.</p>' : ''}</section>`, 200, waiting);
  }
  if (request.method === 'POST') {
    // Browser-only same-origin form submission; no arbitrary cross-site invoice creation.
    if (!['https://dagangos.com', 'https://www.dagangos.com', url.origin].includes(request.headers.get('Origin')) || !/application\/x-www-form-urlencoded/.test(request.headers.get('Content-Type') || '') || Number(request.headers.get('Content-Length') || 0) > 12000) return page(module, 'Permintaan tidak valid', '<p>Silakan mulai lagi dari halaman paket.</p>', 403);
    if (!secret) return page(module, 'Pembayaran belum tersedia', '<p>Koneksi pembayaran belum dikonfigurasi. Pesanan tidak dibuat.</p>', 503);
    const rawBody = await request.text();
    if (rawBody.length > 12000) return page(module, 'Permintaan terlalu besar', '<p>Silakan periksa data Anda.</p>', 413);
    const form = new URLSearchParams(rawBody);
    const cart = await readReceipt(form.get('cart'), secret);
    if (!cart || cart.module !== module || cart.ownerId || Date.now() > cart.expires || !Number.isFinite(cart.expires) || form.get('website')) return page(module, 'Pilih kembali paket', `<p>Pilihan paket tidak valid atau sudah kedaluwarsa. Pesanan tidak dibuat.</p><a class="button" href="/${module}/pricing">Kembali ke paket</a>`, 400);
    const accessToken = form.get('access_token') || request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    if (!/^[a-zA-Z0-9_.-]{20,4096}$/.test(accessToken)) return signIn(module, cart);
    try {
      const prepared = await backend(module, env, '/orders', { token: accessToken, body: { orderId: cart.orderId, tier: cart.tier, period: cart.period } });
      if (prepared.response.status === 401) return signIn(module, cart);
      if (prepared.response.status === 409 && prepared.data.detail === 'no_store_for_module') return signIn(module, cart, 'activate');
      if (prepared.response.status === 409 && prepared.data.detail?.code === 'subscription_active') return page(module, 'Paket Anda sudah aktif', `<p>Akun Anda sudah memiliki paket ${escape(label(cart.tier))} aktif. Tidak ada pembayaran baru yang dibuat.</p><a class="button" href="/${module}/app/dashboard">Buka aplikasi</a>`);
      if (prepared.response.status === 403) return page(module, 'Akun pemilik diperlukan', '<p>Masuk dengan akun pemilik untuk membeli atau mengubah langganan.</p>', 403);
      if (!prepared.response.ok || prepared.data.amount !== cart.amount || prepared.data.order_id !== cart.orderId || ![prepared.data.owner_id, prepared.data.store_id].every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))) return page(module, 'Pesanan belum dapat disiapkan', '<p>Pesanan belum dibuat dan tidak ada pembayaran yang ditarik. Silakan kembali ke halaman paket dan coba lagi.</p>', 502);
      const boundCart = { ...cart, ownerId: prepared.data.owner_id, storeId: prepared.data.store_id };
      const receipt = await signReceipt(boundCart, secret);
      const attached = await backend(module, env, `/orders/${cart.orderId}/reference`, { token: accessToken, body: { receipt } });
      if (!attached.response.ok) return page(module, 'Pesanan belum dapat disiapkan', '<p>Referensi akun belum tersimpan. Pembayaran belum dimulai; silakan coba lagi dari halaman paket.</p>', 502);
      const response = await fetch(`https://${paymentHost(env)}/snap/v1/transactions`, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Basic ${btoa(`${secret}:`)}`, 'Content-Type': 'application/json', Accept: 'application/json', 'X-Override-Notification': 'https://dagangos.com/api/subscriptions/webhook' },
        body: JSON.stringify({
          transaction_details: { order_id: cart.orderId, gross_amount: cart.amount },
          item_details: [{ id: `${module}-${cart.tier}-${cart.period}`, price: cart.amount, quantity: 1, name: `${CATALOG[module].name} ${label(cart.tier)} ${cart.period === 'yearly' ? '12 bulan' : '1 bulan'}` }],
          ...(prepared.data.email ? { customer_details: { email: prepared.data.email } } : {}),
          custom_field1: boundCart.ownerId,
          custom_field2: `${module}:${cart.tier}:${cart.period}:automatic`,
          custom_field3: boundCart.storeId,
          callbacks: { finish: `https://dagangos.com/${module}/order?receipt=${encodeURIComponent(receipt)}` },
          enabled_payments: ['bank_transfer', 'gopay', 'shopeepay'],
          expiry: { unit: 'hours', duration: 24 },
        }),
      });
      const result = await response.json();
      if (!response.ok || !/^[a-f0-9-]{36}$/.test(result.token || '')) {
        console.warn('Subscription checkout rejected', module, response.status);
        return page(module, 'Pembayaran belum dapat dimulai', `<p>Midtrans belum menerima pesanan ini. Tidak ada paket yang diaktifkan atau pembayaran yang ditarik.</p><p>Jika sebelumnya sudah membuat pesanan, gunakan tautan pesanan sebelumnya. Jika belum, coba kembali atau hubungi contact@dagangos.com.</p><a class="button button--quiet" href="/${module}/pricing?period=${cart.period}#plan-${cart.tier}">Kembali ke paket</a>`, 502);
      }
      return new Response(null, { status: 303, headers: { Location: paymentUrl(result.token, env), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    } catch {
      return page(module, 'Koneksi pembayaran terputus', '<p>Status pembuatan pesanan belum dapat dipastikan. Hubungi contact@dagangos.com sebelum mencoba lagi.</p>', 502);
    }
  }
  const cart = selection(module, url.searchParams.get('plan') || 'starter', url.searchParams.get('period') || 'monthly');
  if (!cart) return page(module, 'Paket tidak ditemukan', `<p>Pilih paket Starter, Pro, atau Business.</p><a href="/${module}/pricing">Lihat paket</a>`, 400);
  // Legacy links return to the selected billing period; a GET must never create an invoice.
  return new Response(null, { status: 303, headers: { Location: `/${module}/pricing?period=${cart.period}#plan-${cart.tier}`, 'Cache-Control': 'no-store' } });
}
