-- A payout proposal reserves a specific amount and bank destination for review.
-- No transfer is initiated by this migration or by creating a proposal.
ALTER TABLE affiliate_acquisitions ADD COLUMN settlement_verified_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE affiliate_payouts (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  bank_code TEXT NOT NULL,
  last_four TEXT NOT NULL,
  encrypted_details TEXT NOT NULL,
  nonce TEXT NOT NULL,
  destination_updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'submitted', 'unknown', 'succeeded', 'failed', 'reversed', 'cancelled')),
  reviewed_at INTEGER,
  reviewer TEXT,
  provider_id TEXT UNIQUE,
  reconciled_at INTEGER NOT NULL DEFAULT 0,
  CHECK ((status <> 'approved') OR (reviewed_at IS NOT NULL AND reviewer IS NOT NULL))
);

CREATE UNIQUE INDEX affiliate_one_open_payout ON affiliate_payouts (affiliate_id)
  WHERE status IN ('proposed', 'approved', 'submitted', 'unknown');

CREATE INDEX affiliate_payout_by_affiliate ON affiliate_payouts (affiliate_id, created_at);

CREATE TRIGGER affiliate_payout_immutable_snapshot
BEFORE UPDATE OF id, affiliate_id, amount, bank_code, last_four, encrypted_details, nonce, destination_updated_at, created_at
ON affiliate_payouts
BEGIN
  SELECT RAISE(ABORT, 'Payout snapshots are immutable');
END;

CREATE TRIGGER affiliate_payout_no_delete
BEFORE DELETE ON affiliate_payouts
BEGIN
  SELECT RAISE(ABORT, 'Payout records cannot be deleted');
END;

CREATE TRIGGER affiliate_payout_state_transitions
BEFORE UPDATE OF status ON affiliate_payouts
WHEN OLD.status <> NEW.status AND NOT (
  (OLD.status = 'proposed' AND NEW.status IN ('approved', 'cancelled')) OR
  (OLD.status = 'approved' AND NEW.status IN ('submitted', 'unknown', 'cancelled')) OR
  (OLD.status IN ('submitted', 'unknown') AND NEW.status IN ('submitted', 'unknown', 'succeeded', 'failed', 'reversed')) OR
  (OLD.status = 'succeeded' AND NEW.status = 'reversed')
)
BEGIN
  SELECT RAISE(ABORT, 'Invalid payout state transition');
END;

CREATE TRIGGER affiliate_payout_provider_reference_immutable
BEFORE UPDATE OF provider_id ON affiliate_payouts
WHEN OLD.provider_id IS NOT NULL AND NEW.provider_id IS NOT OLD.provider_id
BEGIN
  SELECT RAISE(ABORT, 'Payout provider reference is immutable');
END;
