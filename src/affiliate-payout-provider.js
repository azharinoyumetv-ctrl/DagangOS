// Provider adapter only. Approval, scheduling, payout ledger and bank-data storage
// must be implemented by the caller before this module can be used in production.
const API = 'https://api.xendit.co';
const payoutIdPattern = /^disb-[a-zA-Z0-9-]{8,100}$/;
const referencePattern = /^affiliate-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const states = new Set(['ACCEPTED', 'REQUESTED', 'SUCCEEDED', 'FAILED', 'REVERSED', 'CANCELLED']);

function validateReference(reference) {
  if (!referencePattern.test(reference || '')) throw new Error('Invalid payout reference');
}

function validatePayout(data, reference, amount) {
  if (!payoutIdPattern.test(data?.id || '') || data.reference_id !== reference || data.currency !== 'IDR'
    || !Number.isSafeInteger(data.amount) || data.amount !== amount || !states.has(data.status)) {
    throw new Error('Payout response did not match the approved request');
  }
  return { id: data.id, reference, amount, currency: 'IDR', status: data.status };
}

async function request(key, path, { method = 'GET', payload, reference } = {}) {
  if (typeof key !== 'string' || !key) throw new Error('Payout service is not configured');
  const response = await fetch(`${API}${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${btoa(`${key}:`)}`, Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json', 'idempotency-key': reference } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) throw new Error(`Payout service returned HTTP ${response.status}; outcome requires reconciliation`);
  return response.json();
}

export async function createPayout(key, { reference, amount, bankCode, accountName, accountNumber }) {
  validateReference(reference);
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^ID_[A-Z0-9_]{2,32}$/.test(bankCode || '')
    || typeof accountName !== 'string' || !accountName.trim() || accountName.length > 100 || /[\x00-\x1f\x7f]/.test(accountName)
    || !/^[0-9]{6,24}$/.test(accountNumber || '')) throw new Error('Invalid payout destination or amount');
  const payload = { reference_id: reference, channel_code: bankCode,
    channel_properties: { account_holder_name: accountName.trim(), account_number: accountNumber },
    amount, currency: 'IDR', description: 'DagangOS' };
  return validatePayout(await request(key, '/v2/payouts', { method: 'POST', payload, reference }), reference, amount);
}

export async function getPayout(key, { id, reference, amount }) {
  validateReference(reference);
  if (!payoutIdPattern.test(id || '') || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid payout lookup');
  const payout = validatePayout(await request(key, `/v2/payouts/${id}`), reference, amount);
  if (payout.id !== id) throw new Error('Payout response did not match the requested ID');
  return payout;
}

// Used when a create request timed out before returning its provider ID. An
// empty or ambiguous result is never evidence that another transfer is safe.
export async function findPayout(key, { reference, amount }) {
  validateReference(reference);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid payout lookup');
  const data = await request(key, `/v2/payouts?reference_id=${encodeURIComponent(reference)}`);
  if (data?.has_more !== false || !Array.isArray(data.data)) throw new Error('Ambiguous payout lookup');
  if (data.data.length === 0) return null;
  if (data.data.length !== 1) throw new Error('Ambiguous payout lookup');
  return validatePayout(data.data[0], reference, amount);
}
