-- ─────────────────────────────────────────────────────────────────────────────
-- Campaign reference video: an admin-only URL set per campaign (paid + barter)
-- and shown to creators on the campaign detail page as a link-out ("Watch
-- Reference Video" → opens in a new tab). Brands never set it.
--
-- Adds a nullable "referenceVideoUrl" text column to BOTH campaign tables. Run
-- this against the live database BEFORE deploying the API. Idempotent — re-running
-- it is safe.
--
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/008_campaign_reference_video.sql
--
-- DO NOT run `prisma db push`. The live schema is managed by raw SQL + these
-- migrations (schema.prisma is stale). The column is additive and nullable, so
-- the API keeps working on existing rows until it is applied — creator reads go
-- through SELECT * and simply omit the field (treated as "no video") until then.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE "Campaign"       ADD COLUMN IF NOT EXISTS "referenceVideoUrl" text;
ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "referenceVideoUrl" text;

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- ALTER TABLE "Campaign"       DROP COLUMN IF EXISTS "referenceVideoUrl";
-- ALTER TABLE "BarterCampaign" DROP COLUMN IF EXISTS "referenceVideoUrl";
