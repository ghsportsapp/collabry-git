import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { randomUUID } from "crypto";
import { getSignedUploadUrl, tryDeleteByStoredPath } from "../lib/storage";

/**
 * Success Stories — admin CRUD + reorder + video presign, and the public reads.
 *
 * Videos never flow through Node: the admin asks for a short-lived presigned PUT
 * (video/mp4, 100 MB cap) and streams the file straight to the public bucket;
 * playback later streams straight from storage. Posters are small images uploaded
 * through the shared /uploads/image pipeline. Deleting/replacing media purges the
 * old object from storage so nothing accumulates.
 *
 * Admin routes live under /admin/success-stories and /admin/success-stats — gated
 * by adminGuard (section "success-story"). The public reads (/success-stories,
 * /success-stats) are not under /admin so the guard passes them through.
 */
const router: IRouter = Router();

const STAT_KEYS = [
  "success_brands_count",
  "success_creators_count",
  "success_collabs_count",
  "success_total_views",
] as const;

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_VIDEO = new Set(["video/mp4"]);

// Normalize admin-entered detail pairs into a clean, bounded {label, answer}[].
function sanitizeDetails(raw: unknown): Array<{ label: string; answer: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 50)
    .map((d: any) => ({
      label: String(d?.label ?? "").slice(0, 200),
      answer: String(d?.answer ?? "").slice(0, 2000),
    }))
    .filter((d) => d.label.length > 0 || d.answer.length > 0);
}

