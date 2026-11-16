import { equalToken, findInvoice, verifiedInvoiceStatus, xenditRequest } from './xendit-payments.js';
import { subscriptionBackendHost } from './subscription-products.js';

const day = 86400000;
const affiliateRoot = '/affiliate-program';
const legacyAffiliateRoot = '/affiliate';
const accessPattern = /^[a-f0-9]{64}$/;
const productPattern = /^[a-z][a-z0-9-]{0,39}$/;
const codePattern = /^[A-Z0-9]{8,24}$/;
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const emailHash = email => hash(email.trim().toLowerCase());
const rupiah = amount => `Rp ${amount.toLocaleString('id-ID')}`;
const cookieValue = (request, name) => request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
const cookie = (name, value, path, maxAge) => `${name}=${value}; Path=${path}; Secure; HttpOnly; SameSite=Lax${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}`;
const referralCookie = product => `__Host-dg-ref-${product}`;
const sessionCookie = '__Secure-dg-affiliate';
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);

export function tenPercent(amount) {
  return Math.floor(amount / 10) + Number(amount % 10 >= 5);
}

export async function checkoutPolicy(env, product) {
  if (!env.AFFILIATE_DB || env.AFFILIATE_CHECKOUT !== 'on') return null;
  return statement(env.AFFILIATE_DB, `
    SELECT policy.version, policy.scope, policy.referral_days, policy.conversion_days
    FROM affiliate_policy policy CROSS JOIN affiliate_products product
    WHERE policy.id = 1 AND product.id = ? AND product.mode = 'subscription'
  `, product).first();
}

export async function findAcquisition(db, orderId) {
  return statement(db, 'SELECT * FROM affiliate_acquisitions WHERE order_id = ?', orderId).first();
}

const acquisitionScope = (policy, product, owner) => policy.scope === 'global' ? owner : `${product}:${owner}`;

async function referralCandidate(db, request, policy, product, code) {
  if (code) {
    const normalized = code.trim().toUpperCase();
    if (!codePattern.test(normalized)) return null;
    return statement(db, `SELECT id AS affiliate_id, code, email_hash, NULL AS visit_id
      FROM affiliates WHERE code = ? AND active = 1`, normalized).first();
  }
  const visitId = cookieValue(request, referralCookie(product));
  if (!uuidPattern.test(visitId || '')) return null;
  return statement(db, `
    SELECT visit.id AS visit_id, visit.affiliate_id, affiliate.code, affiliate.email_hash
    FROM affiliate_visits visit JOIN affiliates affiliate ON affiliate.id = visit.affiliate_id
    WHERE visit.id = ? AND visit.product_id = ? AND visit.visited_at >= ? AND affiliate.active = 1
  `, visitId, product, Date.now() - policy.referral_days * day).first();
}

async function savedReferral(db, product, owner) {
  return statement(db, `
    SELECT attribution.*, affiliate.code, affiliate.email_hash, affiliate.active
    FROM affiliate_attributions attribution JOIN affiliates affiliate ON affiliate.id = attribution.affiliate_id
    WHERE attribution.owner_id = ? AND attribution.product_id = ?
  `, owner, product).first();
}

function conversionDeadline(policy, signupAt) {
  const start = Date.parse(signupAt);
  if (!Number.isFinite(start) || start > Date.now() || !policy.conversion_days) return null;
  return start + policy.conversion_days * day;
}

async function saveReferral(db, policy, product, owner, candidate, source, deadline) {
  const now = Date.now();
  if (!deadline || deadline <= now) return null;
  await statement(db, `
    INSERT INTO affiliate_attributions (owner_id, product_id, affiliate_id, visit_id, source, policy_version, saved_at, expires_at)
    SELECT ?, ?, id, ?, ?, ?, ?, ? FROM affiliates
    WHERE id = ? AND active = 1 AND NOT EXISTS (
      SELECT 1 FROM affiliate_acquisitions WHERE scope_key = ? AND state <> 'failed'
    ) ON CONFLICT (owner_id, product_id) DO NOTHING
  `, owner, product, candidate.visit_id, source, policy.version, now, deadline,
  candidate.affiliate_id, acquisitionScope(policy, product, owner)).run();
  return savedReferral(db, product, owner);
}

