-- ─────────────────────────────────────────────────────────────────────────────
-- First-deal auto-discount (brand's first DIRECT deal).
--
-- A brand's first direct deal gets an automatic discount (default 20%, admin-
-- configurable via PlatformConfig key 'first_deal_discount_percent'). It reuses
-- the EXISTING per-deal discount mechanic end-to-end: the % is locked onto the
-- round-1 root DealRequest at send time, carried into Deal.discountPercent at
-- acceptance, and from there the existing pricing path (computeDirectDealAmounts /
-- serializeDeal) charges the discounted pre-GST base. The creator payout stays the
-- full subtotal; the platform absorbs the discount. Nothing in "All Deals" or the
-- /admin/deals read path changes — it already honors Deal.discountPercent.
--
-- Eligibility is DERIVED at send time (no stored flag): a brand is eligible iff it
-- has no direct-deal chain currently PENDING / NEGOTIATING / ACCEPTED (with lazy
-- expiry applied). REJECTED/EXPIRED chains do not consume the offer, so it re-
-- grants automatically. This migration therefore adds NO eligibility state — only
-- the per-root locked percentage and an index to make the eligibility check cheap.
--
-- Additive + idempotent. Safe to deploy the code before or after: the read path
-- treats a missing/0 firstDealDiscountPercent as "no first-deal discount".
--
-- Run BEFORE deploying the API. DO NOT run `prisma db push` — the live schema is
-- managed by raw SQL + these migrations (schema.prisma is stale).
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/010_first_deal_discount.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Percentage locked onto the round-1 root at send time (0 = no first-deal
-- discount). Only ever written on a root (parentRequestId IS NULL); child rounds
-- resolve it via rootRequestId at acceptance. Clamped to [0,100] by the app; the
-- CHECK is a defensive backstop.
ALTER TABLE "DealRequest"
  ADD COLUMN IF NOT EXISTS "firstDealDiscountPercent" numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dealrequest_first_deal_discount_range'
  ) THEN
    ALTER TABLE "DealRequest"
      ADD CONSTRAINT dealrequest_first_deal_discount_range
      CHECK ("firstDealDiscountPercent" >= 0 AND "firstDealDiscountPercent" <= 100);
  END IF;
END $$;

-- Eligibility check scans a brand's round-1 roots (parentRequestId IS NULL), so a
-- partial index on brandId over roots keeps it cheap.
CREATE INDEX IF NOT EXISTS "idx_dealrequest_brand_roots"
  ON "DealRequest" ("brandId")
  WHERE "parentRequestId" IS NULL;

-- Default config value (only inserted if absent — never overwrites an admin-set %).
INSERT INTO "PlatformConfig" (id, key, value, description, "updatedAt")
VALUES (gen_random_uuid(), 'first_deal_discount_percent', '20',
        'Automatic discount % applied to a brand''s first direct deal', NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- DELETE FROM "PlatformConfig" WHERE key = 'first_deal_discount_percent';
-- DROP INDEX IF EXISTS "idx_dealrequest_brand_roots";
-- ALTER TABLE "DealRequest" DROP CONSTRAINT IF EXISTS dealrequest_first_deal_discount_range;
-- ALTER TABLE "DealRequest" DROP COLUMN IF EXISTS "firstDealDiscountPercent";
