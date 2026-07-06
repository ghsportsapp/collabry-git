import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";
import { requireBrand } from "../middleware/requireBrand";
import { requireCreator } from "../middleware/requireCreator";
import { createNotification } from "../lib/notifications";
import { createPopup } from "../lib/popups";
import { createSystemMessage } from "../lib/dealChat";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router: IRouter = Router();

// ── Helpers ──
async function readCommissionRate(): Promise<number> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='commission_rate'`);
  if (r.rows.length === 0) return 5;
  const n = parseFloat(r.rows[0].value);
  return isNaN(n) ? 5 : n;
}

async function readGstRate(): Promise<number> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='gst_rate'`);
  if (r.rows.length === 0) return 18;
  const n = parseFloat(r.rows[0].value);
  return isNaN(n) ? 18 : n;
}

async function readRoundDeadlineHours(): Promise<number> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='max_deal_finalize_days'`);
  if (r.rows.length === 0) return 48;
  const days = parseFloat(r.rows[0].value);
  return isNaN(days) || days <= 0 ? 48 : days * 24;
}

// ── Snapshot all shipping/issue/non-delivery config at deal creation ──
async function readShippingConfigSnapshot(client: PoolClient): Promise<{
  maxDeliveryDays: number;
  warningDay: number;
  maxExtensions: number;
  brandResponseHours: number;
  awbCorrectionLimit: number;
  imageRetentionDays: number;
  splits: {
    nonDeliveryBrand: number; nonDeliveryCreator: number; nonDeliveryCollabry: number;
    fakeAwbBrand: number; fakeAwbCreator: number; fakeAwbCollabry: number;
    disputeValidBrand: number;
  };
}> {
  const r = await client.query(
    `SELECT key,value FROM "PlatformConfig" WHERE key IN (
      'max_product_delivery_days','delivery_warning_day','max_delivery_extensions',
      'product_issue_brand_response_hours','awb_correction_limit','product_issue_image_retention_days',
      'non_delivery_brand_refund_percent','non_delivery_creator_percent','non_delivery_collabry_percent',
      'fake_awb_brand_refund_percent','fake_awb_creator_percent','fake_awb_collabry_percent',
      'dispute_valid_brand_refund_percent'
    )`
  );
  const cfg: Record<string, string> = {};
  for (const row of r.rows) cfg[row.key] = row.value;
  const intVal = (k: string, d: number) => {
    const n = parseInt(cfg[k] ?? "", 10);
    return isNaN(n) || n < 0 ? d : n;
  };
  return {
    maxDeliveryDays: intVal('max_product_delivery_days', 10),
    warningDay: intVal('delivery_warning_day', 8),
    maxExtensions: intVal('max_delivery_extensions', 2),
    brandResponseHours: intVal('product_issue_brand_response_hours', 48),
    awbCorrectionLimit: intVal('awb_correction_limit', 2),
    imageRetentionDays: intVal('product_issue_image_retention_days', 7),
    splits: {
      nonDeliveryBrand: intVal('non_delivery_brand_refund_percent', 50),
      nonDeliveryCreator: intVal('non_delivery_creator_percent', 20),
      nonDeliveryCollabry: intVal('non_delivery_collabry_percent', 30),
      fakeAwbBrand: intVal('fake_awb_brand_refund_percent', 70),
      fakeAwbCreator: intVal('fake_awb_creator_percent', 20),
      fakeAwbCollabry: intVal('fake_awb_collabry_percent', 10),
      disputeValidBrand: intVal('dispute_valid_brand_refund_percent', 50),
    },
  };
}

function calcTotal(rc: number, sc: number, pc: number, pr: number, ps: number, pp: number): number {
  return rc * pr + sc * ps + pc * pp;
}

interface RequestRow {
  id: string;
  brandId: string;
  creatorId: string;
  source: string;
  status: string;
  reelCount: number;
  storyCount: number;
  postCount: number;
  offeredPricePerReel: string | null;
  offeredPricePerStory: string | null;
  offeredPricePerPost: string | null;
  timelineDays: number;
  productRequired: boolean;
  deliveryWindowDays: number | null;
  productDescription: string | null;
  brief: string;
  reelSlabMin: string | null; reelSlabMax: string | null;
  storySlabMin: string | null; storySlabMax: string | null;
  postSlabMin: string | null; postSlabMax: string | null;
  roundNumber: number;
  totalDealValue: string | null;
  expiresAt: Date;
  createdAt: Date;
  proposedBy: string;
  parentRequestId: string | null;
  postedBy: string | null;
  aboutProduct: string | null;
  reelScript: string | null;
  storyScript: string | null;
  postContent: string | null;
  productImageUrl: string | null;
}

async function fetchRequestChain(rootId: string): Promise<RequestRow[]> {
  // Walk up to root, then return all rows in chain ordered by roundNumber
  const r = await pool.query<RequestRow>(
    `WITH RECURSIVE chain AS (
       SELECT * FROM "DealRequest" WHERE id=$1
       UNION ALL
       SELECT dr.* FROM "DealRequest" dr JOIN chain c ON c."parentRequestId"=dr.id
     ),
     root AS (SELECT * FROM chain WHERE "parentRequestId" IS NULL LIMIT 1),
     full_chain AS (
       SELECT * FROM root
       UNION ALL
       SELECT dr.* FROM "DealRequest" dr, root WHERE dr."parentRequestId" IN (
         WITH RECURSIVE down AS (
           SELECT id FROM root
           UNION ALL
           SELECT dr2.id FROM "DealRequest" dr2 JOIN down ON dr2."parentRequestId"=down.id
         )
         SELECT id FROM down
       )
     )
     SELECT DISTINCT * FROM full_chain ORDER BY "roundNumber" ASC, "createdAt" ASC`,
    [rootId]
  );
  return r.rows;
}

function num(v: any): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(v);
}

function isIdentical(a: any, b: any): boolean {
  return num(a.reelCount) === num(b.reelCount) &&
    num(a.storyCount) === num(b.storyCount) &&
    num(a.postCount) === num(b.postCount) &&
    num(a.offeredPricePerReel) === num(b.offeredPricePerReel) &&
    num(a.offeredPricePerStory) === num(b.offeredPricePerStory) &&
    num(a.offeredPricePerPost) === num(b.offeredPricePerPost) &&
    num(a.timelineDays) === num(b.timelineDays);
}

// ── Latest-node check: ensure no child exists for this request ──
async function assertIsLatestInChain(client: PoolClient, id: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM "DealRequest" WHERE "parentRequestId"=$1 LIMIT 1`,
    [id]
  );
  return r.rows.length === 0;
}

// ── Auto-expire helper: mark NEGOTIATING/PENDING requests past expiresAt as EXPIRED ──
async function expireOverdueRequests(): Promise<void> {
  // Mark expired requests, but only the latest per chain
  await pool.query(
    `UPDATE "DealRequest"
     SET status='EXPIRED'
     WHERE status IN ('PENDING','NEGOTIATING')
       AND "expiresAt" < NOW()`
  );
}

// =====================================================
// CREATOR ROUTES
// =====================================================

// GET /api/creator/requests — list pending + active negotiation requests for this creator
router.get("/creator/requests", requireCreator, async (req: Request, res: Response): Promise<void> => {
  await expireOverdueRequests();
  const creatorId = (req as any).creatorId as string;
  // Show requests where this creator must respond: latest in chain, status PENDING|NEGOTIATING, proposedBy=BRAND
  const r = await pool.query(
    `SELECT dr.*, b."brandName" as "brandName", b."logoUrl" as "brandLogo"
     FROM "DealRequest" dr
     JOIN "Brand" b ON b.id=dr."brandId"
     WHERE dr."creatorId"=$1
       AND dr.status IN ('PENDING','NEGOTIATING')
       AND dr."proposedBy"='BRAND'
       AND NOT EXISTS (SELECT 1 FROM "DealRequest" child WHERE child."parentRequestId"=dr.id)
     ORDER BY dr."createdAt" DESC`,
    [creatorId]
  );
  res.json({ requests: r.rows.map(serializeRequest) });
});

// GET /api/creator/requests/:id — full negotiation chain
router.get("/creator/requests/:id", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const id = req.params["id"] as string;
  const own = await pool.query(`SELECT id FROM "DealRequest" WHERE id=$1 AND "creatorId"=$2`, [id, creatorId]);
  if (own.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  const chain = await fetchRequestChain(id);
  const brandRow = await pool.query(`SELECT id, "brandName" as "brandName", "logoUrl" as "brandLogo" FROM "Brand" WHERE id=$1`, [chain[0]?.brandId ?? ""]);
  res.json({ chain: chain.map(serializeRequest), brand: brandRow.rows[0] ?? null });
});

