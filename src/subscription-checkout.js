// Subscription orders are durably recorded in Midtrans, separate from tenant POS orders.
// Opening checkout never grants a plan. Fulfilment remains manual after verified payment.
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
  'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, follow',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
function page(module, title, body, status = 200) {
  const product = CATALOG[module];
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — ${product.name}</title><link rel="icon" href="/assets/brand/${module}-icon.png"><link rel="stylesheet" href="/product-public.css"><link rel="stylesheet" href="/subscription-checkout.css"></head><body class="checkout ${module}"><header class="topbar"><div class="shell topbar__inner"><a class="brand" href="/${module}"><img src="/assets/brand/${module}-icon.png" alt="">${product.name}</a><nav class="nav"><a href="/${module}/pricing">Kembali ke paket</a></nav></div></header><main class="checkout-shell"><p class="eyebrow">LANGGANAN DAGANGOS</p><h1>${escape(title)}</h1>${body}</main><footer class="footer"><div class="shell footer__inner"><span>PT DagangOS Digital Indonesia</span><a href="mailto:contact@dagangos.com">contact@dagangos.com</a></div></footer></body></html>`, { status, headers: securityHeaders });
}
export function selection(module, tier, period) {
  if (!Object.hasOwn(CATALOG, module)) return null;
  const product = CATALOG[module];
  if (!Object.hasOwn(product.prices, tier) || !['monthly', 'yearly'].includes(period)) return null;
  return { module, tier, period, amount: product.prices[tier][period === 'yearly' ? 1 : 0] };
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
  if (data.transaction_status === 'settlement' || (data.transaction_status === 'capture' && data.fraud_status === 'accept')) return 'paid';
  if (['cancel', 'deny', 'expire', 'failure'].includes(data.transaction_status)) return 'failed';
  if (['refund', 'partial_refund', 'chargeback', 'partial_chargeback'].includes(data.transaction_status)) return 'refunded';
  return 'pending';
}
export async function handleSubscriptionCheckout(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/(geraina|dapuros)\/(checkout|order)$/);
  if (!match) return null;
  const [, module, route] = match;
  if (!['GET', 'HEAD', 'POST'].includes(request.method) || (route === 'order' && request.method === 'POST')) return page(module, 'Metode tidak didukung', '<p>Silakan buka halaman checkout.</p>', 405);
  const secret = env.MIDTRANS_SERVER_KEY;
  if (route === 'order') {
    const receipt = secret && await readReceipt(url.searchParams.get('receipt'), secret);
    if (!receipt || receipt.module !== module || (receipt.snapToken !== undefined && !/^[a-f0-9-]{36}$/.test(receipt.snapToken))) return page(module, 'Pesanan tidak ditemukan', '<p>Tautan pesanan tidak valid. Silakan gunakan tautan asli setelah checkout.</p>', 404);
    let status = 'pending';
    try {
      const api = env.MIDTRANS_ENVIRONMENT === 'sandbox' ? 'api.sandbox.midtrans.com' : 'api.midtrans.com';
      const response = await fetch(`https://${api}/v2/${receipt.orderId}/status`, { headers: { Authorization: `Basic ${btoa(`${secret}:`)}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (response.ok && String(data.status_code) !== '404') status = verifiedStatus(data, receipt);
      else if (String(data.status_code) !== '404') status = 'unverified';
    } catch { status = 'unverified'; }
    const messages = {
      pending: ['Menunggu pembayaran', 'Pesanan dibuat. Pembayaran belum terkonfirmasi dan paket belum aktif.'],
      paid: ['Pembayaran terkonfirmasi', 'Midtrans telah mengonfirmasi pembayaran. Aktivasi paket dilakukan oleh tim DagangOS untuk akun Anda. Hubungi contact@dagangos.com dengan nomor pesanan ini.'],
      failed: ['Pembayaran tidak selesai', 'Pembayaran dibatalkan, kedaluwarsa, atau ditolak. Paket tidak diaktifkan. Silakan buat pesanan baru.'],
      refunded: ['Pembayaran dikembalikan / disengketakan', 'Status pembayaran bukan langganan aktif. Hubungi tim DagangOS untuk tindak lanjut.'],
      unverified: ['Status belum dapat diverifikasi', 'Kami belum bisa memastikan status pembayaran. Jangan membayar ulang sebelum memeriksa transaksi sebelumnya.'],
    };
    const [heading, explanation] = messages[status];
    return page(module, heading, `<ol class="checkout-steps"><li>Paket dipilih</li><li>Pesanan dibuat</li><li>Pembayaran</li></ol><section class="card"><p class="badge">${escape(status.toUpperCase())}</p><p>${explanation}</p><p>Nomor pesanan<br><strong class="reference">${escape(receipt.orderId)}</strong></p>${summary(receipt)}${status === 'pending' && receipt.snapToken ? `<a class="button" href="${paymentUrl(receipt.snapToken, env)}" rel="noreferrer">Buka Pembayaran Midtrans</a>` : ''}<a class="button button--quiet" href="${escape(url.pathname + url.search)}">Periksa Status Pembayaran</a><p class="muted">Simpan tautan halaman ini untuk memeriksa status. Pembayaran asli diproses oleh Midtrans; jangan membayar jika hanya menguji alur.</p>${env.MIDTRANS_ENVIRONMENT === 'sandbox' ? '<p class="notice">SANDBOX: pembayaran uji, bukan transaksi asli.</p>' : ''}</section>`);
  }
  if (request.method === 'POST') {
    // Browser-only same-origin form submission; no arbitrary cross-site invoice creation.
    if (!['https://dagangos.com', 'https://www.dagangos.com', url.origin].includes(request.headers.get('Origin')) || !/application\/x-www-form-urlencoded/.test(request.headers.get('Content-Type') || '') || Number(request.headers.get('Content-Length') || 0) > 12000) return page(module, 'Permintaan tidak valid', '<p>Silakan mulai lagi dari halaman paket.</p>', 403);
    if (!secret) return page(module, 'Pembayaran belum tersedia', '<p>Koneksi pembayaran belum dikonfigurasi. Pesanan tidak dibuat.</p>', 503);
    const rawBody = await request.text();
    if (rawBody.length > 12000) return page(module, 'Permintaan terlalu besar', '<p>Silakan periksa data Anda.</p>', 413);
    const form = new URLSearchParams(rawBody);
    const cart = await readReceipt(form.get('cart'), secret);
    const name = (form.get('name') || '').trim();
    const email = (form.get('email') || '').trim();
    const business = (form.get('business') || '').trim();
    if (!cart || cart.module !== module || Date.now() > cart.expires || !Number.isFinite(cart.expires) || name.length < 2 || name.length > 80 || business.length < 2 || business.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || form.get('website')) return page(module, 'Periksa data checkout', `<p>Data tidak valid atau halaman checkout kedaluwarsa. Pesanan tidak dibuat.</p><a class="button" href="/${module}/checkout">Ulangi checkout</a>`, 400);
    try {
      const response = await fetch(`https://${paymentHost(env)}/snap/v1/transactions`, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Basic ${btoa(`${secret}:`)}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          transaction_details: { order_id: cart.orderId, gross_amount: cart.amount },
          item_details: [{ id: `${module}-${cart.tier}-${cart.period}`, price: cart.amount, quantity: 1, name: `${CATALOG[module].name} ${label(cart.tier)} ${cart.period === 'yearly' ? '12 bulan' : '1 bulan'}` }],
          customer_details: { first_name: name, email },
          custom_field1: business,
          custom_field2: `${module}:${cart.tier}:${cart.period}:manual-fulfilment`,
          callbacks: { finish: `https://dagangos.com/${module}/order?receipt=${encodeURIComponent(await signReceipt(cart, secret))}` },
          enabled_payments: ['bank_transfer', 'gopay', 'shopeepay'],
          expiry: { unit: 'hours', duration: 24 },
        }),
      });
      const result = await response.json();
      if (!response.ok || !/^[a-f0-9-]{36}$/.test(result.token || '')) {
        console.warn('Subscription checkout rejected', module, response.status);
        return page(module, 'Pembayaran belum dapat dimulai', `<p>Midtrans belum menerima pesanan ini. Tidak ada paket yang diaktifkan atau pembayaran yang ditarik.</p><p>Jika sebelumnya sudah membuat pesanan, gunakan tautan pesanan sebelumnya. Jika belum, coba kembali atau hubungi contact@dagangos.com.</p><a class="button button--quiet" href="/${module}/checkout?plan=${cart.tier}&period=${cart.period}">Kembali ke checkout</a>`, 502);
      }
      const receipt = await signReceipt({ ...cart, snapToken: result.token }, secret);
      return new Response(null, { status: 303, headers: { Location: `/${module}/order?receipt=${encodeURIComponent(receipt)}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    } catch {
      return page(module, 'Koneksi pembayaran terputus', '<p>Status pembuatan pesanan belum dapat dipastikan. Hubungi contact@dagangos.com sebelum mencoba lagi.</p>', 502);
    }
  }
  const cart = selection(module, url.searchParams.get('plan') || 'starter', url.searchParams.get('period') || 'monthly');
  if (!cart) return page(module, 'Paket tidak ditemukan', `<p>Pilih paket Starter, Pro, atau Business.</p><a href="/${module}/pricing">Lihat paket</a>`, 400);
  const token = secret ? await signReceipt({ ...cart, orderId: `DG-${module}-${crypto.randomUUID().replace(/-/g, '')}`, expires: Date.now() + 3600000 }, secret) : '';
  return page(module, 'Checkout langganan', `<ol class="checkout-steps"><li>Pilih paket</li><li>Data pelanggan</li><li>Pembayaran Midtrans</li></ol><div class="checkout-grid"><section class="card"><h2>1. Paket & periode</h2><form method="get"><label for="plan">Paket</label><select id="plan" name="plan">${Object.keys(CATALOG[module].prices).map(t => `<option value="${t}"${t === cart.tier ? ' selected' : ''}>${label(t)}</option>`).join('')}</select><label for="period">Periode langganan</label><select id="period" name="period"><option value="monthly"${cart.period === 'monthly' ? ' selected' : ''}>Bulanan — 1 bulan</option><option value="yearly"${cart.period === 'yearly' ? ' selected' : ''}>Tahunan — 12 bulan</option></select><button class="button button--quiet" type="submit">Perbarui Ringkasan</button></form>${summary(cart)}<p class="notice">Paket aktif setelah pembayaran terverifikasi dan aktivasi dikonfirmasi oleh tim DagangOS melalui email. Harga tidak mencakup add-on, custom development, atau implementasi pribadi.</p></section><section class="card"><h2>2. Data pelanggan</h2><p class="muted">Tidak perlu membuat akun untuk membuka checkout. Gunakan email akun DagangOS jika Anda sudah memiliki akun.</p><form method="post" action="/${module}/checkout"><input type="hidden" name="cart" value="${token}"><div class="honeypot" aria-hidden="true"><label for="website">Website</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div><label for="name">Nama pelanggan</label><input id="name" name="name" required minlength="2" maxlength="80" autocomplete="name"><label for="business">Nama usaha / restoran / toko</label><input id="business" name="business" required minlength="2" maxlength="100" autocomplete="organization"><label for="email">Email untuk pesanan & aktivasi</label><input id="email" name="email" type="email" required maxlength="254" autocomplete="email"><p class="muted">Data ini dikirim ke Midtrans untuk membuat pesanan pembayaran. Klik tombol berikut hanya membuat pesanan belum dibayar; tidak menarik dana atau mengaktifkan paket.</p><button class="button" type="submit"${!secret ? ' disabled' : ''}>Lanjutkan ke Pembayaran</button>${!secret ? '<p role="alert">Pembayaran belum dikonfigurasi.</p>' : ''}</form><p class="muted">Metode pembayaran ditampilkan oleh Midtrans sesuai yang tersedia pada akun merchant. Kartu kredit tidak ditawarkan pada checkout ini.</p></section></div>`);
}
