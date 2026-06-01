import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

// Public: find slab for a given follower count
router.get("/slabs", async (req: Request, res: Response): Promise<void> => {
  const followers = parseInt(req.query["followers"] as string);
  if (isNaN(followers) || followers < 0) { res.status(400).json({ error: "Invalid followers count" }); return; }

  const result = await pool.query(
    `SELECT id, label, "minFollowers", "maxFollowers",
     "recReelMin", "recReelMax", "recStoryMin", "recStoryMax", "recPostMin", "recPostMax",
     "disclaimerRecommended", "disclaimerHigher"
     FROM "FollowerSlab"
     WHERE "isActive"=true
       AND "minFollowers" <= $1
       AND ("maxFollowers" IS NULL OR "maxFollowers" >= $1)
     LIMIT 1`,
    [followers]
  );

  if (result.rows.length === 0) { res.status(404).json({ error: "No slab found for this follower count" }); return; }

  const slab = result.rows[0];
  const fmt = (v: any) => parseFloat(v);
  res.json({
    slabId: slab.id, label: slab.label,
    minFollowers: slab.minFollowers, maxFollowers: slab.maxFollowers,
    recReelMin: fmt(slab.recReelMin), recReelMax: fmt(slab.recReelMax),
    recStoryMin: fmt(slab.recStoryMin), recStoryMax: fmt(slab.recStoryMax),
    recPostMin: fmt(slab.recPostMin), recPostMax: fmt(slab.recPostMax),
    disclaimerRecommended: slab.disclaimerRecommended,
    disclaimerHigher: slab.disclaimerHigher,
  });
});

// Public: all slabs
router.get("/slabs/all", async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, label, "minFollowers", "maxFollowers",
     "recReelMin", "recReelMax", "recStoryMin", "recStoryMax", "recPostMin", "recPostMax",
     "disclaimerRecommended", "disclaimerHigher", "isActive", "displayOrder"
     FROM "FollowerSlab" ORDER BY "displayOrder"`
  );
  res.json(result.rows.map((r: any) => ({
    ...r,
    recReelMin: parseFloat(r.recReelMin), recReelMax: parseFloat(r.recReelMax),
    recStoryMin: parseFloat(r.recStoryMin), recStoryMax: parseFloat(r.recStoryMax),
    recPostMin: parseFloat(r.recPostMin), recPostMax: parseFloat(r.recPostMax),
  })));
});

// Admin: all slabs (same but for admin panel)
router.get("/admin/slabs", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, label, "minFollowers", "maxFollowers",
     "recReelMin", "recReelMax", "recStoryMin", "recStoryMax", "recPostMin", "recPostMax",
     "disclaimerRecommended", "disclaimerHigher", "isActive", "displayOrder", "createdAt", "updatedAt"
     FROM "FollowerSlab" ORDER BY "displayOrder"`
  );
  res.json(result.rows.map((r: any) => ({
    ...r,
    recReelMin: parseFloat(r.recReelMin), recReelMax: parseFloat(r.recReelMax),
    recStoryMin: parseFloat(r.recStoryMin), recStoryMax: parseFloat(r.recStoryMax),
    recPostMin: parseFloat(r.recPostMin), recPostMax: parseFloat(r.recPostMax),
  })));
});

// Admin: create slab
router.post("/admin/slabs", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { label, minFollowers, maxFollowers, recReelMin, recReelMax, recStoryMin, recStoryMax, recPostMin, recPostMax, disclaimerRecommended, disclaimerHigher } = req.body;
  if (!label?.trim() || minFollowers === undefined || !recReelMin || !recReelMax) {
    res.status(400).json({ error: "label, minFollowers, recReelMin, recReelMax are required" }); return;
  }
  const maxOrder = await pool.query(`SELECT COALESCE(MAX("displayOrder"),0) as max FROM "FollowerSlab"`);
  const result = await pool.query(
    `INSERT INTO "FollowerSlab" (id,label,"minFollowers","maxFollowers","recReelMin","recReelMax","recStoryMin","recStoryMax","recPostMin","recPostMax","disclaimerRecommended","disclaimerHigher","displayOrder","isActive","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,NOW(),NOW()) RETURNING id`,
    [label.trim(), parseInt(minFollowers), maxFollowers ? parseInt(maxFollowers) : null,
     recReelMin, recReelMax, recStoryMin || 0, recStoryMax || 0, recPostMin || 0, recPostMax || 0,
     disclaimerRecommended || 'Most deals happen in this range',
     disclaimerHigher || 'Fewer deals happen in this range',
     (maxOrder.rows[0].max as number) + 1]
  );
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt") VALUES (gen_random_uuid(),$1,'CREATE_SLAB','SLAB',$2,$3::jsonb,NOW())`,
    [adminId, result.rows[0].id, JSON.stringify({ label })]
  );
  res.json({ ok: true, id: result.rows[0].id });
});

// Admin: update slab
router.patch("/admin/slabs/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { label, minFollowers, maxFollowers, recReelMin, recReelMax, recStoryMin, recStoryMax, recPostMin, recPostMax, disclaimerRecommended, disclaimerHigher, isActive } = req.body;

  const sets: string[] = [];
  const params: unknown[] = [];
  const addSet = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}"=$${params.length}`); };

  if (label !== undefined) addSet("label", label.trim());
  if (minFollowers !== undefined) addSet("minFollowers", parseInt(minFollowers));
  if (maxFollowers !== undefined) addSet("maxFollowers", maxFollowers ? parseInt(maxFollowers) : null);
  if (recReelMin !== undefined) addSet("recReelMin", parseFloat(recReelMin));
  if (recReelMax !== undefined) addSet("recReelMax", parseFloat(recReelMax));
  if (recStoryMin !== undefined) addSet("recStoryMin", parseFloat(recStoryMin));
  if (recStoryMax !== undefined) addSet("recStoryMax", parseFloat(recStoryMax));
  if (recPostMin !== undefined) addSet("recPostMin", parseFloat(recPostMin));
  if (recPostMax !== undefined) addSet("recPostMax", parseFloat(recPostMax));
  if (disclaimerRecommended !== undefined) addSet("disclaimerRecommended", disclaimerRecommended);
  if (disclaimerHigher !== undefined) addSet("disclaimerHigher", disclaimerHigher);
  if (isActive !== undefined) addSet("isActive", Boolean(isActive));
  if (req.body.motivationalMessage !== undefined) addSet("motivationalMessage", req.body.motivationalMessage || null);
  if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  params.push(id);
  await pool.query(`UPDATE "FollowerSlab" SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt") VALUES (gen_random_uuid(),$1,'UPDATE_SLAB','SLAB',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify(req.body)]
  );
  res.json({ ok: true });
});

// Admin: delete slab
router.delete("/admin/slabs/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const existing = await pool.query(`SELECT label FROM "FollowerSlab" WHERE id=$1`, [id]);
  if (existing.rows.length === 0) { res.status(404).json({ error: "Slab not found" }); return; }
  await pool.query(`DELETE FROM "FollowerSlab" WHERE id=$1`, [id]);
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt") VALUES (gen_random_uuid(),$1,'DELETE_SLAB','SLAB',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ label: existing.rows[0].label })]
  );
  res.json({ ok: true });
});

export default router;
