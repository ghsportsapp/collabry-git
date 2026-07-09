import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { createNotification } from "../lib/notifications";
import { createPopup } from "../lib/popups";
import { addBrandSSE, removeBrandSSE } from "../lib/sseManager";
import { verifyToken, getAccessSecret } from "../lib/auth";
import { activateCreditHoldCampaigns } from "../lib/creditHoldActivation";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface FulfillResult {
  status: "credited" | "duplicate" | "brand_not_found";
  newBalance?: number;
  orderRef?: string;
}

/**
 * Idempotently grant purchased credits for a completed Razorpay payment.
 * Shared by the synchronous verify-payment endpoint and the async webhook so
 * whichever lands first credits the brand and the other is a no-op. Idempotency
 * key is the Razorpay payment id, stored as `paymentReferenceId`.
 */
async function fulfillCreditPurchase(opts: {
  brandId: string;
  quantity: number;
  paymentId: string;
  amountInr: number;
  gstAmountInr: number;
}): Promise<FulfillResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dup = await client.query(
      `SELECT id FROM "CreditTransaction" WHERE "paymentReferenceId"=$1`,
      [opts.paymentId],
    );
    if (dup.rows.length > 0) {
      await client.query("COMMIT");
      return { status: "duplicate" };
    }
    const countRow = await client.query(
      `SELECT COUNT(*) FROM "CreditTransaction" WHERE "transactionType"='PURCHASED'`,
    );
    const seq = parseInt(countRow.rows[0].count as string) + 1;
    const orderRef = `CLBcredit${String(seq).padStart(6, "0")}`;
    const upd = await client.query(
      `UPDATE "Brand" SET "creditBalance" = "creditBalance" + $1, "updatedAt"=NOW() WHERE id=$2 RETURNING "creditBalance"`,
      [opts.quantity, opts.brandId],
    );
    if (upd.rows.length === 0) {
      await client.query("ROLLBACK");
      return { status: "brand_not_found" };
    }
    const newBalance = upd.rows[0].creditBalance as number;
    await client.query(
      `INSERT INTO "CreditTransaction"
         (id,"brandId","transactionType",amount,"balanceAfter","paymentReferenceId","orderId","credits","amountInr","gstAmountInr","createdAt")
       VALUES (gen_random_uuid(),$1,'PURCHASED',$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [opts.brandId, opts.quantity, newBalance, opts.paymentId, orderRef, opts.quantity, opts.amountInr, opts.gstAmountInr],
    );
    await client.query("COMMIT");
    // In-app + email notification on a completed purchase (fire-and-forget).
    void createNotification({
      userId: opts.brandId,
      userType: "BRAND",
      type: "PAYMENT_SUCCESS",
      title: "Payment successful",
      body: `${opts.quantity} credit${opts.quantity > 1 ? "s" : ""} added to your account.`,
    }).catch(() => {});
    return { status: "credited", newBalance, orderRef };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ── Helper: read PlatformConfig list/value ──
async function readConfigJson(key: string): Promise<Array<{ label: string; isActive?: boolean }>> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [key]);
  if (r.rows.length === 0) return [];
  try {
    const parsed = JSON.parse(r.rows[0].value);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch { return []; }
}

async function readConfigNumber(key: string, fallback: number): Promise<number> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [key]);
  if (r.rows.length === 0) return fallback;
  const n = parseFloat(r.rows[0].value);
  return isNaN(n) ? fallback : n;
}

// ── GET /api/brand/search/filter-options ──
// Returns all dynamic filter options sourced from admin config.
router.get("/brand/search/filter-options", requireBrand, async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const [slabsRes, catRes, audienceAges, audienceLocations, minTimeline, commission, personalFieldsRow] = await Promise.all([
    pool.query(`SELECT id, label, "minFollowers", "maxFollowers" FROM "FollowerSlab" WHERE "isActive"=true ORDER BY "minFollowers" ASC`),
    pool.query(`SELECT id, name FROM "Category" ORDER BY name ASC`),
    readConfigJson("creator_audience_age_groups"),
    readConfigJson("creator_audience_locations"),
    readConfigNumber("min_timeline_days", 14),
    readConfigNumber("commission_rate", 5),
    pool.query(`SELECT value FROM "PlatformConfig" WHERE key='creator_personal_fields'`),
  ]);

  let creatorImagesEnabled = true;
  try {
    if (personalFieldsRow.rows.length > 0) {
      const arr = JSON.parse(personalFieldsRow.rows[0].value);
      if (Array.isArray(arr)) {
        const imgField = arr.find((f: any) => f?.key === "creatorImages");
        if (imgField && imgField.visibility === "hidden") creatorImagesEnabled = false;
      }
    }
  } catch { /* default true */ }

  // Creator's age — fixed buckets (since this is creator's actual age, derived from dateOfBirth)
  const creatorAgeBuckets = [
    { label: "14-17", min: 14, max: 17 },
    { label: "18-24", min: 18, max: 24 },
    { label: "25-34", min: 25, max: 34 },
    { label: "35-44", min: 35, max: 44 },
    { label: "45+", min: 45, max: 999 },
  ];

  res.json({
    slabs: slabsRes.rows.map(s => ({
      id: s.id, label: s.label,
      minFollowers: s.minFollowers as number,
      maxFollowers: s.maxFollowers as number | null,
    })),
    categories: catRes.rows,
    creatorAges: creatorAgeBuckets,
    creatorGenders: ["Male", "Female", "Other"],
    audienceAges: audienceAges.filter(x => x.isActive !== false).map(x => x.label),
    audienceLocations: audienceLocations.filter(x => x.isActive !== false).map(x => x.label),
    creatorStates: [
      "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
      "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
      "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
      "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh",
      "Uttarakhand","West Bengal",
      "Andaman & Nicobar Islands","Chandigarh","Dadra & Nagar Haveli and Daman & Diu",
      "Delhi","Jammu & Kashmir","Ladakh","Lakshadweep","Puducherry",
    ],
    minTimelineDays: minTimeline,
    commissionRate: commission,
    creatorImagesEnabled,
  });
});

// ── GET /api/brand/search/creators-all ──
// Returns ALL active creators (no slab gate). AND across filters, OR within multi-select.
router.get("/brand/search/creators-all", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const page = Math.max(1, parseInt((req.query["page"] as string) ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt((req.query["limit"] as string) ?? "24") || 24));
  const offset = (page - 1) * limit;
  const sort = (req.query["sort"] as string) || "followers";

  // filterParams holds only filter values ($1, $2, ...).
  // brandId is appended at the end for listSql only (as $N where N = filterParams.length + 1).
  const filterParams: any[] = [];
  const where: string[] = [
    `c.status='ACTIVE'`,
    `c."hiddenFromSearch"=false`,
  ];

  // Followers slab (multi-select — OR across selected slabs)
  const slabIdRaw = req.query["slabId"];
  const slabIdList = slabIdRaw ? (Array.isArray(slabIdRaw) ? slabIdRaw as string[] : [slabIdRaw as string]) : [];
  if (slabIdList.length > 0) {
    const slabRes = await pool.query(
      `SELECT "minFollowers","maxFollowers" FROM "FollowerSlab" WHERE id=ANY($1::text[])`,
      [slabIdList]
    );
    const slabConds: string[] = [];
    for (const row of slabRes.rows) {
      const minF = row.minFollowers as number;
      const maxF = row.maxFollowers as number | null;
      filterParams.push(minF);
      const minIdx = filterParams.length;
      if (maxF !== null) {
        filterParams.push(maxF);
        const maxIdx = filterParams.length;
        slabConds.push(`(c."followerCount" >= $${minIdx} AND c."followerCount" <= $${maxIdx})`);
      } else {
        slabConds.push(`(c."followerCount" >= $${minIdx})`);
      }
    }
    if (slabConds.length > 0) where.push(`(${slabConds.join(" OR ")})`);
  }

  // Categories (OR within, AND across)
  const cats = (req.query["category"] ?? req.query["categories"]) as string | string[] | undefined;
  const catList = cats ? (Array.isArray(cats) ? cats : [cats]) : [];
  if (catList.length > 0) {
    filterParams.push(catList);
    where.push(`EXISTS (SELECT 1 FROM "CreatorCategory" cc WHERE cc."creatorId"=c.id AND cc."categoryId"=ANY($${filterParams.length}::text[]))`);
  }

  // Creator's age (multi-select buckets via dateOfBirth)
  const cAges = req.query["creatorAge"] as string | string[] | undefined;
  const cAgeList = cAges ? (Array.isArray(cAges) ? cAges : [cAges]) : [];
  if (cAgeList.length > 0) {
    const conds: string[] = [];
    for (const bucket of cAgeList) {
      const m = bucket.match(/^(\d+)(?:-(\d+))?(\+)?$/);
      if (!m) continue;
      const min = parseInt(m[1]!);
      const max = m[2] ? parseInt(m[2]) : 999;
      filterParams.push(min); const minIdx = filterParams.length;
      filterParams.push(max); const maxIdx = filterParams.length;
      conds.push(`(EXTRACT(YEAR FROM AGE(NOW(), c."dateOfBirth")) BETWEEN $${minIdx} AND $${maxIdx})`);
    }
    if (conds.length > 0) where.push(`(${conds.join(" OR ")})`);
  }

  // Creator gender (multi-select; case-insensitive; "Other" = any gender not Male/Female)
  const cGenders = req.query["creatorGender"] as string | string[] | undefined;
  const cGenderList = cGenders ? (Array.isArray(cGenders) ? cGenders : [cGenders]) : [];
  if (cGenderList.length > 0) {
    const conds: string[] = [];
    if (cGenderList.some(g => g.toLowerCase() === "male")) conds.push(`LOWER(c.gender) = 'male'`);
    if (cGenderList.some(g => g.toLowerCase() === "female")) conds.push(`LOWER(c.gender) = 'female'`);
    if (cGenderList.some(g => g.toLowerCase() === "other")) conds.push(`(LOWER(c.gender) NOT IN ('male','female') AND c.gender IS NOT NULL)`);
    if (conds.length > 0) where.push(`(${conds.join(" OR ")})`);
  }

  // Audience age (multi-select)
  const aAges = req.query["audienceAge"] as string | string[] | undefined;
  const aAgeList = aAges ? (Array.isArray(aAges) ? aAges : [aAges]) : [];
  if (aAgeList.length > 0) {
    const conds = aAgeList.map(a => { filterParams.push(`%${a}%`); return `c."audienceAge" ILIKE $${filterParams.length}`; });
    where.push(`(${conds.join(" OR ")})`);
  }

  // Audience location (multi-select)
  const aLocs = req.query["audienceLocation"] as string | string[] | undefined;
  const aLocList = aLocs ? (Array.isArray(aLocs) ? aLocs : [aLocs]) : [];
  if (aLocList.length > 0) {
    const conds = aLocList.map(l => { filterParams.push(`%${l}%`); return `c."audienceLocation" ILIKE $${filterParams.length}`; });
    where.push(`(${conds.join(" OR ")})`);
  }

  // Creator state (multi-select exact match)
  const cStates = req.query["creatorState"] as string | string[] | undefined;
  const cStateList = cStates ? (Array.isArray(cStates) ? cStates : [cStates]) : [];
  if (cStateList.length > 0) {
    const conds = cStateList.map(st => { filterParams.push(st); return `c.state = $${filterParams.length}`; });
    where.push(`(${conds.join(" OR ")})`);
  }

  let orderBy = `c."followerCount" DESC`;
  if (sort === "newest") orderBy = `c."createdAt" DESC`;
  else if (sort === "rating") orderBy = `c."averageRating" DESC NULLS LAST`;
  else if (sort === "price-low") orderBy = `c."reelPriceMin" ASC NULLS LAST`;

  // brandId appended last — only needed in listSql for the isUnlocked subquery
  const brandParamIdx = filterParams.length + 1;
  const listParams = [...filterParams, brandId];

  const whereClause = where.join(" AND ");
  const countSql = `SELECT COUNT(*)::int as c FROM "Creator" c WHERE ${whereClause}`;
  const listSql = `
    SELECT c.id, c."followerCount", c."audienceGenderFemale", c."audienceGenderMale",
           c."audienceAge", c."audienceLocation", c.state, c.gender,
           c."averageRating", c."ratingCount", c."dateOfBirth",
           c."reelPriceMin", c."reelPriceMax", c."storyPriceMin", c."storyPriceMax",
           c."postPriceMin", c."postPriceMax",
           c."profilePhotoUrl", c."fullName", c.images,
           EXTRACT(YEAR FROM AGE(NOW(), c."dateOfBirth"))::int as "creatorAge",
           EXISTS (SELECT 1 FROM "BrandUnlockRecord" u WHERE u."brandId"=$${brandParamIdx} AND u."creatorId"=c.id) as "isUnlocked",
           (SELECT json_agg(json_build_object('id', cat.id, 'name', cat.name))
            FROM "CreatorCategory" cc JOIN "Category" cat ON cat.id=cc."categoryId" WHERE cc."creatorId"=c.id) as categories
    FROM "Creator" c
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}`;

  const [list, count] = await Promise.all([pool.query(listSql, listParams), pool.query(countSql, filterParams)]);
  const num = (v: any) => v == null ? null : parseFloat(v);
  res.json({
    creators: list.rows.map((c: any) => ({
      id: c.id,
      followerCount: c.followerCount,
      profilePhotoUrl: c.profilePhotoUrl ?? null,
      fullName: c.fullName ?? null,
      images: Array.isArray(c.images) ? c.images : [],
      audienceGenderFemale: c.audienceGenderFemale,
      audienceGenderMale: c.audienceGenderMale,
      audienceAge: c.audienceAge,
      audienceLocation: c.audienceLocation,
      state: c.state ?? null,
      gender: c.gender,
      contentType: c.contentType,
      creatorAge: c.creatorAge,
      averageRating: c.averageRating ? parseFloat(c.averageRating) : null,
      ratingCount: c.ratingCount,
      reelPriceMin: num(c.reelPriceMin), reelPriceMax: num(c.reelPriceMax),
      storyPriceMin: num(c.storyPriceMin), storyPriceMax: num(c.storyPriceMax),
      postPriceMin: num(c.postPriceMin), postPriceMax: num(c.postPriceMax),
      isUnlocked: c.isUnlocked,
      categories: c.categories ?? [],
    })),
    total: count.rows[0].c,
    page,
    totalPages: Math.ceil(count.rows[0].c / limit),
  });
});

// ── Helper: Compute credit breakdown with per-batch expiry ──
async function computeCreditBalance(brandId: string) {
  const b = await pool.query(
    `SELECT "creditBalance" FROM "Brand" WHERE id=$1`,
    [brandId]
  );
  if (b.rows.length === 0) return null;
  const total = b.rows[0].creditBalance as number;

  // Free credit grants — grouped by (expiresAt, transactionType)
  // Exclude rows where expiresAt is set AND already past
  const batchRes = await pool.query(
    `SELECT COALESCE(SUM(amount),0)::int as amount,
            "expiresAt",
            "transactionType" as type
     FROM "CreditTransaction"
     WHERE "brandId"=$1
       AND "transactionType" IN ('FREE_SIGNUP','ADMIN_GIFT')
       AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
     GROUP BY "expiresAt", "transactionType"
     ORDER BY "expiresAt" ASC NULLS LAST`,
    [brandId]
  );
  const rawBatches = batchRes.rows.map(r => ({
    amount: r.amount as number,
    expiresAt: r.expiresAt ? (r.expiresAt as Date).toISOString() : null,
    label: r.type === "FREE_SIGNUP" ? "Signup credits" : "Gift credits",
  }));

  const freeGrantTotal = rawBatches.reduce((s, b) => s + b.amount, 0);

  // Include purchased credits in total-issued so FIFO consumption is computed correctly
  const purchasedRes = await pool.query(
    `SELECT COALESCE(SUM(amount),0)::int AS amount FROM "CreditTransaction"
     WHERE "brandId"=$1 AND "transactionType"='PURCHASED'`,
    [brandId]
  );
  const purchasedGrantTotal = purchasedRes.rows[0].amount as number;

  const totalIssued = freeGrantTotal + purchasedGrantTotal;
  const totalConsumed = Math.max(0, totalIssued - total);
  // FIFO: free credits are spent first
  const consumedFree = Math.min(freeGrantTotal, totalConsumed);
  const free = freeGrantTotal - consumedFree;
  const purchased = Math.max(0, total - free);

  // FIFO: deduct consumed free credits from soonest-expiring batches first
  // (non-expiring batches consumed last, so the user keeps "never expire" credits longer)
  let consumed = consumedFree;
  const freeBatches: { amount: number; expiresAt: string | null; label: string }[] = [];
  for (const b of rawBatches) {
    if (consumed <= 0) {
      freeBatches.push(b);
    } else if (consumed >= b.amount) {
      consumed -= b.amount;
    } else {
      freeBatches.push({ ...b, amount: b.amount - consumed });
      consumed = 0;
    }
  }

  // freeExpiry = earliest (soonest) non-null expiry date among remaining batches
  const freeExpiry = freeBatches.find(b => b.expiresAt !== null)?.expiresAt ?? null;

  return { total, free, purchased, freeExpiry, freeBatches };
}

// ── GET /api/brand/credits/balance ──
router.get("/brand/credits/balance", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const bal = await computeCreditBalance(brandId);
  if (!bal) { res.status(404).json({ error: "Brand not found" }); return; }
  res.json(bal);
});

// ── GET /api/brand/stats ──
router.get("/brand/stats", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const [activeDeals, totalDeals, liveCampaigns, unlockCount, totalSpent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int as c FROM "Deal" WHERE "brandId"=$1 AND status NOT IN ('COMPLETED','CANCELLED','REJECTED')`, [brandId]),
    pool.query(`SELECT COUNT(*)::int as c FROM "Deal" WHERE "brandId"=$1`, [brandId]),
    pool.query(`SELECT COUNT(*)::int as c FROM "Campaign" WHERE "brandId"=$1 AND status='LIVE'`, [brandId]).catch(() => ({ rows: [{ c: 0 }] })),
    pool.query(`SELECT COUNT(*)::int as c FROM "BrandUnlockRecord" WHERE "brandId"=$1`, [brandId]),
    pool.query(`SELECT COALESCE(SUM("totalAgreedValue"),0) as s FROM "Deal" WHERE "brandId"=$1 AND status='COMPLETED'`, [brandId]),
  ]);
  res.json({
    activeDeals: activeDeals.rows[0].c,
    totalDeals: totalDeals.rows[0].c,
    liveCampaigns: liveCampaigns.rows[0].c,
    creatorsUnlocked: unlockCount.rows[0].c,
    totalSpent: parseFloat(totalSpent.rows[0].s),
  });
});

