import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdminIfAuth } from "../middleware/requireAdmin";
import { tryDeleteByStoredPath } from "../lib/storage";

const router: IRouter = Router();

const HEAVY_KEYS = [
  "hero.media_cards",
  "team.members",
  "how_it_works.brand_steps",
  "how_it_works.creator_steps",
];

router.get("/landing-content", async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, key, value, type, section, "updatedAt", "updatedBy"
     FROM "LandingPageContent"
     WHERE key != ALL($1)
     ORDER BY section, key`,
    [HEAVY_KEYS]
  );
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json(result.rows);
});

router.get("/admin/landing-content", requireAdminIfAuth, async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, key, value, type, section, "updatedAt", "updatedBy"
     FROM "LandingPageContent"
     ORDER BY section, key`
  );
  res.set("Cache-Control", "no-store");
  res.json(result.rows);
});

router.get("/landing-hero-media", async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT key, value FROM "LandingPageContent" WHERE key = 'hero.media_cards' LIMIT 1`
  );
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  if (result.rows.length === 0) {
    res.json(null);
    return;
  }
  try {
    res.json(JSON.parse(result.rows[0].value));
  } catch {
    res.json(null);
  }
});

router.get("/landing-heavy", async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT key, value FROM "LandingPageContent" WHERE key = ANY($1)`,
    [HEAVY_KEYS.filter((k) => k !== "hero.media_cards")]
  );
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  const out: Record<string, string> = {};
  result.rows.forEach((row: { key: string; value: string }) => { out[row.key] = row.value; });
  res.json(out);
});

router.get("/landing-content/:key", async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params as Record<string, string>;
  const result = await pool.query(
    `SELECT id, key, value, type, section, "updatedAt", "updatedBy"
     FROM "LandingPageContent"
     WHERE key = $1`,
    [key]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json(result.rows[0]);
});

