import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireCreator } from "../middleware/requireCreator";
import { requireBrand } from "../middleware/requireBrand";

const router: IRouter = Router();

router.get("/admin/rejection-reasons", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT * FROM "RejectionReason" WHERE "isActive"=true ORDER BY "forRole", "displayOrder", "createdAt"`,
  );
  res.json(r.rows);
});

router.get("/creator/rejection-reasons", requireCreator, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, reason, solution, "displayOrder" FROM "RejectionReason" WHERE "isActive"=true AND "forRole" IN ('CREATOR','BOTH') ORDER BY "displayOrder", "createdAt"`,
  );
  res.json({ reasons: r.rows });
});

router.get("/brand/rejection-reasons", requireBrand, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, reason, solution, "displayOrder" FROM "RejectionReason" WHERE "isActive"=true AND "forRole" IN ('BRAND','BOTH') ORDER BY "displayOrder", "createdAt"`,
  );
  res.json({ reasons: r.rows });
});

router.post("/admin/rejection-reasons", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { reason, solution, forRole = "CREATOR" } = req.body as { reason?: string; solution?: string; forRole?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "Reason is required" }); return; }
  if (!solution?.trim()) { res.status(400).json({ error: "Solution is required" }); return; }
  if (!["CREATOR", "BRAND", "BOTH"].includes(forRole)) { res.status(400).json({ error: "forRole must be CREATOR, BRAND, or BOTH" }); return; }
  const maxR = await pool.query(`SELECT COALESCE(MAX("displayOrder"),0) as m FROM "RejectionReason"`);
  const nextOrder = parseInt(maxR.rows[0].m) + 1;
  const r = await pool.query(
    `INSERT INTO "RejectionReason" (id, reason, solution, "forRole", "displayOrder", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW()) RETURNING *`,
    [reason.trim(), solution.trim(), forRole, nextOrder],
  );
  res.json(r.rows[0]);
});

router.patch("/admin/rejection-reasons/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { reason, solution, forRole } = req.body as { reason?: string; solution?: string; forRole?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "Reason is required" }); return; }
  if (!solution?.trim()) { res.status(400).json({ error: "Solution is required" }); return; }
  if (forRole && !["CREATOR", "BRAND", "BOTH"].includes(forRole)) { res.status(400).json({ error: "forRole must be CREATOR, BRAND, or BOTH" }); return; }
  const sets = [`reason=$1`, `solution=$2`, `"updatedAt"=NOW()`];
  const vals: unknown[] = [reason.trim(), solution.trim()];
  if (forRole) { vals.push(forRole); sets.push(`"forRole"=$${vals.length}`); }
  vals.push(id);
  await pool.query(
    `UPDATE "RejectionReason" SET ${sets.join(", ")} WHERE id=$${vals.length}`,
    vals,
  );
  res.json({ ok: true });
});

router.delete("/admin/rejection-reasons/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  await pool.query(`UPDATE "RejectionReason" SET "isActive"=false, "updatedAt"=NOW() WHERE id=$1`, [id]);
  res.json({ ok: true });
});

export default router;
