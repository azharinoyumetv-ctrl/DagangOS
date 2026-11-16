# Affiliate dashboard research and implementation notes

Research date: 16 November 2026. Sources below are the platforms' own help or policy documentation.

## Established patterns

- [PartnerStack partner dashboard](https://support.partnerstack.com/hc/en-us/articles/360016866594-Comprehensive-overview-of-the-partner-dashboard) separates projected and available commissions, declined items, payment destinations, and withdrawals with amounts and dates. Its [payment guide](https://support.partnerstack.com/hc/en-us/articles/360009501113-How-do-I-get-paid) also describes withdrawal status and downloadable records. Its withdrawal model is partner-initiated and should not be assumed to be DagangOS policy.
- [impact.com finance widget](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/dashboard/partner-finance-widget-explained) separates pending funds from available balance and shows progress toward automatic withdrawal. Its [status documentation](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/reporting-for-partners/report-action-status-descriptions-explained-for-partners) distinguishes pending, approved, paid, overdue and reversed actions.
- [Amazon Associates](https://affiliate-program.amazon.com/help/node/topic/G63DR893K4DH55XZ) uses scheduled monthly payments and minimum thresholds, while its [earnings report](https://affiliate-program.amazon.com/help/node/topic/GCDWWRFEMW3Q2TE2) exposes product-level clicks, purchases and commission income. Amazon's timing and thresholds are not DagangOS rules.
- [Google AdSense](https://support.google.com/adsense/answer/7164703/payment-timelines-for-adsense?hl=en-GB) separates estimated from finalized earnings, applies a payment threshold and holds, and issues payments on a monthly cycle. Its [payment history](https://support.google.com/adsense/answer/12496700?hl=en) distinguishes earnings, payments and adjustments.
- [Shopify Partners](https://help.shopify.com/en/partners/partner-program/getting-paid) describes a hold after a first bill before certain referral earnings accrue. Shopify's terms are specific to its partner program.

## DagangOS policy and display

The owner chose automatic bank transfer after review, with a Rp149,000 minimum, a 30-day hold from customer payment, and a monthly payment day of the 25th WIB. This is not an on-demand withdrawal facility. The dashboard should tell an affiliate to save and email-verify a bank destination, explain any remaining threshold, and present review and transfer statuses without promising a transfer date or successful deposit.

The all-time commission total is the net of immutable commission and reversal ledger entries, including amounts already paid. The post-hold amount available for review uses the same `availableSql` as payout proposal creation, including deductions for proposed, approved, submitted, unknown and succeeded payouts. Amounts in the hold, in an open payout, and already paid are displayed separately. A post-payment reversal, reservation or policy change can make the underlying balance negative; display zero available and explain the shortfall without assuming its cause. Product activity and payout history are scoped by affiliate ID and show only the latest 20 items; the all-time totals are not limited to those 20. Unsettled payments have no credited commission.

Bank verification here refers to confirming the change through the affiliate's email. It does not automatically verify that the account belongs to the named holder. The existing operator review and provider checks remain authoritative.

## Gaps still to consider

- A full searchable and exportable history, including statements or receipts; the dashboard currently shows the latest 20 records per section.
- Per-referral details such as a reason for reversal, because the current ledger does not store a customer-facing reason. Never invent one.
- A verified payment-provider settlement and bank payout end to end in production. Sandbox tests do not prove a real transfer.
- Automated bank-account ownership validation and operational support for incorrect bank details or transfer failures.
- Predicting an exact next payout date is unsafe while approval, settlement, bank details or provider state may still change. Display the schedule and conditions instead.
