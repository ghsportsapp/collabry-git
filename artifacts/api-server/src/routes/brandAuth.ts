import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getSupportEmail } from "../lib/supportEmail";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  getAccessSecret,
  UserType,
} from "../lib/auth";
import { saveRefreshToken, revokeToken } from "../lib/session";
import { createNotification } from "../lib/notifications";
import { createPopup } from "../lib/popups";
import crypto from "crypto";

const router: IRouter = Router();

const REFRESH_COOKIE = "collabry_refresh";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  path: "/",
};

// Returns true if email is taken on Brand or Creator (banned/suspended rows still occupy it)
async function isEmailTakenAnywhere(email: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM "Brand" WHERE LOWER(email)=$1
     UNION ALL SELECT 1 FROM "Creator" WHERE LOWER(email)=$1 LIMIT 1`,
    [email]
  );
  return r.rows.length > 0;
}

// Returns true if phone is taken on Creator.phone or any Brand "tel" custom field value
async function isPhoneTakenAnywhere(phone: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM "Creator" WHERE phone=$1
     UNION ALL
     SELECT 1 FROM "BrandCustomFieldValue" v
       JOIN "BrandSignupField" f ON f.id=v."fieldId"
       WHERE f."fieldType"='tel' AND v.value=$1
     LIMIT 1`,
    [phone]
  );
  return r.rows.length > 0;
}

