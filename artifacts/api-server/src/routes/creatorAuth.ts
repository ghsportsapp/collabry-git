import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getSupportEmail } from "../lib/supportEmail";
import {
  hashPassword, comparePassword, generateAccessToken,
  generateRefreshToken, getAccessSecret, UserType, verifyToken,
} from "../lib/auth";
import { saveRefreshToken, revokeToken, rotateRefreshToken } from "../lib/session";
import { sendEmail } from "../lib/email";
import { renderPasswordResetEmail } from "../lib/notificationEmail";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router: IRouter = Router();
const REFRESH_COOKIE = "collabry_creator_refresh";
const RESET_TOKEN_TTL_MINUTES = 60;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  path: "/",
};

// Check handle availability
router.get("/creators/check-handle", async (req: Request, res: Response): Promise<void> => {
  const handle = (req.query["handle"] as string)?.trim().replace(/^@/, "").toLowerCase();
  if (!handle) { res.status(400).json({ error: "Handle required" }); return; }
  const r = await pool.query(
    `SELECT 1 FROM "Creator" WHERE LOWER("instagramHandle")=$1
     UNION ALL SELECT 1 FROM "Brand" WHERE LOWER("instagramHandle")=$1 LIMIT 1`,
    [handle]
  );
  res.json({ available: r.rows.length === 0 });
});

// Check phone availability — cross-table (Creator + Brand tel custom fields)
router.get("/creators/check-phone", async (req: Request, res: Response): Promise<void> => {
  const phone = (req.query["phone"] as string)?.trim();
  if (!phone) { res.status(400).json({ error: "Phone required" }); return; }
  const r = await pool.query(
    `SELECT 1 FROM "Creator" WHERE phone=$1
     UNION ALL
     SELECT 1 FROM "BrandCustomFieldValue" v
       JOIN "BrandSignupField" f ON f.id=v."fieldId"
       WHERE f."fieldType"='tel' AND v.value=$1
     LIMIT 1`,
    [phone]
  );
  res.json({ available: r.rows.length === 0 });
});

// Check email availability — cross-table (Creator + Brand)
router.get("/creators/check-email", async (req: Request, res: Response): Promise<void> => {
  const email = (req.query["email"] as string)?.trim().toLowerCase();
  if (!email) { res.status(400).json({ error: "Email required" }); return; }
  const r = await pool.query(
    `SELECT 1 FROM "Creator" WHERE LOWER(email)=$1
     UNION ALL SELECT 1 FROM "Brand" WHERE LOWER(email)=$1 LIMIT 1`,
    [email]
  );
  res.json({ available: r.rows.length === 0 });
});

