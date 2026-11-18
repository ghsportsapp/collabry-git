-- ─────────────────────────────────────────────────────────────────────────────
-- "Deals Sent" admin tracker (DIRECT deals only).
--
-- Direct deals live as DealRequest chains (brand sends → PENDING, negotiation →
-- NEGOTIATING, creator/brand accept → a Deal row + ACCEPTED, reject → REJECTED,
-- timeout → EXPIRED). Paid-campaign and barter deals never create DealRequest
-- rows, so a tracker over DealRequest is inherently direct-only and leaves the
-- existing "All Deals" (over the Deal table) completely untouched.
--
-- This migration is additive + idempotent. It adds:
--   • rootRequestId  — the round-1 root of each negotiation chain (one tracker
--                      row per chain). Back-filled for existing rows; a BEFORE
--                      INSERT trigger fills it for all future rows so no
--                      application insert path has to change.
--   • trackerSeenAt  — global "seen" stamp (clicking a row). NULL = unseen.
--   • trackerHiddenAt— global "hidden" stamp (the tracker Delete button). The
--                      real DealRequest/Deal rows are otherwise untouched.
--   • AdminDealsSentView — per-admin last-viewed stamp, for the derived
--                      "newly accepted" notification bar.
--
-- Run BEFORE deploying the API. DO NOT run `prisma db push`.
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/009_deals_sent_tracker.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE "DealRequest" ADD COLUMN IF NOT EXISTS "rootRequestId"   text;
ALTER TABLE "DealRequest" ADD COLUMN IF NOT EXISTS "trackerSeenAt"   timestamptz;
ALTER TABLE "DealRequest" ADD COLUMN IF NOT EXISTS "trackerHiddenAt" timestamptz;

-- Back-fill rootRequestId by walking parentRequestId up to the round-1 root.
WITH RECURSIVE chain AS (
  SELECT id, id AS root FROM "DealRequest" WHERE "parentRequestId" IS NULL
  UNION ALL
  SELECT d.id, c.root FROM "DealRequest" d JOIN chain c ON d."parentRequestId" = c.id
)
UPDATE "DealRequest" dr
   SET "rootRequestId" = chain.root
  FROM chain
 WHERE chain.id = dr.id
   AND dr."rootRequestId" IS DISTINCT FROM chain.root;

-- Any row the walk couldn't reach (orphaned parent) roots to itself.
UPDATE "DealRequest" SET "rootRequestId" = id WHERE "rootRequestId" IS NULL;

-- Keep rootRequestId correct for every future insert without touching the send /
-- counter code paths. A root (no parent) roots to itself; a child inherits its
-- parent's root.
CREATE OR REPLACE FUNCTION set_dealrequest_root() RETURNS trigger AS $$
BEGIN
  IF NEW."rootRequestId" IS NULL THEN
    IF NEW."parentRequestId" IS NULL THEN
      NEW."rootRequestId" := NEW.id;
    ELSE
      SELECT "rootRequestId" INTO NEW."rootRequestId"
        FROM "DealRequest" WHERE id = NEW."parentRequestId";
      IF NEW."rootRequestId" IS NULL THEN
        NEW."rootRequestId" := NEW."parentRequestId";
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dealrequest_root ON "DealRequest";
CREATE TRIGGER trg_dealrequest_root
  BEFORE INSERT ON "DealRequest"
  FOR EACH ROW EXECUTE FUNCTION set_dealrequest_root();

CREATE INDEX IF NOT EXISTS "idx_dealrequest_root"       ON "DealRequest" ("rootRequestId");
CREATE INDEX IF NOT EXISTS "idx_dealrequest_createdAt"  ON "DealRequest" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_dealrequest_brandId"    ON "DealRequest" ("brandId");
CREATE INDEX IF NOT EXISTS "idx_dealrequest_creatorId"  ON "DealRequest" ("creatorId");

-- Per-admin "I've seen the list up to here" stamp for the notification bar.
CREATE TABLE IF NOT EXISTS "AdminDealsSentView" (
  "adminId"             text PRIMARY KEY,
  "lastTrackerViewedAt" timestamptz NOT NULL DEFAULT NOW()
);

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_dealrequest_root ON "DealRequest";
-- DROP FUNCTION IF EXISTS set_dealrequest_root();
-- DROP TABLE IF EXISTS "AdminDealsSentView";
-- ALTER TABLE "DealRequest" DROP COLUMN IF EXISTS "rootRequestId";
-- ALTER TABLE "DealRequest" DROP COLUMN IF EXISTS "trackerSeenAt";
-- ALTER TABLE "DealRequest" DROP COLUMN IF EXISTS "trackerHiddenAt";
