import { resolve4 } from 'node:dns/promises'

const browserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/127 Safari/537.36'
const googlebotAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const forbidden = /Just a moment|cf-chl-|403 Forbidden|You need to enable JavaScript to run this app/i
const agents = [
  ['browser', browserAgent],
  ['Googlebot', googlebotAgent],
]

const publicPages = [
  ['https://dagangos.com/', /PT DagangOS Digital Indonesia/i],
  ['https://dagangos.com/produk', /PT DagangOS Digital Indonesia/i],
  ['https://dagangos.com/solusi', /DagangOS/i],
  ['https://dagangos.com/industri', /DagangOS/i],
  ['https://dagangos.com/tentang', /PT DagangOS Digital Indonesia/i],
  ['https://dagangos.com/sumber-daya', /contact@dagangos\.com/i],
  ['https://dagangos.com/geraina', /Geraina POS/i],
  ['https://dagangos.com/geraina/pricing', /Rp\s*149\.000/i],
  ['https://dagangos.com/dapuros', /DapurOS/i],
  ['https://dagangos.com/dapuros/pricing', /Rp\s*249\.000/i],
  ['https://dagangos.com/robots.txt', /Sitemap:\s*https:\/\/dagangos\.com\/sitemap\.xml/i],
  ['https://dagangos.com/sitemap.xml', /https:\/\/dagangos\.com\/geraina\/pricing/i],
  ['https://store.dagangos.com/', /PT DagangOS Digital Indonesia/i],
  ['https://store.dagangos.com/en', /PT DagangOS Digital Indonesia/i],
  ['https://store.dagangos.com/id', /PT DagangOS Digital Indonesia/i],
  ['https://store.dagangos.com/en/pricing', /Website and Platform Pricing/i],
  ['https://store.dagangos.com/id/pricing', /Harga Paket Website dan Platform/i],
  ['https://store.dagangos.com/en/business', /Business Information/i],
  ['https://store.dagangos.com/id/business', /Informasi Bisnis/i],
  ['https://store.dagangos.com/en/site/about', /About Us/i],
  ['https://store.dagangos.com/id/site/about', /Tentang Kami/i],
  ['https://store.dagangos.com/en/site/catalog', /Solutions Catalog/i],
  ['https://store.dagangos.com/id/site/catalog', /Solutions Catalog/i],
  ['https://store.dagangos.com/en/site/shop', /Ownership Packages/i],
  ['https://store.dagangos.com/id/site/shop', /Paket Kepemilikan/i],
  ['https://store.dagangos.com/en/site/contact', /contact@dagangos\.com/i],
  ['https://store.dagangos.com/id/site/contact', /contact@dagangos\.com/i],
  ['https://store.dagangos.com/en/site/support', /Support/i],
  ['https://store.dagangos.com/id/site/support', /Dukungan/i],
  ['https://store.dagangos.com/en/site/terms', /Terms of Service/i],
  ['https://store.dagangos.com/id/site/terms', /Syarat (?:&amp;|&) Ketentuan/i],
  ['https://store.dagangos.com/en/site/privacy', /Privacy Policy/i],
  ['https://store.dagangos.com/id/site/privacy', /Kebijakan Privasi/i],
  ['https://store.dagangos.com/en/site/refund', /Cancellation and Refund Policy/i],
  ['https://store.dagangos.com/id/site/refund', /Kebijakan Pembatalan dan Refund/i],
  ['https://store.dagangos.com/robots.txt', /Sitemap:\s*https:\/\/store\.dagangos\.com\/sitemap\.xml/i],
  ['https://store.dagangos.com/sitemap.xml', /https:\/\/store\.dagangos\.com\/id\/pricing/i],
]