function serializeStory(r: any) {
  return {
    id: r.id,
    position: r.position,
    videoUrl: r.videoUrl ?? null,
    posterUrl: r.posterUrl ?? null,
    details: Array.isArray(r.details) ? r.details : [],
    isPublished: !!r.isPublished,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ── ADMIN: list every story (published + draft), admin order ──
router.get("/admin/success-stories", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(
      `SELECT id, position, "videoUrl", "posterUrl", details, "isPublished", "createdAt", "updatedAt"
         FROM "SuccessStory" ORDER BY position ASC, "createdAt" ASC`,
    );
    res.json({ stories: r.rows.map(serializeStory) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to load stories" });
  }
});

// ── ADMIN: create a story (appended to the end) ──
router.post("/admin/success-stories", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as { videoUrl?: string; posterUrl?: string; details?: unknown; isPublished?: boolean };
    const details = sanitizeDetails(body.details);
    const isPublished = body.isPublished !== false;
    const posRow = await pool.query(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM "SuccessStory"`);
    const nextPos = posRow.rows[0]?.next ?? 0;
    const ins = await pool.query(
      `INSERT INTO "SuccessStory" (id, position, "videoUrl", "posterUrl", details, "isPublished", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4::jsonb, $5, NOW(), NOW())
       RETURNING id, position, "videoUrl", "posterUrl", details, "isPublished", "createdAt", "updatedAt"`,
      [nextPos, body.videoUrl ?? null, body.posterUrl ?? null, JSON.stringify(details), isPublished],
    );
    res.json({ story: serializeStory(ins.rows[0]) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to create story" });
  }
});

// ── ADMIN: update a story (purges replaced video/poster) ──
router.put("/admin/success-stories/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  try {
    const existing = await pool.query(`SELECT "videoUrl", "posterUrl" FROM "SuccessStory" WHERE id=$1`, [id]);
    if (existing.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    const old = existing.rows[0] as { videoUrl: string | null; posterUrl: string | null };

    const body = (req.body ?? {}) as { videoUrl?: string | null; posterUrl?: string | null; details?: unknown; isPublished?: boolean };

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.videoUrl !== undefined) {
      if (old.videoUrl && old.videoUrl !== body.videoUrl) await tryDeleteByStoredPath(old.videoUrl);
      vals.push(body.videoUrl); sets.push(`"videoUrl"=$${vals.length}`);
    }
    if (body.posterUrl !== undefined) {
      if (old.posterUrl && old.posterUrl !== body.posterUrl) await tryDeleteByStoredPath(old.posterUrl);
      vals.push(body.posterUrl); sets.push(`"posterUrl"=$${vals.length}`);
    }
    if (body.details !== undefined) {
      vals.push(JSON.stringify(sanitizeDetails(body.details))); sets.push(`details=$${vals.length}::jsonb`);
    }
    if (body.isPublished !== undefined) {
      vals.push(!!body.isPublished); sets.push(`"isPublished"=$${vals.length}`);
    }
    if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

    vals.push(id);
    const upd = await pool.query(
      `UPDATE "SuccessStory" SET ${sets.join(", ")}, "updatedAt"=NOW() WHERE id=$${vals.length}
       RETURNING id, position, "videoUrl", "posterUrl", details, "isPublished", "createdAt", "updatedAt"`,
      vals,
    );
    res.json({ story: serializeStory(upd.rows[0]) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to update story" });
  }
});

// ── ADMIN: delete a story (purges its video + poster) ──
router.delete("/admin/success-stories/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  try {
    const r = await pool.query(`SELECT "videoUrl", "posterUrl" FROM "SuccessStory" WHERE id=$1`, [id]);
    if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    const row = r.rows[0] as { videoUrl: string | null; posterUrl: string | null };
    await pool.query(`DELETE FROM "SuccessStory" WHERE id=$1`, [id]);
    if (row.videoUrl) await tryDeleteByStoredPath(row.videoUrl);
    if (row.posterUrl) await tryDeleteByStoredPath(row.posterUrl);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to delete story" });
  }
});

// ── ADMIN: reorder (rewrite positions in ONE transaction, dup-id guard) ──
router.post("/admin/success-stories/reorder", async (req: Request, res: Response): Promise<void> => {
  const ids = (req.body?.ids ?? []) as unknown;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
    res.status(400).json({ error: "ids must be a non-empty array of story ids" });
    return;
  }
  const idList = ids as string[];
  // Duplicate-position guard: a duplicate id would assign two rows the same slot.
  if (new Set(idList).size !== idList.length) {
    res.status(400).json({ error: "Duplicate ids in reorder request" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Must cover exactly the current set of rows, so positions stay a clean 0..n-1.
    const all = await client.query(`SELECT id FROM "SuccessStory" FOR UPDATE`);
    const existing = new Set(all.rows.map((r: any) => r.id as string));
    if (existing.size !== idList.length || !idList.every((id) => existing.has(id))) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "ids must list every story exactly once" });
      return;
    }
    for (let i = 0; i < idList.length; i++) {
      await client.query(`UPDATE "SuccessStory" SET position=$1, "updatedAt"=NOW() WHERE id=$2`, [i, idList[i]]);
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e?.message ?? "Failed to reorder" });
  } finally {
    client.release();
  }
});

// ── ADMIN: presign a direct-to-bucket video upload (video never flows through Node) ──
router.post("/admin/success-stories/video-url", async (req: Request, res: Response): Promise<void> => {
  const contentType = String(req.body?.contentType ?? "");
  const size = Number(req.body?.size);
  if (!ALLOWED_VIDEO.has(contentType)) {
    res.status(400).json({ error: "Only MP4 (H.264) video is allowed" });
    return;
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES) {
    res.status(400).json({ error: "Video must be 100 MB or smaller" });
    return;
  }
  try {
    // Key prefix is fixed server-side — the client cannot choose an arbitrary key.
    const { uploadURL, objectPath } = await getSignedUploadUrl({
      key: `success-story-video/${randomUUID()}.mp4`,
      contentType,
      visibility: "public",
    });
    res.json({ uploadURL, objectPath });
  } catch (error) {
    req.log.error({ err: error }, "Success story video presign failed");
    res.status(500).json({ error: "Could not start the upload" });
  }
});

// ── ADMIN: stats (4 free-text strings) ──
router.get("/admin/success-stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`, [[...STAT_KEYS]]);
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.key] = row.value;
    res.json({
      brands: map.success_brands_count ?? "",
      creators: map.success_creators_count ?? "",
      collabs: map.success_collabs_count ?? "",
      totalViews: map.success_total_views ?? "",
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to load stats" });
  }
});

router.patch("/admin/success-stats", async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const map: Record<string, string> = {
    success_brands_count: "brands",
    success_creators_count: "creators",
    success_collabs_count: "collabs",
    success_total_views: "totalViews",
  };
  try {
    for (const [key, field] of Object.entries(map)) {
      if (body[field] === undefined) continue;
      const value = String(body[field] ?? "").slice(0, 100);
      await pool.query(
        `INSERT INTO "PlatformConfig" (id, key, value, description, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, ''::text, NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, "updatedAt"=NOW()`,
        [key, value],
      );
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to save stats" });
  }
});

// ── PUBLIC: published stories in admin order (for the Phase 2 page) ──
router.get("/success-stories", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(
      `SELECT id, position, "videoUrl", "posterUrl", details, "isPublished", "createdAt", "updatedAt"
         FROM "SuccessStory" WHERE "isPublished"=true ORDER BY position ASC, "createdAt" ASC`,
    );
    res.json({ stories: r.rows.map(serializeStory) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to load stories" });
  }
});

// ── PUBLIC: the 4 stat strings ──
router.get("/success-stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`, [[...STAT_KEYS]]);
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.key] = row.value;
    res.json({
      brands: map.success_brands_count ?? "",
      creators: map.success_creators_count ?? "",
      collabs: map.success_collabs_count ?? "",
      totalViews: map.success_total_views ?? "",
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to load stats" });
  }
});

export default router;
