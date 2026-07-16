function injectLegalName(body) {
  const legal = 'DagangOS Digital Indonesia';
  const replacement = `<div class="text-center text-xs py-2" style="color:#f5f5f5">© 2026 ${legal}. Platform SaaS Terpadu Indonesia.</div>`;
  const oldPattern = /<div class="text-center text-xs py-2" style="color:#f5f5f5">© 2026 DagangOS\. Platform SaaS Terpadu Indonesia\.<\/div>/;
  if (oldPattern.test(body)) {
    return body.replace(oldPattern, replacement).replace('</footer>', replacement + '</footer>').replace('</body>', replacement + '</body>');
  }
  if (body.includes(replacement)) return body;
  if (body.includes('</footer>')) return body.replace('</footer>', replacement + '</footer>');
  if (body.includes('</body>')) return body.replace('</body>', replacement + '</body>');
  return body;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // CORS: batasi ke origin dagangos.com (+ localhost dev); selain itu fallback domain utama.
      const reqOrigin = request.headers.get('Origin') || '';
      const ALLOWED_ORIGIN = /^https:\/\/(.*\.)?dagangos\.com$|^http:\/\/localhost(:\d+)?$/;
      const allowOrigin = ALLOWED_ORIGIN.test(reqOrigin) ? reqOrigin : 'https://dagangos.com';

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': allowOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Vary': 'Origin',
          },
        });
      }

      // Handle API requests on Cloudflare Edge
      if (pathname.startsWith('/api') || pathname.startsWith('/docs') || pathname.startsWith('/openapi.json')) {
        // Route ke backend terpisah berdasarkan modul (header X-DagangOS-Module).
        // geraina -> backend Geraina; selain itu -> backend DapurOS (default).
        // AMAN: header ini HANYA memilih backend/modul. Resolusi toko di backend selalu
        // di-scope ke owner_user_id dari token, jadi spoof header tak bisa akses data akun lain.
        const mod = (request.headers.get('X-DagangOS-Module') || '').toLowerCase();
        const targetHost = mod === 'geraina'
          ? (env.GERAINA_BACKEND_ORIGIN || env.BACKEND_ORIGIN || 'api.dagangos.com')
          : (env.BACKEND_ORIGIN || 'api.dagangos.com');
        const backendUrl = new URL(request.url);
        backendUrl.hostname = targetHost;
        backendUrl.port = '443';
        backendUrl.protocol = 'https:';

        const headers = new Headers(request.headers);
        headers.set('Host', targetHost);

        const proxyRequest = new Request(backendUrl.toString(), {
          method: request.method,
          headers: headers,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
          redirect: 'follow',
        });

        try {
          const response = await fetch(proxyRequest);
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Access-Control-Allow-Origin', allowOrigin);
          newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          newHeaders.set('Access-Control-Allow-Headers', '*');
          newHeaders.set('Vary', 'Origin');

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: 'Edge proxy error', details: err.message }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Check if path is a static asset by extension
      const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|ico|svg|json|woff|woff2|ttf|eot|map|webp|avif|txt|xml|webmanifest)$/i.test(pathname);

      if (isStaticAsset) {
        // Let Cloudflare serve static assets directly
        try {
          const res = await env.ASSETS.fetch(request);
          if (res.ok) return res;
        } catch (e) {}
        // Asset not found, try prefixed paths
        if (pathname.startsWith('/static/')) {
          for (const prefix of ['/dapuros', '/geraina']) {
            try {
              const res = await env.ASSETS.fetch(new Request(new URL(prefix + pathname, request.url).toString(), request));
              if (res.ok) return res;
            } catch (e) {}
          }
        }
        return new Response('Not Found', { status: 404 });
      }

      // === SPA Routing for non-asset paths ===
      // DapurOS: ALL /dapuros/* paths → serve /dapuros/index.html content
      if (pathname === '/dapuros' || pathname.startsWith('/dapuros/')) {
        const spaUrl = new URL('/dapuros/index.html', request.url);
        const assetResponse = await env.ASSETS.fetch(new Request(spaUrl.toString(), {
          method: 'GET',
          headers: request.headers,
        }));
        // CRITICAL: Return the HTML content with 200 status, NOT a redirect
        // This ensures the browser URL stays at /dapuros/app/pos (not /dapuros/)
        if (assetResponse.status >= 300 && assetResponse.status < 400) {
          // Asset handler returned a redirect — fetch the body directly
          const body = await assetResponse.text();
          return new Response(injectLegalName(body || '<!-- redirect intercepted -->'), {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache',
            },
          });
        }
        // Return the asset response as-is (should be 200 with HTML)
        const newHeaders = new Headers(assetResponse.headers);
        newHeaders.set('Content-Type', 'text/html; charset=utf-8');
        newHeaders.delete('Location'); // Remove any Location header just in case

        let body = await assetResponse.text();
        body = injectLegalName(body);

        return new Response(body, {
          status: 200,
          headers: newHeaders,
        });
      }

      // GerainaOS: ALL /geraina/* paths → serve /geraina/index.html content
      if (pathname === '/geraina' || pathname.startsWith('/geraina/')) {
        const spaUrl = new URL('/geraina/index.html', request.url);
        const assetResponse = await env.ASSETS.fetch(new Request(spaUrl.toString(), {
          method: 'GET',
          headers: request.headers,
        }));
        if (assetResponse.status >= 300 && assetResponse.status < 400) {
          const body = await assetResponse.text();
          return new Response(injectLegalName(body || '<!-- redirect intercepted -->'), {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache',
            },
          });
        }
        const newHeaders = new Headers(assetResponse.headers);
        newHeaders.set('Content-Type', 'text/html; charset=utf-8');
        newHeaders.delete('Location');

        let body = await assetResponse.text();
        body = injectLegalName(body);

        return new Response(body, {
          status: 200,
          headers: newHeaders,
        });
      }

      // Portal: ALL remaining paths → root /index.html
      const portalUrl = new URL('/index.html', request.url);
      const portalResponse = await env.ASSETS.fetch(new Request(portalUrl.toString(), {
        method: 'GET',
        headers: request.headers,
      }));
      const portalHeaders = new Headers(portalResponse.headers);
      portalHeaders.set('Content-Type', 'text/html; charset=utf-8');
      portalHeaders.delete('Location');

      let portalBody = await portalResponse.text();
      portalBody = injectLegalName(portalBody);

      return new Response(portalBody, {
        status: 200,
        headers: portalHeaders,
      });

    } catch (globalErr) {
      return new Response(`DagangOS Worker Error: ${globalErr.message}\n\nStack: ${globalErr.stack}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }
};
