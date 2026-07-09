import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireBrand } from "../middleware/requireBrand";
import { requireCreator } from "../middleware/requireCreator";
import { broadcastToAllCreators } from "../lib/sseManager";
import { createPopup } from "../lib/popups";
import { createNotification } from "../lib/notifications";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const CONTACT_REGEX = /(\+?\d[\d\s\-]{8,}\d|[\w.-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.)/i;

/**
 * Move a PENDING_PAYMENT campaign deal into escrow (status IN_ESCROW), assign
 * its order id + slot, and start the timeline. Shared by the no-gateway stub
 * path and the Razorpay verify-payment path. `paymentReferenceId` is the
 * Razorpay payment id (null for the stub). Caller must hold a FOR UPDATE lock
 * on the deal row and have checked status === 'PENDING_PAYMENT'.
 */
async function activateDealEscrow(client: any, d: any, paymentReferenceId: string | null): Promise<{ dealOrderId: string; totalPayable: number; gstAmount: number; creatorPayout: number }> {
  const price = parseFloat(d.totalAgreedValue);
  const gstRate = parseFloat(d.gstRateLocked ?? "18") || 18;
  const gstAmount = +(price * gstRate / 100).toFixed(2);
  const totalPayable = +(price + gstAmount).toFixed(2);
  const commRate = parseFloat(d.commissionRate ?? d.commissionRateLocked ?? "5");
  const creatorPayout = +(price * (1 - commRate / 100)).toFixed(2);

  const orderSeqRow = await client.query(`SELECT COUNT(*) FROM "Deal" WHERE "orderId" IS NOT NULL`);
  const orderSeq = parseInt(orderSeqRow.rows[0].count as string) + 1;
  const dealOrderId = `CLBdeal${String(orderSeq).padStart(6, "0")}`;

  await client.query(
    `UPDATE "Deal" SET status='IN_ESCROW',"escrowStatus"='HELD',
        "gstAmount"=$2,"totalPayable"=$3,"creatorPayout"=$4,
        "timelineStartAt"=CASE WHEN "productRequired"=false THEN NOW() ELSE NULL END,
        "deadlineAt"=CASE WHEN "productRequired"=false THEN NOW() + ("timelineDays" || ' days')::interval ELSE NULL END,
        "creatorActionDueSince"=NOW(),"conceptInactivityStage"=0,
        "orderId"=$5,
        "paymentReferenceId"=COALESCE($6,"paymentReferenceId")
       WHERE id=$1`,
    [d.id, gstAmount, totalPayable, creatorPayout, dealOrderId, paymentReferenceId]
  );
  await client.query(
    `INSERT INTO "CampaignSlot" (id,"campaignId","creatorId","dealId","slotNumber","escrowStatus","filledAt") VALUES (gen_random_uuid()::text,$1,$2,$3,(SELECT COALESCE(MAX("slotNumber"),0)+1 FROM "CampaignSlot" WHERE "campaignId"=$1),'COMMITTED',NOW())`,
    [d.campaignId, d.creatorId, d.id]
  );
  return { dealOrderId, totalPayable, gstAmount, creatorPayout };
}

/** "Deal is live" creator notification + both-party celebration popups. */
async function dealLiveNotify(d: any, brandId: string, dealId: string): Promise<void> {
  await createNotification({
    userId: d.creatorId as string, userType: "CREATOR", type: "DEAL_LIVE",
    title: "Deal Started!",
    body: `Payment confirmed for "${d.campName}". Your deal is now active.`,
    emailTemplateId: 30, emailSubject: "Your campaign deal is live!",
    emailParams: { campaign_name: d.campName },
    relatedEntityType: "Deal", relatedEntityId: dealId,
    expiresInDays: 90,
  }).catch(() => {});
  // Brand-side "payment done, deal is live" — template 96 (N15).
  await createNotification({
    userId: brandId, userType: "BRAND", type: "PAYMENT_DONE_DEAL_STARTED",
    title: "Deal is live!",
    body: `Payment confirmed for "${d.campName}". Deal is now active.`,
    relatedEntityType: "Deal", relatedEntityId: dealId,
    expiresInDays: 90,
  }).catch(() => {});
  await createPopup({
    userId: d.creatorId as string, userType: "CREATOR", type: "DEAL_LIVE",
    title: "Congrats! Your Deal is Live 🚀",
    body: "Your collaboration is now active and the deal workflow has started. Want to understand how the deal flow works?",
    ctaText: "See Deal", ctaPath: "/home-creator/deals?tab=live",
    secondCtaText: "Watch Video", secondCtaPath: "/home-creator/deals?tab=live&tutorial=1",
    isCelebration: true, relatedEntityId: dealId,
  });
  await createPopup({
    userId: brandId, userType: "BRAND", type: "DEAL_LIVE",
    title: "Congrats! Your Deal is Live 🚀",
    body: "Your collaboration is now active and the deal workflow has started. Want to understand how the deal flow works?",
    ctaText: "See Deal", ctaPath: "/home-brand/deals?tab=live",
    secondCtaText: "Watch Video", secondCtaPath: "/home-brand/deals?tab=live&tutorial=1",
    isCelebration: true, relatedEntityId: dealId,
  });
}

async function notify(userId: string, userType: string, title: string, body: string, type = "INFO") {
  await pool.query(
    `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","createdAt","expiresAt")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,false,NOW(),NOW()+INTERVAL '90 days')`,
    [userId, userType, type, title, body]
  ).catch(() => {});
}

async function notifyAllCreators(
  entityType: "CAMPAIGN" | "BARTER_CAMPAIGN",
  entityId: string,
  _brandName: string,
  campaignName: string,
) {
  const isPaid = entityType === "CAMPAIGN";
  const title = isPaid ? "New Paid Campaign Live 🚀" : "New Barter Campaign Dropped 🎁";
  const body  = isPaid
    ? `"${campaignName}" is live — apply now before slots fill up!`
    : `"${campaignName}" just dropped — check it out and apply now!`;
  const ctaPath = isPaid ? "/home-creator/campaigns?tab=paid" : "/home-creator/campaigns?tab=barter";
  await pool.query(
    `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"relatedEntityType","relatedEntityId","isRead","createdAt")
     SELECT gen_random_uuid()::text, id, 'CREATOR', 'CAMPAIGN_LIVE', $1, $2, $3, $4, false, NOW()
     FROM "Creator" WHERE status='ACTIVE'`,
    [title, body, entityType, entityId]
  ).catch(() => {});
  // Bulk-insert a popup for every active creator
  await pool.query(
    `INSERT INTO "Popup" (id,"userId","userType",type,title,body,"ctaText","ctaPath","isCelebration",status,"relatedEntityId","expiresAt")
     SELECT gen_random_uuid()::text, id, 'CREATOR', 'CAMPAIGN_LIVE', $1, $2, $3, $4, false, 'PENDING', $5, NOW()+INTERVAL '3 days'
     FROM "Creator" WHERE status='ACTIVE'`,
    [title, body, "Apply Now", ctaPath, entityId]
  ).catch(() => {});
  broadcastToAllCreators("campaign_live", { entityType, entityId, title, body });
}

async function getCfg(key: string, def: string): Promise<string> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [key]);
  return r.rows[0]?.value ?? def;
}

function ageBracket(a: string | null): number {
  if (!a) return -1;
  const n = parseInt(a.replace(/[^0-9].*/u, ""));
  if (isNaN(n) || n < 25) return 0;
  if (n < 35) return 1; if (n < 45) return 2; return 3;
}


// ═══════════════════════════════════════════════════════════════════════════════
// BRAND — CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════════

// Posting cost — fetched by Create Campaign Step 4 (Review)
router.get("/brand/campaigns/posting-cost", requireBrand, async (_req: Request, res: Response): Promise<void> => {
  const cost = parseInt(await getCfg("campaign_credits_cost", "1"));
  res.json({ cost });
});

router.get("/brand/barter/posting-cost", requireBrand, async (_req: Request, res: Response): Promise<void> => {
  const cost = parseInt(await getCfg("barter_credits_cost", "5"));
  res.json({ cost });
});

router.get("/brand/campaigns", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const campaigns = await pool.query(
    `SELECT c.*,
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',cc."categoryId",'name',cat.name,'subcategoryId',cc."subcategoryId")) FILTER (WHERE cc.id IS NOT NULL),'[]') as categories,
       (SELECT COUNT(*)::int FROM "CampaignApplication" WHERE "campaignId"=c.id) as "pendingApps",
       (SELECT COUNT(*)::int FROM "CampaignApplication" WHERE "campaignId"=c.id AND status IN ('SELECTED','CONFIRMED')) as "selectedApps"
     FROM "Campaign" c
     LEFT JOIN "CampaignCategory" cc ON cc."campaignId"=c.id
     LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
     WHERE c."brandId"=$1
     GROUP BY c.id ORDER BY c."createdAt" DESC`,
    [brandId]
  );
  res.json(campaigns.rows);
});