export async function acquisitionQuote(db, request, policy, cart, account, manualCode) {
  const ownerId = account.owner_id;
  const scopeKey = acquisitionScope(policy, cart.module, ownerId);
  const now = Date.now();
  await statement(db, "UPDATE affiliate_acquisitions SET state = 'failed' WHERE scope_key = ? AND state = 'reserved' AND quote_expires < ?", scopeKey, now).run();
  const previous = await statement(db, "SELECT * FROM affiliate_acquisitions WHERE scope_key = ? AND state <> 'failed'", scopeKey).first();
  if (previous) {
    if (previous.order_id === cart.orderId) {
      if (previous.owner_id !== ownerId || previous.store_id !== account.store_id
        || previous.product_id !== cart.module || previous.tier !== cart.tier
        || previous.period !== cart.period || previous.list_amount !== cart.amount) return { kind: 'conflict' };
      return { kind: 'existing', acquisition: previous };
    }
    return { kind: ['paid', 'settled', 'reversed'].includes(previous.state) ? 'ineligible' : 'conflict', acquisition: previous };
  }
  const ownerEmailHash = await emailHash(account.email);
  const deadline = conversionDeadline(policy, account.affiliate_signup_at);
  let saved = await savedReferral(db, cart.module, ownerId);
  let referral = saved || await referralCandidate(db, request, policy, cart.module, manualCode);
  let error;
  if (!saved && referral && referral.email_hash !== ownerEmailHash && policy.conversion_days) {
    saved = await saveReferral(db, policy, cart.module, ownerId, referral, manualCode ? 'checkout_code' : 'checkout_link', deadline);
    if (!saved && deadline > now) return { kind: 'conflict' };
    if (!saved) { referral = null; error = 'Masa berlaku kode afiliasi sudah berakhir atau belum dapat diperiksa.'; }
    referral = saved;
  }
  if (saved && (!saved.active || saved.expires_at <= now)) error = 'Kode afiliasi yang tersimpan sudah tidak berlaku.';
  if (!error && (referral?.email_hash === ownerEmailHash || manualCode && !referral)) error = 'Kode afiliasi tidak dapat digunakan.';
  const referred = referral && !error;
  return { kind: 'new', code: referred ? referral.code : null, error, canEnterCode: Boolean(deadline > now && !saved), acquisition: {
    order_id: cart.orderId, scope_key: scopeKey, product_id: cart.module, owner_id: ownerId, store_id: account.store_id,
    affiliate_id: referred ? referral.affiliate_id : null, visit_id: referred ? referral.visit_id : null,
    policy_version: policy.version, tier: cart.tier, period: cart.period, list_amount: cart.amount,
    monthly_amount: cart.monthlyAmount, charged_amount: cart.amount - (referred ? tenPercent(cart.amount) : 0),
    quote_expires: cart.expires, ownerEmailHash, savedAffiliateId: referred && saved ? referral.affiliate_id : '',
  } };
}

export async function reserveAcquisition(db, acquisition) {
  const { order_id, scope_key, product_id, owner_id, store_id, affiliate_id, visit_id, policy_version,
    tier, period, list_amount, monthly_amount, charged_amount, quote_expires, ownerEmailHash, savedAffiliateId } = acquisition;
  const result = await statement(db, `
    INSERT INTO affiliate_acquisitions (order_id, scope_key, product_id, owner_id, store_id, affiliate_id, visit_id,
      policy_version, tier, period, list_amount, monthly_amount, charged_amount, quote_expires, state)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved'
    WHERE COALESCE((
      SELECT attribution.affiliate_id FROM affiliate_attributions attribution JOIN affiliates affiliate ON affiliate.id = attribution.affiliate_id
      WHERE attribution.owner_id = ? AND attribution.product_id = ?
        AND attribution.expires_at > ? AND affiliate.active = 1 AND affiliate.email_hash <> ?
    ), '') = ?
    ON CONFLICT DO NOTHING
  `, order_id, scope_key, product_id, owner_id, store_id, affiliate_id, visit_id,
  policy_version, tier, period, list_amount, monthly_amount, charged_amount, quote_expires,
  owner_id, product_id, Date.now(), ownerEmailHash, savedAffiliateId).run();
  return result.meta.changes === 1;
}

export async function claimAcquisitionInvoice(db, orderId) {
  const result = await statement(db, `
    UPDATE affiliate_acquisitions SET state = 'requested'
    WHERE order_id = ? AND state = 'reserved' AND quote_expires >= ?
  `, orderId, Date.now()).run();
  return result.meta.changes === 1;
}

// Only callers that read the provider directly may supply invoice observations.
// D1 batches make the status change and its immutable ledger entry atomic.
export async function observeAcquisition(db, acquisition, invoice, transaction = null) {
  const order = acquisition.order_id;
  let status = verifiedInvoiceStatus(invoice, { orderId: order, amount: acquisition.charged_amount });
  const matchingPayment = status === 'paid' && transaction?.reference_id === order && transaction.type === 'PAYMENT'
    && transaction.currency === 'IDR' && transaction.amount === acquisition.charged_amount && transaction.cashflow === 'MONEY_IN'
    && typeof transaction.id === 'string' && transaction.id.length > 0
    && (!invoice.payment_id || invoice.payment_id === transaction.product_id);
  if (matchingPayment && transaction.status === 'REVERSED') status = 'refunded';
  const evidence = matchingPayment ? transaction.id : invoice?.id ?? null;
  if (status === 'paid') {
    const settled = invoice.status === 'SETTLED'
      || matchingPayment && transaction.status === 'SUCCESS' && ['SETTLED', 'EARLY_SETTLED'].includes(transaction.settlement_status);
    const paidAt = new Date(invoice.paid_at).toISOString();
    const records = [statement(db, `
      UPDATE affiliate_acquisitions SET state = ?, paid_at = COALESCE(paid_at, ?)
      WHERE order_id = ? AND state IN ('requested', 'paid')
    `, settled ? 'settled' : 'paid', paidAt, order)];
    if (settled) records.push(statement(db, `
      INSERT INTO affiliate_ledger (order_id, affiliate_id, product_id, kind, amount, provider_reference, recorded_at)
      SELECT sale.order_id, sale.affiliate_id, sale.product_id, 'commission', ?, ?, ?
      FROM affiliate_acquisitions sale LEFT JOIN affiliate_attributions attribution
        ON attribution.owner_id = sale.owner_id AND attribution.product_id = sale.product_id
      WHERE sale.order_id = ? AND sale.state = 'settled' AND sale.affiliate_id IS NOT NULL
        AND (attribution.owner_id IS NULL OR ? < attribution.expires_at)
      ON CONFLICT (order_id, kind) DO NOTHING
    `, tenPercent(acquisition.monthly_amount), evidence, Date.now(), order, Date.parse(paidAt)));
    await db.batch(records);
  } else if (status === 'failed') {
    await statement(db, "UPDATE affiliate_acquisitions SET state = 'failed' WHERE order_id = ? AND state = 'requested'", order).run();
  } else if (status === 'refunded') {
    await db.batch([
      statement(db, "UPDATE affiliate_acquisitions SET state = 'reversed' WHERE order_id = ? AND state IN ('requested', 'paid', 'settled')", order),
      statement(db, `
        INSERT INTO affiliate_ledger (order_id, affiliate_id, product_id, kind, amount, provider_reference, recorded_at)
        SELECT entry.order_id, entry.affiliate_id, entry.product_id, 'reversal', -entry.amount, ?, ?
        FROM affiliate_ledger entry JOIN affiliate_acquisitions sale ON sale.order_id = entry.order_id
        WHERE entry.order_id = ? AND entry.kind = 'commission' AND sale.state = 'reversed'
        ON CONFLICT (order_id, kind) DO NOTHING
      `, evidence, Date.now(), order),
    ]);
  }
  const saved = await findAcquisition(db, order);
  if (status === 'unverified' || !invoice) return { status, paidAt: null };
  if (saved.state === 'reversed') return { status: 'refunded', paidAt: null };
  if (saved.state === 'failed') return { status: 'failed', paidAt: null };
  if (saved.paid_at && ['paid', 'settled'].includes(saved.state)) return { status: 'paid', paidAt: saved.paid_at };
  return { status: 'pending', paidAt: null };
}

