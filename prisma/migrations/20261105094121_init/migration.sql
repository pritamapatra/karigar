-- CreateEnum
CREATE TYPE "role" AS ENUM ('clerk', 'finance', 'partner', 'karigar');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "entry_type" AS ENUM ('issue', 'receipt_piece', 'receipt_scrap', 'receipt_filings', 'correction');

-- CreateEnum
CREATE TYPE "ai_kind" AS ENUM ('scale', 'karat_meter');

-- CreateEnum
CREATE TYPE "ai_confidence" AS ENUM ('high', 'low', 'unreadable');

-- CreateEnum
CREATE TYPE "ai_status" AS ENUM ('confirmed', 'overridden', 'rejected');

-- CreateEnum
CREATE TYPE "alert_kind" AS ENUM ('drift', 'over_allowance');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('new', 'reviewed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "opening_vault_mg" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "role" "role" NOT NULL,
    "karigar_id" UUID,
    "display_name" TEXT NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "karigars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "karigars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "karigar_wastage" (
    "karigar_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "wastage_bp" INTEGER NOT NULL,

    CONSTRAINT "karigar_wastage_pkey" PRIMARY KEY ("karigar_id","category_id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "job_number" TEXT NOT NULL,
    "karigar_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "issued_fine_mg" INTEGER NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scale_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_path" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scale_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_readings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "photo_id" UUID NOT NULL,
    "kind" "ai_kind" NOT NULL,
    "weight_mg" INTEGER,
    "purity_h" INTEGER,
    "confidence" "ai_confidence" NOT NULL,
    "raw_response" JSONB NOT NULL,
    "confirmed_by" UUID,
    "status" "ai_status" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "karigar_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "entry_type" "entry_type" NOT NULL,
    "gross_mg" INTEGER NOT NULL,
    "purity_h" INTEGER NOT NULL,
    "fine_mg" INTEGER NOT NULL,
    "huid" TEXT,
    "slip_no" TEXT NOT NULL,
    "reverses_entry_id" UUID,
    "reason" TEXT,
    "photo_id" UUID,
    "ai_reading_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "karigar_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "kind" "alert_kind" NOT NULL,
    "baseline_bp" INTEGER,
    "actual_bp" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "status" "alert_status" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "karigars_org_id_code_key" ON "karigars"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "item_categories_org_id_name_key" ON "item_categories"("org_id", "name");

-- CreateIndex
CREATE INDEX "jobs_karigar_id_status_idx" ON "jobs"("karigar_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_org_id_job_number_key" ON "jobs"("org_id", "job_number");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reverses_entry_id_key" ON "ledger_entries"("reverses_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_key" ON "ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_karigar_id_created_at_idx" ON "ledger_entries"("karigar_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_job_id_idx" ON "ledger_entries"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_org_id_slip_no_key" ON "ledger_entries"("org_id", "slip_no");

-- CreateIndex
CREATE INDEX "alerts_status_created_at_idx" ON "alerts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_job_id_kind_key" ON "alerts"("job_id", "kind");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_karigar_id_fkey" FOREIGN KEY ("karigar_id") REFERENCES "karigars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "karigars" ADD CONSTRAINT "karigars_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "karigar_wastage" ADD CONSTRAINT "karigar_wastage_karigar_id_fkey" FOREIGN KEY ("karigar_id") REFERENCES "karigars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "karigar_wastage" ADD CONSTRAINT "karigar_wastage_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_karigar_id_fkey" FOREIGN KEY ("karigar_id") REFERENCES "karigars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_readings" ADD CONSTRAINT "ai_readings_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "scale_photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_karigar_id_fkey" FOREIGN KEY ("karigar_id") REFERENCES "karigars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "scale_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ai_reading_id_fkey" FOREIGN KEY ("ai_reading_id") REFERENCES "ai_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_karigar_id_fkey" FOREIGN KEY ("karigar_id") REFERENCES "karigars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