// POST /api/creator/requests/:id/accept
router.post("/creator/requests/:id/accept", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].creatorId !== creatorId) {
      await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return;
    }
    if (!(await assertIsLatestInChain(client, id))) {
      await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return;
    }
    const req0 = r.rows[0];
    if (!["PENDING", "NEGOTIATING"].includes(req0.status)) {
      await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot accept request in status ${req0.status}` }); return;
    }
    if (req0.proposedBy !== "BRAND") {
      await client.query("ROLLBACK"); res.status(400).json({ error: "Only brand proposals can be accepted by creator" }); return;
    }
    if (req0.expiresAt < new Date()) {
      await client.query("UPDATE \"DealRequest\" SET status='EXPIRED' WHERE id=$1", [id]);
      await client.query("COMMIT"); res.status(400).json({ error: "Request expired" }); return;
    }
    const dealId = await createDealFromRequest(client, req0);
    await client.query(`UPDATE "DealRequest" SET status='ACCEPTED', "respondedAt"=NOW() WHERE id=$1`, [id]);
    await client.query("COMMIT");
    await Promise.all([
      createSystemMessage(dealId, "🤝 Deal agreed! Both parties accepted the terms. Awaiting brand payment to confirm escrow."),
      createNotification({
        userId: req0.brandId, userType: "BRAND", type: "REQUEST_ACCEPTED",
        title: "Request accepted!",
        body: `Your request was accepted. Complete payment to start the deal.`,
        relatedEntityType: "Deal", relatedEntityId: dealId,
      }),
    ]);
    await createPopup({
      userId: req0.brandId, userType: "BRAND", type: "OFFER_ACCEPTED",
      title: "Offer Accepted 🎉",
      body: "The creator accepted your collaboration request. Complete payment to start the deal.",
      ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=pending",
      isCelebration: true, relatedEntityId: dealId,
    });
    res.json({ ok: true, dealId });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Accept failed" });
  } finally { client.release(); }
});

// POST /api/creator/requests/:id/reject — body: { reasonId?, customNote? }
// Round 1: reasonId required (admin-defined reasons). Round > 1: auto-reason (no picker needed).
router.post("/creator/requests/:id/reject", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const id = req.params["id"] as string;
  const { reasonId, customNote } = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].creatorId !== creatorId) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertIsLatestInChain(client, id))) { await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return; }
    const req0 = r.rows[0];
    if (!["PENDING", "NEGOTIATING"].includes(req0.status)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot reject request in status ${req0.status}` }); return; }

    let reasonText: string;
    if (req0.roundNumber === 1) {
      // First round — admin-defined reason required
      if (!reasonId) { await client.query("ROLLBACK"); res.status(400).json({ error: "reasonId required for first-round rejection" }); return; }
      const reason = await client.query(`SELECT reason FROM "RejectionReason" WHERE id=$1`, [reasonId]);
      if (reason.rows.length === 0) { await client.query("ROLLBACK"); res.status(400).json({ error: "Invalid rejection reason" }); return; }
      reasonText = customNote ? `${reason.rows[0].reason} — ${String(customNote).slice(0, 500)}` : reason.rows[0].reason;
    } else {
      // After negotiation — auto reason
      reasonText = "Does not accept the negotiation terms";
    }

    await client.query(`UPDATE "DealRequest" SET status='REJECTED', "respondedAt"=NOW(), "rejectionReason"=$2 WHERE id=$1`, [id, reasonText]);
    await client.query("COMMIT");
    await createNotification({
      userId: req0.brandId, userType: "BRAND", type: "REQUEST_REJECTED",
      title: "Request declined",
      body: `Your request was declined. Reason: ${reasonText}`,
      relatedEntityType: "DealRequest", relatedEntityId: id,
    });
    await createPopup({
      userId: req0.brandId, userType: "BRAND", type: "OFFER_DECLINED",
      title: "Offer Declined",
      body: reasonText ? `The creator declined your collaboration request. Reason: ${reasonText}` : "The creator declined your collaboration request.",
      ctaText: "View Details", ctaPath: "/home-brand/deals?tab=cancelled",
      isCelebration: false, relatedEntityId: id,
    });
    res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Reject failed" });
  } finally { client.release(); }
});

// POST /api/creator/requests/:id/counter — Round 2 (creator counters brand's Round 1) OR Round 4 final accept/reject only
// Body: { reelCount, storyCount, postCount, pricePerReel, pricePerStory, pricePerPost, timelineDays, brief? }
router.post("/creator/requests/:id/counter", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].creatorId !== creatorId) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertIsLatestInChain(client, id))) { await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return; }
    const parent = r.rows[0];
    if (!["PENDING", "NEGOTIATING"].includes(parent.status)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot counter request in status ${parent.status}` }); return; }
    if (parent.proposedBy !== "BRAND") { await client.query("ROLLBACK"); res.status(400).json({ error: "Cannot counter your own proposal" }); return; }
    if (parent.expiresAt < new Date()) {
      await client.query("UPDATE \"DealRequest\" SET status='EXPIRED' WHERE id=$1", [id]);
      await client.query("COMMIT"); res.status(400).json({ error: "Request expired" }); return;
    }
    if (parent.roundNumber >= 3) { await client.query("ROLLBACK"); res.status(400).json({ error: "You can only counter once — only accept or reject the brand's response" }); return; }

    const { reelCount, storyCount, postCount, pricePerReel, pricePerStory, pricePerPost, timelineDays, brief } = req.body ?? {};
    const rc = Math.max(0, parseInt(reelCount) || 0);
    const sc = Math.max(0, parseInt(storyCount) || 0);
    const pc = Math.max(0, parseInt(postCount) || 0);
    const pr = parseFloat(pricePerReel) || 0;
    const ps = parseFloat(pricePerStory) || 0;
    const pp = parseFloat(pricePerPost) || 0;
    const td = parseInt(timelineDays) || 0;
    if (rc + sc + pc === 0) { await client.query("ROLLBACK"); res.status(400).json({ error: "At least one deliverable required" }); return; }
    if (td < 7 || td > 15) { await client.query("ROLLBACK"); res.status(400).json({ error: "Timeline must be between 7 and 15 days" }); return; }

    // Slab snapshot frozen — prices must be in slab range
    const inRange = (val: number, min: any, max: any): boolean => {
      const mn = num(min), mx = num(max);
      return val >= mn && val <= mx;
    };
    if (rc > 0 && !inRange(pr, parent.reelSlabMin, parent.reelSlabMax)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Reel price must be ₹${num(parent.reelSlabMin)}–₹${num(parent.reelSlabMax)}` }); return; }
    if (sc > 0 && !inRange(ps, parent.storySlabMin, parent.storySlabMax)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Story price must be ₹${num(parent.storySlabMin)}–₹${num(parent.storySlabMax)}` }); return; }
    if (pc > 0 && !inRange(pp, parent.postSlabMin, parent.postSlabMax)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Post price must be ₹${num(parent.postSlabMin)}–₹${num(parent.postSlabMax)}` }); return; }

    // Counter-offer rules: counts can only go DOWN, prices can only go UP (each non-zero), timeline can only go UP
    if (rc > parent.reelCount) { await client.query("ROLLBACK"); res.status(400).json({ error: "Reel count can only be reduced" }); return; }
    if (sc > parent.storyCount) { await client.query("ROLLBACK"); res.status(400).json({ error: "Story count can only be reduced" }); return; }
    if (pc > parent.postCount) { await client.query("ROLLBACK"); res.status(400).json({ error: "Post count can only be reduced" }); return; }
    if (rc > 0 && pr < num(parent.offeredPricePerReel)) { await client.query("ROLLBACK"); res.status(400).json({ error: "Reel price can only be increased" }); return; }
    if (sc > 0 && ps < num(parent.offeredPricePerStory)) { await client.query("ROLLBACK"); res.status(400).json({ error: "Story price can only be increased" }); return; }
    if (pc > 0 && pp < num(parent.offeredPricePerPost)) { await client.query("ROLLBACK"); res.status(400).json({ error: "Post price can only be increased" }); return; }
    if (td < parent.timelineDays) { await client.query("ROLLBACK"); res.status(400).json({ error: "Timeline can only be increased" }); return; }

    // Identical block
    const proposed = { reelCount: rc, storyCount: sc, postCount: pc, offeredPricePerReel: pr, offeredPricePerStory: ps, offeredPricePerPost: pp, timelineDays: td };
    if (isIdentical(proposed, parent)) { await client.query("ROLLBACK"); res.status(400).json({ error: "Counter-offer cannot be identical to the previous round" }); return; }

    const briefText = (brief ?? parent.brief).toString();
    const total = calcTotal(rc, sc, pc, pr, ps, pp);
    const newRound = parent.roundNumber + 1;
    const roundHours1 = await readRoundDeadlineHours();
    const ins = await client.query(
      `INSERT INTO "DealRequest" (id,"brandId","creatorId",source,status,
         "reelCount","storyCount","postCount",
         "offeredPricePerReel","offeredPricePerStory","offeredPricePerPost",
         "timelineDays","productRequired","productDescription","deliveryWindowDays",brief,
         "reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax",
         "roundNumber","totalDealValue","expiresAt","createdAt",
         "proposedBy","parentRequestId","postedBy")
       VALUES (gen_random_uuid(),$1,$2,$3,'PENDING',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW() + INTERVAL '${roundHours1} hours',NOW(),'CREATOR',$23,$24)
       RETURNING id`,
      [parent.brandId, parent.creatorId, parent.source,
       rc, sc, pc, pr, ps, pp, td, parent.productRequired, parent.productDescription, parent.deliveryWindowDays, briefText,
       parent.reelSlabMin, parent.reelSlabMax, parent.storySlabMin, parent.storySlabMax, parent.postSlabMin, parent.postSlabMax,
       newRound, total, id, parent.postedBy]
    );
    await client.query(`UPDATE "DealRequest" SET status='NEGOTIATING', "respondedAt"=NOW() WHERE id=$1`, [id]);
    await client.query("COMMIT");
    const creatorNameRow = await pool.query(`SELECT "fullName" FROM "Creator" WHERE id=$1`, [parent.creatorId]);
    const creatorFullName = (creatorNameRow.rows[0]?.fullName as string | undefined) ?? "the creator";
    await createNotification({
      userId: parent.brandId, userType: "BRAND", type: "REQUEST_COUNTERED",
      title: "Creator countered your offer",
      body: `Round ${newRound}: ₹${total.toLocaleString("en-IN")} for ${rc} reels, ${sc} stories, ${pc} posts (${td} days).`,
      relatedEntityType: "DealRequest", relatedEntityId: ins.rows[0].id,
      emailParams: { creator_name: creatorFullName, counter_amount: Math.round(total) },
    });
    await createPopup({
      userId: parent.brandId, userType: "BRAND", type: "NEGOTIATION_UPDATE",
      title: "Negotiation Updated",
      body: "There's a new update in your negotiation. Review the creator's counter-offer.",
      ctaText: "View Negotiation", ctaPath: "/home-brand/deals?tab=pending",
      isCelebration: false, relatedEntityId: ins.rows[0].id,
    });
    res.json({ ok: true, newRequestId: ins.rows[0].id, roundNumber: newRound, totalValue: total });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Counter failed" });
  } finally { client.release(); }
});

