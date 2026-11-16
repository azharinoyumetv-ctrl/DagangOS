# Affiliate payout operations

The payout queue is shared by Geraina and DapurOS. Production transfers are currently disabled while customer checkout testing is incomplete.

The system creates a proposal when an active affiliate has an email-verified bank destination and at least Rp149,000 in commission from customer payments at least 30 days old. This email verification confirms control of the affiliate email; it does **not** verify ownership of the bank account.

## Review a proposal

1. Open the private repository's **Actions → Review affiliate payouts** workflow.
2. Choose **Run workflow**, select `list`, and open the completed run's **Review payout** log. It shows each payout ID, affiliate, amount, bank, account-holder name, last four digits, and status. Access to the repository and its Actions logs should be limited to authorized reviewers.
3. Verify the destination and commission independently. To approve or cancel, run the workflow again with `approve` or `cancel` and the exact payout ID. The GitHub actor and review time are recorded.

Approval reserves that specific amount and bank snapshot. Changing the bank details or reversing enough commission prevents execution. A proposal or approved payout can be cancelled until processing starts. Review and cancellation events are retained in the audit history.

## Timing and uncertain outcomes

When production transfers are enabled, approved proposals are submitted on the 25th in Western Indonesia Time (UTC+7), subject to a recent successful settlement check for all underlying commissions. Submission and provider status are reconciled periodically. Processing errors can delay payment.

An `unknown` status means that the transfer request's outcome is uncertain. Do not create or send a replacement manually. The reconciliation job searches the provider by the original reference; if the result remains unknown, investigate with the provider before taking further action. `failed` and `reversed` outcomes release the reservation for a later reviewed proposal.

## Current test evidence

The local Worker integration exercises commission creation, proposal, authenticated review, scheduled execution, and status reconciliation using a simulated provider. A separate explicitly enabled test uses a development-mode provider credential for a test payout and reads the same payout by ID and reference. Neither test moves live funds.