function normalizePhone(raw: string): string {
  const digits = String(raw).trim().replace(/\D/g, "");
  // Only strip "91" country code when the number is 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

router.get("/brands/check-name", async (req: Request, res: Response): Promise<void> => {
  const name = (req.query["name"] as string)?.trim();
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  const r = await pool.query(`SELECT 1 FROM "Brand" WHERE LOWER("brandName")=LOWER($1) LIMIT 1`, [name]);
  res.json({ available: r.rows.length === 0 });
});

router.get("/brands/check-email", async (req: Request, res: Response): Promise<void> => {
  const email = (req.query["email"] as string)?.toLowerCase().trim();
  if (!email) { res.status(400).json({ error: "Email required" }); return; }
  res.json({ available: !(await isEmailTakenAnywhere(email)) });
});

router.get("/brands/check-phone", async (req: Request, res: Response): Promise<void> => {
  const raw = (req.query["phone"] as string) ?? "";
  const phone = normalizePhone(raw);
  if (!phone) { res.status(400).json({ error: "Phone required" }); return; }
  if (!/^\d{10}$/.test(phone)) { res.json({ available: false, invalid: true }); return; }
  res.json({ available: !(await isPhoneTakenAnywhere(phone)) });
});

router.post("/auth/brand/signup", async (req: Request, res: Response): Promise<void> => {
  const {
    brandName, contactName, email, websiteUrl,
    categoryId, subcategoryId, instagramHandle,
    logoUrl, password, customFields = {}
  } = req.body as Record<string, any>;

  // Always required
  if (!brandName?.trim()) { res.status(400).json({ error: "Brand name is required" }); return; }
  if (!email?.trim()) { res.status(400).json({ error: "Email is required" }); return; }
  if (!password || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }

  // Field config: only validate mandatory fields
  let fieldCfg: Record<string, { status: string }> = {};
  try {
    const cfgRow = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='default_fields_config'`);
    if (cfgRow.rows.length > 0) fieldCfg = JSON.parse(cfgRow.rows[0].value);
  } catch {}
  const isMandatory = (key: string) => (fieldCfg[key]?.status ?? "optional") === "mandatory";

  if (isMandatory("contactName") && !contactName?.trim()) { res.status(400).json({ error: "Contact name is required" }); return; }
  if (isMandatory("categoryId") && !categoryId) { res.status(400).json({ error: "Brand category is required" }); return; }
  if (isMandatory("logoUrl") && !logoUrl) { res.status(400).json({ error: "Brand logo is required" }); return; }
  if (isMandatory("websiteUrl") && !websiteUrl?.trim()) { res.status(400).json({ error: "Website URL is required" }); return; }
  if (isMandatory("instagramHandle") && !instagramHandle?.trim()) { res.status(400).json({ error: "Instagram handle is required" }); return; }

  // Instagram handle uniqueness check (if provided)
  if (instagramHandle?.trim()) {
    const cleanIg = instagramHandle.trim().replace(/^@/, "").toLowerCase();
    const igCheck = await pool.query(
      `SELECT 1 FROM "Creator" WHERE LOWER("instagramHandle")=$1
       UNION ALL SELECT 1 FROM "Brand" WHERE LOWER("instagramHandle")=$1 LIMIT 1`,
      [cleanIg]
    );
    if (igCheck.rows.length > 0) {
      res.status(400).json({ error: "This Instagram username is already linked to a Collabry account." }); return;
    }
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (await isEmailTakenAnywhere(normalizedEmail)) {
    res.status(400).json({ error: "This email is already registered" }); return;
  }

  const nameCheck = await pool.query(`SELECT id FROM "Brand" WHERE LOWER("brandName") = LOWER($1)`, [brandName.trim()]);
  if (nameCheck.rows.length > 0) { res.status(400).json({ error: "This brand name is already taken" }); return; }

  // Validate any "tel" custom field values: must be 10 digits and unique across the platform.
  // Build a map of fieldId -> fieldType for active tel fields, then validate each provided value.
  const telFieldsResult = await pool.query(
    `SELECT id, label FROM "BrandSignupField" WHERE "isActive"=true AND "fieldType"='tel' AND status != 'hidden'`
  );
  const telFields: { id: string; label: string }[] = telFieldsResult.rows;
  const normalizedCustomFields: Record<string, string> = { ...(customFields ?? {}) };
  for (const tf of telFields) {
    const raw = customFields?.[tf.id];
    const isProvided = raw !== undefined && raw !== null && String(raw).trim() !== "";
    if (!isProvided) {
      // Mandatory check happens via existing custom-field iteration in the UI; server-side we still enforce 10 digits if provided.
      // If the platform marks the field mandatory, brandSignupFields config will mark isRequired=true; we mirror that:
      const isMandatory = await pool.query(
        `SELECT 1 FROM "BrandSignupField" WHERE id=$1 AND "isRequired"=true`, [tf.id]
      );
      if (isMandatory.rows.length > 0) {
        res.status(400).json({ error: `${tf.label} is required` }); return;
      }
      continue;
    }
    const cleaned = normalizePhone(String(raw));
    if (!/^\d{10}$/.test(cleaned)) {
      res.status(400).json({ error: `${tf.label} must be a valid 10-digit phone number` }); return;
    }
    if (await isPhoneTakenAnywhere(cleaned)) {
      res.status(400).json({ error: "This phone number is already registered" }); return;
    }
    normalizedCustomFields[tf.id] = cleaned;
  }

  const configResult = await pool.query(
    `SELECT key, value FROM "PlatformConfig" WHERE key IN ('free_credits_amount','free_credits_expiry_days')`
  );
  const configMap: Record<string, string> = {};
  configResult.rows.forEach((r: any) => { configMap[r.key] = r.value; });
  const freeCredits = parseInt(configMap["free_credits_amount"] ?? "5");
  const expiryDays = parseInt(configMap["free_credits_expiry_days"] ?? "30");
  const freeCreditsExpiry = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const passwordHash = await hashPassword(password);
  const brandId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO "Brand" (id, "brandName", "contactName", email, "websiteUrl", "categoryId", "subcategoryId", "instagramHandle", "logoUrl", "passwordHash", "creditBalance", "freeCreditsExpiry", status, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ACTIVE',NOW(),NOW())`,
      [brandId, brandName.trim(), contactName?.trim() || null, normalizedEmail, websiteUrl?.trim() || null,
       categoryId || null, subcategoryId || null, instagramHandle?.trim() || null, logoUrl || null, passwordHash,
       freeCredits, freeCreditsExpiry]
    );

    await client.query(
      `INSERT INTO "CreditTransaction" (id, "brandId", "transactionType", amount, "balanceAfter", "expiresAt", "createdAt")
       VALUES (gen_random_uuid(),$1,'FREE_SIGNUP',$2,$3,$4,NOW())`,
      [brandId, freeCredits, freeCredits, freeCreditsExpiry]
    );

    if (normalizedCustomFields && typeof normalizedCustomFields === "object") {
      for (const [fieldId, value] of Object.entries(normalizedCustomFields)) {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          await client.query(
            `INSERT INTO "BrandCustomFieldValue" (id, "brandId", "fieldId", value, "updatedAt")
             VALUES (gen_random_uuid(),$1,$2,$3,NOW())
             ON CONFLICT ("brandId","fieldId") DO UPDATE SET value=$3,"updatedAt"=NOW()`,
            [brandId, fieldId, String(value)]
          );
        }
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Welcome notification + popup
  await createNotification({
    userId: brandId,
    userType: "BRAND",
    type: "WELCOME_CREDITS",
    title: "Welcome to Collabry! 🎉",
    body: `You received ${freeCredits} free credit${freeCredits === 1 ? "" : "s"} to start collaborating. Use them to unlock creator profiles and post campaigns.`,
  }).catch(() => {});
  await createPopup({
    userId: brandId,
    userType: "BRAND",
    type: "WELCOME_CREDITS",
    title: "Welcome to Collabry! 🎉",
    body: `You've received ${freeCredits} free credit${freeCredits === 1 ? "" : "s"} to get started. Use them to post a campaign or unlock creator profiles.`,
    ctaText: "Post a Campaign",
    ctaPath: "/home-brand/campaigns/new",
    isCelebration: true,
  }).catch(() => {});

  const accessToken = generateAccessToken(brandId, UserType.BRAND, getAccessSecret());
  const refreshToken = generateRefreshToken(brandId, UserType.BRAND);
  await saveRefreshToken(brandId, UserType.BRAND, refreshToken);

  res.cookie(REFRESH_COOKIE, refreshToken, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ ok: true, accessToken, brandId, brandName: brandName.trim(), freeCredits });
});

router.post("/auth/brand/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password, rememberMe } = req.body as { email: string; password: string; rememberMe?: boolean };

  if (!email || !password) { res.status(400).json({ error: "Email and password are required" }); return; }

  const result = await pool.query(
    `SELECT id, "brandName", "passwordHash", status FROM "Brand" WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );

  if (result.rows.length === 0) { res.status(401).json({ error: "Incorrect email or password" }); return; }

  const brand = result.rows[0];

  const valid = await comparePassword(password, brand.passwordHash);
  if (!valid) { res.status(401).json({ error: "Incorrect email or password" }); return; }

  if (brand.status === "SUSPENDED") {
    const supportEmail = await getSupportEmail();
    res.status(403).json({ error: `Your account has been suspended. Please contact support at ${supportEmail}` });
    return;
  }
  if (brand.status === "BANNED") {
    res.status(403).json({ error: "Your brand account is banned.", banned: true });
    return;
  }

  const maxAgeDays = rememberMe ? 30 : 1;
  const accessToken = generateAccessToken(brand.id, UserType.BRAND, getAccessSecret());
  const refreshToken = generateRefreshToken(brand.id, UserType.BRAND);
  await saveRefreshToken(brand.id, UserType.BRAND, refreshToken);

  res.cookie(REFRESH_COOKIE, refreshToken, { ...COOKIE_OPTIONS, maxAge: maxAgeDays * 24 * 60 * 60 * 1000 });
  res.json({ ok: true, accessToken, brandId: brand.id, brandName: brand.brandName });
});

router.post("/auth/brand/logout", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (refreshToken) {
    try { await revokeToken(refreshToken); } catch {}
  }
  res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.post("/auth/brand/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email: string };
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  const result = await pool.query(`SELECT id, "brandName" FROM "Brand" WHERE LOWER(email) = LOWER($1)`, [email.trim()]);

  if (result.rows.length === 0) {
    res.status(404).json({ error: "This email is not registered. Please check and try again." }); return;
  }

  const brand = result.rows[0];
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiry = new Date(Date.now() + 15 * 60 * 1000);

  await pool.query(
    `UPDATE "Brand" SET "passwordResetToken"=$1,"passwordResetTokenExpiry"=$2 WHERE id=$3`,
    [tokenHash, expiry, brand.id]
  );

  const baseUrl = process.env["APP_BASE_URL"] ?? "https://collabry.com";
  console.log(`[Password Reset] Brand: ${brand.brandName}, Token: ${token}, URL: ${baseUrl}/reset-password?token=${token}&type=brand, Expires: ${expiry}`);

  res.json({ ok: true, message: "A password reset link has been sent to your email address." });
});

router.post("/auth/brand/reset-password", async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as { token: string; password: string };
  if (!token || !password || password.length < 8) {
    res.status(400).json({ error: "Valid token and password (min 8 chars) are required" }); return;
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    `SELECT id FROM "Brand" WHERE "passwordResetToken"=$1 AND "passwordResetTokenExpiry" > NOW()`,
    [tokenHash]
  );

  if (result.rows.length === 0) { res.status(400).json({ error: "Invalid or expired reset token" }); return; }

  const passwordHash = await hashPassword(password);
  await pool.query(
    `UPDATE "Brand" SET "passwordHash"=$1,"passwordResetToken"=NULL,"passwordResetTokenExpiry"=NULL WHERE id=$2`,
    [passwordHash, result.rows[0].id]
  );

  await pool.query(`UPDATE "RefreshToken" SET revoked=true WHERE "userId"=$1 AND "userType"='BRAND'`, [result.rows[0].id]);

  res.json({ ok: true });
});

export default router;