// POST /api/creator/requests/:id/final-accept — Round 4 only
router.post("/creator/requests/:id/final-accept", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].creatorId !== creatorId) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertIsLatestInChain(client, id))) { await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return; }
    const req0 = r.rows[0];
    if (req0.roundNumber < 4 || req0.proposedBy !== "BRAND") { await client.query("ROLLBACK"); res.status(400).json({ error: "Final-accept only valid for Round 4 brand offer" }); return; }
    if (!["PENDING", "NEGOTIATING"].includes(req0.status)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot accept request in status ${req0.status}` }); return; }
    if (req0.expiresAt < new Date()) {
      await client.query("UPDATE \"DealRequest\" SET status='EXPIRED' WHERE id=$1", [id]);
      await client.query("COMMIT"); res.status(400).json({ error: "Request expired" }); return;
    }
    const dealId = await createDealFromRequest(client, req0);
    await client.query(`UPDATE "DealRequest" SET status='ACCEPTED', "respondedAt"=NOW() WHERE id=$1`, [id]);
    await client.query("COMMIT");
    await Promise.all([
      createSystemMessage(dealId, "🤝 Deal agreed! Final offer accepted. Awaiting brand payment to confirm escrow."),
      createNotification({
        userId: req0.brandId, userType: "BRAND", type: "REQUEST_ACCEPTED",
        title: "Final offer accepted!",
        body: `Your final offer was accepted. Complete payment to start the deal.`,
        relatedEntityType: "Deal", relatedEntityId: dealId,
      }),
      createNotification({
        userId: req0.creatorId, userType: "CREATOR", type: "REQUEST_ACCEPTED",
        title: "Offer accepted!",
        body: `You've accepted the offer. Waiting for the brand to complete payment to start the deal.`,
        relatedEntityType: "Deal", relatedEntityId: dealId,
      }),
    ]);
    await Promise.all([
      createPopup({
        userId: req0.brandId, userType: "BRAND", type: "OFFER_ACCEPTED",
        title: "Offer Accepted 🎉",
        body: "The creator accepted your final offer. Complete payment to start the deal.",
        ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=pending",
        isCelebration: true, relatedEntityId: dealId,
      }),
      createPopup({
        userId: req0.creatorId, userType: "CREATOR", type: "OFFER_ACCEPTED",
        title: "Offer Accepted 🎉",
        body: "You've accepted the offer! Waiting for the brand to complete payment to start the deal.",
        ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=pending",
        isCelebration: true, relatedEntityId: dealId,
      }),
    ]);
    res.json({ ok: true, dealId });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Final accept failed" });
  } finally { client.release(); }
});

// POST /api/creator/requests/:id/final-reject — Round 4, always auto-reason (post-negotiation)
router.post("/creator/requests/:id/final-reject", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].creatorId !== creatorId) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertIsLatestInChain(client, id))) { await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return; }
    const req0 = r.rows[0];
    if (req0.roundNumber < 4 || req0.proposedBy !== "BRAND") { await client.query("ROLLBACK"); res.status(400).json({ error: "Final-reject only valid for Round 4" }); return; }
    if (!["PENDING", "NEGOTIATING"].includes(req0.status)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot reject in status ${req0.status}` }); return; }
    const reasonText = "Does not accept the negotiation terms";
    await client.query(`UPDATE "DealRequest" SET status='REJECTED', "respondedAt"=NOW(), "rejectionReason"=$2 WHERE id=$1`, [id, reasonText]);
    await client.query("COMMIT");
    await createNotification({
      userId: req0.brandId, userType: "BRAND", type: "REQUEST_REJECTED",
      title: "Final offer declined",
      body: `Your final offer was declined. Reason: ${reasonText}`,
      relatedEntityType: "DealRequest", relatedEntityId: id,
    });
    await createPopup({
      userId: req0.brandId, userType: "BRAND", type: "OFFER_DECLINED",
      title: "Offer Declined",
      body: "The creator declined your collaboration request.",
      ctaText: "View Details", ctaPath: "/home-brand/deals?tab=cancelled",
      isCelebration: false, relatedEntityId: id,
    });
    res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Reject failed" });
  } finally { client.release(); }
});

// =====================================================
// BRAND ROUTES
// =====================================================

// GET /api/brand/requests/:id — full negotiation chain (brand view)
router.get("/brand/requests/:id", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const id = req.params["id"] as string;
  const own = await pool.query(`SELECT id FROM "DealRequest" WHERE id=$1 AND "brandId"=$2`, [id, brandId]);
  if (own.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  const chain = await fetchRequestChain(id);
  const creatorRow = await pool.query(
    `SELECT id, "fullName", "instagramHandle", "profilePhotoUrl", "followerCount" FROM "Creator" WHERE id=$1`,
    [chain[0]?.creatorId ?? ""]
  );
  res.json({ chain: chain.map(serializeRequest), creator: creatorRow.rows[0] ?? null });
});

// POST /api/brand/requests/:id/accept-counter — brand accepts creator's Round 2 (or Round N from creator)
router.post("/brand/requests/:id/accept-counter", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].brandId !== brandId) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertIsLatestInChain(client, id))) { await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return; }
    const req0 = r.rows[0];
    if (req0.proposedBy !== "CREATOR") { await client.query("ROLLBACK"); res.status(400).json({ error: "Only creator counters can be accepted by brand" }); return; }
    if (!["PENDING", "NEGOTIATING"].includes(req0.status)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot accept in status ${req0.status}` }); return; }
    if (req0.expiresAt < new Date()) {
      await client.query("UPDATE \"DealRequest\" SET status='EXPIRED' WHERE id=$1", [id]);
      await client.query("COMMIT"); res.status(400).json({ error: "Request expired" }); return;
    }
    const dealId = await createDealFromRequest(client, req0);
    await client.query(`UPDATE "DealRequest" SET status='ACCEPTED', "respondedAt"=NOW() WHERE id=$1`, [id]);
    await client.query("COMMIT");
    await Promise.all([
      createSystemMessage(dealId, "🤝 Deal agreed! Brand accepted your counter-offer. Awaiting brand payment to confirm escrow."),
      createNotification({
        userId: req0.creatorId, userType: "CREATOR", type: "REQUEST_ACCEPTED",
        title: "Brand accepted your counter!",
        body: `Awaiting brand payment to start the deal.`,
        relatedEntityType: "Deal", relatedEntityId: dealId,
      }),
    ]);
    await createPopup({
      userId: req0.creatorId, userType: "CREATOR", type: "OFFER_ACCEPTED",
      title: "Counter Accepted 🎉",
      body: "The brand accepted your counter-offer! The deal is pending their payment to start.",
      ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=pending",
      isCelebration: true, relatedEntityId: dealId,
    });
    res.json({ ok: true, dealId });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Accept failed" });
  } finally { client.release(); }
});

