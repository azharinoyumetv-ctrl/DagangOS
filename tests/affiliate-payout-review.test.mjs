import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { proposeAffiliatePayout, reviewAffiliatePayout } from '../src/affiliate-payout-review.js';
import { executeApprovedPayout, reconcilePayout } from '../src/affiliate-payout-execute.js';
import { runAffiliatePayoutBatch } from '../src/affiliate-payout-scheduler.js';
import { findPayout, getPayout } from '../src/affiliate-payout-provider.js';

const affiliateId = '11111111-1111-4111-8111-111111111111';
const now = Date.parse('2026-11-25T08:00:00.000Z');
const day = 86400000;

async function setup(t) {
  const stateRoot = resolve('.wrangler');
  await mkdir(stateRoot, { recursive: true });
  const state = await mkdtemp(join(stateRoot, 'payout-review-test-'));
  const worker = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response() } }',
    compatibilityDate: '2026-06-27', d1Databases: ['DB'], d1Persist: state });
  t.after(async () => { await worker.dispose(); if (dirname(resolve(state)) === stateRoot) await rm(state, {recursive: true, force: true}); });
  const db = await worker.getD1Database('DB');
  for (const file of ['0001_affiliate_program.sql','0002_affiliate_attributions.sql','0003_affiliate_payout_policy.sql',
    '0004_affiliate_enrollment.sql','0005_affiliate_reconciliation.sql','0006_affiliate_bank_details.sql','0007_affiliate_payout_review.sql','0008_affiliate_payout_review_audit.sql']) {
    const sql = await readFile(`migrations/${file}`, 'utf8');
    await db.exec(sql.replace(/^--.*$/gm, '').trim().replace(/;\n\n/g, ';\u0000').replace(/\n/g, ' ').replace(/\u0000/g, '\n'));
  }
  await db.prepare('INSERT INTO affiliates (id, code, name, email_hash, access_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(affiliateId, 'PROMOTE01', 'Test', 'email-hash', 'access-hash', now).run();
  await db.prepare('INSERT INTO affiliate_bank_destinations VALUES (?, ?, ?, ?, ?, ?)')
    .bind(affiliateId, 'ID_BCA', '1234', 'ciphertext', 'nonce', now - day).run();
  return db;
}

async function commission(db, number, amount, paidAt, product = 'geraina') {
  const order = `order-${number}`;
  await db.prepare(`INSERT INTO affiliate_acquisitions (order_id, scope_key, product_id, owner_id, store_id,
    affiliate_id, policy_version, tier, period, list_amount, monthly_amount, charged_amount, quote_expires, state, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, 'policy', 'starter', 'monthly', 149000, 149000, 134100, ?, 'settled', ?)`)
    .bind(order, order, product, `owner-${number}`, `store-${number}`, affiliateId, now, new Date(paidAt).toISOString()).run();
  await db.prepare(`INSERT INTO affiliate_ledger (order_id, affiliate_id, product_id, kind, amount, recorded_at)
    VALUES (?, ?, ?, 'commission', ?, ?)`).bind(order, affiliateId, product, amount, now).run();
  await db.prepare('UPDATE affiliate_acquisitions SET settlement_verified_at = ? WHERE order_id = ?').bind(now, order).run();
  return order;
}

test('only matured commission above the threshold can be reserved, and concurrent proposals cannot duplicate it', async t => {
  const db = await setup(t);
  await commission(db, 1, 148999, now - 31 * day);
  await commission(db, 2, 50000, now - 29 * day);
  assert.equal(await proposeAffiliatePayout(db, affiliateId, now), null);
  await commission(db, 3, 1, now - 30 * day, 'dapuros');
  const results = await Promise.all([proposeAffiliatePayout(db, affiliateId, now), proposeAffiliatePayout(db, affiliateId, now)]);
  assert.equal(results.filter(Boolean).length, 1);
  const row = await db.prepare('SELECT amount, status, last_four FROM affiliate_payouts').first();
  assert.deepEqual(row, { amount: 149000, status: 'proposed', last_four: '1234' });
  assert.equal(await reviewAffiliatePayout(db, results.find(Boolean), 'owner', 'approve', now), true);
  assert.equal(await reviewAffiliatePayout(db, results.find(Boolean), 'owner', 'approve', now), false);
  await assert.rejects(db.prepare("UPDATE affiliate_payouts SET status = 'succeeded' WHERE id = ?").bind(results.find(Boolean)).run());
});

