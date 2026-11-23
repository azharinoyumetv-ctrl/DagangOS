import { equalToken, findCheckoutPayment, subscriptionReference, verifiedInvoiceStatus, xenditRequest } from './xendit-payments.js';
import { subscriptionBackendHost } from './subscription-products.js';
import { reviewAffiliatePayout, availableSql, cutoff } from './affiliate-payout-review.js';
import { decryptDestination } from './affiliate-payout-execute.js';
import { AFFILIATE_AGREEMENT_VERSION, AFFILIATE_AGREEMENT_PATH, AFFILIATE_AGREEMENT_BODY } from './affiliate-terms.js';

const day = 86400000;
const affiliateRoot = '/affiliate-program';
const legacyAffiliateRoot = '/affiliate';
const accessPattern = /^[a-f0-9]{64}$/;
const productPattern = /^[a-z][a-z0-9-]{0,39}$/;
const codePattern = /^[A-Z0-9]{8,24}$/;
const reservedCodes = new Set(['DASHBOARD', 'REGISTER', 'RECOVER', 'VERIFY', 'LOGIN', 'LOGOUT', 'BANK', 'EXPORT', 'PEMBAYARAN', 'KODE']);
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const emailHash = email => hash(email.trim().toLowerCase());
// Gmail/Googlemail dots and plus tags address the same mailbox. Never apply
// these provider-specific rules to unrelated email domains.
const emailSignalHash = email => {
  let normalized=email.trim().toLowerCase();
  const at=normalized.lastIndexOf('@');
  const domain=normalized.slice(at+1);
  if (at>0 && ['gmail.com','googlemail.com'].includes(domain)) {
    normalized=`${normalized.slice(0,at).split('+')[0].replaceAll('.','')}@gmail.com`;
  }
  return hash(normalized);
};
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
    return statement(db, `SELECT affiliate.id AS affiliate_id, affiliate.code, affiliate.email_hash, signal.normalized_hash, NULL AS visit_id
      FROM affiliate_code_registry registry JOIN affiliates affiliate ON affiliate.id = registry.affiliate_id
      LEFT JOIN affiliate_email_signals signal ON signal.affiliate_id=affiliate.id
      WHERE registry.code = ? AND affiliate.active = 1`, normalized).first();
  }
  const visitId = cookieValue(request, referralCookie(product));
  if (!uuidPattern.test(visitId || '')) return null;
  return statement(db, `
    SELECT visit.id AS visit_id, visit.affiliate_id, affiliate.code, affiliate.email_hash, signal.normalized_hash
    FROM affiliate_visits visit JOIN affiliates affiliate ON affiliate.id = visit.affiliate_id
    LEFT JOIN affiliate_email_signals signal ON signal.affiliate_id=affiliate.id
    WHERE visit.id = ? AND visit.product_id = ? AND visit.visited_at >= ? AND affiliate.active = 1
  `, visitId, product, Date.now() - policy.referral_days * day).first();
}

async function savedReferral(db, product, owner) {
  return statement(db, `
    SELECT attribution.*, affiliate.code, affiliate.email_hash, affiliate.active, signal.normalized_hash
    FROM affiliate_attributions attribution JOIN affiliates affiliate ON affiliate.id = attribution.affiliate_id
    LEFT JOIN affiliate_email_signals signal ON signal.affiliate_id=affiliate.id
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
  const ownerSignalHash = await emailSignalHash(account.email);
  const deadline = conversionDeadline(policy, account.affiliate_signup_at);
  let saved = await savedReferral(db, cart.module, ownerId);
  let referral = saved || await referralCandidate(db, request, policy, cart.module, manualCode);
  let error;
  const selfReferral = referral && (referral.email_hash === ownerEmailHash || referral.normalized_hash === ownerSignalHash);
  if (!saved && referral && !selfReferral && policy.conversion_days) {
    saved = await saveReferral(db, policy, cart.module, ownerId, referral, manualCode ? 'checkout_code' : 'checkout_link', deadline);
    if (!saved && deadline > now) return { kind: 'conflict' };
    if (!saved) { referral = null; error = 'Masa berlaku kode afiliasi sudah berakhir atau belum dapat diperiksa.'; }
    referral = saved;
  }
  if (saved && (!saved.active || saved.expires_at <= now)) error = 'Kode afiliasi yang tersimpan sudah tidak berlaku.';
  if (!error && (selfReferral || manualCode && !referral)) error = 'Kode afiliasi tidak dapat digunakan.';
  const referred = referral && !error;
  return { kind: 'new', code: referred ? referral.code : null, error, canEnterCode: Boolean(deadline > now && !saved), acquisition: {
    order_id: cart.orderId, scope_key: scopeKey, product_id: cart.module, owner_id: ownerId, store_id: account.store_id,
    affiliate_id: referred ? referral.affiliate_id : null, visit_id: referred ? referral.visit_id : null,
    policy_version: policy.version, tier: cart.tier, period: cart.period, list_amount: cart.amount,
    monthly_amount: cart.monthlyAmount, charged_amount: cart.amount - (referred ? tenPercent(cart.amount) : 0),
    quote_expires: cart.expires, ownerEmailHash, ownerSignalHash, savedAffiliateId: referred && saved ? referral.affiliate_id : '',
  } };
}

export async function reserveAcquisition(db, acquisition) {
  const { order_id, scope_key, product_id, owner_id, store_id, affiliate_id, visit_id, policy_version,
    tier, period, list_amount, monthly_amount, charged_amount, quote_expires, ownerEmailHash, ownerSignalHash, savedAffiliateId } = acquisition;
  const result = await statement(db, `
    INSERT INTO affiliate_acquisitions (order_id, scope_key, product_id, owner_id, store_id, affiliate_id, visit_id,
      policy_version, tier, period, list_amount, monthly_amount, charged_amount, quote_expires, state)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved'
    WHERE COALESCE((
      SELECT attribution.affiliate_id FROM affiliate_attributions attribution JOIN affiliates affiliate ON affiliate.id = attribution.affiliate_id
      WHERE attribution.owner_id = ? AND attribution.product_id = ?
        AND attribution.expires_at > ? AND affiliate.active = 1 AND affiliate.email_hash <> ?
        AND NOT EXISTS (SELECT 1 FROM affiliate_email_signals signal WHERE signal.affiliate_id=affiliate.id AND signal.normalized_hash=?)
    ), '') = ?
    ON CONFLICT DO NOTHING
  `, order_id, scope_key, product_id, owner_id, store_id, affiliate_id, visit_id,
  policy_version, tier, period, list_amount, monthly_amount, charged_amount, quote_expires,
  owner_id, product_id, Date.now(), ownerEmailHash, ownerSignalHash, savedAffiliateId).run();
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
  const matchingPayment = status === 'paid' && transaction?.reference_id === (invoice.payment_reference || order) && transaction.type === 'PAYMENT'
    && transaction.currency === 'IDR' && transaction.amount === acquisition.charged_amount && transaction.cashflow === 'MONEY_IN'
    && typeof transaction.id === 'string' && transaction.id.length > 0
    && (!invoice.payment_id || invoice.payment_id === transaction.product_id);
  if (matchingPayment && (transaction.status === 'REVERSED'
    || transaction.refund_status === 'FULL' && transaction.amount_refunded_successfully === acquisition.charged_amount)) status = 'refunded';
  const evidence = matchingPayment ? transaction.id : invoice?.id ?? null;
  if (status === 'paid') {
    // Development-mode card payments have returned SUCCESSFUL even though the
    // transaction API documents SUCCESS. Both still require settled funds.
    const successfulTransaction = matchingPayment && ['SUCCESS', 'SUCCESSFUL'].includes(transaction.status);
    const settled = invoice.status === 'SETTLED'
      || successfulTransaction && ['SETTLED', 'EARLY_SETTLED'].includes(transaction.settlement_status);
    const paidAt = new Date(invoice.paid_at).toISOString();
    const records = [statement(db, `
      UPDATE affiliate_acquisitions SET state = ?, paid_at = COALESCE(paid_at, ?)
      WHERE order_id = ? AND state IN ('requested', 'paid')
    `, settled ? 'settled' : 'paid', paidAt, order)];
    // A settled payment can still be refunded or reversed. Do not mark it
    // payout-verifiable unless the provider explicitly reports no such activity.
    const noRefund = transaction?.refund_status === 'NONE' && transaction?.amount_refunded_successfully === 0;
    // The owner decided that a completed partial refund of an annual purchase
    // leaves its original first-month commission unchanged. Pending, full,
    // inconsistent, or monthly partial refunds remain held or reversed.
    const completedAnnualPartial = acquisition.period === 'yearly' && transaction?.refund_status === 'PARTIAL'
      && Number.isSafeInteger(transaction?.amount_refunded_successfully) && transaction.amount_refunded_successfully > 0
      && transaction.amount_refunded_successfully < acquisition.charged_amount;
    const cleanTransaction = (noRefund || completedAnnualPartial)
      && transaction?.reversal_status === 'NONE' && transaction?.reversal_amount_successful === 0;
    if (successfulTransaction
      && ['SETTLED', 'EARLY_SETTLED'].includes(transaction.settlement_status)) records.push(statement(db, `
      UPDATE affiliate_acquisitions SET settlement_verified_at = ? WHERE order_id = ? AND state = 'settled'
    `, cleanTransaction ? Date.now() : 0, order));
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

export async function reconcileAcquisition(db, env, acquisition, verifySettlement) {
  const orderId = acquisition.order_id;
  const invoice = await findCheckoutPayment(env, { orderId, amount: acquisition.charged_amount }, db);
  let transaction = null;
  // A settled transaction can later be reversed even if the invoice remains
  // SETTLED, so continue checking it throughout reconciliation.
  if (['PAID', 'SETTLED'].includes(invoice?.status) && verifySettlement) {
    const identity = invoice.payment_reference ? { product_id: invoice.payment_id } : { reference_id: orderId };
    const reference = invoice.payment_reference || orderId;
    const query = new URLSearchParams({ types: 'PAYMENT', ...identity, currency: 'IDR', limit: '10' });
    const transactions = await xenditRequest({ XENDIT_SECRET_KEY: env.AFFILIATE_XENDIT_KEY || env.XENDIT_SECRET_KEY }, '/transactions?' + query);
    const records = transactions.has_more === false && Array.isArray(transactions.data)
      ? transactions.data.filter(item => item.reference_id === reference && (!invoice.payment_reference || item.product_id === invoice.payment_id)) : [];
    if (records.length === 1) transaction = records[0];
  }
  const result = await observeAcquisition(db, acquisition, invoice, transaction);
  return { ...result, acquisitionState: (await findAcquisition(db, orderId)).state, invoiceStatus: invoice?.status || null };
}

// Called only by the scheduled Worker. Moving checked entries to the back of
// the queue makes retries bounded and prevents a failed invoice starving others.
export async function reconcileAffiliateBatch(env, now = Date.now(), limit = 5) {
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
  // Product signup validates that the response matches the code entered. An
  // older alias is still valid and must not be replaced by the current code.
  if (request.method === 'GET') return json({ available: true, code: candidate ? (manualCode ? manualCode.toUpperCase() : candidate.code) : null });
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
    || !uuidPattern.test(account.id || '') || typeof account.email !== 'string' || candidate.email_hash === await emailHash(account.email)
    || candidate.normalized_hash === await emailSignalHash(account.email)) {
    return json({ error: 'Kode afiliasi tidak dapat digunakan untuk akun ini.' }, 422);
  }
  const deadline = conversionDeadline(policy, account.affiliate_signup_at);
  const saved = await saveReferral(env.AFFILIATE_DB, policy, product, account.id, candidate, manualCode ? 'signup_code' : 'signup_link', deadline);
  if (!saved || !saved.active || saved.expires_at <= Date.now()) return json({ error: 'Kode afiliasi tidak dapat disimpan.' }, 409);
  const acceptedCode = manualCode && saved.affiliate_id === candidate.affiliate_id ? manualCode.toUpperCase() : saved.code;
  return json({ available: true, code: acceptedCode });
}

function page(title, body, status = 200, landing = false, dashboard = false) {
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | DagangOS</title>
    <link rel="icon" href="/assets/brand/dagangos-icon.png"><link rel="stylesheet" href="/portal.css?v=footer-20261116"><link rel="stylesheet" href="/affiliate.css?v=code-20261117"><script src="/affiliate.js?v=dashboard-20261116" defer></script>
    </head><body class="affiliate-site"><div class="ambient" aria-hidden="true"><i></i><i></i><i></i></div>
    <header class="site-header">
      <a class="brand" href="/" aria-label="DagangOS beranda"><img src="/assets/brand/dagangos-icon.png" alt=""><b>Dagang<span>OS</span></b></a>
      <nav class="main-nav" aria-label="Navigasi utama"><a href="/produk">Produk</a><a href="/solusi">Solusi</a><a href="/industri">Industri</a><a href="/tentang">Tentang Kami</a><a href="/sumber-daya">Sumber Daya</a><a href="/kontak">Kontak</a></nav>
      <div class="header-actions"><a class="button button-quiet" href="/geraina/login">Masuk</a><a class="button button-primary" href="/produk">Jelajahi Produk ↗</a></div>
      <details class="affiliate-mobile-nav"><summary aria-label="Buka navigasi">☰</summary><nav aria-label="Navigasi utama seluler"><a href="/produk">Produk</a><a href="/solusi">Solusi</a><a href="/industri">Industri</a><a href="/tentang">Tentang Kami</a><a href="/sumber-daya">Sumber Daya</a><a href="/kontak">Kontak</a></nav></details>
    </header>
    <main class="affiliate-main ${landing ? 'affiliate-main--landing' : ''} ${dashboard ? 'affiliate-main--dashboard' : ''}">${landing ? body : `<div class="affiliate-message ${dashboard ? 'affiliate-dashboard' : ''}">${dashboard ? body : `<span class="affiliate-kicker">PROGRAM AFILIASI</span><h1>${escape(title)}</h1>${body}`}</div>`}</main>
    <footer class="site-footer">
      <div class="footer-brand"><img src="/assets/brand/dagangos-icon.png" alt=""><div><b>DagangOS</b><span>PT DagangOS Digital Indonesia</span></div></div>
      <div class="footer-links"><nav aria-label="Produk dan perusahaan"><b class="footer-heading">DagangOS</b><a href="/produk">Produk</a><a href="/solusi">Solusi</a><a href="/tentang">Tentang Kami</a><a href="/sumber-daya">Sumber Daya</a><a href="/affiliate-program" aria-current="page">Program Afiliasi</a></nav>
      <nav aria-label="Kontak dan legal"><b class="footer-heading">Kontak &amp; Legal</b><a href="/kontak">Hubungi Kami</a><a href="/syarat-ketentuan">Syarat &amp; Ketentuan</a><a href="/kebijakan-privasi">Kebijakan Privasi</a><a href="/kebijakan-refund">Refund &amp; Pembatalan</a></nav></div>
      <address class="footer-contact"><a href="mailto:contact@dagangos.com">contact@dagangos.com</a><a href="https://wa.me/628999155182">WhatsApp: +62 899 9155 182</a><span>Subang, Jawa Barat, Indonesia</span></address><small>© 2026 PT DagangOS Digital Indonesia.</small>
    </footer></body></html>`, { status, headers: {
    ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  } });
}

