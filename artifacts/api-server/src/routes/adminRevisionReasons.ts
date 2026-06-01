import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

const TYPES = ["CONCEPT", "CONTENT", "BOTH"];

function serialize(r: any) {
  return {
    id: r.id, reason: r.reason, type: r.type,
    displayOrder: r.displayOrder, isActive: r.isActive,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

router.get("/admin/revision-reasons", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT * FROM "RevisionReason" ORDER BY "displayOrder" ASC, "createdAt" ASC`);
  res.json({ reasons: r.rows.map(serialize) });
});

router.post("/admin/revision-reasons", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const reason = ((req.body?.reason as string | undefined) ?? "").trim();
  const type = (req.body?.type as string | undefined) ?? "BOTH";
  const displayOrder = Number.isFinite(Number(req.body?.displayOrder)) ? Number(req.body?.displayOrder) : 0;
  if (!reason) { res.status(400).json({ error: "Reason is required" }); return; }
  if (reason.length > 200) { res.status(400).json({ error: "Reason too long (max 200 chars)" }); return; }
  if (!TYPES.includes(type)) { res.status(400).json({ error: "type must be CONCEPT, CONTENT, or BOTH" }); return; }
  const r = await pool.query(
    `INSERT INTO "RevisionReason" (id,reason,type,"displayOrder","isActive","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,true,NOW(),NOW())
     RETURNING *`,
    [reason, type, displayOrder]
  );
  res.json({ reason: serialize(r.rows[0]) });
});

router.patch("/admin/revision-reasons/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const fields: string[] = [];
  const params: any[] = [id];
  if (typeof req.body?.reason === "string") {
    const t = req.body.reason.trim();
    if (!t) { res.status(400).json({ error: "Reason cannot be empty" }); return; }
    if (t.length > 200) { res.status(400).json({ error: "Reason too long (max 200 chars)" }); return; }
    params.push(t); fields.push(`reason=$${params.length}`);
  }
  if (typeof req.body?.type === "string") {
    if (!TYPES.includes(req.body.type)) { res.status(400).json({ error: "Invalid type" }); return; }
    params.push(req.body.type); fields.push(`type=$${params.length}`);
  }
  if (Number.isFinite(Number(req.body?.displayOrder))) {
    params.push(Number(req.body.displayOrder)); fields.push(`"displayOrder"=$${params.length}`);
  }
  if (typeof req.body?.isActive === "boolean") {
    params.push(req.body.isActive); fields.push(`"isActive"=$${params.length}`);
  }
  if (fields.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  fields.push(`"updatedAt"=NOW()`);
  const r = await pool.query(`UPDATE "RevisionReason" SET ${fields.join(",")} WHERE id=$1 RETURNING *`, params);
  if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ reason: serialize(r.rows[0]) });
});

router.delete("/admin/revision-reasons/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const r = await pool.query(`UPDATE "RevisionReason" SET "isActive"=false, "updatedAt"=NOW() WHERE id=$1 RETURNING id`, [id]);
  if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// Public-ish: used by brand UI when requesting a revision.
router.get("/platform-config/revision-reasons", async (req: Request, res: Response): Promise<void> => {
  const type = (req.query["type"] as string | undefined) ?? "";
  let q = `SELECT * FROM "RevisionReason" WHERE "isActive"=true`;
  const params: any[] = [];
  if (type === "CONCEPT" || type === "CONTENT") {
    params.push(type); q += ` AND type IN ($${params.length},'BOTH')`;
  }
  q += ` ORDER BY "displayOrder" ASC, "createdAt" ASC`;
  const r = await pool.query(q, params);
  res.json({ reasons: r.rows.map(serialize) });
});

export default router;