async function reconcileAcquisition(db, env, acquisition, verifySettlement) {
  const orderId = acquisition.order_id;
  const invoice = await findInvoice(env, orderId);
  let transaction = null;
  // A settled transaction can later be reversed even if the invoice remains
  // SETTLED, so continue checking it throughout reconciliation.
  if (['PAID', 'SETTLED'].includes(invoice?.status) && verifySettlement) {
    const query = new URLSearchParams({ types: 'PAYMENT', reference_id: orderId, currency: 'IDR', limit: '10' });
    const transactions = await xenditRequest({ XENDIT_SECRET_KEY: env.AFFILIATE_XENDIT_KEY || env.XENDIT_SECRET_KEY }, '/transactions?' + query);
    const records = transactions.has_more === false && Array.isArray(transactions.data)
      ? transactions.data.filter(item => item.reference_id === orderId) : [];
    if (records.length === 1) transaction = records[0];
  }
  const result = await observeAcquisition(db, acquisition, invoice, transaction);
  return { ...result, acquisitionState: (await findAcquisition(db, orderId)).state, invoiceStatus: invoice?.status || null };
}

// Called only by the scheduled Worker. Moving checked entries to the back of
// the queue makes retries bounded and prevents a failed invoice starving others.
export async function reconcileAffiliateBatch(env, now = Date.now(), limit = 25) {
  if (!env.AFFILIATE_DB || !env.XENDIT_SECRET_KEY || env.AFFILIATE_CHECKOUT !== 'on') return { checked: 0, failed: 0 };
  const db = env.AFFILIATE_DB;
  const candidates = await statement(db, `SELECT * FROM affiliate_acquisitions
    WHERE affiliate_id IS NOT NULL AND state IN ('requested', 'paid', 'settled')
      AND reconciled_at <= ? ORDER BY reconciled_at, rowid LIMIT ?`, now - 3600000, limit).all();
  let failed = 0;
  for (const acquisition of candidates.results) {
    await statement(db, 'UPDATE affiliate_acquisitions SET reconciled_at = ? WHERE order_id = ?', now, acquisition.order_id).run();
    try { await reconcileAcquisition(db, env, acquisition, true); }
    catch { failed++; }
  }
  return { checked: candidates.results.length, failed };
}

const headers = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex',
};
const json = (value, status = 200) => Response.json(value, { status, headers });
const redirect = (location, setCookie) => new Response(null, { status: 303, headers: {
  ...headers, Location: location, ...(setCookie ? { 'Set-Cookie': setCookie } : {}),
} });