router.put("/landing-content", requireAdminIfAuth, async (req: Request, res: Response): Promise<void> => {
  const items = req.body as Array<{
    key: string;
    value: string;
    type: string;
    section: string;
    updatedBy?: string;
  }>;

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Expected array of content items" });
    return;
  }

  for (const item of items) {
    if (!item.key || typeof item.key !== "string" || !item.value || !item.type || !item.section) {
      res.status(400).json({ error: "Each item must have key, value, type, and section" });
      return;
    }
    if (!["text", "image", "color", "json"].includes(item.type)) {
      res.status(400).json({ error: `Invalid type "${item.type}". Must be text, image, color, or json` });
      return;
    }
  }

  if (items.length > 200) {
    res.status(400).json({ error: "Too many items (max 200)" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of items) {
      await client.query(
        `INSERT INTO "LandingPageContent" (id, key, value, type, section, "updatedAt", "updatedBy")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), $5)
         ON CONFLICT (key)
         DO UPDATE SET value = $2, type = $3, section = $4, "updatedAt" = NOW(), "updatedBy" = $5`,
        [item.key, item.value, item.type, item.section, item.updatedBy ?? "admin"]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to save content" });
  } finally {
    client.release();
  }
});

router.delete("/landing-content/:key", requireAdminIfAuth, async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params as Record<string, string>;
  const result = await pool.query(
    `DELETE FROM "LandingPageContent" WHERE key = $1`,
    [key]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json({ ok: true });
});

// ─── LANDING PAGE VIDEOS (YouTube) ──────────────────────────────────────────

const VALID_PAGES = ["home", "brand", "creator"];

function extractYoutubeId(url: string): string | null {
  const trimmed = url.trim();
  const pattern =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const m = trimmed.match(pattern);
  return m ? m[1] : null;
}

router.get("/landing-videos", async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, page, "youtubeUrl", "videoId", "thumbnailPath", "updatedAt"
     FROM "LandingPageVideo"
     ORDER BY page`
  );
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.json(result.rows);
});

router.get("/landing-videos/:page", async (req: Request, res: Response): Promise<void> => {
  const { page } = req.params as Record<string, string>;
  if (!VALID_PAGES.includes(page)) {
    res.status(400).json({ error: "Invalid page. Must be home, brand, or creator." });
    return;
  }
  const result = await pool.query(
    `SELECT id, page, "youtubeUrl", "videoId", "thumbnailPath", "updatedAt"
     FROM "LandingPageVideo"
     WHERE page = $1`,
    [page]
  );
  if (result.rows.length === 0 || !result.rows[0].videoId) {
    res.status(404).json({ error: "No video for this page" });
    return;
  }
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.json(result.rows[0]);
});

router.put("/landing-videos/:page", requireAdminIfAuth, async (req: Request, res: Response): Promise<void> => {
  const { page } = req.params as Record<string, string>;
  if (!VALID_PAGES.includes(page)) {
    res.status(400).json({ error: "Invalid page. Must be home, brand, or creator." });
    return;
  }
  const { youtubeUrl, thumbnailPath } = req.body as {
    youtubeUrl?: string | null;
    thumbnailPath?: string | null;
  };

  const existing = await pool.query(
    `SELECT "youtubeUrl", "videoId", "thumbnailPath" FROM "LandingPageVideo" WHERE page = $1`,
    [page]
  );
  const old = existing.rows[0] as { youtubeUrl: string | null; videoId: string | null; thumbnailPath: string | null } | undefined;

  let newYoutubeUrl = old?.youtubeUrl ?? null;
  let newVideoId = old?.videoId ?? null;

  if (youtubeUrl !== undefined) {
    if (youtubeUrl === null || youtubeUrl === "") {
      newYoutubeUrl = null;
      newVideoId = null;
    } else {
      const parsed = extractYoutubeId(youtubeUrl);
      if (!parsed) {
        res.status(400).json({ error: "Invalid YouTube URL. Could not extract video ID." });
        return;
      }
      newYoutubeUrl = youtubeUrl.trim();
      newVideoId = parsed;
    }
  }

  if (thumbnailPath !== undefined && old?.thumbnailPath && old.thumbnailPath !== thumbnailPath) {
    await tryDeleteByStoredPath(old.thumbnailPath);
  }
  const newThumb = thumbnailPath !== undefined ? thumbnailPath : (old?.thumbnailPath ?? null);

  const result = await pool.query(
    `INSERT INTO "LandingPageVideo" (id, page, "youtubeUrl", "videoId", "thumbnailPath", "updatedAt", "updatedBy")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), 'admin')
     ON CONFLICT (page)
     DO UPDATE SET "youtubeUrl" = $2, "videoId" = $3, "thumbnailPath" = $4, "updatedAt" = NOW(), "updatedBy" = 'admin'
     RETURNING id, page, "youtubeUrl", "videoId", "thumbnailPath", "updatedAt"`,
    [page, newYoutubeUrl, newVideoId, newThumb]
  );
  res.json(result.rows[0]);
});

router.delete("/landing-videos/:page/video", requireAdminIfAuth, async (req: Request, res: Response): Promise<void> => {
  const { page } = req.params as Record<string, string>;
  if (!VALID_PAGES.includes(page)) {
    res.status(400).json({ error: "Invalid page." });
    return;
  }
  await pool.query(
    `UPDATE "LandingPageVideo" SET "youtubeUrl" = NULL, "videoId" = NULL, "updatedAt" = NOW() WHERE page = $1`,
    [page]
  );
  res.json({ ok: true });
});

router.delete("/landing-videos/:page/thumbnail", requireAdminIfAuth, async (req: Request, res: Response): Promise<void> => {
  const { page } = req.params as Record<string, string>;
  if (!VALID_PAGES.includes(page)) {
    res.status(400).json({ error: "Invalid page." });
    return;
  }
  const existing = await pool.query(
    `SELECT "thumbnailPath" FROM "LandingPageVideo" WHERE page = $1`,
    [page]
  );
  const old = existing.rows[0] as { thumbnailPath: string | null } | undefined;
  if (old?.thumbnailPath) {
    await tryDeleteByStoredPath(old.thumbnailPath);
  }
  await pool.query(
    `UPDATE "LandingPageVideo" SET "thumbnailPath" = NULL, "updatedAt" = NOW() WHERE page = $1`,
    [page]
  );
  res.json({ ok: true });
});

export default router;
