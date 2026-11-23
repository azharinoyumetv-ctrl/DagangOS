CREATE TABLE IF NOT EXISTS subscription_payment_sessions (
  order_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT UNIQUE,
  claim_deadline INTEGER NOT NULL
);
