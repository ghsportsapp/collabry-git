import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { activateAllCreditHoldCampaigns } from "../lib/creditHoldActivation";
import { createPopup } from "../lib/popups";
import { createNotification } from "../lib/notifications";
import { randomUUID } from "crypto";
import { uploadPrivate } from "../lib/storage";

const router: IRouter = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────
async function getConfig(key: string, defaultVal: string): Promise<string> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [key]);
  return r.rows[0]?.value ?? defaultVal;
}

async function setConfig(key: string, value: string) {
  await pool.query(
    `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
    [key, value]
  );
}

// ─── Audience Field Config ────────────────────────────────────────────────────
// Returns { id, fieldKey, label, isVisible }

router.get("/admin/audience-fields", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, "fieldName" AS "fieldKey", COALESCE(label, "fieldName") AS label, "isVisible", "isRequired" FROM "AudienceFieldConfig" ORDER BY label`
  );
  res.json(r.rows);
});

router.patch("/admin/audience-fields/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { isVisible, isRequired } = req.body as { isVisible?: boolean; isRequired?: boolean };
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof isVisible === "boolean") { sets.push(`"isVisible"=$${vals.length + 1}`); vals.push(isVisible); }
  if (typeof isRequired === "boolean") { sets.push(`"isRequired"=$${vals.length + 1}`); vals.push(isRequired); }
  if (sets.length === 0) { res.status(400).json({ error: "isVisible or isRequired required" }); return; }
  vals.push(id);
  await pool.query(`UPDATE "AudienceFieldConfig" SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
});

// Legacy signup-config endpoint (audience field required-ness for creator signup)
router.get("/admin/signup-config/audience-fields", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT "fieldName", "isRequired" FROM "AudienceFieldConfig" ORDER BY label`);
  res.json(r.rows);
});

router.patch("/admin/signup-config/audience-fields", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { field, isRequired } = req.body as { field: string; isRequired: boolean };
  if (!field) { res.status(400).json({ error: "field required" }); return; }
  await pool.query(
    `INSERT INTO "AudienceFieldConfig" (id,"fieldName","isRequired","isVisible","updatedAt") VALUES (gen_random_uuid(),$1,$2,true,NOW()) ON CONFLICT ("fieldName") DO UPDATE SET "isRequired"=$2,"updatedAt"=NOW()`,
    [field, !!isRequired]
  );
  res.json({ ok: true });
});

// Public endpoint (creator signup reads this)
router.get("/signup-config/audience-fields", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT "fieldName", "isRequired" FROM "AudienceFieldConfig" ORDER BY label`);
  res.json(r.rows);
});

// ─── Partial Profile Visibility ───────────────────────────────────────────────
// Returns { id, fieldKey, label, isVisible }

router.get("/admin/partial-profile-visibility", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, "fieldName" AS "fieldKey", COALESCE(label, "fieldName") AS label, "isVisible" FROM "PartialProfileVisibility" ORDER BY label`
  );
  res.json(r.rows);
});

router.patch("/admin/partial-profile-visibility/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { isVisible } = req.body as { isVisible: boolean };
  if (typeof isVisible !== "boolean") { res.status(400).json({ error: "isVisible (boolean) required" }); return; }
  const vis = isVisible ? "SHOW" : "HIDE";
  await pool.query(`UPDATE "PartialProfileVisibility" SET "isVisible"=$1, visibility=$2, "updatedAt"=NOW() WHERE id=$3`, [isVisible, vis, id]);
  res.json({ ok: true });
});