async function trialReferral(request, env, url) {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  const product = url.searchParams.get('product');
  const host = subscriptionBackendHost(env, product);
  const policy = host && await checkoutPolicy(env, product);
  if (!policy?.conversion_days) return json({ available: false, code: null });
  const manualCode = request.headers.get('X-Affiliate-Code')?.trim();
  const candidate = await referralCandidate(env.AFFILIATE_DB, request, policy, product, manualCode);
  if (request.method === 'GET') return json({ available: true, code: candidate?.code || null });
  if (request.headers.get('Origin') !== url.origin) return json({ error: 'Permintaan tidak valid.' }, 403);
  if (!candidate) return json({ available: true, code: null }, manualCode ? 422 : 200);
  const authorization = request.headers.get('Authorization');
  if (!/^Bearer [a-zA-Z0-9_.-]{20,4096}$/.test(authorization || '')) return json({ error: 'Masuk sebagai pemilik terlebih dahulu.' }, 401);
  const response = await fetch(`https://${host}/api/auth/me`, {
    headers: { Authorization: authorization, 'X-DagangOS-Module': product },
    redirect: 'manual', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return json({ error: 'Akun pemilik belum dapat diperiksa.' }, response.status === 401 ? 401 : 503);
  const account = await response.json();
  if (account.role !== 'Owner' || account.is_store_owner !== true || account.current_module !== product || account.plan !== 'trial'
    || !uuidPattern.test(account.id || '') || typeof account.email !== 'string' || candidate.email_hash === await emailHash(account.email)) {
    return json({ error: 'Kode afiliasi tidak dapat digunakan untuk akun ini.' }, 422);
  }
  const deadline = conversionDeadline(policy, account.affiliate_signup_at);
  const saved = await saveReferral(env.AFFILIATE_DB, policy, product, account.id, candidate, manualCode ? 'signup_code' : 'signup_link', deadline);
  if (!saved || !saved.active || saved.expires_at <= Date.now()) return json({ error: 'Kode afiliasi tidak dapat disimpan.' }, 409);
  return json({ available: true, code: saved.code });
}

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | DagangOS</title>
    <link rel="icon" href="/assets/brand/dagangos-icon.png"><link rel="stylesheet" href="/affiliate.css">
    </head><body><header><a href="/"><img src="/assets/brand/dagangos-icon.png" alt="">DagangOS</a></header>
    <main><h1>${escape(title)}</h1>${body}</main></body></html>`, { status, headers: {
    ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  } });
}

async function activeProducts(db) {
  return (await db.prepare("SELECT id, name, mode FROM affiliate_products ORDER BY mode = 'upcoming', rowid").all()).results;
}

async function affiliateHome(db, request, env, status = 200) {
  const token = cookieValue(request, sessionCookie);
  const account = accessPattern.test(token || '') && await statement(db,
    'SELECT id, code, name FROM affiliates WHERE access_hash = ? AND active = 1', await hash(token)).first();
  const payoutPolicy = await db.prepare('SELECT minimum_idr, payout_day, wait_days FROM affiliate_payout_policy WHERE id = 1').first();
  const payoutInfo = payoutPolicy ? `<p>Ketentuan pembayaran komisi: saldo minimum ${rupiah(payoutPolicy.minimum_idr)},
    pembayaran bulanan setiap tanggal ${payoutPolicy.payout_day}, dan masa tunggu ${payoutPolicy.wait_days} hari sejak pembayaran pelanggan.
    Pembayaran komisi masih dalam persiapan dan belum berjalan otomatis.</p>` : '';
  if (!account) {
    return page('Program Afiliasi DagangOS', `<p>Satu akun afiliasi untuk membagikan produk DagangOS dan melihat hasil rujukan Anda.</p>
      <form method="post" action="${affiliateRoot}/login"><label for="access">Kode akses dasbor</label>
      <input id="access" name="access" type="password" autocomplete="current-password" maxlength="64" required>
      <button type="submit">Masuk ke dasbor</button></form>
      ${env.RESEND_API_KEY ? `<h2>Daftar afiliasi</h2><p>Verifikasi email Anda untuk membuat akun dan memperoleh kode afiliasi.</p>
      <form method="post" action="${affiliateRoot}/register"><label for="name">Nama</label>
      <input id="name" name="name" maxlength="100" required autocomplete="name">
      <label for="email">Email</label><input id="email" name="email" type="email" maxlength="254" required autocomplete="email">
      <button type="submit">Kirim tautan verifikasi</button></form>` : `<p>Untuk bergabung, hubungi <a href="mailto:contact@dagangos.com">tim DagangOS</a>.</p>`}${payoutInfo}`, status);
  }
  const [products, visits, ledger, bank] = await Promise.all([
    activeProducts(db),
    statement(db, 'SELECT product_id, COUNT(*) AS visits FROM affiliate_visits WHERE affiliate_id = ? GROUP BY product_id', account.id).all(),
    statement(db, `SELECT product_id, SUM(amount) AS total, SUM(kind = 'commission') AS conversions
      FROM affiliate_ledger WHERE affiliate_id = ? GROUP BY product_id`, account.id).all(),
    env.AFFILIATE_BANK_KEY ? statement(db, 'SELECT bank_code, last_four FROM affiliate_bank_destinations WHERE affiliate_id = ?', account.id).first() : null,
  ]);
  const stats = new Map(ledger.results.map(row => [row.product_id, row]));
  const traffic = new Map(visits.results.map(row => [row.product_id, row.visits]));
  const cards = products.map(product => {
    const title = escape(product.name);
    if (product.mode === 'upcoming') return `<article><h2>${title}</h2><p>Segera hadir</p></article>`;
    const link = `https://dagangos.com${affiliateRoot}/${account.code}/${product.id}`;
    const result = stats.get(product.id);
    return `<article><h2>${title}</h2><label for="link-${product.id}">Tautan rujukan</label>
      <input type="url" id="link-${product.id}" value="${escape(link)}" readonly>
      <dl><dt>Kunjungan</dt><dd>${traffic.get(product.id) ?? 0}</dd>
      ${product.mode === 'subscription' ? `<dt>Pembelian tercatat</dt><dd>${result?.conversions ?? 0}</dd>
      <dt>Komisi dalam peninjauan</dt><dd>${rupiah(result?.total ?? 0)}</dd>` : ''}</dl></article>`;
  }).join('');
  return page('Dasbor Afiliasi', `<div class="account"><p>${escape(account.name)} · Kode afiliasi <strong>${account.code}</strong></p>
    <form method="post" action="${affiliateRoot}/logout"><button type="submit">Keluar</button></form></div>
    ${payoutInfo}<div class="products">${cards}</div>
    ${env.AFFILIATE_BANK_KEY ? `<section><h2>Rekening komisi</h2>
      <p>${bank ? `Rekening tersimpan: ${escape(bank.bank_code)} ···· ${escape(bank.last_four)}.` : 'Belum ada rekening tersimpan.'}
      Rekening dan komisi perlu ditinjau sebelum pembayaran dapat dilakukan.</p>
      <form method="post" action="${affiliateRoot}/bank"><label for="bank-email">Email akun afiliasi</label>
      <input id="bank-email" name="email" type="email" maxlength="254" required>
      <label for="bank-code">Bank</label><select id="bank-code" name="bank" required>
      <option value="ID_BCA">BCA</option><option value="ID_BRI">BRI</option><option value="ID_BNI">BNI</option>
      <option value="ID_MANDIRI">Mandiri</option><option value="ID_PERMATA">Permata</option></select>
      <label for="bank-name">Nama pemilik rekening</label><input id="bank-name" name="account_name" maxlength="100" required autocomplete="off">
      <label for="bank-number">Nomor rekening</label><input id="bank-number" name="account_number" maxlength="24" inputmode="numeric" required autocomplete="off">
      <button type="submit">Verifikasi rekening melalui email</button></form></section>` : ''}`);
}

