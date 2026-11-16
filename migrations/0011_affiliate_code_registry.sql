-- Keep every code permanently tied to the same affiliate, including old links.
CREATE TABLE IF NOT EXISTS affiliate_code_registry (
  code TEXT PRIMARY KEY COLLATE NOCASE,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id)
);

INSERT OR IGNORE INTO affiliate_code_registry (code, affiliate_id)
SELECT code, id FROM affiliates;

CREATE TRIGGER IF NOT EXISTS affiliate_code_before_insert BEFORE INSERT ON affiliates
WHEN EXISTS (SELECT 1 FROM affiliate_code_registry WHERE code = NEW.code AND affiliate_id <> NEW.id)
BEGIN SELECT RAISE(ABORT, 'affiliate code reserved'); END;

CREATE TRIGGER IF NOT EXISTS affiliate_code_after_insert AFTER INSERT ON affiliates
BEGIN INSERT OR IGNORE INTO affiliate_code_registry (code, affiliate_id) VALUES (NEW.code, NEW.id); END;

CREATE TRIGGER IF NOT EXISTS affiliate_code_before_update BEFORE UPDATE OF code ON affiliates
WHEN EXISTS (SELECT 1 FROM affiliate_code_registry WHERE code = NEW.code AND affiliate_id <> NEW.id)
BEGIN SELECT RAISE(ABORT, 'affiliate code reserved'); END;

CREATE TRIGGER IF NOT EXISTS affiliate_code_after_update AFTER UPDATE OF code ON affiliates
BEGIN INSERT OR IGNORE INTO affiliate_code_registry (code, affiliate_id) VALUES (NEW.code, NEW.id); END;