async function activeProducts(db) {
  return (await db.prepare("SELECT id, name, mode FROM affiliate_products ORDER BY mode = 'upcoming', rowid").all()).results;
}

const payoutStatusLabel = {
  proposed: 'Menunggu peninjauan', approved: 'Disetujui · menunggu jadwal',
  submitted: 'Transfer diproses', unknown: 'Status transfer sedang diperiksa',
  succeeded: 'Transfer berhasil', failed: 'Transfer gagal',
  reversed: 'Transfer dikembalikan', cancelled: 'Dibatalkan',
};
const bankLabel = code => ({ ID_BCA:'BCA', ID_BRI:'BRI', ID_BNI:'BNI', ID_MANDIRI:'Mandiri', ID_PERMATA:'Permata' }[code] || 'Bank');
function activityStatus(sale, paidBy) {
  if (sale.state === 'paid') return 'Menunggu penyelesaian pembayaran';
  if (sale.state === 'settled') return sale.entries ? (sale.paid_at && sale.paid_at <= paidBy ? 'Masa tunggu selesai' : 'Dalam masa tunggu') : 'Komisi belum tercatat';
  if (sale.state === 'failed') return 'Pembayaran tidak selesai';
  if (sale.state === 'reversed') return 'Dibatalkan / dikembalikan';
  return 'Menunggu pembayaran';
}
const activityStates = ['requested','paid','settled','failed','reversed'];
const paymentStates = ['proposed','approved','submitted','unknown','succeeded','failed','reversed','cancelled'];
function dashboardOptions(form = new URLSearchParams(), products = []) {
  const pageNumber = key => {
    const value = form.get(key) || '1';
    return /^\d{1,6}$/.test(value) ? Math.max(1, Number(value)) : 1;
  };
  const product = form.get('product') || '';
  const state = form.get('state') || '';
  const payoutState = form.get('payout_state') || '';
  const requestedMonths = Number(form.get('months'));
  return {
    product: products.some(item => item.id === product && item.mode === 'subscription') ? product : '',
    state: activityStates.includes(state) ? state : '',
    search: (form.get('search') || '').trim().slice(0, 80),
    payoutState: paymentStates.includes(payoutState) ? payoutState : '',
    activityPage: pageNumber('activity_page'),
    payoutPage: pageNumber('payout_page'),
    months: [3,6,12].includes(requestedMonths) ? requestedMonths : 6,
  };
}
const salesWhere = `sale.affiliate_id = ? AND sale.state <> 'reserved'
  AND (? = '' OR sale.product_id = ?) AND (? = '' OR sale.state = ?)
  AND (? = '' OR instr(lower(sale.order_id), lower(?)) > 0)`;
const salesBindings = (affiliateId, options) => [affiliateId, options.product, options.product,
  options.state, options.state, options.search, options.search];
const dashboardPageSize = 20;
function monthStart(now, months) {
  const local = new Date(now + 7 * 3600000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - months + 1, 1) - 7 * 3600000;
}
function dashboardDate(value) {
  if (value === null || value === undefined || value === '') return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('id-ID', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Jakarta' }).format(date)
    : '—';
}
function hiddenDashboardFields(options, excluded = []) {
  const values = { product:options.product, state:options.state, search:options.search,
    payout_state:options.payoutState, activity_page:options.activityPage, payout_page:options.payoutPage, months:options.months };
  return Object.entries(values).filter(([name]) => !excluded.includes(name)).map(([name,value]) =>
    `<input type="hidden" name="${name}" value="${escape(value)}">`).join('');
}
function dashboardTrend(finance, options) {
  const amounts = new Map(finance.monthly.map(row => [row.month,row.amount]));
  const start = new Date(finance.monthsFrom + 7 * 3600000), end = new Date(finance.now + 7 * 3600000);
  const series = [];
  for (let date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    date <= new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 1))) {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
    const label = new Intl.DateTimeFormat('id-ID',{month:'short',year:'numeric',timeZone:'UTC'}).format(date);
    series.push({label,amount:amounts.get(key) ?? 0});
  }
  const max = Math.max(1,...series.map(item => Math.abs(item.amount)));
  const bars = series.map((item,i) => {
    const height = Math.round(Math.abs(item.amount) / max * 54);
    const x = 28 + i * 84, y = item.amount >= 0 ? 72-height : 72;
    return `<g><title>${escape(item.label)}: ${escape(rupiah(item.amount))}</title><rect class="${item.amount < 0 ? 'negative' : 'positive'}" x="${x}" y="${y}" width="32" height="${height}" rx="5"></rect><text x="${x+16}" y="151" text-anchor="middle">${escape(item.label)}</text></g>`;
  }).join('');
  const rows = series.map(item => `<tr><td>${escape(item.label)}</td><td>${rupiah(item.amount)}</td></tr>`).join('');
  return `<div class="affiliate-trend-header"><div><h2>Perkembangan komisi</h2><p>Komisi bersih saat dicatat, termasuk pembatalan. Bulan berjalan belum selesai.</p></div>
    <form method="post" action="${affiliateRoot}/dashboard#tren" class="affiliate-period">${hiddenDashboardFields(options,['months'])}<label for="months">Periode</label><select id="months" name="months"><option value="3" ${options.months===3?'selected':''}>3 bulan</option><option value="6" ${options.months===6?'selected':''}>6 bulan</option><option value="12" ${options.months===12?'selected':''}>12 bulan</option></select><button type="submit">Tampilkan</button></form></div>
    ${finance.monthly.length ? `<div class="affiliate-chart-scroll"><svg class="affiliate-chart" role="img" aria-label="Komisi bersih dicatat per bulan" width="${Math.max(360,series.length*84+24)}" height="165" viewBox="0 0 ${Math.max(360,series.length*84+24)} 165"><line x1="20" x2="${Math.max(340,series.length*84+4)}" y1="72" y2="72"></line>${bars}</svg></div>` : '<div class="affiliate-empty-chart">Belum ada komisi tercatat pada periode ini.</div>'}
    <details class="affiliate-trend-details"><summary>Lihat angka per bulan</summary><div class="affiliate-table-wrap"><table><thead><tr><th scope="col">Bulan</th><th scope="col">Komisi bersih tercatat</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

async function affiliateFinance(db, affiliateId, policy, options, createdAt, now = Date.now()) {
  if (!policy) return null;
  const paidBy = new Date(now - policy.wait_days * day).toISOString();
  const monthsFrom = Math.max(monthStart(now, options.months), monthStart(createdAt || now, 1));
  // A D1 batch reads the figures and histories together so a payout or reversal
  // cannot be reflected in only one part of the financial summary.
  const [balanceResult, totalsResult, payoutTotalsResult, payouts, sales, registrationsResult, saleCountResult, payoutCountResult, monthlyResult] = await db.batch([
    statement(db, `SELECT ${availableSql} AS amount FROM affiliates a WHERE a.id = ?`, paidBy, affiliateId),
    statement(db, `SELECT COALESCE(SUM(entry.amount),0) AS earned,
      COALESCE(SUM(CASE WHEN sale.paid_at IS NULL OR sale.paid_at > ? THEN entry.amount ELSE 0 END),0) AS waiting
      FROM affiliate_ledger entry JOIN affiliate_acquisitions sale ON sale.order_id = entry.order_id
      WHERE entry.affiliate_id = ?`, paidBy, affiliateId),
    statement(db, `SELECT
      COALESCE(SUM(CASE WHEN status IN ('proposed','approved','submitted','unknown') THEN amount ELSE 0 END),0) AS in_progress,
      COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END),0) AS paid
      FROM affiliate_payouts WHERE affiliate_id = ?`, affiliateId),
    statement(db, `SELECT id, status, amount, bank_code, last_four, created_at, submitted_at, completed_at
      FROM affiliate_payouts WHERE affiliate_id = ? AND (? = '' OR status = ?) ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
      affiliateId, options.payoutState, options.payoutState, dashboardPageSize, (options.payoutPage-1)*dashboardPageSize),
    statement(db, `SELECT sale.order_id, sale.product_id, product.name, sale.state, sale.paid_at,
      COALESCE(SUM(entry.amount),0) AS net_commission, COUNT(entry.order_id) AS entries
      FROM affiliate_acquisitions sale JOIN affiliate_products product ON product.id = sale.product_id
      LEFT JOIN affiliate_ledger entry ON entry.order_id = sale.order_id AND entry.affiliate_id = sale.affiliate_id
      WHERE ${salesWhere}
      GROUP BY sale.order_id ORDER BY sale.rowid DESC LIMIT ? OFFSET ?`,
      ...salesBindings(affiliateId, options), dashboardPageSize, (options.activityPage-1)*dashboardPageSize),
    statement(db, 'SELECT COUNT(*) AS count FROM affiliate_attributions WHERE affiliate_id = ?', affiliateId),
    statement(db, `SELECT COUNT(*) AS count FROM affiliate_acquisitions sale WHERE ${salesWhere}`, ...salesBindings(affiliateId, options)),
    statement(db, "SELECT COUNT(*) AS count FROM affiliate_payouts WHERE affiliate_id = ? AND (? = '' OR status = ?)",
      affiliateId, options.payoutState, options.payoutState),
    statement(db, `SELECT strftime('%Y-%m', recorded_at / 1000, 'unixepoch', '+7 hours') AS month, SUM(amount) AS amount
      FROM affiliate_ledger WHERE affiliate_id = ? AND recorded_at >= ? AND recorded_at <= ?
      GROUP BY month ORDER BY month`, affiliateId, monthsFrom, now),
  ]);
  const balance = balanceResult.results[0], totals = totalsResult.results[0];
  const payoutTotals = payoutTotalsResult.results[0], registrations = registrationsResult.results[0];
  const amounts = [balance?.amount, totals?.earned, totals?.waiting, payoutTotals?.in_progress, payoutTotals?.paid,
    ...payouts.results.map(row => row.amount), ...sales.results.map(row => row.net_commission), ...monthlyResult.results.map(row => row.amount)];
  if (!amounts.every(Number.isSafeInteger)) return null;
  return { earned:totals.earned, waiting:totals.waiting, available:Math.max(0, balance.amount),
    adjustment:Math.max(0, -balance.amount), inProgress:payoutTotals.in_progress, paid:payoutTotals.paid, payouts:payouts.results,
    sales:sales.results, registrations:registrations.count, paidBy,
    saleCount:saleCountResult.results[0].count, payoutCount:payoutCountResult.results[0].count,
    monthly:monthlyResult.results, monthsFrom, now };
}

