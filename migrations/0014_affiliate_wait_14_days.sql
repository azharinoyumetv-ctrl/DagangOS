-- The owner approved a 14-day wait. The marker ensures later policy edits are
-- not silently reset when this additive migration is run again.
CREATE TABLE IF NOT EXISTS affiliate_policy_changes (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

UPDATE affiliate_payout_policy SET wait_days = 14 WHERE id = 1 AND wait_days = 30
  AND NOT EXISTS (SELECT 1 FROM affiliate_policy_changes WHERE id = 'wait-14-days-2026-11-17');

INSERT INTO affiliate_policy_changes (id, applied_at)
  SELECT 'wait-14-days-2026-11-17', unixepoch() * 1000 FROM affiliate_payout_policy WHERE id=1 AND wait_days=14
  ON CONFLICT (id) DO NOTHING;
