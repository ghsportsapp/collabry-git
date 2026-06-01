import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

// Public: get active custom fields for signup form
router.get("/creator-signup-fields", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, label, "fieldType", "isRequired", "displayOrder" FROM "CreatorSignupField" WHERE "isActive"=true ORDER BY "displayOrder"`
  );
  res.json(r.rows);
});

// Admin: list all custom fields
router.get("/admin/creator-signup-fields", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT * FROM "CreatorSignupField" ORDER BY "displayOrder"`
  );
  res.json(r.rows);
});

// Admin: create custom field
router.post("/admin/creator-signup-fields", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { label, fieldType = "text", isRequired = false } = req.body as Record<string, any>;
  if (!label?.trim()) { res.status(400).json({ error: "Label is required" }); return; }
  const maxOrder = await pool.query(`SELECT COALESCE(MAX("displayOrder"),0) as max FROM "CreatorSignupField"`);
  const r = await pool.query(
    `INSERT INTO "CreatorSignupField" (id, label, "fieldType", "isRequired", "displayOrder", "isActive", "createdBy", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, NOW(), NOW()) RETURNING id`,
    [label.trim(), fieldType, Boolean(isRequired), (maxOrder.rows[0].max as number) + 1, adminId]
  );
  res.json({ ok: true, id: r.rows[0].id });
});

// Admin: update custom field
router.patch("/admin/creator-signup-fields/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { label, isRequired, isActive, displayOrder } = req.body as Record<string, any>;
  const sets: string[] = []; const params: unknown[] = [];
  const add = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}"=$${params.length}`); };
  if (label !== undefined) add("label", label.trim());
  if (isRequired !== undefined) add("isRequired", Boolean(isRequired));
  if (isActive !== undefined) add("isActive", Boolean(isActive));
  if (displayOrder !== undefined) add("displayOrder", parseInt(displayOrder));
  if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  params.push(id);
  await pool.query(`UPDATE "CreatorSignupField" SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

// Admin: delete custom field
router.delete("/admin/creator-signup-fields/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  await pool.query(`DELETE FROM "CreatorSignupField" WHERE id=$1`, [id]);
  res.json({ ok: true });
});

// Creator: save custom field values
router.post("/creator-signup-fields/values", async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  if (!creatorId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { values } = req.body as { values: { fieldId: string; value: string }[] };
  if (!Array.isArray(values)) { res.status(400).json({ error: "values array required" }); return; }
  for (const v of values) {
    await pool.query(
      `INSERT INTO "CreatorCustomFieldValue" (id, "creatorId", "fieldId", value, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())
       ON CONFLICT ("creatorId", "fieldId") DO UPDATE SET value=$3, "updatedAt"=NOW()`,
      [creatorId, v.fieldId, v.value ?? ""]
    );
  }
  res.json({ ok: true });
});

export default router;