// POST /api/brand/requests/:id/counter-back — Round 3 (brand counters creator's Round 2)
// Counts must be ≤ original Round 1 counts; prices in slab; identical-block
router.post("/brand/requests/:id/counter-back", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].brandId !== brandId) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertIsLatestInChain(client, id))) { await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return; }
    const parent = r.rows[0];
    if (parent.proposedBy !== "CREATOR") { await client.query("ROLLBACK"); res.status(400).json({ error: "Counter-back only valid against creator offer" }); return; }
    if (!["PENDING", "NEGOTIATING"].includes(parent.status)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot counter in status ${parent.status}` }); return; }
    if (parent.expiresAt < new Date()) {
      await client.query("UPDATE \"DealRequest\" SET status='EXPIRED' WHERE id=$1", [id]);
      await client.query("COMMIT"); res.status(400).json({ error: "Request expired" }); return;
    }
    if (parent.roundNumber >= 4) { await client.query("ROLLBACK"); res.status(400).json({ error: "No more rounds available" }); return; }

    // Find Round 1 (root)
    const chain = await fetchRequestChain(id);
    const round1 = chain.find(c => c.roundNumber === 1);
    if (!round1) { await client.query("ROLLBACK"); res.status(500).json({ error: "Original round not found" }); return; }

    const { reelCount, storyCount, postCount, pricePerReel, pricePerStory, pricePerPost, timelineDays, brief } = req.body ?? {};
    const rc = Math.max(0, parseInt(reelCount) || 0);
    const sc = Math.max(0, parseInt(storyCount) || 0);
    const pc = Math.max(0, parseInt(postCount) || 0);
    const pr = parseFloat(pricePerReel) || 0;
    const ps = parseFloat(pricePerStory) || 0;
    const pp = parseFloat(pricePerPost) || 0;
    const td = parseInt(timelineDays) || 0;
    if (rc + sc + pc === 0) { await client.query("ROLLBACK"); res.status(400).json({ error: "At least one deliverable required" }); return; }
    if (td < 7 || td > 15) { await client.query("ROLLBACK"); res.status(400).json({ error: "Timeline must be between 7 and 15 days" }); return; }

    // Slab range
    const inRange = (val: number, min: any, max: any) => val >= num(min) && val <= num(max);
    if (rc > 0 && !inRange(pr, parent.reelSlabMin, parent.reelSlabMax)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Reel price must be ₹${num(parent.reelSlabMin)}–₹${num(parent.reelSlabMax)}` }); return; }
    if (sc > 0 && !inRange(ps, parent.storySlabMin, parent.storySlabMax)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Story price must be ₹${num(parent.storySlabMin)}–₹${num(parent.storySlabMax)}` }); return; }
    if (pc > 0 && !inRange(pp, parent.postSlabMin, parent.postSlabMax)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Post price must be ₹${num(parent.postSlabMin)}–₹${num(parent.postSlabMax)}` }); return; }

    // Counts ≤ original Round 1
    if (rc > round1.reelCount) { await client.query("ROLLBACK"); res.status(400).json({ error: `Reel count cannot exceed original (${round1.reelCount})` }); return; }
    if (sc > round1.storyCount) { await client.query("ROLLBACK"); res.status(400).json({ error: `Story count cannot exceed original (${round1.storyCount})` }); return; }
    if (pc > round1.postCount) { await client.query("ROLLBACK"); res.status(400).json({ error: `Post count cannot exceed original (${round1.postCount})` }); return; }

    // Timeline: brand can decrease but not below original Round 1, and not above creator's counter
    if (td < round1.timelineDays) { await client.query("ROLLBACK"); res.status(400).json({ error: `Timeline cannot go below your original offer (${round1.timelineDays} days)` }); return; }
    if (td > parent.timelineDays) { await client.query("ROLLBACK"); res.status(400).json({ error: `Timeline cannot exceed creator's counter (${parent.timelineDays} days)` }); return; }

    const proposed = { reelCount: rc, storyCount: sc, postCount: pc, offeredPricePerReel: pr, offeredPricePerStory: ps, offeredPricePerPost: pp, timelineDays: td };
    if (isIdentical(proposed, parent)) { await client.query("ROLLBACK"); res.status(400).json({ error: "Counter cannot be identical to creator's offer" }); return; }

    const briefText = (brief ?? parent.brief).toString();
    const total = calcTotal(rc, sc, pc, pr, ps, pp);
    const newRound = parent.roundNumber + 1;
    const roundHours2 = await readRoundDeadlineHours();
    const ins = await client.query(
      `INSERT INTO "DealRequest" (id,"brandId","creatorId",source,status,
         "reelCount","storyCount","postCount",
         "offeredPricePerReel","offeredPricePerStory","offeredPricePerPost",
         "timelineDays","productRequired","productDescription","deliveryWindowDays",brief,
         "reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax",
         "roundNumber","totalDealValue","expiresAt","createdAt",
         "proposedBy","parentRequestId","postedBy")
       VALUES (gen_random_uuid(),$1,$2,$3,'PENDING',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW() + INTERVAL '${roundHours2} hours',NOW(),'BRAND',$23,$24)
       RETURNING id`,
      [parent.brandId, parent.creatorId, parent.source,
       rc, sc, pc, pr, ps, pp, td, parent.productRequired, parent.productDescription, parent.deliveryWindowDays, briefText,
       parent.reelSlabMin, parent.reelSlabMax, parent.storySlabMin, parent.storySlabMax, parent.postSlabMin, parent.postSlabMax,
       newRound, total, id, parent.postedBy]
    );
    await client.query(`UPDATE "DealRequest" SET status='NEGOTIATING', "respondedAt"=NOW() WHERE id=$1`, [id]);
    await client.query("COMMIT");
    await createNotification({
      userId: parent.creatorId, userType: "CREATOR", type: "REQUEST_COUNTERED",
      title: "Brand counter-offered (final round)",
      body: `Round ${newRound}: ₹${total.toLocaleString("en-IN")} for ${rc} reels, ${sc} stories, ${pc} posts (${td} days). Final offer — accept or reject only.`,
      relatedEntityType: "DealRequest", relatedEntityId: ins.rows[0].id,
    });
    await createPopup({
      userId: parent.creatorId, userType: "CREATOR", type: "NEGOTIATION_UPDATE",
      title: "Offer Updated",
      body: "The brand sent a negotiation update. Review their final counter-offer.",
      ctaText: "View Negotiation", ctaPath: "/home-creator/requests",
      isCelebration: false, relatedEntityId: ins.rows[0].id,
    });
    res.json({ ok: true, newRequestId: ins.rows[0].id, roundNumber: newRound, totalValue: total });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Counter failed" });
  } finally { client.release(); }
});

