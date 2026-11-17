// Read-only probe against a nonexistent dispute. A real 404 confirms that the
// API is reachable; it does not reveal any customer or dispute information.
const keys=[process.env.AFFILIATE_XENDIT_KEY,process.env.XENDIT_SECRET_KEY].filter(Boolean);
if (!keys.length) throw new Error('No payment key is configured');
let available=false;
for (const [index,key] of [...new Set(keys)].entries()) {
  const response=await fetch('https://api.xendit.co/v1/disputes/mi-dspt-00000000-0000-4000-8000-000000000000',{
    headers:{Authorization:`Basic ${Buffer.from(`${key}:`).toString('base64')}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  console.log(`Dispute read using ${index===0?'affiliate':'payment'} credential: HTTP ${response.status}`);
  if (response.status===404) {available=true;break;}
  if (![401,403].includes(response.status)) throw new Error('Dispute read check was inconclusive');
}
if (!available) throw new Error('Neither payment credential can read disputes');
