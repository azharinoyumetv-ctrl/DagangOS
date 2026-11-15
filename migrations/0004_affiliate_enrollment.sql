CREATE TABLE affiliate_verification_requests (
  token_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX affiliate_verification_email ON affiliate_verification_requests (email_hash, created_at);

CREATE TABLE affiliate_enrollment_limits (
  bucket_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX affiliate_enrollment_limit_bucket ON affiliate_enrollment_limits (bucket_hash, created_at);
