const billingToggle = document.querySelector('.billing-toggle');
const module = location.pathname.split('/')[1];
const intentKey = `dagangos_checkout_${module}`;
const readToken = () => [`${module}_token`, 'dagangos_token', module === 'geraina' ? 'dapuros_token' : 'geraina_token']
  .map(key => localStorage.getItem(key)).find(value => value && value !== 'mock_master_token');
const currentPeriod = () => new URL(location.href).searchParams.get('period') === 'yearly' ? 'yearly' : 'monthly';
let resuming = false;

billingToggle?.addEventListener('submit', event => {
  const period = event.submitter?.value;
  if (!['monthly', 'yearly'].includes(period)) return;
  event.preventDefault();

  billingToggle.querySelectorAll('button[name="period"]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.value === period));
  });
  document.querySelectorAll('[data-billing-value]').forEach(element => {
    const value = element.dataset[period];
    if (element instanceof HTMLInputElement) element.value = value;
    else element.textContent = value;
  });

  const url = new URL(location.href);
  url.searchParams.set('period', period);
  history.replaceState(null, '', url);
});

document.querySelectorAll('.plan-purchase').forEach(form => {
  form.addEventListener('submit', event => {
    const tier = form.closest('.price-card').id.replace('plan-', '');
    const period = currentPeriod();
    if (!resuming) sessionStorage.setItem(intentKey, JSON.stringify({ tier, period, expires: Date.now() + 1800000 }));
    const token = readToken();
    if (!token) {
      event.preventDefault();
      const next = `/${module}/pricing?period=${period}&plan=${tier}&checkout=1`;
      location.assign(`/${module}/login?next=${encodeURIComponent(next)}`);
      return;
    }
    let input = form.querySelector('[name="access_token"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'access_token';
      form.append(input);
    }
    input.value = token;
  });
});

async function showSubscription() {
  const token = readToken();
  if (!token) return;
  try {
    const response = await fetch('/api/subscriptions/current', { headers: { Authorization: `Bearer ${token}`, 'X-DagangOS-Module': module }, cache: 'no-store' });
    if (response.ok) {
      const { subscription } = await response.json();
      if (subscription?.active) {
        const button = document.querySelector(`#plan-${subscription.tier} .plan-purchase button`);
        if (button) { button.disabled = true; button.textContent = 'Paket Aktif'; }
        const notice = document.createElement('p');
        notice.className = 'pricing-note';
        notice.setAttribute('role', 'status');
        notice.textContent = `Paket ${subscription.tier} Anda aktif hingga ${new Date(subscription.expires_at).toLocaleDateString('id-ID')}.`;
        document.querySelector('.pricing-controls')?.append(notice);
      }
    }
  } catch { /* Checkout verifies the account again on the server. */ }
  const url = new URL(location.href);
  let intent;
  try { intent = JSON.parse(sessionStorage.getItem(intentKey) || 'null'); } catch { return; }
  // Only resume a package the visitor actually chose in this tab; a crafted URL
  // alone must never create an invoice using an existing signed-in session.
  if (url.searchParams.get('checkout') !== '1' || !intent || !['starter', 'pro', 'business'].includes(intent.tier) || !Number.isFinite(intent.expires) || intent.expires < Date.now() || intent.tier !== url.searchParams.get('plan') || intent.period !== currentPeriod()) return;
  url.searchParams.delete('checkout');
  history.replaceState(null, '', url);
  sessionStorage.removeItem(intentKey);
  const form = document.querySelector(`#plan-${intent.tier} .plan-purchase`);
  if (form && !form.querySelector('button').disabled) { resuming = true; form.requestSubmit(); }
}
showSubscription();
