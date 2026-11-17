-- Only normalized hashes are stored; the email address itself is not added.
CREATE TABLE IF NOT EXISTS affiliate_email_signals (
  affiliate_id TEXT PRIMARY KEY REFERENCES affiliates(id),
  normalized_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS affiliate_email_signal_hash ON affiliate_email_signals (normalized_hash);

CREATE TABLE IF NOT EXISTS affiliate_signup_email_signals (
  token_hash TEXT PRIMARY KEY REFERENCES affiliate_verification_requests(token_hash) ON DELETE CASCADE,
  normalized_hash TEXT NOT NULL
);
