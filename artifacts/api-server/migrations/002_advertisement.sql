-- ─────────────────────────────────────────────────────────────────────────────
-- Advertisement: admin-managed creator-facing ad banners (Batch 1).
--
-- Run this against the live database BEFORE deploying the API.
-- It is idempotent — re-running it is safe.
--
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/002_advertisement.sql
--
-- DO NOT run `prisma db push` to apply this. artifacts/collabry/prisma/schema.prisma
-- is stale (it is missing columns the live DB already has), so a push would try
-- to DROP them. This table is managed by raw SQL + this migration, like the
-- White Glove and DealStageEvent tables.
--
-- Feed order = "displayOrder" ASC. The lowest displayOrder shows first in the
-- creator scroller and at the top of /explore-brands (both built in Batch 2).
-- Banners always route to our own /explore-brands page — there is no external
-- click-through URL, so no linkUrl column.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS "Advertisement" (
  id             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "imageUrl"     text        NOT NULL,                 -- 16:9 image (uploaded via /api/uploads/image)
  headline       text        NOT NULL DEFAULT '',      -- short title on the /explore-brands card
  "bodyText"     text        NOT NULL DEFAULT '',      -- longer paragraph on the /explore-brands card
  "displayOrder" integer     NOT NULL DEFAULT 0,       -- admin-controlled feed order (ASC)
  "isActive"     boolean     NOT NULL DEFAULT true,
  "createdAt"    timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt"    timestamptz NOT NULL DEFAULT NOW()
);

-- Public read hot path: active ads, lowest order first.
CREATE INDEX IF NOT EXISTS "Advertisement_active_order_idx"
  ON "Advertisement" ("isActive", "displayOrder" ASC);
-- Admin list + reorder reads everything by order.
CREATE INDEX IF NOT EXISTS "Advertisement_order_idx"
  ON "Advertisement" ("displayOrder" ASC);

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- DROP TABLE IF EXISTS "Advertisement";
