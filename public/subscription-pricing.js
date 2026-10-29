const billingToggle = document.querySelector('.billing-toggle');
const module = location.pathname.split('/')[1];
const intentKey = `dagangos_checkout_${module}`;
const readToken = () => [`${module}_token`, 'dagangos_token', ['geraina','dapuros'].includes(module) ? 'dapuros_token' : 'geraina_token']
  .map(key => localStorage.getItem(key)).find(value => value && value !== 'mock_master_token');
if (['geraina','dapuros'].includes(module) && readToken()) document.querySelector('[data-anonymous-trial]')?.remove();
const currentPeriod = () => new URL(location.href).searchParams.get('period') === 'yearly' ? 'yearly' : 'monthly';
let resuming = false;
let currentSubscription;
const purchaseEnabled = [...document.querySelectorAll('.plan-purchase button')].some(button => !button.disabled);
function updateCurrentPlan() {
  if (window.GerainaCheckoutFeedback?.busy) return;
  if (!['geraina','dapuros'].includes(module) || !purchaseEnabled || !currentSubscription?.active) return;
  document.querySelectorAll('.price-card .plan-purchase button').forEach(button => {
    const tier = button.closest('.price-card').id.replace('plan-', '');
    const same = tier === currentSubscription.tier && currentPeriod() === currentSubscription.period;
    button.disabled = same;
    button.textContent = same ? 'Paket Aktif' : `Pilih ${tier[0].toUpperCase() + tier.slice(1)}`;
  });
}

billingToggle?.addEventListener('submit', event => {
  if (window.GerainaCheckoutFeedback?.busy) { event.preventDefault(); return; }
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
  updateCurrentPlan();
});

document.querySelectorAll('.plan-purchase').forEach(form => {
  form.addEventListener('submit', event => {
    const addonId = form.dataset.addonId;
    const url = new URL(location.href);
    const choice = addonId ? {kind:'addon',addonId,period:'monthly',...(url.searchParams.get('addon')===addonId&&url.searchParams.get('renewal')?{renewalId:url.searchParams.get('renewal')}:{})} : {tier:form.closest('.price-card').id.replace('plan-',''),period:currentPeriod()};
    if (!resuming) sessionStorage.setItem(intentKey, JSON.stringify({ ...choice, expires: Date.now() + 1800000 }));
    const token = readToken();
    if (!token) {
      event.preventDefault();
      const next = addonId ? `/${module}/pricing?period=monthly&addon=${addonId}&checkout=1${choice.renewalId?`&renewal=${encodeURIComponent(choice.renewalId)}`:''}` : `/${module}/pricing?period=${choice.period}&plan=${choice.tier}&checkout=1`;
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

function resumeCheckout() {
  if (!readToken()) return false;
  const url = new URL(location.href);
  let intent;
  try { intent = JSON.parse(sessionStorage.getItem(intentKey) || 'null'); } catch { return false; }
  // A URL alone never authorizes an invoice. Only resume a choice actually
  // made in this tab; the checkout backend still validates the current plan.
  if (url.searchParams.get('checkout') !== '1' || !intent || !Number.isFinite(intent.expires) || intent.expires < Date.now()) return false;
  let form;
  if (intent.kind === 'addon') {
    if (!['geraina','dapuros'].includes(module)||!['extra_device','extra_outlet'].includes(intent.addonId)||intent.period!=='monthly'||intent.addonId!==url.searchParams.get('addon')||(intent.renewalId||null)!==url.searchParams.get('renewal')||intent.renewalId&&!/^(DG-(geraina|dapuros)-[a-f0-9]{32}|[a-f0-9-]{36})$/.test(intent.renewalId)||!purchaseEnabled) return false;
    form=document.querySelector(`form[data-addon-id="${intent.addonId}"]`);
    if(form)form.querySelector('button').disabled=false; // backend verifies eligibility before quoting
  } else {
    if(intent.kind!==undefined||!['starter','pro','business'].includes(intent.tier)||intent.tier!==url.searchParams.get('plan')||intent.period!==currentPeriod())return false;
    form=document.querySelector(`#plan-${intent.tier} .plan-purchase`);
  }
  if (!form || form.querySelector('button').disabled) return false;
  url.searchParams.delete('checkout');
  history.replaceState(null, '', url);
  sessionStorage.removeItem(intentKey);
  resuming = true; form.requestSubmit();
  return true;
}

async function showSubscription() {
  const token = readToken();
  if (!token) {
    document.querySelectorAll('form[data-addon-id]').forEach(form=>{form.querySelector('button').disabled=!purchaseEnabled;form.querySelector('button').textContent='Masuk untuk membeli';form.parentElement.querySelector('[data-addon-reason]').textContent='Memerlukan paket Pro atau Business yang sesuai.';});
    return;
  }
  try {
    const response = await fetch('/api/subscriptions/current', { headers: { Authorization: `Bearer ${token}`, 'X-DagangOS-Module': module }, cache: 'no-store' });
    if (!response.ok) throw new Error('Account status unavailable');
    if (response.ok) {
      const data = await response.json(), { subscription } = data;
      if (!window.GerainaCheckoutFeedback?.busy) document.querySelectorAll('form[data-addon-id]').forEach(form=>{
        const offer=data.addons?.offers?.find(o=>o.id===form.dataset.addonId),button=form.querySelector('button'),card=form.parentElement;
        button.disabled=!purchaseEnabled||!data.can_manage||!offer?.eligible;
        button.textContent='Beli add-on';card.querySelector('[data-addon-reason]').textContent=!data.can_manage?'Akun Owner diperlukan.':offer?.reason||'Satu bulan, tanpa perpanjangan otomatis.';
        card.querySelector('[data-addon-pending]')?.remove();
        if(offer?.pending_receipt){const link=document.createElement('a');link.dataset.addonPending='1';link.className='button button--quiet';link.href=`/${module}/order?receipt=`+encodeURIComponent(offer.pending_receipt);link.textContent='Periksa atau lanjutkan pembayaran';card.append(link);}
      });
      if (subscription?.active && !window.GerainaCheckoutFeedback?.busy) {
        currentSubscription = subscription;
        const button = document.querySelector(`#plan-${subscription.tier} .plan-purchase button`);
        if (button) { button.disabled = true; button.textContent = 'Paket Aktif'; }
        const notice = document.createElement('p');
        notice.className = 'pricing-note';
        notice.setAttribute('role', 'status');
        notice.textContent = `Paket ${subscription.tier} Anda aktif hingga ${new Date(subscription.expires_at).toLocaleDateString('id-ID')}.`;
        document.querySelector('.pricing-controls')?.append(notice);
        if (['geraina','dapuros'].includes(module)) {
          const manage = document.createElement('a');
          manage.href = `/${module}/app/settings/billing`;
          manage.className = 'button button--quiet';
          manage.textContent = 'Kelola langganan';
          notice.append(document.createElement('br'), manage);
          updateCurrentPlan();
        }
      }
    }
  } catch {
    document.querySelectorAll('[data-addon-reason]').forEach(p=>{p.textContent='Informasi add-on belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.';});
  }
  resumeCheckout();
}
// Geraina no longer waits for a redundant status request before continuing a
// saved purchase. The server makes the authoritative duplicate/plan check.
if (!['geraina','dapuros'].includes(module) || !resumeCheckout()) showSubscription();
