-- Every reviewed payout can be checked in bounded batches. The record is
-- scoped to its immutable order and reviewed payout, and contains no PII.
CREATE TABLE IF NOT EXISTS affiliate_payout_preflight_checks (
  payout_id TEXT NOT NULL REFERENCES affiliate_payouts(id),
  order_id TEXT NOT NULL REFERENCES affiliate_acquisitions(order_id),
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (payout_id, order_id)
);
