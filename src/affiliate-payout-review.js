// This module only reserves and reviews money already earned. It never sends a
// transfer. Execution must recheck the balance and destination atomically.
const DAY = 86400000;
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export async function cutoff(db, now) {
  if (!Number.isFinite(now)) throw new Error('Invalid review time');
  const policy = await db.prepare('SELECT minimum_idr, wait_days FROM affiliate_payout_policy WHERE id = 1').first();
  if (!policy || !Number.isSafeInteger(policy.minimum_idr) || !Number.isInteger(policy.wait_days)) throw new Error('Payout policy unavailable');
  return { minimum: policy.minimum_idr, paidBy: new Date(now - policy.wait_days * DAY).toISOString() };
}

// Values are computed in the same SQL statement that reserves them. D1
// serializes writes, so concurrent proposals cannot reserve the same balance.
export const availableSql = `
  COALESCE((SELECT SUM(entry.amount) FROM affiliate_ledger entry
    JOIN affiliate_acquisitions sale ON sale.order_id = entry.order_id
    WHERE entry.affiliate_id = a.id AND sale.paid_at IS NOT NULL AND sale.paid_at <= ?), 0)
  - COALESCE((SELECT SUM(p.amount) FROM affiliate_payouts p WHERE p.affiliate_id = a.id
    AND p.status IN ('proposed', 'approved', 'submitted', 'unknown', 'succeeded')), 0)`;

export async function proposeAffiliatePayout(db, affiliateId, now = Date.now()) {
  if (!idPattern.test(affiliateId || '')) throw new Error('Invalid affiliate');
  const { minimum, paidBy } = await cutoff(db, now);
  const id = crypto.randomUUID();
  const result = await statement(db, `
    INSERT INTO affiliate_payouts (id, affiliate_id, amount, bank_code, last_four,
      encrypted_details, nonce, destination_updated_at, created_at, status)
    SELECT ?, a.id, ${availableSql}, b.bank_code, b.last_four,
      b.encrypted_details, b.nonce, b.updated_at, ?, 'proposed'
    FROM affiliates a JOIN affiliate_bank_destinations b ON b.affiliate_id = a.id
    WHERE a.id = ? AND a.active = 1 AND (${availableSql}) >= ?
    ON CONFLICT DO NOTHING
  `, id, paidBy, now, affiliateId, paidBy, minimum).run();
  return result.meta.changes === 1 ? id : null;
}

export async function prepareAffiliatePayouts(db, now = Date.now(), limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error('Invalid batch size');
  const { minimum, paidBy } = await cutoff(db, now);
  const candidates = await statement(db, `SELECT a.id FROM affiliates a
    JOIN affiliate_bank_destinations b ON b.affiliate_id = a.id
    WHERE a.active = 1 AND (${availableSql}) >= ?
      AND NOT EXISTS (SELECT 1 FROM affiliate_payouts p WHERE p.affiliate_id = a.id
        AND p.status IN ('proposed', 'approved', 'submitted', 'unknown'))
    ORDER BY a.id LIMIT ?`, paidBy, minimum, limit).all();
  let created = 0;
  for (const row of candidates.results) if (await proposeAffiliatePayout(db, row.id, now)) created++;
  return created;
}

// Approval is tied to the bank snapshot and rechecks the available balance.
// All earlier reservations, including this proposal, are included in the sum.
export async function reviewAffiliatePayout(db, payoutId, reviewer, decision, now = Date.now()) {
  if (!idPattern.test(payoutId || '') || typeof reviewer !== 'string' || !/^[a-zA-Z0-9@._-]{1,100}$/.test(reviewer)
    || !['approve', 'cancel'].includes(decision)) throw new Error('Invalid review');
  const { paidBy } = await cutoff(db, now);
  const approved = decision === 'approve';
  const result = await statement(db, `
    UPDATE affiliate_payouts SET status = ?, reviewed_at = ?, reviewer = ?
    WHERE id = ? AND status = 'proposed'
      AND (? = 0 OR EXISTS (
        SELECT 1 FROM affiliates a JOIN affiliate_bank_destinations b ON b.affiliate_id = a.id
        WHERE a.id = affiliate_payouts.affiliate_id AND a.active = 1
          AND b.updated_at = affiliate_payouts.destination_updated_at
          AND b.bank_code = affiliate_payouts.bank_code AND b.last_four = affiliate_payouts.last_four
          AND b.encrypted_details = affiliate_payouts.encrypted_details AND b.nonce = affiliate_payouts.nonce
          AND (${availableSql}) >= 0
      ))
  `, approved ? 'approved' : 'cancelled', now, reviewer, payoutId, Number(approved), paidBy).run();
  return result.meta.changes === 1;
}