// ── GET /api/brand/payments ──
router.get("/brand/payments", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const [payments, totRow] = await Promise.all([
    pool.query(
      `SELECT p.id as "paymentId", p."dealId", p.amount, p."gstAmount", p."creatorPayout",
              p."commissionRateLocked", p."confirmedAt",
              d.status, d."escrowStatus", d."totalAgreedValue",
              d."reelCount", d."storyCount", d."postCount",
              d."orderId",
              cr."instagramHandle",
              b."brandName", b.email as "brandEmail",
              i."imageUrl" AS "invoiceUrl"
       FROM "Payment" p
       JOIN "Deal" d ON d.id = p."dealId"
       JOIN "Creator" cr ON cr.id = d."creatorId"
       JOIN "Brand" b ON b.id = p."brandId"
       LEFT JOIN "Invoice" i ON i."referenceId"=d.id AND i."recipientType"='BRAND'
       WHERE p."brandId"=$1
       ORDER BY p."confirmedAt" DESC`,
      [brandId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(p.amount),0) as total FROM "Payment" p WHERE p."brandId"=$1`,
      [brandId]
    ),
  ]);
  res.json({
    totalSpent: parseFloat(totRow.rows[0].total),
    payments: payments.rows,
  });
});

// ── GET /api/brand/credits/transactions ──
router.get("/brand/credits/transactions", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const page = Math.max(1, parseInt((req.query["page"] as string) ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt((req.query["limit"] as string) ?? "20") || 20));
  const offset = (page - 1) * limit;
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT id, "transactionType" as type, amount, "balanceAfter", "createdAt", "adminReason", "expiresAt"
       FROM "CreditTransaction" WHERE "brandId"=$1 ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3`,
      [brandId, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int as c FROM "CreditTransaction" WHERE "brandId"=$1`, [brandId]),
  ]);
  res.json({
    transactions: rows.rows,
    total: count.rows[0].c,
    page,
    totalPages: Math.ceil(count.rows[0].c / limit),
  });
});

// ── GET /api/brand/search/creators ──
router.get("/brand/search/creators", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const slabId = req.query["slabId"] as string;
  if (!slabId) { res.status(400).json({ error: "slabId required" }); return; }

  const page = Math.max(1, parseInt((req.query["page"] as string) ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt((req.query["limit"] as string) ?? "20") || 20));
  const offset = (page - 1) * limit;
  const sort = (req.query["sort"] as string) || "newest";

  const slab = await pool.query(`SELECT "minFollowers","maxFollowers" FROM "FollowerSlab" WHERE id=$1`, [slabId]);
  if (slab.rows.length === 0) { res.status(404).json({ error: "Slab not found" }); return; }
  const minF = slab.rows[0].minFollowers as number;
  const maxF = (slab.rows[0].maxFollowers as number | null) ?? 999999999;

  // Build filter clauses
  const where: string[] = [
    `c.status='ACTIVE'`,
    `c."hiddenFromSearch"=false`,
    `c."followerCount" >= $1`,
    `c."followerCount" <= $2`,
  ];
  const params: any[] = [minF, maxF, brandId];

  const gender = req.query["gender"] as string;
  if (gender === "female") where.push(`c."audienceGenderFemale" > c."audienceGenderMale"`);
  else if (gender === "male") where.push(`c."audienceGenderMale" > c."audienceGenderFemale"`);

  const location = req.query["location"] as string;
  if (location && ["Urban", "Rural", "Semi-urban"].includes(location)) {
    params.push(location);
    where.push(`c."audienceLocation"=$${params.length}`);
  }

  const minRating = parseFloat(req.query["minRating"] as string);
  if (!isNaN(minRating) && minRating > 0) {
    params.push(minRating);
    where.push(`c."averageRating" >= $${params.length}`);
  }

  const maxReelPrice = parseFloat(req.query["maxReelPrice"] as string);
  if (!isNaN(maxReelPrice)) { params.push(maxReelPrice); where.push(`c."reelPriceMax" <= $${params.length}`); }
  const maxStoryPrice = parseFloat(req.query["maxStoryPrice"] as string);
  if (!isNaN(maxStoryPrice)) { params.push(maxStoryPrice); where.push(`c."storyPriceMax" <= $${params.length}`); }
  const maxPostPrice = parseFloat(req.query["maxPostPrice"] as string);
  if (!isNaN(maxPostPrice)) { params.push(maxPostPrice); where.push(`c."postPriceMax" <= $${params.length}`); }

  // Categories — multi-select via repeated query param
  let categoryIds = req.query["category"] as string | string[] | undefined;
  if (categoryIds && !Array.isArray(categoryIds)) categoryIds = [categoryIds];
  if (Array.isArray(categoryIds) && categoryIds.length > 0) {
    params.push(categoryIds);
    where.push(`EXISTS (SELECT 1 FROM "CreatorCategory" cc WHERE cc."creatorId"=c.id AND cc."categoryId" = ANY($${params.length}::text[]))`);
  }

  // Age — multi-select
  let ages = req.query["age"] as string | string[] | undefined;
  if (ages && !Array.isArray(ages)) ages = [ages];
  if (Array.isArray(ages) && ages.length > 0) {
    const ageConds = ages.map(a => { params.push(`%${a}%`); return `c."audienceAge" ILIKE $${params.length}`; });
    where.push(`(${ageConds.join(" OR ")})`);
  }

  // Goal — multi-select
  let goals = req.query["goal"] as string | string[] | undefined;
  if (goals && !Array.isArray(goals)) goals = [goals];
  if (Array.isArray(goals) && goals.length > 0) {
    const goalConds = goals.map(g => { params.push(`%${g}%`); return `c."campaignGoal" ILIKE $${params.length}`; });
    where.push(`(${goalConds.join(" OR ")})`);
  }

  let orderBy = `c."createdAt" DESC`;
  if (sort === "followers") orderBy = `c."followerCount" DESC`;
  else if (sort === "price-low") orderBy = `c."reelPriceMin" ASC NULLS LAST`;
  else if (sort === "rating") orderBy = `c."averageRating" DESC NULLS LAST`;

  const whereClause = where.join(" AND ");
  const countSql = `SELECT COUNT(*)::int as c FROM "Creator" c WHERE ${whereClause}`;
  const listSql = `
    SELECT c.id, c."followerCount", c."audienceGenderFemale", c."audienceGenderMale",
           c."audienceAge", c."audienceLocation", c."campaignGoal", c."averageRating", c."ratingCount",
           c."reelPriceMin", c."reelPriceMax", c."storyPriceMin", c."storyPriceMax",
           c."postPriceMin", c."postPriceMax",
           EXISTS (SELECT 1 FROM "BrandUnlockRecord" u WHERE u."brandId"=$3 AND u."creatorId"=c.id) as "isUnlocked",
           (SELECT json_agg(json_build_object('id', cat.id, 'name', cat.name))
            FROM "CreatorCategory" cc JOIN "Category" cat ON cat.id=cc."categoryId" WHERE cc."creatorId"=c.id) as categories
    FROM "Creator" c
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}`;

  const [list, count] = await Promise.all([pool.query(listSql, params), pool.query(countSql, params)]);
  const creators = list.rows.map((c: any) => ({
    id: c.id,
    followerCount: c.followerCount,
    audienceGenderFemale: c.audienceGenderFemale,
    audienceGenderMale: c.audienceGenderMale,
    audienceAge: c.audienceAge,
    audienceLocation: c.audienceLocation,
    campaignGoal: c.campaignGoal,
    averageRating: c.averageRating ? parseFloat(c.averageRating) : null,
    ratingCount: c.ratingCount,
    reelPriceMin: c.reelPriceMin ? parseFloat(c.reelPriceMin) : null,
    reelPriceMax: c.reelPriceMax ? parseFloat(c.reelPriceMax) : null,
    storyPriceMin: c.storyPriceMin ? parseFloat(c.storyPriceMin) : null,
    storyPriceMax: c.storyPriceMax ? parseFloat(c.storyPriceMax) : null,
    postPriceMin: c.postPriceMin ? parseFloat(c.postPriceMin) : null,
    postPriceMax: c.postPriceMax ? parseFloat(c.postPriceMax) : null,
    isUnlocked: c.isUnlocked,
    categories: c.categories ?? [],
  }));
  res.json({ creators, total: count.rows[0].c, page, totalPages: Math.ceil(count.rows[0].c / limit) });
});

// ── POST /api/brand/creators/:id/unlock (atomic) ──
router.post("/brand/creators/:id/unlock", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const creatorId = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock brand row
    const b = await client.query(`SELECT "creditBalance" FROM "Brand" WHERE id=$1 FOR UPDATE`, [brandId]);
    if (b.rows.length === 0) { await client.query("ROLLBACK"); res.status(404).json({ error: "Brand not found" }); return; }
    const bal = b.rows[0].creditBalance as number;
    if (bal < 1) { await client.query("ROLLBACK"); res.status(400).json({ error: "INSUFFICIENT_CREDITS", message: "You have 0 credits. Buy credits to unlock creator profiles." }); return; }
    // Already unlocked check
    const existing = await client.query(`SELECT id FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2`, [brandId, creatorId]);
    if (existing.rows.length > 0) { await client.query("ROLLBACK"); res.status(400).json({ error: "ALREADY_UNLOCKED" }); return; }
    // Get creator pricing snapshot
    const c = await client.query(
      `SELECT "followerCount","reelPriceMin","reelPriceMax","storyPriceMin","storyPriceMax","postPriceMin","postPriceMax",status,"instagramHandle","fullName" FROM "Creator" WHERE id=$1`,
      [creatorId]
    );
    if (c.rows.length === 0 || c.rows[0].status !== "ACTIVE") {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Creator not available" });
      return;
    }
    const cr = c.rows[0];
    const newBal = bal - 1;
    await client.query(`UPDATE "Brand" SET "creditBalance"=$1, "updatedAt"=NOW() WHERE id=$2`, [newBal, brandId]);
    await client.query(
      `INSERT INTO "BrandUnlockRecord" (id,"brandId","creatorId","reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax","followerCountAtUnlock","unlockedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [brandId, creatorId, cr.reelPriceMin ?? 0, cr.reelPriceMax ?? 0, cr.storyPriceMin ?? 0, cr.storyPriceMax ?? 0, cr.postPriceMin ?? 0, cr.postPriceMax ?? 0, cr.followerCount ?? 0]
    );
    await client.query(
      `INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","createdAt") VALUES (gen_random_uuid(),$1,'UNLOCK_SEARCH',-1,$2,NOW())`,
      [brandId, newBal]
    );
    await client.query("COMMIT");
    res.json({ ok: true, newBalance: newBal, instagramHandle: cr.instagramHandle ?? null, fullName: cr.fullName ?? null });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Unlock failed" });
  } finally {
    client.release();
  }
});

// ── GET /api/brand/creators/:id/profile (only if unlocked) ──
router.get("/brand/creators/:id/profile", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const creatorId = req.params["id"] as string;
  const unlock = await pool.query(
    `SELECT "reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax","unlockedAt"
     FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2`,
    [brandId, creatorId]
  );
  if (unlock.rows.length === 0) { res.status(403).json({ error: "Profile not unlocked" }); return; }
  const u = unlock.rows[0];

  const [c, funQR, funOptR, funAnsR, activeDeal] = await Promise.all([
    pool.query(
      `SELECT id, "fullName", "instagramHandle", "profilePhotoUrl", bio, "followerCount", images,
              gender, state, email, phone, "contentType",
              EXTRACT(YEAR FROM AGE(NOW(), "dateOfBirth"))::int as "creatorAge",
              "audienceGenderFemale","audienceGenderMale","audienceAge","audienceLocation","campaignGoal",
              "reelPriceMin","reelPriceMax","storyPriceMin","storyPriceMax","postPriceMin","postPriceMax",
              "averageRating","ratingCount","kycStatus",status,
              (SELECT json_agg(json_build_object('id', cat.id, 'name', cat.name))
               FROM "CreatorCategory" cc JOIN "Category" cat ON cat.id=cc."categoryId" WHERE cc."creatorId"="Creator".id) as categories,
              (SELECT json_agg(json_build_object('id', p.id, 'videoUrl', p."videoUrl"))
               FROM "CreatorPortfolio" p WHERE p."creatorId"="Creator".id) as portfolio
       FROM "Creator" WHERE id=$1`,
      [creatorId]
    ),
    pool.query(`SELECT id, "questionText" FROM "FunQuestion" WHERE "isActive"=true ORDER BY "displayOrder","createdAt"`),
    pool.query(`SELECT id, "questionId", "optionText" FROM "FunQuestionOption" ORDER BY "displayOrder"`),
    pool.query(`SELECT "questionId", "selectedOptions" FROM "CreatorFunAnswer" WHERE "creatorId"=$1`, [creatorId]),
    pool.query(
      `SELECT id FROM "Deal" WHERE "brandId"=$1 AND "creatorId"=$2 AND status NOT IN ('COMPLETED','CANCELLED','REJECTED') LIMIT 1`,
      [brandId, creatorId]
    ),
  ]);

  if (c.rows.length === 0) { res.status(404).json({ error: "Creator not found" }); return; }
  const cr = c.rows[0];

  // Build fun questions with selected answer text
  const optsByQ: Record<string, { id: string; optionText: string }[]> = {};
  for (const o of funOptR.rows) (optsByQ[o.questionId] ??= []).push({ id: o.id, optionText: o.optionText });
  const ansByQ: Record<string, string[]> = {};
  for (const a of funAnsR.rows) ansByQ[a.questionId] = a.selectedOptions ?? [];
  const funQuestions = funQR.rows
    .map(q => {
      const selectedOptionId = (ansByQ[q.id] ?? [])[0] ?? null;
      const selectedOption = (optsByQ[q.id] ?? []).find(o => o.id === selectedOptionId);
      return { id: q.id, questionText: q.questionText, selectedOptionText: selectedOption?.optionText ?? null };
    })
    .filter(q => q.selectedOptionText !== null);

  // Detect pricing change since unlock
  const num = (v: any) => v == null ? 0 : parseFloat(v);
  const pricingChanged =
    num(u.reelSlabMin) !== num(cr.reelPriceMin) || num(u.reelSlabMax) !== num(cr.reelPriceMax) ||
    num(u.storySlabMin) !== num(cr.storyPriceMin) || num(u.storySlabMax) !== num(cr.storyPriceMax) ||
    num(u.postSlabMin) !== num(cr.postPriceMin) || num(u.postSlabMax) !== num(cr.postPriceMax);

  res.json({
    creator: {
      id: cr.id,
      fullName: cr.fullName,
      instagramHandle: cr.instagramHandle,
      profilePhotoUrl: cr.profilePhotoUrl,
      bio: cr.bio,
      followerCount: cr.followerCount,
      gender: cr.gender ?? null,
      state: cr.state ?? null,
      email: cr.email ?? null,
      phone: cr.phone ?? null,
      contentType: cr.contentType ?? null,
      audienceGenderFemale: cr.audienceGenderFemale,
      audienceGenderMale: cr.audienceGenderMale,
      audienceAge: cr.audienceAge,
      audienceLocation: cr.audienceLocation,
      campaignGoal: cr.campaignGoal,
      creatorAge: cr.creatorAge ?? null,
      reelPriceMin: num(cr.reelPriceMin), reelPriceMax: num(cr.reelPriceMax),
      storyPriceMin: num(cr.storyPriceMin), storyPriceMax: num(cr.storyPriceMax),
      postPriceMin: num(cr.postPriceMin), postPriceMax: num(cr.postPriceMax),
      averageRating: cr.averageRating ? parseFloat(cr.averageRating) : null,
      ratingCount: cr.ratingCount,
      kycStatus: cr.kycStatus,
      status: cr.status,
      categories: cr.categories ?? [],
      portfolio: cr.portfolio ?? [],
      images: Array.isArray(cr.images) ? cr.images : [],
      funQuestions,
    },
    unlockedAt: u.unlockedAt,
    pricingChanged,
    activeDealId: activeDeal.rows[0]?.id ?? null,
  });
});

