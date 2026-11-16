ALTER TABLE affiliate_acquisitions ADD COLUMN reconciled_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX affiliate_reconcile_due ON affiliate_acquisitions (state, reconciled_at);