router.post("/brand/campaigns/create", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { name, type, categories, brief, script, keyMessage, dosAndDonts,
    followerSlabs, targetGender, targetAge, targetLocation,
    pricePerCreator, slotCount, timelineDays,
    productRequired, productName, productDescription, productPhotos,
    deliveryWindowDays, productDeliveryDays } = req.body;

  if (!name?.trim()) { res.status(400).json({ error: "Campaign name required" }); return; }
  if (type !== "REEL") { res.status(400).json({ error: "Invalid content type" }); return; }
  if (!pricePerCreator || parseFloat(pricePerCreator) < 1) { res.status(400).json({ error: "Price per creator required" }); return; }
  if (!slotCount || parseInt(slotCount) < 1) { res.status(400).json({ error: "At least 1 slot required" }); return; }
  if (!brief?.trim() || brief.trim().length < 20) { res.status(400).json({ error: "Brief must be at least 20 characters" }); return; }
  if (brief.trim().length > 500) { res.status(400).json({ error: "Brief must not exceed 500 characters" }); return; }
  if (CONTACT_REGEX.test(brief)) { res.status(400).json({ error: "Brief must not contain contact information (phone, email, links)" }); return; }
  if (keyMessage && CONTACT_REGEX.test(keyMessage)) { res.status(400).json({ error: "Key message must not contain contact information" }); return; }
  if (!categories?.length) { res.status(400).json({ error: "At least one category required" }); return; }
  if (!followerSlabs?.length) { res.status(400).json({ error: "At least one follower tier required" }); return; }
  if (!targetGender) { res.status(400).json({ error: "Target gender required" }); return; }
  if (productRequired && !productName?.trim()) { res.status(400).json({ error: "Product name required when product delivery is required" }); return; }

  const minPrice = parseFloat(await getCfg("min_campaign_price", "100"));
  if (parseFloat(pricePerCreator) < minPrice) { res.status(400).json({ error: `Minimum price is ₹${minPrice}` }); return; }
  const maxSlots = parseInt(await getCfg("max_campaign_slots", "50"));
  if (parseInt(slotCount) > maxSlots) { res.status(400).json({ error: `Maximum ${maxSlots} slots allowed` }); return; }
  const minDays = parseInt(await getCfg("min_campaign_days", "1"));
  const maxDays = parseInt(await getCfg("max_campaign_days", "90"));
  const expiryDays = parseInt(deliveryWindowDays ?? "30");
  if (!deliveryWindowDays || isNaN(expiryDays) || expiryDays < minDays) { res.status(400).json({ error: `Campaign expiry must be at least ${minDays} day(s)` }); return; }
  if (expiryDays > maxDays) { res.status(400).json({ error: `Campaign expiry cannot exceed ${maxDays} days` }); return; }
  const tlDays = parseInt(timelineDays ?? "0");
  if (!timelineDays || isNaN(tlDays) || tlDays < 7 || tlDays > 15) { res.status(400).json({ error: "Content delivery timeline must be between 7 and 15 days" }); return; }
  if (productRequired) {
    const pd = parseInt(productDeliveryDays ?? "0");
    if (!productDeliveryDays || isNaN(pd) || pd < 1) { res.status(400).json({ error: "Estimated product delivery days required" }); return; }
    if (pd > 14) { res.status(400).json({ error: "Estimated product delivery days cannot exceed 14" }); return; }
  }

  const commCfg = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='commission_rate'`);
  const commissionRate = parseFloat(commCfg.rows[0]?.value ?? "5");
  const price = parseFloat(pricePerCreator);
  const slots = parseInt(slotCount);

  const campaignId = (await pool.query(
    `INSERT INTO "Campaign" (id,"brandId",name,type,brief,"reelScript","keyMessage","dosAndDonts",
     "pricePerCreator","slotCount","slotsFilled","timelineDays","productRequired","productName","productDescription","productPhotos","deliveryWindowDays","productDeliveryDays",
     status,"totalEscrow","commissionRateAtCreation","creditsCharged","followerSlabs",
     "targetGender","targetAge","targetLocation","createdAt")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,$14,$15,$16,
             'PENDING_APPROVAL',$17,$18,0,$19::jsonb,$20,$21,$22,NOW())
     RETURNING id`,
    [brandId, name.trim(), type, brief.trim(), script?.trim() ?? null, keyMessage?.trim() ?? null, dosAndDonts?.trim() ?? null,
     price, slots, tlDays, !!productRequired,
     productName?.trim() ?? null, productDescription?.trim() ?? null,
     (productRequired && Array.isArray(productPhotos) && productPhotos.length > 0) ? productPhotos : [],
     expiryDays,
     productRequired && productDeliveryDays ? parseInt(productDeliveryDays) : null,
     price * slots, commissionRate, JSON.stringify(followerSlabs),
     targetGender, targetAge ?? null, targetLocation ?? null]
  )).rows[0].id as string;

  for (const cat of categories) {
    await pool.query(
      `INSERT INTO "CampaignCategory" (id,"campaignId","categoryId","subcategoryId") VALUES (gen_random_uuid()::text,$1,$2,$3)`,
      [campaignId, cat.categoryId, cat.subcategoryId ?? null]
    );
  }

  // Notify admins
  const admin = await pool.query(`SELECT id FROM "Admin" LIMIT 1`);
  if (admin.rows[0]) await notify(admin.rows[0].id, "ADMIN", "New Paid Campaign", `New paid campaign "${name}" submitted for review.`);
  await notify(brandId, "BRAND", "Campaign Submitted for Review",
    `Your campaign "${name}" has been submitted. Our team will review it — usually within 48 hours.`);

  res.status(201).json({ campaignId, status: "PENDING_APPROVAL" });
});

// ─── Brand: Pause / Resume / Delete campaign ──────────────────────────────────

router.patch("/brand/campaigns/:id/pause", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const camp = await pool.query(
    `SELECT id, name, status, "expiresAt" FROM "Campaign" WHERE id=$1 AND "brandId"=$2`,
    [id, brandId]
  );
  if (!camp.rows[0]) { res.status(404).json({ error: "Campaign not found" }); return; }
  const c = camp.rows[0];
  if (!["LIVE", "HIDDEN"].includes(c.status)) {
    res.status(400).json({ error: "Only active campaigns can be paused" }); return;
  }
  if (c.expiresAt && new Date(c.expiresAt) <= new Date()) {
    res.status(400).json({ error: "Campaign has already expired" }); return;
  }
  await pool.query(`UPDATE "Campaign" SET status='PAUSED' WHERE id=$1`, [id]);
  res.json({ ok: true, status: "PAUSED" });
});

router.patch("/brand/campaigns/:id/resume", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const camp = await pool.query(
    `SELECT id, name, status, "expiresAt", "slotCount", "slotsFilled" FROM "Campaign" WHERE id=$1 AND "brandId"=$2`,
    [id, brandId]
  );
  if (!camp.rows[0]) { res.status(404).json({ error: "Campaign not found" }); return; }
  const c = camp.rows[0];
  if (c.status !== "PAUSED") { res.status(400).json({ error: "Only paused campaigns can be resumed" }); return; }
  if (c.expiresAt && new Date(c.expiresAt) <= new Date()) {
    res.status(400).json({ error: "Campaign has expired and cannot be resumed" }); return;
  }
  const resumeStatus = (c.slotsFilled as number) >= (c.slotCount as number) ? "HIDDEN" : "LIVE";
  await pool.query(`UPDATE "Campaign" SET status=$1 WHERE id=$2`, [resumeStatus, id]);
  res.json({ ok: true, status: resumeStatus });
});

router.delete("/brand/campaigns/:id", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const camp = await pool.query(
    `SELECT id, name, status FROM "Campaign" WHERE id=$1 AND "brandId"=$2`,
    [id, brandId]
  );
  if (!camp.rows[0]) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (camp.rows[0].status === "DELETED") { res.status(400).json({ error: "Campaign already deleted" }); return; }
  await pool.query(`UPDATE "Campaign" SET status='DELETED' WHERE id=$1`, [id]);
  res.json({ ok: true, status: "DELETED" });
});

// ─── Brand: Pause / Resume / Delete barter campaign ──────────────────────────

router.patch("/brand/barter/:id/pause", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const barter = await pool.query(
    `SELECT id, name, status, "expiresAt" FROM "BarterCampaign" WHERE id=$1 AND "brandId"=$2`,
    [id, brandId]
  );
  if (!barter.rows[0]) { res.status(404).json({ error: "Barter campaign not found" }); return; }
  const c = barter.rows[0];
  if (!["LIVE", "HIDDEN"].includes(c.status)) {
    res.status(400).json({ error: "Only active campaigns can be paused" }); return;
  }
  if (c.expiresAt && new Date(c.expiresAt) <= new Date()) {
    res.status(400).json({ error: "Campaign has already expired" }); return;
  }
  await pool.query(`UPDATE "BarterCampaign" SET status='PAUSED' WHERE id=$1`, [id]);
  res.json({ ok: true, status: "PAUSED" });
});

router.patch("/brand/barter/:id/resume", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const barter = await pool.query(
    `SELECT id, name, status, "expiresAt", "slotCount", "slotsFilled" FROM "BarterCampaign" WHERE id=$1 AND "brandId"=$2`,
    [id, brandId]
  );
  if (!barter.rows[0]) { res.status(404).json({ error: "Barter campaign not found" }); return; }
  const c = barter.rows[0];
  if (c.status !== "PAUSED") { res.status(400).json({ error: "Only paused campaigns can be resumed" }); return; }
  if (c.expiresAt && new Date(c.expiresAt) <= new Date()) {
    res.status(400).json({ error: "Campaign has expired and cannot be resumed" }); return;
  }
  const resumeStatus = (c.slotsFilled as number) >= (c.slotCount as number) ? "HIDDEN" : "LIVE";
  await pool.query(`UPDATE "BarterCampaign" SET status=$1 WHERE id=$2`, [resumeStatus, id]);
  res.json({ ok: true, status: resumeStatus });
});

router.delete("/brand/barter/:id", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const barter = await pool.query(
    `SELECT id, name, status FROM "BarterCampaign" WHERE id=$1 AND "brandId"=$2`,
    [id, brandId]
  );
  if (!barter.rows[0]) { res.status(404).json({ error: "Barter campaign not found" }); return; }
  if (barter.rows[0].status === "DELETED") { res.status(400).json({ error: "Campaign already deleted" }); return; }
  await pool.query(`UPDATE "BarterCampaign" SET status='DELETED' WHERE id=$1`, [id]);
  res.json({ ok: true, status: "DELETED" });
});

// ─── Deal Payment: brand pays after creator confirms ──────────────────────────

router.post("/brand/campaigns/deals/:dealId/pay", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { dealId } = req.params as Record<string, string>;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const deal = await client.query(
      `SELECT d.*,c."slotCount",c."slotsFilled",c.name as "campName",c.id as "campaignId",c."timelineDays"
       FROM "Deal" d JOIN "Campaign" c ON c.id=d."campaignId"
       WHERE d.id=$1 AND d."brandId"=$2 AND d.status='PENDING_PAYMENT' FOR UPDATE`,
      [dealId, brandId]
    );
    if (!deal.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Deal not found or not awaiting payment" }); return; }
    const d = deal.rows[0];
    const price = parseFloat(d.totalAgreedValue);
    const gstRate = parseFloat(d.gstRateLocked ?? "18") || 18;
    const gstAmount = +(price * gstRate / 100).toFixed(2);
    const totalPayable = +(price + gstAmount).toFixed(2);
    const commRate = parseFloat(d.commissionRate ?? d.commissionRateLocked ?? "5");
    const creatorPayout = +(price * (1 - commRate / 100)).toFixed(2);
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];

    if (keyId && keySecret) {
      try {
        const Razorpay = (await import("razorpay")).default as any;
        const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
        const order = await rzp.orders.create({ amount: Math.round(totalPayable * 100), currency: "INR", notes: { brandId, dealId, campaignId: d.campaignId, type: "campaign_deal", gstAmount, totalPayable } });
        await client.query(`UPDATE "Deal" SET "gstAmount"=$1,"totalPayable"=$2,"creatorPayout"=$3 WHERE id=$4`, [gstAmount, totalPayable, creatorPayout, dealId]);
        await client.query("COMMIT");
        res.json({ orderId: order.id, amount: Math.round(totalPayable * 100), currency: "INR", keyId, dealId });
      } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Payment gateway error" }); }
      return;
    }

    // No gateway configured — activate directly (stub). For product deals,
    // timeline starts on product confirmation, not payment.
    const { dealOrderId } = await activateDealEscrow(client, d, null);
    await client.query("COMMIT");
    await dealLiveNotify(d, brandId, dealId);
    res.json({ ok: true, status: "IN_ESCROW", dealId, orderId: dealOrderId, amount: totalPayable });
  } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Internal error" }); }
  finally { client.release(); }
});

// POST /api/brand/campaigns/deals/:dealId/verify-payment — completes a Razorpay
// deal payment: verify the checkout signature, confirm the order belongs to this
// deal/brand, then move the deal into escrow. Idempotent: a second call (or the
// deal already being IN_ESCROW) returns success without re-activating.
router.post("/brand/campaigns/deals/:dealId/verify-payment", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { dealId } = req.params as Record<string, string>;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) { res.status(400).json({ error: "Missing payment fields" }); return; }
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) { res.status(503).json({ error: "RAZORPAY_NOT_CONFIGURED", message: "Payment gateway is not configured." }); return; }

  // 1) Verify the checkout signature.
  const expected = crypto.createHmac("sha256", keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  let valid = false;
  try {
    valid = expected.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
  } catch { valid = false; }
  if (!valid) { res.status(400).json({ error: "Signature verification failed" }); return; }

  // 2) Confirm the order actually belongs to this deal + brand (authoritative).
  let order: any;
  try {
    const Razorpay = (await import("razorpay")).default as any;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    order = await rzp.orders.fetch(razorpay_order_id);
  } catch { res.status(502).json({ error: "Could not verify order with gateway" }); return; }
  const notes = order?.notes ?? {};
  if (notes.type !== "campaign_deal" || notes.dealId !== dealId || notes.brandId !== brandId) {
    res.status(403).json({ error: "Order does not match this deal" });
    return;
  }

  // 3) Activate escrow (idempotent).
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const deal = await client.query(
      `SELECT d.*, c.name as "campName", c.id as "campaignId"
         FROM "Deal" d JOIN "Campaign" c ON c.id=d."campaignId"
        WHERE d.id=$1 AND d."brandId"=$2 FOR UPDATE`,
      [dealId, brandId]
    );
    const d = deal.rows[0];
    if (!d) { await client.query("ROLLBACK"); res.status(404).json({ error: "Deal not found" }); return; }
    if (d.status === "IN_ESCROW") { await client.query("COMMIT"); res.json({ ok: true, status: "IN_ESCROW", dealId, duplicate: true }); return; }
    if (d.status !== "PENDING_PAYMENT") { await client.query("ROLLBACK"); res.status(409).json({ error: `Deal is in status ${d.status}` }); return; }

    const { dealOrderId, totalPayable } = await activateDealEscrow(client, d, razorpay_payment_id);
    await client.query("COMMIT");
    await dealLiveNotify(d, brandId, dealId);
    res.json({ ok: true, status: "IN_ESCROW", dealId, orderId: dealOrderId, totalPayable });
  } catch (e: any) {
    await client.query("ROLLBACK");
    logger.error({ err: e, dealId }, "Deal payment verification failed");
    res.status(500).json({ error: "Verification failed" });
  } finally {
    client.release();
  }
});

router.get("/brand/campaigns/:id", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const campaign = await pool.query(
    `SELECT c.*,
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',cc."categoryId",'name',cat.name)) FILTER (WHERE cc.id IS NOT NULL),'[]') as categories
     FROM "Campaign" c
     LEFT JOIN "CampaignCategory" cc ON cc."campaignId"=c.id
     LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
     WHERE c.id=$1 AND c."brandId"=$2 GROUP BY c.id`,
    [req.params["id"], brandId]
  );
  if (!campaign.rows[0]) { res.status(404).json({ error: "Campaign not found" }); return; }
  const slabs = await pool.query(
    `SELECT id,label,"minFollowers","maxFollowers" FROM "FollowerSlab" WHERE id = ANY($1::text[])`,
    [campaign.rows[0].followerSlabs ?? []]
  );
  res.json({ ...campaign.rows[0], slabs: slabs.rows });
});

router.get("/brand/campaigns/:id/applications", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { status = "PENDING" } = req.query;
  const camp = await pool.query(`SELECT id FROM "Campaign" WHERE id=$1 AND "brandId"=$2`, [req.params["id"], brandId]);
  if (!camp.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  if (status === "SELECTED") {
    const apps = await pool.query(
      `SELECT ca.id, ca.status, ca."appliedAt", ca."selectedAt", ca."confirmationDeadline",
              ca."confirmedAt", ca."declinedAt", ca."expiredAt", ca."dealId",
              cr.id as "creatorId", cr."followerCount", cr."profilePhotoUrl", cr."fullName",
              cr."instagramHandle", cr."averageRating", cr."contentType",
              COALESCE(json_agg(DISTINCT jsonb_build_object('name',cat.name)) FILTER (WHERE cat.id IS NOT NULL),'[]') as categories,
              d.status as "dealStatus", d."totalAgreedValue", d."gstRateLocked"
       FROM "CampaignApplication" ca
       JOIN "Creator" cr ON cr.id=ca."creatorId"
       LEFT JOIN "CreatorCategory" cc ON cc."creatorId"=cr.id
       LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
       LEFT JOIN "Deal" d ON d.id=ca."dealId"
       WHERE ca."campaignId"=$1 AND ca.status IN ('SELECTED','CONFIRMED')
       GROUP BY ca.id, cr.id, d.id ORDER BY ca."selectedAt"`,
      [req.params["id"]]
    );
    res.json(apps.rows);
    return;
  }
  if (status === "SHORTLISTED") {
    const apps = await pool.query(
      `SELECT ca.id, ca.status, ca."appliedAt", ca."shortlistedAt", ca."unlockedAt",
              cr.id as "creatorId", cr."fullName", cr."instagramHandle", cr."profilePhotoUrl",
              cr."followerCount", cr."audienceGenderFemale", cr."audienceGenderMale",
              cr."audienceAge", cr."audienceLocation", cr."campaignGoal",
              cr."reelPriceMin", cr."reelPriceMax", cr."storyPriceMin", cr."storyPriceMax",
              cr."postPriceMin", cr."postPriceMax", cr."averageRating", cr."ratingCount",
              cr."bio", cr.status as "creatorStatus",
              cr."gender" as "creatorGender", cr."contentType", cr."images" as "portfolioImages",
              EXTRACT(YEAR FROM AGE(cr."dateOfBirth"))::int as "creatorAge",
              cr.state as "creatorState",
              COALESCE(json_agg(DISTINCT jsonb_build_object('name',cat.name)) FILTER (WHERE cat.id IS NOT NULL),'[]') as categories,
              COALESCE(json_agg(DISTINCT jsonb_build_object('id',cp.id,'videoUrl',cp."videoUrl")) FILTER (WHERE cp.id IS NOT NULL),'[]') as portfolio,
              (bur."creatorId" IS NOT NULL) as "globallyUnlocked"
       FROM "CampaignApplication" ca
       JOIN "Creator" cr ON cr.id=ca."creatorId"
       LEFT JOIN "CreatorCategory" cc ON cc."creatorId"=cr.id
       LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
       LEFT JOIN "CreatorPortfolio" cp ON cp."creatorId"=cr.id
       LEFT JOIN "BrandUnlockRecord" bur ON bur."brandId"=$2 AND bur."creatorId"=cr.id
       WHERE ca."campaignId"=$1 AND ca.status='SHORTLISTED'
       GROUP BY ca.id,cr.id,bur."creatorId" ORDER BY ca."shortlistedAt"`,
      [req.params["id"], brandId]
    );
    // Hide identifying info until unlocked (via this campaign OR a previous global unlock)
    const masked = apps.rows.map((a: any) => {
      const isUnlocked = !!a.unlockedAt || !!a.globallyUnlocked;
      if (isUnlocked) return { ...a, isUnlocked: true };
      return {
        id: a.id, status: a.status, appliedAt: a.appliedAt, shortlistedAt: a.shortlistedAt,
        isUnlocked: false,
        followerCount: a.followerCount,
        audienceGenderFemale: a.audienceGenderFemale, audienceGenderMale: a.audienceGenderMale,
        audienceAge: a.audienceAge, audienceLocation: a.audienceLocation,
        campaignGoal: a.campaignGoal,
        reelPriceMin: a.reelPriceMin, reelPriceMax: a.reelPriceMax,
        storyPriceMin: a.storyPriceMin, storyPriceMax: a.storyPriceMax,
        postPriceMin: a.postPriceMin, postPriceMax: a.postPriceMax,
        averageRating: a.averageRating, ratingCount: a.ratingCount,
        creatorGender: a.creatorGender,
        contentType: a.contentType, portfolioImages: a.portfolioImages,
        categories: a.categories,
        creatorAge: a.creatorAge,
        creatorState: a.creatorState,
      };
    });
    res.json(masked);
    return;
  }
  // PENDING — partial data only
  const apps = await pool.query(
    `SELECT ca.id, ca.status, ca."appliedAt",
            cr."followerCount",
            cr."audienceGenderFemale", cr."audienceGenderMale",
            cr."audienceAge", cr."audienceLocation", cr."campaignGoal",
            cr."reelPriceMin", cr."reelPriceMax", cr."storyPriceMin", cr."storyPriceMax",
            cr."postPriceMin", cr."postPriceMax", cr."averageRating", cr."ratingCount",
            cr."gender" as "creatorGender", cr."contentType", cr."images" as "portfolioImages",
            EXTRACT(YEAR FROM AGE(cr."dateOfBirth"))::int as "creatorAge",
            cr.state as "creatorState",
            COALESCE(json_agg(DISTINCT jsonb_build_object('name',cat.name)) FILTER (WHERE cat.id IS NOT NULL),'[]') as categories
     FROM "CampaignApplication" ca
     JOIN "Creator" cr ON cr.id=ca."creatorId"
     LEFT JOIN "CreatorCategory" cc ON cc."creatorId"=cr.id
     LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
     WHERE ca."campaignId"=$1 AND ca.status='PENDING'
     GROUP BY ca.id,cr."followerCount",cr."audienceGenderFemale",cr."audienceGenderMale",cr."audienceAge",cr."audienceLocation",cr."campaignGoal",cr."reelPriceMin",cr."reelPriceMax",cr."storyPriceMin",cr."storyPriceMax",cr."postPriceMin",cr."postPriceMax",cr."averageRating",cr."ratingCount",cr."gender",cr."contentType",cr."images",cr."dateOfBirth",cr.state
     ORDER BY ca."appliedAt"`,
    [req.params["id"]]
  );
  res.json(apps.rows);
});

// Unlock a shortlisted creator's identity for 1 credit
router.post("/brand/campaigns/:id/applications/:appId/unlock", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id: campaignId, appId } = req.params as Record<string, string>;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const camp = await client.query(`SELECT id FROM "Campaign" WHERE id=$1 AND "brandId"=$2`, [campaignId, brandId]);
    if (!camp.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Campaign not found" }); return; }
    const app = await client.query(
      `SELECT ca.id, ca."unlockedAt", ca."creatorId", cr."instagramHandle", cr."fullName",
              cr."reelPriceMin", cr."reelPriceMax", cr."storyPriceMin", cr."storyPriceMax",
              cr."postPriceMin", cr."postPriceMax", cr."followerCount"
       FROM "CampaignApplication" ca JOIN "Creator" cr ON cr.id=ca."creatorId"
       WHERE ca.id=$1 AND ca."campaignId"=$2 AND ca.status='SHORTLISTED' FOR UPDATE`,
      [appId, campaignId]
    );
    if (!app.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Application not shortlisted" }); return; }
    if (app.rows[0].unlockedAt) {
      await client.query("ROLLBACK");
      res.json({ ok: true, alreadyUnlocked: true, instagramHandle: app.rows[0].instagramHandle, fullName: app.rows[0].fullName });
      return;
    }
    // Check for an existing global unlock — no credit charge, just stamp the application
    const row = app.rows[0];
    const existingGlobal = await client.query(
      `SELECT id FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2`,
      [brandId, row.creatorId]
    );
    if (existingGlobal.rows.length > 0) {
      await client.query(`UPDATE "CampaignApplication" SET "unlockedAt"=NOW() WHERE id=$1`, [appId]);
      await client.query("COMMIT");
      res.json({ ok: true, alreadyUnlocked: true, instagramHandle: row.instagramHandle ?? null, fullName: row.fullName ?? null });
      return;
    }
    const b = await client.query(`SELECT "creditBalance" FROM "Brand" WHERE id=$1 FOR UPDATE`, [brandId]);
    const bal = parseInt(b.rows[0]?.creditBalance ?? "0");
    if (bal < 1) {
      await client.query("ROLLBACK");
      res.status(402).json({ error: "INSUFFICIENT_CREDITS", message: "You need 1 credit to unlock this profile." });
      return;
    }
    const newBal = bal - 1;
    await client.query(`UPDATE "Brand" SET "creditBalance"=$1 WHERE id=$2`, [newBal, brandId]);
    await client.query(`UPDATE "CampaignApplication" SET "unlockedAt"=NOW() WHERE id=$1`, [appId]);
    await client.query(
      `INSERT INTO "BrandUnlockRecord" (id,"brandId","creatorId","reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax","followerCountAtUnlock","unlockedAt")
       SELECT gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()
       WHERE NOT EXISTS (SELECT 1 FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2)`,
      [brandId, row.creatorId,
       row.reelPriceMin ?? 0, row.reelPriceMax ?? 0,
       row.storyPriceMin ?? 0, row.storyPriceMax ?? 0,
       row.postPriceMin ?? 0, row.postPriceMax ?? 0,
       row.followerCount ?? 0]
    );
    await client.query(
      `INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","createdAt")
       VALUES (gen_random_uuid()::text,$1,'UNLOCK_CAMPAIGN_APPLICANT',-1,$2,NOW())`,
      [brandId, newBal]
    );
    await client.query("COMMIT");
    res.json({ ok: true, newBalance: newBal,
      instagramHandle: row.instagramHandle ?? null, fullName: row.fullName ?? null });
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Internal error" });
  } finally { client.release(); }
});

// Same for barter
router.post("/brand/barter/:id/applications/:appId/unlock", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id: barterId, appId } = req.params as Record<string, string>;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const barter = await client.query(`SELECT id FROM "BarterCampaign" WHERE id=$1 AND "brandId"=$2`, [barterId, brandId]);
    if (!barter.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Barter not found" }); return; }
    const app = await client.query(
      `SELECT ba.id, ba."unlockedAt", ba."creatorId", cr."instagramHandle", cr."fullName",
              cr."reelPriceMin", cr."reelPriceMax", cr."storyPriceMin", cr."storyPriceMax",
              cr."postPriceMin", cr."postPriceMax", cr."followerCount"
       FROM "BarterApplication" ba JOIN "Creator" cr ON cr.id=ba."creatorId"
       WHERE ba.id=$1 AND ba."barterId"=$2 AND ba.status='SHORTLISTED' FOR UPDATE`,
      [appId, barterId]
    );
    if (!app.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Application not shortlisted" }); return; }
    if (app.rows[0].unlockedAt) {
      await client.query("ROLLBACK");
      res.json({ ok: true, alreadyUnlocked: true, instagramHandle: app.rows[0].instagramHandle, fullName: app.rows[0].fullName });
      return;
    }
    // Check for an existing global unlock — no credit charge, just stamp the application
    const row = app.rows[0];
    const existingGlobalBarter = await client.query(
      `SELECT id FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2`,
      [brandId, row.creatorId]
    );
    if (existingGlobalBarter.rows.length > 0) {
      await client.query(`UPDATE "BarterApplication" SET "unlockedAt"=NOW() WHERE id=$1`, [appId]);
      await client.query("COMMIT");
      res.json({ ok: true, alreadyUnlocked: true, instagramHandle: row.instagramHandle ?? null, fullName: row.fullName ?? null });
      return;
    }
    const b = await client.query(`SELECT "creditBalance" FROM "Brand" WHERE id=$1 FOR UPDATE`, [brandId]);
    const bal = parseInt(b.rows[0]?.creditBalance ?? "0");
    if (bal < 1) { await client.query("ROLLBACK"); res.status(402).json({ error: "INSUFFICIENT_CREDITS" }); return; }
    const newBal = bal - 1;
    await client.query(`UPDATE "Brand" SET "creditBalance"=$1 WHERE id=$2`, [newBal, brandId]);
    await client.query(`UPDATE "BarterApplication" SET "unlockedAt"=NOW() WHERE id=$1`, [appId]);
    await client.query(
      `INSERT INTO "BrandUnlockRecord" (id,"brandId","creatorId","reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax","followerCountAtUnlock","unlockedAt")
       SELECT gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()
       WHERE NOT EXISTS (SELECT 1 FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2)`,
      [brandId, row.creatorId,
       row.reelPriceMin ?? 0, row.reelPriceMax ?? 0,
       row.storyPriceMin ?? 0, row.storyPriceMax ?? 0,
       row.postPriceMin ?? 0, row.postPriceMax ?? 0,
       row.followerCount ?? 0]
    );
    await client.query(
      `INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","createdAt")
       VALUES (gen_random_uuid()::text,$1,'UNLOCK_BARTER_APPLICANT',-1,$2,NOW())`,
      [brandId, newBal]
    );
    await client.query("COMMIT");
    res.json({ ok: true, newBalance: newBal,
      instagramHandle: row.instagramHandle ?? null, fullName: row.fullName ?? null });
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Internal error" });
  } finally { client.release(); }
});

router.post("/brand/campaigns/:id/applications/:appId/shortlist", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const camp = await pool.query(`SELECT id FROM "Campaign" WHERE id=$1 AND "brandId"=$2`, [req.params["id"], brandId]);
  if (!camp.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const app = await pool.query(`UPDATE "CampaignApplication" SET status='SHORTLISTED',"shortlistedAt"=NOW() WHERE id=$1 AND "campaignId"=$2 AND status='PENDING' RETURNING "creatorId"`, [req.params["appId"], req.params["id"]]);
  if (!app.rows[0]) { res.status(404).json({ error: "Application not found or already shortlisted" }); return; }
  res.json({ ok: true });
});

router.post("/brand/campaigns/:id/applications/:appId/select", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id: campaignId, appId } = req.params as Record<string, string>;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const camp = await client.query(`SELECT * FROM "Campaign" WHERE id=$1 AND "brandId"=$2 FOR UPDATE`, [campaignId, brandId]);
    if (!camp.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    const c = camp.rows[0];
    if ((c.slotsFilled as number) >= (c.slotCount as number)) {
      await client.query("ROLLBACK"); res.status(409).json({ error: "All slots are now filled" }); return;
    }
    const app = await client.query(
      `SELECT ca.*,cr.id as "creatorId",cr."instagramHandle",cr."fullName" FROM "CampaignApplication" ca JOIN "Creator" cr ON cr.id=ca."creatorId" WHERE ca.id=$1 AND ca."campaignId"=$2 AND ca.status IN ('PENDING','SHORTLISTED')`,
      [appId, campaignId]
    );
    if (!app.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Application not found or not selectable" }); return; }
    const creatorId = app.rows[0].creatorId as string;
    const handle = app.rows[0].instagramHandle ?? app.rows[0].fullName ?? "Creator";
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await client.query(
      `UPDATE "CampaignApplication" SET status='SELECTED',"selectedAt"=NOW(),"confirmationDeadline"=$1 WHERE id=$2`,
      [deadline.toISOString(), appId]
    );
    // Reserve slot immediately on selection
    const newFilled = (c.slotsFilled as number) + 1;
    const newStatus = newFilled >= (c.slotCount as number) ? "HIDDEN" : "LIVE";
    await client.query(`UPDATE "Campaign" SET "slotsFilled"=$1,status=$2 WHERE id=$3`, [newFilled, newStatus, campaignId]);
    await client.query("COMMIT");
    await notify(creatorId, "CREATOR", `You've been selected for "${c.name}"!`,
      `${c.brandName ?? "A brand"} has selected you for "${c.name}". Please confirm your participation within 48 hours.`);
    await notify(brandId, "BRAND", "Selection Sent",
      `Your selection of @${handle} for "${c.name}" has been sent. Waiting for their confirmation (48-hour window).`);
    if (newStatus === "HIDDEN") await notify(brandId, "BRAND", "Campaign Full — All Slots Reserved",
      `All slots for "${c.name}" are now reserved. The campaign is now hidden from new creators.`);
    await createPopup({
      userId: creatorId, userType: "CREATOR", type: "CAMPAIGN_SELECTED",
      title: "You've Been Selected 🎉",
      body: `A brand selected you for "${c.name}". Respond now to continue.`,
      ctaText: "Respond Now", ctaPath: `/home-creator/campaigns/${campaignId}`,
      isCelebration: true, relatedEntityId: appId,
    });
    res.json({ ok: true });
  } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Internal error" }); }
  finally { client.release(); }
});