// POST /api/brand/requests/:id/reject — brand rejects creator's counter (always post-negotiation → auto-reason)
router.post("/brand/requests/:id/reject", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].brandId !== brandId) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertIsLatestInChain(client, id))) { await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return; }
    const req0 = r.rows[0];
    if (!["PENDING", "NEGOTIATING"].includes(req0.status)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot reject in status ${req0.status}` }); return; }
    const reasonText = "Does not accept the negotiation terms";
    await client.query(`UPDATE "DealRequest" SET status='REJECTED', "respondedAt"=NOW(), "rejectionReason"=$2 WHERE id=$1`, [id, reasonText]);
    await client.query("COMMIT");
    await createNotification({
      userId: req0.creatorId, userType: "CREATOR", type: "REQUEST_REJECTED",
      title: "Brand declined your counter",
      body: `Reason: ${reasonText}`,
      relatedEntityType: "DealRequest", relatedEntityId: id,
    });
    await createPopup({
      userId: req0.creatorId, userType: "CREATOR", type: "NEGOTIATION_REJECTED",
      title: "Negotiation Rejected",
      body: "The brand declined your negotiation request.",
      ctaText: "View Requests", ctaPath: "/home-creator/requests",
      isCelebration: false, relatedEntityId: id,
    });
    res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Reject failed" });
  } finally { client.release(); }
});

// POST /api/brand/requests/:id/stay-on-original
// Brand re-proposes the original Round 1 values as the final (Round 4) offer.
// Only valid when the latest request is a CREATOR counter (proposedBy=CREATOR, round 2 or 3).
router.post("/brand/requests/:id/stay-on-original", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<RequestRow>(`SELECT * FROM "DealRequest" WHERE id=$1 FOR UPDATE`, [id]);
    if (r.rows.length === 0 || r.rows[0].brandId !== brandId) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertIsLatestInChain(client, id))) { await client.query("ROLLBACK"); res.status(409).json({ error: "Request superseded by a newer round" }); return; }
    const parent = r.rows[0];
    if (parent.proposedBy !== "CREATOR") { await client.query("ROLLBACK"); res.status(400).json({ error: "stay-on-original only valid against a creator counter" }); return; }
    if (!["PENDING", "NEGOTIATING"].includes(parent.status)) { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot act in status ${parent.status}` }); return; }
    if (parent.expiresAt < new Date()) {
      await client.query("UPDATE \"DealRequest\" SET status='EXPIRED' WHERE id=$1", [id]);
      await client.query("COMMIT"); res.status(400).json({ error: "Request expired" }); return;
    }

    // Fetch Round 1 values
    const chain = await fetchRequestChain(id);
    const round1 = chain.find(c => c.roundNumber === 1);
    if (!round1) { await client.query("ROLLBACK"); res.status(500).json({ error: "Original round not found" }); return; }

    const newRound = parent.roundNumber + 1;
    if (newRound > 4) { await client.query("ROLLBACK"); res.status(400).json({ error: "No more rounds available" }); return; }

    const total = calcTotal(round1.reelCount, round1.storyCount, round1.postCount,
      num(round1.offeredPricePerReel), num(round1.offeredPricePerStory), num(round1.offeredPricePerPost));

    const roundHours3 = await readRoundDeadlineHours();
    const ins = await client.query(
      `INSERT INTO "DealRequest" (id,"brandId","creatorId",source,status,
         "reelCount","storyCount","postCount",
         "offeredPricePerReel","offeredPricePerStory","offeredPricePerPost",
         "timelineDays","productRequired","productDescription","deliveryWindowDays",brief,
         "aboutProduct","reelScript","storyScript","postContent",
         "reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax",
         "roundNumber","totalDealValue","expiresAt","createdAt","proposedBy","parentRequestId","postedBy")
       VALUES (gen_random_uuid(),$1,$2,$3,'PENDING',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NOW() + INTERVAL '${roundHours3} hours',NOW(),'BRAND',$27,$28)
       RETURNING id`,
      [parent.brandId, parent.creatorId, parent.source,
       round1.reelCount, round1.storyCount, round1.postCount,
       num(round1.offeredPricePerReel), num(round1.offeredPricePerStory), num(round1.offeredPricePerPost),
       round1.timelineDays, parent.productRequired, parent.productDescription, parent.deliveryWindowDays,
       parent.brief, parent.aboutProduct, parent.reelScript, parent.storyScript, parent.postContent,
       parent.reelSlabMin, parent.reelSlabMax, parent.storySlabMin, parent.storySlabMax, parent.postSlabMin, parent.postSlabMax,
       newRound, total, id, parent.postedBy]
    );
    await client.query(`UPDATE "DealRequest" SET status='NEGOTIATING', "respondedAt"=NOW() WHERE id=$1`, [id]);
    await client.query("COMMIT");
    await createNotification({
      userId: parent.creatorId, userType: "CREATOR", type: "REQUEST_COUNTERED",
      title: "Brand is holding their original offer",
      body: `Round ${newRound} (Final): ₹${total.toLocaleString("en-IN")} — the brand's original terms. Accept or reject.`,
      relatedEntityType: "DealRequest", relatedEntityId: ins.rows[0].id,
    });
    await createPopup({
      userId: parent.creatorId, userType: "CREATOR", type: "NEGOTIATION_UPDATE",
      title: "Offer Updated",
      body: "The brand sent a negotiation update. They are holding their original offer as a final round.",
      ctaText: "View Negotiation", ctaPath: "/home-creator/requests",
      isCelebration: false, relatedEntityId: ins.rows[0].id,
    });
    res.json({ ok: true, newRequestId: ins.rows[0].id, roundNumber: newRound, totalValue: total });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Operation failed" });
  } finally { client.release(); }
});

// =====================================================
// DEALS (CREATOR)
// =====================================================

// GET /api/creator/deals?tab=live|pending|completed|cancelled
router.get("/creator/deals", requireCreator, async (req: Request, res: Response): Promise<void> => {
  await expireOverdueRequests();
  const creatorId = (req as any).creatorId as string;
  const tab = (req.query["tab"] as string) || "live";

  if (tab === "pending") {
    // pending requests + PENDING_PAYMENT deals
    const reqs = await pool.query(
      `SELECT dr.*, b."brandName" as "brandName", b."logoUrl" as "brandLogo"
       FROM "DealRequest" dr
       JOIN "Brand" b ON b.id=dr."brandId"
       WHERE dr."creatorId"=$1
         AND dr.status IN ('PENDING','NEGOTIATING')
         AND NOT EXISTS (SELECT 1 FROM "DealRequest" child WHERE child."parentRequestId"=dr.id)
       ORDER BY dr."createdAt" DESC`,
      [creatorId]
    );
    const deals = await pool.query(
      `SELECT d.*, b."brandName" as "brandName", b."logoUrl" as "brandLogo",
              COALESCE(camp.name, bc.name) as "campaignName",
              bc."productName" as "barterProductName",
              bc."productValueInr" as "barterProductValue"
       FROM "Deal" d
       JOIN "Brand" b ON b.id=d."brandId"
       LEFT JOIN "Campaign" camp ON camp.id=d."campaignId"
       LEFT JOIN "BarterCampaign" bc ON bc.id=d."barterId"
       WHERE d."creatorId"=$1 AND d.status='PENDING_PAYMENT'
       ORDER BY d."createdAt" DESC`,
      [creatorId]
    );
    res.json({
      requests: reqs.rows.map(r => ({
        ...serializeRequest(r),
        brand: { id: r.brandId, companyName: r.brandName, logoUrl: r.brandLogo },
      })),
      pendingPaymentDeals: deals.rows.map(d => ({
        ...serializeDeal(d),
        brand: { id: d.brandId, companyName: d.brandName, logoUrl: d.brandLogo },
      })),
    });
    return;
  }

  let statusList: string[] = [];
  if (tab === "live") statusList = [
    "LIVE","IN_ESCROW","IN_PROGRESS","DELIVERED","REVIEW","DISPUTE",
    "CONCEPT_SUBMITTED","CONCEPT_APPROVED","PRODUCT_SHIPPED","PRODUCT_RECEIVED",
    "PRODUCT_ISSUE_RAISED","AWAITING_CREATOR_ISSUE_DECISION","NON_DELIVERY_REPORTED",
    "CONTENT_UPLOADED","REVISION_REQUESTED",
    "POST_LIVE_PENDING","URL_FLAGGED","FINAL_POST_CONFIRMED","OVERDUE"
  ];
  else if (tab === "completed") statusList = ["COMPLETED","CONTENT_APPROVED","DISPUTE_WINDOW_OPEN","DISPUTED"];
  else if (tab === "cancelled") statusList = ["CANCELLED", "REJECTED", "EXPIRED"];

  const deals = await pool.query(
    `SELECT d.*, b."brandName" as "brandName", b."logoUrl" as "brandLogo",
            COALESCE(camp.name, bc.name) as "campaignName",
            bc."productName" as "barterProductName",
            bc."productValueInr" as "barterProductValue"
     FROM "Deal" d
     JOIN "Brand" b ON b.id=d."brandId"
     LEFT JOIN "Campaign" camp ON camp.id=d."campaignId"
     LEFT JOIN "BarterCampaign" bc ON bc.id=d."barterId"
     WHERE d."creatorId"=$1 AND d.status = ANY($2::text[])
     ORDER BY d."createdAt" DESC`,
    [creatorId, statusList]
  );

  let cancelledRequests: any[] = [];
  if (tab === "cancelled") {
    const reqs = await pool.query(
      `SELECT dr.*, b."brandName" as "brandName", b."logoUrl" as "brandLogo"
       FROM "DealRequest" dr
       JOIN "Brand" b ON b.id=dr."brandId"
       WHERE dr."creatorId"=$1
         AND dr.status IN ('REJECTED','EXPIRED','CANCELLED')
         AND NOT EXISTS (SELECT 1 FROM "DealRequest" child WHERE child."parentRequestId"=dr.id)
       ORDER BY COALESCE(dr."respondedAt", dr."createdAt") DESC`,
      [creatorId]
    );
    cancelledRequests = reqs.rows.map(r => ({
      ...serializeRequest(r),
      brand: { id: r.brandId, companyName: r.brandName, logoUrl: r.brandLogo },
      rejectedBy: r.status === "EXPIRED" ? "SYSTEM" : (r.proposedBy === "BRAND" ? "CREATOR" : "BRAND"),
    }));
  }

  res.json({
    deals: deals.rows.map(d => ({
      ...serializeDeal(d),
      brand: { id: d.brandId, companyName: d.brandName, logoUrl: d.brandLogo },
    })),
    cancelledRequests,
  });
});