async function sessionAccount(db, request) {
  const token = cookieValue(request, sessionCookie);
  return accessPattern.test(token || '') ? statement(db,
    'SELECT id, email_hash FROM affiliates WHERE access_hash = ? AND active = 1', await hash(token)).first() : null;
}

async function encryptBankDetails(keyText, affiliateId, details) {
  let bytes;
  try { bytes = Uint8Array.from(atob(keyText), character => character.charCodeAt(0)); } catch { throw new Error('Invalid bank key'); }
  if (bytes.length !== 32) throw new Error('Invalid bank key');
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv:nonce, additionalData:new TextEncoder().encode(affiliateId)}, key,
    new TextEncoder().encode(JSON.stringify(details)));
  return { nonce:hex(nonce), encrypted:hex(new Uint8Array(encrypted)) };
}

async function requestBankChange(db, request, env, url) {
  if (request.method !== 'POST') return redirect(affiliateRoot);
  if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
  const account = await sessionAccount(db, request);
  if (!account) return page('Masuk terlebih dahulu', `<a href="${affiliateRoot}">Masuk</a>`, 401);
  if (!env.AFFILIATE_BANK_KEY || !env.RESEND_API_KEY) return page('Rekening belum tersedia', '<p>Silakan coba lagi nanti.</p>', 503);
  const raw = await request.text();
  if (raw.length > 2048) return page('Permintaan tidak valid', '', 413);
  const form = new URLSearchParams(raw);
  const email = (form.get('email') || '').trim().toLowerCase();
  const bank = form.get('bank');
  const name = (form.get('account_name') || '').trim();
  const number = (form.get('account_number') || '').trim();
  if (email.length > 254 || await emailHash(email) !== account.email_hash || !['ID_BCA','ID_BRI','ID_BNI','ID_MANDIRI','ID_PERMATA'].includes(bank)
    || !name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name) || !/^[0-9]{6,24}$/.test(number)) {
    return page('Periksa data rekening', `<p>Pastikan email, bank, nama, dan nomor rekening benar.</p><a href="${affiliateRoot}">Kembali</a>`, 400);
  }
  const now=Date.now();
  if (!await enrollmentLimit(db, `bank:${account.id}`, now, 3)) return page('Terlalu banyak permintaan', '<p>Tunggu satu jam sebelum mencoba lagi.</p>', 429);
  await statement(db, 'DELETE FROM affiliate_bank_change_requests WHERE expires_at < ?', now - day).run();
  const details = await encryptBankDetails(env.AFFILIATE_BANK_KEY, account.id, {name, number});
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await statement(db, `INSERT INTO affiliate_bank_change_requests
    (token_hash, affiliate_id, bank_code, last_four, encrypted_details, nonce, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, await hash(token), account.id, bank, number.slice(-4), details.encrypted, details.nonce, now, now + 30*60000).run();
  const response=await fetch('https://api.resend.com/emails', {method:'POST', redirect:'manual', signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`, 'Content-Type':'application/json'},
    body:JSON.stringify({from:'DagangOS <contact@dagangos.com>',to:[email],subject:'Verifikasi rekening afiliasi DagangOS',
      text:`Untuk memverifikasi perubahan rekening afiliasi, buka tautan ini pada browser yang sama dalam 30 menit:\n\n${url.origin}${affiliateRoot}/bank/verify/${token}\n\nJika Anda tidak meminta perubahan, abaikan email ini.`})});
  if (!response.ok) return page('Email belum dapat dikirim', '<p>Silakan coba lagi nanti.</p>', 503);
  return page('Periksa email Anda', '<p>Buka tautan verifikasi rekening di browser ini dalam 30 menit.</p>');
}

