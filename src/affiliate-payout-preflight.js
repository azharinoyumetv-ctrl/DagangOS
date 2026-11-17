import { cutoff } from './affiliate-payout-review.js';
import { reconcileAcquisition } from './affiliate-program.js';
import { xenditRequest } from './xendit-payments.js';

// A Worker invocation shares its provider-request budget with scheduled
// reconciliation. Large payouts are checked in bounded, resumable batches.
const BATCH_SIZE = 12;
const EVIDENCE_AGE = 2 * 60 * 60 * 1000;

export async function verifyPayoutFresh(db, env, payoutId, now = Date.now(), dependencies = {}) {
  if (!env.XENDIT_SECRET_KEY || !env.AFFILIATE_XENDIT_KEY) return { ok:false, reason:'provider_unavailable' };
  const payout = await db.prepare("SELECT affiliate_id FROM affiliate_payouts WHERE id=? AND status='approved'").bind(payoutId).first();
  if (!payout) return { ok:false, reason:'not_approved' };
  const { paidBy } = await cutoff(db, now);
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM affiliate_ledger commission
    JOIN affiliate_acquisitions sale ON sale.order_id=commission.order_id
    WHERE commission.affiliate_id=? AND commission.kind='commission' AND sale.paid_at <= ?
      AND NOT EXISTS (SELECT 1 FROM affiliate_ledger reversal WHERE reversal.order_id=commission.order_id AND reversal.kind='reversal')`).bind(payout.affiliate_id, paidBy).first();
  if (!total?.n) return {ok:false,reason:'review_required'};
  const result = await db.prepare(`SELECT sale.* FROM affiliate_ledger commission
    JOIN affiliate_acquisitions sale ON sale.order_id=commission.order_id
    LEFT JOIN affiliate_payout_preflight_checks checked ON checked.order_id=sale.order_id AND checked.payout_id=?
    WHERE commission.affiliate_id=? AND commission.kind='commission' AND sale.paid_at <= ?
      AND NOT EXISTS (SELECT 1 FROM affiliate_ledger reversal WHERE reversal.order_id=commission.order_id AND reversal.kind='reversal')
      AND (checked.checked_at IS NULL OR checked.checked_at < ? OR sale.settlement_verified_at < checked.checked_at OR sale.state <> 'settled')
    ORDER BY COALESCE(checked.checked_at,0),sale.order_id LIMIT ?`).bind(payoutId,payout.affiliate_id,paidBy,Date.now()-EVIDENCE_AGE,BATCH_SIZE).all();
  // A previous invocation may have stopped after completing checks but before
  // claiming the payout. Start again rather than send on that old evidence.
  if (!result.results.length) {
    await db.prepare('DELETE FROM affiliate_payout_preflight_checks WHERE payout_id=?').bind(payoutId).run();
    return verifyPayoutFresh(db,env,payoutId,now,dependencies);
  }
  const reconcile = dependencies.reconcile || reconcileAcquisition;
  let disputeKey=env.AFFILIATE_XENDIT_KEY;
  const list = dependencies.list || (async order => {
    const path='/v1/disputes?' + new URLSearchParams({search:order,limit:'100'});
    try { return await xenditRequest({XENDIT_SECRET_KEY:disputeKey},path); }
    catch (error) {
      if (!/\(HTTP (401|403)\)/.test(String(error?.message)) || disputeKey === env.XENDIT_SECRET_KEY) throw error;
      disputeKey=env.XENDIT_SECRET_KEY;
      return xenditRequest({XENDIT_SECRET_KEY:env.XENDIT_SECRET_KEY},path);
    }
  });
  for (const sale of result.results) {
    // Remove old evidence before attempting a new check, including on timeouts,
    // missing invoices, incomplete transaction pages, and malformed responses.
    await db.batch([
      db.prepare('DELETE FROM affiliate_payout_preflight_checks WHERE payout_id=? AND order_id=?').bind(payoutId,sale.order_id),
      db.prepare('UPDATE affiliate_acquisitions SET settlement_verified_at=0 WHERE order_id=?').bind(sale.order_id),
    ]);
    const started = Date.now();
    try {
      await reconcile(db,env,sale,true);
      const checked = await db.prepare('SELECT state,settlement_verified_at FROM affiliate_acquisitions WHERE order_id=?').bind(sale.order_id).first();
      if (checked?.state !== 'settled' || checked.settlement_verified_at < started) return {ok:false,reason:'payment_unverified'};
      const disputes = await list(sale.order_id);
      if (!Array.isArray(disputes?.data) || disputes.pagination?.has_more !== false) return {ok:false,reason:'disputes_unverified'};
      for (const item of disputes.data) {
        if (typeof item.reference_id !== 'string') return {ok:false,reason:'disputes_unverified'};
        if (item.reference_id !== sale.order_id) continue;
        const status = item.status === 'PENDING_ACTION' ? 'ACTION_REQUIRED' : item.status;
        const updated = Date.parse(item.updated_at);
        if (!/^mi-dspt-[a-zA-Z0-9-]{8,100}$/.test(item.id || '') || typeof item.payment_id !== 'string' || !item.payment_id
          || !['ACTION_REQUIRED','UNDER_REVIEW','WON','LOST'].includes(status) || !Number.isFinite(updated)) return {ok:false,reason:'disputes_unverified'};
        const existing = await db.prepare('SELECT order_id,payment_id FROM affiliate_disputes WHERE id=?').bind(item.id).first();
        if (existing && (existing.order_id !== sale.order_id || existing.payment_id !== item.payment_id)) return {ok:false,reason:'disputes_unverified'};
        await db.prepare(`INSERT INTO affiliate_disputes (id,order_id,payment_id,status,updated_at,due_at,recorded_at)
          VALUES (?,?,?,?,?,NULL,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,
          recorded_at=excluded.recorded_at WHERE affiliate_disputes.order_id=excluded.order_id
          AND affiliate_disputes.payment_id=excluded.payment_id AND excluded.updated_at > affiliate_disputes.updated_at`)
          .bind(item.id,sale.order_id,item.payment_id,status,updated,Date.now()).run();
      }
      await db.prepare(`INSERT INTO affiliate_payout_preflight_checks (payout_id,order_id,checked_at)
        SELECT ?,order_id,settlement_verified_at FROM affiliate_acquisitions WHERE order_id=? AND state='settled' AND settlement_verified_at>=?
        ON CONFLICT(payout_id,order_id) DO UPDATE SET checked_at=excluded.checked_at`).bind(payoutId,sale.order_id,started).run();
    } catch { return {ok:false,reason:'provider_unavailable'}; }
  }
  const missing=await db.prepare(`SELECT COUNT(*) AS n FROM affiliate_ledger commission
    JOIN affiliate_acquisitions sale ON sale.order_id=commission.order_id
    LEFT JOIN affiliate_payout_preflight_checks checked ON checked.order_id=sale.order_id AND checked.payout_id=?
    WHERE commission.affiliate_id=? AND commission.kind='commission' AND sale.paid_at <= ?
      AND NOT EXISTS (SELECT 1 FROM affiliate_ledger reversal WHERE reversal.order_id=commission.order_id AND reversal.kind='reversal')
      AND (checked.checked_at IS NULL OR checked.checked_at < ? OR sale.settlement_verified_at < checked.checked_at OR sale.state <> 'settled')`)
    .bind(payoutId,payout.affiliate_id,paidBy,Date.now()-EVIDENCE_AGE).first();
  return missing?.n ? {ok:false,reason:'checking'} : {ok:true};
}
