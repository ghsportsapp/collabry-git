import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCreator } from "../middleware/requireCreator";
import { requireBrand } from "../middleware/requireBrand";
import { requireAdmin } from "../middleware/requireAdmin";
import { createNotification } from "../lib/notifications";
import { createPopup } from "../lib/popups";
import { createSystemMessage } from "../lib/dealChat";

const router = Router();

const TERMINAL = ["COMPLETED", "CANCELLED", "REJECTED", "DISPUTE_WINDOW_OPEN", "FINAL_POST_CONFIRMED"];
const AUTO_APPROVE_HOURS = 48;

export async function ensureExtensionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "DealTimelineExtension" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "dealId" TEXT NOT NULL,
      "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "extraDays" INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      "approvedBy" TEXT,
      "respondedAt" TIMESTAMPTZ,
      "autoApproveDeadline" TIMESTAMPTZ NOT NULL,
      "originalDeadline" TIMESTAMPTZ,
      "newDeadline" TIMESTAMPTZ
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "idx_dte_dealId" ON "DealTimelineExtension" ("dealId")`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "idx_dte_pending" ON "DealTimelineExtension" (status, "autoApproveDeadline") WHERE status = 'PENDING'`
  );
}

// ─── Creator: request extension ────────────────────────────────────────────────
router.post(
  "/creator/deals/:id/request-extension",
  requireCreator,
  async (req: Request, res: Response): Promise<void> => {
    const creatorId = (req as any).creatorId as string;
    const dealId = req.params["id"] as string;
    const { extraDays, reason } = req.body as { extraDays?: number; reason?: string };

    if (!extraDays || !Number.isInteger(Number(extraDays)) || Number(extraDays) < 1 || Number(extraDays) > 30) {
      res.status(400).json({ error: "extraDays must be an integer between 1 and 30" });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({ error: "Reason is required" });
      return;
    }

    const dr = await pool.query(
      `SELECT * FROM "Deal" WHERE id=$1 AND "creatorId"=$2`,
      [dealId, creatorId]
    );
    if (dr.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
    const deal = dr.rows[0];

    if (TERMINAL.includes(deal.status)) {
      res.status(400).json({ error: "Cannot request an extension for a deal in this status" });
      return;
    }

    const existing = await pool.query(
      `SELECT id FROM "DealTimelineExtension" WHERE "dealId"=$1 AND status='PENDING'`,
      [dealId]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "There is already a pending extension request for this deal" });
      return;
    }

    const autoApproveDeadline = new Date(Date.now() + AUTO_APPROVE_HOURS * 3_600_000);
    const days = Number(extraDays);

    const ext = await pool.query(
      `INSERT INTO "DealTimelineExtension"
         (id, "dealId", "requestedAt", "extraDays", reason, status, "autoApproveDeadline", "originalDeadline")
       VALUES (gen_random_uuid(), $1, NOW(), $2, $3, 'PENDING', $4, $5)
       RETURNING *`,
      [dealId, days, reason.trim(), autoApproveDeadline, deal.deadlineAt]
    );

    await createSystemMessage(
      dealId,
      `⏳ Creator requested a ${days}-day timeline extension. Reason: ${reason.trim()}. Brand has 48h to respond (auto-approves if no response).`
    );

    await createNotification({
      userId: deal.brandId, userType: "BRAND",
      type: "TIMELINE_EXTENSION_REQUESTED",
      title: "Timeline Extension Requested",
      body: `Creator requested a ${days}-day extension. Approve or reject — auto-approves in 48h if no response.`,
      relatedEntityType: "DEAL", relatedEntityId: dealId,
      emailParams: { extension_days: days },
    });
    await createPopup({
      userId: deal.brandId, userType: "BRAND",
      type: "TIMELINE_EXTENSION_REQUESTED",
      title: "Extension Request Received",
      body: `The creator has requested a ${days}-day timeline extension. Review and respond within 48h.`,
      ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=live",
      isCelebration: false, relatedEntityId: dealId,
    });

    res.json({ ok: true, extension: ext.rows[0] });
  }
);