async function affiliateHome(db, request, env, status = 200, form = new URLSearchParams()) {
  const token = cookieValue(request, sessionCookie);
  const account = accessPattern.test(token || '') && await statement(db,
    'SELECT id, code, name, created_at FROM affiliates WHERE access_hash = ? AND active = 1', await hash(token)).first();
  const payoutPolicy = await db.prepare('SELECT minimum_idr, payout_day, wait_days FROM affiliate_payout_policy WHERE id = 1').first();
  const referralPolicy = await db.prepare('SELECT scope, referral_days, conversion_days FROM affiliate_policy WHERE id = 1').first();
  const referralReady = env.AFFILIATE_CHECKOUT === 'on' && referralPolicy?.referral_days && referralPolicy?.conversion_days;
  const payoutText = payoutPolicy ? `Ketentuan pembayaran komisi: saldo minimum ${rupiah(payoutPolicy.minimum_idr)},
    pembayaran bulanan setiap tanggal ${payoutPolicy.payout_day}, dan masa tunggu ${payoutPolicy.wait_days} hari sejak pembayaran pelanggan.
    ${env.AFFILIATE_PAYOUTS === 'on' ? 'Pembayaran diproses setelah peninjauan.' : 'Pembayaran komisi masih dalam persiapan dan belum berjalan otomatis.'}` : '';
  if (!account) {
    return page('Program Afiliasi DagangOS', `
      <section class="affiliate-hero">
        <div class="affiliate-hero-copy"><span class="affiliate-kicker">PROGRAM AFILIASI DAGANGOS</span>
          <h1>Bertumbuh bersama <em>DagangOS.</em></h1>
          <p>Kenalkan Geraina dan DapurOS kepada pelaku usaha. Bagikan kode atau tautan Anda dan pantau hasil rujukan dalam satu dasbor.</p>
          <div class="affiliate-actions"><a class="affiliate-button" href="#daftar">Mulai sebagai afiliasi <span aria-hidden="true">↗</span></a><a class="affiliate-button affiliate-button--quiet" href="#cara-kerja">Pelajari cara kerja</a></div>
          <div class="affiliate-hero-meta"><span><b>01</b> Satu akun afiliasi</span><span><b>02</b> Geraina &amp; DapurOS</span><span><b>03</b> Pantau dalam satu dasbor</span></div>
        </div>
        <aside class="affiliate-hero-panel" aria-label="Sekilas program afiliasi"><span class="affiliate-panel-label">KEMITRAAN DAGANGOS <span>●</span></span>
          <div class="affiliate-panel-icon"><img src="/assets/brand/dagangos-icon.png" alt=""></div>
          <p>Rekomendasi yang membantu usaha berkembang.</p><div class="affiliate-panel-products"><span>Geraina POS</span><span>DapurOS</span></div>
          <small>Bagikan produk yang sesuai dengan kebutuhan pelanggan Anda.</small>
        </aside>
      </section>
      <section id="cara-kerja" class="affiliate-section"><div class="affiliate-section-heading"><div><span class="affiliate-kicker">CARA KERJA</span><h2>Dari rekomendasi hingga komisi.</h2></div><p>Pendaftaran dimulai dengan verifikasi email. Komisi dihitung saat pembelian yang memenuhi syarat telah terverifikasi.</p></div>
        <div class="affiliate-steps"><article><span>01</span><h3>Daftar dan verifikasi</h3><p>Isi nama dan email, lalu buka tautan verifikasi untuk membuat akun afiliasi.</p></article><article><span>02</span><h3>Bagikan rekomendasi</h3><p>Gunakan kode afiliasi atau tautan khusus produk dari dasbor Anda.</p></article><article><span>03</span><h3>Pantau hasilnya</h3><p>Lihat kunjungan, pembelian tercatat, dan komisi di dasbor afiliasi.</p></article></div>
      </section>
      <section class="affiliate-section affiliate-details"><div><span class="affiliate-kicker">KETENTUAN PROGRAM</span><h2>Jelas sejak awal.</h2><p>${referralReady ? `Rujukan berlaku untuk pembelian pertama yang memenuhi syarat ${referralPolicy.scope === 'merchant_product' ? 'pada masing-masing produk' : 'di DagangOS'}.` : 'Rincian rujukan akan tersedia setelah program siap.'}</p></div>
        <div class="affiliate-facts"><div><b>14 hari</b><span>Pelanggan dapat mencoba produk selama masa trial. Trial belum menghasilkan komisi.</span></div>${referralReady ? `<div><b>10% komisi</b><span>Komisi dihitung dari harga satu bulan paket untuk pembelian pertama yang memenuhi syarat, termasuk paket tahunan.</span></div><div><b>10% diskon</b><span>Pelanggan yang memenuhi syarat mendapat diskon untuk pembelian paket pertama.</span></div><div><b>${referralPolicy.referral_days} / ${referralPolicy.conversion_days} hari</b><span>Tautan berlaku ${referralPolicy.referral_days} hari sebelum pendaftaran; rujukan tersimpan berlaku ${referralPolicy.conversion_days} hari sejak pendaftaran untuk pembayaran pertama.</span></div>` : '<div><b>Rujukan</b><span>Ketentuan rujukan masih dalam persiapan.</span></div>'}<div><b>Pembayaran bulanan</b><span>${payoutText || 'Ketentuan pembayaran tersedia melalui tim DagangOS.'}</span></div></div>
      </section>
      <section id="daftar" class="affiliate-section affiliate-join"><div class="affiliate-join-copy"><span class="affiliate-kicker">MULAI BERGABUNG</span><h2>Siap menjadi mitra DagangOS?</h2><p>Daftar dengan email aktif untuk menerima tautan verifikasi. Setelah diverifikasi, Anda akan mendapatkan kode afiliasi dan akses ke dasbor.</p><p class="affiliate-help">Sudah bergabung? <a href="#masuk">Masuk ke dasbor</a>.</p></div>
        <div class="affiliate-form-card">${env.RESEND_API_KEY ? `<h2>Daftar afiliasi</h2><p>Langkah pertama: verifikasi email Anda.</p>
        <form method="post" action="${affiliateRoot}/register"><label for="name">Nama</label><input id="name" name="name" maxlength="100" required autocomplete="name" placeholder="Nama lengkap">
        <label for="email">Email</label><input id="email" name="email" type="email" maxlength="254" required autocomplete="email" placeholder="nama@email.com">
        <input type="hidden" name="agreement_version" value="${AFFILIATE_AGREEMENT_VERSION}"><label class="affiliate-agreement-check"><input type="checkbox" name="agreement" value="yes" required><span>Saya telah membaca dan menyetujui <a href="${AFFILIATE_AGREEMENT_PATH}">ketentuan program afiliasi</a>.</span></label>
        <button type="submit">Kirim tautan verifikasi <span aria-hidden="true">↗</span></button></form><p class="affiliate-form-note">Tautan verifikasi berlaku selama 30 menit. Periksa folder spam jika belum diterima. <a href="/kebijakan-privasi">Kebijakan Privasi</a></p>`
        : `<h2>Daftar afiliasi</h2><p>Pendaftaran online belum tersedia. Hubungi <a href="mailto:contact@dagangos.com">tim DagangOS</a> untuk bergabung.</p>`}
        <details id="masuk" class="affiliate-login"><summary>Sudah punya akun? Masuk</summary><p>Gunakan kode akses dasbor yang Anda simpan saat verifikasi. Kode ini berbeda dari kode afiliasi.</p><form method="post" action="${affiliateRoot}/login"><label for="access">Kode akses dasbor</label><input id="access" name="access" type="password" autocomplete="current-password" maxlength="64" required><button type="submit">Masuk ke dasbor</button></form><p class="affiliate-form-note"><a href="${affiliateRoot}/recover">Lupa kode akses dasbor?</a></p></details></div>
      </section>`, status, true);
  }
  const products = await activeProducts(db);
  const options = dashboardOptions(form, products);
  const [visits, ledger, bank, finance, disputeCount, agreement] = await Promise.all([
    statement(db, 'SELECT product_id, COUNT(*) AS visits FROM affiliate_visits WHERE affiliate_id = ? GROUP BY product_id', account.id).all(),
    statement(db, `SELECT product_id, SUM(amount) AS total, SUM(kind = 'commission') AS conversions
      FROM affiliate_ledger WHERE affiliate_id = ? GROUP BY product_id`, account.id).all(),
    env.AFFILIATE_BANK_KEY ? statement(db, 'SELECT bank_code, last_four FROM affiliate_bank_destinations WHERE affiliate_id = ?', account.id).first() : null,
    affiliateFinance(db, account.id, payoutPolicy, options, account.created_at),
    statement(db, `SELECT COUNT(*) AS count FROM affiliate_disputes dispute JOIN affiliate_acquisitions sale
      ON sale.order_id=dispute.order_id WHERE sale.affiliate_id=? AND dispute.status <> 'WON'
      AND NOT (dispute.status='LOST' AND EXISTS (SELECT 1 FROM affiliate_dispute_reviews review
        WHERE review.dispute_id=dispute.id AND review.provider_updated_at=dispute.updated_at))`, account.id).first(),
    statement(db, 'SELECT accepted_at FROM affiliate_agreement_acceptances WHERE affiliate_id=? AND version=?',account.id,AFFILIATE_AGREEMENT_VERSION).first(),
  ]);
  const stats = new Map(ledger.results.map(row => [row.product_id, row]));
  const traffic = new Map(visits.results.map(row => [row.product_id, row.visits]));
  const cards = products.filter(product => product.mode === 'subscription').map(product => {
    const title = escape(product.name);
    const link = `https://dagangos.com${affiliateRoot}/${account.code}/${product.id}`;
    const result = stats.get(product.id);
    const icon = ['geraina','dapuros'].includes(product.id) ? `<img src="/assets/brand/${product.id}-icon.png" alt="">` : escape(product.name.slice(0,1));
    return `<article class="affiliate-product-card"><div class="affiliate-product-head"><span class="affiliate-product-icon">${icon}</span><div><h3>${title}</h3><span>Program aktif</span></div></div><label for="link-${product.id}">Tautan rujukan</label>
      <div class="affiliate-copy"><input type="url" id="link-${product.id}" value="${escape(link)}" readonly><button type="button" data-copy-for="link-${product.id}" hidden>Salin</button></div><span class="affiliate-copy-status" aria-live="polite"></span>
      <dl><dt>Kunjungan</dt><dd>${traffic.get(product.id) ?? 0}</dd>
      <dt>Pembelian tercatat</dt><dd>${result?.conversions ?? 0}</dd>
      <dt>Komisi tercatat</dt><dd>${rupiah(result?.total ?? 0)}</dd></dl></article>`;
  }).join('');
  const remaining = finance && payoutPolicy ? Math.max(0, payoutPolicy.minimum_idr - finance.available) : 0;
  const progress = finance && payoutPolicy ? Math.min(100, Math.floor(finance.available / payoutPolicy.minimum_idr * 100)) : 0;
  const payoutGuidance = !agreement ? 'Baca dan setujui ketentuan program agar pembayaran dapat ditinjau.'
    : disputeCount?.count ? 'Pembayaran sedang ditinjau. Hubungi tim DagangOS untuk informasi lebih lanjut.'
    : !finance ? 'Ketentuan pembayaran belum tersedia.'
    : env.AFFILIATE_PAYOUT_REVIEW !== 'on' || env.AFFILIATE_PAYOUTS !== 'on' || !env.AFFILIATE_XENDIT_KEY ? 'Pembayaran otomatis belum aktif. Hubungi tim DagangOS untuk informasi lebih lanjut.'
    : !env.AFFILIATE_BANK_KEY ? 'Pengaturan rekening belum tersedia. Hubungi tim DagangOS.'
    : !bank ? 'Tambahkan rekening dan konfirmasikan perubahan melalui email.'
    : finance.inProgress ? 'Ada pembayaran dalam proses. Lihat statusnya di riwayat pembayaran.'
    : finance.available < payoutPolicy.minimum_idr ? `Diperlukan ${rupiah(remaining)} lagi pada saldo untuk peninjauan agar mencapai ambang minimum.`
    : 'Saldo telah mencapai ambang minimum dan akan disiapkan untuk peninjauan.';
  const saleRows = finance?.sales.map(sale => `<tr><td>${escape(sale.name)}<small>${escape(sale.order_id)}</small></td><td>${dashboardDate(sale.paid_at)}</td><td>${escape(activityStatus(sale, finance.paidBy))}</td><td>${sale.entries ? rupiah(sale.net_commission) : '—'}</td></tr>`).join('')
    || '<tr><td colspan="4">Tidak ada aktivitas yang cocok.</td></tr>';
  const payoutRows = finance?.payouts.map(item => `<tr><td>${dashboardDate(item.completed_at || item.submitted_at || item.created_at)}</td>
    <td><span class="affiliate-status">${escape(payoutStatusLabel[item.status] || 'Sedang diperiksa')}</span>${item.status === 'succeeded' && uuidPattern.test(item.id) ? `<a class="affiliate-receipt-link" href="${affiliateRoot}/pembayaran/${item.id}">Lihat catatan</a>` : ''}</td><td>${escape(bankLabel(item.bank_code))} ···· ${escape(item.last_four)}</td><td>${rupiah(item.amount)}</td></tr>`).join('')
    || '<tr><td colspan="4">Tidak ada pembayaran yang cocok.</td></tr>';
  const salePages = finance ? Math.max(1,Math.ceil(finance.saleCount/dashboardPageSize)) : 1;
  const payoutPages = finance ? Math.max(1,Math.ceil(finance.payoutCount/dashboardPageSize)) : 1;
  const stateOptions = [['','Semua status'],['requested','Menunggu pembayaran'],['paid','Menunggu penyelesaian'],['settled','Pembayaran selesai'],['failed','Pembayaran gagal'],['reversed','Dibatalkan / dikembalikan']];
  const payoutOptions = [['','Semua status'], ...paymentStates.map(value => [value,payoutStatusLabel[value]])];
  const optionList = (list, selected) => list.map(([value,label]) => `<option value="${escape(value)}" ${value===selected?'selected':''}>${escape(label)}</option>`).join('');
  const activeOptions = [['','Semua produk'], ...products.filter(item=>item.mode==='subscription').map(item=>[item.id,item.name])];
  return page('Dasbor Afiliasi', `<div class="affiliate-workspace">
    <aside class="affiliate-sidebar" aria-label="Navigasi dasbor"><div class="affiliate-side-brand"><span class="affiliate-side-mark">✦</span><div><strong>Mitra DagangOS</strong><small>Dasbor afiliasi</small></div></div>
      <nav aria-label="Bagian dasbor">${finance ? '<a href="#ringkasan">◫ <span>Ringkasan</span></a><a href="#tren">◷ <span>Perkembangan</span></a>' : ''}<a href="#produk">◇ <span>Tautan produk</span></a>${finance ? '<a href="#aktivitas">≡ <span>Aktivitas rujukan</span></a><a href="#pembayaran">↗ <span>Pembayaran</span></a>' : ''}${env.AFFILIATE_BANK_KEY ? '<a href="#rekening">▣ <span>Rekening</span></a>' : ''}</nav>
      <div class="affiliate-side-help"><strong>Butuh bantuan?</strong><span>Tim DagangOS siap membantu.</span><a href="mailto:contact@dagangos.com">Hubungi kami ↗</a></div></aside>
    <div class="affiliate-workspace-content">
      <header class="affiliate-dash-header"><div><p class="affiliate-breadcrumb">DAGANGOS <span>/</span> AFILIASI</p><h1>Dasbor Afiliasi</h1><p>Selamat datang, ${escape(account.name)}.</p></div><form method="post" action="${affiliateRoot}/logout"><button type="submit" class="affiliate-logout">Keluar</button></form></header>
      ${agreement ? '' : `<section class="affiliate-workspace-card"><h2>Ketentuan program afiliasi</h2><p>Baca dan setujui ketentuan agar pembayaran dapat ditinjau. Kode dan riwayat komisi Anda tetap tersimpan.</p><p><a href="${AFFILIATE_AGREEMENT_PATH}">Baca ketentuan program</a></p><form method="post" action="${affiliateRoot}/agreement/accept"><input type="hidden" name="version" value="${AFFILIATE_AGREEMENT_VERSION}"><button type="submit">Saya setuju dengan ketentuan</button></form></section>`}
      <div class="affiliate-code-strip"><div><span>KODE AFILIASI ANDA</span><strong>${escape(account.code)}</strong><small>Bagikan kode ini kepada calon pelanggan.</small></div><div class="affiliate-copy"><input id="affiliate-code" value="${escape(account.code)}" readonly aria-label="Kode afiliasi"><button type="button" data-copy-for="affiliate-code" hidden>Salin kode</button></div><span class="affiliate-copy-status" aria-live="polite"></span></div>
      <details class="affiliate-code-edit"><summary>Ubah kode afiliasi</summary><p>Pilih 8–24 huruf atau angka tanpa spasi. Kode dan tautan lama tetap berlaku, dan riwayat serta komisi tetap di akun ini.</p><form method="post" action="${affiliateRoot}/kode"><label for="custom-code">Kode baru</label><input id="custom-code" name="code" minlength="8" maxlength="24" pattern="[A-Za-z0-9]{8,24}" autocapitalize="characters" autocomplete="off" required><button type="submit">Simpan kode</button></form></details>
    ${finance ? `<section id="ringkasan" class="affiliate-finance" aria-labelledby="finance-heading"><div class="affiliate-block-head"><div><h2 id="finance-heading">Ringkasan komisi</h2><p>Semua waktu · ${finance.registrations} rujukan akun pernah tersimpan. Data diperbarui saat halaman dimuat.</p></div><span class="affiliate-live-badge">● Data akun</span></div>
      <div class="affiliate-finance-grid">
        <div class="affiliate-kpi affiliate-kpi--primary"><span>Total komisi tercatat</span><strong>${rupiah(finance.earned)}</strong><small>Termasuk yang dibayar, setelah pembatalan</small></div>
        <div class="affiliate-kpi"><span>Dalam masa tunggu</span><strong>${rupiah(finance.waiting)}</strong><small>Belum memenuhi masa tunggu</small></div>
        <div class="affiliate-kpi"><span>Saldo untuk peninjauan</span><strong>${rupiah(finance.available)}</strong><small>Setelah pembayaran dan proses sebelumnya</small></div>
        <div class="affiliate-kpi"><span>Pembayaran dalam proses</span><strong>${rupiah(finance.inProgress)}</strong><small>Ditinjau atau dikirim</small></div>
        <div class="affiliate-kpi"><span>Sudah dibayar</span><strong>${rupiah(finance.paid)}</strong><small>Transfer berhasil</small></div>
      </div>${finance.adjustment ? `<p class="affiliate-finance-note">Saldo untuk peninjauan masih kurang ${rupiah(finance.adjustment)} untuk menutup pembayaran atau reservasi sebelumnya. Saldo akan diperbarui saat komisi memenuhi syarat atau ada penyesuaian.</p>` : ''}
      <div class="affiliate-payout-card"><div><span class="affiliate-kicker">PENARIKAN KOMISI</span><h3>Pembayaran otomatis ke rekening</h3>
        <p>${env.AFFILIATE_PAYOUTS === 'on' && env.AFFILIATE_PAYOUT_REVIEW === 'on' && env.AFFILIATE_XENDIT_KEY ? `Tidak perlu meminta penarikan. Pembayaran yang memenuhi syarat diproses pada tanggal ${payoutPolicy.payout_day} setiap bulan (WIB), setelah peninjauan.` : 'Pembayaran otomatis masih dalam persiapan.'}</p>
        <p>${escape(payoutGuidance)}</p><p class="affiliate-finance-note">Minimum ${rupiah(payoutPolicy.minimum_idr)} setelah masa tunggu ${payoutPolicy.wait_days} hari. Peninjauan dan kondisi transfer dapat memengaruhi waktu pembayaran.</p>
        ${env.AFFILIATE_BANK_KEY ? `<a class="affiliate-inline-action" href="#rekening">${bank ? 'Kelola rekening' : 'Tambahkan rekening'} ↗</a>` : ''}</div>
        <div class="affiliate-progress"><span>Saldo untuk peninjauan</span><strong>${rupiah(finance.available)}</strong><progress value="${progress}" max="100" aria-label="Kemajuan menuju ambang pembayaran"></progress><small>Minimum ${rupiah(payoutPolicy.minimum_idr)}</small></div></div></section>
      <section id="tren" class="affiliate-workspace-card">${dashboardTrend(finance,options)}</section>` : `<section><h2>Ringkasan komisi</h2><p>Informasi pembayaran belum tersedia. Hubungi tim DagangOS.</p></section>`}
    <section id="produk"><div class="affiliate-block-head"><div><h2>Produk dan tautan rujukan</h2><p>Bagikan tautan produk atau kode afiliasi Anda. Kunjungan hanya menghitung pembukaan tautan, bukan penggunaan kode secara langsung.</p></div></div><div class="products">${cards || '<p>Belum ada program produk yang aktif.</p>'}</div></section>
    ${finance ? `<section id="aktivitas" class="affiliate-workspace-card"><div class="affiliate-block-head"><div><h2>Aktivitas rujukan</h2><p>Pembayaran yang belum selesai belum menghasilkan komisi.</p></div></div>
      <form method="post" action="${affiliateRoot}/dashboard#aktivitas" class="affiliate-history-form">
      ${hiddenDashboardFields(options,['product','state','search','activity_page'])}
      <div class="affiliate-filter-row"><label>Produk<select name="product">${optionList(activeOptions,options.product)}</select></label><label>Status<select name="state">${optionList(stateOptions,options.state)}</select></label><label>Cari referensi<input name="search" value="${escape(options.search)}" maxlength="80" placeholder="Referensi pesanan"></label>
      <button type="submit">Terapkan</button><a href="${affiliateRoot}#aktivitas">Reset</a><button type="submit" formaction="${affiliateRoot}/export/aktivitas">Unduh CSV</button></div>
      <div class="affiliate-table-wrap"><table><thead><tr><th scope="col">Produk dan referensi</th><th scope="col">Tanggal pembayaran</th><th scope="col">Status</th><th scope="col">Komisi bersih</th></tr></thead><tbody>${saleRows}</tbody></table></div>
      <div class="affiliate-pagination"><span>${finance.saleCount} aktivitas · Halaman ${options.activityPage} dari ${salePages}</span><div><button type="submit" name="activity_page" value="${Math.max(1,options.activityPage-1)}" ${options.activityPage<=1?'disabled':''}>Sebelumnya</button><button type="submit" name="activity_page" value="${options.activityPage+1}" ${options.activityPage>=salePages?'disabled':''}>Berikutnya</button></div></div></form></section>
      <section id="pembayaran" class="affiliate-workspace-card"><div class="affiliate-block-head"><div><h2>Riwayat pembayaran</h2><p>Tanggal menunjukkan penyelesaian, pengiriman, atau pembuatan jika masih ditinjau.</p></div></div>
      <form method="post" action="${affiliateRoot}/dashboard#pembayaran" class="affiliate-history-form">${hiddenDashboardFields(options,['payout_state','payout_page'])}
      <div class="affiliate-filter-row"><label>Status<select name="payout_state">${optionList(payoutOptions,options.payoutState)}</select></label><button type="submit">Terapkan</button><button type="submit" formaction="${affiliateRoot}/export/pembayaran">Unduh CSV</button></div>
      <div class="affiliate-table-wrap"><table><thead><tr><th scope="col">Tanggal</th><th scope="col">Status</th><th scope="col">Rekening</th><th scope="col">Jumlah</th></tr></thead><tbody>${payoutRows}</tbody></table></div>
      <div class="affiliate-pagination"><span>${finance.payoutCount} pembayaran · Halaman ${options.payoutPage} dari ${payoutPages}</span><div><button type="submit" name="payout_page" value="${Math.max(1,options.payoutPage-1)}" ${options.payoutPage<=1?'disabled':''}>Sebelumnya</button><button type="submit" name="payout_page" value="${options.payoutPage+1}" ${options.payoutPage>=payoutPages?'disabled':''}>Berikutnya</button></div></div></form></section>` : ''}
    ${env.AFFILIATE_BANK_KEY ? `<section id="rekening" class="affiliate-workspace-card"><div class="affiliate-block-head"><div><h2>Rekening komisi</h2><p>${bank ? `Rekening tersimpan: ${escape(bankLabel(bank.bank_code))} ···· ${escape(bank.last_four)}.` : 'Belum ada rekening tersimpan.'}</p></div><span class="affiliate-bank-badge">${bank?'Tersimpan':'Belum diatur'}</span></div>
      <p>Rekening dan komisi perlu ditinjau sebelum pembayaran. Perubahan rekening memerlukan verifikasi email dan peninjauan kembali.</p>
      <details class="affiliate-bank-form" ${bank?'':'open'}><summary>${bank?'Ubah rekening':'Tambahkan rekening'}</summary>
      <form method="post" action="${affiliateRoot}/bank"><label for="bank-email">Email akun afiliasi</label>
      <input id="bank-email" name="email" type="email" maxlength="254" required>
      <label for="bank-code">Bank</label><select id="bank-code" name="bank" required>
      <option value="ID_BCA">BCA</option><option value="ID_BRI">BRI</option><option value="ID_BNI">BNI</option>
      <option value="ID_MANDIRI">Mandiri</option><option value="ID_PERMATA">Permata</option></select>
      <label for="bank-name">Nama pemilik rekening</label><input id="bank-name" name="account_name" maxlength="100" required autocomplete="off">
      <label for="bank-number">Nomor rekening</label><input id="bank-number" name="account_number" maxlength="24" inputmode="numeric" required autocomplete="off">
      <button type="submit">Konfirmasi perubahan melalui email</button></form></details></section>` : ''}
    </div></div>`, 200, false, true);
}

