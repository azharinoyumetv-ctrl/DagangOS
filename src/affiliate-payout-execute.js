import { availableSql, cutoff } from './affiliate-payout-review.js';
import { createPayout, findPayout, getPayout } from './affiliate-payout-provider.js';
import { AFFILIATE_AGREEMENT_VERSION } from './affiliate-terms.js';

const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const bytes = hex => {
  if (typeof hex !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error('Invalid encrypted destination');
  return Uint8Array.from(hex.match(/../g), part => parseInt(part, 16));
};

export async function decryptDestination(keyText, row) {
  const raw = Uint8Array.from(atob(keyText), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('Invalid bank key');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const value = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(row.nonce),
    additionalData: new TextEncoder().encode(row.affiliate_id) }, key, bytes(row.encrypted_details));
  const details = JSON.parse(new TextDecoder().decode(value));
  return { accountName: details.name, accountNumber: details.number };
}

const mappedStatus = status => ({ ACCEPTED: 'submitted', REQUESTED: 'submitted', SUCCEEDED: 'succeeded',
  FAILED: 'failed', CANCELLED: 'failed', REVERSED: 'reversed' })[status];

// Unknown is a durable pre-send claim: if a request times out, no automatic
// retry is made until the outcome is reconciled against the provider.
export async function executeApprovedPayout(db, env, payoutId, now = Date.now(), send = createPayout) {
  if (!idPattern.test(payoutId || '')) throw new Error('Invalid payout');
  if (env.AFFILIATE_PAYOUTS !== 'on' || !env.AFFILIATE_BANK_KEY || !env.AFFILIATE_XENDIT_KEY) return { status: 'disabled' };
  const policy = await db.prepare('SELECT payout_day FROM affiliate_payout_policy WHERE id = 1').first();
  if (!policy || new Date(now + 7 * 60 * 60 * 1000).getUTCDate() !== policy.payout_day) return { status: 'not_due' };
  const localDate = new Date(now + 7 * 3600000);
  const monthStart = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), 1) - 7 * 3600000;
  const monthEnd = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, 1) - 7 * 3600000;
  const { paidBy } = await cutoff(db, now);
  const row = await db.prepare('SELECT * FROM affiliate_payouts WHERE id = ? AND status = ?').bind(payoutId, 'approved').first();
  if (!row) return { status: 'not_approved' };
  const destination = await decryptDestination(env.AFFILIATE_BANK_KEY, row);
  const claimed = await db.prepare(`UPDATE affiliate_payouts SET status = 'unknown', submitted_at = ?
    WHERE id = ? AND status = 'approved' AND EXISTS (
      SELECT 1 FROM affiliates a JOIN affiliate_bank_destinations b ON b.affiliate_id = a.id
      WHERE a.id = affiliate_payouts.affiliate_id AND a.active = 1
        AND b.updated_at = affiliate_payouts.destination_updated_at
        AND b.bank_code = affiliate_payouts.bank_code AND b.last_four = affiliate_payouts.last_four
        AND b.encrypted_details = affiliate_payouts.encrypted_details AND b.nonce = affiliate_payouts.nonce
        AND EXISTS (SELECT 1 FROM affiliate_agreement_acceptances agreement WHERE agreement.affiliate_id=a.id AND agreement.version=?)
        AND EXISTS (SELECT 1 FROM affiliate_payout_review_attestations attestation
          WHERE attestation.payout_id = affiliate_payouts.id AND attestation.reviewer = affiliate_payouts.reviewer
            AND attestation.reviewed_at = affiliate_payouts.reviewed_at
            AND attestation.identity_verified = 1 AND attestation.bank_ownership_verified = 1)
        AND NOT EXISTS (SELECT 1 FROM affiliate_disputes dispute
          JOIN affiliate_acquisitions disputed_sale ON disputed_sale.order_id = dispute.order_id
          WHERE disputed_sale.affiliate_id = a.id AND dispute.status <> 'WON'
            AND NOT (dispute.status='LOST' AND EXISTS (SELECT 1 FROM affiliate_dispute_reviews review
              WHERE review.dispute_id=dispute.id AND review.provider_updated_at=dispute.updated_at)))
        AND (${availableSql}) >= 0
        AND NOT EXISTS (SELECT 1 FROM affiliate_payouts prior
          WHERE prior.affiliate_id = a.id AND prior.id <> affiliate_payouts.id
            AND prior.status IN ('unknown', 'submitted', 'succeeded')
            AND COALESCE(prior.completed_at, prior.submitted_at) >= ?
            AND COALESCE(prior.completed_at, prior.submitted_at) < ?)
        AND NOT EXISTS (
          SELECT 1 FROM affiliate_ledger c JOIN affiliate_acquisitions s ON s.order_id = c.order_id
          WHERE c.affiliate_id = a.id AND c.kind = 'commission' AND s.paid_at <= ?
            AND NOT EXISTS (SELECT 1 FROM affiliate_ledger rev WHERE rev.order_id = c.order_id AND rev.kind = 'reversal')
            AND (s.state <> 'settled' OR s.settlement_verified_at < ? OR s.settlement_verified_at < s.reconciled_at)
        )
    )`).bind(now, payoutId, AFFILIATE_AGREEMENT_VERSION, paidBy, monthStart, monthEnd, paidBy, now - 7200000).run();
  if (!claimed.meta.changes) return { status: 'not_eligible' };
  let result;
  try {
    result = await send(env.AFFILIATE_XENDIT_KEY, { reference: `affiliate-${payoutId}`, amount: row.amount,
      bankCode: row.bank_code, ...destination });
  } catch { return { status: 'unknown' }; }
  const mapped = mappedStatus(result.status);
  if (!mapped) return { status: 'unknown' };
  await db.prepare("UPDATE affiliate_payouts SET status = ?, provider_id = ?, completed_at = CASE WHEN ? = 'succeeded' THEN ? ELSE completed_at END WHERE id = ? AND status = 'unknown'")
    .bind(mapped, result.id, mapped, now, payoutId).run();
  return { status: mapped };
}

export async function reconcilePayout(db, key, row, lookupById = getPayout, lookupByReference = findPayout, now = Date.now()) {
  const query = { id: row.provider_id, reference: `affiliate-${row.id}`, amount: row.amount };
  const result = row.provider_id ? await lookupById(key, query) : await lookupByReference(key, query);
  if (!result) return { status: row.status };
  const mapped = mappedStatus(result.status);
  if (!mapped || (row.status === 'succeeded' && mapped !== 'succeeded' && mapped !== 'reversed')) return { status: row.status };
  await db.prepare(`UPDATE affiliate_payouts SET status = ?, provider_id = COALESCE(provider_id, ?),
    completed_at = CASE WHEN ? = 'succeeded' THEN COALESCE(completed_at, ?) ELSE completed_at END
    WHERE id = ? AND status = ? AND (provider_id IS NULL OR provider_id = ?)`)
    .bind(mapped, result.id, mapped, now, row.id, row.status, result.id).run();
  return { status: mapped };
}
