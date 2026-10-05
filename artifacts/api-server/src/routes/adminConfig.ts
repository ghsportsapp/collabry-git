import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { activateCreditHoldCampaigns } from "../lib/creditHoldActivation";

const DEFAULT_FIELD_CONFIG_KEY = "default_fields_config";

type FieldKey = "contactName" | "logoUrl" | "websiteUrl" | "categoryId" | "subcategoryId" | "instagramHandle";
type FieldStatus = "mandatory" | "optional" | "hidden";
interface FieldConfigItem { status: FieldStatus; order: number }

const FIELD_DEFAULTS: Record<FieldKey, { label: string; defaultStatus: FieldStatus; defaultOrder: number }> = {
  contactName:     { label: "Contact Person Name",    defaultStatus: "mandatory", defaultOrder: 0 },
  logoUrl:         { label: "Brand Logo",             defaultStatus: "mandatory", defaultOrder: 1 },
  categoryId:      { label: "Brand Category",         defaultStatus: "mandatory", defaultOrder: 2 },
  websiteUrl:      { label: "Website URL",            defaultStatus: "optional",  defaultOrder: 3 },
  subcategoryId:   { label: "Brand Sub-category",     defaultStatus: "optional",  defaultOrder: 4 },
  instagramHandle: { label: "Brand Instagram Handle", defaultStatus: "optional",  defaultOrder: 5 },
};

async function getDefaultFieldConfig(): Promise<Record<FieldKey, FieldConfigItem>> {
  const result = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [DEFAULT_FIELD_CONFIG_KEY]);
  const defaults = (): Record<FieldKey, FieldConfigItem> => {
    const d = {} as Record<FieldKey, FieldConfigItem>;
    for (const key of Object.keys(FIELD_DEFAULTS) as FieldKey[]) {
      d[key] = { status: FIELD_DEFAULTS[key].defaultStatus, order: FIELD_DEFAULTS[key].defaultOrder };
    }
    return d;
  };

  if (result.rows.length === 0) return defaults();

  try {
    const stored = JSON.parse(result.rows[0].value);
    const merged = defaults();
    for (const key of Object.keys(FIELD_DEFAULTS) as FieldKey[]) {
      const v = stored[key];
      if (v === undefined) continue;
      // Migrate old boolean format
      if (typeof v === "boolean") {
        merged[key].status = v ? "mandatory" : "optional";
      } else if (v && typeof v === "object" && "status" in v) {
        merged[key].status = v.status as FieldStatus;
        if (typeof v.order === "number") merged[key].order = v.order;
      }
    }
    return merged;
  } catch { return defaults(); }
}

const router: IRouter = Router();

// ── Credits config ────────────────────────────────────────────────────────────
router.get("/admin/config/credits", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT key, value FROM "PlatformConfig" WHERE key IN ('free_credits_amount','free_credits_expiry_days','credit_price_inr')`
  );
  const map: Record<string, number> = {};
  result.rows.forEach((r: any) => { map[r.key] = parseFloat(r.value); });
  res.json({
    freeCreditsOnSignup: map["free_credits_amount"] ?? 5,
    creditExpiryDays: map["free_credits_expiry_days"] ?? 30,
    pricePerCredit: map["credit_price_inr"] ?? 99,
  });
});

router.patch("/admin/config/credits", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { freeCreditsOnSignup, creditExpiryDays, pricePerCredit } = req.body as { freeCreditsOnSignup?: number; creditExpiryDays?: number; pricePerCredit?: number };
  const updates: Array<[string, number]> = [];
  if (freeCreditsOnSignup !== undefined) {
    const n = parseInt(String(freeCreditsOnSignup));
    if (isNaN(n) || n < 0) { res.status(400).json({ error: "freeCreditsOnSignup must be ≥ 0" }); return; }
    updates.push(["free_credits_amount", n]);
  }
  if (creditExpiryDays !== undefined) {
    const n = parseInt(String(creditExpiryDays));
    if (isNaN(n) || n < 1) { res.status(400).json({ error: "creditExpiryDays must be ≥ 1" }); return; }
    updates.push(["free_credits_expiry_days", n]);
  }
  if (pricePerCredit !== undefined) {
    const n = parseFloat(String(pricePerCredit));
    if (isNaN(n) || n <= 0) { res.status(400).json({ error: "pricePerCredit must be > 0" }); return; }
    updates.push(["credit_price_inr", n]);
  }
  for (const [key, value] of updates) {
    await pool.query(
      `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
      [key, String(value)]
    );
  }
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt") VALUES (gen_random_uuid(),$1,'UPDATE_CONFIG','PLATFORM_CONFIG','credits',$2::jsonb,NOW())`,
    [adminId, JSON.stringify({ freeCreditsOnSignup, creditExpiryDays, pricePerCredit })]
  );
  res.json({ ok: true });
});

