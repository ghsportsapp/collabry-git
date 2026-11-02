-- ─────────────────────────────────────────────────────────────────────────────
-- Creator city / district: creators pick ONE district of their chosen State / UT
-- during signup (and from edit-profile). Stored in a new nullable "city" column
-- so brands can search creators by area.
--
-- Run this against the live database BEFORE deploying the API. Idempotent —
-- re-running it is safe.
--
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/004_creator_city.sql
--
-- DO NOT run `prisma db push`. The live schema is managed by raw SQL + these
-- migrations (schema.prisma is stale and a push would drop columns). The column
-- is additive and nullable, so the API keeps working on existing rows until it
-- is applied — reads return NULL, writes are ignored on the old column set.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Chosen district within the creator's State / UT. Nullable: existing creators
-- have none until they add it from edit-profile.
ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "city" text;

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- ALTER TABLE "Creator" DROP COLUMN IF EXISTS "city";