// Public endpoint (brand search reads this)
router.get("/partial-profile-visibility", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT "fieldName" AS "fieldKey", COALESCE(label, "fieldName") AS label, "isVisible", visibility FROM "PartialProfileVisibility" ORDER BY label`
  );
  res.json(r.rows);
});

// ─── Deal Settings ────────────────────────────────────────────────────────────

const DEAL_KEYS = ["min_timeline_days", "timeline_description_text", "max_deal_finalize_days", "require_courier_awb", "max_script_brief_chars", "max_revision_brief_chars"];

router.get("/admin/deal-settings", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`, [DEAL_KEYS]);
  const settings: Record<string, string> = {};
  for (const row of r.rows) settings[row.key] = row.value;
  settings.min_timeline_days = settings.min_timeline_days ?? "14";
  settings.timeline_description_text = settings.timeline_description_text ?? "Allow enough time for the creator to plan, film, and deliver quality content.";
  settings.max_deal_finalize_days = settings.max_deal_finalize_days ?? "2";
  settings.require_courier_awb = settings.require_courier_awb ?? "false";
  settings.max_script_brief_chars = settings.max_script_brief_chars ?? "2000";
  settings.max_revision_brief_chars = settings.max_revision_brief_chars ?? "2000";
  res.json(settings);
});

router.patch("/admin/deal-settings", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { key, value } = req.body as { key: string; value: string };
  if (!DEAL_KEYS.includes(key)) { res.status(400).json({ error: "Invalid key" }); return; }
  await setConfig(key, String(value));
  res.json({ ok: true });
});

// ─── Product Shipping Settings ────────────────────────────────────────────────

const SHIPPING_KEYS = [
  "max_product_delivery_days",
  "delivery_warning_day",
  "max_delivery_extensions",
  "product_issue_brand_response_hours",
  "awb_correction_limit",
  "non_delivery_brand_refund_percent",
  "non_delivery_creator_percent",
  "non_delivery_collabry_percent",
  "fake_awb_brand_refund_percent",
  "fake_awb_creator_percent",
  "fake_awb_collabry_percent",
  "dispute_valid_brand_refund_percent",
  "product_issue_image_retention_days",
];

const SHIPPING_DEFAULTS: Record<string, string> = {
  max_product_delivery_days: "10",
  delivery_warning_day: "8",
  max_delivery_extensions: "2",
  product_issue_brand_response_hours: "48",
  awb_correction_limit: "2",
  non_delivery_brand_refund_percent: "50",
  non_delivery_creator_percent: "20",
  non_delivery_collabry_percent: "30",
  fake_awb_brand_refund_percent: "70",
  fake_awb_creator_percent: "20",
  fake_awb_collabry_percent: "10",
  dispute_valid_brand_refund_percent: "50",
  product_issue_image_retention_days: "7",
};

router.get("/admin/shipping-settings", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`, [SHIPPING_KEYS]);
  const settings: Record<string, string> = { ...SHIPPING_DEFAULTS };
  for (const row of r.rows) settings[row.key] = row.value;
  res.json(settings);
});

router.patch("/admin/shipping-settings", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { key, value } = req.body as { key: string; value: string };
  if (!SHIPPING_KEYS.includes(key)) { res.status(400).json({ error: "Invalid shipping config key" }); return; }
  // Light validation: numeric & sensible bounds
  const v = String(value ?? "").trim();
  if (!v) { res.status(400).json({ error: "Value required" }); return; }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) { res.status(400).json({ error: "Value must be a non-negative number" }); return; }
  if (key.endsWith("_percent") && n > 100) { res.status(400).json({ error: "Percent must be 0–100" }); return; }
  // Validate split totals stay at 100
  if (["non_delivery_brand_refund_percent", "non_delivery_creator_percent", "non_delivery_collabry_percent"].includes(key)) {
    const cur = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`,
      [["non_delivery_brand_refund_percent", "non_delivery_creator_percent", "non_delivery_collabry_percent"]]);
    const map: Record<string, number> = {};
    for (const r of cur.rows) map[r.key] = Number(r.value);
    map[key] = n;
    const total = (map.non_delivery_brand_refund_percent ?? 0) + (map.non_delivery_creator_percent ?? 0) + (map.non_delivery_collabry_percent ?? 0);
    if (total !== 100) { res.status(400).json({ error: `Non-delivery splits must total 100% (got ${total}).` }); return; }
  }
  if (["fake_awb_brand_refund_percent", "fake_awb_creator_percent", "fake_awb_collabry_percent"].includes(key)) {
    const cur = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`,
      [["fake_awb_brand_refund_percent", "fake_awb_creator_percent", "fake_awb_collabry_percent"]]);
    const map: Record<string, number> = {};
    for (const r of cur.rows) map[r.key] = Number(r.value);
    map[key] = n;
    const total = (map.fake_awb_brand_refund_percent ?? 0) + (map.fake_awb_creator_percent ?? 0) + (map.fake_awb_collabry_percent ?? 0);
    if (total !== 100) { res.status(400).json({ error: `Fake-AWB splits must total 100% (got ${total}).` }); return; }
  }
  if (key === "delivery_warning_day") {
    const maxR = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='max_product_delivery_days'`);
    const max = Number(maxR.rows[0]?.value ?? 10);
    if (n >= max) { res.status(400).json({ error: `Warning day must be less than max delivery days (${max}).` }); return; }
  }
  await setConfig(key, v);
  res.json({ ok: true });
});