// DEALS (BRAND)
// =====================================================

// GET /api/brand/deals?tab=live|pending|completed|cancelled
router.get("/brand/deals", requireBrand, async (req: Request, res: Response): Promise<void> => {
  await expireOverdueRequests();
  const brandId = (req as any).brandId as string;
  const tab = (req.query["tab"] as string) || "live";

  if (tab === "pending") {
    // Pending Collabs = (a) requests where creator has not yet responded (latest in chain, status PENDING/NEGOTIATING from this brand) +
    //                  (b) deals in PENDING_PAYMENT
    const reqs = await pool.query(
      `SELECT dr.*, c."fullName" as "creatorName", c."instagramHandle", c."profilePhotoUrl",
              c."followerCount", c.id as "creatorIdJoined"
       FROM "DealRequest" dr
       JOIN "Creator" c ON c.id=dr."creatorId"
       WHERE dr."brandId"=$1
         AND dr.status IN ('PENDING','NEGOTIATING')
         AND NOT EXISTS (SELECT 1 FROM "DealRequest" child WHERE child."parentRequestId"=dr.id)
       ORDER BY dr."createdAt" DESC`,
      [brandId]
    );
    const deals = await pool.query(
      `SELECT d.*, c."fullName" as "creatorName", c."instagramHandle", c."profilePhotoUrl", c."followerCount"
       FROM "Deal" d
       JOIN "Creator" c ON c.id=d."creatorId"
       WHERE d."brandId"=$1 AND d.status='PENDING_PAYMENT'
       ORDER BY d."createdAt" DESC`,
      [brandId]
    );
    res.json({
      requests: reqs.rows.map(r => ({
        ...serializeRequest(r),
        creator: { id: r.creatorIdJoined, fullName: r.creatorName, instagramHandle: r.instagramHandle, profilePhotoUrl: r.profilePhotoUrl, followerCount: r.followerCount },
      })),
      pendingPaymentDeals: deals.rows.map(serializeDeal),
    });
    return;
  }

  let statusList: string[] = [];
  if (tab === "live") statusList = [
    "LIVE","IN_ESCROW","IN_PROGRESS","DELIVERED","REVIEW","DISPUTE",
    "CONCEPT_SUBMITTED","CONCEPT_APPROVED","PRODUCT_SHIPPED","PRODUCT_RECEIVED",
    "PRODUCT_ISSUE_RAISED","AWAITING_CREATOR_ISSUE_DECISION","NON_DELIVERY_REPORTED",
    "CONTENT_UPLOADED","REVISION_REQUESTED",
    "POST_LIVE_PENDING","URL_FLAGGED","FINAL_POST_CONFIRMED","OVERDUE"
  ];
  else if (tab === "completed") statusList = ["COMPLETED","CONTENT_APPROVED","DISPUTE_WINDOW_OPEN","DISPUTED"];
  else if (tab === "cancelled") statusList = ["CANCELLED", "REJECTED", "EXPIRED"];

  const deals = await pool.query(
    `SELECT d.*, c."fullName" as "creatorName", c."instagramHandle", c."profilePhotoUrl", c."followerCount",
            COALESCE(camp.name, bc.name) as "campaignName"
     FROM "Deal" d
     JOIN "Creator" c ON c.id=d."creatorId"
     LEFT JOIN "Campaign" camp ON camp.id=d."campaignId"
     LEFT JOIN "BarterCampaign" bc ON bc.id=d."barterId"
     WHERE d."brandId"=$1 AND d.status = ANY($2::text[])
     ORDER BY d."createdAt" DESC`,
    [brandId, statusList]
  );

  let cancelledRequests: any[] = [];
  if (tab === "cancelled") {
    const reqs = await pool.query(
      `SELECT dr.*, c."fullName" as "creatorName", c."instagramHandle", c."profilePhotoUrl", c."followerCount", c.id as "creatorIdJoined"
       FROM "DealRequest" dr
       JOIN "Creator" c ON c.id=dr."creatorId"
       WHERE dr."brandId"=$1
         AND dr.status IN ('REJECTED','EXPIRED','CANCELLED')
         AND NOT EXISTS (SELECT 1 FROM "DealRequest" child WHERE child."parentRequestId"=dr.id)
       ORDER BY COALESCE(dr."respondedAt", dr."createdAt") DESC`,
      [brandId]
    );
    cancelledRequests = reqs.rows.map(r => ({
      ...serializeRequest(r),
      creator: { id: r.creatorIdJoined, fullName: r.creatorName, instagramHandle: r.instagramHandle, profilePhotoUrl: r.profilePhotoUrl, followerCount: r.followerCount },
      rejectedBy: r.status === "EXPIRED" ? "SYSTEM" : (r.proposedBy === "BRAND" ? "CREATOR" : "BRAND"),
    }));
  }

  res.json({ deals: deals.rows.map(serializeDeal), cancelledRequests });
});

// ── Direct-deal payment helpers (shared by the no-gateway stub + Razorpay verify) ──
async function computeDirectDealAmounts(deal: any): Promise<{ subtotal: number; commissionRate: number; gstRate: number; gstAmount: number; totalPayable: number; creatorPayout: number }> {
  const subtotal = num(deal.totalAgreedValue);
  const commissionRate = num(deal.commissionRateLocked) || (await readCommissionRate());
  const gstRate = num(deal.gstRateLocked) > 0 ? num(deal.gstRateLocked) : (await readGstRate());
  const gstAmount = +(subtotal * gstRate / 100).toFixed(2);
  const totalPayable = +(subtotal + gstAmount).toFixed(2);
  const creatorPayout = +(subtotal * (1 - commissionRate / 100)).toFixed(2);
  return { subtotal, commissionRate, gstRate, gstAmount, totalPayable, creatorPayout };
}

// Moves a PENDING_PAYMENT direct deal into escrow + records the Payment row.
// Caller must hold a FOR UPDATE lock and have checked status === 'PENDING_PAYMENT'.
async function activateDirectDeal(client: PoolClient, deal: any, brandId: string, paymentReferenceId: string) {
  const a = await computeDirectDealAmounts(deal);
  const orderSeqRow = await client.query(`SELECT COUNT(*) FROM "Deal" WHERE "orderId" IS NOT NULL`);
  const dealOrderId = `CLBdeal${String(parseInt(orderSeqRow.rows[0].count as string) + 1).padStart(6, "0")}`;
  const cfg = await client.query(`SELECT value FROM "PlatformConfig" WHERE key='require_courier_awb'`);
  const requireCourierAwbLocked = cfg.rows.length > 0 ? String(cfg.rows[0].value).toLowerCase() === "true" : false;
  await client.query(
    `UPDATE "Deal" SET status='IN_ESCROW',
       "timelineStartAt"=CASE WHEN "productRequired"=false THEN NOW() ELSE NULL END,
       "deadlineAt"=CASE WHEN "productRequired"=false THEN NOW() + ("timelineDays" || ' days')::interval ELSE NULL END,
       "gstAmount"=$2, "totalPayable"=$3, "creatorPayout"=$4,
       "commissionRateLocked"=COALESCE("commissionRateLocked",$5),
       "paymentReferenceId"=$6, "escrowStatus"='HELD',
       "requireCourierAwb"=$7,
       "orderId"=$8,
       "creatorActionDueSince"=NOW(), "conceptInactivityStage"=0
       WHERE id=$1`,
    [deal.id, a.gstAmount, a.totalPayable, a.creatorPayout, a.commissionRate, paymentReferenceId, requireCourierAwbLocked, dealOrderId]
  );
  await client.query(
    `INSERT INTO "Payment" (id,"dealId","brandId","paymentReferenceId",amount,currency,status,"confirmedAt","createdAt",
       "gstAmount","creatorPayout","commissionRateLocked")
     VALUES (gen_random_uuid(),$1,$2,$3,$4,'INR','SUCCESS',NOW(),NOW(),$5,$6,$7)`,
    [deal.id, brandId, paymentReferenceId, a.totalPayable, a.gstAmount, a.creatorPayout, a.commissionRate]
  );
  return { dealOrderId, ...a };
}

