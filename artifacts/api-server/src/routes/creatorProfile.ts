import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCreator } from "../middleware/requireCreator";
import { hashPassword, comparePassword } from "../lib/auth";

const router: IRouter = Router();

// Get own profile
router.get("/creator/profile", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const [creatorR, catsR, portfolioR] = await Promise.all([
    pool.query(`SELECT id, email, "instagramHandle", "fullName", "dateOfBirth", phone, "profilePhotoUrl", bio,
                gender, state, "youtubeHandle", "otherSocialHandle",
                EXTRACT(YEAR FROM AGE(NOW(), "dateOfBirth"))::int as "creatorAge",
                "followerCount", "audienceGenderFemale", "audienceGenderMale", "audienceAge",
                "audienceLocation", "contentType", images, "pendingImages",
                "reelPriceMin", "reelPriceMax", "storyPriceMin", "storyPriceMax", "postPriceMin", "postPriceMax",
                "reelPricingLockedUntil", "storyPricingLockedUntil", "postPricingLockedUntil",
                "instagramHandleLockedUntil",
                status, "pendingReason", "pendingFollowerCount", "pendingInstagramHandle", "pendingPricing",
                "kycStatus", "averageRating", "ratingCount", "rejectionReason", "rejectionNote",
                "selectedSlabId", "createdAt", "updatedAt"
                FROM "Creator" WHERE id=$1`, [creatorId]),
    pool.query(`SELECT cc.*, cat.name as "categoryName", sub.name as "subcategoryName"
                FROM "CreatorCategory" cc
                JOIN "Category" cat ON cat.id=cc."categoryId"
                LEFT JOIN "Subcategory" sub ON sub.id=cc."subcategoryId"
                WHERE cc."creatorId"=$1 ORDER BY cc."displayOrder"`, [creatorId]),
    pool.query(`SELECT * FROM "CreatorPortfolio" WHERE "creatorId"=$1 ORDER BY "createdAt"`, [creatorId]),
  ]);
  if (creatorR.rows.length === 0) { res.status(404).json({ error: "Creator not found" }); return; }
  const creator = creatorR.rows[0];
  const fmt = (v: any) => v !== null && v !== undefined ? parseFloat(v) : null;
  ["reelPriceMin","reelPriceMax","storyPriceMin","storyPriceMax","postPriceMin","postPriceMax","averageRating"]
    .forEach(k => { creator[k] = fmt(creator[k]); });
  // Compute pricing cooldown server-side — client date irrelevant
  const LOCK_MS = 14 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const signupLockEnd = new Date(creator.createdAt).getTime() + LOCK_MS;
  const lockEnds = [
    signupLockEnd,
    creator.reelPricingLockedUntil ? new Date(creator.reelPricingLockedUntil).getTime() : 0,
    creator.storyPricingLockedUntil ? new Date(creator.storyPricingLockedUntil).getTime() : 0,
    creator.postPricingLockedUntil ? new Date(creator.postPricingLockedUntil).getTime() : 0,
  ];
  const msRemaining = Math.max(0, Math.max(...lockEnds) - nowMs);
  creator.pricingDaysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  // Compute username (Instagram handle) cooldown server-side — same 14-day pattern as pricing
  const usernameMsRemaining = Math.max(0, (creator.instagramHandleLockedUntil ? new Date(creator.instagramHandleLockedUntil).getTime() : 0) - nowMs);
  creator.usernameDaysRemaining = Math.ceil(usernameMsRemaining / (1000 * 60 * 60 * 24));
  res.json({ creator, categories: catsR.rows, portfolio: portfolioR.rows });
});

