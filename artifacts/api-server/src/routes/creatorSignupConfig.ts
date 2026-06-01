import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

const CONFIG_KEYS = [
  "creator_personal_fields",
  "creator_audience_age_groups",
  "creator_audience_locations",
  "creator_content_types",
  "creator_signup_info_1",
  "creator_signup_info_2",
  "creator_signup_info_3",
  "creator_signup_info_4",
  "creator_signup_info_5",
  "creator_signup_info_6",
  "creator_signup_info_7",
  "creator_signup_info_8",
  "instagram_oauth_enabled",
];

// Public: get all creator signup config
router.get("/creator-signup-config", async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1)`,
    [CONFIG_KEYS]
  );
  const config: Record<string, any> = {};
  for (const row of result.rows) {
    try { config[row.key] = JSON.parse(row.value); }
    catch { config[row.key] = row.value; }
  }
  res.json(config);
});

// Admin: get all creator signup config
router.get("/admin/creator-signup-config", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT key, value, "updatedAt" FROM "PlatformConfig" WHERE key = ANY($1)`,
    [CONFIG_KEYS]
  );
  const config: Record<string, any> = {};
  for (const row of result.rows) {
    try { config[row.key] = { value: JSON.parse(row.value), updatedAt: row.updatedAt }; }
    catch { config[row.key] = { value: row.value, updatedAt: row.updatedAt }; }
  }
  res.json(config);
});

// Admin: update a single config key
router.patch("/admin/creator-signup-config/:key", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params as Record<string, string>;
  if (!CONFIG_KEYS.includes(key)) { res.status(400).json({ error: "Invalid config key" }); return; }
  const { value } = req.body as { value: any };
  if (value === undefined) { res.status(400).json({ error: "value is required" }); return; }
  const strVal = typeof value === "string" ? value : JSON.stringify(value);
  await pool.query(
    `INSERT INTO "PlatformConfig" (id, key, value, description, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, '', NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, "updatedAt"=NOW()`,
    [key, strVal]
  );
  res.json({ ok: true });
});

export default router;
