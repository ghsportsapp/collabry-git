-- ─────────────────────────────────────────────────────────────────────────────
-- Success Stories showcase.
--
-- A public "Success Story" page (Phase 2) backed by an admin-managed table of
-- uploaded vertical (9:16) reels, each with a poster image and a dynamic set of
-- {label, answer} detail pairs, plus 4 free-text stat numbers stored as
-- PlatformConfig. Videos live in Linode object storage (public bucket, direct
-- presigned-PUT upload — they never flow through Node); this table only holds the
-- stored URLs, so it stays tiny and the main site is unaffected.
--
-- Additive + idempotent. Run BEFORE deploying the API. DO NOT run `prisma db push`
-- — the live schema is managed by raw SQL + these migrations (schema.prisma is
-- stale).
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/012_success_stories.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS "SuccessStory" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  position      integer     NOT NULL DEFAULT 0,
  "videoUrl"    text,
  "posterUrl"   text,
  -- Ordered array of { label, answer } pairs, admin-entered. Read/written as one
  -- unit per story, never queried individually → jsonb, not a child table.
  details       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  "isPublished" boolean     NOT NULL DEFAULT true,
  "createdAt"   timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt"   timestamptz NOT NULL DEFAULT NOW()
);

-- The public page lists published stories in admin-fixed order; the admin list
-- reads every row in the same order.
CREATE INDEX IF NOT EXISTS "idx_successstory_position" ON "SuccessStory" ("position");

-- The 4 showcase stats — FREE-TEXT strings (admin may write "500+", "1.2M", …).
-- Seeded empty; only inserted if absent so a redeploy never clobbers admin values.
INSERT INTO "PlatformConfig" (id, key, value, description, "updatedAt") VALUES
  (gen_random_uuid(), 'success_brands_count',   '', 'Success page stat: brands',      NOW()),
  (gen_random_uuid(), 'success_creators_count', '', 'Success page stat: creators',    NOW()),
  (gen_random_uuid(), 'success_collabs_count',  '', 'Success page stat: collabs',     NOW()),
  (gen_random_uuid(), 'success_total_views',    '', 'Success page stat: total views', NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- DELETE FROM "PlatformConfig" WHERE key IN
--   ('success_brands_count','success_creators_count','success_collabs_count','success_total_views');
-- DROP TABLE IF EXISTS "SuccessStory";
