import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import test from 'node:test'
import { createHash } from 'node:crypto'
import worker from '../src/index.js'

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

const env = {
  ASSETS: {
    async fetch(request) {
      if (request.headers.has('If-None-Match') || request.headers.has('If-Modified-Since')) {
        return new Response(null, { status: 304 })
      }
      const pathname = new URL(request.url).pathname
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
      try {
        const body = await readFile(join(process.cwd(), 'dist', relative))
        return new Response(body, { status: 200, headers: { 'Content-Type': contentTypes[extname(relative)] || 'application/octet-stream' } })
      } catch {
        return new Response('Not Found', { status: 404 })
      }
    },
  },
}

async function get(pathname, userAgent = 'Mozilla/5.0') {
  return worker.fetch(new Request(`https://dagangos.com${pathname}`, { headers: { 'User-Agent': userAgent } }), env, {})
}

test('crawler receives raw Geraina pricing content', async () => {
  const response = await get('/geraina/pricing', 'Mozilla/5.0 (compatible; Googlebot/2.1)')
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(body, /PT DagangOS Digital Indonesia/)
  assert.match(body, /Rp 149\.000/)
  assert.doesNotMatch(body, /You need to enable JavaScript/i)
})

test('crawler receives raw DapurOS pricing content', async () => {
  const response = await get('/dapuros/pricing', 'Mozilla/5.0 (compatible; Googlebot/2.1)')
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(body, /PT DagangOS Digital Indonesia/)
  assert.match(body, /Rp 249\.000/)
  assert.doesNotMatch(body, /You need to enable JavaScript/i)
})

test('intentional product application routes still receive their SPA shell', async () => {
  const response = await get('/geraina/login')
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(body, /<div id="root">/)
  assert.match(body, /\/geraina\/static\/js\//)
})

test('Geraina privacy and account deletion are public documents rather than the app login', async () => {
  const privacy = await get('/geraina/privacy')
  assert.equal(privacy.status, 200)
  const privacyBody = await privacy.text()
  assert.match(privacyBody, /Kebijakan Privasi Geraina POS/)
  assert.match(privacyBody, /\/geraina\/delete-account/)
  const deletion = await get('/geraina/delete-account')
  assert.equal(deletion.status, 200)
  const deletionBody = await deletion.text()
  assert.match(deletionBody, /Minta penghapusan akun Geraina POS/)
  assert.match(deletionBody, /mailto:contact@dagangos\.com/)
  assert.doesNotMatch(deletionBody, /<div id="root">/)
})

test('Android listing is discoverable and serves the verified APK without SPA conversion', async () => {
  const listing = await get('/geraina/android')
  assert.equal(listing.status, 200)
  const body = await listing.text()
  assert.match(body, /Geraina untuk Android/)
  assert.match(body, /data-download-link/)
  assert.doesNotMatch(body, /<div id="root">/)
  assert.match(await (await get('/geraina')).text(), /href="\/geraina\/android"/)
  const metadata = await get('/downloads/geraina/latest.json')
  assert.equal(metadata.headers.get('Cache-Control'), 'no-cache')
  const release = await metadata.json()
  assert.equal(release.minimumSdk, 34)
  assert.equal(release.minimumAndroid, '14.0')
  assert.equal(release.downloadUrl, `/downloads/geraina/Geraina-POS-${release.version}.apk`)
  const response = await get(release.downloadUrl)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'application/vnd.android.package-archive')
  assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="Geraina-POS-${release.version}.apk"`)
  assert.match(response.headers.get('Cache-Control'), /immutable/)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.equal(bytes.subarray(0, 2).toString(), 'PK')
  assert.equal(bytes.length, release.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), release.sha256)
  assert.match(await (await get('/downloads/geraina/SHA256SUMS.txt')).text(), new RegExp(release.sha256))
})

test('Android downloads preserve HEAD, revalidation, ranges and true missing-file errors', async () => {
  const release = await (await get('/downloads/geraina/latest.json')).json()
  const head = await worker.fetch(new Request(`https://dagangos.com${release.downloadUrl}`, { method: 'HEAD' }), env, {})
  assert.equal(head.status, 200)
  assert.equal((await head.arrayBuffer()).byteLength, 0)
  const cached = await worker.fetch(new Request(`https://dagangos.com${release.downloadUrl}`, { headers: { 'If-None-Match': '"apk"' } }), env, {})
  assert.equal(cached.status, 304)
  const range = await worker.fetch(new Request(`https://dagangos.com${release.downloadUrl}`), { ASSETS: { fetch: async () => new Response('PK', { status: 206, headers: { 'Content-Range': `bytes 0-1/${release.bytes}` } }) } }, {})
  assert.equal(range.status, 206)
  assert.equal(range.headers.get('Content-Range'), `bytes 0-1/${release.bytes}`)
  assert.equal(await range.text(), 'PK')
  for (const path of ['/downloads/geraina/Geraina-POS-999.0.0.apk', '/downloads/geraina/signing.jks']) {
    const missing = await get(path)
    assert.equal(missing.status, 404)
    assert.doesNotMatch(await missing.text(), /<html|<div id="root">/)
  }
  const post = await worker.fetch(new Request(`https://dagangos.com${release.downloadUrl}`, { method: 'POST' }), env, {})
  assert.equal(post.status, 405)
})