// ─── Brand: respond to extension ───────────────────────────────────────────────
router.post(
  "/brand/deals/:id/extensions/:extId/respond",
  requireBrand,
  async (req: Request, res: Response): Promise<void> => {
    const brandId = (req as any).brandId as string;
    const dealId = req.params["id"] as string;
    const extId = req.params["extId"] as string;
    const { decision } = req.body as { decision?: string };

    if (!decision || !["APPROVE", "REJECT"].includes(decision)) {
      res.status(400).json({ error: "decision must be APPROVE or REJECT" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const dr = await client.query(
        `SELECT * FROM "Deal" WHERE id=$1 AND "brandId"=$2 FOR UPDATE`,
        [dealId, brandId]
      );
      if (dr.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Deal not found" });
        return;
      }
      const deal = dr.rows[0];

      const er = await client.query(
        `SELECT * FROM "DealTimelineExtension" WHERE id=$1 AND "dealId"=$2 AND status='PENDING' FOR UPDATE`,
        [extId, dealId]
      );
      if (er.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Pending extension not found" });
        return;
      }
      const ext = er.rows[0];

      let newDeadline: Date | null = null;
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

      if (decision === "APPROVE") {
        const base = deal.deadlineAt ? new Date(deal.deadlineAt) : new Date();
        newDeadline = new Date(base.getTime() + ext.extraDays * 86_400_000);

        await client.query(
          `UPDATE "DealTimelineExtension"
           SET status='APPROVED', "approvedBy"='BRAND', "respondedAt"=NOW(), "newDeadline"=$1
           WHERE id=$2`,
          [newDeadline, extId]
        );
        await client.query(
          `UPDATE "Deal"
           SET "deadlineAt"=$1, "timelineDays"="timelineDays"+$2
           WHERE id=$3`,
          [newDeadline, ext.extraDays, dealId]
        );

        await client.query("COMMIT");

        await createSystemMessage(
          dealId,
          `✅ Timeline extended by ${ext.extraDays} day(s). New deadline: ${fmt(newDeadline)}.`
        );
        await createNotification({
          userId: deal.creatorId, userType: "CREATOR",
          type: "TIMELINE_EXTENSION_APPROVED",
          title: "Timeline Extension Approved ✅",
          body: `Brand approved your ${ext.extraDays}-day extension. New deadline: ${fmt(newDeadline)}.`,
          relatedEntityType: "DEAL", relatedEntityId: dealId,
          emailParams: { new_deadline: fmt(newDeadline) },
        });
        await createPopup({
          userId: deal.creatorId, userType: "CREATOR",
          type: "TIMELINE_EXTENSION_APPROVED",
          title: "Timeline Extended ✅",
          body: `Your ${ext.extraDays}-day extension was approved. New deadline: ${fmt(newDeadline)}.`,
          ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
          isCelebration: false, relatedEntityId: dealId,
        });
      } else {
        await client.query(
          `UPDATE "DealTimelineExtension"
           SET status='REJECTED', "respondedAt"=NOW()
           WHERE id=$1`,
          [extId]
        );

        await client.query("COMMIT");

        await createSystemMessage(
          dealId,
          `❌ Brand declined the ${ext.extraDays}-day timeline extension request.`
        );
        await createNotification({
          userId: deal.creatorId, userType: "CREATOR",
          type: "TIMELINE_EXTENSION_REJECTED",
          title: "Timeline Extension Declined",
          body: `Brand declined your ${ext.extraDays}-day extension request.`,
          relatedEntityType: "DEAL", relatedEntityId: dealId,
          emailParams: { deadline: deal.deadlineAt ? fmt(new Date(deal.deadlineAt)) : "" },
        });
        await createPopup({
          userId: deal.creatorId, userType: "CREATOR",
          type: "TIMELINE_EXTENSION_REJECTED",
          title: "Extension Request Declined",
          body: `The brand declined your ${ext.extraDays}-day timeline extension request.`,
          ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
          isCelebration: false, relatedEntityId: dealId,
        });
      }

      res.json({ ok: true, decision, newDeadline });
    } catch (e: any) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: e.message ?? "Failed" });
    } finally {
      client.release();
    }
  }
);

// ─── Creator: list extensions ──────────────────────────────────────────────────
router.get(
  "/creator/deals/:id/extensions",
  requireCreator,
  async (req: Request, res: Response): Promise<void> => {
    const creatorId = (req as any).creatorId as string;
    const dealId = req.params["id"] as string;
    const check = await pool.query(
      `SELECT id FROM "Deal" WHERE id=$1 AND "creatorId"=$2`,
      [dealId, creatorId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    const r = await pool.query(
      `SELECT * FROM "DealTimelineExtension" WHERE "dealId"=$1 ORDER BY "requestedAt" ASC`,
      [dealId]
    );
    res.json(r.rows);
  }
);

// ─── Brand: list extensions ────────────────────────────────────────────────────
router.get(
  "/brand/deals/:id/extensions",
  requireBrand,
  async (req: Request, res: Response): Promise<void> => {
    const brandId = (req as any).brandId as string;
    const dealId = req.params["id"] as string;
    const check = await pool.query(
      `SELECT id FROM "Deal" WHERE id=$1 AND "brandId"=$2`,
      [dealId, brandId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    const r = await pool.query(
      `SELECT * FROM "DealTimelineExtension" WHERE "dealId"=$1 ORDER BY "requestedAt" ASC`,
      [dealId]
    );
    res.json(r.rows);
  }
);

// ─── Admin: list extensions ────────────────────────────────────────────────────
router.get(
  "/admin/deals/:id/extensions",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const dealId = req.params["id"] as string;
    const r = await pool.query(
      `SELECT * FROM "DealTimelineExtension" WHERE "dealId"=$1 ORDER BY "requestedAt" ASC`,
      [dealId]
    );
    res.json(r.rows);
  }
);

export default router;