// Creator confirm / decline selection
router.post("/creator/campaigns/:id/applications/:appId/confirm", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id: campaignId, appId } = req.params as Record<string, string>;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const app = await client.query(
      `SELECT ca.*,c.*,c.id as "campaignId",c.name as "campName",c."brandId" FROM "CampaignApplication" ca
       JOIN "Campaign" c ON c.id=ca."campaignId"
       WHERE ca.id=$1 AND ca."creatorId"=$2 AND ca."campaignId"=$3 AND ca.status='SELECTED' FOR UPDATE`,
      [appId, creatorId, campaignId]
    );
    if (!app.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Application not found or not in selected state" }); return; }
    const a = app.rows[0];
    if (a.confirmationDeadline && new Date(a.confirmationDeadline) < new Date()) {
      await client.query("ROLLBACK"); res.status(409).json({ error: "Confirmation window expired" }); return;
    }
    const type = a.type as string;
    const price = parseFloat(a.pricePerCreator);
    const commRate = parseFloat(a.commissionRateAtCreation ?? "5");
    const gstCfg = await client.query(`SELECT value FROM "PlatformConfig" WHERE key='gst_rate'`);
    const gstRate = parseFloat(gstCfg.rows[0]?.value ?? "18") || 18;
    const payDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const deal = await client.query(
      `INSERT INTO "Deal" (id,"campaignId","brandId","creatorId",source,status,
        "reelCount","storyCount","postCount","agreedPricePerReel","agreedPricePerStory","agreedPricePerPost",
        "totalAgreedValue","commissionRate","commissionRateLocked","creatorPayout","timelineDays",
        "productRequired","deliveryWindowDays","escrowStatus","paymentDeadlineAt","createdAt","gstRateLocked")
       VALUES (gen_random_uuid()::text,$1,$2,$3,'CAMPAIGN','PENDING_PAYMENT',
        $4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,'NONE',$16,NOW(),$17)
       RETURNING id`,
      [a.campaignId, a.brandId, creatorId,
       type === "REEL" ? 1 : 0, type === "STORY" ? 1 : 0, type === "POST" ? 1 : 0,
       type === "REEL" ? price : 0, type === "STORY" ? price : 0, type === "POST" ? price : 0,
       price, commRate, price * (1 - commRate / 100), a.timelineDays,
       !!a.productRequired, a.deliveryWindowDays ?? null,
       payDeadline.toISOString(), gstRate]
    );
    const dealId = deal.rows[0].id as string;

    // Seed one DealDeliverable per content type (mirrors direct-deal flow)
    const deliverableType = (type === "STORY" || type === "POST") ? type : "REEL";
    const slotLabel = deliverableType === "STORY" ? "Story 1" : deliverableType === "POST" ? "Post 1" : "Reel 1";
    await client.query(
      `INSERT INTO "DealDeliverable" (id,"dealId",type,"slotLabel","conceptStatus","conceptRevisionCount","finalStatus","finalRevisionCount")
       VALUES (gen_random_uuid(),$1,$2,$3,'PENDING',0,'PENDING',0)`,
      [dealId, deliverableType, slotLabel]
    );

    await client.query(`UPDATE "CampaignApplication" SET status='CONFIRMED',"confirmedAt"=NOW(),"dealId"=$1 WHERE id=$2`, [dealId, appId]);
    await client.query("COMMIT");
    await createNotification({
      userId: a.brandId as string, userType: "BRAND", type: "BARTER_CREATOR_CONFIRMED_PAID",
      title: `Creator confirmed for "${a.campName}"!`,
      body: `A creator confirmed! Please make payment within 48 hours to start the deal.`,
      relatedEntityType: "CAMPAIGN", relatedEntityId: a.campaignId as string,
      emailParams: { campaign_name: a.campName },
      expiresInDays: 90,
    }).catch(() => {});
    await createPopup({
      userId: a.brandId as string, userType: "BRAND", type: "OFFER_ACCEPTED",
      title: "Campaign Accepted 🎉",
      body: `A creator confirmed their spot in "${a.campName}". Complete payment within 48 hours to start the deal.`,
      ctaText: "View Campaigns", ctaPath: "/home-brand/campaigns",
      isCelebration: true, relatedEntityId: dealId,
    });
    res.json({ ok: true, dealId });
  } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Internal error" }); }
  finally { client.release(); }
});