// Creator signup
router.post("/auth/creator/signup", async (req: Request, res: Response): Promise<void> => {
  const {
    instagramHandle, profilePhotoUrl, followerCount,
    fullName, dateOfBirth, phone, password,
    gender,
    categories = [],
    audienceGenderFemale, audienceGenderMale, audienceAge, audienceLocation,
    contentType,
    campaignGoal,
    purchaseBehaviour,
    selectedSlabId,
    reelPriceMin, reelPriceMax, storyPriceMin, storyPriceMax, postPriceMin, postPriceMax,
    portfolio = [],
    bio, youtubeHandle: ytHandle, otherSocialHandle,
    email, state,
    customFieldValues = [],
  } = req.body as Record<string, any>;

  // Basic validation
  if (!instagramHandle?.trim()) { res.status(400).json({ error: "Instagram handle is required" }); return; }
  if (!profilePhotoUrl) { res.status(400).json({ error: "Profile photo is required" }); return; }
  if (!followerCount || followerCount < 1) { res.status(400).json({ error: "Follower count is required" }); return; }
  if (!fullName?.trim()) { res.status(400).json({ error: "Full name is required" }); return; }
  if (!dateOfBirth) { res.status(400).json({ error: "Date of birth is required" }); return; }
  if (!phone?.trim()) { res.status(400).json({ error: "Phone number is required" }); return; }
  // Strip non-digits and validate exactly 10 digits
  const cleanPhone = (() => {
    const d = phone.trim().replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return d.slice(1);
    return d;
  })();
  if (!/^\d{10}$/.test(cleanPhone)) { res.status(400).json({ error: "Please enter a valid 10-digit phone number" }); return; }
  if (!password || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
  if (!categories || categories.length < 1) { res.status(400).json({ error: "At least one category is required" }); return; }
  if (categories.length > 7) { res.status(400).json({ error: "You can select a maximum of 7 categories" }); return; }
  // Portfolio is optional during signup — creators can add it later from home page
  if (!email?.trim()) { res.status(400).json({ error: "Email address is required" }); return; }
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { res.status(400).json({ error: "Please enter a valid email address" }); return; }

  // Age validation
  const dob = new Date(dateOfBirth);
  const ageMs = Date.now() - dob.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 14) { res.status(400).json({ error: "You must be at least 14 years old to join Collabry" }); return; }

  // Audience validation
  const femaleP = parseInt(audienceGenderFemale ?? 0);
  const maleP = parseInt(audienceGenderMale ?? 0);
  if (femaleP + maleP !== 100) { res.status(400).json({ error: "Audience gender percentages must add up to 100" }); return; }

  // Pricing validation
  if (!reelPriceMin || !reelPriceMax || !storyPriceMin || !storyPriceMax || !postPriceMin || !postPriceMax) {
    res.status(400).json({ error: "All pricing fields are required" }); return;
  }

  const cleanHandle = instagramHandle.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-zA-Z0-9_.]+$/.test(cleanHandle)) { res.status(400).json({ error: "Instagram handle can only contain letters, numbers, underscores, and periods" }); return; }

  // Uniqueness checks (check both Creator and Brand tables)
  const handleCheck = await pool.query(
    `SELECT 1 FROM "Creator" WHERE LOWER("instagramHandle")=$1
     UNION ALL SELECT 1 FROM "Brand" WHERE LOWER("instagramHandle")=$1 LIMIT 1`,
    [cleanHandle]
  );
  if (handleCheck.rows.length > 0) { res.status(400).json({ error: "This Instagram username is already linked to a Collabry account." }); return; }

  const phoneCheck = await pool.query(
    `SELECT 1 FROM "Creator" WHERE phone=$1
     UNION ALL
     SELECT 1 FROM "BrandCustomFieldValue" v
       JOIN "BrandSignupField" f ON f.id=v."fieldId"
       WHERE f."fieldType"='tel' AND v.value=$1
     LIMIT 1`,
    [cleanPhone]
  );
  if (phoneCheck.rows.length > 0) { res.status(400).json({ error: "This phone number is already registered" }); return; }

  const emailCheck = await pool.query(
    `SELECT 1 FROM "Creator" WHERE LOWER(email)=$1
     UNION ALL SELECT 1 FROM "Brand" WHERE LOWER(email)=$1 LIMIT 1`,
    [cleanEmail]
  );
  if (emailCheck.rows.length > 0) { res.status(400).json({ error: "This email address is already registered" }); return; }

  const passwordHash = await hashPassword(password);
  const creatorId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const imagesArr: string[] = Array.isArray((req.body as any).images)
      ? ((req.body as any).images as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 4)
      : [];
    if (imagesArr.length < 4) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "All 4 creator photos are required" });
      return;
    }

    await client.query(
      `INSERT INTO "Creator" (
        id, "instagramHandle", "instagramId", "fullName", "dateOfBirth", phone, gender,
        email, "profilePhotoUrl", bio, "youtubeHandle", "otherSocialHandle", "followerCount",
        "audienceGenderFemale", "audienceGenderMale", "audienceAge", "audienceLocation",
        "contentType",
        "campaignGoal",
        "purchaseBehaviour",
        "reelPriceMin", "reelPriceMax", "storyPriceMin", "storyPriceMax", "postPriceMin", "postPriceMax",
        "passwordHash", images, state, "audienceType", status, "kycStatus", "averageRating", "ratingCount",
        "hiddenFromSearch", "hiddenFromMatchmaking", "excludedFromMatchmaking",
        "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,'','PENDING','NOT_SUBMITTED',0,0,false,false,false,NOW(),NOW())`,
      [
        creatorId, cleanHandle, null, fullName.trim(), new Date(dateOfBirth), cleanPhone, gender?.trim() || null,
        cleanEmail, profilePhotoUrl || null, bio?.trim() || null, ytHandle?.trim() || null, otherSocialHandle?.trim() || null,
        parseInt(followerCount),
        femaleP, maleP, audienceAge, audienceLocation,
        contentType, campaignGoal?.trim() || contentType || "Brand Collaborations",
        purchaseBehaviour?.trim() || contentType || "Brand Collaborations",
        parseFloat(reelPriceMin), parseFloat(reelPriceMax),
        parseFloat(storyPriceMin), parseFloat(storyPriceMax),
        parseFloat(postPriceMin), parseFloat(postPriceMax),
        passwordHash, imagesArr, state?.trim() || null,
      ]
    );

    // Categories
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i] as { categoryId: string; subcategoryId?: string };
      await client.query(
        `INSERT INTO "CreatorCategory" (id, "creatorId", "categoryId", "subcategoryId", "displayOrder")
         VALUES (gen_random_uuid(),$1,$2,$3,$4)`,
        [creatorId, cat.categoryId, cat.subcategoryId || null, i]
      );
    }

    // Portfolio
    for (const item of portfolio as { videoUrl: string; selfDeclared: boolean }[]) {
      if (item.videoUrl?.trim()) {
        await client.query(
          `INSERT INTO "CreatorPortfolio" (id, "creatorId", "videoUrl", "selfDeclared", "createdAt")
           VALUES (gen_random_uuid(),$1,$2,$3,NOW())`,
          [creatorId, item.videoUrl.trim(), item.selfDeclared ?? true]
        );
      }
    }

    // Custom field values
    for (const cfv of customFieldValues as { fieldId: string; value: string }[]) {
      if (cfv.fieldId) {
        await client.query(
          `INSERT INTO "CreatorCustomFieldValue" (id, "creatorId", "fieldId", value, "updatedAt")
           VALUES (gen_random_uuid(),$1,$2,$3,NOW())
           ON CONFLICT ("creatorId","fieldId") DO UPDATE SET value=$3, "updatedAt"=NOW()`,
          [creatorId, cfv.fieldId, cfv.value ?? ""]
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const accessToken = generateAccessToken(creatorId, UserType.CREATOR, getAccessSecret());
  const refreshToken = generateRefreshToken(creatorId, UserType.CREATOR);
  await saveRefreshToken(creatorId, UserType.CREATOR, refreshToken);

  res.cookie(REFRESH_COOKIE, refreshToken, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ accessToken, creatorId, fullName: fullName.trim() });
});

