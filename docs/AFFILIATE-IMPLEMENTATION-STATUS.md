# Geraina and DapurOS affiliate verification

Updated 23 November 2026 (JST).

- The live payout policy uses a 14-day hold and a Rp149,000 minimum. Reviewed payouts are scheduled for the 25th of each month in Western Indonesian Time. The [D1 migration and deployment verification](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/45039378931) includes a policy check and public smoke tests.
- An isolated Geraina and DapurOS journey exercised referral attribution through trial, commission review, and a Xendit test-mode payout that reached `SUCCEEDED`. Customer invoice and settlement responses in that journey used fixtures. Separate hosted card checkouts for each product settled in Xendit test mode.
- A settled Xendit test-mode QRIS payment produced a dispute that moved from `ACTION_REQUIRED` to `LOST`. The payout preflight read the provider's dispute and held the approved payout in an isolated database. The test then recorded a finance release decision. It used seeded invoice records and a stub transfer.
- Xendit's sample dispute webhook received HTTP 200 from the live service. The sample verified callback delivery and authentication using a sample order reference.
- Complete a continuous test from hosted checkout through the provider webhook, settlement, commission, review, and successful payout. Live bank delivery remains unverified. Finance still verifies affiliate identity and bank ownership independently. The [legal review draft](AFFILIATE-LEGAL-REVIEW-DRAFT.md) records the open terms review.
