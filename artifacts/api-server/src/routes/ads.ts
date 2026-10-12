import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireCreator } from "../middleware/requireCreator";
import { tryDeleteByStoredPath } from "../lib/storage";

/* Advertisement banners (Batch 1): admin CRUD + reorder, and a creator-auth read.
   Managed by raw SQL against the "Advertisement" table created in
   migrations/002_advertisement.sql (schema.prisma is stale — see that file). */

const router: IRouter = Router();

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ── Creator read: active ads in feed order ──────────────────────────────────
// Used by the creator banner scroller and /explore-brands (Batch 2).
router.get("/ads", requireCreator, async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const r = await pool.query(
    `SELECT id, "imageUrl", headline, "bodyText", "displayOrder" AS "order"
       FROM "Advertisement"
      WHERE "isActive" = true
      ORDER BY "displayOrder" ASC, "createdAt" ASC`,
  );
  res.json(r.rows);
});

// ── Admin: list all ads (active + inactive) in order ────────────────────────
router.get("/admin/ads", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, "imageUrl", headline, "bodyText", "displayOrder", "isActive", "createdAt", "updatedAt"
       FROM "Advertisement"
      ORDER BY "displayOrder" ASC, "createdAt" ASC`,
  );
  res.json(r.rows);
});

// ── Admin: create ad (appended to the end of the order) ─────────────────────
router.post("/admin/ads", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const imageUrl = str(req.body?.imageUrl);
  if (!imageUrl) { res.status(400).json({ error: "imageUrl is required" }); return; }
  const headline = str(req.body?.headline);
  const bodyText = str(req.body?.bodyText);
  const isActive = req.body?.isActive === undefined ? true : !!req.body.isActive;
  const r = await pool.query(
    `INSERT INTO "Advertisement" ("imageUrl", headline, "bodyText", "displayOrder", "isActive")
     VALUES ($1, $2, $3,
       COALESCE((SELECT MAX("displayOrder") + 1 FROM "Advertisement"), 0),
       $4)
     RETURNING id, "imageUrl", headline, "bodyText", "displayOrder", "isActive", "createdAt", "updatedAt"`,
    [imageUrl, headline, bodyText, isActive],
  );
  res.json(r.rows[0]);
});

// ── Admin: update ad (any subset of fields) ─────────────────────────────────
router.patch("/admin/ads/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const b = req.body ?? {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`"${col}" = $${vals.length}`); };
  if (typeof b.imageUrl === "string" && b.imageUrl.trim()) add("imageUrl", b.imageUrl.trim());
  if (typeof b.headline === "string") add("headline", b.headline.trim());
  if (typeof b.bodyText === "string") add("bodyText", b.bodyText.trim());
  if (typeof b.isActive === "boolean") add("isActive", b.isActive);
  if (sets.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  vals.push(req.params["id"]);
  const r = await pool.query(
    `UPDATE "Advertisement" SET ${sets.join(", ")}, "updatedAt" = NOW()
      WHERE id = $${vals.length}
      RETURNING id, "imageUrl", headline, "bodyText", "displayOrder", "isActive", "createdAt", "updatedAt"`,
    vals,
  );
  if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r.rows[0]);
});

// ── Admin: delete ad (also purges the image from object storage) ────────────
router.delete("/admin/ads/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`DELETE FROM "Advertisement" WHERE id = $1 RETURNING "imageUrl"`, [req.params["id"]]);
  if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  // Best-effort storage cleanup — the key is derivable from the stored public URL
  // (see tryDeleteByStoredPath). A failed destroy must NOT fail the row delete.
  const imageUrl = r.rows[0].imageUrl as string | null;
  if (imageUrl) { void tryDeleteByStoredPath(imageUrl).catch(() => {}); }
  res.json({ ok: true });
});

// ── Admin: move ad up/down (swap displayOrder with the adjacent ad) ─────────
router.post("/admin/ads/:id/move", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const dir = req.body?.dir === "up" ? "up" : req.body?.dir === "down" ? "down" : null;
  if (!dir) { res.status(400).json({ error: "dir must be 'up' or 'down'" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT id, "displayOrder" FROM "Advertisement" WHERE id = $1 FOR UPDATE`,
      [req.params["id"]],
    );
    if (cur.rows.length === 0) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    const curOrder = cur.rows[0].displayOrder as number;
    // The neighbour in the chosen direction by displayOrder.
    const neighbour = await client.query(
      dir === "up"
        ? `SELECT id, "displayOrder" FROM "Advertisement" WHERE "displayOrder" < $1 ORDER BY "displayOrder" DESC LIMIT 1 FOR UPDATE`
        : `SELECT id, "displayOrder" FROM "Advertisement" WHERE "displayOrder" > $1 ORDER BY "displayOrder" ASC LIMIT 1 FOR UPDATE`,
      [curOrder],
    );
    if (neighbour.rows.length === 0) { await client.query("COMMIT"); res.json({ ok: true, moved: false }); return; }
    const nb = neighbour.rows[0];
    await client.query(`UPDATE "Advertisement" SET "displayOrder" = $1, "updatedAt" = NOW() WHERE id = $2`, [nb.displayOrder, cur.rows[0].id]);
    await client.query(`UPDATE "Advertisement" SET "displayOrder" = $1, "updatedAt" = NOW() WHERE id = $2`, [curOrder, nb.id]);
    await client.query("COMMIT");
    res.json({ ok: true, moved: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e?.message ?? "Reorder failed" });
  } finally {
    client.release();
  }
});

export default router;
