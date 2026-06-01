import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCreator } from "../middleware/requireCreator";
import { requireBrand } from "../middleware/requireBrand";

const router: IRouter = Router();

const CREATOR_REQUEST_TYPES = ['REQUEST_RECEIVED', 'REQUEST_COUNTERED', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED'];
const CAMPAIGN_TYPES = ['CAMPAIGN_MATCH', 'CAMPAIGN_NEW', 'CAMPAIGN_INVITE', 'CAMPAIGN_APPLIED', 'CAMPAIGN_SELECTED'];

// ── Creator nav badges ──────────────────────────────────────────────────────

router.get("/creator/nav-badges", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const r = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = ANY($2::text[]) THEN 1 ELSE 0 END), 0)::int AS requests,
       COALESCE(SUM(CASE WHEN type = ANY($3::text[]) THEN 1 ELSE 0 END), 0)::int AS campaigns,
       COALESCE(SUM(CASE WHEN "relatedEntityType" IN ('Deal','DEAL')
                          AND NOT (type = ANY($2::text[]))
                          AND NOT (type = ANY($3::text[]))
                     THEN 1 ELSE 0 END), 0)::int AS deals
     FROM "Notification"
     WHERE "userId"=$1 AND "userType"='CREATOR' AND "isRead"=false`,
    [creatorId, CREATOR_REQUEST_TYPES, CAMPAIGN_TYPES]
  );
  const row = r.rows[0] ?? { requests: 0, campaigns: 0, deals: 0 };
  res.json({ requests: row.requests, campaigns: row.campaigns, deals: row.deals });
});

router.patch("/creator/nav-badges/:tab", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { tab } = req.params as Record<string, string>;

  if (tab === "requests") {
    await pool.query(
      `UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND "userType"='CREATOR' AND type = ANY($2::text[]) AND "isRead"=false`,
      [creatorId, CREATOR_REQUEST_TYPES]
    );
  } else if (tab === "campaigns") {
    await pool.query(
      `UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND "userType"='CREATOR' AND type = ANY($2::text[]) AND "isRead"=false`,
      [creatorId, CAMPAIGN_TYPES]
    );
  } else if (tab === "deals") {
    await pool.query(
      `UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND "userType"='CREATOR' AND "relatedEntityType" IN ('Deal','DEAL') AND "isRead"=false`,
      [creatorId]
    );
  }
  res.json({ ok: true });
});

// ── Brand nav badges ────────────────────────────────────────────────────────

router.get("/brand/nav-badges", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const r = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN "relatedEntityType" IN ('Deal','DEAL') THEN 1 ELSE 0 END), 0)::int AS deals,
       COALESCE(SUM(CASE WHEN type = ANY($2::text[]) THEN 1 ELSE 0 END), 0)::int AS campaigns
     FROM "Notification"
     WHERE "userId"=$1 AND "userType"='BRAND' AND "isRead"=false`,
    [brandId, CAMPAIGN_TYPES]
  );
  const row = r.rows[0] ?? { deals: 0, campaigns: 0 };
  res.json({ deals: row.deals, campaigns: row.campaigns });
});

router.patch("/brand/nav-badges/:tab", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { tab } = req.params as Record<string, string>;

  if (tab === "deals") {
    await pool.query(
      `UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND "userType"='BRAND' AND "relatedEntityType" IN ('Deal','DEAL') AND "isRead"=false`,
      [brandId]
    );
  } else if (tab === "campaigns") {
    await pool.query(
      `UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND "userType"='BRAND' AND type = ANY($2::text[]) AND "isRead"=false`,
      [brandId, CAMPAIGN_TYPES]
    );
  }
  res.json({ ok: true });
});

export default router;
