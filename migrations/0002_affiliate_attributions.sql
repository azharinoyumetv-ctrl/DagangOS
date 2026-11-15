ALTER TABLE affiliate_policy ADD COLUMN conversion_days INTEGER
  CHECK (conversion_days BETWEEN 15 AND 365);

CREATE TABLE affiliate_attributions (
  owner_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES affiliate_products(id),
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  visit_id TEXT REFERENCES affiliate_visits(id),
  source TEXT NOT NULL CHECK (source IN ('signup_link', 'signup_code', 'checkout_link', 'checkout_code')),
  policy_version TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > saved_at),
  PRIMARY KEY (owner_id, product_id)
);
