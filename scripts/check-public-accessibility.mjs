const browserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/127 Safari/537.36'
const googlebotAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const challenge = /Just a moment|cf-chl-|403 Forbidden/i
const jsOnlyShell = /You need to enable JavaScript to run this app/i
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
  ['https://wmp.dagangos.com/', /PT DagangOS Digital Indonesia/i],
  ['https://wmp.dagangos.com/en', /PT DagangOS Digital Indonesia/i],
  ['https://wmp.dagangos.com/id', /PT DagangOS Digital Indonesia/i],
  ['https://wmp.dagangos.com/en/pricing', /Website and Platform Pricing/i],
  ['https://wmp.dagangos.com/id/pricing', /Harga Paket Website dan Platform/i],
  ['https://wmp.dagangos.com/en/business', /Business Information/i],
  ['https://wmp.dagangos.com/id/business', /Informasi Bisnis/i],
  ['https://wmp.dagangos.com/en/site/about', /About Us/i],
  ['https://wmp.dagangos.com/id/site/about', /Tentang Kami/i],
  ['https://wmp.dagangos.com/en/site/catalog', /Solutions Catalog/i],
  ['https://wmp.dagangos.com/id/site/catalog', /Solutions Catalog/i],
  ['https://wmp.dagangos.com/en/site/shop', /Ownership Packages/i],
  ['https://wmp.dagangos.com/id/site/shop', /Paket Kepemilikan/i],
  ['https://wmp.dagangos.com/en/site/contact', /contact@dagangos\.com/i],
  ['https://wmp.dagangos.com/id/site/contact', /contact@dagangos\.com/i],
  ['https://wmp.dagangos.com/en/site/support', /Support/i],
  ['https://wmp.dagangos.com/id/site/support', /Dukungan/i],
  ['https://wmp.dagangos.com/en/site/terms', /Terms of Service/i],
  ['https://wmp.dagangos.com/id/site/terms', /Syarat (?:&amp;|&) Ketentuan/i],
  ['https://wmp.dagangos.com/en/site/privacy', /Privacy Policy/i],
  ['https://wmp.dagangos.com/id/site/privacy', /Kebijakan Privasi/i],
  ['https://wmp.dagangos.com/en/site/refund', /Cancellation and Refund Policy/i],
  ['https://wmp.dagangos.com/id/site/refund', /Kebijakan Pembatalan dan Refund/i],
  ['https://wmp.dagangos.com/robots.txt', /Sitemap:\s*https:\/\/wmp\.dagangos\.com\/sitemap\.xml/i],
  ['https://wmp.dagangos.com/sitemap.xml', /https:\/\/wmp\.dagangos\.com\/id\/pricing/i],
]

const applicationPages = [
  ['https://dagangos.com/geraina/login', /<div id="root">/i],
  ['https://dagangos.com/geraina/register', /<div id="root">/i],
  ['https://dagangos.com/dapuros/login', /<div id="root">/i],
  ['https://dagangos.com/dapuros/register', /<div id="root">/i],
  ['https://wmp.dagangos.com/checkout', /DagangOS/i],
  ['https://wmp.dagangos.com/login', /PT DagangOS Digital Indonesia/i],
  ['https://wmp.dagangos.com/register', /PT DagangOS Digital Indonesia/i],
  ['https://wmp.dagangos.com/terms', /Terms of Service/i],
  ['https://wmp.dagangos.com/privacy', /Privacy Policy/i],
  ['https://wmp.dagangos.com/refund-policy', /Cancellation and Refund Policy/i],
  ['https://wmp.dagangos.com/contact', /contact@dagangos\.com/i],
]

async function get(url, userAgent, redirect = 'follow') {
  return fetch(url, {
    headers: { 'User-Agent': userAgent },
    redirect,
    signal: AbortSignal.timeout(30_000),
  })
}

