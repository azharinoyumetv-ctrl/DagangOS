// Send only the already-authorized subscription secret through the Cloudflare API.
// Never write credentials to a file, command argument, browser, or console.
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const values = {
  XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
  XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN,
  // Preserve the existing receipt-signing key independently of payment provider.
  SUBSCRIPTION_SIGNING_KEY: process.env.SUBSCRIPTION_SIGNING_KEY,
};
if (!token || !account || Object.values(values).some(value => !value)) throw new Error('Missing checkout deployment configuration');
for (const [name, value] of Object.entries(values)) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/dagangos-portal/secrets`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, text: value, type: 'secret_text' }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(`Could not configure checkout secret (HTTP ${response.status})`);
}
console.log('Xendit checkout and receipt-signing secrets configured');
