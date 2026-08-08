import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import test from 'node:test'
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

test('unknown portal routes return a branded true 404', async () => {
  const response = await get('/definitely-not-real')
  const body = await response.text()
  assert.equal(response.status, 404)
  assert.match(body, /Halaman tidak ditemukan/)
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex')
})
