import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

export type SubmissionStage = "CONCEPT" | "FINAL";
export type SubmissionOutcome = "PENDING" | "APPROVED" | "REVISION_REQUESTED" | "SUPERSEDED";
export type ReviewedBy = "BRAND" | "AUTO" | null;

type Executor = PoolClient | typeof pool;

export async function ensureSubmissionAndInactivitySchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "DealSubmission" (
      id              TEXT PRIMARY KEY,
      "dealId"        TEXT NOT NULL,
      "deliverableId" TEXT NOT NULL,
      stage           TEXT NOT NULL,
      version         INTEGER NOT NULL,
      url             TEXT NOT NULL,
      "submittedBy"   TEXT NOT NULL,
      "submittedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      outcome         TEXT NOT NULL DEFAULT 'PENDING',
      "reviewedAt"    TIMESTAMPTZ,
      "reviewedBy"    TEXT,
      "revisionReason" TEXT,
      "revisionBrief"  TEXT
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "DealSubmission_slot_stage_version_key"
    ON "DealSubmission" ("deliverableId", stage, version)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "DealSubmission_deal_idx" ON "DealSubmission" ("dealId")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "DealSubmission_pending_idx"
    ON "DealSubmission" ("deliverableId", stage) WHERE outcome='PENDING'`);

  // Inactivity tracking columns on Deal
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "creatorActionDueSince" TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "conceptInactivityStage" INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "finalInactivityStage" INTEGER NOT NULL DEFAULT 0`);

  // Backfill creatorActionDueSince ONLY for deals still at the concept stage.
  // REVISION_REQUESTED is reused for final-content revisions too, so we must
  // additionally require that the concept hasn't been approved yet.
  await pool.query(`
    UPDATE "Deal"
    SET "creatorActionDueSince" = COALESCE("creatorActionDueSince", "createdAt")
    WHERE "creatorActionDueSince" IS NULL
      AND "conceptApprovedAt" IS NULL
      AND status IN ('IN_ESCROW','REVISION_REQUESTED')
  `);
}

export async function recordSubmission(
  exec: Executor,
  args: {
    dealId: string;
    deliverableId: string;
    stage: SubmissionStage;
    url: string;
    submittedBy?: "CREATOR" | "BRAND";
  }
): Promise<void> {
  const submittedBy = args.submittedBy ?? "CREATOR";
  // Mark any prior PENDING submission for this slot+stage as SUPERSEDED before inserting.
  await exec.query(
    `UPDATE "DealSubmission"
       SET outcome='SUPERSEDED', "reviewedAt"=NOW()
     WHERE "deliverableId"=$1 AND stage=$2 AND outcome='PENDING'`,
    [args.deliverableId, args.stage]
  );
  await exec.query(
    `INSERT INTO "DealSubmission"
        (id,"dealId","deliverableId",stage,version,url,"submittedBy","submittedAt",outcome)
      SELECT gen_random_uuid(), $1, $2, $3,
             COALESCE(MAX(version), 0) + 1, $4, $5, NOW(), 'PENDING'
      FROM "DealSubmission"
      WHERE "deliverableId"=$2 AND stage=$3`,
    [args.dealId, args.deliverableId, args.stage, args.url.trim(), submittedBy]
  );
}

export async function markLatestSubmissionOutcome(
  exec: Executor,
  args: {
    deliverableId: string;
    stage: SubmissionStage;
    outcome: Exclude<SubmissionOutcome, "PENDING" | "SUPERSEDED">;
    reviewedBy: Exclude<ReviewedBy, null>;
    revisionReason?: string | null;
    revisionBrief?: string | null;
  }
): Promise<void> {
  await exec.query(
    `UPDATE "DealSubmission"
       SET outcome=$3,
           "reviewedAt"=NOW(),
           "reviewedBy"=$4,
           "revisionReason"=COALESCE($5,"revisionReason"),
           "revisionBrief"=COALESCE($6,"revisionBrief")
     WHERE id = (
       SELECT id FROM "DealSubmission"
       WHERE "deliverableId"=$1 AND stage=$2 AND outcome='PENDING'
       ORDER BY version DESC LIMIT 1
     )`,
    [
      args.deliverableId,
      args.stage,
      args.outcome,
      args.reviewedBy,
      args.revisionReason ?? null,
      args.revisionBrief ?? null,
    ]
  );
}

export async function listSubmissionsForDeal(dealId: string): Promise<any[]> {
  const r = await pool.query(
    `SELECT id, "deliverableId", stage, version, url, "submittedBy",
            "submittedAt", outcome, "reviewedAt", "reviewedBy",
            "revisionReason", "revisionBrief"
       FROM "DealSubmission"
      WHERE "dealId"=$1
      ORDER BY "submittedAt" ASC`,
    [dealId]
  );
  return r.rows;
}
