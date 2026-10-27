const version = 'unified-20261028b';
export const DAPUROS_PUBLIC_PATHS = new Set(['/dapuros', '/dapuros/pricing']);

export function dapurosCanonicalPath(pathname) {
  const aliases = {'/dapuros/index.html':'/dapuros', '/marketing/dapuros.html':'/dapuros', '/marketing/dapuros-pricing.html':'/dapuros/pricing'};
  if (aliases[pathname]) return aliases[pathname];
  const trimmed = pathname.replace(/\/+$/, '');
  return DAPUROS_PUBLIC_PATHS.has(trimmed) ? trimmed : null;
}

export function dapurosHeader(pathname) {
  const links = [
    ['Fitur', '/dapuros#fitur'], ['Solusi', '/dapuros#solusi'],
    ['Harga', '/dapuros/pricing'], ['Kontak', '/dapuros#kontak'],
  ].map(([label, href]) => `<a href="${href}"${href === pathname ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<header class="dapuros-header"><div class="dapuros-header__inner"><a class="dapuros-brand" href="/dapuros" aria-label="DapurOS — Beranda"><img src="/assets/brand/dapuros-icon.png" alt="" width="36" height="36"><span>Dapur<span class="dapuros-brand__os">OS</span></span></a><button class="dapuros-menu-toggle" type="button" aria-expanded="false" aria-controls="dapuros-navigation"><span>Menu</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><nav id="dapuros-navigation" class="dapuros-navigation" aria-label="Navigasi DapurOS">${links}<div class="dapuros-navigation__account"><a href="/dapuros/login" data-dapuros-login>Masuk</a><a class="dapuros-nav-button" href="/dapuros/register" data-dapuros-register data-anonymous-trial>Mulai Gratis <span aria-hidden="true">↗</span></a><a class="dapuros-nav-button" href="/dapuros/app/dashboard" data-dapuros-dashboard hidden>Buka Dashboard <span aria-hidden="true">↗</span></a></div></nav></div></header>`;
}

export function dapurosFooter() {
  return `<footer class="dapuros-footer"><div class="dapuros-footer__inner"><a class="dapuros-brand" href="/dapuros"><img src="/assets/brand/dapuros-icon.png" alt="" width="34" height="34"><span>DapurOS</span></a><p>© 2026 PT DagangOS Digital Indonesia</p><nav aria-label="Informasi DapurOS"><a href="/dapuros#kontak">Bantuan DapurOS</a><a href="/dapuros/pricing">Harga</a><a href="https://dagangos.com/">Ekosistem DagangOS <span aria-hidden="true">↗</span></a></nav></div></footer>`;
}

export function renderDapurosPublic(body, pathname) {
  if (!body.includes('<!-- dapuros-header -->')) return body;
  return body.replace('<body', '<body data-dapuros-public').replace('<!-- dapuros-header -->', dapurosHeader(pathname))
    .replace('<!-- dapuros-footer -->', dapurosFooter())
    .replace('</head>', `<link rel="stylesheet" href="/dapuros-public.css?v=${version}"><script src="/dapuros-public.js?v=${version}" defer></script></head>`);
}

// Public links from the React app must load the canonical website document.
export function injectDapurosWebBoundary(body) {
  if (!body || body.includes('data-dapuros-web-app')) return body;
  return body.replace(/<html\b/, '<html data-dapuros-web-app')
    .replace('</body>', `<script src="/dapuros-public.js?v=${version}" defer></script></body>`);
}
