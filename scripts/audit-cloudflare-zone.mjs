import { writeFile } from 'node:fs/promises'

const token = process.env.CLOUDFLARE_API_TOKEN
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const zoneName = process.env.CLOUDFLARE_ZONE_NAME || 'dagangos.com'
const outputPath = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length)

if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required')

const base = 'https://api.cloudflare.com/client/v4'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

async function api(path, { optional = false } = {}) {
  const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(30_000) })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    const message = payload?.errors?.map(error => `${error.code}: ${error.message}`).join('; ') || `${response.status} ${response.statusText}`
    if (optional) return { unavailable: message }
    throw new Error(`${path}: ${message}`)
  }
  return payload.result
}

const zoneQuery = new URLSearchParams({ name: zoneName, per_page: '50' })
if (accountId) zoneQuery.set('account.id', accountId)
const zones = await api(`/zones?${zoneQuery}`)
const zone = zones.find(candidate => candidate.name === zoneName)
if (!zone) throw new Error(`Cloudflare zone ${zoneName} was not found for this token`)

const [dnsRecords, rulesets, workerRoutes, workerDomains] = await Promise.all([
  api(`/zones/${zone.id}/dns_records?per_page=5000`, { optional: true }),
  api(`/zones/${zone.id}/rulesets`, { optional: true }),
  api(`/zones/${zone.id}/workers/routes`, { optional: true }),
  accountId ? api(`/accounts/${accountId}/workers/domains`, { optional: true }) : Promise.resolve({ unavailable: 'CLOUDFLARE_ACCOUNT_ID not set' }),
])

const redirectRulesets = Array.isArray(rulesets)
  ? await Promise.all(
      rulesets
        .filter(ruleset => ruleset.phase === 'http_request_dynamic_redirect')
        .map(ruleset => api(`/zones/${zone.id}/rulesets/${ruleset.id}`, { optional: true })),
    )
  : rulesets

const audit = {
  generatedAt: new Date().toISOString(),
  zone: { id: zone.id, name: zone.name, status: zone.status, type: zone.type },
  dnsRecords: (Array.isArray(dnsRecords) ? dnsRecords : []).map(record => ({
    id: record.id,
    type: record.type,
    name: record.name,
    content: record.content,
    proxied: record.proxied,
    ttl: record.ttl,
    comment: record.comment || null,
  })).sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type)),
  redirectRulesets,
  workerRoutes,
  workerDomains,
  unavailable: {
    dnsRecords: dnsRecords?.unavailable || null,
    rulesets: rulesets?.unavailable || null,
    workerRoutes: workerRoutes?.unavailable || null,
    workerDomains: workerDomains?.unavailable || null,
  },
}

const exactNames = new Set(audit.dnsRecords.map(record => record.name))
const wildcardRecords = audit.dnsRecords.filter(record => record.name.startsWith('*.'))
audit.findings = {
  dnsAuditAvailable: Array.isArray(dnsRecords),
  wildcardRecords: wildcardRecords.map(record => ({ id: record.id, type: record.type, name: record.name, content: record.content, proxied: record.proxied })),
  missingExactRecords: Array.isArray(dnsRecords)
    ? ['www.dagangos.com', 'shop.dagangos.com'].filter(name => !exactNames.has(name))
    : null,
  hasDynamicRedirectRuleset: Array.isArray(redirectRulesets) && redirectRulesets.length > 0,
}

const rendered = `${JSON.stringify(audit, null, 2)}\n`
console.log(rendered)
if (outputPath) await writeFile(outputPath, rendered, 'utf8')