async function verifyBankChange(db, request, url, token) {
  const account = await sessionAccount(db, request);
  if (!account) return page('Masuk terlebih dahulu', `<a href="${affiliateRoot}">Masuk</a>`, 401);
  if (!token && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
    const raw=await request.text();if(raw.length>256)return page('Permintaan tidak valid','',413);
    token=new URLSearchParams(raw).get('token');
  }
  if (!accessPattern.test(token || '')) return page('Tautan tidak valid', '', 404);
  const tokenHash=await hash(token);const now=Date.now();
  if (request.method==='GET' || request.method==='HEAD') {
    const pending=await statement(db, `SELECT token_hash FROM affiliate_bank_change_requests
      WHERE token_hash = ? AND affiliate_id = ? AND consumed_at IS NULL AND expires_at > ?`, tokenHash, account.id, now).first();
    const response=pending ? page('Verifikasi rekening', `<p>Konfirmasi perubahan rekening untuk akun afiliasi ini.</p>
      <form method="post" action="${affiliateRoot}/bank/verify"><input type="hidden" name="token" value="${token}"><button type="submit">Simpan rekening</button></form>`)
      : page('Tautan kedaluwarsa', `<p>Minta tautan baru di dasbor.</p><a href="${affiliateRoot}">Kembali</a>`, 410);
    response.headers.set('Referrer-Policy','origin');return response;
  }
  if(request.method!=='POST')return page('Metode tidak didukung','',405);
  if(request.headers.get('Origin')!==url.origin)return page('Permintaan tidak valid','',403);
  const results=await db.batch([
    statement(db, `INSERT INTO affiliate_bank_destinations (affiliate_id, bank_code, last_four, encrypted_details, nonce, updated_at)
      SELECT affiliate_id, bank_code, last_four, encrypted_details, nonce, ? FROM affiliate_bank_change_requests
      WHERE token_hash = ? AND affiliate_id = ? AND consumed_at IS NULL AND expires_at > ?
      ON CONFLICT(affiliate_id) DO UPDATE SET bank_code=excluded.bank_code, last_four=excluded.last_four,
        encrypted_details=excluded.encrypted_details, nonce=excluded.nonce, updated_at=excluded.updated_at`, now, tokenHash, account.id, now),
    statement(db, `UPDATE affiliate_bank_change_requests SET consumed_at = ? WHERE affiliate_id = ? AND consumed_at IS NULL
      AND EXISTS (SELECT 1 FROM affiliate_bank_change_requests WHERE token_hash = ? AND affiliate_id = ? AND consumed_at IS NULL AND expires_at > ?)`,
      now, account.id, tokenHash, account.id, now),
  ]);
  return results[0].meta.changes === 1 ? page('Rekening tersimpan', `<p>Rekening Anda tersimpan dan menunggu peninjauan.</p><a href="${affiliateRoot}">Kembali ke dasbor</a>`)
    : page('Tautan kedaluwarsa', `<p>Minta tautan baru di dasbor.</p><a href="${affiliateRoot}">Kembali</a>`, 410);
}

async function enrollmentLimit(db, bucket, now, maximum) {
  const key = await hash(bucket);
  const result = await statement(db, `INSERT INTO affiliate_enrollment_limits (bucket_hash, created_at)
    SELECT ?, ? WHERE (SELECT COUNT(*) FROM affiliate_enrollment_limits WHERE bucket_hash = ? AND created_at > ?) < ?`,
  key, now, key, now - 3600000, maximum).run();
  return result.meta.changes === 1;
}

async function registerAffiliate(db, request, env, url) {
  if (request.method !== 'POST') return redirect(affiliateRoot);
  if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', `<a href="${affiliateRoot}">Kembali</a>`, 403);
  if (!env.RESEND_API_KEY) return page('Pendaftaran belum tersedia', `<p>Silakan hubungi tim DagangOS.</p>`, 503);
  const raw = await request.text();
  if (raw.length > 2048) return page('Permintaan tidak valid', `<a href="${affiliateRoot}">Kembali</a>`, 413);
  const form = new URLSearchParams(raw);
  const name = (form.get('name') || '').trim();
  const email = (form.get('email') || '').trim().toLowerCase();
  if (!name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return page('Periksa data pendaftaran', `<p>Masukkan nama dan alamat email yang valid.</p><a href="${affiliateRoot}">Kembali</a>`, 400);
  }
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 64) return page('Pendaftaran belum tersedia', '<p>Silakan coba lagi nanti.</p>', 503);
  const now = Date.now();
  await db.batch([
    statement(db, 'DELETE FROM affiliate_enrollment_limits WHERE created_at < ?', now - day),
    statement(db, 'DELETE FROM affiliate_verification_requests WHERE expires_at < ?', now - day),
  ]);
  const emailKey = await emailHash(email);
  if (!await enrollmentLimit(db, `ip:${ip}`, now, 20) || !await enrollmentLimit(db, `email:${emailKey}`, now, 3)) {
    return page('Terlalu banyak permintaan', '<p>Tunggu satu jam sebelum mencoba lagi.</p>', 429);
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await statement(db, `INSERT INTO affiliate_verification_requests
    (token_hash, email_hash, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
  await hash(token), emailKey, name, now, now + 30 * 60000).run();
  const verifyUrl = `${url.origin}${affiliateRoot}/verify/${token}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'DagangOS <contact@dagangos.com>', to: [email],
      subject: 'Verifikasi email Program Afiliasi DagangOS',
      text: `Untuk memverifikasi email Program Afiliasi DagangOS, buka tautan ini dalam 30 menit:\n\n${verifyUrl}\n\nJika Anda tidak meminta ini, abaikan email ini.` }),
  });
  if (!response.ok) return page('Email belum dapat dikirim', '<p>Silakan coba lagi nanti.</p>', 503);
  return page('Periksa email Anda', '<p>Jika alamat dapat menerima email, tautan verifikasi akan dikirim. Tautan berlaku selama 30 menit.</p>');
}

