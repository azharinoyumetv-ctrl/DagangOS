# Affiliate payout operations

The payout queue is shared by Geraina and DapurOS. Approved payouts may be sent automatically on the scheduled date; unapproved proposals are never sent.

The system creates a proposal when an active affiliate has an email-verified bank destination and at least Rp149,000 in commission from customer payments at least 14 days old. Email verification confirms control of the affiliate email; it does **not** verify identity or ownership of the bank account.

## Review a proposal

1. Open the private repository's **Actions → Review affiliate payouts** workflow.
2. Choose **Run workflow**, select `list`, and open the completed run's **Review payout** log. It shows each payout ID, affiliate, amount, bank, account-holder name, last four digits, status, and review notes. The notes flag a changed destination, missing agreement, outstanding disputes, checks still needed, or an uncertain transfer. Access to the repository and its Actions logs should be limited to authorized reviewers.
3. Verify the affiliate's identity and ownership of the exact destination independently, and check the commission and any unresolved disputes. The current affiliate agreement must have been accepted. To approve, run the workflow with `approve`, the exact payout ID, and both explicit verification attestations checked. To cancel, select `cancel`. The GitHub actor, review time, and attestations are recorded; do not claim verification based on email confirmation alone.

The review log shows only the last four account digits. A matching name and four digits alone do not prove that the exact stored account is owned by the affiliate. The current workflow does not provide a secure full-account comparison or automated bank ownership check; resolve that verification through an independently verified process before checking the ownership attestation. Do not send full bank numbers or identity documents through GitHub Actions inputs or logs.

Approval reserves that specific amount and bank snapshot. Changing the bank details or reversing enough commission prevents execution. A proposal or approved payout can be cancelled until processing starts. Review and cancellation events are retained in the audit history.

An active or lost provider dispute holds the affiliate's payout. A won dispute can clear the dispute hold; payment evidence still needs a fresh settlement check. Use the workflow's `disputes` action to list unresolved cases. For a lost dispute, independently review the provider outcome, then use `release_dispute` to preserve the commission or `reverse_dispute` to reverse the entire commission. Both actions require the dispute ID and an audit reason. A later provider update reopens the hold for review. Do not reverse an entire commission for a partial chargeback unless that decision has actually been justified. The system never automatically accepts or challenges a provider dispute. A completed partial refund of an annual subscription preserves the original first-month commission; pending refunds and other exception cases remain held for review. A confirmed full refund or reversal reverses the commission.

## Timing and uncertain outcomes

Approved proposals are submitted on the 25th in Western Indonesia Time (UTC+7), subject to a recent successful settlement check for all underlying commissions. An affiliate may receive at most one successful payout in a calendar month; additional approved balances wait until a later month. Submission and provider status are reconciled periodically. Processing errors can delay payment.

Before submission the scheduler rechecks each relevant invoice, transaction, refund and provider dispute list. A provider error or incomplete response leaves the payout approved and unsent for another attempt. Checks run in batches of up to 12 sales, approximately one batch per minute, and all evidence must be less than two hours old when the payout is claimed. For multi-batch payouts, the earliest checks therefore precede the final submission; this reduces but does not eliminate the window in which a provider status can change. Very large histories that cannot be checked within that window will remain on hold and need investigation.

An `unknown` status means that the transfer request's outcome is uncertain. Do not create or send a replacement manually. The reconciliation job searches the provider by the original reference; if the result remains unknown, investigate with the provider before taking further action. `failed` and `reversed` outcomes release the reservation for a later reviewed proposal.

## Current test evidence

The local Worker integration exercises commission creation, proposal, authenticated review, scheduled execution, and status reconciliation using a simulated provider. A separate explicitly enabled test uses a development-mode provider credential for a test payout and reads the same payout by ID and reference. Neither test moves live funds.