async function checkPage(url, marker, agentName, userAgent, { allowApplicationShell = false } = {}) {
  const response = await get(url, userAgent)
  const body = await response.text()
  if (response.status !== 200) throw new Error(`${url} returned ${response.status} to ${agentName}`)
  if (body.trim().length < 20) throw new Error(`${url} returned an unexpectedly short body to ${agentName}`)
  if (challenge.test(body)) throw new Error(`${url} returned a challenge or block page to ${agentName}`)
  if (!allowApplicationShell && jsOnlyShell.test(body)) throw new Error(`${url} returned a JS-only public shell to ${agentName}`)
  if (!marker.test(body)) throw new Error(`${url} is missing marker ${marker} for ${agentName}`)
  console.log(`PASS ${response.status} ${url} [${agentName}]`)
}

async function checkStatus(url, expectedStatus, userAgent = googlebotAgent, redirect = 'manual') {
  const response = await get(url, userAgent, redirect)
  if (response.status !== expectedStatus) {
    throw new Error(`${url} returned ${response.status}; expected ${expectedStatus}`)
  }
  console.log(`PASS ${expectedStatus} ${url}`)
}

async function checkDirectPage(url, marker) {
  for (const [agentName, userAgent] of agents) {
    const response = await get(url, userAgent, 'manual')
    const body = await response.text()
    if (response.status !== 200 || response.headers.has('location')) {
      throw new Error(`${url} returned ${response.status} with Location ${response.headers.get('location')} to ${agentName}; expected a direct 200`)
    }
    if (challenge.test(body) || jsOnlyShell.test(body) || !marker.test(body)) {
      throw new Error(`${url} did not return usable server-rendered content to ${agentName}`)
    }
    console.log(`PASS direct 200 ${url} [${agentName}]`)
  }
}

for (const [agentName, userAgent] of agents) {
  for (const [url, marker] of publicPages) {
    await checkPage(url, marker, agentName, userAgent)
  }
}

for (const [url, marker] of applicationPages) {
  await checkPage(url, marker, 'browser', browserAgent, { allowApplicationShell: true })
}

await checkStatus('https://dagangos.com/random-healthcheck-nonexistent', 404)
await checkStatus('https://wmp.dagangos.com/definitely-not-real', 404, googlebotAgent, 'follow')

const admin = await get('https://wmp.dagangos.com/en/admin', browserAgent, 'manual')
if (![302, 307, 308].includes(admin.status) || !/\/en\/auth\/login/.test(admin.headers.get('location') || '')) {
  throw new Error(`Protected admin route did not redirect to login: ${admin.status} ${admin.headers.get('location')}`)
}
console.log(`PASS protected admin redirect ${admin.status} -> ${admin.headers.get('location')}`)

await checkDirectPage('https://www.dagangos.com/produk?source=visibility-check', /PT DagangOS Digital Indonesia/i)
await checkDirectPage('https://store.dagangos.com/id/pricing?source=visibility-check', /Harga Paket Website dan Platform/i)
await checkDirectPage('https://wmp.dagangos.com/', /PT DagangOS Digital Indonesia/i)

const wmpRobots = await (await get('https://wmp.dagangos.com/robots.txt', googlebotAgent)).text()
if (/Disallow:\s*\/\*\/checkout\/|Disallow:\s*\/\*\/project-setup\//i.test(wmpRobots)) {
  throw new Error('WMP robots.txt still blocks checkout or project setup')
}
console.log('PASS WMP robots.txt allows checkout and project setup')

const unknownTenant = await get('https://random-visibility-check.dagangos.com/', browserAgent, 'manual')
const unknownTenantBody = await unknownTenant.text()
if (unknownTenant.status !== 404) {
  throw new Error(`Unknown tenant hostname returned ${unknownTenant.status}; expected controlled 404`)
}
if (challenge.test(unknownTenantBody)) {
  throw new Error('Unknown tenant hostname returned a Cloudflare challenge or block page')
}
console.log('PASS intentional WMP tenant wildcard is active and unknown tenant hostnames return 404')