// Public — current credit price + expiry policy (used by brand buy page & home)
router.get("/credits/price", async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT key, value FROM "PlatformConfig" WHERE key IN ('credit_price_inr','free_credits_expiry_days','gst_rate')`
  );
  const map: Record<string, string> = {};
  r.rows.forEach((row: any) => { map[row.key] = row.value; });
  const pricePerCredit = map["credit_price_inr"] ? parseFloat(map["credit_price_inr"]) : 99;
  const creditExpiryDays = map["free_credits_expiry_days"] ? parseInt(map["free_credits_expiry_days"]) : 30;
  const gstRate = map["gst_rate"] ? parseFloat(map["gst_rate"]) : 18;
  res.json({ pricePerCredit, creditExpiryDays, gstRate });
});

// ── Gift credits ──────────────────────────────────────────────────────────────
router.post("/admin/credits/gift", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { brandIds, amount, reason, expiryDays } = req.body as { brandIds: string[]; amount: number; reason?: string; expiryDays?: number };
  if (!Array.isArray(brandIds) || brandIds.length === 0) { res.status(400).json({ error: "brandIds must be a non-empty array" }); return; }
  if (!amount || amount <= 0 || !Number.isInteger(amount)) { res.status(400).json({ error: "amount must be a positive integer" }); return; }

  const days = Number(expiryDays);
  if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1) {
    res.status(400).json({ error: "expiryDays must be a positive integer" });
    return;
  }
  const expiresAt = new Date(Date.now() + days * 86400000);
  const reasonTrim = reason?.trim() || null;
  const expiryStr = ` · Expires in ${days} day${days === 1 ? "" : "s"} (${expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})`;
  const notifTitle = `You received ${amount} free credit${amount === 1 ? "" : "s"}!`;
  const notifBody = `Reason: ${reasonTrim ?? "Admin gift"}${expiryStr}`;

  const successes: string[] = [];
  const failures: Array<{ brandId: string; error: string }> = [];

  for (const brandId of brandIds) {
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const br = await client.query(`SELECT "creditBalance" FROM "Brand" WHERE id=$1 FOR UPDATE`, [brandId]);
        if (br.rows.length === 0) { failures.push({ brandId, error: "Brand not found" }); await client.query("ROLLBACK"); continue; }
        const newBalance = br.rows[0].creditBalance + amount;
        await client.query(`UPDATE "Brand" SET "creditBalance"=$1,"updatedAt"=NOW() WHERE id=$2`, [newBalance, brandId]);
        await client.query(
          `INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","adminId","adminReason","expiresAt","createdAt") VALUES (gen_random_uuid(),$1,'ADMIN_GIFT',$2,$3,$4,$5,$6,NOW())`,
          [brandId, amount, newBalance, adminId, reasonTrim, expiresAt]
        );
        await client.query(
          `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","expiresAt","createdAt")
           VALUES (gen_random_uuid(),$1,'BRAND','ADMIN_GIFT_RECEIVED',$2,$3,false,NOW() + INTERVAL '90 days',NOW())`,
          [brandId, notifTitle, notifBody]
        );
        await client.query("COMMIT");
        successes.push(brandId);
        activateCreditHoldCampaigns(brandId).catch(() => {});
      } catch (err) { await client.query("ROLLBACK"); failures.push({ brandId, error: String(err) }); }
      finally { client.release(); }
    } catch (err) { failures.push({ brandId, error: String(err) }); }
  }
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,reason,"createdAt") VALUES (gen_random_uuid(),$1,'GIFT_CREDITS','BRAND','multiple',$2::jsonb,$3,NOW())`,
    [adminId, JSON.stringify({ brandIds: successes, amount, expiresAt, expiryDays: days }), reasonTrim]
  );
  res.json({ ok: true, successCount: successes.length, failures });
});

// ── Default field config ──────────────────────────────────────────────────────
router.get("/admin/default-field-config", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const config = await getDefaultFieldConfig();
  const sorted = (Object.keys(FIELD_DEFAULTS) as FieldKey[]).sort((a, b) => config[a].order - config[b].order);
  const result = sorted.map(key => ({ key, label: FIELD_DEFAULTS[key].label, status: config[key].status, order: config[key].order }));
  res.json(result);
});

router.patch("/admin/default-field-config/:field", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { field } = req.params as Record<string, string>;
  const { status, order } = req.body as { status?: FieldStatus; order?: number };

  if (!Object.keys(FIELD_DEFAULTS).includes(field)) { res.status(400).json({ error: "Unknown field" }); return; }
  const validStatuses: FieldStatus[] = ["mandatory", "optional", "hidden"];
  if (status !== undefined && !validStatuses.includes(status)) { res.status(400).json({ error: "status must be mandatory, optional, or hidden" }); return; }

  const config = await getDefaultFieldConfig();
  const wasStatus = config[field as FieldKey].status;

  if (status !== undefined) config[field as FieldKey].status = status;
  if (typeof order === "number") config[field as FieldKey].order = order;

  await pool.query(
    `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
    [DEFAULT_FIELD_CONFIG_KEY, JSON.stringify(config)]
  );

  let notifiedCount = 0;
  if (status === "mandatory" && wasStatus !== "mandatory") {
    const colMap: Record<string, string> = {
      contactName: "contactName", logoUrl: "logoUrl", websiteUrl: "websiteUrl",
      categoryId: "categoryId", subcategoryId: "subcategoryId", instagramHandle: "instagramHandle",
    };
    const dbCol = colMap[field];
    if (dbCol) {
      const brandsResult = await pool.query(
        `SELECT id FROM "Brand" WHERE status='ACTIVE' AND ("${dbCol}" IS NULL OR "${dbCol}"='')`
      );
      const label = FIELD_DEFAULTS[field as FieldKey].label;
      for (const brand of brandsResult.rows) {
        await pool.query(
          `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","expiresAt","createdAt") VALUES (gen_random_uuid(),$1,'BRAND','FIELD_REQUIRED',$2,$3,false,NOW() + INTERVAL '90 days',NOW())`,
          [brand.id, `Action Required: ${label}`, `"${label}" is now a required field. Please update your profile.`]
        );
        notifiedCount++;
      }
    }
  }

  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt") VALUES (gen_random_uuid(),$1,'UPDATE_FIELD_CONFIG','PLATFORM_CONFIG',$2,$3::jsonb,NOW())`,
    [adminId, field, JSON.stringify({ field, status, order, notifiedCount })]
  );
  res.json({ ok: true, notifiedCount });
});