async function verifyAffiliate(db, request, url, token) {
  if (!token && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
    const raw = await request.text();
    if (raw.length > 256) return page('Permintaan tidak valid', '', 413);
    token = new URLSearchParams(raw).get('token');
  }
  if (!accessPattern.test(token || '')) return page('Tautan tidak valid', `<a href="${affiliateRoot}">Kembali</a>`, 404);
  const tokenHash = await hash(token);
  const now = Date.now();
  if (request.method === 'GET' || request.method === 'HEAD') {
    const pending = await statement(db, `SELECT token_hash FROM affiliate_verification_requests
      WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`, tokenHash, now).first();
    const response = pending ? page('Verifikasi email', `<p>Klik untuk menyelesaikan verifikasi email Anda.</p>
      <form method="post" action="${affiliateRoot}/verify"><input type="hidden" name="token" value="${token}"><button type="submit">Verifikasi email</button></form>`)
      : page('Tautan kedaluwarsa', `<p>Minta tautan baru di halaman afiliasi.</p><a href="${affiliateRoot}">Kembali</a>`, 410);
    response.headers.set('Referrer-Policy', 'origin');
    return response;
  }
  if (request.method !== 'POST') return page('Metode tidak didukung', '', 405);
  if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
  const pending = await statement(db, `UPDATE affiliate_verification_requests SET consumed_at = ?
    WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING email_hash, name`, now, tokenHash, now).first();
  if (!pending) return page('Tautan kedaluwarsa', `<p>Minta tautan baru di halaman afiliasi.</p><a href="${affiliateRoot}">Kembali</a>`, 410);
  await statement(db, 'UPDATE affiliate_verification_requests SET consumed_at = ? WHERE email_hash = ? AND consumed_at IS NULL', now, pending.email_hash).run();
  const access = hex(crypto.getRandomValues(new Uint8Array(32)));
  const code = hex(crypto.getRandomValues(new Uint8Array(8))).toUpperCase();
  const account = await statement(db, `INSERT INTO affiliates (id, code, name, email_hash, access_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email_hash) DO UPDATE SET access_hash = excluded.access_hash
    WHERE affiliates.active = 1 RETURNING code`, crypto.randomUUID(), code, pending.name, pending.email_hash, await hash(access), now).first();
  if (!account) return page('Akun dalam peninjauan', '<p>Hubungi tim DagangOS untuk bantuan.</p>', 403);
  const response = page('Email terverifikasi', `<p>Akun afiliasi siap digunakan. Kode afiliasi Anda: <strong>${escape(account.code)}</strong>.</p>
    <p>Simpan kode akses dasbor ini di tempat aman. Kode akses berbeda dari kode afiliasi dan hanya ditampilkan sekarang.</p>
    <label for="new-access">Kode akses dasbor</label><input id="new-access" value="${access}" readonly>
    <p>Jika kode akses hilang, verifikasi email yang sama kembali untuk membuat kode akses baru.</p><p><a href="${affiliateRoot}">Buka dasbor</a></p>`);
  response.headers.append('Set-Cookie', cookie(sessionCookie, access, affiliateRoot));
  return response;
}