// Creator login
router.post("/auth/creator/login", async (req: Request, res: Response): Promise<void> => {
  const { instagramHandle, phone, password } = req.body as { instagramHandle?: string; phone?: string; password?: string };
  const identifier = instagramHandle?.trim().replace(/^@/, "").toLowerCase() || phone?.trim();
  if (!identifier || !password) { res.status(400).json({ error: "Instagram handle and password are required" }); return; }

  const result = await pool.query(
    `SELECT id, "fullName", "passwordHash", status, "rejectionReason", "rejectionNote"
     FROM "Creator"
     WHERE LOWER("instagramHandle")=$1 OR phone=$1`,
    [identifier]
  );
  if (result.rows.length === 0) { res.status(401).json({ error: "Incorrect Instagram handle or password" }); return; }

  const creator = result.rows[0];
  const match = await comparePassword(password, creator.passwordHash);
  if (!match) { res.status(401).json({ error: "Incorrect username or password. Please try again." }); return; }

  if (creator.status === "SUSPENDED") {
    const supportEmail = await getSupportEmail();
    res.status(403).json({ error: `Your account has been suspended. Please contact ${supportEmail}` }); return;
  }
  if (creator.status === "BANNED") {
    res.status(403).json({ error: "Your Collabry account is banned.", banned: true }); return;
  }

  const accessToken = generateAccessToken(creator.id, UserType.CREATOR, getAccessSecret());
  const refreshToken = generateRefreshToken(creator.id, UserType.CREATOR);
  await saveRefreshToken(creator.id, UserType.CREATOR, refreshToken);

  res.cookie(REFRESH_COOKIE, refreshToken, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({
    accessToken, creatorId: creator.id, fullName: creator.fullName,
    status: creator.status,
    rejectionReason: creator.rejectionReason,
    rejectionNote: creator.rejectionNote,
  });
});

// Forgot password
router.post("/auth/creator/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) { res.status(400).json({ error: "Email address is required" }); return; }

  const result = await pool.query(
    `SELECT id, "instagramHandle" FROM "Creator" WHERE LOWER(email)=LOWER($1)`,
    [email.trim()]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: "This email is not registered. Please check and try again." }); return;
  }

  const creator = result.rows[0];
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiry = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await pool.query(
    `UPDATE "Creator" SET "passwordResetToken"=$1, "passwordResetTokenExpiry"=$2 WHERE id=$3`,
    [tokenHash, expiry, creator.id]
  );

  const baseUrl = (process.env["APP_BASE_URL"] ?? "https://collabry.co").replace(/\/$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${token}&type=creator`;
  try {
    await sendEmail({
      to: email.trim(),
      ...renderPasswordResetEmail({ resetUrl, expiresMinutes: RESET_TOKEN_TTL_MINUTES }),
    });
  } catch (err) {
    logger.error({ err, creatorId: creator.id }, "Failed to send creator password reset email");
    res.status(502).json({ error: "We couldn't send the reset email right now. Please try again in a moment." });
    return;
  }

  res.json({ ok: true, message: "A password reset link has been sent to your email address." });
});

// Reset password
router.post("/auth/creator/reset-password", async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as { token: string; password: string };
  if (!token || !password || password.length < 8) {
    res.status(400).json({ error: "Valid token and password (min 8 chars) are required" }); return;
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    `SELECT id FROM "Creator" WHERE "passwordResetToken"=$1 AND "passwordResetTokenExpiry" > NOW()`,
    [tokenHash]
  );

  if (result.rows.length === 0) { res.status(400).json({ error: "Invalid or expired reset token" }); return; }

  const passwordHash = await hashPassword(password);
  await pool.query(
    `UPDATE "Creator" SET "passwordHash"=$1, "passwordResetToken"=NULL, "passwordResetTokenExpiry"=NULL WHERE id=$2`,
    [passwordHash, result.rows[0].id]
  );
  await pool.query(`UPDATE "RefreshToken" SET revoked=true WHERE "userId"=$1 AND "userType"='CREATOR'`, [result.rows[0].id]);

  res.json({ ok: true });
});

// Logout
router.post("/auth/creator/logout", async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeToken(token).catch(() => {});
  res.clearCookie(REFRESH_COOKIE, { ...COOKIE_OPTIONS });
  res.json({ ok: true });
});

// Refresh token
router.post("/auth/creator/refresh", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!refreshToken) { res.status(401).json({ error: "No refresh token" }); return; }

  let payload;
  try { payload = verifyToken(refreshToken, getAccessSecret()); }
  catch { res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS); res.status(401).json({ error: "Invalid refresh token" }); return; }

  if (payload.userType !== UserType.CREATOR) { res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS); res.status(401).json({ error: "Invalid token type" }); return; }

  const result = await rotateRefreshToken(refreshToken, payload.userId, UserType.CREATOR);
  if (!result.ok) { res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS); res.status(401).json({ error: result.reason }); return; }

  const accessToken = generateAccessToken(payload.userId, UserType.CREATOR, getAccessSecret());
  res.cookie(REFRESH_COOKIE, result.newToken, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ accessToken, userId: payload.userId, userType: "CREATOR" });
});

export default router;
