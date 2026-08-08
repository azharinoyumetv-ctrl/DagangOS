# Cloudflare DNS and Redirect Cleanup — 8 August 2026

The application-level accessibility remediation is deployed. The remaining hostname defects are Cloudflare zone configuration, not Worker or VPS application behavior.

## Verified current state

| Host | DNS result | HTTP result | Required action |
|---|---|---:|---|
| `dagangos.com` | Cloudflare proxy IPs | 200 | Keep |
| `store.dagangos.com` | Cloudflare proxy IPs | 200 | Keep; canonical commercial store |
| `www.dagangos.com` | Cloudflare proxy IPs | 522 | Add permanent redirect to `https://dagangos.com` |
| `shop.dagangos.com` | Cloudflare proxy IPs | 404 | Add permanent redirect to `https://store.dagangos.com` or remove DNS if intentionally unused |

External DNS checks also returned the same Cloudflare proxy IP pair for:

`admin`, `api`, `app`, `assets`, `auth`, `cdn`, `dapuros`, `dev`, `geraina`, `mail`, `n8n`, `portal`, `staging`, `status`, and `test` under `dagangos.com`.

This is consistent with a wildcard DNS record. Do not remove individual records until the owner of infrastructure confirms whether `mail`, `n8n`, or another named service is active.

## Redirect rules to add

In **Cloudflare Dashboard → dagangos.com → Rules → Redirect Rules**, add these rules above generic proxy/origin rules.

### 1. Canonical `www` redirect

- Match hostname: `www.dagangos.com`
- Status: `301` or `308`
- Destination: same path and query on `https://dagangos.com`
- Example: `https://www.dagangos.com/foo?ref=x` → `https://dagangos.com/foo?ref=x`

### 2. Obsolete `shop` redirect

- Match hostname: `shop.dagangos.com`
- Status: `301` or `308`
- Destination: same path and query on `https://store.dagangos.com`
- Example: `https://shop.dagangos.com/id/pricing` → `https://store.dagangos.com/id/pricing`

## Wildcard cleanup procedure

1. Export the Cloudflare DNS zone before editing.
2. Identify wildcard records such as `*` and every explicit subdomain record.
3. Confirm active infrastructure owners and origin targets for `mail`, `n8n`, `api`, and any other operational hostname.
4. Remove unused explicit records.
5. Remove or narrow the wildcard only after all required hostnames are explicit.
6. Retest browser and Googlebot requests from outside the local network.

## Acceptance checks

```bash
curl -I https://www.dagangos.com/foo
curl -I https://shop.dagangos.com/foo
```

Expected:

- `www` returns `301`/`308` with `Location: https://dagangos.com/foo`
- `shop` returns `301`/`308` with `Location: https://store.dagangos.com/foo`

Do not consider these two defects fixed until the external responses match the expectations above.
