// GitHub Actions supplies the token and actor; neither is accepted from inputs.
const token = process.env.AFFILIATE_ADMIN_TOKEN;
const actor = process.env.GITHUB_ACTOR;
const action = process.env.PAYOUT_ACTION;
const id = (process.env.PAYOUT_ID || '').trim();
const identityVerified = process.env.IDENTITY_VERIFIED === 'true';
const bankOwnershipVerified = process.env.BANK_OWNERSHIP_VERIFIED === 'true';
const disputeId = (process.env.DISPUTE_ID || '').trim();
const reason = (process.env.DISPUTE_REASON || '').trim();
const disputeAction = ['disputes','release_dispute','reverse_dispute'].includes(action);
if (!token || !/^[a-zA-Z0-9@._-]{1,100}$/.test(actor || '') || !['list', 'approve', 'cancel','disputes','release_dispute','reverse_dispute'].includes(action)) {
  throw new Error('Payout review is not configured');
}
if (['approve','cancel'].includes(action) && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw new Error('Enter a valid payout ID');
if (action === 'approve' && (!identityVerified || !bankOwnershipVerified)) throw new Error('Verify affiliate identity and bank ownership before approval');
if (['release_dispute','reverse_dispute'].includes(action) && (!/^mi-dspt-[a-zA-Z0-9-]{8,100}$/.test(disputeId)
  || reason.length<10 || reason.length>500 || /[\x00-\x1f\x7f]/.test(reason))) throw new Error('Enter a valid dispute ID and review reason');
const path=disputeAction?'disputes':'payouts';
const payload=action==='disputes'?{action:'list'}:disputeAction?{action:action==='release_dispute'?'release':'reverse',id:disputeId,reason,reviewer:actor}
  :action==='list'?{action}:{action,id,reviewer:actor,identityVerified,bankOwnershipVerified};
const response = await fetch(`https://dagangos.com/api/affiliate/admin/${path}`, {
  method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Review request failed (HTTP ${response.status}): ${body.error || 'unavailable'}`);
if (action === 'disputes') {
  if (!body.disputes?.length) console.log('No disputes awaiting review.');
  for (const dispute of body.disputes || []) console.log(JSON.stringify(dispute));
} else if (action === 'list') {
  if (!body.payouts?.length) console.log('No payouts awaiting review or processing.');
  for (const payout of body.payouts || []) console.log(JSON.stringify(payout));
} else if (disputeAction) console.log(`Dispute ${disputeId}: ${body.status} (${body.decision})`);
else console.log(`Payout ${id}: ${body.status}`);