router.post("/creator/campaigns/:id/applications/:appId/decline", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id: campaignId, appId } = req.params as Record<string, string>;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const app = await client.query(
      `SELECT ca.*,c.name as "campName",c."brandId",c."slotsFilled",c."slotCount",c.status as "campStatus",c."expiresAt"
       FROM "CampaignApplication" ca JOIN "Campaign" c ON c.id=ca."campaignId"
       WHERE ca.id=$1 AND ca."creatorId"=$2 AND ca."campaignId"=$3 AND ca.status='SELECTED' FOR UPDATE`,
      [appId, creatorId, campaignId]
    );
    if (!app.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Application not found" }); return; }
    const a = app.rows[0];
    await client.query(`UPDATE "CampaignApplication" SET status='DECLINED',"declinedAt"=NOW() WHERE id=$1`, [appId]);
    const newFilled = Math.max(0, (a.slotsFilled as number) - 1);
    const stillActive = a.expiresAt && new Date(a.expiresAt) > new Date();
    const newCampStatus = (a.campStatus === "HIDDEN" && stillActive) ? "LIVE" : a.campStatus;
    await client.query(`UPDATE "Campaign" SET "slotsFilled"=$1,status=$2 WHERE id=$3`, [newFilled, newCampStatus, campaignId]);
    await client.query("COMMIT");
    const cr = await pool.query(`SELECT "instagramHandle","fullName" FROM "Creator" WHERE id=$1`, [creatorId]);
    const handle = cr.rows[0]?.instagramHandle ?? cr.rows[0]?.fullName ?? "Creator";
    await notify(a.brandId as string, "BRAND", "Creator Declined",
      `@${handle} declined your selection for "${a.campName}". You can select another creator.`);
    res.json({ ok: true });
  } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Internal error" }); }
  finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BRAND — BARTER
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/brand/barter", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const r = await pool.query(
    `SELECT bc.*,
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',bcat."categoryId",'name',cat.name)) FILTER (WHERE bcat.id IS NOT NULL),'[]') as categories,
       (SELECT COUNT(*)::int FROM "BarterApplication" WHERE "barterId"=bc.id) as "pendingApps",
       (SELECT COUNT(*)::int FROM "BarterApplication" WHERE "barterId"=bc.id AND status IN ('SELECTED','CONFIRMED')) as "selectedApps"
     FROM "BarterCampaign" bc
     LEFT JOIN "BarterCategory" bcat ON bcat."barterId"=bc.id
     LEFT JOIN "Category" cat ON cat.id=bcat."categoryId"
     WHERE bc."brandId"=$1 GROUP BY bc.id ORDER BY bc."createdAt" DESC`,
    [brandId]
  );
  res.json(r.rows);
});

router.post("/brand/barter/create", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { name, contentType, categories, productName, productDescription, productValueInr,
    productPhotos, contentRequirements, script, keyMessage, dosAndDonts, followerSlabs,
    targetGender, targetAge, targetLocation,
    slotCount, timelineDays, durationDays, deliveryWindowDays } = req.body;

  if (!name?.trim()) { res.status(400).json({ error: "Campaign name required" }); return; }
  if (contentType !== "REEL") { res.status(400).json({ error: "Invalid content type" }); return; }
  if (!categories?.length) { res.status(400).json({ error: "At least one category required" }); return; }
  if (!productName?.trim()) { res.status(400).json({ error: "Product name required" }); return; }
  if (!productDescription?.trim()) { res.status(400).json({ error: "Product description required" }); return; }
  if (!productValueInr || parseFloat(productValueInr) < 1) { res.status(400).json({ error: "Product value required" }); return; }
  if (!productPhotos?.length) { res.status(400).json({ error: "At least one product photo required" }); return; }
  if (!contentRequirements?.trim()) { res.status(400).json({ error: "Content requirements required" }); return; }
  if (!followerSlabs?.length) { res.status(400).json({ error: "At least one follower slab required" }); return; }
  if (!targetGender || !targetAge || !targetLocation) { res.status(400).json({ error: "Audience targeting required" }); return; }
  if (!slotCount || parseInt(slotCount) < 1) { res.status(400).json({ error: "At least 1 slot required" }); return; }
  { const tl = parseInt(timelineDays ?? "0"); if (!timelineDays || isNaN(tl) || tl < 7 || tl > 14) { res.status(400).json({ error: "Content delivery timeline must be between 7 and 14 days" }); return; } }
  if (!durationDays || parseInt(durationDays) < 1) { res.status(400).json({ error: "Campaign duration required" }); return; }

  // Contact info scan — block if found in brief fields
  const CONTACT_RE = /(\+91|\b91[-\s]?)?\d{10}\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(wa\.me|t\.me|bit\.ly|linktree)/i;
  const briefText = `${contentRequirements ?? ""} ${keyMessage ?? ""} ${dosAndDonts ?? ""}`;
  if (CONTACT_RE.test(briefText)) { res.status(400).json({ error: "Brief cannot contain phone numbers, emails or external links" }); return; }

  const minValue = parseFloat(await getCfg("min_barter_product_value", "100"));
  if (parseFloat(productValueInr) < minValue) { res.status(400).json({ error: `Minimum product value is ₹${minValue}` }); return; }
  const maxSlots = parseInt(await getCfg("max_barter_slots", "20"));
  if (parseInt(slotCount) > maxSlots) { res.status(400).json({ error: `Maximum ${maxSlots} slots allowed` }); return; }
  const minDays = parseInt(await getCfg("min_barter_days", "7"));
  const maxDays = parseInt(await getCfg("max_barter_days", "60"));
  const dur = parseInt(durationDays);
  if (dur < minDays || dur > maxDays) { res.status(400).json({ error: `Campaign duration must be ${minDays}–${maxDays} days` }); return; }

  await pool.query(`ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "script" TEXT`);

  const barterId = (await pool.query(
    `INSERT INTO "BarterCampaign" (id,"brandId",name,"contentType","productName","productDescription",
     "productValueInr","productPhotos","contentRequirements","script","keyMessage","dosAndDonts",
     "slotCount","slotsFilled","timelineDays","durationDays","deliveryWindowDays",
     status,"creditsCharged","followerSlabs","targetGender","targetAge","targetLocation","createdAt")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,$15,'PENDING_APPROVAL',0,$16::jsonb,$17,$18,$19,NOW())
     RETURNING id`,
    [brandId, name.trim(), contentType, productName.trim(), productDescription.trim(),
     parseFloat(productValueInr), productPhotos, contentRequirements.trim(),
     script?.trim() ?? null, keyMessage?.trim() ?? null, dosAndDonts?.trim() ?? null,
     parseInt(slotCount), parseInt(timelineDays), dur, deliveryWindowDays ? parseInt(deliveryWindowDays) : null,
     JSON.stringify(followerSlabs), targetGender, targetAge, targetLocation]
  )).rows[0].id as string;

  for (const cat of categories) {
    await pool.query(
      `INSERT INTO "BarterCategory" (id,"barterId","categoryId","subcategoryId") VALUES (gen_random_uuid()::text,$1,$2,$3)`,
      [barterId, cat.categoryId, cat.subcategoryId ?? null]
    );
  }

  const admin = await pool.query(`SELECT id FROM "Admin" LIMIT 1`);
  if (admin.rows[0]) await notify(admin.rows[0].id, "ADMIN", "New Barter Campaign", `New barter campaign "${name}" submitted for review.`);
  await notify(brandId, "BRAND", "Barter Campaign Submitted", `Your barter campaign "${name}" has been submitted for review. We'll respond within 48 hours.`);
  res.status(201).json({ barterId, status: "PENDING_APPROVAL" });
});