async function sessionAccount(db, request) {
  const token = cookieValue(request, sessionCookie);
  return accessPattern.test(token || '') ? statement(db,
    'SELECT id, email_hash FROM affiliates WHERE access_hash = ? AND active = 1', await hash(token)).first() : null;
}

async function changeAffiliateCode(db, request, url) {
  if (request.method !== 'POST') return page('Metode tidak didukung', '', 405);
  if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
  const account = await sessionAccount(db, request);
  if (!account) return page('Masuk terlebih dahulu', `<a href="${affiliateRoot}#masuk">Masuk ke dasbor</a>`, 401);
  const raw = await request.text();
  if (raw.length > 1024) return page('Permintaan tidak valid', '', 413);
  const code = (new URLSearchParams(raw).get('code') || '').trim().toUpperCase();
  const back = `<p><a href="${affiliateRoot}">Kembali ke dasbor</a></p>`;
  if (!codePattern.test(code) || reservedCodes.has(code)) return page('Kode tidak dapat digunakan', `<p>Gunakan 8–24 huruf atau angka tanpa spasi dan pilih kode lain jika nama tersebut tersedia untuk fitur DagangOS.</p>${back}`, 400);
  const changed = await statement(db, `UPDATE affiliates SET code = ? WHERE id = ? AND active = 1
    AND NOT EXISTS (SELECT 1 FROM affiliate_code_registry WHERE code = ? AND affiliate_id <> ?)
    RETURNING code`, code, account.id, code, account.id).first();
  if (!changed) return page('Kode tidak tersedia', `<p>Kode tersebut sudah digunakan. Silakan pilih kode lain.</p>${back}`, 409);
  return page('Kode berhasil disimpan', `<p>Kode afiliasi Anda sekarang <strong>${escape(changed.code)}</strong>. Kode dan tautan lama tetap berlaku; komisi dan riwayat tetap tersimpan.</p>${back}`);
}

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  // Spreadsheet applications interpret certain text prefixes as formulas.
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
const csvLine = values => values.map(csvCell).join(',') + '\r\n';
function csvUtc(value) {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function exportAffiliateHistory(db, affiliateId, options, type, paidBy) {
  const encoder = new TextEncoder();
  const activity = type === 'activity';
  let cursor = Number.MAX_SAFE_INTEGER;
  let cursorDate = Number.MAX_SAFE_INTEGER;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('\uFEFF' + csvLine(activity
        ? ['Produk','Referensi','Tanggal pembayaran (UTC)','Status','Komisi bersih (IDR)']
        : ['Referensi pembayaran','Dibuat (UTC)','Dikirim (UTC)','Selesai (UTC)','Status','Bank','Akhiran rekening','Jumlah (IDR)'])));
    },
    async pull(controller) {
      try {
          const query = activity ? statement(db, `SELECT sale.rowid AS cursor, sale.order_id, product.name, sale.state, sale.paid_at,
              COALESCE(SUM(entry.amount),0) AS net_commission, COUNT(entry.order_id) AS entries
              FROM affiliate_acquisitions sale JOIN affiliate_products product ON product.id = sale.product_id
              LEFT JOIN affiliate_ledger entry ON entry.order_id = sale.order_id AND entry.affiliate_id = sale.affiliate_id
              WHERE ${salesWhere} AND sale.rowid < ? GROUP BY sale.order_id ORDER BY sale.rowid DESC LIMIT 200`,
              ...salesBindings(affiliateId, options), cursor)
            : statement(db, `SELECT rowid AS cursor, id, status, amount, bank_code, last_four, created_at, submitted_at, completed_at
              FROM affiliate_payouts WHERE affiliate_id = ? AND (? = '' OR status = ?)
              AND (created_at < ? OR (created_at = ? AND rowid < ?))
              ORDER BY created_at DESC, rowid DESC LIMIT 200`, affiliateId, options.payoutState, options.payoutState, cursorDate, cursorDate, cursor);
          const rows = (await query.all()).results;
          if (!rows.length) { controller.close(); return; }
          if (!rows.every(row => Number.isSafeInteger(row.cursor) && Number.isSafeInteger(activity ? row.net_commission : row.amount))) {
            throw new Error('Invalid affiliate export amount');
          }
          const chunk = rows.map(row => csvLine(activity
            ? [row.name,row.order_id,csvUtc(row.paid_at),activityStatus(row, paidBy),row.entries ? row.net_commission : null]
            : [row.id,csvUtc(row.created_at),csvUtc(row.submitted_at),csvUtc(row.completed_at),
              payoutStatusLabel[row.status] || 'Sedang diperiksa',bankLabel(row.bank_code),row.last_four,row.amount])).join('');
          controller.enqueue(encoder.encode(chunk));
          cursor = rows[rows.length - 1].cursor;
          if (!activity) cursorDate = rows[rows.length - 1].created_at;
          if (rows.length < 200) controller.close();
      } catch (error) {
        console.error('Affiliate export failed', { type: error?.name });
        controller.error(error);
      }
    },
  });
  return new Response(stream, {headers:{...headers, 'Content-Type':'text/csv; charset=utf-8',
    'Content-Disposition':`attachment; filename="dagangos-afiliasi-${activity ? 'rujukan' : 'pembayaran'}.csv"`,
    'X-Content-Type-Options':'nosniff'}});
}

