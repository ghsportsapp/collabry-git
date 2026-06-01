import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireBrand } from "../middleware/requireBrand";

const router: IRouter = Router();

// ─── DB INIT ───────────────────────────────────────────────────────────────────

export async function initMatchmakingTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "MatchmakingDimension" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "dimensionKey" TEXT UNIQUE NOT NULL,
      "label" TEXT NOT NULL,
      "brandField" TEXT NOT NULL,
      "brandFieldLabel" TEXT NOT NULL,
      "creatorField" TEXT NOT NULL,
      "creatorFieldLabel" TEXT NOT NULL,
      "scoringParam" TEXT NOT NULL,
      "briefKey" TEXT NOT NULL,
      "creatorColumn" TEXT NOT NULL,
      "displayOrder" INT DEFAULT 0,
      "isActive" BOOLEAN DEFAULT true,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "MatchmakingCreatorFieldOption" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "fieldKey" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "displayOrder" INT DEFAULT 0,
      "isActive" BOOLEAN DEFAULT true,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE ("fieldKey", "value")
    )
  `);
  // Seed default dimensions if none exist
  const dimCount = await pool.query(`SELECT COUNT(*) as n FROM "MatchmakingDimension"`);
  if (parseInt(dimCount.rows[0].n) === 0) {
    await pool.query(`
      INSERT INTO "MatchmakingDimension"
        (id,"dimensionKey","label","brandField","brandFieldLabel","creatorField","creatorFieldLabel","scoringParam","briefKey","creatorColumn","displayOrder")
      VALUES
        (gen_random_uuid()::text,'goal_content','Campaign Goal → Creator Content Type','goal','Campaign Goal','contentType','Content Type','goal','campaignGoal','contentType',0)
    `);
  }
  // Seed creator field options from existing creators if empty
  const cfCount = await pool.query(`SELECT COUNT(*) as n FROM "MatchmakingCreatorFieldOption"`);
  if (parseInt(cfCount.rows[0].n) === 0) {
    const ctR = await pool.query(`SELECT DISTINCT "contentType" as v FROM "Creator" WHERE "contentType" IS NOT NULL AND "contentType"<>'' ORDER BY "contentType"`);
    let ord = 0;
    for (const r of ctR.rows) {
      await pool.query(
        `INSERT INTO "MatchmakingCreatorFieldOption" (id,"fieldKey","label","value","displayOrder") VALUES (gen_random_uuid()::text,'contentType',$1,$1,$2) ON CONFLICT DO NOTHING`,
        [r.v, ord++]
      );
    }
  }
  // Seed default creator gender options in MatchmakingFieldOption if none exist for field='creatorGender'
  const cgCount = await pool.query(`SELECT COUNT(*) as n FROM "MatchmakingFieldOption" WHERE field='creatorGender'`);
  if (parseInt(cgCount.rows[0].n) === 0) {
    const defaults = ["Male", "Female", "Non Binary", "Prefer Not to Say"];
    for (let i = 0; i < defaults.length; i++) {
      await pool.query(
        `INSERT INTO "MatchmakingFieldOption" (id,field,label,value,"displayOrder","isActive")
         VALUES (gen_random_uuid()::text,'creatorGender',$1,$1,$2,true) ON CONFLICT DO NOTHING`,
        [defaults[i], i]
      );
    }
  }
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function ageBracket(age: string | null): number {
  if (!age) return -1;
  const n = parseInt(age.replace(/[^0-9].*/u, ""));
  if (isNaN(n) || n < 25) return 0;
  if (n < 35) return 1;
  if (n < 45) return 2;
  return 3;
}

type Weight = { fullMatchPts: number; partialMatchPts: number; noMatchPts: number; relatedPts: number };

// Lookup match level from MatchmakingMapping table
// mappings is keyed as `mappingType:brandOption:creatorOption`
function lookupMapping(
  mappings: Map<string, string>,
  mappingType: string,
  brandOption: string,
  creatorOption: string | null,
  w: Weight,
): { pts: number; reason: string } {
  if (!creatorOption) return { pts: w.noMatchPts, reason: "No creator data" };
  const key = `${mappingType}:${brandOption.toLowerCase()}:${creatorOption.toLowerCase()}`;
  const level = mappings.get(key) ?? "NONE";
  if (level === "FULL") return { pts: w.fullMatchPts, reason: `Full match (${creatorOption})` };
  if (level === "PARTIAL") return { pts: w.partialMatchPts, reason: `Partial match (${creatorOption})` };
  return { pts: w.noMatchPts, reason: `No match (${creatorOption})` };
}

// ─── ADMIN: Scoring Weights ─────────────────────────────────────────────────

router.get("/admin/matchmaking/scoring-weights", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [swR, cfgR] = await Promise.all([
    pool.query(`SELECT * FROM "ScoringWeight" ORDER BY parameter`),
    pool.query(`SELECT key,value FROM "PlatformConfig" WHERE key IN ('gender_majority_threshold','gender_mixed_min','gender_mixed_max')`),
  ]);
  const cfg: Record<string, string> = {};
  for (const r of cfgR.rows) cfg[r.key] = r.value;
  res.json({
    weights: swR.rows,
    genderMajorityThreshold: parseInt(cfg["gender_majority_threshold"] ?? "55"),
    genderMixedMin: parseInt(cfg["gender_mixed_min"] ?? "40"),
    genderMixedMax: parseInt(cfg["gender_mixed_max"] ?? "60"),
  });
});

router.patch("/admin/matchmaking/scoring-weights", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { weights, genderMajorityThreshold, genderMixedMin, genderMixedMax } = req.body;
  const weightsArr = Array.isArray(weights) ? weights : (Array.isArray(req.body) ? req.body : null);
  if (!weightsArr) { res.status(400).json({ error: "weights must be array" }); return; }
  const total = weightsArr.reduce((s: number, w: any) => s + (w.fullMatchPts ?? 0), 0);
  if (total !== 100) { res.status(400).json({ error: `Total fullMatchPts must equal 100, got ${total}` }); return; }
  for (const w of weightsArr) {
    if ((w.noMatchPts ?? 0) < 1) { res.status(400).json({ error: `noMatchPts must be >= 1 for all parameters` }); return; }
    await pool.query(
      `UPDATE "ScoringWeight" SET "fullMatchPts"=$1,"partialMatchPts"=$2,"noMatchPts"=$3,"relatedPts"=$4,"updatedBy"=$5,"updatedAt"=NOW() WHERE id=$6`,
      [w.fullMatchPts, w.partialMatchPts, w.noMatchPts, w.relatedPts ?? null, adminId, w.id]
    );
  }
  const upsertCfg = async (key: string, value: string, desc: string) => {
    await pool.query(
      `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid()::text,$1,$2,$3,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
      [key, value, desc]
    );
  };
  if (genderMajorityThreshold !== undefined) await upsertCfg("gender_majority_threshold", String(parseInt(genderMajorityThreshold)), "Gender majority threshold %");
  if (genderMixedMin !== undefined) await upsertCfg("gender_mixed_min", String(parseInt(genderMixedMin)), "Mixed gender range min %");
  if (genderMixedMax !== undefined) await upsertCfg("gender_mixed_max", String(parseInt(genderMixedMax)), "Mixed gender range max %");
  res.json({ ok: true });
});

