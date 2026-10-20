-- ─────────────────────────────────────────────────────────────────────────────
-- Ad leads: creators submit a "get more details" form on each Explore Brands ad;
-- leads flow into the admin Advertisement "Form Details" tab.
--
-- Run this against the live database BEFORE deploying the API. Idempotent —
-- re-running it is safe.
--
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/003_ad_leads.sql
--
-- DO NOT run `prisma db push`. Managed by raw SQL + this migration, like
-- Advertisement (002), White Glove and DealStageEvent. The API degrades
-- gracefully until this is applied (lead reads return empty, never crash).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Short brand name the admin sets; falls back to the ad headline when blank.
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "brandName" text;

CREATE TABLE IF NOT EXISTS "AdLead" (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "adId"      text        NOT NULL REFERENCES "Advertisement"(id) ON DELETE CASCADE,
  "creatorId" text,                                      -- nullable: who submitted
  name        text        NOT NULL DEFAULT '',
  contact     text        NOT NULL DEFAULT '',
  email       text        NOT NULL DEFAULT '',
  "isRead"    boolean     NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);

-- One lead per creator per ad — re-submits upsert (see adLeads.ts ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS "AdLead_ad_creator_uniq"
  ON "AdLead" ("adId", "creatorId") WHERE "creatorId" IS NOT NULL;
-- Admin reads leads grouped/filtered by ad.
CREATE INDEX IF NOT EXISTS "AdLead_ad_idx"
  ON "AdLead" ("adId");

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- DROP TABLE IF EXISTS "AdLead";
-- ALTER TABLE "Advertisement" DROP COLUMN IF EXISTS "brandName";