// ── GET /api/brand/unlocked-creators ──
router.get("/brand/unlocked-creators", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const r = await pool.query(
    `SELECT u.id AS "unlockId", u."unlockedAt",
            c.id, c."fullName", c."instagramHandle", c."profilePhotoUrl",
            c."followerCount", c.status,
            (SELECT json_agg(json_build_object('id', cat.id, 'name', cat.name))
             FROM "CreatorCategory" cc JOIN "Category" cat ON cat.id=cc."categoryId"
             WHERE cc."creatorId"=c.id) AS categories
     FROM "BrandUnlockRecord" u
     JOIN "Creator" c ON c.id=u."creatorId"
     WHERE u."brandId"=$1
     ORDER BY u."unlockedAt" DESC`,
    [brandId]
  );
  res.json({
    creators: r.rows.map(row => ({
      unlockId: row.unlockId,
      unlockedAt: row.unlockedAt,
      id: row.id,
      fullName: row.fullName,
      instagramHandle: row.instagramHandle,
      profilePhotoUrl: row.profilePhotoUrl,
      followerCount: row.followerCount,
      status: row.status,
      categories: row.categories ?? [],
    })),
  });
});

// ── POST /api/brand/requests ──
const CONTACT_REGEX = /(\+?\d[\d\s\-]{8,}\d|[\w.-]+@[\w-]+\.[\w.-]+|https?:\/\/|www\.)/i;

