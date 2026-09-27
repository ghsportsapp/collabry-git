-- ─────────────────────────────────────────────────────────────────────────────
-- Deal stage tracking: when a deal last changed stage, and a log of the changes.
--
-- Run this against the live database BEFORE (or alongside) deploying the API.
-- It is idempotent — re-running it is safe.
--
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/001_deal_stage_tracking.sql
--
-- WHY A TRIGGER, NOT APPLICATION CODE
-- Deal.status is written from ~70 places across 8 files (dealPipeline,
-- dealShipping, dealChat, campaigns, dealsNegotiation and three cron jobs).
-- Updating each site would mean silently wrong durations wherever one was
-- missed, and every future writer would have to remember. A BEFORE UPDATE
-- trigger is one choke point that also covers raw SQL and background jobs.
--
-- DO NOT run `prisma db push` to apply this. artifacts/collabry/prisma/schema.prisma
-- is stale — it is missing columns the live Deal table already has (orderId,
-- payoutStatus, totalPayable, gstAmount, creatorPayout, …), so a push would
-- try to DROP them.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1 ── When the deal last entered its current stage. -------------------------
-- DEFAULT NOW() means rows created from here on are stamped without needing an
-- INSERT trigger.
ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "stageUpdatedAt" timestamptz DEFAULT NOW();

-- 2 ── Stage-change log. Feeds the admin "recent stage changes" indicator. ----
CREATE TABLE IF NOT EXISTS "DealStageEvent" (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dealId"    text        NOT NULL,
  "fromStage" text,
  "toStage"   text        NOT NULL,
  "changedAt" timestamptz NOT NULL DEFAULT NOW(),
  -- Stamped when an admin has seen this event in the bell (Phase 5).
  "seenAt"    timestamptz
);

CREATE INDEX IF NOT EXISTS "DealStageEvent_changedAt_idx"
  ON "DealStageEvent" ("changedAt" DESC);
CREATE INDEX IF NOT EXISTS "DealStageEvent_dealId_idx"
  ON "DealStageEvent" ("dealId");
-- Partial index: the bell's hot path is "unseen, newest first".
CREATE INDEX IF NOT EXISTS "DealStageEvent_unseen_idx"
  ON "DealStageEvent" ("changedAt" DESC) WHERE "seenAt" IS NULL;

-- 3 ── The single choke point. ------------------------------------------------
CREATE OR REPLACE FUNCTION deal_stage_change() RETURNS trigger AS $fn$
BEGIN
  -- IS DISTINCT FROM so a NULL on either side still counts as a change, and a
  -- no-op write of the same status does not.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW."stageUpdatedAt" := NOW();
    INSERT INTO "DealStageEvent" ("dealId", "fromStage", "toStage", "changedAt")
    VALUES (NEW.id, OLD.status, NEW.status, NOW());
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deal_stage_change_trg ON "Deal";
CREATE TRIGGER deal_stage_change_trg
  BEFORE UPDATE ON "Deal"
  FOR EACH ROW
  EXECUTE FUNCTION deal_stage_change();

-- 4 ── Backfill existing rows. ------------------------------------------------
-- Best available signal for "when did this deal last move": the most recent
-- milestone timestamp it carries, floored at createdAt. GREATEST ignores NULLs
-- in Postgres, so partially-populated rows work without a CASE per status.
-- Built dynamically because which of these columns exist varies by environment
-- (the Prisma schema is not authoritative here).
DO $backfill$
DECLARE
  candidates text[] := ARRAY[
    'completedAt', 'contentApprovedAt', 'conceptApprovedAt',
    'productReceivedAt', 'productShippedAt', 'refundedAt',
    'payoutReleasedAt', 'disputeRaisedAt', 'timelineStartAt'
  ];
  present text[] := ARRAY['"createdAt"'];
  c text;
BEGIN
  FOREACH c IN ARRAY candidates LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Deal' AND column_name = c
    ) THEN
      present := present || quote_ident(c);
    END IF;
  END LOOP;

  EXECUTE format(
    'UPDATE "Deal" SET "stageUpdatedAt" = GREATEST(%s) WHERE "stageUpdatedAt" IS NULL',
    array_to_string(present, ', ')
  );
END
$backfill$;

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS deal_stage_change_trg ON "Deal";
-- DROP FUNCTION IF EXISTS deal_stage_change();
-- DROP TABLE IF EXISTS "DealStageEvent";
-- ALTER TABLE "Deal" DROP COLUMN IF EXISTS "stageUpdatedAt";
