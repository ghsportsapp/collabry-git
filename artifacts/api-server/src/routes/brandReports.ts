import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

// POST /api/brand/creators/:id/report  — brand reports a creator
router.post("/brand/creators/:id/report", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const creatorId = req.params.id as string;
  const { reason } = req.body as { reason?: string };

  if (!reason || !reason.trim()) {
    res.status(400).json({ error: "Reason is required" });
    return;
  }

  // Verify creator exists
  const cR = await pool.query(`SELECT id FROM "Creator" WHERE id=$1`, [creatorId]);
  if (cR.rows.length === 0) { res.status(404).json({ error: "Creator not found" }); return; }

  await pool.query(
    `INSERT INTO "CreatorReport" (id, "creatorId", "brandId", reason, "createdAt")
     VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
    [creatorId, brandId, reason.trim()]
  );

  res.json({ ok: true });
});

// GET /api/admin/creator-reports  — admin lists all reports
router.get("/admin/creator-reports", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`
    SELECT
      cr.id,
      cr.reason,
      cr."createdAt",
      c.id as "creatorId",
      c."fullName" as "creatorName",
      c."instagramHandle" as "creatorHandle",
      c."profilePhotoUrl" as "creatorPhoto",
      b.id as "brandId",
      b."brandName"
    FROM "CreatorReport" cr
    JOIN "Creator" c ON c.id = cr."creatorId"
    JOIN "Brand" b ON b.id = cr."brandId"
    ORDER BY cr."createdAt" DESC
  `);
  res.json({ reports: r.rows });
});

export default router;