router.get("/brand/barter/:id", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const r = await pool.query(
    `SELECT bc.*,
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',bcat."categoryId",'name',cat.name)) FILTER (WHERE bcat.id IS NOT NULL),'[]') as categories
     FROM "BarterCampaign" bc
     LEFT JOIN "BarterCategory" bcat ON bcat."barterId"=bc.id
     LEFT JOIN "Category" cat ON cat.id=bcat."categoryId"
     WHERE bc.id=$1 AND bc."brandId"=$2 GROUP BY bc.id`,
    [req.params["id"], brandId]
  );
  if (!r.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r.rows[0]);
});

router.get("/brand/barter/:id/applications", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { status = "PENDING" } = req.query;
  const barter = await pool.query(`SELECT id FROM "BarterCampaign" WHERE id=$1 AND "brandId"=$2`, [req.params["id"], brandId]);
  if (!barter.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  if (status === "SHORTLISTED" || status === "SELECTED") {
    const whereClause = status === "SELECTED"
      ? `ba."barterId"=$1 AND ba.status IN ('SELECTED','CONFIRMED')`
      : `ba."barterId"=$1 AND ba.status='SHORTLISTED'`;
    const apps = await pool.query(
      `SELECT ba.id, ba.status, ba."appliedAt", ba."shortlistedAt", ba."selectedAt", ba."dealId",
              ba."unlockedAt", ba."confirmationDeadline", ba."confirmedAt", ba."declinedAt", ba."expiredAt",
              cr.id as "creatorId", cr."fullName", cr."instagramHandle", cr."profilePhotoUrl",
              cr."followerCount", cr."audienceGenderFemale", cr."audienceGenderMale", cr."audienceAge", cr."audienceLocation",
              cr."reelPriceMin", cr."reelPriceMax", cr."storyPriceMin", cr."storyPriceMax",
              cr."postPriceMin", cr."postPriceMax", cr."averageRating", cr."ratingCount",
              cr."gender" as "creatorGender", cr."contentType", cr."images" as "portfolioImages",
              EXTRACT(YEAR FROM AGE(cr."dateOfBirth"))::int as "creatorAge",
              COALESCE(json_agg(DISTINCT jsonb_build_object('name',cat.name)) FILTER (WHERE cat.id IS NOT NULL),'[]') as categories,
              (bur."creatorId" IS NOT NULL) as "globallyUnlocked"
       FROM "BarterApplication" ba
       JOIN "Creator" cr ON cr.id=ba."creatorId"
       LEFT JOIN "CreatorCategory" cc ON cc."creatorId"=cr.id
       LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
       LEFT JOIN "BrandUnlockRecord" bur ON bur."brandId"=$2 AND bur."creatorId"=cr.id
       WHERE ${whereClause}
       GROUP BY ba.id,cr.id,bur."creatorId" ORDER BY ba."appliedAt"`,
      [req.params["id"], brandId]
    );
    const masked = apps.rows.map((r: any) => {
      const isUnlocked = !!r.unlockedAt || !!r.globallyUnlocked || r.status === "SELECTED";
      if (status === "SHORTLISTED" && !isUnlocked) {
        return { ...r, fullName: null, instagramHandle: null, profilePhotoUrl: null, isUnlocked: false };
      }
      return { ...r, isUnlocked };
    });
    res.json(masked);
    return;
  }
  // PENDING — partial
  const apps = await pool.query(
    `SELECT ba.id, ba.status, ba."appliedAt",
            cr."followerCount",cr."audienceGenderFemale",cr."audienceGenderMale",cr."audienceAge",cr."audienceLocation",
            cr."reelPriceMin",cr."reelPriceMax",cr."storyPriceMin",cr."storyPriceMax",cr."postPriceMin",cr."postPriceMax",
            cr."averageRating",cr."ratingCount",cr."gender" as "creatorGender",cr."contentType",EXTRACT(YEAR FROM AGE(cr."dateOfBirth"))::int as "creatorAge",
            COALESCE(json_agg(DISTINCT jsonb_build_object('name',cat.name)) FILTER (WHERE cat.id IS NOT NULL),'[]') as categories
     FROM "BarterApplication" ba
     JOIN "Creator" cr ON cr.id=ba."creatorId"
     LEFT JOIN "CreatorCategory" cc ON cc."creatorId"=cr.id
     LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
     WHERE ba."barterId"=$1 AND ba.status='PENDING'
     GROUP BY ba.id,cr."followerCount",cr."audienceGenderFemale",cr."audienceGenderMale",cr."audienceAge",cr."audienceLocation",cr."reelPriceMin",cr."reelPriceMax",cr."storyPriceMin",cr."storyPriceMax",cr."postPriceMin",cr."postPriceMax",cr."averageRating",cr."ratingCount",cr."gender",cr."contentType",cr."dateOfBirth"
     ORDER BY ba."appliedAt"`,
    [req.params["id"]]
  );
  res.json(apps.rows);
});

router.post("/brand/barter/:id/applications/:appId/shortlist", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const barter = await pool.query(`SELECT id FROM "BarterCampaign" WHERE id=$1 AND "brandId"=$2`, [req.params["id"], brandId]);
  if (!barter.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const app = await pool.query(`UPDATE "BarterApplication" SET status='SHORTLISTED',"shortlistedAt"=NOW() WHERE id=$1 AND "barterId"=$2 AND status='PENDING' RETURNING id`, [req.params["appId"], req.params["id"]]);
  if (!app.rows[0]) { res.status(404).json({ error: "Application not found" }); return; }
  res.json({ ok: true });
});

router.post("/brand/barter/:id/applications/:appId/select", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const barter = await pool.query(`SELECT * FROM "BarterCampaign" WHERE id=$1 AND "brandId"=$2`, [req.params["id"], brandId]);
  if (!barter.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const b = barter.rows[0];
  if (b.slotsFilled >= b.slotCount) { res.status(409).json({ error: "All slots are now filled" }); return; }
  const app = await pool.query(
    `SELECT ba.*,cr.id as "creatorId",cr."fullName" FROM "BarterApplication" ba JOIN "Creator" cr ON cr.id=ba."creatorId" WHERE ba.id=$1 AND ba."barterId"=$2 AND ba.status IN ('PENDING','SHORTLISTED')`,
    [req.params["appId"], req.params["id"]]
  );
  if (!app.rows[0]) { res.status(404).json({ error: "Application not found" }); return; }
  const creatorId = app.rows[0].creatorId as string;
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await pool.query(
    `UPDATE "BarterApplication" SET status='SELECTED',"selectedAt"=NOW(),"confirmationDeadline"=$1 WHERE id=$2`,
    [deadline, req.params["appId"]]
  );
  // Reserve slot immediately on selection
  const newFilled = (b.slotsFilled as number) + 1;
  const newStatus = newFilled >= (b.slotCount as number) ? "HIDDEN" : "LIVE";
  await pool.query(`UPDATE "BarterCampaign" SET "slotsFilled"=$1,status=$2 WHERE id=$3`, [newFilled, newStatus, req.params["id"]]);
  await notify(creatorId, "CREATOR", "You've Been Selected — Confirm Within 48 Hours",
    `${b.brandName ?? "A brand"} selected you for barter campaign "${b.name}". You will receive ${b.productName} (₹${b.productValueInr}) for creating ${b.contentType} content. Please confirm within 48 hours.`);
  if (newStatus === "HIDDEN") await notify(brandId, "BRAND", "Campaign Full — All Slots Reserved",
    `All slots for "${b.name}" are now reserved. The campaign is now hidden from new creators.`);
  await createPopup({
    userId: creatorId, userType: "CREATOR", type: "CAMPAIGN_SELECTED",
    title: "You've Been Selected 🎉",
    body: `A brand selected you for "${b.name}". Respond now to continue.`,
    ctaText: "Respond Now", ctaPath: `/home-creator/barter/${req.params["id"]}`,
    isCelebration: true, relatedEntityId: String(req.params["appId"]),
  });
  res.json({ ok: true });
});

// Creator confirms barter selection → deal created in IN_ESCROW (no payment step)
router.post("/creator/barter/:id/applications/:appId/confirm", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const app = await client.query(
      `SELECT ba.*,bc.*,ba.id as "appId" FROM "BarterApplication" ba JOIN "BarterCampaign" bc ON bc.id=ba."barterId" WHERE ba.id=$1 AND ba."creatorId"=$2 AND ba.status='SELECTED' FOR UPDATE`,
      [req.params["appId"], creatorId]
    );
    if (!app.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Application not found or not in SELECTED state" }); return; }
    const a = app.rows[0];
    if (a.confirmationDeadline && new Date(a.confirmationDeadline) < new Date()) {
      await client.query(`UPDATE "BarterApplication" SET status='EXPIRED',"expiredAt"=NOW() WHERE id=$1`, [req.params["appId"]]);
      await client.query("COMMIT");
      res.status(400).json({ error: "Confirmation deadline has passed" }); return;
    }
    const cType = a.contentType as string;
    const barterGstCfg = await client.query(`SELECT value FROM "PlatformConfig" WHERE key='gst_rate'`);
    const barterGstRate = parseFloat(barterGstCfg.rows[0]?.value ?? "18") || 18;
    const timelineDays = parseInt(a.timelineDays as string) || 8;
    const dealDeadline = new Date(Date.now() + timelineDays * 24 * 60 * 60 * 1000);
    const deal = await client.query(
      `INSERT INTO "Deal" (id,"barterId","brandId","creatorId",source,status,
        "reelCount","storyCount","postCount","agreedPricePerReel","agreedPricePerStory","agreedPricePerPost",
        "totalAgreedValue","commissionRate","timelineDays","productRequired","deliveryWindowDays","escrowStatus","createdAt","gstRateLocked",
        "timelineStartAt","deadlineAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3,'BARTER','IN_ESCROW',$4,$5,$6,0,0,0,0,0,$7,true,$8,'NONE',NOW(),$9,
        NOW(),$10)
       RETURNING id`,
      [a.barterId, a.brandId, creatorId,
       cType === "REEL" ? 1 : 0, cType === "STORY" ? 1 : 0, cType === "POST" ? 1 : 0,
       timelineDays, a.deliveryWindowDays ?? null, barterGstRate, dealDeadline.toISOString()]
    );
    const dealId = deal.rows[0].id as string;
    const deliverableType = cType === "STORY" ? "STORY" : cType === "POST" ? "POST" : "REEL";
    const slotLabel = deliverableType === "STORY" ? "Story 1" : deliverableType === "POST" ? "Post 1" : "Reel 1";
    await client.query(
      `INSERT INTO "DealDeliverable" (id,"dealId",type,"slotLabel","conceptStatus","conceptRevisionCount","finalStatus","finalRevisionCount")
       VALUES (gen_random_uuid(),$1,$2,$3,'PENDING',0,'PENDING',0)`,
      [dealId, deliverableType, slotLabel]
    );
    await client.query(`UPDATE "BarterApplication" SET status='CONFIRMED',"confirmedAt"=NOW(),"dealId"=$1 WHERE id=$2`, [dealId, req.params["appId"]]);
    await client.query("COMMIT");
    await createNotification({
      userId: a.brandId as string, userType: "BRAND", type: "BARTER_CREATOR_CONFIRMED",
      title: "Creator Confirmed!",
      body: `A creator confirmed your barter campaign "${a.name}". Ship ${a.productName} to them after they share their address in the deal chat.`,
      emailTemplateId: 23, emailSubject: "Creator confirmed your barter campaign",
      emailParams: { campaign_name: a.name, product_name: a.productName },
      relatedEntityType: "BARTER_CAMPAIGN", relatedEntityId: a.barterId as string,
      expiresInDays: 90,
    }).catch(() => {});
    await createPopup({
      userId: a.brandId as string, userType: "BRAND", type: "DEAL_LIVE",
      title: "Congrats! Your Deal is Live 🚀",
      body: "Your collaboration is now active and the deal workflow has started. Want to understand how the deal flow works?",
      ctaText: "See Deal", ctaPath: "/home-brand/deals?tab=live",
      secondCtaText: "Watch Video", secondCtaPath: "/home-brand/deals?tab=live&tutorial=1",
      isCelebration: true, relatedEntityId: dealId,
    });
    await createPopup({
      userId: creatorId, userType: "CREATOR", type: "DEAL_LIVE",
      title: "Congrats! Your Deal is Live 🚀",
      body: "Your barter collaboration is now active. Ship address will be needed in deal chat. Want to understand how the deal flow works?",
      ctaText: "See Deal", ctaPath: "/home-creator/deals?tab=live",
      secondCtaText: "Watch Video", secondCtaPath: "/home-creator/deals?tab=live&tutorial=1",
      isCelebration: true, relatedEntityId: dealId,
    });
    res.json({ ok: true, dealId });
  } catch (e) {
    await client.query("ROLLBACK");
    req.log.error({ err: e }, "barter confirm failed");
    res.status(500).json({ error: "Internal error" });
  } finally {
    client.release();
  }
});

