ALTER TABLE affiliate_payouts ADD COLUMN completed_at INTEGER;

UPDATE affiliate_payouts SET completed_at = submitted_at WHERE status = 'succeeded' AND completed_at IS NULL;

CREATE TRIGGER affiliate_payout_completion_immutable
BEFORE UPDATE OF completed_at ON affiliate_payouts
WHEN OLD.completed_at IS NOT NULL AND NEW.completed_at IS NOT OLD.completed_at
BEGIN
  SELECT RAISE(ABORT, 'Payout completion time is immutable');
END;