// ─── Commission Rate ──────────────────────────────────────────────────────────

router.get("/admin/commission-rate", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='commission_rate'`);
  const rate = parseFloat(r.rows[0]?.value ?? "5");
  res.json({ rate: isNaN(rate) ? 5 : rate });
});

router.patch("/admin/commission-rate", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { rate } = req.body as { rate: number };
  const n = parseFloat(String(rate));
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    res.status(400).json({ error: "Rate must be a number between 0 and 100" });
    return;
  }
  await setConfig("commission_rate", n.toFixed(2));
  res.json({ ok: true, rate: n });
});

// ─── GST Rate ─────────────────────────────────────────────────────────────────

router.get("/admin/gst-rate", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='gst_rate'`);
  const rate = parseFloat(r.rows[0]?.value ?? "18");
  res.json({ rate: isNaN(rate) ? 18 : rate });
});

router.patch("/admin/gst-rate", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { rate } = req.body as { rate: number };
  const n = parseFloat(String(rate));
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    res.status(400).json({ error: "Rate must be a number between 0 and 100" });
    return;
  }
  await setConfig("gst_rate", n.toFixed(2));
  res.json({ ok: true, rate: n });
});

// Public endpoints for forms
router.get("/platform-config/deal", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`, [[...DEAL_KEYS, "commission_rate", "gst_rate"]]);
  const settings: Record<string, string> = {};
  for (const row of r.rows) settings[row.key] = row.value;
  settings.min_timeline_days = settings.min_timeline_days ?? "14";
  settings.timeline_description_text = settings.timeline_description_text ?? "Allow enough time for the creator to plan, film, and deliver quality content.";
  settings.max_deal_finalize_days = settings.max_deal_finalize_days ?? "2";
  settings.require_courier_awb = settings.require_courier_awb ?? "false";
  settings.max_script_brief_chars = settings.max_script_brief_chars ?? "2000";
  settings.max_revision_brief_chars = settings.max_revision_brief_chars ?? "2000";
  settings.commission_rate = settings.commission_rate ?? "5";
  settings.gst_rate = settings.gst_rate ?? "18";
  res.json(settings);
});

// ─── Campaign Settings ────────────────────────────────────────────────────────

const CAMPAIGN_KEYS = [
  "min_campaign_days", "max_campaign_days", "default_campaign_days",
  "min_campaign_price", "max_campaign_slots", "campaign_credits_cost",
  "campaign_approval_required",
  "min_barter_days", "max_barter_days", "barter_credits_cost",
  "min_barter_product_value", "max_barter_slots",
];

const CAMPAIGN_DEFAULTS: Record<string, string> = {
  min_campaign_days: "1", max_campaign_days: "30", default_campaign_days: "5",
  min_campaign_price: "100", max_campaign_slots: "50", campaign_credits_cost: "0",
  campaign_approval_required: "false",
  min_barter_days: "7", max_barter_days: "60", barter_credits_cost: "10",
  min_barter_product_value: "0", max_barter_slots: "20",
};

router.get("/admin/campaign-settings", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`, [CAMPAIGN_KEYS]);
  const settings: Record<string, string> = { ...CAMPAIGN_DEFAULTS };
  for (const row of r.rows) settings[row.key] = row.value;
  res.json(settings);
});

