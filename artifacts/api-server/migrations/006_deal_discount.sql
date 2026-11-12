-- ─────────────────────────────────────────────────────────────────────────────
-- Per-deal admin discount (Option B: platform-funded, no commission cap).
--
-- Adds a percentage discount that a SUPER ADMIN may set on a brand-payment deal
-- while it is still PENDING_PAYMENT. The discount reduces the brand's pre-GST
-- base (and therefore the GST and the brand's total payable). It NEVER changes
-- the creator payout, which stays subtotal × (1 − commission). The platform's
-- take absorbs the discount and is allowed to go below commission and negative.
--
-- Scope: brand-payment deals only. Barter deals (source='BARTER') carry no brand
-- payment and are excluded by the apply endpoint. The discount can only be set
-- while status='PENDING_PAYMENT'; once the brand pays, the computed amounts are
-- frozen on the row (gstAmount/totalPayable/creatorPayout) and the discount is
-- locked.
--
-- Additive and idempotent. The read path treats a missing/0 discountPercent as
-- "no discount" (the API reads it through to_jsonb / SELECT * so it is safe to
-- deploy the code before or after this migration). Run BEFORE the apply endpoint
-- is used — the UPDATE in that endpoint writes these columns directly.
--
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/006_deal_discount.sql
--
-- DO NOT run `prisma db push` — the live schema is managed by raw SQL + these
-- migrations (schema.prisma is stale).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Percentage discount applied to the pre-GST base. 0 = no discount.
-- Clamped to [0,100] by the application; the CHECK is a defensive backstop.
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "discountPercent" numeric NOT NULL DEFAULT 0;

-- Who set it, when, and (optionally) why — for the audit trail.
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "discountByAdminId" text;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "discountAt" timestamptz;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "discountReason" text;

-- Defensive 0–100 bound (named so re-running the migration does not duplicate it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_discount_percent_range'
  ) THEN
    ALTER TABLE "Deal"
      ADD CONSTRAINT deal_discount_percent_range
      CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
  END IF;
END $$;

COMMIT;
