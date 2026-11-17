-- Provider-confirmed disputes put the related affiliate's payouts on hold.
-- A lost dispute remains on hold for finance review; a won dispute can clear.
CREATE TABLE IF NOT EXISTS affiliate_disputes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES affiliate_acquisitions(order_id),
  payment_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTION_REQUIRED', 'UNDER_REVIEW', 'WON', 'LOST')),
  updated_at INTEGER NOT NULL,
  due_at INTEGER,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS affiliate_disputes_order ON affiliate_disputes (order_id, status);

CREATE TABLE IF NOT EXISTS affiliate_dispute_reviews (
  dispute_id TEXT NOT NULL REFERENCES affiliate_disputes(id),
  provider_updated_at INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('release', 'reverse')),
  reviewer TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  reviewed_at INTEGER NOT NULL,
  PRIMARY KEY (dispute_id, provider_updated_at)
);

CREATE TRIGGER IF NOT EXISTS affiliate_dispute_no_delete
BEFORE DELETE ON affiliate_disputes
BEGIN
  SELECT RAISE(ABORT, 'Dispute records cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS affiliate_dispute_review_no_update
BEFORE UPDATE ON affiliate_dispute_reviews
BEGIN
  SELECT RAISE(ABORT, 'Dispute reviews are immutable');
END;

CREATE TRIGGER IF NOT EXISTS affiliate_dispute_review_no_delete
BEFORE DELETE ON affiliate_dispute_reviews
BEGIN
  SELECT RAISE(ABORT, 'Dispute reviews are immutable');
END;
