(() => {
  const publicPaths = new Set(['/geraina', '/geraina/pricing', '/geraina/android', '/geraina/privacy', '/geraina/delete-account']);
  const publicDestination = value => {
    const url = new URL(value, location.href);
    return url.origin === location.origin && publicPaths.has(url.pathname.replace(/\/+$/, '')) ? url : null;
  };
  if (document.documentElement.hasAttribute('data-geraina-web-app')) {
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const link = event.target.closest('a[href]');
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const destination = publicDestination(link.href);
      if (!destination) return;
      event.preventDefault(); event.stopPropagation();
      location.assign(destination.href);
    }, true);
    window.addEventListener('popstate', () => {
      const destination = publicDestination(location.href);
      if (destination) location.replace(destination.href);
    });
    return;
  }

  document.documentElement.setAttribute('data-geraina-enhanced', '');

  const toggle = document.querySelector('.geraina-menu-toggle');
  const navigation = document.querySelector('#geraina-navigation');
  function closeMenu() {
    toggle?.setAttribute('aria-expanded', 'false');
    navigation?.classList.remove('is-open');
  }
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
  });
  navigation?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { closeMenu(); toggle.focus(); }
  });
  matchMedia('(min-width:821px)').addEventListener('change', closeMenu);
  document.querySelectorAll('[data-geraina-chat]').forEach(button => {
    button.addEventListener('click', () => document.querySelector('.dagangos-support__launcher')?.click());
  });

  const hero = document.querySelector('.geraina-hero-scene');
  if (hero && 'IntersectionObserver' in window) {
    const visibility = new IntersectionObserver(entries => {
      for (const entry of entries) hero.classList.toggle('is-offscreen', !entry.isIntersecting);
    });
    visibility.observe(hero);
  }

  // Only the account navigation is personalized; the public content never
  // waits for session validation and marketing cannot clear a user's session.
  async function showAccount() {
    let token;
    try { token = (localStorage.getItem('geraina_signed_out') ? ['geraina_token'] : ['geraina_token', 'dagangos_token', 'dapuros_token']).map(key => localStorage.getItem(key)).find(value => value && value !== 'mock_master_token'); } catch { return; }
    if (!token) return;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch('/api/auth/me', {headers:{Authorization:`Bearer ${token}`, 'X-DagangOS-Module':'geraina'}, cache:'no-store', signal:controller.signal});
      if (!response.ok) return;
      const user = await response.json();
      if (!user?.id || !user?.role) return;
      document.querySelector('[data-geraina-login]')?.setAttribute('hidden', '');
      document.querySelector('[data-geraina-register]')?.setAttribute('hidden', '');
      document.querySelector('[data-geraina-dashboard]')?.removeAttribute('hidden');
    } catch { /* Public navigation remains available when the API is slow. */ }
    finally { clearTimeout(timeout); }
  }
  showAccount();
})();
