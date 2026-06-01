import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const VALID_FIELD_TYPES = ["text", "number", "tel", "email", "url", "date"];
const VALID_STATUSES = ["mandatory", "optional", "hidden"];
const UNIFIED_ORDER_KEY = "unified_field_order";

type UnifiedEntry = { type: "default"; key: string } | { type: "custom"; id: string };

async function appendToUnifiedOrder(customId: string): Promise<void> {
  const row = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [UNIFIED_ORDER_KEY]);
  let order: UnifiedEntry[] = [];
  if (row.rows.length > 0) { try { order = JSON.parse(row.rows[0].value); } catch {} }
  if (!order.some(e => e.type === "custom" && (e as any).id === customId)) {
    order.push({ type: "custom", id: customId });
    await pool.query(
      `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
      [UNIFIED_ORDER_KEY, JSON.stringify(order)]
    );
  }
}

async function removeFromUnifiedOrder(customId: string): Promise<void> {
  const row = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [UNIFIED_ORDER_KEY]);
  if (row.rows.length === 0) return;
  try {
    const order: UnifiedEntry[] = JSON.parse(row.rows[0].value);
    const updated = order.filter(e => !(e.type === "custom" && (e as any).id === customId));
    await pool.query(
      `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
      [UNIFIED_ORDER_KEY, JSON.stringify(updated)]
    );
  } catch {}
}

const router: IRouter = Router();

// Public: only visible (not hidden) active fields
router.get("/brand-signup-fields", async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, label, "fieldType", "isRequired", "displayOrder", status
     FROM "BrandSignupField" WHERE "isActive"=true AND status != 'hidden' ORDER BY "displayOrder", "createdAt"`
  );
  res.json(result.rows);
});

// Admin: all active fields with status
router.get("/admin/brand-signup-fields", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, label, "fieldType", "isRequired", "displayOrder", "isActive", status, "createdAt"
     FROM "BrandSignupField" WHERE "isActive"=true ORDER BY "displayOrder", "createdAt"`
  );
  res.json(result.rows);
});

router.post("/admin/brand-signup-fields", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { label, fieldType = "text", status = "optional" } = req.body as Record<string, any>;
  if (!label?.trim()) { res.status(400).json({ error: "Label is required" }); return; }
  if (!VALID_FIELD_TYPES.includes(fieldType)) { res.status(400).json({ error: `fieldType must be one of: ${VALID_FIELD_TYPES.join(", ")}` }); return; }
  if (!VALID_STATUSES.includes(status)) { res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }); return; }

  const maxOrder = await pool.query(`SELECT COALESCE(MAX("displayOrder"), -1) as max FROM "BrandSignupField"`);
  const nextOrder = (maxOrder.rows[0].max as number) + 1;
  const isRequired = status === "mandatory";

  const result = await pool.query(
    `INSERT INTO "BrandSignupField" (id,label,"fieldType","isRequired","displayOrder","isActive",status,"createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,$4,true,$5,NOW(),NOW()) RETURNING *`,
    [label.trim(), fieldType, isRequired, nextOrder, status]
  );
  const newField = result.rows[0];
  // Append to unified order
  await appendToUnifiedOrder(newField.id);
  res.json(newField);
});

router.patch("/admin/brand-signup-fields/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { status, label, fieldType } = req.body as { status?: string; label?: string; fieldType?: string };
  const updates: string[] = [];
  const params: unknown[] = [];

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
    updates.push(`status=$${params.push(status)}`);
    updates.push(`"isRequired"=$${params.push(status === "mandatory")}`);
  }
  if (label !== undefined && label.trim()) { updates.push(`label=$${params.push(label.trim())}`); }
  if (fieldType !== undefined) {
    if (!VALID_FIELD_TYPES.includes(fieldType)) { res.status(400).json({ error: "Invalid fieldType" }); return; }
    updates.push(`"fieldType"=$${params.push(fieldType)}`);
  }
  if (updates.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  params.push(id);
  await pool.query(`UPDATE "BrandSignupField" SET ${updates.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

router.delete("/admin/brand-signup-fields/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  await pool.query(`UPDATE "BrandSignupField" SET "isActive"=false,"updatedAt"=NOW() WHERE id=$1`, [id]);
  // Remove from unified order
  await removeFromUnifiedOrder(id);
  res.json({ ok: true });
});

router.put("/admin/brand-signup-fields/reorder", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { order } = req.body as { order: string[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order must be an array of ids" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < order.length; i++) {
      await client.query(`UPDATE "BrandSignupField" SET "displayOrder"=$1,"updatedAt"=NOW() WHERE id=$2`, [i, order[i]]);
    }
    await client.query("COMMIT");
  } catch { await client.query("ROLLBACK"); throw new Error("Reorder failed"); }
  finally { client.release(); }
  res.json({ ok: true });
});

export default router;
