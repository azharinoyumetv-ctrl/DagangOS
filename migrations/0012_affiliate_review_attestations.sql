-- A reviewer records that identity and ownership of the exact payout
-- destination were checked outside this system. No identity documents or
-- bank account numbers are copied into this audit record.
CREATE TABLE IF NOT EXISTS affiliate_payout_review_attestations (
  payout_id TEXT PRIMARY KEY REFERENCES affiliate_payouts(id),
  reviewer TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  identity_verified INTEGER NOT NULL CHECK (identity_verified = 1),
  bank_ownership_verified INTEGER NOT NULL CHECK (bank_ownership_verified = 1)
);

CREATE TRIGGER IF NOT EXISTS affiliate_payout_attestation_no_update
BEFORE UPDATE ON affiliate_payout_review_attestations
BEGIN
  SELECT RAISE(ABORT, 'Payout review attestations are immutable');
END;

CREATE TRIGGER IF NOT EXISTS affiliate_payout_attestation_no_delete
BEFORE DELETE ON affiliate_payout_review_attestations
BEGIN
  SELECT RAISE(ABORT, 'Payout review attestations are immutable');
END;
