ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_opening_vault_nonneg" CHECK ("opening_vault_mg" >= 0);

ALTER TABLE "karigar_wastage"
  ADD CONSTRAINT "karigar_wastage_bp_range" CHECK ("wastage_bp" BETWEEN 0 AND 10000);

ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_issued_positive" CHECK ("issued_fine_mg" > 0);

ALTER TABLE "alerts"
  ADD CONSTRAINT "alerts_actual_nonneg" CHECK ("actual_bp" >= 0);

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_gross_positive" CHECK ("gross_mg" > 0),
  ADD CONSTRAINT "ledger_purity_range" CHECK ("purity_h" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "ledger_fine_sign" CHECK (
    ("entry_type" = 'issue' AND "fine_mg" > 0)
    OR ("entry_type" IN ('receipt_piece', 'receipt_scrap', 'receipt_filings') AND "fine_mg" < 0)
    OR ("entry_type" = 'correction' AND "fine_mg" <> 0)
  ),
  ADD CONSTRAINT "ledger_correction_fields" CHECK (
    "entry_type" <> 'correction'
    OR ("reverses_entry_id" IS NOT NULL AND length(btrim("reason")) > 0)
  );

CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "karigars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "karigar_wastage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scale_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_readings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;