router.patch("/admin/campaign-settings", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const updates = req.body as Record<string, string>;
  const CREDIT_COST_KEYS = ["campaign_credits_cost", "barter_credits_cost"];
  let creditCostChanged = false;
  for (const key of Object.keys(updates)) {
    if (!CAMPAIGN_KEYS.includes(key)) continue;
    await setConfig(key, String(updates[key]));
    if (CREDIT_COST_KEYS.includes(key)) creditCostChanged = true;
  }
  res.json({ ok: true });
  if (creditCostChanged) activateAllCreditHoldCampaigns().catch(() => {});
});

// Public endpoint
router.get("/platform-config/campaigns", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT key, value FROM "PlatformConfig" WHERE key = ANY($1::text[])`, [CAMPAIGN_KEYS]);
  const settings: Record<string, string> = { ...CAMPAIGN_DEFAULTS };
  for (const row of r.rows) settings[row.key] = row.value;
  res.json(settings);
});

// ─── KYC Fields Config ────────────────────────────────────────────────────────

router.get("/admin/kyc-fields", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT * FROM "KYCField" ORDER BY "displayOrder", "createdAt"`);
  res.json(r.rows);
});

router.delete("/admin/kyc-fields/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  await pool.query(`DELETE FROM "KYCField" WHERE id=$1`, [id]);
  res.json({ ok: true });
});

router.post("/admin/kyc-fields", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { label, fieldType = "TEXT", isRequired = true } = req.body as { label: string; fieldType?: string; isRequired?: boolean };
  if (!label?.trim()) { res.status(400).json({ error: "label required" }); return; }
  const countR = await pool.query(`SELECT COUNT(*) FROM "KYCField" WHERE "isActive"=true`);
  const order = parseInt(countR.rows[0].count) + 1;
  const r = await pool.query(
    `INSERT INTO "KYCField" (id,label,"fieldType","isRequired","isDefault","displayOrder","isActive","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,false,$4,true,NOW(),NOW()) RETURNING *`,
    [label.trim(), fieldType, !!isRequired, order]
  );
  res.json(r.rows[0]);
});

router.patch("/admin/kyc-fields/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { label, isRequired, isActive, displayOrder } = req.body;
  const sets: string[] = []; const params: unknown[] = [];
  const addSet = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}"=$${params.length}`); };
  if (label !== undefined) addSet("label", label);
  if (isRequired !== undefined) addSet("isRequired", !!isRequired);
  if (isActive !== undefined) addSet("isActive", !!isActive);
  if (displayOrder !== undefined) addSet("displayOrder", parseInt(displayOrder));
  if (sets.length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  params.push(id);
  await pool.query(`UPDATE "KYCField" SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

// ─── KYC Requests ─────────────────────────────────────────────────────────────
// Frontend uses selected.id as the creatorId

router.get("/admin/kyc-requests", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { status, page = "1", search = "" } = req.query as Record<string, string>;
  const limit = 20;
  const offset = (Math.max(1, parseInt(page)) - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  // Only show creators who have submitted KYC (SUBMITTED, VERIFIED, REJECTED) unless a specific status is chosen
  if (status && status !== "ALL") {
    params.push(status);
    conditions.push(`c."kycStatus"=$${params.length}`);
  } else {
    conditions.push(`c."kycStatus" IN ('SUBMITTED','VERIFIED','REJECTED')`);
  }

  if (search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    conditions.push(`LOWER(c."instagramHandle") LIKE $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countParams = [...params];

  const [r, countR] = await Promise.all([
    pool.query(
      `SELECT c.id, c.id AS "creatorId", c."fullName", c."instagramHandle", c."profilePhotoUrl", c."kycStatus",
              c."kycSubmittedAt", c."kycRejectionReason",
              (SELECT json_agg(kd ORDER BY kd."createdAt") FROM "KYCData" kd WHERE kd."creatorId"=c.id) as "kycData"
       FROM "Creator" c ${where}
       ORDER BY c."kycSubmittedAt" DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int as total FROM "Creator" c ${where}`, countParams),
  ]);
  res.json({ requests: r.rows, total: countR.rows[0].total, page: parseInt(page), limit });
});