test('review fails after a destination change or commission reversal and cancellation releases the reservation', async t => {
  const db = await setup(t);
  const order = await commission(db, 1, 149000, now - 31 * day);
  const id = await proposeAffiliatePayout(db, affiliateId, now);
  await db.prepare('UPDATE affiliate_bank_destinations SET encrypted_details = ? WHERE affiliate_id = ?').bind('changed', affiliateId).run();
  assert.equal(await reviewAffiliatePayout(db, id, 'owner', 'approve', now), false);
  await db.prepare('UPDATE affiliate_bank_destinations SET encrypted_details = ? WHERE affiliate_id = ?').bind('ciphertext', affiliateId).run();
  await db.prepare(`INSERT INTO affiliate_ledger (order_id, affiliate_id, product_id, kind, amount, recorded_at)
    VALUES (?, ?, 'geraina', 'reversal', -149000, ?)`).bind(order, affiliateId, now).run();
  assert.equal(await reviewAffiliatePayout(db, id, 'owner', 'approve', now), false);
  assert.equal(await reviewAffiliatePayout(db, id, 'owner', 'cancel', now), true);
  assert.equal(await proposeAffiliatePayout(db, affiliateId, now), null);
  await assert.rejects(db.prepare('DELETE FROM affiliate_payouts WHERE id = ?').bind(id).run());
});

test('execution requires approval and the 25th, claims once, and preserves an unknown outcome', async t => {
  const db = await setup(t);
  await commission(db, 1, 149000, now - 31 * day);
  const key = new Uint8Array(32);
  const iv = new Uint8Array(12);
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:new TextEncoder().encode(affiliateId)}, cryptoKey,
    new TextEncoder().encode(JSON.stringify({name:'Test Owner', number:'1234567890'})));
  const hex = value => Buffer.from(value).toString('hex');
  await db.prepare('UPDATE affiliate_bank_destinations SET encrypted_details = ?, nonce = ? WHERE affiliate_id = ?')
    .bind(hex(cipher), hex(iv), affiliateId).run();
  const id = await proposeAffiliatePayout(db, affiliateId, now);
  const env = { AFFILIATE_PAYOUTS:'on', AFFILIATE_BANK_KEY:Buffer.from(key).toString('base64'), AFFILIATE_XENDIT_KEY:'fixture' };
  let requests = 0;
  const send = async (credential, payout) => { requests++; assert.equal(credential, 'fixture');
    assert.equal(payout.reference, `affiliate-${id}`); assert.equal(payout.amount, 149000);
    assert.equal(payout.accountName, 'Test Owner'); assert.equal(payout.accountNumber, '1234567890');
    throw new Error('network outcome unknown'); };
  assert.deepEqual(await executeApprovedPayout(db, env, id, now, send), {status:'not_approved'});
  assert.equal(await reviewAffiliatePayout(db, id, 'owner', 'approve', now), true);
  assert.deepEqual(await executeApprovedPayout(db, env, id, now - day, send), {status:'not_due'});
  const results = await Promise.all([executeApprovedPayout(db, env, id, now, send), executeApprovedPayout(db, env, id, now, send)]);
  assert.equal(requests, 1);
  assert.ok(results.some(result => result.status === 'unknown'));
  assert.equal(await db.prepare('SELECT status FROM affiliate_payouts WHERE id = ?').bind(id).first('status'), 'unknown');
  assert.deepEqual(await executeApprovedPayout(db, env, id, now, send), {status:'not_approved'});
});

test('execution rechecks bank changes after approval and records a successful transfer once', async t => {
  const db = await setup(t);
  await commission(db, 1, 149000, now - 31 * day, 'dapuros');
  const key = new Uint8Array(32), iv = new Uint8Array(12);
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:new TextEncoder().encode(affiliateId)},
    await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']),
    new TextEncoder().encode(JSON.stringify({name:'Owner', number:'1234567890'})));
  const hex = value => Buffer.from(value).toString('hex');
  await db.prepare('UPDATE affiliate_bank_destinations SET encrypted_details = ?, nonce = ? WHERE affiliate_id = ?')
    .bind(hex(cipher), hex(iv), affiliateId).run();
  const id = await proposeAffiliatePayout(db, affiliateId, now);
  assert.equal(await reviewAffiliatePayout(db, id, 'owner', 'approve', now), true);
  const env = { AFFILIATE_PAYOUTS:'on', AFFILIATE_BANK_KEY:Buffer.from(key).toString('base64'), AFFILIATE_XENDIT_KEY:'fixture' };
  let calls = 0;
  const send = async () => { calls++; return {id:'disb-fixture-1234', status:'SUCCEEDED'}; };
  await db.prepare('UPDATE affiliate_bank_destinations SET updated_at = updated_at + 1 WHERE affiliate_id = ?').bind(affiliateId).run();
  assert.deepEqual(await executeApprovedPayout(db, env, id, now, send), {status:'not_eligible'});
  assert.equal(calls, 0);
  await db.prepare('UPDATE affiliate_bank_destinations SET updated_at = updated_at - 1 WHERE affiliate_id = ?').bind(affiliateId).run();
  await db.prepare('UPDATE affiliate_acquisitions SET settlement_verified_at = ?').bind(now - 7200001).run();
  assert.deepEqual(await executeApprovedPayout(db, env, id, now, send), {status:'not_eligible'});
  assert.equal(calls, 0);
  await db.prepare('UPDATE affiliate_acquisitions SET settlement_verified_at = ?').bind(now).run();
  await db.prepare('UPDATE affiliate_acquisitions SET reconciled_at = ?').bind(now + 1).run();
  assert.deepEqual(await executeApprovedPayout(db, env, id, now, send), {status:'not_eligible'});
  await db.prepare('UPDATE affiliate_acquisitions SET reconciled_at = ?').bind(now).run();
  assert.deepEqual(await executeApprovedPayout(db, env, id, now, send), {status:'succeeded'});
  assert.deepEqual(await db.prepare('SELECT status, provider_id FROM affiliate_payouts WHERE id = ?').bind(id).first(),
    {status:'succeeded', provider_id:'disb-fixture-1234'});
  assert.deepEqual(await executeApprovedPayout(db, env, id, now, send), {status:'not_approved'});
  assert.equal(calls, 1);
  assert.equal(await proposeAffiliatePayout(db, affiliateId, now), null);
});

