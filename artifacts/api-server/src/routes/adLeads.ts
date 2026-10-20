import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireCreator } from "../middleware/requireCreator";

/* Ad leads (Advertisement lead-capture). Creators submit a "get more details"
   form on each Explore Brands ad; admins read them in the Form Details tab.
   Raw SQL against the "AdLead" table from migrations/003_ad_leads.sql.

   Every query is wrapped so that if the migration hasn't been run yet (missing
   table/column) the API degrades gracefully — reads return empty, writes report
   a clean error — and NEVER crashes Explore Brands or any admin page. */

const router: IRouter = Router();

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Postgres "undefined_table" / "undefined_column" — migration not applied yet.
const missingSchema = (e: any) => e?.code === "42P01" || e?.code === "42703";

// brandName may not exist pre-migration; to_jsonb(row)->>'brandName' returns NULL
// then instead of erroring. Falls back to the ad headline when blank.
const BRAND = `COALESCE(NULLIF(to_jsonb(a)->>'brandName', ''), a.headline)`;

// ── Creator: submit / update a lead for an ad (upsert by adId+creatorId) ────
router.post("/ads/:adId/lead", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const adId = str(req.params["adId"]);
  const name = str(req.body?.name);
  const contact = str(req.body?.contact);
  const email = str(req.body?.email);
  if (!adId) { res.status(400).json({ error: "Missing ad" }); return; }
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  if (!contact) { res.status(400).json({ error: "Contact number is required" }); return; }
  if (!email || !EMAIL_RE.test(email)) { res.status(400).json({ error: "A valid email is required" }); return; }
  try {
    await pool.query(
      `INSERT INTO "AdLead" ("adId","creatorId",name,contact,email)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("adId","creatorId") WHERE "creatorId" IS NOT NULL
       DO UPDATE SET name=EXCLUDED.name, contact=EXCLUDED.contact, email=EXCLUDED.email,
                     "isRead"=false, "updatedAt"=NOW()`,
      [adId, creatorId, name, contact, email],
    );
    res.json({ ok: true });
  } catch (e: any) {
    if (missingSchema(e)) { res.status(503).json({ error: "Lead capture is not available yet." }); return; }
    req.log?.error?.({ err: e }, "Ad lead submit failed");
    res.status(500).json({ error: "Could not submit — please try again." });
  }
});

// ── Admin: ads that have ≥1 lead, unread-first ──────────────────────────────
router.get("/admin/ad-leads", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(
      `SELECT a.id AS "adId",
              ${BRAND} AS "brandName",
              a."imageUrl",
              COUNT(l.*)::int AS total,
              COUNT(l.*) FILTER (WHERE NOT l."isRead")::int AS unread,
              MAX(l."createdAt") AS "lastAt"
         FROM "Advertisement" a
         JOIN "AdLead" l ON l."adId" = a.id
        GROUP BY a.id
        ORDER BY unread DESC, "lastAt" DESC`,
    );
    res.json(r.rows);
  } catch (e: any) {
    if (missingSchema(e)) { res.json([]); return; }   // migration not run → no leads
    throw e;
  }
});

// ── Admin: leads for one ad, newest first ───────────────────────────────────
router.get("/admin/ad-leads/:adId", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adId = str(req.params["adId"]);
  try {
    const brand = await pool.query(`SELECT ${BRAND} AS "brandName" FROM "Advertisement" a WHERE a.id=$1`, [adId]);
    const leads = await pool.query(
      `SELECT id, name, email, contact, "createdAt"
         FROM "AdLead" WHERE "adId"=$1 ORDER BY "createdAt" DESC`,
      [adId],
    );
    res.json({ brandName: brand.rows[0]?.brandName ?? null, leads: leads.rows });
  } catch (e: any) {
    if (missingSchema(e)) { res.json({ brandName: null, leads: [] }); return; }
    throw e;
  }
});

// ── Admin: mark all of an ad's leads read ───────────────────────────────────
router.post("/admin/ad-leads/:adId/mark-read", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adId = str(req.params["adId"]);
  try {
    await pool.query(`UPDATE "AdLead" SET "isRead"=true, "updatedAt"=NOW() WHERE "adId"=$1 AND NOT "isRead"`, [adId]);
    res.json({ ok: true });
  } catch (e: any) {
    if (missingSchema(e)) { res.json({ ok: true }); return; }
    throw e;
  }
});

export default router;
