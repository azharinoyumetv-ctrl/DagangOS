const browserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/127 Safari/537.36'
const googlebotAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const forbidden = /Just a moment|cf-chl-|403 Forbidden|You need to enable JavaScript to run this app/i

const pages = [
  ['https://dagangos.com/', 'PT DagangOS Digital Indonesia'],
  ['https://dagangos.com/produk', 'PT DagangOS Digital Indonesia'],
  ['https://dagangos.com/geraina', 'Geraina POS'],
  ['https://dagangos.com/geraina/pricing', 'Rp 149.000'],
  ['https://dagangos.com/dapuros', 'DapurOS'],
  ['https://dagangos.com/dapuros/pricing', 'Rp 249.000'],
  ['https://dagangos.com/robots.txt', 'Sitemap: https://dagangos.com/sitemap.xml'],
  ['https://dagangos.com/sitemap.xml', 'https://dagangos.com/geraina/pricing'],
  ['https://store.dagangos.com/', 'PT DagangOS Digital Indonesia'],
  ['https://store.dagangos.com/id/pricing', 'E-Commerce Platform'],
  ['https://store.dagangos.com/checkout', 'DagangOS'],
  ['https://store.dagangos.com/terms', 'Terms'],
  ['https://store.dagangos.com/privacy', 'Privacy'],
  ['https://store.dagangos.com/refund-policy', 'Cancellation and Refund Policy'],
  ['https://store.dagangos.com/contact', 'contact@dagangos.com'],
]

async function check(url, marker, userAgent) {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.text()
  if (response.status !== 200) throw new Error(`${url} returned ${response.status}`)
  if (!body.trim()) throw new Error(`${url} returned an empty body`)
  if (forbidden.test(body)) throw new Error(`${url} returned a challenge or JS-only shell`)
  if (!body.includes(marker)) throw new Error(`${url} is missing marker: ${marker}`)
  console.log(`PASS ${response.status} ${url} [${userAgent.includes('Googlebot') ? 'Googlebot' : 'browser'}]`)
}

for (const [url, marker] of pages) {
  await check(url, marker, browserAgent)
}

for (const [url, marker] of pages.filter(([url]) => /geraina|dapuros|store\.dagangos\.com\/(id\/pricing|refund-policy)/.test(url))) {
  await check(url, marker, googlebotAgent)
}

const missing = await fetch('https://dagangos.com/random-healthcheck-nonexistent', {
  headers: { 'User-Agent': googlebotAgent },
  redirect: 'manual',
  signal: AbortSignal.timeout(30_000),
})
if (missing.status !== 404) throw new Error(`Unknown portal route returned ${missing.status}, expected 404`)
console.log('PASS 404 https://dagangos.com/random-healthcheck-nonexistent')
