import { createPaymentLink, findInvoice, verifiedInvoiceStatus, equalToken, invoiceUrl } from './xendit-payments.js';
// Subscription orders belong to a verified account and product store. Product backends
// grant access only after checking payment truth with this central payment service.
export const CATALOG = {
  geraina: { name: 'Geraina POS', prices: { starter: [149000, 1490000], pro: [349000, 3490000], business: [549000, 5490000] } },
  dapuros: { name: 'DapurOS', prices: { starter: [249000, 2490000], pro: [499000, 4990000], business: [749000, 7490000] } },
};
export const ADDONS = {
  extra_device: { name: 'Device kasir tambahan', tier: 'pro', amount: 49000 },
  extra_outlet: { name: 'Outlet tambahan', tier: 'business', amount: 149000 },
};
export function addonSelection(module, addonId, period = 'monthly') {
  const addon = module === 'dapuros' && addonId === 'extra_outlet' ? { ...ADDONS[addonId], amount: 199000 } : ADDONS[addonId];
  return Object.hasOwn(CATALOG, module) && Object.hasOwn(ADDONS, addonId) && period === 'monthly'
    ? { module, kind: 'addon', addonId, tier: addon.tier, period, amount: addon.amount } : null;
}
const receiptSecret = env => env.SUBSCRIPTION_SIGNING_KEY || env.MIDTRANS_SERVER_KEY || env.XENDIT_SECRET_KEY;
const encoder = new TextEncoder();
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => `Rp ${Number(value).toLocaleString('id-ID')}`;
const label = value => value[0].toUpperCase() + value.slice(1);
const securityHeaders = {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  // Preserve Origin on native same-origin POSTs without leaking external referrers.
  'Referrer-Policy': 'same-origin', 'X-Robots-Tag': 'noindex, follow',
  // Chromium also checks the final destination of a same-origin form redirect.
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; script-src 'self'; form-action 'self' https://checkout.xendit.co https://checkout-staging.xendit.co; base-uri 'none'; frame-ancestors 'none'",
};
function page(module, title, body, status = 200, refresh = false) {
  const product = CATALOG[module];
  const feedback = Object.hasOwn(CATALOG, module) ? '<link rel="stylesheet" href="/subscription-feedback.css?v=20261027b"><script src="/subscription-feedback.js?v=20261027b" defer></script>' : '';
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh ? '<meta http-equiv="refresh" content="10">' : ''}<title>${escape(title)} — ${product.name}</title><link rel="icon" href="/assets/brand/${module}-icon.png"><link rel="stylesheet" href="/product-public.css?v=theme-20261024"><link rel="stylesheet" href="/subscription-checkout.css?v=theme-20261024">${feedback}</head><body class="checkout ${module}"><header class="topbar"><div class="shell topbar__inner"><a class="brand" href="/${module}"><img src="/assets/brand/${module}-icon.png" alt="">${product.name}</a><nav class="nav"><a href="/${module}/pricing">Kembali ke paket</a></nav></div></header><main class="checkout-shell"><p class="eyebrow">LANGGANAN DAGANGOS</p><h1>${escape(title)}</h1>${body}</main><footer class="footer"><div class="shell footer__inner"><span>PT DagangOS Digital Indonesia</span><a href="mailto:contact@dagangos.com">contact@dagangos.com</a></div></footer></body></html>`, { status, headers: securityHeaders });
}
export function selection(module, tier, period) {
  if (!Object.hasOwn(CATALOG, module)) return null;
  const product = CATALOG[module];
  if (!Object.hasOwn(product.prices, tier) || !['monthly', 'yearly'].includes(period)) return null;
  return { module, tier, period, amount: product.prices[tier][period === 'yearly' ? 1 : 0] };
}
export async function renderSubscriptionPricing(html, module, request, env) {
  const period = new URL(request.url).searchParams.get('period') === 'yearly' ? 'yearly' : 'monthly';
  const secret = receiptSecret(env);
  const expires = Date.now() + 3600000;
  const replacements = {
    MONTHLY_SELECTED: String(period === 'monthly'),
    YEARLY_SELECTED: String(period === 'yearly'),
    PAYMENT_DISABLED: env.XENDIT_SECRET_KEY && env.XENDIT_WEBHOOK_TOKEN ? '' : ' disabled',
    PAYMENT_NOTICE: env.XENDIT_SECRET_KEY && env.XENDIT_WEBHOOK_TOKEN ? '' : '<p class="pricing-note" role="alert">Pembayaran belum tersedia. Hubungi contact@dagangos.com untuk informasi paket.</p>',
  };
  const tiers = Object.keys(CATALOG[module].prices);
  await Promise.all(tiers.flatMap(tier => ['monthly', 'yearly'].map(async billing => {
    const cart = selection(module, tier, billing);
    const key = `${tier}_${billing}`.toUpperCase();
    replacements[`${key}_PRICE`] = money(cart.amount);
    replacements[`${key}_PERIOD`] = billing === 'yearly'
      ? `/tahun · setara ${money(Math.round(cart.amount / 12))}/bulan`
      : '/bulan';
    replacements[`${key}_CART`] = secret ? await signReceipt({ ...cart, provider: 'xendit', orderId: `DG-${module}-${crypto.randomUUID().replace(/-/g, '')}`, expires }, secret) : '';
  })));
  for (const tier of tiers) {
    for (const field of ['PRICE', 'PERIOD', 'CART']) {
      replacements[`${tier.toUpperCase()}_${field}`] = replacements[`${tier}_${period}_${field}`.toUpperCase()];
    }
  }
  if (Object.hasOwn(CATALOG, module)) {
    const url = new URL(request.url), renewal = url.searchParams.get('renewal');
    for (const [id, addon] of Object.entries(ADDONS)) {
      const cart = { ...addonSelection(module, id), provider: 'xendit', orderId: `DG-${module}-${crypto.randomUUID().replace(/-/g, '')}`, expires };
      if (renewal && url.searchParams.get('addon') === id && /^(DG-(geraina|dapuros)-[a-f0-9]{32}|[a-f0-9-]{36})$/.test(renewal)) cart.renewalId = renewal;
      replacements[`${id.toUpperCase()}_CART`] = secret ? await signReceipt(cart, secret) : '';
      replacements[`${id.toUpperCase()}_PRICE`] = money(addonSelection(module,id).amount);
    }
  }
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key) => replacements[key] ?? placeholder);
}
function summary(cart) {
  if (cart.kind === 'addon') return `<dl class="order-details"><dt>Add-on</dt><dd>${escape(ADDONS[cart.addonId].name)}</dd><dt>Paket yang diperlukan</dt><dd>${label(cart.tier)}</dd><dt>Periode</dt><dd>1 bulan${cart.renewalId ? ' perpanjangan' : ''}</dd><dt>Total pembayaran</dt><dd class="order-total">${money(cart.amount)}</dd></dl><p class="muted">Satu pembayaran, tanpa penagihan otomatis. Add-on hanya dapat digunakan selama paket ${label(cart.tier)} aktif. Pembelian baru berlaku satu bulan sejak pembayaran terverifikasi; perpanjangan menambah satu bulan setelah masa aktif add-on yang sudah dibayar.</p>`;
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
    if (data.kind !== undefined && data.kind !== 'addon') return null;
    const cart = data.kind === 'addon' ? addonSelection(data.module, data.addonId, data.period) : selection(data.module, data.tier, data.period);
    if (!cart || data.amount !== cart.amount || !/^DG-(geraina|dapuros)-[a-f0-9]{32}$/.test(data.orderId) || !data.orderId.startsWith(`DG-${data.module}-`)) return null;
    if (data.kind === 'addon' && (data.tier !== cart.tier || data.renewalId !== undefined && !/^(DG-(geraina|dapuros)-[a-f0-9]{32}|[a-f0-9-]{36})$/.test(data.renewalId))) return null;
    if ((data.ownerId !== undefined || data.storeId !== undefined) && ![data.ownerId, data.storeId].every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))) return null;
    return data;
  } catch { return null; }
}
export const verifiedStatus = verifiedInvoiceStatus;
async function backend(module, env, path, { token, body } = {}) {
  const host = module === 'geraina' ? (env.GERAINA_BACKEND_ORIGIN || 'geraina-os.vercel.app') : (env.BACKEND_ORIGIN || 'dapuros.vercel.app');
  const response = await fetch(`https://${host}/api/subscriptions${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DagangOS-Module': module, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: 'manual',
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function paymentStatus(cart, env) {
  let invoice = null, status = 'unverified';
  try {
    invoice = await findInvoice(env, cart.orderId);
    status = verifiedInvoiceStatus(invoice, cart);
  } catch { /* An outage or ambiguous invoice never grants access. */ }
  return {
    orderId: cart.orderId, module: cart.module, tier: cart.tier, period: cart.period, amount: cart.amount,
    ownerId: cart.ownerId, storeId: cart.storeId, status,
    paidAt: status === 'paid' ? new Date(invoice.paid_at).toISOString() : null,
    paymentUrl: status === 'pending' && invoice ? invoiceUrl(invoice.invoice_url) : null,
    ...(cart.kind === 'addon' ? {kind: 'addon', addonId: cart.addonId, renewalId: cart.renewalId || null} : {}),
  };
}
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function signIn(module, cart, destination = 'login') {
  const next = cart.kind === 'addon' ? `/${module}/pricing?period=monthly&addon=${cart.addonId}&checkout=1${cart.renewalId ? `&renewal=${encodeURIComponent(cart.renewalId)}` : ''}` : `/${module}/pricing?period=${cart.period}&plan=${cart.tier}&checkout=1`;
  return new Response(null, { status: 303, headers: { Location: `/${module}/${destination}?next=${encodeURIComponent(next)}`, 'Cache-Control': 'no-store' } });
}
async function paymentService(request, env, pathname) {
  if (!['/api/subscriptions/payment-status', '/api/subscriptions/webhook'].includes(pathname)) return null;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.XENDIT_SECRET_KEY || !env.XENDIT_WEBHOOK_TOKEN) return json({ error: 'Payment service unavailable' }, 503);
  const raw = await request.text();
  if (raw.length > 16000) return json({ error: 'Request too large' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!data || typeof data !== 'object') return json({ error: 'Invalid request' }, 400);
  if (pathname.endsWith('/payment-status')) {
    const receipt = await readReceipt(data.receipt, receiptSecret(env));
    if (!receipt?.ownerId || !receipt.storeId) return json({ error: 'Invalid payment reference' }, 403);
    return json(await paymentStatus(receipt, env));
  }
  if (!equalToken(request.headers.get('x-callback-token'), env.XENDIT_WEBHOOK_TOKEN)) return json({ error: 'Invalid notification token' }, 403);
  const module = /^DG-(geraina|dapuros)-[a-f0-9]{32}$/.exec(data.external_id || '')?.[1];
  if (!module && /^[a-f0-9-]{36}$/i.test(data.external_id || '')) {
    try {
      const response = await fetch('https://wmp.dagangos.com/api/webhooks/payments/xendit', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'x-callback-token': env.XENDIT_WEBHOOK_TOKEN },
        body: raw,
      });
      return response.ok || response.status === 404 ? json({ received: true }) : json({ error: 'Order verification will be retried' }, 503);
    } catch { return json({ error: 'Order verification will be retried' }, 503); }
  }
  if (!module) return json({ received: true });
  try {
    // The backend reads its own stored reference and independently checks this service.
    const result = await backend(module, env, '/reconcile', { body: { orderId: data.external_id } });
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
  const secret = receiptSecret(env);
  if (route === 'order') {
    const receipt = secret && await readReceipt(url.searchParams.get('receipt'), secret);
    if (!receipt || receipt.module !== module) return page(module, 'Pesanan tidak ditemukan', '<p>Tautan pesanan tidak valid. Silakan gunakan tautan asli setelah checkout.</p>', 404);
    let { status, paymentUrl: resumeUrl } = await paymentStatus(receipt, env);
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
      paid: ['Pembayaran terkonfirmasi', 'Xendit telah mengonfirmasi pembayaran. Aktivasi paket dilakukan oleh tim DagangOS untuk akun Anda. Hubungi contact@dagangos.com dengan nomor pesanan ini.'],
      failed: ['Pembayaran tidak selesai', 'Pembayaran dibatalkan, kedaluwarsa, atau ditolak. Paket tidak diaktifkan. Silakan buat pesanan baru.'],
      refunded: ['Pembayaran dikembalikan / disengketakan', 'Status pembayaran bukan langganan aktif. Hubungi tim DagangOS untuk tindak lanjut.'],
      unverified: ['Status belum dapat diverifikasi', 'Kami belum bisa memastikan status pembayaran. Jangan membayar ulang sebelum memeriksa transaksi sebelumnya.'],
    };
    if (receipt.ownerId && status === 'paid') messages.paid = activation === 'active'
      ? ['Pembayaran berhasil — paket aktif', `Paket ${label(receipt.tier)} sudah diaktifkan otomatis untuk akun Anda.${expiresAt ? ` Berlaku hingga ${new Date(expiresAt).toLocaleDateString('id-ID')}.` : ''}`]
      : activation === 'superseded'
        ? ['Pembayaran tercatat', 'Akun Anda sudah memiliki langganan yang lebih baru. Buka aplikasi untuk melihat paket aktif.']
        : ['Pembayaran berhasil — aktivasi sedang diproses', 'Pembayaran sudah terkonfirmasi. Sistem sedang menyelesaikan aktivasi akun Anda secara otomatis. Jangan membayar ulang.'];
    if (receipt.kind === 'addon') {
      messages.pending = ['Menunggu pembayaran add-on', 'Pembayaran belum terkonfirmasi. Kapasitas tambahan belum diberikan.'];
      messages.failed = ['Pembayaran add-on tidak selesai', 'Pembayaran kedaluwarsa atau gagal. Kapasitas tambahan tidak diberikan.'];
      messages.refunded = ['Pembayaran add-on dikembalikan', 'Kapasitas dari periode pembayaran ini tidak lagi aktif. Paket utama tidak diubah.'];
      if (status === 'paid') messages.paid = activation === 'active'
        ? ['Pembayaran add-on berhasil', `${escape(ADDONS[receipt.addonId].name)} tercatat${expiresAt ? ` hingga ${new Date(expiresAt).toLocaleDateString('id-ID')}` : ''}. Kapasitas tersedia selama paket ${label(receipt.tier)} aktif.`]
        : ['Pembayaran add-on tercatat', 'Aktivasi belum selesai. Periksa kembali status pesanan sebelum melakukan pembayaran baru.'];
    }
    const [heading, explanation] = messages[status] || messages.unverified;
    const waiting = Boolean(receipt.ownerId && (status === 'pending' || status === 'paid' && activation === 'pending'));
    return page(module, heading, `<section class="card"><p class="badge">${escape(status.toUpperCase())}</p><p>${explanation}</p><p>Nomor pesanan<br><strong class="reference">${escape(receipt.orderId)}</strong></p>${summary(receipt)}${activation === 'active' || activation === 'superseded' ? `<a class="button" href="/${module}/app/dashboard">Buka ${CATALOG[module].name}</a>` : ''}${status === 'pending' && resumeUrl ? `<a class="button" href="${escape(resumeUrl)}" rel="noreferrer">Buka Pembayaran Xendit</a>` : ''}<a class="button button--quiet" href="${escape(url.pathname + url.search)}">Periksa Status Pembayaran</a>${waiting ? '<p class="muted">Status diperbarui otomatis setiap 10 detik. Anda tidak perlu menghubungi tim untuk aktivasi.</p>' : ''}${env.XENDIT_ENVIRONMENT === 'sandbox' ? '<p class="notice">SANDBOX: pembayaran uji, bukan transaksi asli.</p>' : ''}</section>`, 200, waiting);
  }
  if (request.method === 'POST') {
    // Browser-only same-origin form submission; no arbitrary cross-site invoice creation.
    if (!['https://dagangos.com', 'https://www.dagangos.com', url.origin].includes(request.headers.get('Origin')) || !/application\/x-www-form-urlencoded/.test(request.headers.get('Content-Type') || '') || Number(request.headers.get('Content-Length') || 0) > 12000) return page(module, 'Permintaan tidak valid', '<p>Silakan mulai lagi dari halaman paket.</p>', 403);
    if (!secret || !env.XENDIT_SECRET_KEY || !env.XENDIT_WEBHOOK_TOKEN) return page(module, 'Pembayaran belum tersedia', '<p>Koneksi pembayaran belum dikonfigurasi. Pesanan tidak dibuat.</p>', 503);
    const rawBody = await request.text();
    if (rawBody.length > 12000) return page(module, 'Permintaan terlalu besar', '<p>Silakan periksa data Anda.</p>', 413);
    const form = new URLSearchParams(rawBody);
    const cart = await readReceipt(form.get('cart'), secret);
    if (!cart || cart.module !== module || cart.ownerId || cart.provider !== 'xendit' || Date.now() > cart.expires || !Number.isFinite(cart.expires) || form.get('website')) return page(module, 'Pilih kembali paket', `<p>Pilihan paket tidak valid atau sudah kedaluwarsa. Pesanan tidak dibuat.</p><a class="button" href="/${module}/pricing">Kembali ke paket</a>`, 400);
    const accessToken = form.get('access_token') || request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    if (!/^[a-zA-Z0-9_.-]{20,4096}$/.test(accessToken)) return signIn(module, cart);
    try {
      const prepared = await backend(module, env, '/orders', { token: accessToken, body: { orderId: cart.orderId, tier: cart.tier, period: cart.period, ...(cart.kind === 'addon' ? {kind:'addon',addonId:cart.addonId,renewalId:cart.renewalId,confirmAddon:form.get('confirm_addon')==='yes'} : {}) } });
      if (prepared.response.status === 401) return signIn(module, cart);
      if (prepared.response.status === 409 && prepared.data.detail === 'no_store_for_module') return signIn(module, cart, 'activate');
      if (prepared.response.status === 409 && prepared.data.detail?.code === 'subscription_active') return page(module, 'Paket Anda sudah aktif', `<p>Akun Anda sudah memiliki paket ${escape(label(cart.tier))} aktif. Tidak ada pembayaran baru yang dibuat.</p><a class="button" href="/${module}/app/dashboard">Buka aplikasi</a>`);
      if (prepared.response.status === 403) return page(module, 'Akun pemilik diperlukan', '<p>Masuk dengan akun pemilik untuk membeli atau mengubah langganan.</p>', 403);
      if (cart.kind === 'addon' && prepared.response.status === 400) return page(module, 'Add-on belum dapat dibeli', `<p>${escape(typeof prepared.data.detail === 'string' ? prepared.data.detail : 'Periksa paket yang diperlukan.')}</p><a class="button" href="/${module}/app/settings/billing">Kembali ke langganan</a>`,400);
      if (cart.kind === 'addon' && prepared.response.status === 409) {
        const receipt = prepared.data.detail?.receipt;
        return page(module, 'Periksa pesanan add-on', `<p>${escape(prepared.data.detail?.message || 'Pesanan sudah diproses atau berubah. Periksa pesanan sebelum membeli lagi.')}</p>${receipt ? `<a class="button" href="/${module}/order?receipt=${encodeURIComponent(receipt)}">Periksa atau lanjutkan pembayaran</a>` : ''}<a class="button button--quiet" href="/${module}/app/settings/billing">Kembali ke langganan</a>`);
      }
      if (!prepared.response.ok || prepared.data.amount !== cart.amount || prepared.data.order_id !== cart.orderId || ![prepared.data.owner_id, prepared.data.store_id].every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))) return page(module, 'Pesanan belum dapat disiapkan', '<p>Pesanan belum dibuat dan tidak ada pembayaran yang ditarik. Silakan kembali ke halaman paket dan coba lagi.</p>', 502);
      if (cart.kind === 'addon' && (prepared.data.kind !== 'addon' || prepared.data.addonId !== cart.addonId || prepared.data.tier !== cart.tier || (prepared.data.renewalId || null) !== (cart.renewalId || null))) return page(module,'Pesanan tidak cocok','<p>Referensi add-on tidak cocok. Pembayaran belum dibuat.</p>',502);
      if (Object.hasOwn(CATALOG,module) && prepared.data.active_subscription && form.get('confirm_change') !== 'yes') {
        const active = prepared.data.active_subscription;
        return page(module, 'Konfirmasi perubahan paket', `<section class="card"><p>Paket ${escape(label(active.tier))} Anda masih berlaku hingga ${escape(new Date(active.expires_at).toLocaleDateString('id-ID'))}.</p>${summary(cart)}<p class="notice">Paket baru dikenakan harga penuh dan mulai berlaku setelah pembayaran terverifikasi. Paket ini menggantikan paket saat ini; sisa waktu paket lama tidak dikreditkan atau dikembalikan. Jika ingin memakai sisa masa aktif, kembali dan beli setelah paket berakhir.</p><form method="post" action="/${module}/checkout" data-subscription-submit><input type="hidden" name="cart" value="${escape(form.get('cart'))}"><input type="hidden" name="access_token" value="${escape(accessToken)}"><input type="hidden" name="confirm_change" value="yes"><button class="button" type="submit">Saya setuju, lanjut ke pembayaran</button></form><a class="button button--quiet" href="/${module}/app/settings/billing">Kembali tanpa membeli</a></section>`);
      }
      const boundCart = { ...cart, ownerId: prepared.data.owner_id, storeId: prepared.data.store_id };
      const receipt = await signReceipt(boundCart, secret);
      const attached = await backend(module, env, `/orders/${cart.orderId}/reference`, { token: accessToken, body: { receipt } });
      if (!attached.response.ok) return page(module, 'Pesanan belum dapat disiapkan', '<p>Referensi akun belum tersimpan. Pembayaran belum dimulai; silakan coba lagi dari halaman paket.</p>', 502);
      if (cart.kind === 'addon') {
        if (form.get('confirm_addon') !== 'yes') return page(module, 'Konfirmasi pembelian add-on', `<section class="card">${summary(cart)}${prepared.data.base_expires_at ? `<p class="notice">Paket utama berakhir pada ${escape(new Date(prepared.data.base_expires_at).toLocaleDateString('id-ID'))}. Paket utama perlu tetap aktif agar kapasitas add-on dapat digunakan.</p>` : ''}<form method="post" action="/${module}/checkout" data-subscription-submit><input type="hidden" name="cart" value="${escape(form.get('cart'))}"><input type="hidden" name="access_token" value="${escape(accessToken)}"><input type="hidden" name="confirm_addon" value="yes"><button class="button" type="submit">Setuju, bayar add-on</button></form><a class="button button--quiet" href="/${module}/app/settings/billing">Kembali tanpa membeli</a></section>`);
        const claim = await backend(module, env, `/orders/${cart.orderId}/invoice-claim`, {token:accessToken,body:{}});
        if (!claim.response.ok || !claim.data.claimed) return new Response(null,{status:303,headers:{Location:`/${module}/order?receipt=${encodeURIComponent(receipt)}`,'Cache-Control':'no-store'}});
      }
      const paymentUrl = await createPaymentLink(env, boundCart, prepared.data.email, receipt);
      return new Response(null, { status: 303, headers: { Location: paymentUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    } catch {
      return page(module, 'Koneksi pembayaran terputus', `<p>Status pembuatan pesanan belum dapat dipastikan. Hubungi contact@dagangos.com sebelum mencoba lagi.</p><p>Nomor pesanan: ${escape(cart.orderId)}</p><a class="button" href="/${module}/app/settings/billing">Periksa langganan dan pesanan</a>`, 502);
    }
  }
  const cart = selection(module, url.searchParams.get('plan') || 'starter', url.searchParams.get('period') || 'monthly');
  if (!cart) return page(module, 'Paket tidak ditemukan', `<p>Pilih paket Starter, Pro, atau Business.</p><a href="/${module}/pricing">Lihat paket</a>`, 400);
  // Legacy links return to the selected billing period; a GET must never create an invoice.
  return new Response(null, { status: 303, headers: { Location: `/${module}/pricing?period=${cart.period}#plan-${cart.tier}`, 'Cache-Control': 'no-store' } });
}