// Approve: POST /admin/kyc-requests/:id/approve
router.post("/admin/kyc-requests/:id/approve", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  await pool.query(
    `UPDATE "Creator" SET "kycStatus"='VERIFIED', "kycRejectionReason"=NULL, "updatedAt"=NOW() WHERE id=$1`,
    [id]
  );
  await createNotification({
    userId: id, userType: "CREATOR", type: "KYC_APPROVED",
    title: "KYC Verified ✓",
    body: "Your KYC documents have been verified. You can now receive payments for your completed campaigns!",
    expiresInDays: 90,
  }).catch(() => {});
  await createPopup({
    userId: id, userType: "CREATOR", type: "KYC_APPROVED",
    title: "KYC Approved!",
    body: "Your KYC has been verified. You can now receive payouts directly to your account.",
    ctaText: "Great, thanks!", ctaPath: "/home-creator/profile#kyc",
    isCelebration: false,
  }).catch(() => {});
  res.json({ ok: true });
});

// Reject: POST /admin/kyc-requests/:id/reject
router.post("/admin/kyc-requests/:id/reject", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { reason } = req.body as { reason: string };
  if (!reason?.trim()) { res.status(400).json({ error: "reason required" }); return; }
  await pool.query(
    `UPDATE "Creator" SET "kycStatus"='REJECTED', "kycRejectionReason"=$1, "updatedAt"=NOW() WHERE id=$2`,
    [reason.trim(), id]
  );
  await createNotification({
    userId: id, userType: "CREATOR", type: "KYC_REJECTED",
    title: "KYC Documents Rejected",
    body: `Your KYC was not approved. Reason: ${reason.trim()}. Please update your documents and resubmit.`,
    emailParams: { reason: reason.trim() },
    expiresInDays: 90,
  }).catch(() => {});
  await createPopup({
    userId: id, userType: "CREATOR", type: "KYC_REJECTED",
    title: "KYC Rejected",
    body: "Your KYC submission was rejected.",
    ctaText: "Resubmit KYC →", ctaPath: "/home-creator/profile#kyc",
    secondCtaText: "Dismiss",
    externalNote: reason.trim(),
    isCelebration: false,
  }).catch(() => {});
  res.json({ ok: true });
});

// ─── Deal Flow Tutorial Video ─────────────────────────────────────────────────

router.get("/admin/deal-tutorial-video", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const url = await getConfig("deal_tutorial_video_url", "");
  res.json({ url });
});

router.patch("/admin/deal-tutorial-video", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { url } = req.body as { url: string };
  await setConfig("deal_tutorial_video_url", String(url ?? "").trim());
  res.json({ ok: true });
});

// Public — brand/creator deal page reads this
router.get("/platform-config/deal-tutorial-video", async (_req: Request, res: Response): Promise<void> => {
  const url = await getConfig("deal_tutorial_video_url", "");
  res.json({ url });
});