// Update profile (basic info, bio, etc.)
router.patch("/creator/profile", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { fullName, bio, profilePhotoUrl } = req.body as Record<string, any>;

  const sets: string[] = [];
  const params: unknown[] = [];
  const addSet = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}"=$${params.length}`); };

  if (fullName !== undefined && fullName.trim()) addSet("fullName", fullName.trim());
  if (bio !== undefined) addSet("bio", bio.trim().slice(0, 150) || null);
  if (profilePhotoUrl !== undefined) addSet("profilePhotoUrl", profilePhotoUrl);
  if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  params.push(creatorId);
  await pool.query(`UPDATE "Creator" SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

// Change creator password
router.patch("/creator/profile/password", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) { res.status(400).json({ error: "Current password and new password are required" }); return; }
  if (newPassword.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
  const result = await pool.query(`SELECT "passwordHash" FROM "Creator" WHERE id=$1`, [creatorId]);
  if (!result.rows[0]) { res.status(404).json({ error: "Creator not found" }); return; }
  const storedHash = result.rows[0].passwordHash ?? null;
  let valid = false;
  try { valid = await comparePassword(currentPassword, storedHash ?? ""); } catch { valid = false; }
  if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }
  let sameAsCurrent = false;
  try { sameAsCurrent = storedHash ? await comparePassword(newPassword, storedHash) : false; } catch { sameAsCurrent = false; }
  if (sameAsCurrent) { res.status(400).json({ error: "New password must be different from current password" }); return; }
  const newHash = await hashPassword(newPassword);
  await pool.query(`UPDATE "Creator" SET "passwordHash"=$1, "updatedAt"=NOW() WHERE id=$2`, [newHash, creatorId]);
  res.json({ ok: true });
});

// Update creator images — instant, no admin review
router.patch("/creator/profile/images", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const raw = (req.body as any)?.images;
  if (!Array.isArray(raw)) { res.status(400).json({ error: "images must be an array" }); return; }
  const images = raw.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 4);
  if (images.length < 4) { res.status(400).json({ error: "All 4 photos are required" }); return; }
  await pool.query(`UPDATE "Creator" SET images=$1, "updatedAt"=NOW() WHERE id=$2`, [images, creatorId]);
  res.json({ ok: true });
});

// Update audience details (instant, no re-review)
router.patch("/creator/audience", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { audienceGenderFemale, audienceGenderMale, audienceAge, audienceLocation, contentType } = req.body;

  const femaleP = parseInt(audienceGenderFemale ?? 0);
  const maleP = parseInt(audienceGenderMale ?? 0);
  if (femaleP + maleP !== 100) { res.status(400).json({ error: "Gender percentages must add up to 100" }); return; }

  await pool.query(
    `UPDATE "Creator" SET "audienceGenderFemale"=$1, "audienceGenderMale"=$2, "audienceAge"=$3,
     "audienceLocation"=$4, "contentType"=$5,
     "updatedAt"=NOW() WHERE id=$6`,
    [femaleP, maleP, audienceAge, audienceLocation, contentType, creatorId]
  );
  res.json({ ok: true });
});

// Update categories — instant, no admin review
router.patch("/creator/categories", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { categories } = req.body as { categories: { categoryId: string; subcategoryId?: string }[] };
  if (!categories || categories.length < 1) { res.status(400).json({ error: "At least 1 category required" }); return; }
  if (categories.length > 7) { res.status(400).json({ error: "You can select a maximum of 7 categories" }); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "CreatorCategory" WHERE "creatorId"=$1`, [creatorId]);
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      await client.query(
        `INSERT INTO "CreatorCategory" (id, "creatorId", "categoryId", "subcategoryId", "displayOrder")
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [creatorId, cat.categoryId, cat.subcategoryId ?? null, i]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ ok: true });
});

// Update pricing tier — applies immediately (no admin review); server-side 14-day cooldown, immune to client clock manipulation
router.patch("/creator/pricing/slab", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { slabId } = req.body as { slabId: string };
  if (!slabId) { res.status(400).json({ error: "slabId required" }); return; }

  const slabRes = await pool.query(`SELECT * FROM "FollowerSlab" WHERE id=$1 AND "isActive"=true`, [slabId]);
  if (!slabRes.rows.length) { res.status(400).json({ error: "Invalid or inactive pricing tier" }); return; }
  const slab = slabRes.rows[0];

  // All lock validation uses server NOW() — client date is irrelevant
  const crRes = await pool.query(
    `SELECT "createdAt", "reelPricingLockedUntil", "storyPricingLockedUntil", "postPricingLockedUntil" FROM "Creator" WHERE id=$1`,
    [creatorId]
  );
  const cr = crRes.rows[0];
  const now = new Date();
  const LOCK_MS = 14 * 24 * 60 * 60 * 1000;

  const signupLockEnd = new Date(new Date(cr.createdAt).getTime() + LOCK_MS);
  if (now < signupLockEnd) {
    const daysLeft = Math.ceil((signupLockEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    res.status(400).json({ error: "Pricing locked", daysRemaining: daysLeft }); return;
  }
  let latestLock = new Date(0);
  for (const t of ["reel", "story", "post"]) {
    const lockVal = cr[`${t}PricingLockedUntil`];
    if (lockVal && new Date(lockVal) > latestLock) latestLock = new Date(lockVal);
  }
  if (latestLock > now) {
    const daysLeft = Math.ceil((latestLock.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    res.status(400).json({ error: "Pricing locked", daysRemaining: daysLeft }); return;
  }

  // Apply directly — prices live immediately, lock for 14 days from server time
  const lockedUntil = new Date(now.getTime() + LOCK_MS);
  await pool.query(
    `UPDATE "Creator" SET
     "reelPriceMin"=$1, "reelPriceMax"=$2,
     "storyPriceMin"=$3, "storyPriceMax"=$4,
     "postPriceMin"=$5, "postPriceMax"=$6,
     "selectedSlabId"=$7,
     "reelPricingLockedUntil"=$8, "storyPricingLockedUntil"=$8, "postPricingLockedUntil"=$8,
     "updatedAt"=NOW() WHERE id=$9`,
    [
      Number(slab.recReelMin), Number(slab.recReelMax),
      Number(slab.recStoryMin), Number(slab.recStoryMax),
      Number(slab.recPostMin), Number(slab.recPostMax),
      slabId, lockedUntil, creatorId
    ]
  );
  res.json({ ok: true, lockedUntil: lockedUntil.toISOString() });
});

// Update pricing — applies immediately, no admin review; 14-day lock applies on submission
router.patch("/creator/pricing", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { type, min, max } = req.body as { type: "reel" | "story" | "post"; min: number; max: number };
  if (!["reel", "story", "post"].includes(type)) { res.status(400).json({ error: "Invalid type" }); return; }
  if (!min || !max || min > max) { res.status(400).json({ error: "Invalid price range" }); return; }

  const lockCol = `${type}PricingLockedUntil`;
  const minCol = `${type}PriceMin`;
  const maxCol = `${type}PriceMax`;
  const lockedUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const lockCheck = await pool.query(
    `SELECT "${lockCol}", "createdAt" FROM "Creator" WHERE id=$1`, [creatorId]
  );
  const row = lockCheck.rows[0];
  const now = new Date();

  const signupLockUntil = new Date(new Date(row.createdAt).getTime() + 14 * 24 * 60 * 60 * 1000);
  if (now < signupLockUntil) {
    res.status(400).json({ error: `Pricing can be changed after ${signupLockUntil.toLocaleDateString("en-IN")}`, lockedUntil: signupLockUntil.toISOString() }); return;
  }
  if (row[lockCol] && new Date(row[lockCol]) > now) {
    res.status(400).json({ error: `Pricing locked until ${new Date(row[lockCol]).toLocaleDateString("en-IN")}`, lockedUntil: row[lockCol] }); return;
  }

  // Apply prices directly — no PENDING status, no admin review required
  await pool.query(
    `UPDATE "Creator" SET "${minCol}"=$1, "${maxCol}"=$2, "${lockCol}"=$3, "updatedAt"=NOW() WHERE id=$4`,
    [min, max, lockedUntil, creatorId]
  );
  res.json({ ok: true, lockedUntil: lockedUntil.toISOString() });
});

// Update follower count (triggers re-review)
router.patch("/creator/follower-count", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { followerCount } = req.body as { followerCount: number };
  if (followerCount === undefined || followerCount < 0) { res.status(400).json({ error: "Invalid follower count" }); return; }
  const existing = await pool.query(`SELECT "pendingReason" FROM "Creator" WHERE id=$1`, [creatorId]);
  const existingReasons = (existing.rows[0]?.pendingReason ?? "").split("|").filter(Boolean);
  const newReason = [...(existingReasons as string[]).filter(r => r !== "RE_VERIFICATION"), "RE_VERIFICATION"].join("|");
  await pool.query(
    `UPDATE "Creator" SET "pendingFollowerCount"=$1, status='PENDING', "pendingReason"=$2, "updatedAt"=NOW() WHERE id=$3`,
    [Math.round(followerCount), newReason, creatorId]
  );
  res.json({ ok: true, reviewTriggered: true });
});

// Update username (Instagram handle) — triggers re-review, 14-day cooldown (mirrors follower-count + pricing lock)
router.patch("/creator/username", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { instagramHandle } = req.body as { instagramHandle?: string };
  const clean = (instagramHandle ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!clean) { res.status(400).json({ error: "Username is required" }); return; }
  if (!/^[a-zA-Z0-9_.]+$/.test(clean)) { res.status(400).json({ error: "Username can only contain letters, numbers, underscores, and periods" }); return; }

  const existing = await pool.query(
    `SELECT "instagramHandle", "pendingReason", "instagramHandleLockedUntil" FROM "Creator" WHERE id=$1`, [creatorId]
  );
  if (!existing.rows[0]) { res.status(404).json({ error: "Creator not found" }); return; }
  const row = existing.rows[0];

  // No-op if unchanged from the current live handle
  if (clean === String(row.instagramHandle).toLowerCase()) { res.status(400).json({ error: "This is already your username" }); return; }

  // 14-day cooldown — validated server-side (immune to client clock)
  const now = new Date();
  if (row.instagramHandleLockedUntil && new Date(row.instagramHandleLockedUntil) > now) {
    const daysLeft = Math.ceil((new Date(row.instagramHandleLockedUntil).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    res.status(400).json({ error: "Username locked", daysRemaining: daysLeft }); return;
  }

  // Uniqueness across Creator + Brand, excluding self
  const dupe = await pool.query(
    `SELECT 1 FROM "Creator" WHERE LOWER("instagramHandle")=$1 AND id<>$2
     UNION ALL SELECT 1 FROM "Brand" WHERE LOWER("instagramHandle")=$1 LIMIT 1`,
    [clean, creatorId]
  );
  if (dupe.rows.length > 0) { res.status(400).json({ error: "This username is already linked to a Collabry account." }); return; }

  const existingReasons = (row.pendingReason ?? "").split("|").filter(Boolean);
  const newReason = [...(existingReasons as string[]).filter(r => r !== "RE_VERIFICATION"), "RE_VERIFICATION"].join("|");
  const lockedUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await pool.query(
    `UPDATE "Creator" SET "pendingInstagramHandle"=$1, status='PENDING', "pendingReason"=$2,
     "instagramHandleLockedUntil"=$3, "updatedAt"=NOW() WHERE id=$4`,
    [clean, newReason, lockedUntil, creatorId]
  );
  res.json({ ok: true, reviewTriggered: true, lockedUntil: lockedUntil.toISOString() });
});

// Update phone number — uniqueness check across both tables, excludes self
router.patch("/creator/phone", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { phone } = req.body as { phone?: string };
  if (!phone?.trim()) { res.status(400).json({ error: "Phone number is required" }); return; }
  const clean = phone.trim().replace(/\D/g, "");
  if (!/^\d{10}$/.test(clean)) { res.status(400).json({ error: "Phone must be exactly 10 digits" }); return; }
  const check = await pool.query(
    `SELECT 1 FROM "Creator" WHERE phone=$1 AND id<>$2
     UNION ALL
     SELECT 1 FROM "BrandCustomFieldValue" v
       JOIN "BrandSignupField" f ON f.id=v."fieldId"
       WHERE f."fieldType"='tel' AND v.value=$1
     LIMIT 1`,
    [clean, creatorId]
  );
  if (check.rows.length > 0) { res.status(400).json({ error: "This phone number is already linked to another account" }); return; }
  await pool.query(`UPDATE "Creator" SET phone=$1, "updatedAt"=NOW() WHERE id=$2`, [clean, creatorId]);
  res.json({ ok: true });
});

// Update basic profile + social handles (no re-review)
router.patch("/creator/profile/basic", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { fullName, bio, youtubeHandle, otherSocialHandle, gender, state } = req.body as Record<string, any>;
  const sets: string[] = []; const params: unknown[] = [];
  const addSet = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}"=$${params.length}`); };
  if (fullName !== undefined && fullName.trim()) addSet("fullName", fullName.trim());
  if (bio !== undefined) addSet("bio", bio.trim().slice(0, 150) || null);
  if (youtubeHandle !== undefined) addSet("youtubeHandle", youtubeHandle.trim() || null);
  if (otherSocialHandle !== undefined) addSet("otherSocialHandle", otherSocialHandle.trim() || null);
  if (gender !== undefined) addSet("gender", gender.trim() || null);
  if (state !== undefined) addSet("state", state?.trim() || null);
  if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  params.push(creatorId);
  await pool.query(`UPDATE "Creator" SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

// Portfolio: add video
router.post("/creator/portfolio", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { videoUrl, selfDeclared } = req.body as { videoUrl?: string; selfDeclared?: boolean };
  if (!videoUrl?.trim()) { res.status(400).json({ error: "Video URL is required" }); return; }

  const result = await pool.query(
    `INSERT INTO "CreatorPortfolio" (id, "creatorId", "videoUrl", "selfDeclared", "createdAt")
     VALUES (gen_random_uuid(),$1,$2,$3,NOW()) RETURNING *`,
    [creatorId, videoUrl.trim(), selfDeclared ?? true]
  );
  res.json(result.rows[0]);
});

// Portfolio: remove video
router.delete("/creator/portfolio/:portfolioId", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { portfolioId } = req.params as Record<string, string>;

  await pool.query(`DELETE FROM "CreatorPortfolio" WHERE id=$1 AND "creatorId"=$2`, [portfolioId, creatorId]);
  res.json({ ok: true });
});

// KYC: get active fields for creator to fill (public to creator)
router.get("/creator/kyc/fields", requireCreator, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT id, label, "fieldType", "isRequired" FROM "KYCField" WHERE "isActive"=true ORDER BY "displayOrder", "createdAt"`
  );
  res.json(r.rows);
});

