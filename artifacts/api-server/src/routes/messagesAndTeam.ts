import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

// ── Public: slab message for given follower count ──────────────────────────
router.get("/creator/slab-message", async (req: Request, res: Response): Promise<void> => {
  const followers = parseInt(String(req.query["followers"] ?? ""));
  if (isNaN(followers) || followers < 0) { res.json({ message: "" }); return; }
  const r = await pool.query(
    `SELECT "motivationalMessage" FROM "FollowerSlab"
     WHERE "isActive"=true AND "minFollowers"<=$1 AND ("maxFollowers" IS NULL OR "maxFollowers">=$1)
     ORDER BY "minFollowers" DESC LIMIT 1`,
    [followers],
  );
  res.json({ message: r.rows[0]?.motivationalMessage ?? "" });
});

// ── Public: category messages (creator picks random) ───────────────────────
router.get("/creator/category-messages", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, message FROM "CategoryMessage" WHERE "isActive"=true ORDER BY "displayOrder" ASC, "createdAt" ASC`,
  );
  res.json(r.rows);
});

// ── Public: team members (only admin-configured, never placeholder) ────────
router.get("/team-members", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, name, "photoUrl", role FROM "TeamMember" WHERE "isActive"=true ORDER BY "displayOrder" ASC, "createdAt" ASC`,
  );
  res.json(r.rows);
});

// ── Admin: slab messages (list of all slabs with their messages) ───────────
router.get("/admin/slab-messages", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, label, "minFollowers", "maxFollowers", "motivationalMessage" FROM "FollowerSlab"
     WHERE "isActive"=true ORDER BY "displayOrder" ASC, "minFollowers" ASC`,
  );
  res.json(r.rows);
});

router.patch("/admin/slab-messages/:slabId", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { slabId } = req.params as Record<string, string>;
  const { message } = req.body as { message?: string };
  await pool.query(
    `UPDATE "FollowerSlab" SET "motivationalMessage"=$1, "updatedAt"=NOW() WHERE id=$2`,
    [(message ?? "").trim() || null, slabId],
  );
  res.json({ ok: true });
});

// ── Admin: category messages CRUD ──────────────────────────────────────────
router.get("/admin/category-messages", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, message, "isActive", "displayOrder", "createdAt" FROM "CategoryMessage"
     ORDER BY "displayOrder" ASC, "createdAt" ASC`,
  );
  res.json(r.rows);
});

router.post("/admin/category-messages", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { message } = req.body as { message?: string };
  const trimmed = (message ?? "").trim();
  if (!trimmed) { res.status(400).json({ error: "Message is required" }); return; }
  if (trimmed.length > 500) { res.status(400).json({ error: "Message too long (max 500 chars)" }); return; }

  const cnt = await pool.query(`SELECT COUNT(*)::int AS c FROM "CategoryMessage" WHERE "isActive"=true`);
  if (cnt.rows[0].c >= 5) {
    res.status(400).json({ error: "Maximum 5 active messages reached. Delete one to add a new message." });
    return;
  }

  const maxR = await pool.query(`SELECT COALESCE(MAX("displayOrder"),0) AS m FROM "CategoryMessage"`);
  const r = await pool.query(
    `INSERT INTO "CategoryMessage" (id, message, "displayOrder") VALUES (gen_random_uuid()::text, $1, $2) RETURNING id`,
    [trimmed, parseInt(maxR.rows[0].m) + 1],
  );
  res.json({ id: r.rows[0].id });
});

router.patch("/admin/category-messages/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { message } = req.body as { message?: string };
  const trimmed = (message ?? "").trim();
  if (!trimmed) { res.status(400).json({ error: "Message is required" }); return; }
  await pool.query(`UPDATE "CategoryMessage" SET message=$1 WHERE id=$2`, [trimmed, id]);
  res.json({ ok: true });
});

router.delete("/admin/category-messages/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await pool.query(`DELETE FROM "CategoryMessage" WHERE id=$1`, [req.params["id"]]);
  res.json({ ok: true });
});

// ── Admin: team members CRUD ───────────────────────────────────────────────
router.get("/admin/team-members", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, name, "photoUrl", role, "displayOrder", "isActive", "createdAt" FROM "TeamMember"
     ORDER BY "displayOrder" ASC, "createdAt" ASC`,
  );
  res.json(r.rows);
});

router.post("/admin/team-members", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name, photoUrl, role } = req.body as { name?: string; photoUrl?: string; role?: string };
  if (!name?.trim() || !photoUrl?.trim()) { res.status(400).json({ error: "Name and photo are required" }); return; }
  const maxR = await pool.query(`SELECT COALESCE(MAX("displayOrder"),0) AS m FROM "TeamMember"`);
  const r = await pool.query(
    `INSERT INTO "TeamMember" (id, name, "photoUrl", role, "displayOrder", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW()) RETURNING id`,
    [name.trim(), photoUrl.trim(), role?.trim() || null, parseInt(maxR.rows[0].m) + 1],
  );
  res.json({ id: r.rows[0].id });
});

router.patch("/admin/team-members/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { name, photoUrl, role, isActive } = req.body as { name?: string; photoUrl?: string; role?: string; isActive?: boolean };
  const sets: string[] = [], params: unknown[] = [];
  const addSet = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}"=$${params.length}`); };
  if (name !== undefined) addSet("name", name.trim());
  if (photoUrl !== undefined) addSet("photoUrl", photoUrl.trim());
  if (role !== undefined) addSet("role", role?.trim() || null);
  if (isActive !== undefined) addSet("isActive", Boolean(isActive));
  if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  params.push(id);
  await pool.query(`UPDATE "TeamMember" SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

router.delete("/admin/team-members/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await pool.query(`DELETE FROM "TeamMember" WHERE id=$1`, [req.params["id"]]);
  res.json({ ok: true });
});

export default router;