router.post("/brand/requests", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { creatorId, reelCount = 0, storyCount = 0, postCount = 0,
    pricePerReel = 0, pricePerStory = 0, pricePerPost = 0,
    timelineDays, productRequired = false, productName, productDescription, productImageUrl, deliveryWindowDays,
    brief, aboutProduct, reelScript, storyScript, postContent, postedBy } = req.body;

  if (!creatorId) { res.status(400).json({ error: "creatorId required" }); return; }
  const POSTED_BY_VALUES = ["CREATOR", "BRAND", "BOTH"];
  if (!postedBy || !POSTED_BY_VALUES.includes(postedBy)) {
    res.status(400).json({ error: "Please select who will post the content (Creator, Brand, or Both)" }); return;
  }
  const rc = Math.max(0, parseInt(reelCount) || 0);
  const sc = Math.max(0, parseInt(storyCount) || 0);
  const pc = Math.max(0, parseInt(postCount) || 0);
  if (rc + sc + pc === 0) { res.status(400).json({ error: "At least one deliverable required" }); return; }
  if (!timelineDays || parseInt(timelineDays) < 1) { res.status(400).json({ error: "Timeline required" }); return; }
  const minTlRow = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='min_timeline_days'`);
  const minTl = Math.max(parseInt(minTlRow.rows[0]?.value) || 7, 7);
  const td = parseInt(timelineDays);
  if (td < minTl || td > 15) { res.status(400).json({ error: `Timeline must be between ${minTl} and 15 days` }); return; }

  // Validate productImageUrl when product is required
  const imgUrl = productRequired && productImageUrl ? String(productImageUrl).trim() : null;
  if (productRequired && !imgUrl) {
    res.status(400).json({ error: "Product image URL is required when product is required" }); return;
  }
  if (productRequired && imgUrl && !imgUrl.includes(".")) {
    res.status(400).json({ error: "Product image URL must be a valid URL" }); return;
  }

  // aboutProduct is the new required brief — fall back to brief for backward compat
  const aboutText = (aboutProduct ?? brief ?? "").trim();
  if (!aboutText) { res.status(400).json({ error: "About the product / brief is required" }); return; }
  if (CONTACT_REGEX.test(aboutText)) { res.status(400).json({ error: "Brief contains contact information (phone/email/URL) which is not allowed" }); return; }
  if (rc > 0 && !reelScript?.trim()) { res.status(400).json({ error: "Script of reel is required" }); return; }
  if (sc > 0 && !storyScript?.trim()) { res.status(400).json({ error: "Script of story/video is required" }); return; }
  if (pc > 0 && !postContent?.trim()) { res.status(400).json({ error: "Content of post is required" }); return; }

  // Must be unlocked first
  const u = await pool.query(
    `SELECT "reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax"
     FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2`, [brandId, creatorId]
  );
  if (u.rows.length === 0) { res.status(403).json({ error: "Profile not unlocked" }); return; }
  const slab = u.rows[0];
  const num = (v: any) => v == null ? 0 : parseFloat(v);

  // Validate prices within slab snapshot
  if (rc > 0 && (pricePerReel < num(slab.reelSlabMin) || pricePerReel > num(slab.reelSlabMax))) {
    res.status(400).json({ error: `Reel price must be between ₹${num(slab.reelSlabMin)} and ₹${num(slab.reelSlabMax)}` }); return;
  }
  if (sc > 0 && (pricePerStory < num(slab.storySlabMin) || pricePerStory > num(slab.storySlabMax))) {
    res.status(400).json({ error: `Story price must be between ₹${num(slab.storySlabMin)} and ₹${num(slab.storySlabMax)}` }); return;
  }
  if (pc > 0 && (pricePerPost < num(slab.postSlabMin) || pricePerPost > num(slab.postSlabMax))) {
    res.status(400).json({ error: `Post price must be between ₹${num(slab.postSlabMin)} and ₹${num(slab.postSlabMax)}` }); return;
  }

  // Idempotency: reject duplicate request within 30 seconds
  const recent = await pool.query(
    `SELECT id FROM "DealRequest" WHERE "brandId"=$1 AND "creatorId"=$2 AND "createdAt" > NOW() - INTERVAL '30 seconds' LIMIT 1`,
    [brandId, creatorId]
  );
  if (recent.rows.length > 0) { res.status(429).json({ error: "Duplicate request — please wait 30 seconds" }); return; }

  const total = rc * pricePerReel + sc * pricePerStory + pc * pricePerPost;
  const minTlRow2 = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='max_deal_finalize_days'`);
  const roundHrsSend = minTlRow2.rows.length > 0 ? (parseFloat(minTlRow2.rows[0].value) || 2) * 24 : 48;
  const inserted = await pool.query(
    `INSERT INTO "DealRequest" (id,"brandId","creatorId",source,status,
       "reelCount","storyCount","postCount",
       "offeredPricePerReel","offeredPricePerStory","offeredPricePerPost",
       "timelineDays","productRequired","productDescription","productImageUrl","deliveryWindowDays",brief,
       "aboutProduct","reelScript","storyScript","postContent",
       "reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax",
       "roundNumber","totalDealValue","postedBy","expiresAt","createdAt")
     VALUES (gen_random_uuid(),$1,$2,'SEARCH','PENDING',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,1,$25,$26,NOW() + INTERVAL '${roundHrsSend} hours',NOW())
     RETURNING id`,
    [brandId, creatorId, rc, sc, pc, pricePerReel, pricePerStory, pricePerPost,
     parseInt(timelineDays), Boolean(productRequired), productDescription ?? null, imgUrl,
     deliveryWindowDays ? parseInt(deliveryWindowDays) : null,
     aboutText,
     aboutText, reelScript?.trim() ?? null, storyScript?.trim() ?? null, postContent?.trim() ?? null,
     slab.reelSlabMin, slab.reelSlabMax, slab.storySlabMin, slab.storySlabMax, slab.postSlabMin, slab.postSlabMax,
     total, postedBy]
  );
  // Notify creator about new deal request
  const brandRow = await pool.query(`SELECT "brandName" FROM "Brand" WHERE id=$1`, [brandId]);
  const brandName = brandRow.rows[0]?.brandName ?? "A brand";
  const script = [reelScript, storyScript, postContent].filter(Boolean).map((s: string) => s.trim()).join("\n\n") || "See deal chat for details.";
  await createNotification({
    userId: creatorId, userType: "CREATOR", type: "REQUEST_RECEIVED",
    title: "New deal request!",
    body: `${brandName} sent you a deal offer — ₹${total.toLocaleString("en-IN")} for ${rc > 0 ? `${rc} reel${rc > 1 ? "s" : ""}` : ""}${sc > 0 ? `${rc > 0 ? ", " : ""}${sc} stor${sc > 1 ? "ies" : "y"}` : ""}${pc > 0 ? `${rc + sc > 0 ? ", " : ""}${pc} post${pc > 1 ? "s" : ""}` : ""}. Tap to respond.`,
    relatedEntityType: "DealRequest", relatedEntityId: inserted.rows[0].id,
    emailParams: {
      brand_name: brandName,
      amount: Math.round(total),
      product_description: (productDescription as string | undefined)?.trim() || (productRequired ? "See deal chat for details." : "No product for this deal."),
      script,
    },
  });
  await createPopup({
    userId: creatorId, userType: "CREATOR", type: "COLLAB_OFFER",
    title: "You Got a Collab Offer 🎉",
    body: `${brandName} wants to collaborate with you. Check the request and respond now.`,
    ctaText: "See Details", ctaPath: "/home-creator/requests",
    isCelebration: true, relatedEntityId: inserted.rows[0].id,
  });
  res.json({ ok: true, requestId: inserted.rows[0].id });
});

