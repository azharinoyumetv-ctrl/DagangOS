// GitHub Actions supplies the token and actor; neither is accepted from inputs.
const token = process.env.AFFILIATE_ADMIN_TOKEN;
const actor = process.env.GITHUB_ACTOR;
const action = process.env.PAYOUT_ACTION;
const id = (process.env.PAYOUT_ID || '').trim();
if (!token || !/^[a-zA-Z0-9@._-]{1,100}$/.test(actor || '') || !['list', 'approve', 'cancel'].includes(action)) {
  throw new Error('Payout review is not configured');
}
if (action !== 'list' && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw new Error('Enter a valid payout ID');
const response = await fetch('https://dagangos.com/api/affiliate/admin/payouts', {
  method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(action === 'list' ? {action} : {action, id, reviewer: actor}),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Review request failed (HTTP ${response.status}): ${body.error || 'unavailable'}`);
if (action === 'list') {
  if (!body.payouts?.length) console.log('No payouts awaiting review or processing.');
  for (const payout of body.payouts || []) console.log(JSON.stringify(payout));
} else console.log(`Payout ${id}: ${body.status}`);