// Creator declines barter selection
router.post("/creator/barter/:id/applications/:appId/decline", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const app = await client.query(
      `SELECT ba.*,bc.name,bc."brandId",bc."slotsFilled",bc."slotCount",bc.status as "campStatus",bc."expiresAt"
       FROM "BarterApplication" ba JOIN "BarterCampaign" bc ON bc.id=ba."barterId"
       WHERE ba.id=$1 AND ba."creatorId"=$2 AND ba.status='SELECTED' FOR UPDATE`,
      [req.params["appId"], creatorId]
    );
    if (!app.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Application not found" }); return; }
    const a = app.rows[0];
    await client.query(`UPDATE "BarterApplication" SET status='DECLINED',"declinedAt"=NOW() WHERE id=$1`, [req.params["appId"]]);
    const newFilled = Math.max(0, (a.slotsFilled as number) - 1);
    const stillActive = a.expiresAt && new Date(a.expiresAt) > new Date();
    const newCampStatus = (a.campStatus === "HIDDEN" && stillActive) ? "LIVE" : a.campStatus;
    await client.query(`UPDATE "BarterCampaign" SET "slotsFilled"=$1,status=$2 WHERE id=$3`, [newFilled, newCampStatus, a.barterId]);
    await client.query("COMMIT");
    await notify(a.brandId as string, "BRAND", "Creator Declined",
      `A creator declined your barter campaign "${a.name}". The slot is open again.`);
    res.json({ ok: true });
  } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Internal error" }); }
  finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATOR — CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/creator/campaigns/available", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const creator = await pool.query(`SELECT status FROM "Creator" WHERE id=$1`, [creatorId]);
  if (!creator.rows[0] || creator.rows[0].status !== "ACTIVE") { res.json([]); return; }
  const campaigns = await pool.query(
    `SELECT c.*,
       b."brandName", b."logoUrl",
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',cc."categoryId",'name',cat.name)) FILTER (WHERE cc.id IS NOT NULL),'[]') as categories,
       EXISTS(SELECT 1 FROM "CampaignApplication" ca WHERE ca."campaignId"=c.id AND ca."creatorId"=$1) as "hasApplied",
       (SELECT status FROM "CampaignApplication" ca WHERE ca."campaignId"=c.id AND ca."creatorId"=$1 LIMIT 1) as "applicationStatus"
     FROM "Campaign" c
     JOIN "Brand" b ON b.id=c."brandId"
     LEFT JOIN "CampaignCategory" cc ON cc."campaignId"=c.id
     LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
     WHERE c.status='LIVE'
     GROUP BY c.id,b.id ORDER BY c."liveAt" DESC NULLS LAST`,
    [creatorId]
  );
  res.json(campaigns.rows);
});

router.get("/creator/barter/available", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const creator = await pool.query(`SELECT status FROM "Creator" WHERE id=$1`, [creatorId]);
  if (!creator.rows[0] || creator.rows[0].status !== "ACTIVE") { res.json([]); return; }
  const barters = await pool.query(
    `SELECT bc.*,
       b."brandName", b."logoUrl",
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',bcat."categoryId",'name',cat.name)) FILTER (WHERE bcat.id IS NOT NULL),'[]') as categories,
       EXISTS(SELECT 1 FROM "BarterApplication" ba WHERE ba."barterId"=bc.id AND ba."creatorId"=$1) as "hasApplied",
       (SELECT status FROM "BarterApplication" ba WHERE ba."barterId"=bc.id AND ba."creatorId"=$1 LIMIT 1) as "applicationStatus"
     FROM "BarterCampaign" bc
     JOIN "Brand" b ON b.id=bc."brandId"
     LEFT JOIN "BarterCategory" bcat ON bcat."barterId"=bc.id
     LEFT JOIN "Category" cat ON cat.id=bcat."categoryId"
     WHERE bc.status='LIVE'
     GROUP BY bc.id,b.id ORDER BY bc."liveAt" DESC NULLS LAST`,
    [creatorId]
  );
  res.json(barters.rows);
});

router.get("/creator/campaigns/:id", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const r = await pool.query(
    `SELECT c.*,
       b."brandName",b."logoUrl",b.about as "brandAbout",b."websiteUrl" as "brandWebsite",
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',cc."categoryId",'name',cat.name)) FILTER (WHERE cc.id IS NOT NULL),'[]') as categories,
       (SELECT status FROM "CampaignApplication" WHERE "campaignId"=c.id AND "creatorId"=$2 LIMIT 1) as "applicationStatus",
       (SELECT id FROM "CampaignApplication" WHERE "campaignId"=c.id AND "creatorId"=$2 LIMIT 1) as "applicationId",
       (SELECT "confirmationDeadline" FROM "CampaignApplication" WHERE "campaignId"=c.id AND "creatorId"=$2 LIMIT 1) as "confirmationDeadline",
       (SELECT "dealId" FROM "CampaignApplication" WHERE "campaignId"=c.id AND "creatorId"=$2 LIMIT 1) as "dealId",
       (c."slotCount"-c."slotsFilled") as "slotsRemaining"
     FROM "Campaign" c JOIN "Brand" b ON b.id=c."brandId"
     LEFT JOIN "CampaignCategory" cc ON cc."campaignId"=c.id
     LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
     WHERE c.id=$1 GROUP BY c.id,b.id`,
    [req.params["id"], creatorId]
  );
  if (!r.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const campaign = r.rows[0];
  const slabIds: string[] = campaign.followerSlabs ?? [];
  const [slabsR, crR, crCatsR] = await Promise.all([
    slabIds.length > 0
      ? pool.query(`SELECT id,label,"minFollowers","maxFollowers" FROM "FollowerSlab" WHERE id=ANY($1::text[]) ORDER BY "minFollowers"`, [slabIds])
      : Promise.resolve({ rows: [] }),
    pool.query(`SELECT gender,"followerCount","selectedSlabId" FROM "Creator" WHERE id=$1`, [creatorId]),
    pool.query(`SELECT "categoryId" FROM "CreatorCategory" WHERE "creatorId"=$1`, [creatorId]),
  ]);
  res.json({
    ...campaign,
    resolvedSlabs: slabsR.rows,
    creatorGender: crR.rows[0]?.gender ?? null,
    creatorFollowerCount: crR.rows[0]?.followerCount ?? null,
    creatorSelectedSlabId: crR.rows[0]?.selectedSlabId ?? null,
    creatorCategoryIds: crCatsR.rows.map((x: any) => x.categoryId),
  });
});

router.get("/creator/barter/:id", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const r = await pool.query(
    `SELECT bc.*,
       b."brandName",b."logoUrl",b.about as "brandAbout",b."websiteUrl" as "brandWebsite",
       (SELECT id FROM "BarterApplication" WHERE "barterId"=bc.id AND "creatorId"=$2 LIMIT 1) as "applicationId",
       (SELECT "confirmationDeadline" FROM "BarterApplication" WHERE "barterId"=bc.id AND "creatorId"=$2 LIMIT 1) as "confirmationDeadline",
       (SELECT "dealId" FROM "BarterApplication" WHERE "barterId"=bc.id AND "creatorId"=$2 LIMIT 1) as "dealId",
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',bcat."categoryId",'name',cat.name)) FILTER (WHERE bcat.id IS NOT NULL),'[]') as categories,
       (SELECT status FROM "BarterApplication" WHERE "barterId"=bc.id AND "creatorId"=$2 LIMIT 1) as "applicationStatus",
       (bc."slotCount"-bc."slotsFilled") as "slotsRemaining"
     FROM "BarterCampaign" bc JOIN "Brand" b ON b.id=bc."brandId"
     LEFT JOIN "BarterCategory" bcat ON bcat."barterId"=bc.id
     LEFT JOIN "Category" cat ON cat.id=bcat."categoryId"
     WHERE bc.id=$1 GROUP BY bc.id,b.id`,
    [req.params["id"], creatorId]
  );
  if (!r.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const campaign = r.rows[0];
  const slabIds: string[] = campaign.followerSlabs ?? [];
  const [slabsR, crR, crCatsR] = await Promise.all([
    slabIds.length > 0
      ? pool.query(`SELECT id,label,"minFollowers","maxFollowers" FROM "FollowerSlab" WHERE id=ANY($1::text[]) ORDER BY "minFollowers"`, [slabIds])
      : Promise.resolve({ rows: [] }),
    pool.query(`SELECT gender,"followerCount","selectedSlabId" FROM "Creator" WHERE id=$1`, [creatorId]),
    pool.query(`SELECT "categoryId" FROM "CreatorCategory" WHERE "creatorId"=$1`, [creatorId]),
  ]);
  res.json({
    ...campaign,
    resolvedSlabs: slabsR.rows,
    creatorGender: crR.rows[0]?.gender ?? null,
    creatorFollowerCount: crR.rows[0]?.followerCount ?? null,
    creatorSelectedSlabId: crR.rows[0]?.selectedSlabId ?? null,
    creatorCategoryIds: crCatsR.rows.map((x: any) => x.categoryId),
  });
});

router.post("/creator/campaigns/:id/apply", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const camp = await pool.query(`SELECT * FROM "Campaign" WHERE id=$1 AND status='LIVE'`, [req.params["id"]]);
  if (!camp.rows[0]) { res.status(400).json({ error: "Campaign not available" }); return; }
  const existing = await pool.query(`SELECT id,status FROM "CampaignApplication" WHERE "campaignId"=$1 AND "creatorId"=$2`, [req.params["id"], creatorId]);
  if (existing.rows[0]) {
    if (existing.rows[0].status === "WITHDRAWN") { res.status(400).json({ error: "Cannot reapply after withdrawing" }); return; }
    res.status(409).json({ error: "Already applied" }); return;
  }
  await pool.query(
    `INSERT INTO "CampaignApplication" (id,"campaignId","creatorId",status,"appliedAt") VALUES (gen_random_uuid()::text,$1,$2,'PENDING',NOW())`,
    [req.params["id"], creatorId]
  );
  await notify(creatorId, "CREATOR", "Application Submitted", `Your application for "${camp.rows[0].name}" has been submitted.`);
  await createPopup({
    userId: creatorId, userType: "CREATOR", type: "APPLICATION_SUBMITTED",
    title: "Application Submitted",
    body: `You've successfully applied for "${camp.rows[0].name}". You'll be notified once the brand responds.`,
    ctaText: "View Campaign", ctaPath: `/home-creator/campaigns/${req.params["id"]}`,
    isCelebration: false,
  });
  const appCount = await pool.query(`SELECT COUNT(*) as c FROM "CampaignApplication" WHERE "campaignId"=$1 AND status='PENDING'`, [req.params["id"]]);
  if (parseInt(appCount.rows[0].c) === 1) {
    await notify(camp.rows[0].brandId, "BRAND", "First Application!", `You received your first application on "${camp.rows[0].name}"!`);
  }
  res.status(201).json({ ok: true });
});

router.post("/creator/campaigns/:id/withdraw", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const campaignId = req.params["id"];

  // Try SHORTLISTED first — only shortlisted withdrawals notify the brand
  const shortlisted = await pool.query(
    `UPDATE "CampaignApplication" SET status='WITHDRAWN',"withdrawnAt"=NOW()
     WHERE "campaignId"=$1 AND "creatorId"=$2 AND status='SHORTLISTED' RETURNING id`,
    [campaignId, creatorId]
  );

  if (shortlisted.rows[0]) {
    // Fetch campaign + creator details for the brand notification
    const meta = await pool.query(
      `SELECT c.name, c."brandId", cr."instagramHandle", cr."fullName"
       FROM "Campaign" c
       JOIN "Creator" cr ON cr.id=$2
       WHERE c.id=$1`,
      [campaignId, creatorId]
    );
    if (meta.rows[0]) {
      const { name: campName, brandId, instagramHandle, fullName } = meta.rows[0];
      const creatorLabel = instagramHandle ? `@${instagramHandle}` : (fullName ?? "A creator");
      await notify(brandId, "BRAND", "Shortlisted Creator Withdrew",
        `${creatorLabel} has withdrawn their application from "${campName}".`, "CREATOR_WITHDREW");
      await createPopup({
        userId: brandId, userType: "BRAND", type: "CREATOR_WITHDREW",
        title: "Shortlisted Creator Withdrew",
        body: `${creatorLabel} has withdrawn their application from your campaign "${campName}".`,
        ctaText: "View Campaign", ctaPath: `/home-brand/campaigns/${campaignId}`,
        isCelebration: false,
      });
    }
    res.json({ ok: true });
    return;
  }

  // Fall back: allow PENDING withdrawals too (no brand notification)
  const pending = await pool.query(
    `UPDATE "CampaignApplication" SET status='WITHDRAWN',"withdrawnAt"=NOW()
     WHERE "campaignId"=$1 AND "creatorId"=$2 AND status='PENDING' RETURNING id`,
    [campaignId, creatorId]
  );
  if (!pending.rows[0]) { res.status(404).json({ error: "Application not found" }); return; }
  res.json({ ok: true });
});

router.post("/creator/barter/:id/apply", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const barter = await pool.query(`SELECT * FROM "BarterCampaign" WHERE id=$1 AND status='LIVE'`, [req.params["id"]]);
  if (!barter.rows[0]) { res.status(400).json({ error: "Barter campaign not available" }); return; }
  const existing = await pool.query(`SELECT id,status FROM "BarterApplication" WHERE "barterId"=$1 AND "creatorId"=$2`, [req.params["id"], creatorId]);
  if (existing.rows[0]) {
    if (existing.rows[0].status === "WITHDRAWN") { res.status(400).json({ error: "Cannot reapply after withdrawing" }); return; }
    res.status(409).json({ error: "Already applied" }); return;
  }
  await pool.query(
    `INSERT INTO "BarterApplication" (id,"barterId","creatorId",status,"appliedAt") VALUES (gen_random_uuid()::text,$1,$2,'PENDING',NOW())`,
    [req.params["id"], creatorId]
  );
  await notify(creatorId, "CREATOR", "Barter Application Submitted", `Your application for "${barter.rows[0].name}" has been submitted.`);
  await createPopup({
    userId: creatorId, userType: "CREATOR", type: "APPLICATION_SUBMITTED",
    title: "Application Submitted",
    body: `You've successfully applied for "${barter.rows[0].name}". You'll be notified once the brand responds.`,
    ctaText: "View Campaign", ctaPath: `/home-creator/barter/${req.params["id"]}`,
    isCelebration: false,
  });
  res.status(201).json({ ok: true });
});

