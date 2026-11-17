CREATE TABLE IF NOT EXISTS affiliate_signup_agreements (
  token_hash TEXT PRIMARY KEY REFERENCES affiliate_verification_requests(token_hash) ON DELETE CASCADE,
  version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS affiliate_agreement_acceptances (
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('signup', 'dashboard')),
  PRIMARY KEY (affiliate_id, version)
);
CREATE TRIGGER IF NOT EXISTS affiliate_agreement_no_update
BEFORE UPDATE ON affiliate_agreement_acceptances
BEGIN
  SELECT RAISE(ABORT, 'Agreement acceptance records are immutable');
END;
CREATE TRIGGER IF NOT EXISTS affiliate_agreement_no_delete
BEFORE DELETE ON affiliate_agreement_acceptances
BEGIN
  SELECT RAISE(ABORT, 'Agreement acceptance records are immutable');
END;