// ─── ADMIN: Field Options ───────────────────────────────────────────────────

router.get("/admin/matchmaking/options", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const field = req.query["field"] as string | undefined;
  const q = field
    ? `SELECT * FROM "MatchmakingFieldOption" WHERE field=$1 ORDER BY "displayOrder"`
    : `SELECT * FROM "MatchmakingFieldOption" ORDER BY field,"displayOrder"`;
  const r = field ? await pool.query(q, [field]) : await pool.query(q);
  res.json(r.rows);
});

router.post("/admin/matchmaking/options", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { field, label, value } = req.body;
  if (!field || !label || !value) { res.status(400).json({ error: "field, label, value required" }); return; }
  const maxOrd = await pool.query(`SELECT COALESCE(MAX("displayOrder"),0)+1 as n FROM "MatchmakingFieldOption" WHERE field=$1`, [field]);
  const r = await pool.query(
    `INSERT INTO "MatchmakingFieldOption" (id,field,label,value,"displayOrder") VALUES (gen_random_uuid()::text,$1,$2,$3,$4) RETURNING *`,
    [field, label.trim(), value.trim(), maxOrd.rows[0].n]
  );
  res.status(201).json(r.rows[0]);
});

router.patch("/admin/matchmaking/options/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { label, value, displayOrder, isActive } = req.body;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (label !== undefined) { sets.push(`label=$${i++}`); vals.push(label); }
  if (value !== undefined) { sets.push(`value=$${i++}`); vals.push(value); }
  if (displayOrder !== undefined) { sets.push(`"displayOrder"=$${i++}`); vals.push(displayOrder); }
  if (isActive !== undefined) { sets.push(`"isActive"=$${i++}`); vals.push(isActive); }
  if (sets.length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  vals.push(req.params["id"]);
  const r = await pool.query(`UPDATE "MatchmakingFieldOption" SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
  if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r.rows[0]);
});

router.delete("/admin/matchmaking/options/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  // Cascade: remove MatchmakingMapping entries that reference this brand option label
  const optR = await pool.query(`SELECT field, label FROM "MatchmakingFieldOption" WHERE id=$1`, [req.params["id"]]);
  if (optR.rows.length > 0) {
    const { field, label } = optR.rows[0] as { field: string; label: string };
    const dims = await pool.query(`SELECT "dimensionKey" FROM "MatchmakingDimension" WHERE "brandField"=$1`, [field]);
    for (const dim of dims.rows) {
      await pool.query(
        `DELETE FROM "MatchmakingMapping" WHERE "mappingType"=$1 AND LOWER("brandOption")=LOWER($2)`,
        [dim.dimensionKey as string, label]
      );
    }
  }
  await pool.query(`DELETE FROM "MatchmakingFieldOption" WHERE id=$1`, [req.params["id"]]);
  res.json({ ok: true });
});

// Delete ALL options for a field group — also cascades to dimensions + mappings
router.delete("/admin/matchmaking/options-field/:fieldKey", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { fieldKey } = req.params as Record<string, string>;

  // 1. Cascade: find all dimensions using this brandField, delete their mappings, then delete them
  const dims = await pool.query(
    `SELECT id, "dimensionKey" FROM "MatchmakingDimension" WHERE "brandField"=$1`,
    [fieldKey]
  );
  for (const dim of dims.rows) {
    await pool.query(`DELETE FROM "MatchmakingMapping" WHERE "mappingType"=$1`, [dim.dimensionKey as string]);
  }
  if (dims.rows.length > 0) {
    const dimIds = dims.rows.map((r: any) => r.id as string);
    await pool.query(`DELETE FROM "MatchmakingDimension" WHERE id = ANY($1::text[])`, [dimIds]);
  }

  // 2. Delete all brand-side options for this field
  await pool.query(`DELETE FROM "MatchmakingFieldOption" WHERE field=$1`, [fieldKey]);

  // 3. Remove the section from the sections list in PlatformConfig
  const cfg = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='matchmaking_field_sections'`);
  if (cfg.rows.length > 0) {
    try {
      const sections: Array<{ key: string; label: string }> = JSON.parse(cfg.rows[0].value as string);
      const updated = sections.filter(s => s.key !== fieldKey);
      await pool.query(`UPDATE "PlatformConfig" SET value=$1,"updatedAt"=NOW() WHERE key='matchmaking_field_sections'`, [JSON.stringify(updated)]);
    } catch { /* ignore parse errors */ }
  }
  res.json({ ok: true });
});

// ─── ADMIN: Field Sections (ordered list of brand-brief field groups) ──────────
// Stored in PlatformConfig key 'matchmaking_field_sections' as JSON array [{key, label}]

const DEFAULT_FIELD_SECTIONS = [
  { key: "goal",         label: "Campaign Goal" },
  { key: "priceTier",    label: "Price Tier" },
  { key: "purchaseType", label: "Purchase Type" },
  { key: "customerType", label: "Target Customer Type" },
  { key: "gender",       label: "Target Gender" },
  { key: "age",          label: "Target Age" },
  { key: "location",     label: "Target Location" },
];

async function getFieldSections(): Promise<Array<{ key: string; label: string }>> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='matchmaking_field_sections'`);
  if (r.rows.length === 0) return DEFAULT_FIELD_SECTIONS;
  try { return JSON.parse(r.rows[0].value as string); } catch { return DEFAULT_FIELD_SECTIONS; }
}

async function saveFieldSections(sections: Array<{ key: string; label: string }>): Promise<void> {
  const existing = await pool.query(`SELECT id FROM "PlatformConfig" WHERE key='matchmaking_field_sections'`);
  if (existing.rows.length > 0) {
    await pool.query(`UPDATE "PlatformConfig" SET value=$1,"updatedAt"=NOW() WHERE key='matchmaking_field_sections'`, [JSON.stringify(sections)]);
  } else {
    await pool.query(`INSERT INTO "PlatformConfig" (id,key,value,"updatedAt") VALUES (gen_random_uuid()::text,'matchmaking_field_sections',$1,NOW())`, [JSON.stringify(sections)]);
  }
}

router.get("/admin/matchmaking/field-sections", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  res.json(await getFieldSections());
});

router.put("/admin/matchmaking/field-sections", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const sections = req.body as Array<{ key: string; label: string }>;
  if (!Array.isArray(sections)) { res.status(400).json({ error: "Array required" }); return; }
  for (const s of sections) {
    if (!s.key?.trim() || !s.label?.trim()) { res.status(400).json({ error: "Each section needs key and label" }); return; }
  }
  await saveFieldSections(sections);
  res.json({ ok: true });
});

// ─── ADMIN: Result Filters ──────────────────────────────────────────────────

router.get("/admin/matchmaking/filters", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT * FROM "MatchmakingFilter" ORDER BY "filterType"`);
  res.json(r.rows);
});

