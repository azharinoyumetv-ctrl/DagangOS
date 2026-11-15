CREATE TABLE affiliate_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  destination TEXT,
  handoff_path TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('upcoming', 'tracking', 'subscription')),
  CHECK ((mode = 'upcoming') = (destination IS NULL))
);

INSERT INTO affiliate_products (id, name, destination, mode) VALUES
  ('geraina', 'Geraina POS', '/geraina', 'subscription'),
  ('dapuros', 'DapurOS', '/dapuros', 'subscription'),
  ('web', 'DagangOS Web', 'https://wmp.dagangos.com/id', 'tracking'),
  ('laundryos', 'LaundryOS', NULL, 'upcoming'),
  ('autocareos', 'AutoCareOS', NULL, 'upcoming'),
  ('salonos', 'SalonOS', NULL, 'upcoming');

UPDATE affiliate_products SET handoff_path = '/api/affiliate/referral' WHERE id = 'web';

CREATE TABLE affiliate_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'merchant_product')),
  referral_days INTEGER NOT NULL CHECK (referral_days BETWEEN 1 AND 365)
);

CREATE TABLE affiliates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  access_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE affiliate_visits (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  product_id TEXT NOT NULL REFERENCES affiliate_products(id),
  visited_at INTEGER NOT NULL
);
CREATE INDEX affiliate_visit_product ON affiliate_visits (affiliate_id, product_id);

CREATE TABLE affiliate_acquisitions (
  order_id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES affiliate_products(id),
  owner_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  affiliate_id TEXT REFERENCES affiliates(id),
  visit_id TEXT REFERENCES affiliate_visits(id),
  policy_version TEXT NOT NULL,
  tier TEXT NOT NULL,
  period TEXT NOT NULL,
  list_amount INTEGER NOT NULL CHECK (list_amount > 0),
  monthly_amount INTEGER NOT NULL CHECK (monthly_amount > 0),
  charged_amount INTEGER NOT NULL CHECK (charged_amount > 0 AND charged_amount <= list_amount),
  quote_expires INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'requested', 'paid', 'settled', 'failed', 'reversed')),
  paid_at TEXT
);
CREATE UNIQUE INDEX affiliate_one_acquisition ON affiliate_acquisitions (scope_key) WHERE state <> 'failed';
CREATE INDEX affiliate_acquisition_state ON affiliate_acquisitions (state);

CREATE TRIGGER affiliate_freeze_acquisition
BEFORE UPDATE OF order_id, scope_key, product_id, owner_id, store_id, affiliate_id, visit_id,
  policy_version, tier, period, list_amount, monthly_amount, charged_amount, quote_expires
ON affiliate_acquisitions
BEGIN
  SELECT RAISE(ABORT, 'Acquisition snapshots are immutable');
END;

CREATE TRIGGER affiliate_freeze_scope
BEFORE UPDATE OF scope ON affiliate_policy
WHEN OLD.scope <> NEW.scope AND EXISTS (SELECT 1 FROM affiliate_acquisitions)
BEGIN
  SELECT RAISE(ABORT, 'Existing acquisitions require a commission scope migration');
END;

CREATE TRIGGER affiliate_keep_policy
BEFORE DELETE ON affiliate_policy WHEN EXISTS (SELECT 1 FROM affiliate_acquisitions)
BEGIN
  SELECT RAISE(ABORT, 'Existing acquisitions require their commission scope');
END;

CREATE TABLE affiliate_ledger (
  order_id TEXT NOT NULL REFERENCES affiliate_acquisitions(order_id),
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  product_id TEXT NOT NULL REFERENCES affiliate_products(id),
  kind TEXT NOT NULL CHECK (kind IN ('commission', 'reversal')),
  amount INTEGER NOT NULL CHECK ((kind = 'commission' AND amount >= 0) OR (kind = 'reversal' AND amount <= 0)),
  provider_reference TEXT,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (order_id, kind)
);
CREATE INDEX affiliate_ledger_product ON affiliate_ledger (affiliate_id, product_id);

CREATE TRIGGER affiliate_ledger_no_update
BEFORE UPDATE ON affiliate_ledger
BEGIN
  SELECT RAISE(ABORT, 'Affiliate ledger entries are append-only');
END;

CREATE TRIGGER affiliate_ledger_no_delete
BEFORE DELETE ON affiliate_ledger
BEGIN
  SELECT RAISE(ABORT, 'Affiliate ledger entries are append-only');
END;