// Bulk reorder default fields
router.patch("/admin/default-field-config-order", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { order } = req.body as { order: Record<FieldKey, number> };
  if (!order || typeof order !== "object") { res.status(400).json({ error: "order must be an object" }); return; }
  const config = await getDefaultFieldConfig();
  for (const key of Object.keys(order) as FieldKey[]) {
    if (Object.keys(FIELD_DEFAULTS).includes(key)) config[key].order = order[key];
  }
  await pool.query(
    `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
    [DEFAULT_FIELD_CONFIG_KEY, JSON.stringify(config)]
  );
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt") VALUES (gen_random_uuid(),$1,'REORDER_FIELD_CONFIG','PLATFORM_CONFIG','default',$2::jsonb,NOW())`,
    [adminId, JSON.stringify(order)]
  );
  res.json({ ok: true });
});

// ── Public: brand field config ────────────────────────────────────────────────
router.get("/brand-field-config", async (_req: Request, res: Response): Promise<void> => {
  const config = await getDefaultFieldConfig();
  res.json(config);
});

// ── Unified field order ────────────────────────────────────────────────────────
type UnifiedEntry = { type: "default"; key: FieldKey } | { type: "custom"; id: string };
const UNIFIED_ORDER_KEY = "unified_field_order";

async function getUnifiedOrder(): Promise<UnifiedEntry[]> {
  const [cfgRow, customRows] = await Promise.all([
    pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [UNIFIED_ORDER_KEY]),
    pool.query(`SELECT id,"displayOrder" FROM "BrandSignupField" WHERE "isActive"=true ORDER BY "displayOrder","createdAt"`),
  ]);
  const allDefaultKeys = Object.keys(FIELD_DEFAULTS) as FieldKey[];
  const activeCustomIds = new Set<string>(customRows.rows.map((r: any) => r.id));

  if (cfgRow.rows.length > 0) {
    try {
      const stored = JSON.parse(cfgRow.rows[0].value) as UnifiedEntry[];
      // Filter out stale entries
      const valid = stored.filter(e =>
        (e.type === "default" && allDefaultKeys.includes(e.key)) ||
        (e.type === "custom" && activeCustomIds.has(e.id))
      );
      // Add any missing default keys at the end
      const presentDefaults = new Set(valid.filter(e => e.type === "default").map(e => (e as any).key));
      for (const k of allDefaultKeys) if (!presentDefaults.has(k)) valid.push({ type: "default", key: k });
      // Add any new custom fields at the end
      const presentCustom = new Set(valid.filter(e => e.type === "custom").map(e => (e as any).id));
      for (const r of customRows.rows) if (!presentCustom.has(r.id)) valid.push({ type: "custom", id: r.id });
      return valid;
    } catch {}
  }

  // Build default order: default fields sorted by their order, then custom fields sorted by displayOrder
  const fieldConfig = await getDefaultFieldConfig();
  const sortedDefaults = allDefaultKeys.slice().sort((a, b) => fieldConfig[a].order - fieldConfig[b].order);
  return [
    ...sortedDefaults.map(k => ({ type: "default" as const, key: k })),
    ...customRows.rows.map((r: any) => ({ type: "custom" as const, id: r.id })),
  ];
}