router.patch("/admin/matchmaking/filters", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const filters = req.body?.filters as Array<{ type: string; isActive: boolean }>;
  if (!Array.isArray(filters)) { res.status(400).json({ error: "filters array required" }); return; }
  for (const f of filters) {
    await pool.query(
      `UPDATE "MatchmakingFilter" SET "isActive"=$1,"updatedAt"=NOW() WHERE "filterType"=$2`,
      [f.isActive, f.type]
    );
  }
  res.json({ ok: true });
});

// ─── ADMIN: Match Mappings ──────────────────────────────────────────────────
// mappingType values: goal_content | price_audience | purchase_audience | customer_audience

router.get("/admin/matchmaking/mappings", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT * FROM "MatchmakingMapping" ORDER BY "mappingType","brandOption","creatorOption"`);
  res.json(r.rows);
});

router.put("/admin/matchmaking/mappings/:type", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { type } = req.params as Record<string, string>;
  const rows = req.body as Array<{ brandOption: string; creatorOption: string; matchLevel: string }>;
  if (!Array.isArray(rows)) { res.status(400).json({ error: "body must be array" }); return; }
  const dimCheck = await pool.query(`SELECT id FROM "MatchmakingDimension" WHERE "dimensionKey"=$1`, [type]);
  if (dimCheck.rows.length === 0) { res.status(400).json({ error: "invalid dimensionKey — create it in Field Config first" }); return; }
  for (const row of rows) {
    if (!row.brandOption || !row.creatorOption) continue;
    const level = ["FULL", "PARTIAL", "NONE"].includes(row.matchLevel) ? row.matchLevel : "NONE";
    await pool.query(
      `INSERT INTO "MatchmakingMapping" (id,"mappingType","brandOption","creatorOption","matchLevel","updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,NOW())
       ON CONFLICT ("mappingType","brandOption","creatorOption") DO UPDATE SET "matchLevel"=$4,"updatedAt"=NOW()`,
      [type, row.brandOption, row.creatorOption, level]
    );
  }
  res.json({ ok: true });
});

// ─── ADMIN: Creator field options (for mapping UI) ───────────────────────────
// Reads from MatchmakingCreatorFieldOption (admin-managed)

router.get("/admin/matchmaking/creator-options", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT "fieldKey","label","value" FROM "MatchmakingCreatorFieldOption" WHERE "isActive"=true ORDER BY "fieldKey","displayOrder"`);
  const grouped: Record<string, string[]> = {};
  for (const row of r.rows) {
    if (!grouped[row.fieldKey]) grouped[row.fieldKey] = [];
    grouped[row.fieldKey].push(row.value as string);
  }
  // Backwards-compat keys for existing TabMatchMapping consumers
  res.json({
    contentTypes: grouped["contentType"] ?? [],
    ...grouped,
  });
});

// ─── ADMIN: Dimensions CRUD ──────────────────────────────────────────────────

router.get("/admin/matchmaking/dimensions", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT * FROM "MatchmakingDimension" ORDER BY "displayOrder","createdAt"`);
  res.json(r.rows);
});

router.post("/admin/matchmaking/dimensions", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { dimensionKey, label, brandField, brandFieldLabel, creatorField, creatorFieldLabel, scoringParam, briefKey, creatorColumn } = req.body;
  if (!dimensionKey || !label || !brandField || !brandFieldLabel || !creatorField || !creatorFieldLabel || !scoringParam || !briefKey || !creatorColumn) {
    res.status(400).json({ error: "All fields required" }); return;
  }
  const maxOrd = await pool.query(`SELECT COALESCE(MAX("displayOrder"),0)+1 as n FROM "MatchmakingDimension"`);
  try {
    const r = await pool.query(
      `INSERT INTO "MatchmakingDimension" (id,"dimensionKey","label","brandField","brandFieldLabel","creatorField","creatorFieldLabel","scoringParam","briefKey","creatorColumn","displayOrder","updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *`,
      [dimensionKey, label, brandField, brandFieldLabel, creatorField, creatorFieldLabel, scoringParam, briefKey, creatorColumn, maxOrd.rows[0].n]
    );
    // Auto-create a ScoringWeight entry if missing
    await pool.query(
      `INSERT INTO "ScoringWeight" (id,parameter,"fullMatchPts","partialMatchPts","noMatchPts","relatedPts","updatedBy","updatedAt")
       VALUES (gen_random_uuid()::text,$1,10,5,1,null,$2,NOW()) ON CONFLICT (parameter) DO NOTHING`,
      [scoringParam, adminId]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === "23505") { res.status(409).json({ error: "dimensionKey already exists" }); return; }
    res.status(500).json({ error: e.message });
  }
});