// Post-commit: escrow chat messages + live notifications for a direct deal.
async function directDealLiveNotify(id: string, deal: any, brandId: string, a: { totalPayable: number; gstAmount: number; creatorPayout: number }): Promise<void> {
  const escrowMsg = `🔒 Escrow confirmed. Deal is now LIVE! Payment of ₹${a.totalPayable.toLocaleString("en-IN")} (incl. ₹${a.gstAmount.toLocaleString("en-IN")} GST) received and is held in escrow.`;
  const addressMsg = deal.productRequired
    ? `📍 This deal includes product shipping. Creator, please share your full delivery address (door/flat no., street, city, state, PIN) in this chat so the brand can ship to you.`
    : null;
  await Promise.all([
    createSystemMessage(id, escrowMsg),
    ...(addressMsg ? [createSystemMessage(id, addressMsg)] : []),
    createNotification({
      userId: deal.creatorId, userType: "CREATOR", type: "DEAL_LIVE",
      title: "Deal is live!",
      body: `Brand payment confirmed. Deal is now active. Your payout: ₹${a.creatorPayout.toLocaleString("en-IN")} on completion.${deal.productRequired ? " Please share your delivery address in deal chat." : ""}`,
      relatedEntityType: "Deal", relatedEntityId: id,
      emailTemplateId: 31, emailSubject: "Your deal is live!",
      emailParams: { amount: Math.round(a.creatorPayout) },
    }),
    createNotification({
      userId: brandId, userType: "BRAND", type: "PAYMENT_SUCCESS",
      title: "Payment successful",
      body: `Your deal is live. Total paid: ₹${a.totalPayable.toLocaleString("en-IN")} (incl. ₹${a.gstAmount.toLocaleString("en-IN")} GST).`,
      relatedEntityType: "Deal", relatedEntityId: id,
      emailTemplateId: 32, emailSubject: "Payment confirmed",
      emailParams: { amount: Math.round(a.totalPayable) },
    }),
    createPopup({
      userId: deal.creatorId, userType: "CREATOR", type: "DEAL_LIVE",
      title: "Congrats! Your Deal is Live 🚀",
      body: "Your collaboration is now active and the deal workflow has started. Want to understand how the deal flow works?",
      ctaText: "See Deal", ctaPath: "/home-creator/deals?tab=live",
      secondCtaText: "Watch Video", secondCtaPath: "/home-creator/deals?tab=live&tutorial=1",
      isCelebration: true, relatedEntityId: id,
    }),
    createPopup({
      userId: brandId, userType: "BRAND", type: "DEAL_LIVE",
      title: "Congrats! Your Deal is Live 🚀",
      body: "Your collaboration is now active and the deal workflow has started. Want to understand how the deal flow works?",
      ctaText: "See Deal", ctaPath: "/home-brand/deals?tab=live",
      secondCtaText: "Watch Video", secondCtaPath: "/home-brand/deals?tab=live&tutorial=1",
      isCelebration: true, relatedEntityId: id,
    }),
  ]);
}