test('an uncertain transfer is reconciled by reference without submitting a second payment', async t => {
  const db = await setup(t);
  await commission(db, 1, 149000, now - 31 * day);
  const id = await proposeAffiliatePayout(db, affiliateId, now);
  assert.equal(await reviewAffiliatePayout(db, id, 'owner', 'approve', now), true);
  await db.prepare("UPDATE affiliate_payouts SET status = 'unknown' WHERE id = ?").bind(id).run();
  const row = await db.prepare('SELECT * FROM affiliate_payouts WHERE id = ?').bind(id).first();
  const find = async (_key, query) => {
    assert.equal(query.reference, `affiliate-${id}`);
    return {id:'disb-fixture-1234', status:'SUCCEEDED'};
  };
  assert.deepEqual(await reconcilePayout(db, 'fixture', row, () => { throw new Error('unexpected ID lookup'); }, find), {status:'succeeded'});
  assert.deepEqual(await db.prepare('SELECT status, provider_id FROM affiliate_payouts WHERE id = ?').bind(id).first(),
    {status:'succeeded', provider_id:'disb-fixture-1234'});
});

test('an approval can be cancelled before sending and both decisions remain in the audit history', async t => {
  const db = await setup(t);
  await commission(db, 1, 149000, now - 31 * day);
  const id = await proposeAffiliatePayout(db, affiliateId, now);
  assert.equal(await reviewAffiliatePayout(db, id, 'reviewer1', 'approve', now), true);
  assert.equal(await reviewAffiliatePayout(db, id, 'reviewer2', 'cancel', now + 1000), true);
  assert.deepEqual((await db.prepare('SELECT action, reviewer FROM affiliate_payout_review_events WHERE payout_id = ? ORDER BY id')
    .bind(id).all()).results, [{action:'approved', reviewer:'reviewer1'}, {action:'cancelled', reviewer:'reviewer2'}]);
  await assert.rejects(db.prepare('DELETE FROM affiliate_payout_review_events WHERE payout_id = ?').bind(id).run());
});

test('opt-in Xendit development-mode payout from local review through provider read-back', { skip: process.env.AFFILIATE_SANDBOX_E2E !== '1' }, async t => {
  const sandboxKey = process.env.XENDIT_API_SANDBOX || '';
  if (!sandboxKey.startsWith('xnd_development_')) throw new Error('A development-mode credential is required');
  const db = await setup(t);
  await commission(db, 1, 149000, now - 31 * day, 'geraina');
  const key = new Uint8Array(32), iv = new Uint8Array(12);
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:new TextEncoder().encode(affiliateId)},
    await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']),
    new TextEncoder().encode(JSON.stringify({name:'DagangOS Test', number:'1234567890'})));
  await db.prepare('UPDATE affiliate_bank_destinations SET encrypted_details = ?, nonce = ? WHERE affiliate_id = ?')
    .bind(Buffer.from(cipher).toString('hex'), Buffer.from(iv).toString('hex'), affiliateId).run();
  const env = {AFFILIATE_DB:db, AFFILIATE_PAYOUT_REVIEW:'on', AFFILIATE_PAYOUTS:'on',
    AFFILIATE_BANK_KEY:Buffer.from(key).toString('base64'), AFFILIATE_XENDIT_KEY:sandboxKey};
  assert.equal((await runAffiliatePayoutBatch({...env, AFFILIATE_PAYOUTS:'off'}, now)).prepared, 1);
  const id = await db.prepare("SELECT id FROM affiliate_payouts WHERE status = 'proposed'").first('id');
  assert.equal(await reviewAffiliatePayout(db, id, 'sandbox-reviewer', 'approve', now), true);
  const result = await runAffiliatePayoutBatch(env, now);
  assert.equal(result.executed, 1);
  assert.equal(result.failed, 0);
  const row = await db.prepare('SELECT * FROM affiliate_payouts WHERE id = ?').bind(id).first();
  assert.ok(['submitted', 'succeeded'].includes(row.status));
  assert.ok(row.provider_id);
  const params = {id:row.provider_id, reference:`affiliate-${id}`, amount:149000};
  const byId = await getPayout(sandboxKey, params);
  const byReference = await findPayout(sandboxKey, params);
  assert.equal(byId.id, byReference.id);
  assert.equal(byId.amount, 149000);
});