router.patch("/admin/matchmaking/dimensions/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { label, brandField, brandFieldLabel, creatorField, creatorFieldLabel, scoringParam, briefKey, creatorColumn, displayOrder, isActive } = req.body;
  const sets: string[] = []; const vals: unknown[] = []; let i = 1;
  if (label !== undefined)             { sets.push(`label=$${i++}`); vals.push(label); }
  if (brandField !== undefined)        { sets.push(`"brandField"=$${i++}`); vals.push(brandField); }
  if (brandFieldLabel !== undefined)   { sets.push(`"brandFieldLabel"=$${i++}`); vals.push(brandFieldLabel); }
  if (creatorField !== undefined)      { sets.push(`"creatorField"=$${i++}`); vals.push(creatorField); }
  if (creatorFieldLabel !== undefined) { sets.push(`"creatorFieldLabel"=$${i++}`); vals.push(creatorFieldLabel); }
  if (scoringParam !== undefined)      { sets.push(`"scoringParam"=$${i++}`); vals.push(scoringParam); }
  if (briefKey !== undefined)          { sets.push(`"briefKey"=$${i++}`); vals.push(briefKey); }
  if (creatorColumn !== undefined)     { sets.push(`"creatorColumn"=$${i++}`); vals.push(creatorColumn); }
  if (displayOrder !== undefined)      { sets.push(`"displayOrder"=$${i++}`); vals.push(displayOrder); }
  if (isActive !== undefined)          { sets.push(`"isActive"=$${i++}`); vals.push(isActive); }
  if (sets.length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  sets.push(`"updatedAt"=NOW()`);
  vals.push(req.params["id"]);
  const r = await pool.query(`UPDATE "MatchmakingDimension" SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
  if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r.rows[0]);
});

router.delete("/admin/matchmaking/dimensions/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const dim = await pool.query(`SELECT "dimensionKey" FROM "MatchmakingDimension" WHERE id=$1`, [req.params["id"]]);
  if (dim.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  await pool.query(`DELETE FROM "MatchmakingMapping" WHERE "mappingType"=$1`, [dim.rows[0].dimensionKey]);
  await pool.query(`DELETE FROM "MatchmakingDimension" WHERE id=$1`, [req.params["id"]]);
  res.json({ ok: true });
});

// ─── ADMIN: Creator Field Options CRUD ──────────────────────────────────────

router.get("/admin/matchmaking/creator-field-options", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const fieldKey = req.query["fieldKey"] as string | undefined;
  const q = fieldKey
    ? `SELECT * FROM "MatchmakingCreatorFieldOption" WHERE "fieldKey"=$1 ORDER BY "displayOrder"`
    : `SELECT * FROM "MatchmakingCreatorFieldOption" ORDER BY "fieldKey","displayOrder"`;
  const r = fieldKey ? await pool.query(q, [fieldKey]) : await pool.query(q);
  res.json(r.rows);
});

router.post("/admin/matchmaking/creator-field-options", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { fieldKey, label, value } = req.body;
  if (!fieldKey || !label || !value) { res.status(400).json({ error: "fieldKey, label, value required" }); return; }
  const maxOrd = await pool.query(`SELECT COALESCE(MAX("displayOrder"),0)+1 as n FROM "MatchmakingCreatorFieldOption" WHERE "fieldKey"=$1`, [fieldKey]);
  try {
    const r = await pool.query(
      `INSERT INTO "MatchmakingCreatorFieldOption" (id,"fieldKey","label","value","displayOrder") VALUES (gen_random_uuid()::text,$1,$2,$3,$4) RETURNING *`,
      [fieldKey, label.trim(), value.trim(), maxOrd.rows[0].n]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === "23505") { res.status(409).json({ error: "Option already exists for this field" }); return; }
    res.status(500).json({ error: e.message });
  }
});

router.patch("/admin/matchmaking/creator-field-options/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { label, value, displayOrder, isActive } = req.body;
  const sets: string[] = []; const vals: unknown[] = []; let i = 1;
  if (label !== undefined)        { sets.push(`label=$${i++}`); vals.push(label); }
  if (value !== undefined)        { sets.push(`value=$${i++}`); vals.push(value); }
  if (displayOrder !== undefined) { sets.push(`"displayOrder"=$${i++}`); vals.push(displayOrder); }
  if (isActive !== undefined)     { sets.push(`"isActive"=$${i++}`); vals.push(isActive); }
  if (sets.length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  vals.push(req.params["id"]);
  const r = await pool.query(`UPDATE "MatchmakingCreatorFieldOption" SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
  if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r.rows[0]);
});

router.delete("/admin/matchmaking/creator-field-options/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  // Cascade: remove MatchmakingMapping entries that reference this creator option value
  const optR = await pool.query(`SELECT "fieldKey", value FROM "MatchmakingCreatorFieldOption" WHERE id=$1`, [req.params["id"]]);
  if (optR.rows.length > 0) {
    const { fieldKey, value } = optR.rows[0] as { fieldKey: string; value: string };
    const dims = await pool.query(`SELECT "dimensionKey" FROM "MatchmakingDimension" WHERE "creatorField"=$1`, [fieldKey]);
    for (const dim of dims.rows) {
      await pool.query(
        `DELETE FROM "MatchmakingMapping" WHERE "mappingType"=$1 AND LOWER("creatorOption")=LOWER($2)`,
        [dim.dimensionKey as string, value]
      );
    }
  }
  await pool.query(`DELETE FROM "MatchmakingCreatorFieldOption" WHERE id=$1`, [req.params["id"]]);
  res.json({ ok: true });
});

// ─── ADMIN: Adjacency CRUD ──────────────────────────────────────────────────

router.get("/admin/matchmaking/adjacency", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [catR, goalR, locR, custR] = await Promise.all([
    pool.query(`SELECT * FROM "CategoryAdjacency" ORDER BY "categoryA"`),
    pool.query(`SELECT * FROM "GoalAdjacency" ORDER BY "goalA"`),
    pool.query(`SELECT * FROM "LocationAdjacency" ORDER BY "locationA"`),
    pool.query(`SELECT * FROM "CustomerTypeAdjacency" ORDER BY "typeA"`),
  ]);
  res.json({
    categoryAdjacency: catR.rows,
    goalAdjacency: goalR.rows,
    locationAdjacency: locR.rows,
    customerTypeAdjacency: custR.rows,
  });
});

router.post("/admin/matchmaking/adjacency", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { type, entityA, entityB } = req.body as { type: string; entityA: string; entityB: string };
  if (!type || !entityA?.trim() || !entityB?.trim()) { res.status(400).json({ error: "type, entityA, entityB required" }); return; }
  const a = entityA.trim(); const b = entityB.trim();
  if (a === b) { res.status(400).json({ error: "entityA and entityB cannot be the same" }); return; }
  try {
    if (type === "category") {
      await pool.query(
        `INSERT INTO "CategoryAdjacency" (id,"categoryA","categoryB",pts) VALUES (gen_random_uuid(),$1,$2,11),(gen_random_uuid(),$2,$1,11) ON CONFLICT ("categoryA","categoryB") DO NOTHING`,
        [a, b]
      );
    } else if (type === "goal") {
      await pool.query(
        `INSERT INTO "GoalAdjacency" (id,"goalA","goalB",pts) VALUES (gen_random_uuid(),$1,$2,9),(gen_random_uuid(),$2,$1,9) ON CONFLICT ("goalA","goalB") DO NOTHING`,
        [a, b]
      );
    } else if (type === "location") {
      await pool.query(
        `INSERT INTO "LocationAdjacency" (id,"locationA","locationB",pts) VALUES (gen_random_uuid(),$1,$2,3),(gen_random_uuid(),$2,$1,3) ON CONFLICT ("locationA","locationB") DO NOTHING`,
        [a, b]
      );
    } else if (type === "customerType") {
      await pool.query(
        `INSERT INTO "CustomerTypeAdjacency" (id,"typeA","typeB",pts) VALUES (gen_random_uuid(),$1,$2,6),(gen_random_uuid(),$2,$1,6) ON CONFLICT ("typeA","typeB") DO NOTHING`,
        [a, b]
      );
    } else {
      res.status(400).json({ error: "Unknown type" }); return;
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Server error" });
  }
});

