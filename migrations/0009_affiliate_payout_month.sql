ALTER TABLE affiliate_payouts ADD COLUMN submitted_at INTEGER;

CREATE INDEX affiliate_payout_month ON affiliate_payouts (affiliate_id, submitted_at, status);

CREATE TRIGGER affiliate_payout_submission_immutable
BEFORE UPDATE OF submitted_at ON affiliate_payouts
WHEN OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS NOT OLD.submitted_at
BEGIN
  SELECT RAISE(ABORT, 'Payout submission time is immutable');
END;
