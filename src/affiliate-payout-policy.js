// Pure finance calculations; callers must provide authoritative ledger rows and
// atomically reserve approved payouts before executing a bank transfer.
const DAY = 86400000;
const WIB = 7 * 60 * 60 * 1000;
function money(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid IDR amount');
  return value;
}
export function payoutBalance({ acquisitions, payouts, waitDays, asOf = Date.now() }) {
  if (!Array.isArray(acquisitions) || !Array.isArray(payouts) || !Number.isInteger(waitDays)
    || waitDays < 0 || waitDays > 365 || !Number.isFinite(asOf)) throw new Error('Invalid payout inputs');
  const seen = new Set();let matured = 0;let pending = 0;
  for (const item of acquisitions) {
    if (!item || typeof item.orderId !== 'string' || seen.has(item.orderId)) throw new Error('Duplicate acquisition');
    seen.add(item.orderId);const amount=money(item.commission);const reversed=money(item.reversed ?? 0);
    if (reversed > amount) throw new Error('Reversal exceeds commission');
    const paidAt=Date.parse(item.paidAt);if (!Number.isFinite(paidAt) || paidAt > asOf) throw new Error('Invalid payment date');
    const net=amount-reversed;if (paidAt + waitDays * DAY <= asOf) matured+=net;else pending+=net;
    if (!Number.isSafeInteger(matured) || !Number.isSafeInteger(pending)) throw new Error('Balance exceeds safe integer');
  }
  const payoutIds=new Set();let deducted=0;
  for (const item of payouts) {
    if (!item || typeof item.id !== 'string' || payoutIds.has(item.id)) throw new Error('Duplicate payout');
    payoutIds.add(item.id);const amount=money(item.amount);
    if (['reserved','approved','submitted','succeeded'].includes(item.status)) deducted+=amount;
    else if (!['failed','reversed','cancelled'].includes(item.status)) throw new Error('Unknown payout status');
    if (!Number.isSafeInteger(deducted)) throw new Error('Balance exceeds safe integer');
  }
  return { matured, pending, deducted, available:Math.max(0,matured-deducted), carryForward:Math.min(0,matured-deducted) };
}
export function payoutCanExecute({ balance, minimum, payoutDay, approved, asOf = Date.now() }) {
  money(balance);money(minimum);
  if (minimum === 0) throw new Error('Invalid payout minimum');
  if (!Number.isInteger(payoutDay) || payoutDay < 1 || payoutDay > 28 || !Number.isFinite(asOf)) throw new Error('Invalid payout policy');
  return approved === true && balance >= minimum && new Date(asOf + WIB).getUTCDate() === payoutDay;
}