router.delete("/admin/matchmaking/adjacency/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { type } = req.query as { type: string };
  if (type === "category") {
    const r = await pool.query(`SELECT "categoryA","categoryB" FROM "CategoryAdjacency" WHERE id=$1`, [id]);
    if (r.rows[0]) await pool.query(`DELETE FROM "CategoryAdjacency" WHERE ("categoryA"=$1 AND "categoryB"=$2) OR ("categoryA"=$2 AND "categoryB"=$1)`, [r.rows[0].categoryA, r.rows[0].categoryB]);
  } else if (type === "goal") {
    const r = await pool.query(`SELECT "goalA","goalB" FROM "GoalAdjacency" WHERE id=$1`, [id]);
    if (r.rows[0]) await pool.query(`DELETE FROM "GoalAdjacency" WHERE ("goalA"=$1 AND "goalB"=$2) OR ("goalA"=$2 AND "goalB"=$1)`, [r.rows[0].goalA, r.rows[0].goalB]);
  } else if (type === "location") {
    const r = await pool.query(`SELECT "locationA","locationB" FROM "LocationAdjacency" WHERE id=$1`, [id]);
    if (r.rows[0]) await pool.query(`DELETE FROM "LocationAdjacency" WHERE ("locationA"=$1 AND "locationB"=$2) OR ("locationA"=$2 AND "locationB"=$1)`, [r.rows[0].locationA, r.rows[0].locationB]);
  } else if (type === "customerType") {
    const r = await pool.query(`SELECT "typeA","typeB" FROM "CustomerTypeAdjacency" WHERE id=$1`, [id]);
    if (r.rows[0]) await pool.query(`DELETE FROM "CustomerTypeAdjacency" WHERE ("typeA"=$1 AND "typeB"=$2) OR ("typeA"=$2 AND "typeB"=$1)`, [r.rows[0].typeA, r.rows[0].typeB]);
  }
  res.json({ ok: true });
});

// ─── ADMIN: Other Settings ──────────────────────────────────────────────────

router.get("/admin/matchmaking/settings", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const cfg = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key IN ('matchmaking_min_score','matchmaking_default_completion')`);
  const cfgMap: Record<string, string> = {};
  cfg.rows.forEach((r: any) => { cfgMap[r.key] = r.value; });
  res.json({
    minScore: parseInt(cfgMap["matchmaking_min_score"] ?? "0"),
    defaultCompletion: parseInt(cfgMap["matchmaking_default_completion"] ?? "70"),
  });
});

router.patch("/admin/matchmaking/settings", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { minScore, defaultCompletion } = req.body;
  if (minScore !== undefined) {
    await pool.query(
      `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid()::text,'matchmaking_min_score',$1,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$1,"updatedAt"=NOW()`,
      [String(parseInt(minScore) || 0)]
    );
  }
  if (defaultCompletion !== undefined) {
    await pool.query(
      `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid()::text,'matchmaking_default_completion',$1,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$1,"updatedAt"=NOW()`,
      [String(parseInt(defaultCompletion) || 70)]
    );
  }
  res.json({ ok: true });
});

// ─── PUBLIC (brand-accessible) Field Options + Filters ───────────────────────

router.get("/matchmaking/options", async (req: Request, res: Response): Promise<void> => {
  const field = req.query["field"] as string | undefined;
  if (!field) { res.status(400).json({ error: "field param required" }); return; }
  const r = await pool.query(
    `SELECT id, label, value FROM "MatchmakingFieldOption" WHERE field=$1 AND "isActive"=true ORDER BY "displayOrder"`,
    [field]
  );
  res.json(r.rows);
});

router.get("/matchmaking/filters", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT "filterType","isActive" FROM "MatchmakingFilter" ORDER BY "filterType"`);
  res.json(r.rows);
});

// ─── BRAND: Saved Briefs ─────────────────────────────────────────────────────

router.get("/brand/matchmaking/briefs", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const r = await pool.query(
    `SELECT id,"productCategory","productSubcategory","campaignGoal","targetGender","targetAge","targetLocation","targetCreatorGender","lastRunAt","createdAt"
     FROM "MatchmakingBrief" WHERE "brandId"=$1 AND "isSaved"=true ORDER BY "lastRunAt" DESC NULLS LAST LIMIT 10`,
    [brandId]
  );
  res.json(r.rows);
});

// ─── BRAND: Run Matchmaking ──────────────────────────────────────────────────

// Hardcoded brand-goal → creator-content-style mapping
const GOAL_MAP: Record<string, string> = {
  "Product Promotion & Reviews":       "i review or recommend products",
  "Brand Awareness & Viral Reach":     "i create entertainment or viral content",
  "Lifestyle & Everyday Integration":  "i share lifestyle content",
  "Educational & Informative Content": "i create educational or informative content",
};

