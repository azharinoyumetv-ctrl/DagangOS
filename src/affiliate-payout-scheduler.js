import { prepareAffiliatePayouts } from './affiliate-payout-review.js';
import { executeApprovedPayout, reconcilePayout } from './affiliate-payout-execute.js';

// Separate gates allow review to be prepared without authorizing live sends.
export async function runAffiliatePayoutBatch(env, now = Date.now()) {
  if (!env.AFFILIATE_DB || env.AFFILIATE_PAYOUT_REVIEW !== 'on') return { prepared: 0, executed: 0, failed: 0 };
  const db = env.AFFILIATE_DB;
  const result = { prepared: await prepareAffiliatePayouts(db, now, 2), executed: 0, failed: 0 };
  if (env.AFFILIATE_PAYOUTS !== 'on' || !env.AFFILIATE_XENDIT_KEY) return result;
  const policy = await db.prepare('SELECT payout_day FROM affiliate_payout_policy WHERE id = 1').first();
  if (policy && new Date(now + 7 * 3600000).getUTCDate() === policy.payout_day) {
    const approved = await db.prepare("SELECT id FROM affiliate_payouts WHERE status = 'approved' ORDER BY reconciled_at, created_at LIMIT 2").all();
    for (const row of approved.results) {
      await db.prepare("UPDATE affiliate_payouts SET reconciled_at = ? WHERE id = ? AND status = 'approved'").bind(now, row.id).run();
      try { const outcome = await executeApprovedPayout(db, env, row.id, now); if (outcome.status !== 'not_eligible') result.executed++; }
      catch { result.failed++; }
    }
  }
  const pending = await db.prepare(`SELECT * FROM affiliate_payouts WHERE status IN ('unknown', 'submitted', 'succeeded')
    AND reconciled_at <= ? ORDER BY reconciled_at, created_at LIMIT 2`).bind(now - 3600000).all();
  for (const row of pending.results) {
    await db.prepare('UPDATE affiliate_payouts SET reconciled_at = ? WHERE id = ?').bind(now, row.id).run();
    try { await reconcilePayout(db, env.AFFILIATE_XENDIT_KEY, row, undefined, undefined, now); } catch { result.failed++; }
  }
  return result;
}
