// Send only the already-authorized subscription secret through the Cloudflare API.
// Never write credentials to a file, command argument, browser, or console.
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const secret = process.env.MIDTRANS_SERVER_KEY;
if (!token || !account || !secret) throw new Error('Missing checkout deployment configuration');
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/dagangos-portal/secrets`, {
  method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'MIDTRANS_SERVER_KEY', text: secret, type: 'secret_text' }),
});
const result = await response.json();
if (!response.ok || !result.success) throw new Error(`Could not configure checkout secret (HTTP ${response.status})`);
console.log('Subscription payment secret configured');
