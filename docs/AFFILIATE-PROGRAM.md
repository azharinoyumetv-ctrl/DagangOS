# DagangOS affiliate program pilot

Affiliates have one code and one dashboard at `https://dagangos.com/affiliate-program`. The DagangOS footer links to the program, and `/affiliate` also opens it. Affiliates register using a name and email, then open and confirm a one-time verification link. Their dashboard access code is shown once; verifying the same email again rotates the access code while retaining the affiliate code. Product links follow `/affiliate-program/<code>/<product>` and open the selected product. The dashboard shows visit counts and net commissions under review without exposing merchant identities.

| Product | Pilot behavior |
| --- | --- |
| Geraina POS | Referral link, first-purchase discount, and one-time pending commission on verified settlement |
| DapurOS | Same checkout contract with its own catalog prices and existing product entitlements |
| DagangOS Web | Referral link and source reference on new project orders. The owner approved a commission of 10% of the first project price; first-purchase verification, settlement, and commission recording are not implemented yet. |
| LaundryOS, AutoCareOS, SalonOS | Listed as upcoming. Enable referral links when their product destinations launch. |

A qualifying checkout applies 10% off the selected monthly or annual price. The annual price already incorporates the product's annual offer. The commission is 10% of the matching plan's frozen **monthly** list price. Geraina Starter annual therefore charges Rp1,341,000 and records Rp14,900 after settlement. Trials, add-ons, subsequent purchases, renewals, plan changes and migrations earn zero commission. The subscription services retain their existing trial and billing behavior.

## Configure a pilot

1. The production Wrangler config points `AFFILIATE_DB` to `dagangos-affiliate-production`. Use a separate D1 database and binding configuration for a hosted sandbox. Wrangler local development uses its own local database state. Keep separate databases for sandbox and live payment credentials.

   ```jsonc
   "d1_databases": [{
     "binding": "AFFILIATE_DB",
     "database_name": "<database name>",
     "database_id": "<database ID>"
   }]
   ```

2. Apply the repository migrations with `npx wrangler d1 migrations apply <database name> --local` for a local pilot or `--remote` for the configured hosted environment. Set a high-entropy Worker secret named `AFFILIATE_ADMIN_TOKEN` for operator actions, and configure `RESEND_API_KEY` for email verification using a verified sender domain. [Cloudflare D1 migration guide](https://developers.cloudflare.com/d1/reference/migrations/)
3. Roll out the matching Geraina POS and DapurOS billing backends before enabling discounts. Roll out the DagangOS Web referral handler before using its link handoff. To use a link directly to the Web landing page in a tracking-only preview, set the Web product's `handoff_path` to SQL `NULL`.
4. The approved checkout policy uses `merchant_product` scope, a 30-day visit-to-signup window, and a 90-day signup-to-first-payment window. The conversion deadline is anchored to the relevant product's trial start, even if the code is entered later. The schema freezes the commission scope after reservations exist. Run the pilot against shared merchant identity and historical billing records.
5. Set `AFFILIATE_CHECKOUT=on` to enable checkout. With both windows configured, web and Android registration or product activation can save a link or a manually entered code to the verified owner account. On a first eligible checkout without a saved referral, the owner can add one code before creating the invoice. The first saved referral is retained, including on a different device. A matching affiliate and merchant email prevents a self-referral. Beneficial-ownership review and public affiliate agreements remain open.

The website APK uses the shared DagangOS checkout. The Google Play build can register a referral with a trial account and use existing paid access. A native Play purchase requires a separate billing integration.

## Enroll an affiliate

Self-service signup is available when the Worker has a configured mail key. Verification links expire after 30 minutes, require an explicit confirmation, and are rate-limited. Registration does not imply payout eligibility: the payout identity, program agreement, finance controls and payment execution still require implementation. Operators may also create an account after independently verifying the email.

Send a server-side request to `POST /api/affiliate/admin/accounts` with the operator bearer token and a JSON body like the following.

```json
{"name":"Example Partner","email":"partner@example.com","code":"PARTNER01"}
```

The response includes an access code once. Share it privately with the verified affiliate. The public referral code has a separate purpose and never authenticates the dashboard. Operators can disable an account by setting `affiliates.active = 0`.

## Reconcile and review

The payment service confirms exact order reference, IDR amount, and payment state independently with Xendit. A payment marked `PAID` can activate a subscription. The automatic commission path requires `SETTLED`. The scheduled Worker revisits referred requested, paid and settled orders, including QR payments whose Payment Link remains `PAID`. Set the `AFFILIATE_XENDIT_KEY` Worker secret to a production key with Transaction Read permission; the invoice key remains separate. If no affiliate key is configured, the service falls back to the existing payment key, which was found to lack this permission. The service checks for a single matching transaction with confirmed settlement. A verified full reversal produces a separate negative ledger entry. The operator endpoint `POST /api/affiliate/admin/reconcile` can also refresh an individual order. [Xendit invoice status](https://help.xendit.co/hc/en-us/articles/4410287394713-What-is-the-difference-between-the-PAID-and-SETTLED-status-on-my-invoice) [Xendit List Transactions](https://docs.xendit.co/apidocs/list-transactions)

Review `requested` acquisitions whose Xendit invoice creation returned an uncertain result. Checkout holds the acquisition slot while a payable invoice may exist. It never starts a second invoice for that slot during an ambiguous retry. A verified expiry releases the slot.

DagangOS Web stores the opaque visit ID as `affiliateVisitId` in the project order notes. During review, match it to a valid `affiliate_visits` row with `product_id = 'web'` and check the visit timestamp. The order note records a lead source and does not authorize a discount or commission.

The approved payout policy is a minimum balance of Rp149,000, monthly on the 25th, and a 30-day wait after customer payment. It is recorded in `affiliate_payout_policy` and can be revised. The owner selected automatic bank transfers through Xendit after human review; affiliate-facing copy should remain DagangOS-branded. Affiliates can enter bank details in the dashboard and confirm the change through email; account names and numbers are encrypted with an AES-GCM Worker key. Email confirmation does not verify the account holder's legal identity. Payout eligibility, approval, payment scheduling and execution, payout identity review, partial refunds and disputes are not implemented. A production credential available during development returned `REQUEST_FORBIDDEN_ERROR` for the money-out API; the deployment credential's own permissions remain unverified. These gaps must be resolved before a financial launch. The pilot does not apply the PRD's proposed voluntary cancellation or refund formula.

`src/affiliate-payout-policy.js` contains tested calculation primitives for matured commissions, reversals, outstanding payouts, the approved minimum, and the 25th in Western Indonesia Time (WIB). `src/affiliate-payout-provider.js` contains a sandbox-tested provider adapter with idempotent requests. Neither module is wired into live payout processing: the finance ledger, review/approval, destination access, scheduled execution and reconciliation must be integrated and tested first. Future approvals must bind the exact destination version and be invalidated when bank details change.

## Add a product

Insert a row into `affiliate_products` with a unique lowercase slug, display name, product destination, and program mode. The dashboard and referral router pick up the row automatically.

- Use `tracking` for a released product with its own sales flow. A cross-origin product on a DagangOS host can register a same-host handoff endpoint to store the visit ID and attach it to the native intake.
- Use `subscription` when the product's catalog, authenticated first-purchase check, and verified payment reconciliation are connected through the shared checkout. Add its catalog and backend entry and adapt its public pricing page to submit the shared signed cart.
- Use `upcoming` for products without public destinations. Switch modes when the product can receive referrals.