// POST /api/brand/deals/:id/simulate-payment
// Despite the name, this is the direct-deal payment entry point: with Razorpay
// configured it creates an order (escrow activates on verify-payment); without
// keys it activates directly (the original simulate behaviour).
router.post("/brand/deals/:id/simulate-payment", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const id = req.params["id"] as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const d = await client.query(`SELECT * FROM "Deal" WHERE id=$1 AND "brandId"=$2 FOR UPDATE`, [id, brandId]);
    if (d.rows.length === 0) { await client.query("ROLLBACK"); res.status(404).json({ error: "Deal not found" }); return; }
    const deal = d.rows[0];
    if (deal.status !== "PENDING_PAYMENT") { await client.query("ROLLBACK"); res.status(400).json({ error: `Cannot pay in status ${deal.status}` }); return; }

    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];

    if (keyId && keySecret) {
      // Gateway configured → create a Razorpay order; escrow activates on verify-payment.
      const a = await computeDirectDealAmounts(deal);
      try {
        const Razorpay = (await import("razorpay")).default as any;
        const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
        const order = await rzp.orders.create({
          amount: Math.round(a.totalPayable * 100), currency: "INR",
          notes: { brandId, dealId: id, type: "direct_deal", gstAmount: a.gstAmount, totalPayable: a.totalPayable },
        });
        await client.query("COMMIT");
        res.json({ orderId: order.id, amount: Math.round(a.totalPayable * 100), currency: "INR", keyId, dealId: id });
      } catch { await client.query("ROLLBACK"); res.status(500).json({ error: "Payment gateway error" }); }
      return;
    }

    // No gateway configured → simulate (activate directly).
    const platformPaymentRef = `SIM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const a = await activateDirectDeal(client, deal, brandId, platformPaymentRef);
    await client.query("COMMIT");
    await directDealLiveNotify(id, deal, brandId, a);
    res.json({ ok: true, dealId: id, orderId: a.dealOrderId, status: "LIVE", totalPayable: a.totalPayable, gstAmount: a.gstAmount, creatorPayout: a.creatorPayout });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message ?? "Payment failed" });
  } finally { client.release(); }
});

// POST /api/brand/deals/:id/verify-payment — completes a Razorpay direct-deal
// payment: verify the signature, confirm the order belongs to this deal/brand,
// then activate escrow. Idempotent (already-IN_ESCROW returns success).
router.post("/brand/deals/:id/verify-payment", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const id = req.params["id"] as string;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) { res.status(400).json({ error: "Missing payment fields" }); return; }
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) { res.status(503).json({ error: "RAZORPAY_NOT_CONFIGURED", message: "Payment gateway is not configured." }); return; }

  const expected = crypto.createHmac("sha256", keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  let valid = false;
  try { valid = expected.length === razorpay_signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature)); } catch { valid = false; }
  if (!valid) { res.status(400).json({ error: "Signature verification failed" }); return; }

  let order: any;
  try {
    const Razorpay = (await import("razorpay")).default as any;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    order = await rzp.orders.fetch(razorpay_order_id);
  } catch { res.status(502).json({ error: "Could not verify order with gateway" }); return; }
  const notes = order?.notes ?? {};
  if (notes.type !== "direct_deal" || notes.dealId !== id || notes.brandId !== brandId) { res.status(403).json({ error: "Order does not match this deal" }); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const d = await client.query(`SELECT * FROM "Deal" WHERE id=$1 AND "brandId"=$2 FOR UPDATE`, [id, brandId]);
    const deal = d.rows[0];
    if (!deal) { await client.query("ROLLBACK"); res.status(404).json({ error: "Deal not found" }); return; }
    if (deal.status === "IN_ESCROW") { await client.query("COMMIT"); res.json({ ok: true, status: "LIVE", dealId: id, duplicate: true }); return; }
    if (deal.status !== "PENDING_PAYMENT") { await client.query("ROLLBACK"); res.status(409).json({ error: `Cannot pay in status ${deal.status}` }); return; }

    const a = await activateDirectDeal(client, deal, brandId, razorpay_payment_id);
    await client.query("COMMIT");
    await directDealLiveNotify(id, deal, brandId, a);
    res.json({ ok: true, status: "LIVE", dealId: id, orderId: a.dealOrderId, totalPayable: a.totalPayable, gstAmount: a.gstAmount, creatorPayout: a.creatorPayout });
  } catch (e: any) {
    await client.query("ROLLBACK");
    logger.error({ err: e, dealId: id }, "Direct-deal payment verification failed");
    res.status(500).json({ error: "Verification failed" });
  } finally { client.release(); }
});

// =====================================================
// HELPERS
// =====================================================

async function createDealFromRequest(client: PoolClient, req0: RequestRow): Promise<string> {
  const commissionRate = await readCommissionRate();
  const gstRate = await readGstRate();
  const total = num(req0.totalDealValue);
  const postedBy = req0.postedBy && ["CREATOR","BRAND","BOTH"].includes(req0.postedBy) ? req0.postedBy : "CREATOR";
  // Snapshot all shipping/issue/non-delivery config so admin changes never affect active deals
  const snap = await readShippingConfigSnapshot(client);
  const ins = await client.query(
    `INSERT INTO "Deal" (id,"requestId","brandId","creatorId",source,status,
       "reelCount","storyCount","postCount",
       "agreedPricePerReel","agreedPricePerStory","agreedPricePerPost",
       "totalAgreedValue","commissionRate","commissionRateLocked",
       "timelineDays","productRequired","deliveryWindowDays",
       "postedBy","escrowStatus","createdAt",
       "max_delivery_days_snapshot","delivery_warning_day_snapshot",
       "max_delivery_extensions_snapshot","brand_response_hours_snapshot",
       "awb_correction_limit_snapshot","image_retention_days_snapshot",
       "percent_split_snapshot","gstRateLocked","productImageUrl")
     VALUES (gen_random_uuid(),$1,$2,$3,$4,'PENDING_PAYMENT',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'NONE',NOW(),
             $18,$19,$20,$21,$22,$23,$24,$25,$26)
     RETURNING id`,
    [req0.id, req0.brandId, req0.creatorId, req0.source,
     req0.reelCount, req0.storyCount, req0.postCount,
     num(req0.offeredPricePerReel), num(req0.offeredPricePerStory), num(req0.offeredPricePerPost),
     total, commissionRate, commissionRate,
     req0.timelineDays, req0.productRequired, req0.deliveryWindowDays, postedBy,
     snap.maxDeliveryDays, snap.warningDay, snap.maxExtensions,
     snap.brandResponseHours, snap.awbCorrectionLimit, snap.imageRetentionDays,
     JSON.stringify(snap.splits), gstRate, req0.productImageUrl ?? null]
  );
  const dealId = ins.rows[0].id as string;

  // Seed one DealDeliverable per slot. Slot labels: "Reel 1", "Reel 2", "Story 1", "Post 1" ...
  const deliverables: { type: string; label: string }[] = [];
  for (let i = 1; i <= req0.reelCount; i++) deliverables.push({ type: "REEL", label: `Reel ${i}` });
  for (let i = 1; i <= req0.storyCount; i++) deliverables.push({ type: "STORY", label: `Story ${i}` });
  for (let i = 1; i <= req0.postCount; i++) deliverables.push({ type: "POST", label: `Post ${i}` });
  for (const d of deliverables) {
    await client.query(
      `INSERT INTO "DealDeliverable" (id,"dealId",type,"slotLabel","conceptStatus","conceptRevisionCount","finalStatus","finalRevisionCount")
       VALUES (gen_random_uuid(),$1,$2,$3,'PENDING',0,'PENDING',0)`,
      [dealId, d.type, d.label]
    );
  }

  // Auto-unlock creator profile for the brand (no credit deducted — deal has been agreed)
  const cr = await client.query(
    `SELECT "followerCount","reelPriceMin","reelPriceMax","storyPriceMin","storyPriceMax","postPriceMin","postPriceMax"
     FROM "Creator" WHERE id=$1`,
    [req0.creatorId]
  );
  if (cr.rows.length > 0) {
    const c = cr.rows[0];
    await client.query(
      `INSERT INTO "BrandUnlockRecord" (id,"brandId","creatorId","reelSlabMin","reelSlabMax","storySlabMin","storySlabMax","postSlabMin","postSlabMax","followerCountAtUnlock","unlockedAt")
       SELECT gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()
       WHERE NOT EXISTS (SELECT 1 FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2)`,
      [req0.brandId, req0.creatorId,
       c.reelPriceMin ?? 0, c.reelPriceMax ?? 0,
       c.storyPriceMin ?? 0, c.storyPriceMax ?? 0,
       c.postPriceMin ?? 0, c.postPriceMax ?? 0,
       c.followerCount ?? 0]
    );
  }

  return dealId;
}

function serializeRequest(r: any) {
  return {
    id: r.id,
    brandId: r.brandId,
    creatorId: r.creatorId,
    source: r.source,
    status: r.status,
    reelCount: r.reelCount,
    storyCount: r.storyCount,
    postCount: r.postCount,
    pricePerReel: num(r.offeredPricePerReel),
    pricePerStory: num(r.offeredPricePerStory),
    pricePerPost: num(r.offeredPricePerPost),
    timelineDays: r.timelineDays,
    productRequired: r.productRequired,
    productDescription: r.productDescription,
    deliveryWindowDays: r.deliveryWindowDays,
    brief: r.brief,
    slab: {
      reelMin: num(r.reelSlabMin), reelMax: num(r.reelSlabMax),
      storyMin: num(r.storySlabMin), storyMax: num(r.storySlabMax),
      postMin: num(r.postSlabMin), postMax: num(r.postSlabMax),
    },
    roundNumber: r.roundNumber,
    totalValue: num(r.totalDealValue),
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    proposedBy: r.proposedBy,
    parentRequestId: r.parentRequestId,
    postedBy: r.postedBy ?? null,
    rejectionReason: r.rejectionReason ?? null,
    brandName: r.brandName ?? null,
    brandLogo: r.brandLogo ?? null,
    aboutProduct: r.aboutProduct ?? null,
    reelScript: r.reelScript ?? null,
    storyScript: r.storyScript ?? null,
    postContent: r.postContent ?? null,
    productImageUrl: r.productImageUrl ?? null,
  };
}

function serializeDeal(d: any) {
  const subtotal = num(d.totalAgreedValue);
  const gstRate = d.gstRateLocked != null ? num(d.gstRateLocked) : 18;
  const gst = d.gstAmount != null ? num(d.gstAmount) : +(subtotal * gstRate / 100).toFixed(2);
  const total = d.totalPayable != null ? num(d.totalPayable) : +(subtotal + gst).toFixed(2);
  const commissionRate = num(d.commissionRateLocked) || num(d.commissionRate) || 5;
  const creatorPayout = d.creatorPayout != null ? num(d.creatorPayout) : +(subtotal * (1 - commissionRate / 100)).toFixed(2);
  return {
    id: d.id,
    requestId: d.requestId,
    status: d.status,
    source: d.source ?? "DIRECT",
    campaignId: d.campaignId ?? null,
    barterId: d.barterId ?? null,
    campaignName: d.campaignName ?? null,
    reelCount: d.reelCount, storyCount: d.storyCount, postCount: d.postCount,
    pricePerReel: num(d.agreedPricePerReel), pricePerStory: num(d.agreedPricePerStory), pricePerPost: num(d.agreedPricePerPost),
    subtotal, gstAmount: gst, totalPayable: total, creatorPayout, commissionRate, gstRate,
    timelineDays: d.timelineDays, timelineStartAt: d.timelineStartAt, deadlineAt: d.deadlineAt,
    productRequired: d.productRequired,
    productShippedAt: d.productShippedAt ?? null,
    productReceivedAt: d.productReceivedAt ?? null,
    awbNumber: d.awbNumber ?? null,
    courierName: d.courierName ?? null,
    shipDate: d.shipDate ?? null,
    deliveryAddress: d.deliveryAddress ?? null,
    deliveryAddressPhone: d.delivery_address_phone ?? null,
    receivedMarkedBy: d.receivedMarkedBy ?? null,
    requireCourierAwb: d.requireCourierAwb ?? false,
    addressLocked: d.address_locked ?? false,
    awbLocked: d.awb_locked ?? false,
    // Product issue state
    productIssueRaised: d.product_issue_raised ?? false,
    productIssueImages: d.product_issue_images ?? null,
    productIssueDescription: d.product_issue_description ?? null,
    productIssueResponse: d.product_issue_response ?? null,
    creatorIssueDecision: d.creator_issue_decision ?? null,
    productIssueStatus: d.productIssueStatus ?? null,
    reshipCount: d.reship_count ?? 0,
    makeItOptionAvailable: d.make_it_option_available ?? true,
    brandResponseDeadline: d.brand_response_deadline ?? null,
    // AWB wrong state
    awbCorrectionCount: d.awb_correction_count ?? 0,
    awbWrongRaisedAt: d.awb_wrong_raised_at ?? null,
    awbWrongDeadline: d.awb_wrong_deadline ?? null,
    // Non-delivery state
    nonDeliveryReportedAt: d.non_delivery_reported_at ?? null,
    nonDeliveryResolution: d.non_delivery_resolution ?? null,
    deliveryExtensionCount: d.delivery_extension_count ?? 0,
    deliveryExtendedUntil: d.delivery_extended_until ?? null,
    // Snapshot config (frontend can show these to the user)
    maxDeliveryDays: d.max_delivery_days_snapshot ?? null,
    deliveryWarningDay: d.delivery_warning_day_snapshot ?? null,
    maxDeliveryExtensions: d.max_delivery_extensions_snapshot ?? null,
    brandResponseHours: d.brand_response_hours_snapshot ?? null,
    awbCorrectionLimit: d.awb_correction_limit_snapshot ?? null,
    postedBy: d.postedBy ?? "CREATOR",
    conceptApprovedAt: d.conceptApprovedAt ?? null,
    contentApprovedAt: d.contentApprovedAt ?? null,
    finalPostConfirmedAt: d.finalPostConfirmedAt ?? null,
    completedAt: d.completedAt ?? null,
    disputeWindowEnd: d.disputeWindowEnd ?? null,
    disputeRaised: d.disputeRaised ?? false,
    disputeRaisedAt: d.disputeRaisedAt ?? null,
    disputeOutcome: d.disputeOutcome ?? null,
    payoutStatus: d.payoutStatus ?? "PENDING",
    payoutReleasedAt: d.payoutReleasedAt ?? null,
    payoutReferenceId: d.payoutReferenceId ?? null,
    paymentReferenceId: d.paymentReferenceId,
    barterProductName: d.barterProductName ?? null,
    barterProductValue: d.barterProductValue != null ? num(d.barterProductValue) : null,
    productImageUrl: d.productImageUrl ?? null,
    orderId: d.orderId ?? null,
    createdAt: d.createdAt,
    creator: d.creatorName ? {
      id: d.creatorId, fullName: d.creatorName,
      instagramHandle: d.instagramHandle, profilePhotoUrl: d.profilePhotoUrl,
      followerCount: d.followerCount,
    } : null,
  };
}

export default router;
