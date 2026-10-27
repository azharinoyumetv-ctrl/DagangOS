// Shared by package selection and the explicit package-change confirmation.
// Render feedback before native form navigation; never retry a payment POST.
(() => {
  const selector = 'form.plan-purchase, form[data-subscription-submit]';
  let activeForm = null, timer;
  const previous = new Map();
  const status = document.createElement('p');
  status.className = 'checkout-progress';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  const reset = () => {
    clearTimeout(timer);
    if (activeForm) activeForm.removeAttribute('aria-busy');
    for (const [button, state] of previous) {
      button.disabled = state.disabled;
      button.innerHTML = state.html;
    }
    previous.clear(); activeForm = null; status.hidden = true;
  };
  window.GerainaCheckoutFeedback = { get busy() { return activeForm !== null; } };
  document.addEventListener('submit', event => {
    if (activeForm && event.target.matches(selector)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('submit', event => {
    const form = event.target;
    if (event.defaultPrevented || !form.matches(selector)) return;
    event.preventDefault();
    activeForm = form;
    form.setAttribute('aria-busy', 'true');
    document.querySelectorAll('form.plan-purchase button, form[data-subscription-submit] button, .billing-toggle button').forEach(button => {
      previous.set(button, { disabled: button.disabled, html: button.innerHTML });
      button.disabled = true;
    });
    const button = event.submitter || form.querySelector('button[type="submit"]');
    if (button) button.innerHTML = '<span class="checkout-spinner" aria-hidden="true"></span><span>Membuka pembayaran…</span>';
    status.textContent = 'Menyiapkan pembayaran. Mohon tunggu.';
    form.append(status); status.hidden = false;
    timer = setTimeout(() => { status.textContent = 'Pembayaran masih diproses. Mohon tunggu dan jangan mengirim ulang.'; }, 8000);
    // Two frames ensure the loading state is painted before a slow redirect.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (activeForm === form) HTMLFormElement.prototype.submit.call(form);
    }));
  });
  addEventListener('pageshow', event => { if (event.persisted) reset(); });
})();
