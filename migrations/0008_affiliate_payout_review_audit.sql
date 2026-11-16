CREATE TABLE affiliate_payout_review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id TEXT NOT NULL REFERENCES affiliate_payouts(id),
  action TEXT NOT NULL CHECK (action IN ('approved', 'cancelled')),
  reviewer TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL
);

CREATE TRIGGER affiliate_payout_review_audit
AFTER UPDATE OF status ON affiliate_payouts
WHEN OLD.status <> NEW.status AND NEW.status IN ('approved', 'cancelled')
BEGIN
  INSERT INTO affiliate_payout_review_events (payout_id, action, reviewer, reviewed_at)
  VALUES (NEW.id, NEW.status, NEW.reviewer, NEW.reviewed_at);
END;

CREATE TRIGGER affiliate_payout_review_events_no_update
BEFORE UPDATE ON affiliate_payout_review_events
BEGIN
  SELECT RAISE(ABORT, 'Payout review events are immutable');
END;

CREATE TRIGGER affiliate_payout_review_events_no_delete
BEFORE DELETE ON affiliate_payout_review_events
BEGIN
  SELECT RAISE(ABORT, 'Payout review events are immutable');
END;