test('robots and sitemap are served as public assets', async () => {
  const robots = await get('/robots.txt')
  const sitemap = await get('/sitemap.xml')
  assert.equal(robots.status, 200)
  assert.match(await robots.text(), /Sitemap: https:\/\/dagangos\.com\/sitemap\.xml/)
  assert.equal(sitemap.status, 200)
  assert.match(await sitemap.text(), /https:\/\/dagangos\.com\/geraina\/pricing/)
})

test('every public portal route exposes route-specific content and canonical metadata without JavaScript', async () => {
  const expectations = [
    ['/', /Satu ekosistem\. Semua solusi\./, 'https://dagangos.com/'],
    ['/produk', /Geraina POS/, 'https://dagangos.com/produk'],
    ['/solusi', /aktivitas, alur kerja, data, dan kontrol bisnis/i, 'https://dagangos.com/solusi'],
    ['/industri', /DapurOS melayani restoran/i, 'https://dagangos.com/industri'],
    ['/tentang', /PT DagangOS Digital Indonesia/, 'https://dagangos.com/tentang'],
    ['/sumber-daya', /contact@dagangos\.com/, 'https://dagangos.com/sumber-daya'],
    ['/kontak', /Kanal kontak resmi/, 'https://dagangos.com/kontak'],
    ['/syarat-ketentuan', /1\. Layanan dan ruang lingkup/, 'https://dagangos.com/syarat-ketentuan'],
    ['/kebijakan-privasi', /5\. Pilihan dan hak Anda/, 'https://dagangos.com/kebijakan-privasi'],
    ['/kebijakan-refund', /14–21 hari kerja/, 'https://dagangos.com/kebijakan-refund'],
  ]

  for (const [pathname, marker, canonical] of expectations) {
    const response = await get(pathname, 'Mozilla/5.0 (compatible; Googlebot/2.1)')
    const body = await response.text()
    assert.equal(response.status, 200)
    assert.match(body, marker)
    assert.match(body, new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`))
    assert.match(body, /data-server-rendered-public-content/)
  }
})

test('the main portal footer exposes contact channels and working legal documents', async () => {
  const body = await (await get('/')).text()
  const footer = body.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[1]
  assert.ok(footer, 'the homepage has a footer')
  assert.match(footer, /href="mailto:contact@dagangos\.com"/)
  assert.match(footer, /href="https:\/\/wa\.me\/628999155182"/)
  for (const pathname of ['/kontak', '/syarat-ketentuan', '/kebijakan-privasi', '/kebijakan-refund']) {
    assert.ok(footer.includes(`href="${pathname}"`), `${pathname} is discoverable from the footer`)
    const response = await get(pathname)
    assert.equal(response.status, 200)
    const document = await response.text()
    assert.match(document, /PT DagangOS Digital Indonesia/)
    assert.doesNotMatch(document, /<h1>Halaman tidak ditemukan/)
  }
})

test('revisiting a portal document with browser cache validators still returns its full content', async () => {
  for (const pathname of ['/', '/kontak', '/syarat-ketentuan', '/kebijakan-privasi', '/kebijakan-refund']) {
    const response = await worker.fetch(new Request(`https://dagangos.com${pathname}`, {
      headers: { 'If-None-Match': '"cached-portal-shell"', 'If-Modified-Since': 'Mon, 27 Jul 2026 00:00:00 GMT' },
    }), env, {})
    assert.equal(response.status, 200)
    assert.match(await response.text(), /data-server-rendered-public-content/, pathname)
  }
})

test('unknown portal routes return a branded true 404', async () => {
  const response = await get('/definitely-not-real')
  const body = await response.text()
  assert.equal(response.status, 404)
  assert.match(body, /Halaman tidak ditemukan/)
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex')
})
