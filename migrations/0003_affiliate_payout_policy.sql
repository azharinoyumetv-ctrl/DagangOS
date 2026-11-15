CREATE TABLE affiliate_payout_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  minimum_idr INTEGER NOT NULL CHECK (minimum_idr > 0),
  payout_day INTEGER NOT NULL CHECK (payout_day BETWEEN 1 AND 28),
  wait_days INTEGER NOT NULL CHECK (wait_days BETWEEN 0 AND 365)
);

INSERT INTO affiliate_payout_policy (id, minimum_idr, payout_day, wait_days)
VALUES (1, 149000, 25, 30);
