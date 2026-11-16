// Read-only capability probe: no customer or payout records are requested.
const key = process.env.XENDIT_SECRET_KEY;
if (!key) throw new Error('Payment key unavailable');
const authorization = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
const queries = [
  ['transaction read', '/transactions?types=PAYMENT&reference_id=DG-geraina-00000000000000000000000000000000&currency=IDR&limit=1'],
  ['payout read', '/v2/payouts?reference_id=affiliate-00000000-0000-4000-8000-000000000000&limit=1'],
];
let missing = false;
for (const [name, path] of queries) {
  const response = await fetch(`https://api.xendit.co${path}`, {headers:{Authorization:authorization,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  console.log(`${name}: HTTP ${response.status}`);
  if (!response.ok) missing = true;
}
if (missing) throw new Error('The deployed payment key cannot read one or more affiliate reconciliation services');