// ── POST /api/brand/credits/direct-purchase (no gateway — credits added immediately) ──
// SECURITY: this grants credits without taking payment. It exists only as a
// fallback for when the payment gateway isn't configured yet. Once Razorpay
// keys are set it is hard-disabled, so it can never be used to mint free
// credits in a live, charging environment. Real purchases go through
// create-order → verify-payment.
router.post("/brand/credits/direct-purchase", requireBrand, async (req: Request, res: Response): Promise<void> => {
  if (process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]) {
    res.status(403).json({ error: "GATEWAY_REQUIRED", message: "Please complete payment through the gateway." });
    return;
  }
  const brandId = (req as any).brandId as string;
  const { quantity } = req.body;
  const qty = parseInt(quantity);
  if (!qty || qty < 1) { res.status(400).json({ error: "Quantity must be at least 1" }); return; }

  const [priceRow, gstRow] = await Promise.all([
    pool.query(`SELECT value FROM "PlatformConfig" WHERE key='credit_price_inr'`),
    pool.query(`SELECT value FROM "PlatformConfig" WHERE key='gst_rate'`),
  ]);
  const pricePerCredit = priceRow.rows[0]?.value ? parseFloat(priceRow.rows[0].value) : 99;
  const gstRate = gstRow.rows[0]?.value ? parseFloat(gstRow.rows[0].value) : 18;
  if (!Number.isFinite(pricePerCredit) || pricePerCredit <= 0) {
    res.status(500).json({ error: "Invalid credit price configured" });
    return;
  }

  const subtotalInr = Math.round(qty * pricePerCredit);
  const gstAmountInr = Math.round(subtotalInr * gstRate / 100);
  const amountInr = subtotalInr + gstAmountInr;

  const client = await pool.connect();
  let orderId = "";
  try {
    await client.query("BEGIN");
    const countRow = await client.query(`SELECT COUNT(*) FROM "CreditTransaction" WHERE "transactionType"='PURCHASED'`);
    const seq = parseInt(countRow.rows[0].count as string) + 1;
    orderId = `CLBcredit${String(seq).padStart(6, "0")}`;

    const upd = await client.query(
      `UPDATE "Brand" SET "creditBalance" = "creditBalance" + $1, "updatedAt"=NOW() WHERE id=$2 RETURNING "creditBalance"`,
      [qty, brandId]
    );
    if (upd.rows.length === 0) { await client.query("ROLLBACK"); res.status(404).json({ error: "Brand not found" }); return; }
    const newBal = upd.rows[0].creditBalance as number;
    await client.query(
      `INSERT INTO "CreditTransaction"
         (id,"brandId","transactionType",amount,"balanceAfter","paymentReferenceId","orderId","credits","amountInr","gstAmountInr","createdAt")
       VALUES (gen_random_uuid(),$1,'PURCHASED',$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [brandId, qty, newBal, orderId, orderId, qty, amountInr, gstAmountInr]
    );
    await client.query("COMMIT");
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  activateCreditHoldCampaigns(brandId).catch(() => {});

  res.json({ ok: true, orderId, quantity: qty, amountInr, gstAmountInr });
});

// ── GET /api/brand/credit-purchases ──
router.get("/brand/credit-purchases", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const rows = await pool.query(
    `SELECT ct.id, ct."orderId", ct.credits, ct."amountInr", ct."gstAmountInr", ct."createdAt",
            ct."balanceAfter",
            i."imageUrl" AS "invoiceUrl"
     FROM "CreditTransaction" ct
     LEFT JOIN "Invoice" i ON i."referenceId"=ct.id AND i."recipientType"='BRAND'
     WHERE ct."brandId"=$1 AND ct."transactionType"='PURCHASED'
     ORDER BY ct."createdAt" DESC`,
    [brandId]
  );
  res.json(rows.rows);
});

// ── POST /api/brand/credits/create-order (Razorpay) ──
router.post("/brand/credits/create-order", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { quantity } = req.body;
  const qty = parseInt(quantity);
  if (!qty || qty < 1) { res.status(400).json({ error: "Quantity must be at least 1" }); return; }
  const [priceRow, gstRow] = await Promise.all([
    pool.query(`SELECT value FROM "PlatformConfig" WHERE key='credit_price_inr'`),
    pool.query(`SELECT value FROM "PlatformConfig" WHERE key='gst_rate'`),
  ]);
  const pricePerCredit = priceRow.rows[0]?.value ? parseFloat(priceRow.rows[0].value) : 99;
  const gstRate = gstRow.rows[0]?.value ? parseFloat(gstRow.rows[0].value) : 18;
  if (!Number.isFinite(pricePerCredit) || pricePerCredit <= 0) {
    res.status(500).json({ error: "Invalid credit price configured" });
    return;
  }
  // Price incl. GST — mirrors the direct-purchase calculation so the amount
  // charged and the recorded transaction match the no-gateway path.
  const subtotalInr = Math.round(qty * pricePerCredit);
  const gstAmountInr = Math.round(subtotalInr * gstRate / 100);
  const amountInr = subtotalInr + gstAmountInr;
  const amountPaise = amountInr * 100;

  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    res.status(503).json({ error: "RAZORPAY_NOT_CONFIGURED", message: "Payment gateway is not configured. Please contact support." });
    return;
  }
  try {
    const Razorpay = (await import("razorpay")).default as any;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.create({
      amount: amountPaise, currency: "INR",
      // Notes are authoritative server-side data read back at verify/webhook
      // time — never trust the client for quantity or amounts.
      notes: {
        brandId,
        quantity: String(qty),
        amountInr: String(amountInr),
        gstAmountInr: String(gstAmountInr),
        purpose: "credits",
      },
    });
    res.json({ orderId: order.id, amount: amountPaise, currency: "INR", key: keyId, quantity: qty, amountInr, gstAmountInr });
  } catch (e: any) {
    logger.error({ err: e, brandId }, "Razorpay create-order failed");
    res.status(500).json({ error: e.message ?? "Failed to create order" });
  }
});

// ── POST /api/brand/credits/verify-payment (Razorpay) ──
// Synchronous fulfilment: verify the checkout signature, then credit the brand.
// Works without a public webhook URL, so it's usable in test mode / locally.
// The webhook below remains a backstop; both are idempotent on the payment id.
router.post("/brand/credits/verify-payment", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ error: "Missing payment fields" });
    return;
  }
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    res.status(503).json({ error: "RAZORPAY_NOT_CONFIGURED", message: "Payment gateway is not configured." });
    return;
  }
  try {
    const crypto = await import("crypto");
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    let valid = false;
    try {
      valid = expected.length === razorpay_signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    } catch { valid = false; }
    if (!valid) { res.status(400).json({ error: "Signature verification failed" }); return; }

    // Re-read the order from Razorpay for authoritative brand/quantity/amounts.
    const Razorpay = (await import("razorpay")).default as any;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.fetch(razorpay_order_id);
    const notes = order?.notes ?? {};
    if (notes.brandId !== brandId) { res.status(403).json({ error: "Order does not belong to this account" }); return; }
    const quantity = parseInt(notes.quantity);
    const amountInr = parseInt(notes.amountInr ?? "0");
    const gstAmountInr = parseInt(notes.gstAmountInr ?? "0");
    if (!quantity || quantity < 1) { res.status(400).json({ error: "Invalid order" }); return; }

    const result = await fulfillCreditPurchase({ brandId, quantity, paymentId: razorpay_payment_id, amountInr, gstAmountInr });
    if (result.status === "brand_not_found") { res.status(404).json({ error: "Brand not found" }); return; }
    if (result.status === "credited") activateCreditHoldCampaigns(brandId).catch(() => {});
    res.json({ ok: true, orderId: result.orderRef ?? null, quantity, amountInr, balance: result.newBalance, duplicate: result.status === "duplicate" });
  } catch (e: any) {
    logger.error({ err: e, brandId }, "Razorpay verify-payment failed");
    res.status(500).json({ error: e.message ?? "Payment verification failed" });
  }
});

// ── POST /api/webhooks/razorpay/credits ──
router.post("/webhooks/razorpay/credits", async (req: Request, res: Response): Promise<void> => {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!secret) { res.status(503).json({ error: "Webhook not configured" }); return; }
  const signature = req.headers["x-razorpay-signature"] as string | undefined;
  if (!signature) { res.status(400).json({ error: "Missing signature" }); return; }
  try {
    const crypto = await import("crypto");
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) { res.status(400).json({ error: "Raw body unavailable" }); return; }
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    let valid = false;
    try {
      valid = expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch { valid = false; }
    if (!valid) { res.status(400).json({ error: "Invalid signature" }); return; }
    const event = req.body?.event;
    if (event !== "payment.captured") { res.json({ ok: true, ignored: event }); return; }
    const payment = req.body?.payload?.payment?.entity;
    const paymentId = payment?.id as string;
    const notes = payment?.notes ?? {};
    const brandId = notes.brandId as string | undefined;
    const quantity = parseInt(notes.quantity as string);
    if (!brandId || !quantity || !paymentId) { res.status(400).json({ error: "Missing data in payment" }); return; }
    const amountInr = parseInt((notes.amountInr as string) ?? "0");
    const gstAmountInr = parseInt((notes.gstAmountInr as string) ?? "0");

    // Shared idempotent fulfilment — a no-op if verify-payment already credited
    // this payment id (and vice-versa).
    const result = await fulfillCreditPurchase({ brandId, quantity, paymentId, amountInr, gstAmountInr });
    if (result.status === "brand_not_found") { res.status(404).json({ error: "Brand not found" }); return; }
    res.json({ ok: true, duplicate: result.status === "duplicate" });
    if (result.status === "credited") activateCreditHoldCampaigns(brandId).catch(() => {});
  } catch (e: any) {
    logger.error({ err: e }, "Razorpay webhook processing failed");
    res.status(500).json({ error: e.message });
  }
});

// ── Brand: GET notifications ──
router.get("/brand/notifications", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const [listR, countR] = await Promise.all([
    pool.query(
      `SELECT * FROM "Notification" WHERE "userId"=$1 AND "userType"='BRAND' ORDER BY "createdAt" DESC LIMIT 100`,
      [brandId],
    ),
    pool.query(
      `SELECT COUNT(*)::int as c FROM "Notification" WHERE "userId"=$1 AND "userType"='BRAND' AND "isRead"=false`,
      [brandId],
    ),
  ]);
  res.json({ notifications: listR.rows, unreadCount: countR.rows[0].c });
});

// ── Brand: PATCH mark all notifications as read ──
router.patch("/brand/notifications/mark-all-read", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  await pool.query(
    `UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND "userType"='BRAND' AND "isRead"=false`,
    [brandId],
  );
  res.json({ ok: true });
});

// ── Brand: GET unread notification count ──
router.get("/brand/notifications/unread-count", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const r = await pool.query(
    `SELECT COUNT(*)::int as c FROM "Notification" WHERE "userId"=$1 AND "userType"='BRAND' AND "isRead"=false`,
    [brandId],
  );
  res.json({ count: r.rows[0].c });
});

// ── Brand: SSE stream ──
router.get("/brand/notifications/stream", (req: Request, res: Response): void => {
  const token =
    req.headers.authorization?.replace("Bearer ", "") ||
    (req.query["token"] as string | undefined);
  if (!token) { res.status(401).end(); return; }
  let brandId: string;
  try {
    const payload = verifyToken(token, getAccessSecret());
    if (payload.userType !== "BRAND") { res.status(403).end(); return; }
    brandId = payload.userId;
  } catch {
    res.status(401).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  addBrandSSE(brandId, res);
  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
  }, 25_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    removeBrandSSE(brandId, res);
  });
});

// ── Brand: Popup endpoints ──
router.get("/brand/popups/pending", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const r = await pool.query(
    `SELECT id,type,title,body,"ctaText","ctaPath","isCelebration","secondCtaText","secondCtaPath" FROM "Popup"
     WHERE "userId"=$1 AND "userType"='BRAND' AND status='PENDING' AND "expiresAt">NOW()
     ORDER BY "createdAt" ASC`,
    [brandId],
  );
  res.json({ popups: r.rows });
});

router.patch("/brand/popups/:id/dismiss", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  await pool.query(
    `UPDATE "Popup" SET status='DISMISSED' WHERE id=$1 AND "userId"=$2 AND "userType"='BRAND'`,
    [req.params["id"], brandId],
  );
  res.json({ ok: true });
});

export default router;