// Public: distinct creator audience locations (for brand brief form)
router.get("/matchmaking/creator-locations", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT "audienceLocation" as loc FROM "Creator"
       WHERE "audienceLocation" IS NOT NULL AND "audienceLocation" <> '' AND status='ACTIVE'
       ORDER BY "audienceLocation"`
    );
    res.json(r.rows.map((row: any) => row.loc as string));
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

// Public: brief field options — age ranges, locations, creator genders (all admin-configured)
router.get("/matchmaking/brief-options", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [ageR, locR, cgR] = await Promise.all([
      pool.query(`SELECT label, value FROM "MatchmakingFieldOption" WHERE field='age' AND "isActive"=true ORDER BY "displayOrder"`),
      pool.query(`SELECT label, value FROM "MatchmakingFieldOption" WHERE field='location' AND "isActive"=true ORDER BY "displayOrder"`),
      pool.query(`SELECT label, value FROM "MatchmakingFieldOption" WHERE field='creatorGender' AND "isActive"=true ORDER BY "displayOrder"`),
    ]);
    res.json({
      ageOptions:           ageR.rows.map((r: any) => ({ label: r.label as string, value: r.value as string })),
      locationOptions:      locR.rows.map((r: any) => ({ label: r.label as string, value: r.value as string })),
      creatorGenderOptions: cgR.rows.map((r: any) => ({ label: r.label as string, value: r.value as string })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

router.post("/brand/matchmaking/run", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const {
    productCategory, productSubcategory, campaignGoal,
    targetGender, targetAge, targetLocation, targetCreatorGender = "",
    saveAsBrief = false, existingBriefId,
  } = req.body;

  if (!campaignGoal || !targetGender || !targetAge || !targetLocation) {
    res.status(400).json({ error: "Campaign Goal, Target Gender, Target Age and Target Location are required" }); return;
  }

  try {
    let briefId: string;
    if (existingBriefId) {
      await pool.query(
        `UPDATE "MatchmakingBrief" SET "productCategory"=$1,"productSubcategory"=$2,"campaignGoal"=$3,"priceTier"=$4,"purchaseType"=$5,"customerType"=$6,"targetGender"=$7,"targetAge"=$8,"targetLocation"=$9,"targetCreatorGender"=$10,"lastRunAt"=NOW(),"isSaved"=CASE WHEN $11 THEN true ELSE "isSaved" END WHERE id=$12 AND "brandId"=$13`,
        [productCategory ?? null, productSubcategory ?? null, campaignGoal, "", "", "", targetGender, targetAge, targetLocation, targetCreatorGender, saveAsBrief, existingBriefId, brandId]
      );
      briefId = existingBriefId;
    } else {
      const br = await pool.query(
        `INSERT INTO "MatchmakingBrief" (id,"brandId","productCategory","productSubcategory","campaignGoal","priceTier","purchaseType","customerType","targetGender","targetAge","targetLocation","targetCreatorGender","isSaved","lastRunAt","createdAt")
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()) RETURNING id`,
        [brandId, productCategory ?? null, productSubcategory ?? null, campaignGoal, "", "", "", targetGender, targetAge, targetLocation, targetCreatorGender, !!saveAsBrief]
      );
      briefId = br.rows[0].id as string;
    }

    // Fetch scoring weights
    const swRows = await pool.query(`SELECT parameter,"fullMatchPts","partialMatchPts","noMatchPts","relatedPts" FROM "ScoringWeight"`);
    const weights: Record<string, Weight> = {};
    for (const r of swRows.rows) {
      weights[r.parameter] = { fullMatchPts: r.fullMatchPts, partialMatchPts: r.partialMatchPts, noMatchPts: r.noMatchPts, relatedPts: r.relatedPts ?? 0 };
    }
    const W = (p: string): Weight => weights[p] ?? { fullMatchPts: 10, partialMatchPts: 5, noMatchPts: 1, relatedPts: 5 };

    // Fetch category adjacencies by name (for matching against brand productCategory name and creator category names)
    const catAdj = await pool.query(
      `SELECT c1.name as "nameA", c2.name as "nameB"
       FROM "CategoryAdjacency" ca
       JOIN "Category" c1 ON c1.id=ca."categoryA"
       JOIN "Category" c2 ON c2.id=ca."categoryB"`
    );
    const catAdjSet = new Set(catAdj.rows.flatMap((r: any) => [
      `${(r.nameA as string).toLowerCase()}|${(r.nameB as string).toLowerCase()}`,
      `${(r.nameB as string).toLowerCase()}|${(r.nameA as string).toLowerCase()}`,
    ]));

    // Fetch platform config
    const cfg = await pool.query(`SELECT key,value FROM "PlatformConfig" WHERE key IN ('matchmaking_min_score','matchmaking_default_completion','gender_majority_threshold')`);
    const cfgMap: Record<string, number> = {};
    for (const r of cfg.rows) cfgMap[r.key] = parseInt(r.value);
    const minScore = cfgMap["matchmaking_min_score"] ?? 0;
    const defaultCompletion = cfgMap["matchmaking_default_completion"] ?? 70;
    const genderMajThreshold = cfgMap["gender_majority_threshold"] ?? 55;

    // Exclude creators who completed deals with this brand
    const doneDeals = await pool.query(
      `SELECT DISTINCT "creatorId" FROM "Deal" WHERE "brandId"=$1 AND status='COMPLETED'`,
      [brandId]
    );
    const excludedCreators = new Set(doneDeals.rows.map((r: any) => r.creatorId as string));

    // Fetch all unlock records for this brand
    const unlockRows = await pool.query(`SELECT "creatorId" FROM "BrandUnlockRecord" WHERE "brandId"=$1`, [brandId]);
    const unlockedSet = new Set(unlockRows.rows.map((r: any) => r.creatorId as string));

    // Fetch eligible creators with categories
    const creatorsRes = await pool.query(
      `SELECT c.id, c."followerCount", c."audienceGenderFemale", c."audienceGenderMale",
              c."audienceAge", c."audienceLocation", c."contentType", c.gender,
              c."campaignGoal", c."purchaseBehaviour",
              c."reelPriceMin", c."reelPriceMax", c."storyPriceMin", c."storyPriceMax",
              c."postPriceMin", c."postPriceMax", c."averageRating", c."ratingCount",
              c."createdAt", c."profilePhotoUrl", c."images",
              EXTRACT(YEAR FROM AGE(NOW(), c."dateOfBirth"))::int as "creatorAge",
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('id', cat.id, 'name', cat.name, 'subcategoryId', cc."subcategoryId"))
                FILTER (WHERE cat.id IS NOT NULL), '[]'
              ) as categories
       FROM "Creator" c
       LEFT JOIN "CreatorCategory" cc ON cc."creatorId"=c.id
       LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
       WHERE c.status='ACTIVE' AND c."excludedFromMatchmaking"=false
       GROUP BY c.id
       LIMIT 1000`
    );

    interface BreakdownItem { param: string; label: string; pts: number; maxPts: number; reason: string; }
    interface ScoredCreator {
      creatorId: string; totalScore: number; rank: number;
      followerCount: number;
      audienceGenderFemale: number | null; audienceGenderMale: number | null;
      audienceAge: string | null; audienceLocation: string | null;
      reelPriceMin: number | null; reelPriceMax: number | null;
      storyPriceMin: number | null; storyPriceMax: number | null;
      postPriceMin: number | null; postPriceMax: number | null;
      averageRating: number | null; ratingCount: number;
      isUnlocked: boolean; categories: Array<{ id: string; name: string }>;
      profilePhotoUrl: string | null; images: string[];
      completionRate: number; createdAt: string | null;
      creatorAge: number | null;
      scoreBreakdown: BreakdownItem[];
    }

    const scored: ScoredCreator[] = [];

    for (const c of creatorsRes.rows) {
      if (excludedCreators.has(c.id)) continue;

      const breakdown: BreakdownItem[] = [];

      // ── 1. CATEGORY
      const wCat = W("category");
      let catScore = wCat.fullMatchPts;
      let catReason = "No category filter";
      const cats: Array<{ id: string; name: string; subcategoryId: string | null }> = c.categories ?? [];
      if (productCategory) {
        catScore = wCat.noMatchPts;
        catReason = "No category match";
        for (const cat of cats) {
          if (cat.name?.toLowerCase() === productCategory.toLowerCase()) {
            catScore = wCat.fullMatchPts; catReason = `Exact category match (${cat.name})`; break;
          } else if (catAdjSet.has(`${productCategory.toLowerCase()}|${cat.name.toLowerCase()}`) || catAdjSet.has(`${cat.name.toLowerCase()}|${productCategory.toLowerCase()}`)) {
            if (catScore < wCat.relatedPts) {
              catScore = wCat.relatedPts; catReason = `Related category (${cat.name})`;
            }
          }
        }
      }
      breakdown.push({ param: "category", label: "Category", pts: catScore, maxPts: wCat.fullMatchPts, reason: catReason });

      // ── 2. CAMPAIGN GOAL (full / no — hardcoded content-style mapping)
      const wGoal = W("goal");
      const expectedCreatorGoal = GOAL_MAP[campaignGoal]?.toLowerCase() ?? "";
      const creatorGoalRaw = (c.campaignGoal ?? "").toLowerCase();
      let goalScore: number; let goalReason: string;
      if (!expectedCreatorGoal) { goalScore = wGoal.noMatchPts; goalReason = "Unknown brand goal"; }
      else if (!creatorGoalRaw) { goalScore = wGoal.noMatchPts; goalReason = "No creator goal data"; }
      else if (creatorGoalRaw === expectedCreatorGoal) { goalScore = wGoal.fullMatchPts; goalReason = `Goal match (${c.campaignGoal})`; }
      else { goalScore = wGoal.noMatchPts; goalReason = `Goal mismatch (${c.campaignGoal ?? "none"})`; }
      breakdown.push({ param: "goal", label: "Campaign Goal", pts: goalScore, maxPts: wGoal.fullMatchPts, reason: goalReason });

      // ── 3. GENDER (full / no — majority threshold, no partial)
      const wGender = W("gender");
      const female = c.audienceGenderFemale ?? null;
      const male = c.audienceGenderMale ?? null;
      const g = (targetGender as string).toLowerCase();
      let genderScore: number; let genderReason: string;
      if (g.includes("mixed")) {
        genderScore = wGender.fullMatchPts; genderReason = "Brand targets mixed audience";
      } else if (female === null) {
        genderScore = wGender.noMatchPts; genderReason = "No gender data";
      } else if (g.includes("female")) {
        genderScore = female >= genderMajThreshold ? wGender.fullMatchPts : wGender.noMatchPts;
        genderReason = `${female}% female — ${female >= genderMajThreshold ? "majority match" : "below threshold"}`;
      } else {
        const m = male ?? (100 - (female ?? 50));
        genderScore = m >= genderMajThreshold ? wGender.fullMatchPts : wGender.noMatchPts;
        genderReason = `${m}% male — ${m >= genderMajThreshold ? "majority match" : "below threshold"}`;
      }
      breakdown.push({ param: "gender", label: "Customer Gender", pts: genderScore, maxPts: wGender.fullMatchPts, reason: genderReason });

      // ── 4. AGE (full / no — exact bracket only, no adjacent partial)
      const wAge = W("age");
      const targetBracket = ageBracket(targetAge);
      const creatorBracket = ageBracket(c.audienceAge);
      let ageScore: number; let ageReason: string;
      if (creatorBracket === -1) {
        ageScore = wAge.noMatchPts; ageReason = "No audience age data";
      } else if (targetBracket === creatorBracket) {
        ageScore = wAge.fullMatchPts; ageReason = `Exact age match (${c.audienceAge})`;
      } else {
        ageScore = wAge.noMatchPts; ageReason = `Age mismatch (${c.audienceAge})`;
      }
      breakdown.push({ param: "age", label: "Customer Age", pts: ageScore, maxPts: wAge.fullMatchPts, reason: ageReason });

      // ── 5. LOCATION (full / no — exact match only, no adjacency)
      const wLoc = W("location");
      let locScore: number; let locReason: string;
      if (!c.audienceLocation) {
        locScore = wLoc.noMatchPts; locReason = "No location data";
      } else if (c.audienceLocation.toLowerCase() === (targetLocation as string).toLowerCase()) {
        locScore = wLoc.fullMatchPts; locReason = `Exact location match (${c.audienceLocation})`;
      } else {
        locScore = wLoc.noMatchPts; locReason = `Location mismatch (${c.audienceLocation})`;
      }
      breakdown.push({ param: "location", label: "Audience Location", pts: locScore, maxPts: wLoc.fullMatchPts, reason: locReason });

      // ── 6. CREATOR GENDER (full / no — exact match against creator's personal gender)
      const wCGender = W("creatorGender");
      let cgScore: number; let cgReason: string;
      if (!targetCreatorGender) {
        cgScore = wCGender.fullMatchPts; cgReason = "No creator gender filter";
      } else if (!c.gender) {
        cgScore = wCGender.noMatchPts; cgReason = "Creator has no gender data";
      } else if (c.gender.toLowerCase() === (targetCreatorGender as string).toLowerCase()) {
        cgScore = wCGender.fullMatchPts; cgReason = `Creator gender match (${c.gender})`;
      } else {
        cgScore = wCGender.noMatchPts; cgReason = `Creator gender mismatch (${c.gender})`;
      }
      breakdown.push({ param: "creatorGender", label: "Creator Gender", pts: cgScore, maxPts: wCGender.fullMatchPts, reason: cgReason });

      const totalScore = breakdown.reduce((s, b) => s + b.pts, 0);
      if (totalScore < minScore) continue;

      scored.push({
        creatorId: c.id, totalScore, rank: 0,
        followerCount: c.followerCount,
        audienceGenderFemale: c.audienceGenderFemale, audienceGenderMale: c.audienceGenderMale,
        audienceAge: c.audienceAge, audienceLocation: c.audienceLocation,
        reelPriceMin: c.reelPriceMin ? parseFloat(c.reelPriceMin) : null,
        reelPriceMax: c.reelPriceMax ? parseFloat(c.reelPriceMax) : null,
        storyPriceMin: c.storyPriceMin ? parseFloat(c.storyPriceMin) : null,
        storyPriceMax: c.storyPriceMax ? parseFloat(c.storyPriceMax) : null,
        postPriceMin: c.postPriceMin ? parseFloat(c.postPriceMin) : null,
        postPriceMax: c.postPriceMax ? parseFloat(c.postPriceMax) : null,
        averageRating: c.averageRating ? parseFloat(c.averageRating) : null,
        ratingCount: c.ratingCount ?? 0,
        isUnlocked: unlockedSet.has(c.id),
        categories: cats.map(ca => ({ id: ca.id, name: ca.name })).filter(ca => ca.id),
        profilePhotoUrl: c.profilePhotoUrl ?? null,
        images: Array.isArray(c.images) ? c.images : [],
        completionRate: defaultCompletion,
        createdAt: c.createdAt ?? null,
        creatorAge: c.creatorAge ?? null,
        scoreBreakdown: breakdown,
      });
    }

    // Sort: score DESC, then followerCount DESC, then createdAt ASC
    scored.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
      if (b.followerCount !== a.followerCount) return b.followerCount - a.followerCount;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });

    // Assign ranks
    let rank = 1;
    for (let i = 0; i < scored.length; i++) {
      if (i > 0 && scored[i].totalScore < scored[i - 1].totalScore) rank = i + 1;
      scored[i].rank = rank;
    }

    const results = scored.map(({ completionRate: _, createdAt: __, ...rest }) => rest);
    res.json({ results, totalCreators: results.length, briefId });
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e?.message ?? "Server error. Please try again." });
  }
});

// ─── ADMIN: Match Preview ────────────────────────────────────────────────────

router.post("/admin/matchmaking/preview", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { brand, creator } = req.body as {
    brand: Record<string, string | number | undefined>;
    creator: { campaignGoal?: string; audienceLocation?: string; audienceAge?: string; audienceGenderFemale?: number; audienceGenderMale?: number; categories?: string[] };
  };
  if (!brand || !creator) { res.status(400).json({ error: "brand and creator required" }); return; }
  try {
    const swRows = await pool.query(`SELECT parameter,"fullMatchPts","partialMatchPts","noMatchPts","relatedPts" FROM "ScoringWeight"`);
    const weights: Record<string, Weight> = {};
    for (const r of swRows.rows) weights[r.parameter] = { fullMatchPts: r.fullMatchPts, partialMatchPts: r.partialMatchPts, noMatchPts: r.noMatchPts, relatedPts: r.relatedPts ?? 0 };
    const W = (p: string): Weight => weights[p] ?? { fullMatchPts: 10, partialMatchPts: 5, noMatchPts: 1, relatedPts: 5 };

    const catAdj = await pool.query(
      `SELECT c1.name as "nameA", c2.name as "nameB"
       FROM "CategoryAdjacency" ca
       JOIN "Category" c1 ON c1.id=ca."categoryA"
       JOIN "Category" c2 ON c2.id=ca."categoryB"`
    );
    const catAdjSet = new Set(catAdj.rows.flatMap((r: any) => [
      `${(r.nameA as string).toLowerCase()}|${(r.nameB as string).toLowerCase()}`,
      `${(r.nameB as string).toLowerCase()}|${(r.nameA as string).toLowerCase()}`,
    ]));
    const cfg = await pool.query(`SELECT key,value FROM "PlatformConfig" WHERE key IN ('gender_majority_threshold')`);
    const cfgMap: Record<string, number> = {}; for (const r of cfg.rows) cfgMap[r.key] = parseInt(r.value);
    const genderMajThreshold = cfgMap["gender_majority_threshold"] ?? 55;

    const breakdown: Array<{ param: string; label: string; pts: number; maxPts: number; reason: string }> = [];
    const bs = (key: string): string => { const v = brand[key]; return typeof v === "string" ? v : (v !== undefined ? String(v) : ""); };

    // 1. Category (full / related via adjacency / no)
    const wCat = W("category"); let catScore = wCat.fullMatchPts; let catReason = "No category filter";
    const brandProductCategory = bs("productCategory");
    if (brandProductCategory) {
      catScore = wCat.noMatchPts; catReason = "No category match";
      for (const cat of creator.categories ?? []) {
        if (cat.toLowerCase() === brandProductCategory.toLowerCase()) { catScore = wCat.fullMatchPts; catReason = `Exact category match (${cat})`; break; }
        if (catAdjSet.has(`${brandProductCategory.toLowerCase()}|${cat.toLowerCase()}`) || catAdjSet.has(`${cat.toLowerCase()}|${brandProductCategory.toLowerCase()}`)) {
          if (catScore < (wCat.relatedPts ?? 0)) { catScore = wCat.relatedPts ?? 0; catReason = `Related category (${cat})`; }
        }
      }
    }
    breakdown.push({ param: "category", label: "Category", pts: catScore, maxPts: wCat.fullMatchPts, reason: catReason });

    // 2. Campaign Goal (full / no — hardcoded mapping)
    const wGoal = W("goal");
    const brandGoal = bs("campaignGoal");
    const expectedCreatorGoal = GOAL_MAP[brandGoal]?.toLowerCase() ?? "";
    const creatorGoalRaw = (creator.campaignGoal ?? "").toLowerCase();
    let goalScore: number; let goalReason: string;
    if (!expectedCreatorGoal) { goalScore = wGoal.noMatchPts; goalReason = "Unknown brand goal"; }
    else if (!creatorGoalRaw) { goalScore = wGoal.noMatchPts; goalReason = "No creator goal data"; }
    else if (creatorGoalRaw === expectedCreatorGoal) { goalScore = wGoal.fullMatchPts; goalReason = `Goal match (${creator.campaignGoal})`; }
    else { goalScore = wGoal.noMatchPts; goalReason = `Goal mismatch (${creator.campaignGoal ?? "none"})`; }
    breakdown.push({ param: "goal", label: "Campaign Goal", pts: goalScore, maxPts: wGoal.fullMatchPts, reason: goalReason });

    // 3. Gender (full / no — majority threshold)
    const brandTargetGender = bs("targetGender");
    const wGender = W("gender"); const female = creator.audienceGenderFemale ?? null; const male = creator.audienceGenderMale ?? null;
    const g = brandTargetGender.toLowerCase(); let genderScore: number; let genderReason: string;
    if (!brandTargetGender) { genderScore = wGender.noMatchPts; genderReason = "No gender specified"; }
    else if (g.includes("mixed")) { genderScore = wGender.fullMatchPts; genderReason = "Brand targets mixed audience"; }
    else if (female === null) { genderScore = wGender.noMatchPts; genderReason = "No gender data"; }
    else if (g.includes("female")) {
      genderScore = female >= genderMajThreshold ? wGender.fullMatchPts : wGender.noMatchPts;
      genderReason = `${female}% female — ${female >= genderMajThreshold ? "majority match" : "below threshold"}`;
    } else {
      const m = male ?? (100 - (female ?? 50));
      genderScore = m >= genderMajThreshold ? wGender.fullMatchPts : wGender.noMatchPts;
      genderReason = `${m}% male — ${m >= genderMajThreshold ? "majority match" : "below threshold"}`;
    }
    breakdown.push({ param: "gender", label: "Target Gender", pts: genderScore, maxPts: wGender.fullMatchPts, reason: genderReason });

    // 4. Age (full / no — exact bracket only)
    const brandTargetAge = bs("targetAge");
    const wAge = W("age"); const targetBracket = ageBracket(brandTargetAge || null); const creatorBracket = ageBracket(creator.audienceAge ?? null);
    let ageScore: number; let ageReason: string;
    if (!brandTargetAge || creatorBracket === -1) { ageScore = wAge.noMatchPts; ageReason = creatorBracket === -1 ? "No audience age data" : "No target age"; }
    else if (targetBracket === creatorBracket) { ageScore = wAge.fullMatchPts; ageReason = `Exact age match (${creator.audienceAge})`; }
    else { ageScore = wAge.noMatchPts; ageReason = `Age mismatch (${creator.audienceAge})`; }
    breakdown.push({ param: "age", label: "Target Age", pts: ageScore, maxPts: wAge.fullMatchPts, reason: ageReason });

    // 5. Location (full / no — exact match only)
    const brandTargetLocation = bs("targetLocation");
    const wLoc = W("location"); let locScore: number; let locReason: string;
    if (!creator.audienceLocation || !brandTargetLocation) { locScore = wLoc.noMatchPts; locReason = "No location data"; }
    else if (creator.audienceLocation.toLowerCase() === brandTargetLocation.toLowerCase()) { locScore = wLoc.fullMatchPts; locReason = `Exact match (${creator.audienceLocation})`; }
    else { locScore = wLoc.noMatchPts; locReason = `Location mismatch (${creator.audienceLocation})`; }
    breakdown.push({ param: "location", label: "Audience Location", pts: locScore, maxPts: wLoc.fullMatchPts, reason: locReason });

    const totalScore = breakdown.reduce((s, b) => s + b.pts, 0);
    const maxTotal = breakdown.reduce((s, b) => s + b.maxPts, 0);
    res.json({ totalScore, maxTotal, percentage: maxTotal > 0 ? Math.round((totalScore / maxTotal) * 100) : 0, breakdown });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