router.post("/creator/barter/:id/withdraw", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const barterId = req.params["id"];

  // Try SHORTLISTED first — only shortlisted withdrawals notify the brand
  const shortlisted = await pool.query(
    `UPDATE "BarterApplication" SET status='WITHDRAWN',"withdrawnAt"=NOW()
     WHERE "barterId"=$1 AND "creatorId"=$2 AND status='SHORTLISTED' RETURNING id`,
    [barterId, creatorId]
  );

  if (shortlisted.rows[0]) {
    const meta = await pool.query(
      `SELECT b.name, b."brandId", cr."instagramHandle", cr."fullName"
       FROM "BarterCampaign" b
       JOIN "Creator" cr ON cr.id=$2
       WHERE b.id=$1`,
      [barterId, creatorId]
    );
    if (meta.rows[0]) {
      const { name: campName, brandId, instagramHandle, fullName } = meta.rows[0];
      const creatorLabel = instagramHandle ? `@${instagramHandle}` : (fullName ?? "A creator");
      await notify(brandId, "BRAND", "Shortlisted Creator Withdrew",
        `${creatorLabel} has withdrawn their application from "${campName}".`, "CREATOR_WITHDREW");
      await createPopup({
        userId: brandId, userType: "BRAND", type: "CREATOR_WITHDREW",
        title: "Shortlisted Creator Withdrew",
        body: `${creatorLabel} has withdrawn their application from your barter campaign "${campName}".`,
        ctaText: "View Campaign", ctaPath: `/home-brand/barter/${barterId}`,
        isCelebration: false,
      });
    }
    res.json({ ok: true });
    return;
  }

  // Fall back: allow PENDING withdrawals too (no brand notification)
  const pending = await pool.query(
    `UPDATE "BarterApplication" SET status='WITHDRAWN',"withdrawnAt"=NOW()
     WHERE "barterId"=$1 AND "creatorId"=$2 AND status='PENDING' RETURNING id`,
    [barterId, creatorId]
  );
  if (!pending.rows[0]) { res.status(404).json({ error: "Application not found" }); return; }
  res.json({ ok: true });
});

router.get("/creator/applications", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const paid = await pool.query(
    `SELECT ca.id, ca.status, ca."appliedAt", ca."selectedAt", ca."withdrawnAt", ca."confirmedAt", ca."declinedAt", ca."expiredAt", ca."dealId", ca."confirmationDeadline",
            'PAID' as kind, c.id as "campaignId", c.name, c.type, c.status as "campaignStatus",
            b."brandName", b."logoUrl",
            d.status as "dealStatus"
     FROM "CampaignApplication" ca
     JOIN "Campaign" c ON c.id=ca."campaignId"
     JOIN "Brand" b ON b.id=c."brandId"
     LEFT JOIN "Deal" d ON d.id=ca."dealId"
     WHERE ca."creatorId"=$1 ORDER BY ca."appliedAt" DESC`,
    [creatorId]
  );
  const barter = await pool.query(
    `SELECT ba.id, ba.status, ba."appliedAt", ba."selectedAt", ba."withdrawnAt", ba."confirmedAt", ba."declinedAt", ba."expiredAt", ba."dealId", ba."confirmationDeadline",
            'BARTER' as kind, bc.id as "campaignId", bc.name, bc."contentType" as type, bc.status as "campaignStatus",
            bc."productName", bc."productValueInr", bc."productPhotos",
            b."brandName", b."logoUrl",
            d.status as "dealStatus"
     FROM "BarterApplication" ba
     JOIN "BarterCampaign" bc ON bc.id=ba."barterId"
     JOIN "Brand" b ON b.id=bc."brandId"
     LEFT JOIN "Deal" d ON d.id=ba."dealId"
     WHERE ba."creatorId"=$1 ORDER BY ba."appliedAt" DESC`,
    [creatorId]
  );
  res.json([...paid.rows, ...barter.rows].sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/admin/campaigns", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { status, search } = req.query;
  let where = "WHERE 1=1";
  const vals: unknown[] = [];
  if (status && status !== "ALL") { where += ` AND c.status=$${vals.length + 1}`; vals.push(status); }
  if (search) { where += ` AND (c.name ILIKE $${vals.length + 1} OR b."brandName" ILIKE $${vals.length + 1})`; vals.push(`%${search}%`); }
  const r = await pool.query(
    `SELECT c.id,c.name,c.type,c.status,c."slotCount",c."slotsFilled",c."pricePerCreator",c."totalEscrow",c."liveAt",c."expiresAt",c."createdAt",
            b."brandName",b."logoUrl",
            (SELECT COUNT(*)::int FROM "CampaignApplication" WHERE "campaignId"=c.id) as "totalApps"
     FROM "Campaign" c JOIN "Brand" b ON b.id=c."brandId" ${where} ORDER BY c."createdAt" DESC LIMIT 100`,
    vals
  );
  res.json(r.rows);
});

router.get("/admin/campaigns/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT c.*, b."brandName",b."logoUrl",
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',cc."categoryId",'name',cat.name)) FILTER (WHERE cc.id IS NOT NULL),'[]') as categories
     FROM "Campaign" c JOIN "Brand" b ON b.id=c."brandId"
     LEFT JOIN "CampaignCategory" cc ON cc."campaignId"=c.id
     LEFT JOIN "Category" cat ON cat.id=cc."categoryId"
     WHERE c.id=$1 GROUP BY c.id,b.id`,
    [req.params["id"]]
  );
  if (!r.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r.rows[0]);
});

router.post("/admin/campaigns/:id/extend", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { days } = req.body;
  if (!days || parseInt(days) < 1) { res.status(400).json({ error: "days required" }); return; }
  await pool.query(`UPDATE "Campaign" SET "expiresAt"="expiresAt"+($1::int * INTERVAL '1 day') WHERE id=$2`, [parseInt(days), req.params["id"]]);
  res.json({ ok: true });
});

router.post("/admin/campaigns/:id/expire", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await expireCampaign(req.params["id"] as string);
  res.json({ ok: true });
});

router.post("/admin/campaigns/:id/cancel", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const camp = await pool.query(`SELECT * FROM "Campaign" WHERE id=$1`, [req.params["id"]]);
  if (!camp.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  await pool.query(`UPDATE "Campaign" SET status='CANCELLED' WHERE id=$1`, [req.params["id"]]);
  await createNotification({
    userId: camp.rows[0].brandId, userType: "BRAND", type: "CAMPAIGN_CANCELLED",
    title: "Campaign Cancelled",
    body: `Your campaign "${camp.rows[0].name}" has been cancelled.`,
    emailTemplateId: 15, emailSubject: "Campaign cancelled",
    emailParams: { campaign_name: camp.rows[0].name },
    relatedEntityType: "CAMPAIGN", relatedEntityId: req.params["id"] as string,
    expiresInDays: 90,
  }).catch(() => {});
  res.json({ ok: true });
});

// Admin Approve — deduct credits, set LIVE
router.post("/admin/campaigns/:id/approve", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const camp = await pool.query(`SELECT * FROM "Campaign" WHERE id=$1 AND status='PENDING_APPROVAL'`, [id]);
  if (!camp.rows[0]) { res.status(404).json({ error: "Campaign not found or not pending approval" }); return; }
  const c = camp.rows[0];
  const creditsCost = parseInt(await getCfg("campaign_credits_cost", "1"));
  // Use the brand-supplied campaign expiry (stored in deliveryWindowDays); fall back to platform default
  const durationDays = parseInt(c.deliveryWindowDays ?? await getCfg("max_campaign_days", "30"));
  const brandBalance = await pool.query(`SELECT "creditBalance" FROM "Brand" WHERE id=$1`, [c.brandId]);
  const balance = parseInt(brandBalance.rows[0]?.creditBalance ?? "0");

  if (balance < creditsCost) {
    await pool.query(`UPDATE "Campaign" SET status='CREDIT_HOLD',"adminReviewedBy"=$1 WHERE id=$2`, [adminId, id]);
    await createNotification({
      userId: c.brandId, userType: "BRAND", type: "CAMPAIGN_TOP_UP_NEEDED",
      title: "Campaign Approved — Top Up Needed",
      body: `Your campaign "${c.name}" was approved! You need ${creditsCost - balance} more credit(s) to go live. Top up to activate.`,
      emailTemplateId: 12, emailSubject: "Campaign approved — top-up needed",
      emailParams: { campaign_name: c.name, credits: creditsCost - balance },
      relatedEntityType: "CAMPAIGN", relatedEntityId: id,
      expiresInDays: 90,
    }).catch(() => {});
    await createPopup({
      userId: c.brandId, userType: "BRAND", type: "CAMPAIGN_APPROVED",
      title: "Campaign Approved — Top Up Needed 💳",
      body: `"${c.name}" was approved! Add ${creditsCost - balance} more credit(s) to your balance to go live.`,
      ctaText: "Top Up Credits", ctaPath: "/home-brand/credits",
      isCelebration: false, relatedEntityId: id,
    });
    res.json({ ok: true, status: "CREDIT_HOLD" }); return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const newBal = balance - creditsCost;
    await client.query(`UPDATE "Brand" SET "creditBalance"=$1 WHERE id=$2`, [newBal, c.brandId]);
    await client.query(`INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","createdAt") VALUES (gen_random_uuid()::text,$1,'CAMPAIGN_POSTING',$2,$3,NOW())`, [c.brandId, -creditsCost, newBal]);
    await client.query(
      `UPDATE "Campaign" SET status='LIVE',"liveAt"=NOW(),"expiresAt"=NOW()+($1::int * INTERVAL '1 day'),"creditsCharged"=$2,"adminReviewedBy"=$3 WHERE id=$4`,
      [durationDays, creditsCost, adminId, id]
    );
    await client.query("COMMIT");
  } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Internal error" }); return; }
  finally { client.release(); }
  await createNotification({
    userId: c.brandId, userType: "BRAND", type: "CAMPAIGN_LIVE",
    title: "Campaign is Live!",
    body: `Your campaign "${c.name}" has been approved and is now live! Creators can apply.`,
    emailTemplateId: 11, emailSubject: "Your campaign is live!",
    emailParams: { campaign_name: c.name },
    relatedEntityType: "CAMPAIGN", relatedEntityId: id,
    expiresInDays: 90,
  }).catch(() => {});
  await createPopup({
    userId: c.brandId, userType: "BRAND", type: "CAMPAIGN_APPROVED",
    title: "Your Campaign is Live! 🎉",
    body: `"${c.name}" has been approved and is now live. Creators can discover and apply to it right now.`,
    ctaText: "View Campaign", ctaPath: "/home-brand/campaigns",
    isCelebration: true, relatedEntityId: id,
  });
  const brandR = await pool.query(`SELECT "brandName" FROM "Brand" WHERE id=$1`, [c.brandId]);
  await notifyAllCreators("CAMPAIGN", id, brandR.rows[0]?.brandName ?? "A brand", c.name);
  res.json({ ok: true, status: "LIVE" });
});

// Admin Reject — mandatory reason
router.post("/admin/campaigns/:id/reject", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { reason } = req.body;
  if (!reason?.trim()) { res.status(400).json({ error: "Rejection reason is required" }); return; }
  const camp = await pool.query(`SELECT * FROM "Campaign" WHERE id=$1 AND status='PENDING_APPROVAL'`, [id]);
  if (!camp.rows[0]) { res.status(404).json({ error: "Campaign not found or not pending approval" }); return; }
  await pool.query(`UPDATE "Campaign" SET status='REJECTED',"adminRejectionReason"=$1,"adminReviewedBy"=$2 WHERE id=$3`, [reason.trim(), adminId, id]);
  await createNotification({
    userId: camp.rows[0].brandId, userType: "BRAND", type: "CAMPAIGN_REJECTED",
    title: "Campaign Not Approved",
    body: `Your campaign "${camp.rows[0].name}" was not approved. Reason: ${reason.trim()}`,
    emailTemplateId: 13, emailSubject: "Campaign not approved",
    emailParams: { campaign_name: camp.rows[0].name, reason: reason.trim() },
    relatedEntityType: "CAMPAIGN", relatedEntityId: id,
    expiresInDays: 90,
  }).catch(() => {});
  await createPopup({
    userId: camp.rows[0].brandId, userType: "BRAND", type: "CAMPAIGN_REJECTED",
    title: "Campaign Not Approved ❌",
    body: `"${camp.rows[0].name}" was not approved. Reason: ${reason.trim()}`,
    ctaText: "View Campaigns", ctaPath: "/home-brand/campaigns",
    isCelebration: false, relatedEntityId: id,
  });
  res.json({ ok: true });
});

// Admin Hold — needs more info
router.post("/admin/campaigns/:id/hold", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { message } = req.body;
  const camp = await pool.query(`SELECT * FROM "Campaign" WHERE id=$1 AND status='PENDING_APPROVAL'`, [id]);
  if (!camp.rows[0]) { res.status(404).json({ error: "Campaign not found or not pending approval" }); return; }
  await pool.query(`UPDATE "Campaign" SET "adminReviewedBy"=$1,"heldAt"=NOW(),"adminNotes"=$2 WHERE id=$3`, [adminId, message ?? null, id]);
  await createNotification({
    userId: camp.rows[0].brandId, userType: "BRAND", type: "CAMPAIGN_ON_HOLD",
    title: "Campaign On Hold",
    body: `Your campaign "${camp.rows[0].name}" has been put on hold. Our team will contact you shortly.`,
    emailTemplateId: 14, emailSubject: "Campaign on hold",
    emailParams: { campaign_name: camp.rows[0].name, admin_message: message ?? "" },
    relatedEntityType: "CAMPAIGN", relatedEntityId: id,
    expiresInDays: 90,
  }).catch(() => {});
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — BARTER
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/admin/barter", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { status = "PENDING_APPROVAL" } = req.query;
  const r = await pool.query(
    `SELECT bc.*,
       b."brandName",b."logoUrl",
       (EXTRACT(EPOCH FROM (NOW()-bc."createdAt"))/3600)::int as "hoursWaiting",
       COALESCE(json_agg(DISTINCT jsonb_build_object('categoryId',bcat."categoryId",'name',cat.name)) FILTER (WHERE bcat.id IS NOT NULL),'[]') as categories
     FROM "BarterCampaign" bc
     JOIN "Brand" b ON b.id=bc."brandId"
     LEFT JOIN "BarterCategory" bcat ON bcat."barterId"=bc.id
     LEFT JOIN "Category" cat ON cat.id=bcat."categoryId"
     WHERE bc.status=$1 GROUP BY bc.id,b.id ORDER BY bc."createdAt" DESC`,
    [status]
  );
  res.json(r.rows);
});

