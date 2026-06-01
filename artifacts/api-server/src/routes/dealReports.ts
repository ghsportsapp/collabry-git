import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { requireCreator } from "../middleware/requireCreator";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "DealBrandReport" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "dealId" TEXT NOT NULL,
      "brandId" TEXT NOT NULL,
      "creatorId" TEXT NOT NULL,
      reason TEXT NOT NULL,
      "reporterEmail" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE "DealBrandReport" ADD COLUMN IF NOT EXISTS "reporterEmail" TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "DealCreatorReport" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "dealId" TEXT NOT NULL,
      "creatorId" TEXT NOT NULL,
      "brandId" TEXT NOT NULL,
      reason TEXT NOT NULL,
      "reporterEmail" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE "DealCreatorReport" ADD COLUMN IF NOT EXISTS "reporterEmail" TEXT`);
}

router.get("/creator/me/email", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const r = await pool.query(`SELECT email FROM "Creator" WHERE id=$1`, [creatorId]);
  res.json({ email: r.rows[0]?.email ?? null });
});

router.get("/brand/me/email", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const r = await pool.query(`SELECT email FROM "Brand" WHERE id=$1`, [brandId]);
  res.json({ email: r.rows[0]?.email ?? null });
});

router.post("/reports/deal-brand", requireCreator, async (req: Request, res: Response): Promise<void> => {
  await ensureTables();
  const creatorId = (req as any).creatorId as string;
  const { dealId, brandId, reason, reporterEmail } = req.body as { dealId?: string; brandId?: string; reason?: string; reporterEmail?: string };
  if (!dealId || !brandId || !reason?.trim()) {
    res.status(400).json({ error: "dealId, brandId and reason are required" }); return;
  }
  const dealCheck = await pool.query(`SELECT id FROM "Deal" WHERE id=$1 AND "creatorId"=$2`, [dealId, creatorId]);
  if (dealCheck.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
  await pool.query(
    `INSERT INTO "DealBrandReport" (id,"dealId","brandId","creatorId",reason,"reporterEmail","createdAt")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,NOW())`,
    [dealId, brandId, creatorId, reason.trim(), reporterEmail?.trim() ?? null]
  );
  res.json({ ok: true });
});

router.post("/reports/deal-creator", requireBrand, async (req: Request, res: Response): Promise<void> => {
  await ensureTables();
  const brandId = (req as any).brandId as string;
  const { dealId, creatorId, reason, reporterEmail } = req.body as { dealId?: string; creatorId?: string; reason?: string; reporterEmail?: string };
  if (!dealId || !creatorId || !reason?.trim()) {
    res.status(400).json({ error: "dealId, creatorId and reason are required" }); return;
  }
  const dealCheck = await pool.query(`SELECT id FROM "Deal" WHERE id=$1 AND "brandId"=$2`, [dealId, brandId]);
  if (dealCheck.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
  await pool.query(
    `INSERT INTO "DealCreatorReport" (id,"dealId","creatorId","brandId",reason,"reporterEmail","createdAt")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,NOW())`,
    [dealId, creatorId, brandId, reason.trim(), reporterEmail?.trim() ?? null]
  );
  res.json({ ok: true });
});

router.get("/admin/deal-reports/brand", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  await ensureTables();
  const r = await pool.query(`
    SELECT dbr.id, dbr."dealId", dbr.reason, dbr."createdAt", dbr."reporterEmail",
           b."brandName", c."instagramHandle" AS "creatorHandle", c."fullName" AS "creatorName", d."orderId"
    FROM "DealBrandReport" dbr
    LEFT JOIN "Brand" b ON b.id = dbr."brandId"
    LEFT JOIN "Creator" c ON c.id = dbr."creatorId"
    LEFT JOIN "Deal" d ON d.id = dbr."dealId"
    ORDER BY dbr."createdAt" DESC
  `);
  res.json({ reports: r.rows });
});

router.get("/admin/deal-reports/creator", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  await ensureTables();
  const r = await pool.query(`
    SELECT dcr.id, dcr."dealId", dcr.reason, dcr."createdAt", dcr."reporterEmail",
           c."instagramHandle" AS "creatorHandle", c."fullName" AS "creatorName", b."brandName", d."orderId"
    FROM "DealCreatorReport" dcr
    LEFT JOIN "Creator" c ON c.id = dcr."creatorId"
    LEFT JOIN "Brand" b ON b.id = dcr."brandId"
    LEFT JOIN "Deal" d ON d.id = dcr."dealId"
    ORDER BY dcr."createdAt" DESC
  `);
  res.json({ reports: r.rows });
});

export default router;