async function saveUnifiedOrder(order: UnifiedEntry[]): Promise<void> {
  await pool.query(
    `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,''::text,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
    [UNIFIED_ORDER_KEY, JSON.stringify(order)]
  );
}

// Public endpoint: returns ordered list of visible (non-hidden) fields for signup form
router.get("/unified-field-order", async (_req: Request, res: Response): Promise<void> => {
  const [order, fieldConfig, customRows] = await Promise.all([
    getUnifiedOrder(),
    getDefaultFieldConfig(),
    pool.query(`SELECT id, label, "fieldType", status FROM "BrandSignupField" WHERE "isActive"=true`),
  ]);
  const customMap: Record<string, any> = {};
  customRows.rows.forEach((r: any) => { customMap[r.id] = r; });

  const result = order
    .map(e => {
      if (e.type === "default") {
        const cfg = fieldConfig[e.key];
        if (cfg.status === "hidden") return null;
        return { type: "default", key: e.key, label: FIELD_DEFAULTS[e.key].label, status: cfg.status };
      } else {
        const cf = customMap[e.id];
        if (!cf || cf.status === "hidden") return null;
        return { type: "custom", id: e.id, label: cf.label, fieldType: cf.fieldType, status: cf.status };
      }
    })
    .filter(Boolean);
  res.json(result);
});

// Admin: full list including hidden fields
router.get("/admin/unified-field-order", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [order, fieldConfig, customRows] = await Promise.all([
    getUnifiedOrder(),
    getDefaultFieldConfig(),
    pool.query(`SELECT id, label, "fieldType", status FROM "BrandSignupField" WHERE "isActive"=true`),
  ]);
  const customMap: Record<string, any> = {};
  customRows.rows.forEach((r: any) => { customMap[r.id] = r; });

  const result = order
    .map(e => {
      if (e.type === "default") {
        const cfg = fieldConfig[e.key];
        return { type: "default", key: e.key, label: FIELD_DEFAULTS[e.key].label, status: cfg.status };
      } else {
        const cf = customMap[e.id];
        if (!cf) return null;
        return { type: "custom", id: e.id, label: cf.label, fieldType: cf.fieldType, status: cf.status };
      }
    })
    .filter(Boolean);
  res.json(result);
});

// Admin: save a new unified order
router.patch("/admin/unified-field-order", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { order } = req.body as { order: UnifiedEntry[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order must be an array" }); return; }
  await saveUnifiedOrder(order);
  res.json({ ok: true });
});

// Exported helpers used by brandSignupFields route
export { getUnifiedOrder, saveUnifiedOrder };
export type { UnifiedEntry };

// ── Legal content ─────────────────────────────────────────────────────────────
type LegalSection = { heading: string; body: string };
type LegalResponse = { sections: LegalSection[]; updatedAt: string | null };
const LEGAL_KEYS = { terms: "legal_terms_content", privacy: "legal_privacy_content" } as const;
const LEGAL_DEFAULTS: Record<keyof typeof LEGAL_KEYS, LegalSection[]> = {
  terms: [
    { heading: "Acceptance of Terms", body: "By accessing and using Collabry, you accept and agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our platform." },
    { heading: "Use of Platform", body: "Collabry provides a marketplace connecting brands with content creators in India. You agree to use the platform only for lawful purposes and in compliance with all applicable laws and regulations." },
    { heading: "User Accounts", body: "You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account." },
    { heading: "Payments & Credits", body: "All payments are processed in Indian Rupees (INR). Credits purchased are non-refundable unless otherwise stated. Collabry reserves the right to modify pricing at any time." },
    { heading: "Intellectual Property", body: "All content on Collabry, including logos, text, and software, is the property of Collabry and is protected by applicable intellectual property laws." },
    { heading: "Limitation of Liability", body: "Collabry shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform." },
  ],
  privacy: [
    { heading: "Information We Collect", body: "We collect information you provide when signing up, including your name, email, brand details, and payment information. We also collect usage data to improve our services." },
    { heading: "How We Use Your Information", body: "Your information is used to operate the platform, process payments, send service communications, and improve our offerings. We do not sell your personal data to third parties." },
    { heading: "Data Security", body: "We implement industry-standard security measures to protect your data. However, no method of transmission over the Internet is 100% secure." },
    { heading: "Cookies", body: "We use cookies to enhance your experience on our platform. You can control cookie settings through your browser preferences." },
    { heading: "Third-Party Services", body: "Our platform integrates with third-party services such as payment processors and analytics tools. These services have their own privacy policies." },
    { heading: "Contact Us", body: "If you have any questions about this Privacy Policy, please contact us at legal@collabry.co." },
  ],
};

async function getLegalContent(type: keyof typeof LEGAL_KEYS): Promise<LegalResponse> {
  const key = LEGAL_KEYS[type];
  const result = await pool.query(`SELECT value, "updatedAt" FROM "PlatformConfig" WHERE key=$1`, [key]);
  if (result.rows.length > 0) {
    try {
      return {
        sections: JSON.parse(result.rows[0].value) as LegalSection[],
        updatedAt: result.rows[0].updatedAt ? (result.rows[0].updatedAt as Date).toISOString() : null,
      };
    } catch { return { sections: LEGAL_DEFAULTS[type], updatedAt: null }; }
  }
  return { sections: LEGAL_DEFAULTS[type], updatedAt: null };
}

router.get("/legal/terms", async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json(await getLegalContent("terms"));
});
router.get("/legal/privacy", async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json(await getLegalContent("privacy"));
});

router.patch("/admin/legal/:type", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { type } = req.params as Record<string, string>;
  if (type !== "terms" && type !== "privacy") { res.status(400).json({ error: "Invalid type" }); return; }
  const { sections } = req.body as { sections?: LegalSection[] };
  if (!Array.isArray(sections)) { res.status(400).json({ error: "sections must be an array" }); return; }
  const key = LEGAL_KEYS[type as keyof typeof LEGAL_KEYS];
  await pool.query(
    `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
    [key, JSON.stringify(sections), `Legal content: ${type}`]
  );
  res.json({ ok: true });
});