const applicationPages = [
  ['https://dagangos.com/geraina/login', /<div id="root">/i],
  ['https://dagangos.com/geraina/register', /<div id="root">/i],
  ['https://dagangos.com/dapuros/login', /<div id="root">/i],
  ['https://dagangos.com/dapuros/register', /<div id="root">/i],
  ['https://store.dagangos.com/checkout', /DagangOS/i],
  ['https://store.dagangos.com/login', /PT DagangOS Digital Indonesia/i],
  ['https://store.dagangos.com/register', /PT DagangOS Digital Indonesia/i],
  ['https://store.dagangos.com/terms', /Terms of Service/i],
  ['https://store.dagangos.com/privacy', /Privacy Policy/i],
  ['https://store.dagangos.com/refund-policy', /Cancellation and Refund Policy/i],
  ['https://store.dagangos.com/contact', /contact@dagangos\.com/i],
]

async function get(url, userAgent, redirect = 'follow') {
  return fetch(url, {
    headers: { 'User-Agent': userAgent },
    redirect,
    signal: AbortSignal.timeout(30_000),
  })
}

async function checkPage(url, marker, agentName, userAgent) {
  const response = await get(url, userAgent)
  const body = await response.text()
  if (response.status !== 200) throw new Error(`${url} returned ${response.status} to ${agentName}`)
  if (body.trim().length < 20) throw new Error(`${url} returned an unexpectedly short body to ${agentName}`)
  if (forbidden.test(body)) throw new Error(`${url} returned a challenge or JS-only public shell to ${agentName}`)
  if (!marker.test(body)) throw new Error(`${url} is missing marker ${marker} for ${agentName}`)
  console.log(`PASS ${response.status} ${url} [${agentName}]`)
}

async function checkStatus(url, expectedStatus, userAgent = googlebotAgent) {
  const response = await get(url, userAgent, 'manual')
  if (response.status !== expectedStatus) {
    throw new Error(`${url} returned ${response.status}; expected ${expectedStatus}`)
  }
  console.log(`PASS ${expectedStatus} ${url}`)
}

async function checkRedirect(url, expectedTarget) {
  for (const [agentName, userAgent] of agents) {
    const response = await get(url, userAgent, 'manual')
    if (![301, 308].includes(response.status)) {
      throw new Error(`${url} returned ${response.status} to ${agentName}; expected 301/308`)
    }
    const location = response.headers.get('location')
    if (location !== expectedTarget) {
      throw new Error(`${url} redirected to ${location}; expected ${expectedTarget}`)
    }
    console.log(`PASS ${response.status} ${url} -> ${location} [${agentName}]`)
  }
}

for (const [agentName, userAgent] of agents) {
  for (const [url, marker] of publicPages) {
    await checkPage(url, marker, agentName, userAgent)
  }
}

for (const [url, marker] of applicationPages) {
  await checkPage(url, marker, 'browser', browserAgent)
}

await checkStatus('https://dagangos.com/random-healthcheck-nonexistent', 404)
await checkStatus('https://store.dagangos.com/definitely-not-real', 404)

const admin = await get('https://store.dagangos.com/en/admin', browserAgent, 'manual')
if (![302, 307, 308].includes(admin.status) || !/\/en\/auth\/login/.test(admin.headers.get('location') || '')) {
  throw new Error(`Protected admin route did not redirect to login: ${admin.status} ${admin.headers.get('location')}`)
}
console.log(`PASS protected admin redirect ${admin.status} -> ${admin.headers.get('location')}`)

await checkRedirect(
  'https://www.dagangos.com/produk?source=visibility-check',
  'https://dagangos.com/produk?source=visibility-check',
)
await checkRedirect(
  'https://shop.dagangos.com/id/pricing?source=visibility-check',
  'https://store.dagangos.com/id/pricing?source=visibility-check',
)

try {
  const addresses = await resolve4('random-visibility-check.dagangos.com')
  throw new Error(`Wildcard DNS is still active for unused subdomains: ${addresses.join(', ')}`)
} catch (error) {
  if (error?.code !== 'ENOTFOUND') throw error
  console.log('PASS unused DagangOS subdomains return NXDOMAIN')
}