// KYC: get existing data already submitted
router.get("/creator/kyc/data", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const r = await pool.query(`SELECT "fieldId", "fieldLabel", value, "fileUrl" FROM "KYCData" WHERE "creatorId"=$1`, [creatorId]);
  res.json(r.rows);
});

router.post("/creator/kyc/submit", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { fields } = req.body as { fields?: Array<{ fieldId: string; fieldLabel: string; value: string }> };

  const cr = await pool.query(`SELECT "kycStatus" FROM "Creator" WHERE id=$1`, [creatorId]);
  if (!cr.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const status = cr.rows[0].kycStatus;
  if (status === "VERIFIED") { res.status(400).json({ error: "Already verified" }); return; }
  if (status === "SUBMITTED") { res.status(400).json({ error: "Already submitted and under review" }); return; }

  // Get active required KYC fields
  const activeFields = await pool.query(
    `SELECT id, label, "isRequired" FROM "KYCField" WHERE "isActive"=true ORDER BY "displayOrder"`
  );

  if (activeFields.rows.length > 0) {
    if (!Array.isArray(fields) || fields.length === 0) {
      res.status(400).json({ error: "Please fill in all required KYC fields" }); return;
    }
    // Validate required fields are provided
    const provided = new Map((fields ?? []).map(f => [f.fieldId, f.value]));
    for (const af of activeFields.rows) {
      if (af.isRequired && !provided.get(af.id)?.trim()) {
        res.status(400).json({ error: `"${af.label}" is required` }); return;
      }
    }
    // Save KYC field values — upsert per field
    for (const f of (fields ?? [])) {
      if (!f.fieldId || !f.value?.trim()) continue;
      const isFile =
        f.value.startsWith("/api/storage/private/") ||
        f.value.startsWith("data:"); // legacy compat
      const textVal = isFile ? "[File uploaded]" : f.value.trim();
      const fileUrl = isFile ? f.value : null;
      await pool.query(
        `INSERT INTO "KYCData" (id,"creatorId","fieldId","fieldLabel",value,"fileUrl","createdAt","updatedAt")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,NOW(),NOW())
         ON CONFLICT ("creatorId","fieldId") DO UPDATE SET value=$4,"fileUrl"=$5,"updatedAt"=NOW()`,
        [creatorId, f.fieldId, f.fieldLabel ?? "", textVal, fileUrl]
      );
    }
  }

  await pool.query(
    `UPDATE "Creator" SET "kycStatus"='SUBMITTED', "kycSubmittedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1`,
    [creatorId]
  );
  res.json({ ok: true });
});

export default router;
