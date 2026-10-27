const version = 'unified-20261028';
export const GERAINA_PUBLIC_PATHS = new Set(['/geraina', '/geraina/pricing', '/geraina/android', '/geraina/privacy', '/geraina/delete-account']);

export function gerainaCanonicalPath(pathname) {
  const aliases = {'/geraina/index.html':'/geraina', '/marketing/geraina.html':'/geraina', '/marketing/geraina-pricing.html':'/geraina/pricing', '/marketing/geraina-android.html':'/geraina/android'};
  if (aliases[pathname]) return aliases[pathname];
  const trimmed = pathname.replace(/\/+$/, '');
  return GERAINA_PUBLIC_PATHS.has(trimmed) ? trimmed : null;
}

export function gerainaHeader(pathname) {
  const links = [
    ['Fitur', '/geraina#fitur'], ['Solusi', '/geraina#solusi'],
    ['Harga', '/geraina/pricing'], ['Android', '/geraina/android'], ['Kontak', '/geraina#kontak'],
  ].map(([label, href]) => `<a href="${href}"${href === pathname ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<header class="geraina-header"><div class="geraina-header__inner"><a class="geraina-brand" href="/geraina" aria-label="Geraina POS — Beranda"><img src="/assets/brand/geraina-icon.png" alt="" width="36" height="36"><span>Geraina<span class="geraina-brand__pos"> POS</span></span></a><button class="geraina-menu-toggle" type="button" aria-expanded="false" aria-controls="geraina-navigation"><span>Menu</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><nav id="geraina-navigation" class="geraina-navigation" aria-label="Navigasi Geraina">${links}<div class="geraina-navigation__account"><a href="/geraina/login" data-geraina-login>Masuk</a><a class="geraina-nav-button" href="/geraina/register" data-geraina-register data-anonymous-trial>Mulai Gratis <span aria-hidden="true">↗</span></a><a class="geraina-nav-button" href="/geraina/app/dashboard" data-geraina-dashboard hidden>Buka Dashboard <span aria-hidden="true">↗</span></a></div></nav></div></header>`;
}

export function gerainaFooter() {
  return `<footer class="geraina-footer"><div class="geraina-footer__inner"><a class="geraina-brand" href="/geraina"><img src="/assets/brand/geraina-icon.png" alt="" width="34" height="34"><span>Geraina POS</span></a><p>© 2026 PT DagangOS Digital Indonesia</p><nav aria-label="Informasi Geraina"><a href="/geraina#kontak">Bantuan Geraina</a><a href="/geraina/privacy">Privasi</a><a href="https://dagangos.com/">Ekosistem DagangOS <span aria-hidden="true">↗</span></a></nav></div></footer>`;
}

export function renderGerainaPublic(body, pathname) {
  if (!body.includes('<!-- geraina-header -->')) return body;
  return body.replace('<body', '<body data-geraina-public').replace('<!-- geraina-header -->', gerainaHeader(pathname))
    .replace('<!-- geraina-footer -->', gerainaFooter())
    .replace('</head>', `<link rel="stylesheet" href="/geraina-public.css?v=${version}"><script src="/geraina-public.js?v=${version}" defer></script></head>`);
}

// Public website navigation must leave the React app shell. Native APK assets
// do not receive this script or attribute, so their routing stays unchanged.
export function injectGerainaWebBoundary(body) {
  if (!body || body.includes('data-geraina-web-app')) return body;
  return body.replace(/<html\b/, '<html data-geraina-web-app')
    .replace('</body>', `<script src="/geraina-public.js?v=${version}" defer></script></body>`);
}