router.post("/admin/barter/:id/approve", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const barter = await pool.query(`SELECT * FROM "BarterCampaign" WHERE id=$1 AND status='PENDING_APPROVAL'`, [req.params["id"]]);
  if (!barter.rows[0]) { res.status(404).json({ error: "Not found or not pending approval" }); return; }
  const b = barter.rows[0];
  const creditsCost = parseInt(await getCfg("barter_credits_cost", "5"));
  const durationDays = b.durationDays ?? parseInt(await getCfg("max_barter_days", "30"));
  const brandBalance = await pool.query(`SELECT "creditBalance" FROM "Brand" WHERE id=$1`, [b.brandId]);
  const balance = brandBalance.rows[0]?.creditBalance ?? 0;
  if (balance < creditsCost) {
    await pool.query(`UPDATE "BarterCampaign" SET status='CREDIT_HOLD',"adminReviewedBy"=$1 WHERE id=$2`, [adminId, b.id]);
    await createNotification({
      userId: b.brandId, userType: "BRAND", type: "BARTER_TOP_UP_NEEDED",
      title: "Campaign Approved — Top Up Needed",
      body: `Your barter campaign "${b.name}" was approved! You need ${creditsCost - balance} more credit(s) to go live. Top up to activate.`,
      emailTemplateId: 20, emailSubject: "Barter approved — top-up needed",
      emailParams: { campaign_name: b.name, credits: creditsCost - balance },
      relatedEntityType: "BARTER_CAMPAIGN", relatedEntityId: b.id,
      expiresInDays: 90,
    }).catch(() => {});
    await createPopup({
      userId: b.brandId, userType: "BRAND", type: "CAMPAIGN_APPROVED",
      title: "Barter Campaign Approved — Top Up Needed 💳",
      body: `"${b.name}" was approved! Add ${creditsCost - balance} more credit(s) to your balance to go live.`,
      ctaText: "Top Up Credits", ctaPath: "/home-brand/credits",
      isCelebration: false, relatedEntityId: b.id,
    });
    res.json({ ok: true, status: "CREDIT_HOLD" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const newBal = balance - creditsCost;
    await client.query(`UPDATE "Brand" SET "creditBalance"=$1 WHERE id=$2`, [newBal, b.brandId]);
    await client.query(
      `INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","createdAt") VALUES (gen_random_uuid()::text,$1,'BARTER_POSTING',$2,$3,NOW())`,
      [b.brandId, -creditsCost, newBal]
    );
    await client.query(
      `UPDATE "BarterCampaign" SET status='LIVE',"liveAt"=NOW(),"expiresAt"=NOW()+INTERVAL '${durationDays} days',"creditsCharged"=$1,"adminReviewedBy"=$2 WHERE id=$3`,
      [creditsCost, adminId, b.id]
    );
    await client.query("COMMIT");
  } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Internal error" }); return; }
  finally { client.release(); }
  await createNotification({
    userId: b.brandId, userType: "BRAND", type: "BARTER_LIVE",
    title: "Barter Campaign Live!",
    body: `Your barter campaign "${b.name}" was approved! ${creditsCost} credits deducted. Campaign is now live.`,
    emailTemplateId: 19, emailSubject: "Your barter campaign is live!",
    emailParams: { campaign_name: b.name, credits: creditsCost },
    relatedEntityType: "BARTER_CAMPAIGN", relatedEntityId: b.id,
    expiresInDays: 90,
  }).catch(() => {});
  await createPopup({
    userId: b.brandId, userType: "BRAND", type: "CAMPAIGN_APPROVED",
    title: "Your Barter Campaign is Live! 🎉",
    body: `"${b.name}" has been approved and is now live. Creators can discover and apply to it right now.`,
    ctaText: "View Campaign", ctaPath: "/home-brand/campaigns",
    isCelebration: true, relatedEntityId: b.id,
  });
  const barterBrandR = await pool.query(`SELECT "brandName" FROM "Brand" WHERE id=$1`, [b.brandId]);
  await notifyAllCreators("BARTER_CAMPAIGN", b.id, barterBrandR.rows[0]?.brandName ?? "A brand", b.name);
  res.json({ ok: true, status: "LIVE" });
});

router.post("/admin/barter/:id/reject", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { reason } = req.body;
  if (!reason?.trim()) { res.status(400).json({ error: "Rejection reason is required" }); return; }
  const barter = await pool.query(`SELECT * FROM "BarterCampaign" WHERE id=$1 AND status='PENDING_APPROVAL'`, [req.params["id"]]);
  if (!barter.rows[0]) { res.status(404).json({ error: "Not found or not pending approval" }); return; }
  await pool.query(
    `UPDATE "BarterCampaign" SET status='REJECTED',"adminRejectionReason"=$1,"rejectionReason"=$1,"adminReviewedBy"=$2 WHERE id=$3`,
    [reason.trim(), adminId, req.params["id"]]
  );
  await createNotification({
    userId: barter.rows[0].brandId, userType: "BRAND", type: "BARTER_REJECTED",
    title: "Barter Campaign Not Approved",
    body: `Your barter campaign "${barter.rows[0].name}" was not approved. Reason: ${reason.trim()}`,
    emailTemplateId: 21, emailSubject: "Barter campaign not approved",
    emailParams: { campaign_name: barter.rows[0].name, reason: reason.trim() },
    relatedEntityType: "BARTER_CAMPAIGN", relatedEntityId: req.params["id"] as string,
    expiresInDays: 90,
  }).catch(() => {});
  await createPopup({
    userId: barter.rows[0].brandId, userType: "BRAND", type: "CAMPAIGN_REJECTED",
    title: "Barter Campaign Not Approved ❌",
    body: `"${barter.rows[0].name}" was not approved. Reason: ${reason.trim()}`,
    ctaText: "View Campaigns", ctaPath: "/home-brand/campaigns",
    isCelebration: false, relatedEntityId: req.params["id"] as string,
  });
  res.json({ ok: true });
});

router.post("/admin/barter/:id/hold", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { message } = req.body;
  const barter = await pool.query(`SELECT * FROM "BarterCampaign" WHERE id=$1`, [req.params["id"]]);
  if (!barter.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  await pool.query(`UPDATE "BarterCampaign" SET "adminReviewedBy"=$1,"heldAt"=NOW(),"adminNotes"=$2 WHERE id=$3`, [adminId, message, req.params["id"]]);
  await createNotification({
    userId: barter.rows[0].brandId, userType: "BRAND", type: "BARTER_ON_HOLD",
    title: "Barter Campaign On Hold",
    body: `Regarding your barter campaign "${barter.rows[0].name}": ${message ?? "Please provide more information."}`,
    emailTemplateId: 22, emailSubject: "Barter campaign on hold",
    emailParams: { campaign_name: barter.rows[0].name, admin_message: message ?? "" },
    relatedEntityType: "BARTER_CAMPAIGN", relatedEntityId: req.params["id"] as string,
    expiresInDays: 90,
  }).catch(() => {});
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEAL-CANCELLATION SIDE EFFECT (free up slot, reopen if hidden+not expired)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleCampaignDealCancelled(dealId: string): Promise<void> {
  try {
    const d = await pool.query(`SELECT id,"campaignId","barterId",source FROM "Deal" WHERE id=$1`, [dealId]);
    if (!d.rows[0]) return;
    const deal = d.rows[0];
    if (deal.source === "CAMPAIGN" && deal.campaignId) {
      const c = await pool.query(`SELECT id,name,"brandId","slotCount","slotsFilled",status,"expiresAt" FROM "Campaign" WHERE id=$1`, [deal.campaignId]);
      if (!c.rows[0]) return;
      const camp = c.rows[0];
      const newFilled = Math.max(0, (camp.slotsFilled as number) - 1);
      const stillActive = camp.expiresAt && new Date(camp.expiresAt) > new Date();
      const newStatus = camp.status === "HIDDEN" && stillActive ? "LIVE" : camp.status;
      await pool.query(`UPDATE "Campaign" SET "slotsFilled"=$1,status=$2 WHERE id=$3`, [newFilled, newStatus, camp.id]);
      await pool.query(`UPDATE "CampaignSlot" SET "refundedAt"=NOW(),"escrowStatus"='REFUNDED' WHERE "dealId"=$1 AND "refundedAt" IS NULL`, [dealId]);
      if (camp.status === "HIDDEN" && newStatus === "LIVE") {
        await notify(camp.brandId as string, "BRAND", "Slot reopened",
          `A deal for "${camp.name}" was cancelled — the campaign is back to LIVE with an open slot.`);
      }
    } else if (deal.source === "BARTER" && deal.barterId) {
      const c = await pool.query(`SELECT id,name,"brandId","slotCount","slotsFilled",status,"expiresAt" FROM "BarterCampaign" WHERE id=$1`, [deal.barterId]);
      if (!c.rows[0]) return;
      const camp = c.rows[0];
      const newFilled = Math.max(0, (camp.slotsFilled as number) - 1);
      const stillActive = camp.expiresAt && new Date(camp.expiresAt) > new Date();
      const newStatus = camp.status === "HIDDEN" && stillActive ? "LIVE" : camp.status;
      await pool.query(`UPDATE "BarterCampaign" SET "slotsFilled"=$1,status=$2 WHERE id=$3`, [newFilled, newStatus, camp.id]);
      if (camp.status === "HIDDEN" && newStatus === "LIVE") {
        await notify(camp.brandId as string, "BRAND", "Slot reopened",
          `A barter deal for "${camp.name}" was cancelled — the campaign is back to LIVE with an open slot.`);
      }
    }
  } catch (e) {
    console.error("handleCampaignDealCancelled error", e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPIRY HELPER (used by cron job and admin manual expire)
// ═══════════════════════════════════════════════════════════════════════════════

export async function expireCampaign(campaignId: string): Promise<void> {
  const camp = await pool.query(`SELECT * FROM "Campaign" WHERE id=$1 AND status IN ('LIVE','HIDDEN','CREDIT_HOLD')`, [campaignId]);
  if (!camp.rows[0]) return;
  const c = camp.rows[0];
  await pool.query(`UPDATE "Campaign" SET status='EXPIRED',"expiresAt"=NOW() WHERE id=$1`, [campaignId]);
  // Expire any pending SELECTED applications where confirmation window passed
  await pool.query(`UPDATE "CampaignApplication" SET status='EXPIRED',"expiredAt"=NOW() WHERE "campaignId"=$1 AND status='SELECTED' AND "confirmationDeadline" < NOW()`, [campaignId]);
  const pendingApps = await pool.query(`SELECT "creatorId" FROM "CampaignApplication" WHERE "campaignId"=$1 AND status IN ('PENDING','SHORTLISTED')`, [campaignId]);
  for (const pa of pendingApps.rows) await notify(pa.creatorId as string, "CREATOR", "Campaign Closed", `The campaign "${c.name}" has closed.`);
  await createNotification({
    userId: c.brandId as string, userType: "BRAND", type: "CAMPAIGN_EXPIRED",
    title: "Campaign Expired",
    body: c.slotsFilled > 0
      ? `${c.slotsFilled} of ${c.slotCount} slots filled in "${c.name}".`
      : `Your campaign "${c.name}" received no accepted applications.`,
    emailTemplateId: 16, emailSubject: "Campaign expired",
    emailParams: { campaign_name: c.name },
    relatedEntityType: "CAMPAIGN", relatedEntityId: campaignId,
    expiresInDays: 90,
  }).catch(() => {});
}

export async function expireBarterCampaign(barterId: string): Promise<void> {
  const barter = await pool.query(`SELECT * FROM "BarterCampaign" WHERE id=$1 AND status IN ('LIVE','HIDDEN','CREDIT_HOLD')`, [barterId]);
  if (!barter.rows[0]) return;
  const b = barter.rows[0];
  await pool.query(`UPDATE "BarterCampaign" SET status='EXPIRED' WHERE id=$1`, [barterId]);
  const pendingApps = await pool.query(`SELECT "creatorId" FROM "BarterApplication" WHERE "barterId"=$1 AND status='PENDING'`, [barterId]);
  for (const pa of pendingApps.rows) await notify(pa.creatorId, "CREATOR", "Campaign Closed", `The barter campaign "${b.name}" has closed.`);
  await createNotification({
    userId: b.brandId, userType: "BRAND", type: "BARTER_EXPIRED",
    title: "Barter Campaign Expired",
    body: `Your barter campaign "${b.name}" has closed.`,
    emailTemplateId: 24, emailSubject: "Barter campaign expired",
    emailParams: { campaign_name: b.name },
    relatedEntityType: "BARTER_CAMPAIGN", relatedEntityId: barterId,
    expiresInDays: 90,
  }).catch(() => {});
}

export default router;
