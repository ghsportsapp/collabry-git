-- ─────────────────────────────────────────────────────────────────────────────
-- Creator languages: the languages a creator is comfortable making videos in.
-- Collected at signup (and editable from edit-profile), stored in a new nullable
-- "languages" text[] column. Surfaced ONLY in the admin panel + CSV export —
-- never on the brand side — exactly like the "city" field (004_creator_city.sql).
--
-- Run this against the live database BEFORE deploying the API. Idempotent —
-- re-running it is safe.
--
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/007_creator_languages.sql
--
-- DO NOT run `prisma db push`. The live schema is managed by raw SQL + these
-- migrations (schema.prisma is stale and a push would drop columns). The column
-- is additive and nullable, so the API keeps working on existing rows until it
-- is applied — reads return NULL, writes to the new column are ignored until it
-- exists.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Languages the creator makes videos in (multi-select, no cap). Nullable:
-- existing creators have none until they add them from edit-profile.
ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "languages" text[];

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- ALTER TABLE "Creator" DROP COLUMN IF EXISTS "languages";
