CREATE TABLE affiliate_bank_destinations (
  affiliate_id TEXT PRIMARY KEY REFERENCES affiliates(id),
  bank_code TEXT NOT NULL,
  last_four TEXT NOT NULL,
  encrypted_details TEXT NOT NULL,
  nonce TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE affiliate_bank_change_requests (
  token_hash TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  bank_code TEXT NOT NULL,
  last_four TEXT NOT NULL,
  encrypted_details TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX affiliate_bank_change_expiry ON affiliate_bank_change_requests (expires_at);