/* ── About Us content ─────────────────────────────── */
const ABOUT_US_KEY = "about_us_content";
interface TeamMember { name: string; image: string; occupation?: string }
interface AboutUsContent {
  heading: string; content: string; mission: string;
  missionImage: string; contactEmail: string; contactPhone: string; callTiming: string;
  contactDesc: string; teamDesc: string;
  team: TeamMember[];
}
const ABOUT_US_DEFAULT: AboutUsContent = {
  heading: "About Us",
  content: "Collabry is India's trusted influencer marketplace, connecting brands with authentic creators to build powerful campaigns. Our mission is to make creator collaborations simple, transparent, and rewarding for everyone involved.",
  mission: "Our mission is to make influencer collaborations more trusted, accessible, and result-oriented by removing fake engagement, scattered communication, and unreliable workflows. We aim to empower creators to grow professionally while helping brands collaborate smarter, faster, and more confidently.",
  missionImage: "",
  contactEmail: "support@collabry.in",
  // No number is published until admin sets one — the Connect page hides the
  // phone block while this is empty rather than showing a blank tel: link.
  contactPhone: "",
  callTiming: "10 AM – 6 PM",
  contactDesc: "If you have any questions, partnership inquiries, or support requests, feel free to reach out to us at the email address below. Please mention whether you are contacting us as a Creator or a Brand in the subject line for faster assistance.",
  teamDesc: "A passionate team focused on redefining how modern brand collaborations work.",
  team: [],
};

async function getAboutUs(): Promise<AboutUsContent> {
  const result = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [ABOUT_US_KEY]);
  if (result.rows.length > 0) {
    try {
      const parsed = JSON.parse(result.rows[0].value) as Partial<AboutUsContent>;
      return {
        heading: parsed.heading ?? ABOUT_US_DEFAULT.heading,
        content: parsed.content ?? ABOUT_US_DEFAULT.content,
        mission: parsed.mission ?? ABOUT_US_DEFAULT.mission,
        missionImage: parsed.missionImage ?? ABOUT_US_DEFAULT.missionImage,
        contactEmail: parsed.contactEmail ?? ABOUT_US_DEFAULT.contactEmail,
        contactPhone: parsed.contactPhone ?? ABOUT_US_DEFAULT.contactPhone,
        callTiming: parsed.callTiming ?? ABOUT_US_DEFAULT.callTiming,
        contactDesc: parsed.contactDesc ?? ABOUT_US_DEFAULT.contactDesc,
        teamDesc: parsed.teamDesc ?? ABOUT_US_DEFAULT.teamDesc,
        team: Array.isArray(parsed.team) ? parsed.team.map((m: any) => ({ name: m.name ?? "", image: m.image ?? "", occupation: m.occupation ?? "" })) : [],
      };
    } catch { return ABOUT_US_DEFAULT; }
  }
  return ABOUT_US_DEFAULT;
}

router.get("/about-us", async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "no-store");
  res.json(await getAboutUs());
});

