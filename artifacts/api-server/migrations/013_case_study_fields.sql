-- ─────────────────────────────────────────────────────────────────────────────
-- Success Story — case-study fields.
--
-- Adds a short case study to each story: the brand name, the creator name, and a
-- paragraph, shown as a premium band on the public /success-story page below the
-- video. All nullable free text — a story with them empty simply hides the band.
--
-- Additive + idempotent. Run BEFORE deploying the API. DO NOT run `prisma db push`.
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/013_case_study_fields.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE "SuccessStory" ADD COLUMN IF NOT EXISTS "caseStudyBrand"   text;
ALTER TABLE "SuccessStory" ADD COLUMN IF NOT EXISTS "caseStudyCreator" text;
ALTER TABLE "SuccessStory" ADD COLUMN IF NOT EXISTS "caseStudyText"    text;

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- ALTER TABLE "SuccessStory" DROP COLUMN IF EXISTS "caseStudyBrand";
-- ALTER TABLE "SuccessStory" DROP COLUMN IF EXISTS "caseStudyCreator";
-- ALTER TABLE "SuccessStory" DROP COLUMN IF EXISTS "caseStudyText";