async function affiliateDashboardAction(db, request, env, url, path) {
  if (request.method !== 'POST') return page('Metode tidak didukung', '', 405);
  if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
  const account = await sessionAccount(db, request);
  if (!account) return page('Masuk terlebih dahulu', `<a href="${affiliateRoot}#masuk">Masuk ke dasbor</a>`, 401);
  const raw = await request.text();
  if (raw.length > 4096) return page('Permintaan tidak valid', '', 413);
  const form = new URLSearchParams(raw);
  const options = dashboardOptions(form, await activeProducts(db));
  if (path === `${affiliateRoot}/export/aktivitas`) {
    const policy = await db.prepare('SELECT wait_days FROM affiliate_payout_policy WHERE id = 1').first();
    if (!policy) return page('Data belum tersedia', '', 503);
    return exportAffiliateHistory(db, account.id, options, 'activity', new Date(Date.now()-policy.wait_days*day).toISOString());
  }
  if (path === `${affiliateRoot}/export/pembayaran`) return exportAffiliateHistory(db, account.id, options, 'payout');
  return affiliateHome(db, request, env, 200, form);
}

async function affiliatePayoutReceipt(db, request, id) {
  if (!['GET','HEAD'].includes(request.method)) return page('Metode tidak didukung', '', 405);
  const account = await sessionAccount(db, request);
  if (!account) return page('Masuk terlebih dahulu', `<a href="${affiliateRoot}#masuk">Masuk ke dasbor</a>`, 401);
  if (!uuidPattern.test(id || '')) return page('Catatan tidak ditemukan', '', 404);
  const item = await statement(db, `SELECT id, status, amount, bank_code, last_four, created_at, submitted_at, completed_at
    FROM affiliate_payouts WHERE id = ? AND affiliate_id = ? AND status = 'succeeded'`, id, account.id).first();
  if (!item || !Number.isSafeInteger(item.amount)) return page('Catatan tidak ditemukan', `<a href="${affiliateRoot}#pembayaran">Kembali ke pembayaran</a>`, 404);
  return page('Catatan pembayaran komisi', `<p>Catatan transfer yang berhasil. Ini bukan faktur pajak.</p>
    <dl><dt>Referensi pembayaran</dt><dd>${escape(item.id)}</dd><dt>Jumlah</dt><dd>${rupiah(item.amount)}</dd>
    <dt>Status</dt><dd>Transfer berhasil</dd><dt>Tanggal selesai</dt><dd>${dashboardDate(item.completed_at)}</dd>
    <dt>Rekening tujuan</dt><dd>${escape(bankLabel(item.bank_code))} ···· ${escape(item.last_four)}</dd></dl>
    <p>Catatan ini tidak merinci komisi per pembelian.</p><button type="button" data-print-receipt hidden>Cetak / simpan PDF</button>
    <p><a href="${affiliateRoot}#pembayaran">Kembali ke pembayaran</a></p>`);
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
  await statement(db, `INSERT INTO affiliate_email_signals (affiliate_id,normalized_hash) VALUES (?,?)
    ON CONFLICT (affiliate_id) DO UPDATE SET normalized_hash=excluded.normalized_hash`,account.id,await emailSignalHash(email)).run();
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
  if (form.get('agreement') !== 'yes' || form.get('agreement_version') !== AFFILIATE_AGREEMENT_VERSION) {
    return page('Persetujuan diperlukan', `<p>Baca dan setujui <a href="${AFFILIATE_AGREEMENT_PATH}">ketentuan program afiliasi</a> untuk mendaftar.</p>`,400);
  }
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
  const tokenHash=await hash(token);
  await db.batch([
    statement(db, `INSERT INTO affiliate_verification_requests
      (token_hash, email_hash, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,tokenHash,emailKey,name,now,now+30*60000),
    statement(db, 'INSERT INTO affiliate_signup_agreements (token_hash,version,accepted_at) VALUES (?,?,?)',tokenHash,AFFILIATE_AGREEMENT_VERSION,now),
    statement(db, 'INSERT INTO affiliate_signup_email_signals (token_hash,normalized_hash) VALUES (?,?)',tokenHash,await emailSignalHash(email)),
  ]);
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

async function recoverAffiliate(db, request, env, url) {
  if (request.method === 'GET' || request.method === 'HEAD') return page('Pulihkan akses dasbor', `
    <p>Masukkan email yang Anda gunakan untuk mendaftar. Kami akan mengirim tautan untuk membuat kode akses dasbor baru.</p>
    <p>Kode afiliasi, riwayat rujukan, dan komisi tetap tersimpan pada akun Anda. Pemulihan tidak membuat akun baru.</p>
    <form method="post" action="${affiliateRoot}/recover"><label for="recover-email">Email akun afiliasi</label>
    <input id="recover-email" name="email" type="email" maxlength="254" autocomplete="email" required>
    <button type="submit">Kirim tautan pemulihan</button></form>
    <p><a href="${affiliateRoot}#masuk">Kembali ke masuk</a></p>`);
  if (request.method !== 'POST') return page('Metode tidak didukung', '', 405);
  if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
  if (!env.RESEND_API_KEY) return page('Pemulihan belum tersedia', '<p>Hubungi tim DagangOS untuk bantuan.</p>', 503);
  const raw = await request.text();
  if (raw.length > 2048) return page('Permintaan tidak valid', '', 413);
  const email = (new URLSearchParams(raw).get('email') || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return page('Periksa email', `<p>Masukkan alamat email yang valid.</p><a href="${affiliateRoot}/recover">Coba lagi</a>`, 400);
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 64) return page('Pemulihan belum tersedia', '<p>Silakan coba lagi nanti.</p>', 503);
  const now = Date.now(), emailKey = await emailHash(email);
  await db.batch([
    statement(db, 'DELETE FROM affiliate_enrollment_limits WHERE created_at < ?', now - day),
    statement(db, 'DELETE FROM affiliate_verification_requests WHERE expires_at < ?', now - day),
  ]);
  if (!await enrollmentLimit(db, `ip:${ip}`, now, 20) || !await enrollmentLimit(db, `email:${emailKey}`, now, 3)) return page('Terlalu banyak permintaan', '<p>Tunggu satu jam sebelum mencoba lagi.</p>', 429);
  const account = await statement(db, 'SELECT id,name FROM affiliates WHERE email_hash = ? AND active = 1', emailKey).first();
  if (account) {
    await statement(db, `INSERT INTO affiliate_email_signals (affiliate_id,normalized_hash) VALUES (?,?)
      ON CONFLICT (affiliate_id) DO UPDATE SET normalized_hash=excluded.normalized_hash`,account.id,await emailSignalHash(email)).run();
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    // Recovery tokens are domain-separated from signup tokens so they cannot create accounts.
    await statement(db, `INSERT INTO affiliate_verification_requests
      (token_hash, email_hash, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
      await hash(`recovery:${token}`), emailKey, account.name, now, now + 30 * 60000).run();
    const verifyUrl = `${url.origin}${affiliateRoot}/recover/verify/${token}`;
    try {
      const sent = await fetch('https://api.resend.com/emails', { method:'POST', redirect:'manual', signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`, 'Content-Type':'application/json'},
        body:JSON.stringify({from:'DagangOS <contact@dagangos.com>',to:[email],subject:'Pulihkan akses afiliasi DagangOS',
          text:`Untuk memulihkan akses dasbor afiliasi, buka tautan ini dalam 30 menit:\n\n${verifyUrl}\n\nKode afiliasi dan komisi tetap tersimpan. Jika Anda tidak meminta ini, abaikan email ini.`}) });
      if (!sent.ok) console.error('Affiliate recovery email failed', { status: sent.status });
    } catch { console.error('Affiliate recovery email failed', { type: 'network' }); }
  }
  return page('Periksa email Anda', `<p>Jika email terhubung dengan akun afiliasi aktif, tautan pemulihan akan dikirim dan berlaku selama 30 menit.</p>
    <p>Periksa folder spam. Jika belum menerima email, coba lagi atau <a href="mailto:contact@dagangos.com">hubungi tim DagangOS</a>.</p>`);
}

async function verifyAffiliateRecovery(db, request, url, token) {
  if (!token && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
    const raw = await request.text();
    if (raw.length > 256) return page('Permintaan tidak valid', '', 413);
    token = new URLSearchParams(raw).get('token');
  }
  if (!accessPattern.test(token || '')) return page('Tautan tidak valid', `<a href="${affiliateRoot}/recover">Minta tautan baru</a>`, 404);
  const tokenHash = await hash(`recovery:${token}`), now = Date.now();
  if (request.method === 'GET' || request.method === 'HEAD') {
    const pending = await statement(db, `SELECT token_hash FROM affiliate_verification_requests
      WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`, tokenHash, now).first();
    const response = pending ? page('Pulihkan akses dasbor', `<p>Konfirmasi untuk membuat kode akses baru. Kode afiliasi dan komisi Anda tetap sama.</p>
      <form method="post" action="${affiliateRoot}/recover/verify"><input type="hidden" name="token" value="${token}"><button type="submit">Buat kode akses baru</button></form>`)
      : page('Tautan kedaluwarsa', `<p>Minta tautan pemulihan baru.</p><a href="${affiliateRoot}/recover">Minta tautan baru</a>`, 410);
    response.headers.set('Referrer-Policy', 'origin');
    return response;
  }
  if (request.method !== 'POST') return page('Metode tidak didukung', '', 405);
  if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid', '', 403);
  const pending = await statement(db, `UPDATE affiliate_verification_requests SET consumed_at = ?
    WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING email_hash`, now, tokenHash, now).first();
  if (!pending) return page('Tautan kedaluwarsa', `<a href="${affiliateRoot}/recover">Minta tautan baru</a>`, 410);
  const access = hex(crypto.getRandomValues(new Uint8Array(32)));
  const account = await statement(db, 'UPDATE affiliates SET access_hash = ? WHERE email_hash = ? AND active = 1 RETURNING code',
    await hash(access), pending.email_hash).first();
  if (!account) return page('Akun dalam peninjauan', '<p>Hubungi tim DagangOS untuk bantuan.</p>', 403);
  await statement(db, 'UPDATE affiliate_verification_requests SET consumed_at = ? WHERE email_hash = ? AND consumed_at IS NULL', now, pending.email_hash).run();
  const response = page('Akses berhasil dipulihkan', `<p>Ini akun yang sama. Kode afiliasi Anda tetap <strong>${escape(account.code)}</strong>, dan riwayat serta komisi Anda tetap tersimpan.</p>
    <p>Simpan kode akses dasbor baru ini di tempat aman. Kode akses sebelumnya tidak lagi berlaku.</p>
    <label for="new-access">Kode akses dasbor baru</label><div class="affiliate-copy"><input id="new-access" value="${access}" readonly><button type="button" data-copy-for="new-access" hidden>Salin</button></div><span class="affiliate-copy-status" aria-live="polite"></span>
    <p><a href="${affiliateRoot}">Buka dasbor</a></p>`);
  response.headers.append('Set-Cookie', cookie(sessionCookie, access, affiliateRoot));
  return response;
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
    WHERE affiliates.active = 1 RETURNING id, code`, crypto.randomUUID(), code, pending.name, pending.email_hash, await hash(access), now).first();
  if (!account) return page('Akun dalam peninjauan', '<p>Hubungi tim DagangOS untuk bantuan.</p>', 403);
  await statement(db, `INSERT INTO affiliate_agreement_acceptances (affiliate_id,version,accepted_at,source)
    SELECT ?,version,accepted_at,'signup' FROM affiliate_signup_agreements WHERE token_hash=?
    ON CONFLICT (affiliate_id,version) DO NOTHING`,account.id,tokenHash).run();
  await statement(db, `INSERT INTO affiliate_email_signals (affiliate_id,normalized_hash)
    SELECT ?,normalized_hash FROM affiliate_signup_email_signals WHERE token_hash=?
    ON CONFLICT (affiliate_id) DO UPDATE SET normalized_hash=excluded.normalized_hash`,account.id,tokenHash).run();
  const response = page('Email terverifikasi', `<p>Akun afiliasi siap digunakan. Kode afiliasi Anda: <strong>${escape(account.code)}</strong>.</p>
    <p>Simpan kode akses dasbor ini di tempat aman. Kode akses berbeda dari kode afiliasi dan hanya ditampilkan sekarang.</p>
    <label for="new-access">Kode akses dasbor</label><div class="affiliate-copy"><input id="new-access" value="${access}" readonly><button type="button" data-copy-for="new-access" hidden>Salin</button></div><span class="affiliate-copy-status" aria-live="polite"></span>
    <p>Jika kode akses hilang, gunakan <a href="${affiliateRoot}/recover">pemulihan kode akses</a>.</p><p><a href="${affiliateRoot}">Buka dasbor</a></p>`);
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
    FROM affiliate_code_registry registry JOIN affiliates affiliate ON affiliate.id = registry.affiliate_id CROSS JOIN affiliate_products product
    WHERE registry.code = ? AND affiliate.active = 1 AND product.id = ? AND product.mode <> 'upcoming'`, code, product).first();
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
  if (path === '/api/affiliate/admin/disputes') {
    if (data?.action === 'list') {
      const rows=await statement(db,`SELECT dispute.id,dispute.status,dispute.updated_at,dispute.due_at,
        dispute.order_id,sale.product_id,affiliate.code AS affiliate_code
        FROM affiliate_disputes dispute JOIN affiliate_acquisitions sale ON sale.order_id=dispute.order_id
        JOIN affiliates affiliate ON affiliate.id=sale.affiliate_id
        WHERE dispute.status <> 'WON' AND NOT (dispute.status='LOST' AND EXISTS (
          SELECT 1 FROM affiliate_dispute_reviews review WHERE review.dispute_id=dispute.id AND review.provider_updated_at=dispute.updated_at))
        ORDER BY COALESCE(dispute.due_at,dispute.updated_at),dispute.id LIMIT 100`).all();
      return json({disputes:rows.results});
    }
    const reason=typeof data?.reason==='string'?data.reason.trim():'';
    if (!['release','reverse'].includes(data?.action) || !/^mi-dspt-[a-zA-Z0-9-]{8,100}$/.test(data?.id || '')
      || !/^[a-zA-Z0-9@._-]{1,100}$/.test(data?.reviewer || '') || reason.length<10 || reason.length>500 || /[\x00-\x1f\x7f]/.test(reason)) {
      return json({error:'Invalid dispute review request'},400);
    }
    const now=Date.now();
    const statements=[statement(db,`INSERT INTO affiliate_dispute_reviews (dispute_id,provider_updated_at,decision,reviewer,reason,reviewed_at)
      SELECT id,updated_at,?,?,?,? FROM affiliate_disputes WHERE id=? AND status='LOST'
      ON CONFLICT (dispute_id,provider_updated_at) DO NOTHING`,data.action,data.reviewer,reason,now,data.id)];
    if (data.action === 'reverse') statements.push(
      statement(db,`UPDATE affiliate_acquisitions SET state='reversed',settlement_verified_at=0
        WHERE order_id=(SELECT order_id FROM affiliate_disputes WHERE id=?) AND state IN ('requested','paid','settled')
          AND EXISTS (SELECT 1 FROM affiliate_dispute_reviews r JOIN affiliate_disputes d ON d.id=r.dispute_id
            WHERE d.id=? AND d.status='LOST' AND r.provider_updated_at=d.updated_at AND r.decision='reverse' AND r.reviewer=? AND r.reviewed_at=?)`,
      data.id,data.id,data.reviewer,now),
      statement(db,`INSERT INTO affiliate_ledger (order_id,affiliate_id,product_id,kind,amount,provider_reference,recorded_at)
        SELECT c.order_id,c.affiliate_id,c.product_id,'reversal',-c.amount,?,? FROM affiliate_ledger c
        JOIN affiliate_disputes d ON d.order_id=c.order_id JOIN affiliate_acquisitions sale ON sale.order_id=c.order_id
        JOIN affiliate_dispute_reviews r ON r.dispute_id=d.id AND r.provider_updated_at=d.updated_at
        WHERE d.id=? AND d.status='LOST' AND r.decision='reverse' AND r.reviewer=? AND r.reviewed_at=?
          AND c.kind='commission' AND sale.state='reversed' ON CONFLICT (order_id,kind) DO NOTHING`,
      data.id,now,data.id,data.reviewer,now));
    const results=await db.batch(statements);
    return results[0].meta.changes ? json({status:'reviewed',decision:data.action}) : json({error:'Dispute changed or was already reviewed'},409);
  }
  if (path === '/api/affiliate/admin/payouts') {
    if (data?.action === 'list') {
      if (!env.AFFILIATE_BANK_KEY) return json({ error: 'Payout review unavailable' }, 503);
      const {paidBy}=await cutoff(db,Date.now());
      const rows = (await db.prepare(`SELECT p.*, a.name AS affiliate_name, a.code AS affiliate_code,
        (SELECT COUNT(*) FROM affiliate_disputes dispute JOIN affiliate_acquisitions sale ON sale.order_id=dispute.order_id
          WHERE sale.affiliate_id=p.affiliate_id AND dispute.status <> 'WON'
            AND NOT (dispute.status='LOST' AND EXISTS (SELECT 1 FROM affiliate_dispute_reviews review
              WHERE review.dispute_id=dispute.id AND review.provider_updated_at=dispute.updated_at))) AS open_disputes,
        EXISTS (SELECT 1 FROM affiliate_agreement_acceptances agreement WHERE agreement.affiliate_id=p.affiliate_id AND agreement.version=?) AS agreement_accepted,
        EXISTS (SELECT 1 FROM affiliate_bank_destinations b WHERE b.affiliate_id=p.affiliate_id
          AND b.updated_at=p.destination_updated_at AND b.bank_code=p.bank_code AND b.last_four=p.last_four
          AND b.encrypted_details=p.encrypted_details AND b.nonce=p.nonce) AS destination_current,
        (SELECT COUNT(*) FROM affiliate_ledger c JOIN affiliate_acquisitions s ON s.order_id=c.order_id
          LEFT JOIN affiliate_payout_preflight_checks checked ON checked.payout_id=p.id AND checked.order_id=s.order_id
          WHERE c.affiliate_id=p.affiliate_id AND c.kind='commission' AND s.paid_at<=?
            AND NOT EXISTS (SELECT 1 FROM affiliate_ledger r WHERE r.order_id=c.order_id AND r.kind='reversal')
            AND (checked.checked_at IS NULL OR checked.checked_at<? OR s.settlement_verified_at<checked.checked_at OR s.state<>'settled')) AS checks_remaining
        FROM affiliate_payouts p JOIN affiliates a ON a.id = p.affiliate_id
        WHERE p.status IN ('proposed', 'approved', 'submitted', 'unknown') ORDER BY p.created_at LIMIT 100`).bind(AFFILIATE_AGREEMENT_VERSION,paidBy,Date.now()-7200000).all()).results;
      const payouts = [];
      for (const row of rows) {
        const destination = await decryptDestination(env.AFFILIATE_BANK_KEY, row);
        const reviewNotes=[];
        if (!row.agreement_accepted) reviewNotes.push('Affiliate has not accepted the current agreement.');
        if (!row.destination_current) reviewNotes.push('Bank destination changed; cancel and review a new proposal.');
        if (row.open_disputes) reviewNotes.push(`${row.open_disputes} dispute(s) require review.`);
        if (row.status==='proposed') reviewNotes.push('Verify identity and ownership of the exact bank account before approval.');
        if (row.status==='approved' && row.checks_remaining) reviewNotes.push(`${row.checks_remaining} payment(s) need current provider checks before transfer.`);
        if (row.status==='unknown') reviewNotes.push('Transfer outcome is uncertain; do not submit a replacement.');
        if (row.status==='submitted') reviewNotes.push('Transfer submitted; awaiting provider outcome.');
        payouts.push({ id: row.id, affiliate: row.affiliate_name, code: row.affiliate_code,
          amount: row.amount, status: row.status, bank: row.bank_code,
          accountName: destination.accountName, accountLastFour: row.last_four, createdAt: row.created_at, openDisputes:row.open_disputes,
          agreementAccepted:row.agreement_accepted === 1, destinationCurrent:row.destination_current === 1,
          checksRemaining:row.checks_remaining, reviewNotes });
      }
      return json({ payouts });
    }
    if (['approve', 'cancel'].includes(data?.action) && uuidPattern.test(data?.id || '')
      && /^[a-zA-Z0-9@._-]{1,100}$/.test(data?.reviewer || '')) {
      if (data.action === 'approve' && (data.identityVerified !== true || data.bankOwnershipVerified !== true)) {
        return json({ error: 'Verify the affiliate identity and bank account ownership before approval' }, 400);
      }
      const changed = await reviewAffiliatePayout(db, data.id, data.reviewer, data.action, Date.now(), data);
      return json(changed ? { status: data.action === 'approve' ? 'approved' : 'cancelled' }
        : { error: 'Payout changed or is no longer eligible for review' }, changed ? 200 : 409);
    }
    return json({ error: 'Invalid payout review request' }, 400);
  }
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
    SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM affiliate_code_registry WHERE code = ?)
    ON CONFLICT DO NOTHING
  `, crypto.randomUUID(), code, name, await emailHash(email), await hash(token), Date.now(), code).run();
  if (!result.meta.changes) return json({ error: 'Code or email already registered' }, 409);
  await statement(db, `INSERT INTO affiliate_email_signals (affiliate_id,normalized_hash)
    SELECT id,? FROM affiliates WHERE email_hash=? ON CONFLICT (affiliate_id) DO UPDATE SET normalized_hash=excluded.normalized_hash`,
  await emailSignalHash(email),await emailHash(email)).run();
  return json({ code, dashboard: `https://dagangos.com${affiliateRoot}`, accessCode: token }, 201);
}

// Authenticate delivery and independently read the provider's current state.
// A delayed or duplicated webhook therefore cannot restore an older status.
async function disputeWebhook(request, env) {
  if (request.method !== 'POST') return json({error:'Method not allowed'},405);
  if (!equalToken(request.headers.get('x-callback-token'), env.XENDIT_WEBHOOK_TOKEN)) return json({error:'Forbidden'},403);
  if (!env.AFFILIATE_DB || !(env.AFFILIATE_XENDIT_KEY || env.XENDIT_SECRET_KEY)) return json({error:'Unavailable'},503);
  const raw=await request.text();
  if (raw.length>32768) return json({error:'Invalid event'},413);
  let event;try {event=JSON.parse(raw);} catch {return json({error:'Invalid event'},400);}
  const eventName=typeof event?.event === 'string' ? event.event.toLowerCase().replace(/^dispute_/, 'dispute.') : '';
  if (!/^dispute\.(action_required|under_review|won|lost|due_date_approaching)$/.test(eventName)
    || !/^mi-dspt-[a-zA-Z0-9-]{8,100}$/.test(event?.id || '')) return json({error:'Invalid event'},400);
  // The authenticated dashboard test uses a public example reference. Events
  // explicitly outside our order namespace do not need a provider lookup.
  if (typeof event.reference_id === 'string' && event.reference_id &&
      !subscriptionReference(event.reference_id)) return json({status:'not_applicable'});
  const disputePath=`/v1/disputes/${encodeURIComponent(event.id)}`;
  let verified;
  try { verified=await xenditRequest({XENDIT_SECRET_KEY:env.AFFILIATE_XENDIT_KEY || env.XENDIT_SECRET_KEY},disputePath); }
  catch (error) {
    if (!/\(HTTP (401|403)\)/.test(String(error?.message)) || !env.AFFILIATE_XENDIT_KEY || !env.XENDIT_SECRET_KEY
      || env.AFFILIATE_XENDIT_KEY === env.XENDIT_SECRET_KEY) throw error;
    verified=await xenditRequest({XENDIT_SECRET_KEY:env.XENDIT_SECRET_KEY},disputePath);
  }
  const updatedAt=Date.parse(verified?.updated_at), dueAt=verified?.due_date ? Date.parse(verified.due_date) : null;
  const verifiedStatus=verified?.status === 'PENDING_ACTION' ? 'ACTION_REQUIRED' : verified?.status;
  if (verified?.id !== event.id || !['ACTION_REQUIRED','UNDER_REVIEW','WON','LOST'].includes(verifiedStatus)
    || typeof verified.payment_id !== 'string' || !verified.payment_id || typeof verified.reference_id !== 'string'
    || !Number.isFinite(updatedAt) || (dueAt !== null && !Number.isFinite(dueAt))) return json({error:'Unverified dispute'},502);
  const orderId=subscriptionReference(verified.reference_id);
  if (verified.currency !== 'IDR' || !orderId) return json({status:'not_applicable'});
  const sale=await findAcquisition(env.AFFILIATE_DB,orderId);
  // A DagangOS order may not have reached the affiliate ledger yet. Ask the
  // provider to retry rather than losing a dispute before reconciliation.
  if (!sale) return json({error:'Order not reconciled'},503);
  if (!sale.affiliate_id) return json({status:'not_applicable'});
  const db=env.AFFILIATE_DB;
  if (orderId !== verified.reference_id) {
    const payment=await findCheckoutPayment(env,{orderId,amount:sale.charged_amount},db);
    if (payment?.payment_reference !== verified.reference_id || payment.payment_id !== verified.payment_id) return json({error:'Dispute payment mismatch'},503);
  }
  const existing=await statement(db,'SELECT order_id,payment_id FROM affiliate_disputes WHERE id=?',verified.id).first();
  if (existing && (existing.order_id !== orderId || existing.payment_id !== verified.payment_id)) return json({error:'Dispute reference mismatch'},409);
  await db.batch([
    statement(db, `INSERT INTO affiliate_disputes (id,order_id,payment_id,status,updated_at,due_at,recorded_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,
      due_at=excluded.due_at,recorded_at=excluded.recorded_at
      WHERE affiliate_disputes.order_id=excluded.order_id AND affiliate_disputes.payment_id=excluded.payment_id
        AND excluded.updated_at > affiliate_disputes.updated_at`,
    verified.id,orderId,verified.payment_id,verifiedStatus,updatedAt,dueAt,Date.now()),
    statement(db, `UPDATE affiliate_acquisitions SET settlement_verified_at=0 WHERE order_id=?
      AND EXISTS (SELECT 1 FROM affiliate_disputes WHERE id=? AND order_id=? AND status <> 'WON')`,
      orderId,verified.id,orderId),
  ]);
  return json({status:'recorded'});
}

async function affiliateRequest(request, env, url, path, admin) {
  if (admin) return operatorApi(request, env, path);
  const db = env.AFFILIATE_DB;
  if (path === AFFILIATE_AGREEMENT_PATH && ['GET','HEAD'].includes(request.method)) return page('Ketentuan Program Afiliasi',AFFILIATE_AGREEMENT_BODY);
  if (path === `${affiliateRoot}/agreement/accept`) {
    if (request.method !== 'POST') return page('Metode tidak didukung','',405);
    if (request.headers.get('Origin') !== url.origin) return page('Permintaan tidak valid','',403);
    const account=await sessionAccount(db,request);
    if (!account) return page('Masuk terlebih dahulu',`<a href="${affiliateRoot}">Masuk</a>`,401);
    const raw=await request.text();
    if (raw.length>256 || new URLSearchParams(raw).get('version') !== AFFILIATE_AGREEMENT_VERSION) return page('Ketentuan telah berubah',`<a href="${AFFILIATE_AGREEMENT_PATH}">Baca ketentuan terbaru</a>`,400);
    await statement(db,`INSERT INTO affiliate_agreement_acceptances (affiliate_id,version,accepted_at,source)
      VALUES (?,?,?,'dashboard') ON CONFLICT (affiliate_id,version) DO NOTHING`,account.id,AFFILIATE_AGREEMENT_VERSION,Date.now()).run();
    return redirect(affiliateRoot);
  }
  if ([`${affiliateRoot}/dashboard`, `${affiliateRoot}/export/aktivitas`, `${affiliateRoot}/export/pembayaran`].includes(path)) return affiliateDashboardAction(db, request, env, url, path);
  if (path.startsWith(`${affiliateRoot}/pembayaran/`)) return affiliatePayoutReceipt(db, request, path.slice(`${affiliateRoot}/pembayaran/`.length));
  if (path === `${affiliateRoot}/register`) return registerAffiliate(db, request, env, url);
  if (path === `${affiliateRoot}/kode`) return changeAffiliateCode(db, request, url);
  if (path === `${affiliateRoot}/recover`) return recoverAffiliate(db, request, env, url);
  if (path === `${affiliateRoot}/recover/verify` || path.startsWith(`${affiliateRoot}/recover/verify/`)) return verifyAffiliateRecovery(db, request, url, path.slice(`${affiliateRoot}/recover/verify/`.length));
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
      : page('Kode akses tidak valid', `<p><a href="${affiliateRoot}#masuk">Coba lagi</a> atau <a href="${affiliateRoot}/recover">pulihkan akses melalui email</a>.</p>`, 401);
  }
  if (!['GET', 'HEAD'].includes(request.method)) return page('Metode tidak didukung', `<a href="${affiliateRoot}">Kembali</a>`, 405);
  if (path === affiliateRoot) return affiliateHome(db, request, env);
  const [, , rawCode, product, extra] = path.split('/');
  const code = rawCode?.toUpperCase();
  if (!codePattern.test(code || '') || extra !== undefined) return page('Tautan rujukan tidak ditemukan', '<a href="/produk">Lihat produk DagangOS</a>', 404);
  if (productPattern.test(product || '')) return visitProduct(db, request, code, product);
  const account = !product && await statement(db, `SELECT affiliate.id FROM affiliate_code_registry registry
    JOIN affiliates affiliate ON affiliate.id = registry.affiliate_id WHERE registry.code = ? AND affiliate.active = 1`, code).first();
  if (!account) return page('Tautan rujukan tidak ditemukan', '<a href="/produk">Lihat produk DagangOS</a>', 404);
  const products = (await activeProducts(db)).filter(item => item.mode === 'subscription');
  return page('Pilih produk DagangOS', `<ul>${products.map(item => `<li><a href="${affiliateRoot}/${code}/${item.id}">${escape(item.name)}</a></li>`).join('')}</ul>`);
}

export async function handleAffiliate(request, env) {
  const url = new URL(request.url);
  const requestedPath = url.pathname.replace(/\/$/, '');
  if (requestedPath === '/api/affiliate/webhooks/disputes') {
    try { return await disputeWebhook(request,env); }
    catch { return json({error:'Dispute verification unavailable'},503); }
  }
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
  const admin = ['/api/affiliate/admin/accounts', '/api/affiliate/admin/reconcile', '/api/affiliate/admin/payouts', '/api/affiliate/admin/disputes'].includes(path);
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