// ─── All Deals (for Deal Management page) ────────────────────────────────────
router.get("/admin/deals", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { status, source, search } = req.query as { status?: string; source?: string; search?: string };
  const where: string[] = [];
  const vals: unknown[] = [];
  if (status && status !== "ALL") { vals.push(status); where.push(`d.status=$${vals.length}`); }
  if (source && source !== "ALL") { vals.push(source); where.push(`d.source=$${vals.length}`); }
  if (search?.trim()) {
    vals.push(`%${search.trim()}%`);
    const i = vals.length;
    where.push(`(b."brandName" ILIKE $${i} OR b."companyName" ILIKE $${i} OR cr."instagramHandle" ILIKE $${i} OR cr."fullName" ILIKE $${i} OR d."orderId" ILIKE $${i})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const r = await pool.query(
    `WITH config AS (
       SELECT
         COALESCE(MAX(CASE WHEN key='commission_rate' THEN value::numeric END), 5) AS comm_rate,
         COALESCE(MAX(CASE WHEN key='gst_rate' THEN value::numeric END), 18) AS gst_rate
       FROM "PlatformConfig" WHERE key IN ('commission_rate','gst_rate')
     )
     SELECT d.id, d.source, d.status, d."escrowStatus", d."totalAgreedValue",
            d."orderId",
            COALESCE(d."totalPayable",
              ROUND(d."totalAgreedValue" * (1 + COALESCE(d."gstRateLocked", cfg.gst_rate) / 100.0), 2)
            ) AS "totalPayable",
            COALESCE(d."gstAmount",
              ROUND(d."totalAgreedValue" * COALESCE(d."gstRateLocked", cfg.gst_rate) / 100.0, 2)
            ) AS "gstAmount",
            COALESCE(d."commissionRateLocked", d."commissionRate", cfg.comm_rate) AS "commissionRate",
            COALESCE(d."creatorPayout",
              ROUND(d."totalAgreedValue" * (1 - COALESCE(d."commissionRateLocked", d."commissionRate", cfg.comm_rate) / 100.0), 2)
            ) AS "creatorPayout",
            d."payoutStatus", d."paidAmount", d."payoutAdjustmentReason",
            d."refundAmount", d."refundReason",
            d."timelineDays", d."reelCount", d."storyCount", d."postCount", d."createdAt",
            d."campaignId", d."barterId",
            b.id AS "brandId", b."brandName",
            cr.id AS "creatorId", cr."fullName" AS "creatorName", cr."instagramHandle" AS "creatorHandle",
            COALESCE(c.name, bc.name, '—') AS "campaignName",
            ib."imageUrl" AS "brandInvoiceUrl",
            ic."imageUrl" AS "creatorInvoiceUrl"
       FROM "Deal" d
       CROSS JOIN config cfg
       LEFT JOIN "Brand" b ON b.id = d."brandId"
       LEFT JOIN "Creator" cr ON cr.id = d."creatorId"
       LEFT JOIN "Campaign" c ON c.id = d."campaignId"
       LEFT JOIN "BarterCampaign" bc ON bc.id = d."barterId"
       LEFT JOIN "Invoice" ib ON ib."referenceId"=d.id AND ib."recipientType"='BRAND'
       LEFT JOIN "Invoice" ic ON ic."referenceId"=d.id AND ic."recipientType"='CREATOR'
       ${whereSql}
       ORDER BY d."createdAt" DESC
       LIMIT 200`,
    vals
  );
  res.json(r.rows);
});

// ── GET /api/admin/credit-purchases ──
router.get("/admin/credit-purchases", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { search } = req.query as { search?: string };
  const where: string[] = [];
  const vals: unknown[] = [];
  vals.push("PURCHASED");
  where.push(`ct."transactionType"=$${vals.length}`);
  if (search?.trim()) {
    vals.push(`%${search.trim()}%`);
    const i = vals.length;
    where.push(`(b."brandName" ILIKE $${i} OR b.email ILIKE $${i} OR ct."orderId" ILIKE $${i})`);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const r = await pool.query(
    `SELECT ct.id, ct."orderId", ct.credits, ct."amountInr", ct."gstAmountInr", ct."createdAt",
            ct."balanceAfter",
            b.id AS "brandId", b."brandName", b.email AS "brandEmail",
            i."imageUrl" AS "invoiceUrl"
     FROM "CreditTransaction" ct
     LEFT JOIN "Brand" b ON b.id = ct."brandId"
     LEFT JOIN "Invoice" i ON i."referenceId"=ct.id AND i."recipientType"='BRAND'
     ${whereSql}
     ORDER BY ct."createdAt" DESC
     LIMIT 500`,
    vals
  );
  res.json(r.rows);
});

// ── POST /api/admin/invoices/upload ──
router.post("/admin/invoices/upload", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { referenceId, recipientType, recipientId, image, type } = req.body ?? {};
  if (!referenceId || !recipientType || !recipientId || !image || !type) {
    res.status(400).json({ error: "referenceId, recipientType, recipientId, image, type are required" });
    return;
  }
  const validTypes = ["DEAL_BRAND", "DEAL_CREATOR", "CREDIT_PURCHASE"];
  const validRecipientTypes = ["BRAND", "CREATOR"];
  if (!validTypes.includes(type)) { res.status(400).json({ error: "Invalid type" }); return; }
  if (!validRecipientTypes.includes(recipientType)) { res.status(400).json({ error: "Invalid recipientType" }); return; }
  if (typeof image !== "string" || image.length < 10) { res.status(400).json({ error: "Invalid image data" }); return; }
  if (image.length > 10_000_000) { res.status(400).json({ error: "Image too large (max ~7MB)" }); return; }

  // Guard: creator invoice can only be uploaded after creator has been paid (payoutStatus=RELEASED)
  if (type === "DEAL_CREATOR") {
    const dealRow = await pool.query(
      `SELECT id, COALESCE("payoutStatus", 'PENDING') AS "payoutStatus" FROM "Deal" WHERE id = $1`,
      [referenceId]
    );
    if (dealRow.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
    if (dealRow.rows[0].payoutStatus !== "RELEASED") {
      res.status(400).json({ error: "Creator invoice can only be uploaded after creator payout is released" });
      return;
    }
  }

  let imageUrl: string;
  try {
    const mimeMatch = image.match(/^data:([^;]+);/);
    const contentType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const ext = contentType.includes("pdf") ? "pdf" : contentType.includes("png") ? "png" : "jpg";
    const base64Data = image.includes(",") ? image.split(",")[1]! : image;
    const buffer = Buffer.from(base64Data, "base64");
    imageUrl = await uploadPrivate({
      key: `invoices/${randomUUID()}.${ext}`,
      body: buffer,
      contentType,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Upload failed" });
    return;
  }

  const invoiceInsert = await pool.query(
    `INSERT INTO "Invoice" (id, type, "referenceId", "recipientType", "recipientId", "imageUrl", "uploadedAt", notified, "invoicePopupSeen")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), false, false)
     RETURNING id`,
    [type, referenceId, recipientType, recipientId, imageUrl]
  );
  const invoiceId: string | null = invoiceInsert.rows[0]?.id ?? null;

  // Resolve orderId for notification copy
  let orderId = referenceId.slice(0, 8).toUpperCase();
  if (type === "DEAL_BRAND" || type === "DEAL_CREATOR") {
    const dealRow = await pool.query(`SELECT "orderId" FROM "Deal" WHERE id = $1`, [referenceId]);
    if (dealRow.rows[0]?.orderId) orderId = dealRow.rows[0].orderId as string;
  } else if (type === "CREDIT_PURCHASE") {
    const ctRow = await pool.query(`SELECT "orderId" FROM "CreditTransaction" WHERE id = $1`, [referenceId]);
    if (ctRow.rows[0]?.orderId) orderId = ctRow.rows[0].orderId as string;
  }

  const filename =
    type === "DEAL_CREATOR" ? `Collabry-Payout-${orderId}.pdf`
    : type === "DEAL_BRAND"  ? `Collabry-Deal-${orderId}.pdf`
    : `Collabry-Credits-${orderId}.pdf`;

  const notifBody = `Your invoice for deal ${orderId} is ready.`;
  const popupBody = `Your invoice for deal ${orderId} has been uploaded and is ready to download.`;

  await createNotification({
    userId: recipientId as string,
    userType: recipientType as "BRAND" | "CREATOR",
    type: "INVOICE_READY",
    title: "Your Invoice is Ready",
    body: notifBody,
    relatedEntityType: "Invoice",
    relatedEntityId: invoiceId,
  });

  await createPopup({
    userId: recipientId as string,
    userType: recipientType as "CREATOR" | "BRAND",
    type: "INVOICE_READY",
    title: "Your Invoice is Ready",
    body: popupBody,
    ctaText: "Download Invoice",
    ctaPath: imageUrl,
    secondCtaText: "Later",
    externalNote: filename,
  });

  if (invoiceId) {
    await pool.query(`UPDATE "Invoice" SET notified = true, "invoicePopupSeen" = true WHERE id = $1`, [invoiceId]);
  }

  res.json({ ok: true, imageUrl });
});

export default router;