router.patch("/admin/about-us", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { heading, content, mission, missionImage, contactEmail, contactPhone, callTiming, contactDesc, teamDesc, team } = req.body as Partial<AboutUsContent>;
  if (typeof heading !== "string" || typeof content !== "string" || !Array.isArray(team)) {
    res.status(400).json({ error: "heading, content, and team are required" }); return;
  }
  const cleanTeam: TeamMember[] = team
    .filter((m): m is TeamMember => m && typeof m.name === "string" && typeof m.image === "string")
    .map(m => ({ name: m.name.trim(), image: m.image.trim(), occupation: typeof m.occupation === "string" ? m.occupation.trim() : "" }))
    .filter(m => m.name.length > 0);
  const payload: AboutUsContent = {
    heading: heading.trim() || ABOUT_US_DEFAULT.heading,
    content: content.trim(),
    mission: (typeof mission === "string" ? mission.trim() : undefined) ?? ABOUT_US_DEFAULT.mission,
    missionImage: (typeof missionImage === "string" ? missionImage.trim() : undefined) ?? ABOUT_US_DEFAULT.missionImage,
    contactEmail: (typeof contactEmail === "string" ? contactEmail.trim() : undefined) ?? ABOUT_US_DEFAULT.contactEmail,
    // Cleared on purpose stays cleared, so admin can pull the number down.
    contactPhone: (typeof contactPhone === "string" ? contactPhone.trim() : undefined) ?? ABOUT_US_DEFAULT.contactPhone,
    // Blank falls back to the default, like `heading` — a phone number with no
    // hours beside it reads worse than the standard window.
    callTiming: (typeof callTiming === "string" ? callTiming.trim() : "") || ABOUT_US_DEFAULT.callTiming,
    contactDesc: (typeof contactDesc === "string" ? contactDesc.trim() : undefined) ?? ABOUT_US_DEFAULT.contactDesc,
    teamDesc: (typeof teamDesc === "string" ? teamDesc.trim() : undefined) ?? ABOUT_US_DEFAULT.teamDesc,
    team: cleanTeam,
  };
  await pool.query(
    `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
    [ABOUT_US_KEY, JSON.stringify(payload), "About Us page content"]
  );
  res.json({ ok: true });
});

/* ── White Glove Service page content ─────────────────── */
const WHITE_GLOVE_KEY = "white_glove_content";

interface ServicePoint { title: string; desc: string }
interface WhiteGlovePlan {
  id: string;
  name: string;
  desc: string;
  months: number;
  mrp: number;
  price: number;
  badge: string;        // e.g. "Most popular" — empty for no badge
  perks: string[];      // extra perk lines (Growth/Scale); Starter can be []
  buttonLabel: string;  // CTA label on the plan card
}
interface WhiteGloveFounder { name: string; designation: string; image: string }
interface WhiteGloveContent {
  heroTag: string;
  heroLine1: string; heroLine2: string; heroSub: string;
  includedLine1: string; includedLine2: string; includedSub: string;
  points: ServicePoint[];
  pricingLine1: string; pricingLine2: string;
  plans: WhiteGlovePlan[];
  pricingNote: string;
  memberHeading: string; memberSubtext: string;
  thankYouMessage: string;
  founderHeading: string; founderSubheading: string;
  founders: WhiteGloveFounder[];
  footerNote: string;
}

const WHITE_GLOVE_DEFAULT: WhiteGloveContent = {
  heroTag: "White Glove · fully managed for you",
  heroLine1: "Hand us your creator marketing.",
  heroLine2: "We'll run every bit of it.",
  heroSub: "No searching for creators, no chasing deliverables, no juggling payments. A dedicated Collabry team takes the entire process off your plate — you simply approve and watch it work.",
  includedLine1: "One complete service.",
  includedLine2: "Included in every plan.",
  includedSub: "The same end-to-end concierge service across all three plans — only the duration and price change.",
  points: [
    { title: "Dedicated account management", desc: "A single point of contact from our team for your whole subscription — no more juggling multiple creator chats yourself." },
    { title: "Curated creator shortlisting", desc: "We source and shortlist creators matched to your niche, audience and budget — refreshed each cycle as new creators join." },
    { title: "End-to-end outreach & negotiation", desc: "We make first contact, pitch the collaboration, and negotiate terms — barter value or payout, deliverables and timeline — on your behalf." },
    { title: "Deal setup & documentation", desc: "Deal creation, contracting and platform setup handled by us. You get a ready summary per deal, with no manual entry." },
    { title: "Campaign briefing & creative guidance", desc: "We brief every creator on your brand guidelines, do's and don'ts, so the content always stays on-brand." },
    { title: "Timeline & deliverable tracking", desc: "Active monitoring of every deal's status and deadline, so nothing slips through the cracks." },
    { title: "Payment & escrow handling", desc: "We manage payout releases, refunds and escrow — you get one consolidated monthly invoice instead of per-deal billing." },
    { title: "Priority support", desc: "Faster response times, a priority queue, and a direct escalation path for any disputes or creator no-shows." },
  ],
  pricingLine1: "Choose how long you want us.",
  pricingLine2: "The longer you go, the less you pay.",
  plans: [
    { id: "starter", name: "Starter", desc: "Perfect for a one-off push or a first taste of the service.", months: 1, mrp: 10000, price: 1200, badge: "", perks: [], buttonLabel: "Get started" },
    { id: "growth", name: "Growth", desc: "For brands running steady, ongoing creator campaigns.", months: 3, mrp: 25000, price: 3200, badge: "Most popular", perks: ["Lower per-month rate", "Same account manager all term"], buttonLabel: "Choose Growth" },
    { id: "scale", name: "Scale", desc: "Best value for always-on, long-term creator marketing.", months: 6, mrp: 45000, price: 5800, badge: "", perks: ["Lowest per-month rate", "Same account manager all term"], buttonLabel: "Get started" },
  ],
  pricingNote: "Secure payment via Razorpay · Our team reaches out within 24 hours of purchase",
  memberHeading: "You're a Collabry White Glove member",
  memberSubtext: "Your dedicated team is running your creator marketing end to end. Sit back — we've got this.",
  thankYouMessage: "Thank you for trusting Collabry with your creator marketing. Our team is already on it — we'll personally handle every step and make sure your collaborations run smoothly, start to finish. You're in good hands.",
  founderHeading: "From Founder to Founder",
  founderSubheading: "We made it because we need it.",
  founders: [
    { name: "Navneet", designation: "Founder", image: "" },
    { name: "Angad", designation: "Co-founder", image: "" },
    { name: "Nikhil Goel", designation: "Co-founder", image: "" },
  ],
  footerNote: "A Krida Ventures Company · Gurugram, Haryana",
};

function cleanPoints(input: unknown): ServicePoint[] {
  if (!Array.isArray(input)) return WHITE_GLOVE_DEFAULT.points;
  const points = input
    .filter((p): p is ServicePoint => !!p && typeof p.title === "string" && typeof p.desc === "string")
    .map(p => ({ title: p.title.trim(), desc: p.desc.trim() }))
    .filter(p => p.title.length > 0 || p.desc.length > 0);
  return points.length > 0 ? points : WHITE_GLOVE_DEFAULT.points;
}

function cleanPlans(input: unknown): WhiteGlovePlan[] {
  if (!Array.isArray(input)) return WHITE_GLOVE_DEFAULT.plans;
  const plans = input
    .filter((p): p is WhiteGlovePlan => !!p && typeof p.name === "string")
    .map((p, i) => ({
      id: typeof p.id === "string" && p.id.trim() ? p.id.trim() : WHITE_GLOVE_DEFAULT.plans[i]?.id ?? `plan-${i + 1}`,
      name: p.name.trim(),
      desc: typeof p.desc === "string" ? p.desc.trim() : "",
      months: Number.isFinite(Number(p.months)) && Number(p.months) > 0 ? Math.round(Number(p.months)) : 1,
      mrp: Number.isFinite(Number(p.mrp)) && Number(p.mrp) >= 0 ? Number(p.mrp) : 0,
      price: Number.isFinite(Number(p.price)) && Number(p.price) >= 0 ? Number(p.price) : 0,
      badge: typeof p.badge === "string" ? p.badge.trim() : "",
      perks: Array.isArray(p.perks) ? p.perks.filter((x: unknown): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean) : [],
      buttonLabel: typeof p.buttonLabel === "string" && p.buttonLabel.trim()
        ? p.buttonLabel.trim()
        : (WHITE_GLOVE_DEFAULT.plans[i]?.buttonLabel ?? "Get started"),
    }))
    .filter(p => p.name.length > 0);
  return plans.length > 0 ? plans : WHITE_GLOVE_DEFAULT.plans;
}

function cleanFounders(input: unknown): WhiteGloveFounder[] {
  if (!Array.isArray(input)) return WHITE_GLOVE_DEFAULT.founders;
  const founders = input
    .filter((f): f is WhiteGloveFounder => !!f && typeof f.name === "string")
    .map(f => ({
      name: f.name.trim(),
      designation: typeof f.designation === "string" ? f.designation.trim() : "",
      image: typeof f.image === "string" ? f.image.trim() : "",
    }))
    .filter(f => f.name.length > 0 || f.designation.length > 0 || f.image.length > 0);
  // Founders can legitimately be emptied by the admin — only fall back when the
  // field was absent/invalid entirely (handled by the Array.isArray guard above).
  return founders;
}

export async function getWhiteGlove(): Promise<WhiteGloveContent> {
  const result = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [WHITE_GLOVE_KEY]);
  if (result.rows.length > 0) {
    try {
      const p = JSON.parse(result.rows[0].value) as Partial<WhiteGloveContent>;
      const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v : d);
      return {
        heroTag: str(p.heroTag, WHITE_GLOVE_DEFAULT.heroTag),
        heroLine1: str(p.heroLine1, WHITE_GLOVE_DEFAULT.heroLine1),
        heroLine2: str(p.heroLine2, WHITE_GLOVE_DEFAULT.heroLine2),
        heroSub: str(p.heroSub, WHITE_GLOVE_DEFAULT.heroSub),
        includedLine1: str(p.includedLine1, WHITE_GLOVE_DEFAULT.includedLine1),
        includedLine2: str(p.includedLine2, WHITE_GLOVE_DEFAULT.includedLine2),
        includedSub: str(p.includedSub, WHITE_GLOVE_DEFAULT.includedSub),
        points: cleanPoints(p.points),
        pricingLine1: str(p.pricingLine1, WHITE_GLOVE_DEFAULT.pricingLine1),
        pricingLine2: str(p.pricingLine2, WHITE_GLOVE_DEFAULT.pricingLine2),
        plans: cleanPlans(p.plans),
        pricingNote: str(p.pricingNote, WHITE_GLOVE_DEFAULT.pricingNote),
        memberHeading: str(p.memberHeading, WHITE_GLOVE_DEFAULT.memberHeading),
        memberSubtext: str(p.memberSubtext, WHITE_GLOVE_DEFAULT.memberSubtext),
        thankYouMessage: str(p.thankYouMessage, WHITE_GLOVE_DEFAULT.thankYouMessage),
        founderHeading: str(p.founderHeading, WHITE_GLOVE_DEFAULT.founderHeading),
        founderSubheading: str(p.founderSubheading, WHITE_GLOVE_DEFAULT.founderSubheading),
        founders: Array.isArray(p.founders) ? cleanFounders(p.founders) : WHITE_GLOVE_DEFAULT.founders,
        footerNote: str(p.footerNote, WHITE_GLOVE_DEFAULT.footerNote),
      };
    } catch { return WHITE_GLOVE_DEFAULT; }
  }
  return WHITE_GLOVE_DEFAULT;
}

router.get("/white-glove", async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "no-store");
  res.json(await getWhiteGlove());
});

router.patch("/admin/white-glove", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const b = req.body as Partial<WhiteGloveContent>;
  const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  const payload: WhiteGloveContent = {
    heroTag: str(b.heroTag, WHITE_GLOVE_DEFAULT.heroTag),
    heroLine1: str(b.heroLine1, WHITE_GLOVE_DEFAULT.heroLine1),
    heroLine2: str(b.heroLine2, WHITE_GLOVE_DEFAULT.heroLine2),
    heroSub: str(b.heroSub, WHITE_GLOVE_DEFAULT.heroSub),
    includedLine1: str(b.includedLine1, WHITE_GLOVE_DEFAULT.includedLine1),
    includedLine2: str(b.includedLine2, WHITE_GLOVE_DEFAULT.includedLine2),
    includedSub: str(b.includedSub, WHITE_GLOVE_DEFAULT.includedSub),
    points: cleanPoints(b.points),
    pricingLine1: str(b.pricingLine1, WHITE_GLOVE_DEFAULT.pricingLine1),
    pricingLine2: str(b.pricingLine2, WHITE_GLOVE_DEFAULT.pricingLine2),
    plans: cleanPlans(b.plans),
    pricingNote: str(b.pricingNote, WHITE_GLOVE_DEFAULT.pricingNote),
    memberHeading: str(b.memberHeading, WHITE_GLOVE_DEFAULT.memberHeading),
    memberSubtext: str(b.memberSubtext, WHITE_GLOVE_DEFAULT.memberSubtext),
    thankYouMessage: str(b.thankYouMessage, WHITE_GLOVE_DEFAULT.thankYouMessage),
    founderHeading: str(b.founderHeading, WHITE_GLOVE_DEFAULT.founderHeading),
    founderSubheading: str(b.founderSubheading, WHITE_GLOVE_DEFAULT.founderSubheading),
    founders: Array.isArray(b.founders) ? cleanFounders(b.founders) : WHITE_GLOVE_DEFAULT.founders,
    footerNote: str(b.footerNote, WHITE_GLOVE_DEFAULT.footerNote),
  };
  await pool.query(
    `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
    [WHITE_GLOVE_KEY, JSON.stringify(payload), "White Glove Service page content"]
  );
  res.json({ ok: true });
});

export default router;