function productDestination(destination, origin) {
  try {
    const url = new URL(destination, origin);
    const ownPath = destination.startsWith('/') && url.origin === origin;
    const dagangosHost = url.protocol === 'https:' && (url.hostname === 'dagangos.com' || url.hostname.endsWith('.dagangos.com'));
    return (ownPath || dagangosHost) && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

async function visitProduct(db, request, code, product) {
  const data = await statement(db, `SELECT affiliate.id AS affiliate_id, product.destination, product.handoff_path,
    (SELECT referral_days FROM affiliate_policy WHERE id = 1) AS referral_days
    FROM affiliates affiliate CROSS JOIN affiliate_products product
    WHERE affiliate.code = ? AND affiliate.active = 1 AND product.id = ? AND product.mode <> 'upcoming'`, code, product).first();
  const destination = data && productDestination(data.destination, new URL(request.url).origin);
  if (!destination) return page('Tautan rujukan tidak ditemukan', '<p><a href="/produk">Lihat produk DagangOS</a></p>', 404);
  if (request.method === 'HEAD') return redirect(destination.href);
  const visitId = crypto.randomUUID();
  await statement(db, 'INSERT INTO affiliate_visits (id, affiliate_id, product_id, visited_at) VALUES (?, ?, ?, ?)',
    visitId, data.affiliate_id, product, Date.now()).run();
  const sameOrigin = destination.origin === new URL(request.url).origin;
  if (!sameOrigin && /^\/api\/[a-z0-9/-]+$/.test(data.handoff_path || '')) {
    const handoff = new URL(data.handoff_path, destination.origin);
    handoff.searchParams.set('visit', visitId);
    if (data.referral_days) handoff.searchParams.set('days', data.referral_days);
    return redirect(handoff.href);
  }
  return redirect(destination.href, sameOrigin ? cookie(referralCookie(product), visitId, '/',
    data.referral_days ? data.referral_days * day / 1000 : undefined) : null);
}

async function operatorApi(request, env, path) {
  if (!equalToken(request.headers.get('Authorization'), env.AFFILIATE_ADMIN_TOKEN && `Bearer ${env.AFFILIATE_ADMIN_TOKEN}`)) return json({ error: 'Forbidden' }, 403);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const raw = await request.text();
  if (raw.length > 4096) return json({ error: 'Request too large' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const db = env.AFFILIATE_DB;
  if (path === '/api/affiliate/admin/reconcile') {
    const orderId = data?.orderId;
    if (typeof orderId !== 'string' || !/^DG-[a-z0-9-]+-[a-f0-9]{32}$/.test(orderId)) return json({ error: 'Invalid order ID' }, 400);
    const acquisition = await findAcquisition(db, orderId);
    if (!acquisition) return json({ error: 'Order not found' }, 404);
    return json(await reconcileAcquisition(db, env, acquisition, data?.verifySettlement === true));
  }
  const code = typeof data?.code === 'string' ? data.code.trim().toUpperCase() : '';
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  const email = typeof data?.email === 'string' ? data.email.trim() : '';
  if (!codePattern.test(code) || !name || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Provide a valid name, verified email and affiliate code (8–24 letters and digits)' }, 400);
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const result = await statement(db, `
    INSERT INTO affiliates (id, code, name, email_hash, access_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
  `, crypto.randomUUID(), code, name, await emailHash(email), await hash(token), Date.now()).run();
  if (!result.meta.changes) return json({ error: 'Code or email already registered' }, 409);
  return json({ code, dashboard: `https://dagangos.com${affiliateRoot}`, accessCode: token }, 201);
}

async function affiliateRequest(request, env, url, path, admin) {
  if (admin) return operatorApi(request, env, path);
  const db = env.AFFILIATE_DB;
  if (path === `${affiliateRoot}/register`) return registerAffiliate(db, request, env, url);
  if (path === `${affiliateRoot}/verify` || path.startsWith(`${affiliateRoot}/verify/`)) return verifyAffiliate(db, request, url, path.slice(`${affiliateRoot}/verify/`.length));
  if (path === `${affiliateRoot}/bank`) return requestBankChange(db, request, env, url);
  if (path === `${affiliateRoot}/bank/verify` || path.startsWith(`${affiliateRoot}/bank/verify/`)) return verifyBankChange(db, request, url, path.slice(`${affiliateRoot}/bank/verify/`.length));
  if (path === `${affiliateRoot}/login` || path === `${affiliateRoot}/logout`) {
    if (request.method !== 'POST') return redirect(affiliateRoot);
    if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', `<a href="${affiliateRoot}">Kembali</a>`, 403);
    if (path.endsWith('/logout')) return redirect(affiliateRoot, cookie(sessionCookie, '', affiliateRoot, 0));
    const raw = await request.text();
    const token = raw.length <= 256 && new URLSearchParams(raw).get('access');
    const account = accessPattern.test(token || '') && await statement(db,
      'SELECT id FROM affiliates WHERE access_hash = ? AND active = 1', await hash(token)).first();
    return account ? redirect(affiliateRoot, cookie(sessionCookie, token, affiliateRoot))
      : page('Kode akses tidak valid', `<p><a href="${affiliateRoot}">Coba lagi</a></p>`, 401);
  }
  if (!['GET', 'HEAD'].includes(request.method)) return page('Metode tidak didukung', `<a href="${affiliateRoot}">Kembali</a>`, 405);
  if (path === affiliateRoot) return affiliateHome(db, request, env);
  const [, , rawCode, product, extra] = path.split('/');
  const code = rawCode?.toUpperCase();
  if (!codePattern.test(code || '') || extra !== undefined) return page('Tautan rujukan tidak ditemukan', '<a href="/produk">Lihat produk DagangOS</a>', 404);
  if (productPattern.test(product || '')) return visitProduct(db, request, code, product);
  const account = !product && await statement(db, 'SELECT id FROM affiliates WHERE code = ? AND active = 1', code).first();
  if (!account) return page('Tautan rujukan tidak ditemukan', '<a href="/produk">Lihat produk DagangOS</a>', 404);
  const products = (await activeProducts(db)).filter(item => item.mode !== 'upcoming');
  return page('Pilih produk DagangOS', `<ul>${products.map(item => `<li><a href="${affiliateRoot}/${code}/${item.id}">${escape(item.name)}</a></li>`).join('')}</ul>`);
}

export async function handleAffiliate(request, env) {
  const url = new URL(request.url);
  const requestedPath = url.pathname.replace(/\/$/, '');
  if (requestedPath === legacyAffiliateRoot && ['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 308, headers: { ...headers, Location: affiliateRoot + url.search } });
  }
  const path = requestedPath.startsWith(`${legacyAffiliateRoot}/`)
    ? affiliateRoot + requestedPath.slice(legacyAffiliateRoot.length) : requestedPath;
  if (path === '/api/affiliate/signup') {
    try {
      return await trialReferral(request, env, url);
    } catch {
      return json({ error: 'Kode afiliasi belum dapat diperiksa.' }, 503);
    }
  }
  const admin = ['/api/affiliate/admin/accounts', '/api/affiliate/admin/reconcile'].includes(path);
  if (!admin && path !== affiliateRoot && !path.startsWith(`${affiliateRoot}/`)) return null;
  if (env.AFFILIATE_DB) {
    try {
      return await affiliateRequest(request, env, url, path, admin);
    } catch (error) {
      // SQL, credentials, and operator or customer input belong outside responses.
      console.error('Affiliate request failed', { operation: admin ? 'operator' : 'portal', type: error?.name });
    }
  }
  return admin ? json({ error: 'Affiliate program unavailable' }, 503)
    : page('Program Afiliasi DagangOS', '<p>Program belum tersedia.</p><p><a href="/produk">Lihat produk DagangOS</a></p>', 503);
}
