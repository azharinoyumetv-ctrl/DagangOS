# Asia backend region verification

Verified 28 October 2026, Japan time.

## Finding

The authenticated Atlas cluster dashboard showed **GCP Jakarta (`asia-southeast2`)**, Free tier. The database was already in the requested region. No Atlas region, tier, data, credentials, network access, or backup settings were changed.

Both application backends were executing in Vercel's `iad1` region. Before the correction their response IDs included `sin1::iad1`, distinguishing the Singapore entry point from the US function location. The official Vercel compute-region list includes Singapore (`sin1`); Jakarta is not listed as a compute region.

## Published correction

Added only `"regions": ["sin1"]` to each backend's existing `vercel.json`. The parsed configuration was compared with HEAD to confirm all API routing/build settings were unchanged. Pending Geraina performance edits were excluded from these commits.

- GerainaOS: `edea1fc741510934665d5efac572039dbc11c1fa`; Vercel deployment `EN1e2TP5FutvxrzRqmSpT2VaxBvz` completed successfully.
- DapurOS: `3bac7aeae3c3c4b154be391a7150dab2a7ed435e`; Vercel deployment `28arxGtJhzd89VrW4UqyyVhpBDy8` completed successfully.

## Live verification

Both direct health endpoints returned HTTP 200, `ok: true`, and response IDs containing `sin1::sin1`. Geraina's public same-origin API also returned HTTP 200 from Singapore for real test-store login, session, dashboard, category and catalogue reads.

| Geraina public API operation | Observed time |
| --- | ---: |
| Login | 763 ms |
| Session validation | 538 ms |
| Dashboard statistics | 314 ms |
| Product categories | 256 ms |
| Product catalogue | 244 ms |

Health samples were 727/468 ms for Geraina and 499/496 ms for DapurOS. Evidence: `tmp/asia-region-live-verification.json`. These are individual laptop-network samples, not percentile guarantees or load-test capacity. Earlier samples used a different network and had uncontrolled cold/warm states, so no precise percentage speedup is claimed.

The previous laptop network could load MongoDB's account HTML but timed out downloading a required public login chunk from `assets.mongodb-cdn.com`. The same script returned HTTP 200 from the user's VPS. The owner confirmed that switching the laptop to a mobile hotspot restored the login form, then signed in successfully. No account/password/security settings were modified.

## App release boundary

This publication changes only backend hosting configuration. Existing browsers and installed APKs benefit automatically. Public Geraina remains **1.2.14/build 19**. A separate, locally tested **1.2.15/build 20** performance candidate and its uncommitted source changes remain unpublished; its APK must not be described as the public release.

Sources: [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region), [Vercel compute-region list](https://vercel.com/docs/regions).
