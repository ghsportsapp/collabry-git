import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { requireCreator } from "../middleware/requireCreator";
import { requireAdmin } from "../middleware/requireAdmin";
import { createNotification } from "../lib/notifications";
import { createSystemMessage } from "../lib/dealChat";
import { createPopup } from "../lib/popups";

const router: IRouter = Router();

// ── Helpers ──
async function verifyParticipant(
  dealId: string,
  participantId: string,
  participantType: "BRAND" | "CREATOR"
): Promise<{ ok: boolean; row?: any }> {
  const col = participantType === "BRAND" ? '"brandId"' : '"creatorId"';
  const r = await pool.query(`SELECT * FROM "Deal" WHERE id=$1 AND ${col}=$2`, [dealId, participantId]);
  if (r.rows.length === 0) return { ok: false };
  return { ok: true, row: r.rows[0] };
}

function strNonEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function snapshotPercents(deal: any): {
  nonDeliveryBrand: number; nonDeliveryCreator: number; nonDeliveryCollabry: number;
  fakeAwbBrand: number; fakeAwbCreator: number; fakeAwbCollabry: number;
  disputeValidBrand: number;
} {
  const def = {
    nonDeliveryBrand: 50, nonDeliveryCreator: 20, nonDeliveryCollabry: 30,
    fakeAwbBrand: 70, fakeAwbCreator: 20, fakeAwbCollabry: 10,
    disputeValidBrand: 50,
  };
  const raw = deal.percent_split_snapshot;
  if (!raw) return def;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { ...def, ...parsed };
  } catch { return def; }
}

async function notifyAdminAlert(opts: { dealId: string; type: string; title: string; body: string }): Promise<void> {
  // Admins poll GET /admin/non-delivery-alerts and similar listing endpoints to see pending issues.
  // We log an entry into AdminActionLog so admins have an audit trail of when alerts fired.
  try {
    await pool.query(
      `INSERT INTO "AdminActionLog" (id,"adminId","action","entityType","entityId","details","createdAt")
       VALUES (gen_random_uuid(),'system',$1,'Deal',$2,$3,NOW())`,
      [`ALERT_${opts.type}`, opts.dealId, JSON.stringify({ title: opts.title, body: opts.body })]
    );
  } catch {
    // Best-effort — do not block the user-facing flow if admin logging fails
  }
}

// =====================================================
// PRODUCT ISSUE FLOW
// =====================================================

// Creator raises product issue with images + description
router.post("/creator/deals/:id/product-issue", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const v = await verifyParticipant(id, creatorId, "CREATOR");
  if (!v.ok || !v.row) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = v.row;

  if (!deal.productRequired) { res.status(400).json({ error: "This deal does not require product shipping." }); return; }
  if (!deal.productShippedAt) { res.status(400).json({ error: "Brand has not shipped the product yet." }); return; }
  if (deal.productReceivedAt) { res.status(400).json({ error: "You already accepted the product." }); return; }
  if (deal.creator_issue_decision === "PROCEED") {
    res.status(400).json({ error: "You already accepted to work with this product. No more issues can be raised." }); return;
  }
  if (deal.product_issue_raised && !deal.issue_resolved_at) {
    res.status(400).json({ error: "An issue is already open for this deal. Wait for the brand to respond." }); return;
  }
  if (deal.status !== "PRODUCT_SHIPPED") {
    res.status(400).json({ error: `Cannot raise issue in status ${deal.status}` }); return;
  }

  const { images, description } = req.body ?? {};
  const desc = strNonEmpty(description);
  if (!desc) { res.status(400).json({ error: "Please describe the issue." }); return; }
  if (desc.length > 2000) { res.status(400).json({ error: "Description too long (max 2000 chars)." }); return; }
  if (!Array.isArray(images) || images.length < 1) {
    res.status(400).json({ error: "Please upload at least 1 image showing the issue." }); return;
  }
  if (images.length > 3) { res.status(400).json({ error: "Maximum 3 images allowed." }); return; }
  // Validate image references — accepts private storage paths (preferred),
  // legacy data: URLs, or absolute http(s) URLs.
  for (const img of images) {
    if (typeof img !== "string" || img.length < 10) { res.status(400).json({ error: "Invalid image data." }); return; }
    if (img.length > 5_500_000) { res.status(400).json({ error: "Each image must be smaller than 4MB." }); return; }
    const lower = img.slice(0, 64).toLowerCase();
    const isPrivatePath = img.startsWith("/api/storage/private/");
    const isData = lower.startsWith("data:image/jpeg") || lower.startsWith("data:image/jpg") || lower.startsWith("data:image/png");
    const isHttp = lower.startsWith("http://") || lower.startsWith("https://");
    if (!isPrivatePath && !isData && !isHttp) { res.status(400).json({ error: "Only JPG/PNG images are allowed." }); return; }
  }

  await pool.query(
    `UPDATE "Deal"
     SET status='PRODUCT_ISSUE_RAISED',
         "product_issue_raised"=true,
         "product_issue_images"=$2,
         "product_issue_description"=$3,
         "product_issue_response"=NULL,
         "creator_issue_decision"=NULL,
         "issue_resolved_at"=NULL,
         "brand_response_deadline"=NULL,
         "productIssueStatus"='PENDING_BRAND_RESPONSE'
     WHERE id=$1`,
    [id, images, desc]
  );

  await createSystemMessage(
    id,
    `⚠️ Creator raised a product issue.\n${desc}`,
    { kind: "PRODUCT_ISSUE", images, description: desc }
  );
  await createNotification({
    userId: deal.brandId, userType: "BRAND", type: "PRODUCT_ISSUE_RAISED",
    title: "Creator raised a product issue",
    body: `Creator has reported a product issue. Please review and respond — Reship, ask creator to make do, or cancel the deal.`,
    relatedEntityType: "Deal", relatedEntityId: id,
    emailParams: { issue: desc },
  });

  res.json({ ok: true });
});

// Brand responds to product issue
router.post("/brand/deals/:id/product-issue/respond", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const v = await verifyParticipant(id, brandId, "BRAND");
  if (!v.ok || !v.row) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = v.row;

  if (!deal.product_issue_raised || deal.issue_resolved_at) {
    res.status(400).json({ error: "No active product issue to respond to." }); return;
  }
  if (deal.status !== "PRODUCT_ISSUE_RAISED") {
    res.status(400).json({ error: `Cannot respond in status ${deal.status}` }); return;
  }

  const { action, awbNumber, courierName, shipDate } = req.body ?? {};
  if (action !== "RESHIP" && action !== "MAKE_IT" && action !== "CANCEL") {
    res.status(400).json({ error: "Invalid action. Must be RESHIP, MAKE_IT, or CANCEL." }); return;
  }
  if (action === "RESHIP" && deal.reship_count >= 1) {
    res.status(400).json({ error: "Maximum 1 reship per deal. Choose 'Make it with this product' or Cancel." }); return;
  }

  if (action === "RESHIP") {
    const awbT = strNonEmpty(awbNumber);
    const courierT = strNonEmpty(courierName);
    const shipDateT = strNonEmpty(shipDate);
    if (!awbT || !courierT || !shipDateT) {
      res.status(400).json({ error: "AWB, courier, and ship date are all required to reship." }); return;
    }

    await pool.query(
      `UPDATE "Deal"
       SET status='PRODUCT_SHIPPED',
           "awbNumber"=$2,
           "courierName"=$3,
           "shipDate"=$4,
           "productShippedAt"=NOW(),
           "product_issue_raised"=false,
           "product_issue_response"='RESHIP',
           "creator_issue_decision"=NULL,
           "issue_resolved_at"=NOW(),
           "reship_count"="reship_count"+1,
           "make_it_option_available"=false,
           "brand_response_deadline"=NULL,
           "awb_locked"=false,
           "awb_correction_count"=0,
           "productIssueStatus"='RESOLVED_RESHIP'
       WHERE id=$1`,
      [id, awbT, courierT, shipDateT]
    );

    await createSystemMessage(
      id,
      `📦 Brand reshipped the product. New AWB: ${awbT} via ${courierT} (shipped ${shipDateT}).`,
      { kind: "RESHIP", awbNumber: awbT, courierName: courierT, shipDate: shipDateT }
    );
    await createNotification({
      userId: deal.creatorId, userType: "CREATOR", type: "PRODUCT_RESHIPPED",
      title: "Brand reshipped the product",
      body: `New AWB: ${awbT} via ${courierT}. Shipped on ${shipDateT}.`,
      relatedEntityType: "Deal", relatedEntityId: id,
      emailParams: { awb: awbT },
    });
    res.json({ ok: true, action: "RESHIP" });
    return;
  }

  if (action === "MAKE_IT") {
    await pool.query(
      `UPDATE "Deal"
       SET status='AWAITING_CREATOR_ISSUE_DECISION',
           "product_issue_response"='MAKE_IT',
           "brand_response_deadline"=NULL,
           "productIssueStatus"='AWAITING_CREATOR_DECISION'
       WHERE id=$1`,
      [id]
    );
    await createSystemMessage(
      id,
      `💬 Brand asks creator to work with the product as is. Creator, please confirm whether you can proceed.`,
      { kind: "MAKE_IT_REQUEST" }
    );
    await createNotification({
      userId: deal.creatorId, userType: "CREATOR", type: "MAKE_IT_REQUEST",
      title: "Brand wants you to work with this product",
      body: `The brand is asking you to work with the product as-is. Please confirm whether you can proceed.`,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
    res.json({ ok: true, action: "MAKE_IT" });
    return;
  }

  // CANCEL
  await pool.query(
    `UPDATE "Deal"
     SET status='CANCELLED',
         "product_issue_response"='CANCEL',
         "issue_resolved_at"=NOW(),
         "cancelledAt"=NOW(),
         "cancelledByType"='BRAND_ISSUE_CANCEL',
         "rejectionReason"='Brand cancelled deal after product issue',
         "escrowStatus"='REFUNDED',
         "brand_response_deadline"=NULL,
         "productIssueStatus"='RESOLVED_CANCELLED'
     WHERE id=$1`,
    [id]
  );
  await createSystemMessage(
    id,
    `❌ Brand cancelled the deal after product issue. Full refund issued. The deal is closed.`,
    { kind: "ISSUE_CANCEL" }
  );
  await createNotification({
    userId: deal.creatorId, userType: "CREATOR", type: "DEAL_CANCELLED",
    title: "Brand cancelled the deal",
    body: `Brand cancelled after product issue. Full refund processed for the brand.`,
    relatedEntityType: "Deal", relatedEntityId: id,
    emailTemplateId: 49, emailSubject: "Deal cancelled",
  });
  const { handleCampaignDealCancelled } = await import("./campaigns");
  await handleCampaignDealCancelled(id as string);
  res.json({ ok: true, action: "CANCEL" });
});

// Creator decides on MAKE_IT
router.post("/creator/deals/:id/issue-decision", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const v = await verifyParticipant(id, creatorId, "CREATOR");
  if (!v.ok || !v.row) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = v.row;
  if (deal.status !== "AWAITING_CREATOR_ISSUE_DECISION") {
    res.status(400).json({ error: "No pending make-it decision for this deal." }); return;
  }
  const { decision } = req.body ?? {};
  if (decision !== "PROCEED" && decision !== "CANNOT_PROCEED") {
    res.status(400).json({ error: "Decision must be PROCEED or CANNOT_PROCEED." }); return;
  }

  if (decision === "PROCEED") {
    await pool.query(
      `UPDATE "Deal"
       SET status='PRODUCT_RECEIVED',
           "productReceivedAt"=NOW(),
           "receivedMarkedBy"=$2,
           "timelineStartAt"=NOW(),
           "deadlineAt"=NOW() + ("timelineDays" || ' days')::interval,
           "creator_issue_decision"='PROCEED',
           "issue_resolved_at"=NOW(),
           "product_issue_raised"=false,
           "productIssueStatus"='RESOLVED_PROCEED'
       WHERE id=$1`,
      [id, creatorId]
    );
    await createSystemMessage(id, `✅ Creator agreed to work with the product. Timeline started.`, { kind: "ISSUE_PROCEED" });
    await createNotification({
      userId: deal.brandId, userType: "BRAND", type: "ISSUE_RESOLVED_PROCEED",
      title: "Creator agreed to work with the product",
      body: `The deal timeline has started.`,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
    res.json({ ok: true, decision: "PROCEED" });
    return;
  }

  // CANNOT_PROCEED — back to PRODUCT_ISSUE_RAISED, brand must choose Make It or Cancel
  await pool.query(
    `UPDATE "Deal"
     SET status='PRODUCT_ISSUE_RAISED',
         "creator_issue_decision"='CANNOT_PROCEED',
         "make_it_option_available"=false,
         "product_issue_response"=NULL,
         "brand_response_deadline"=NULL,
         "productIssueStatus"='PENDING_BRAND_RESPONSE'
     WHERE id=$1`,
    [id]
  );
  await createSystemMessage(
    id,
    `❌ Creator cannot work with this product as-is. Brand, please choose to ask again or cancel the deal.`,
    { kind: "CANNOT_PROCEED" }
  );
  await createNotification({
    userId: deal.brandId, userType: "BRAND", type: "CREATOR_CANNOT_PROCEED",
    title: "Creator cannot work with the product",
    body: `Creator has declined to work with the product. Please review and decide how to proceed.`,
    relatedEntityType: "Deal", relatedEntityId: id,
  });
  res.json({ ok: true, decision: "CANNOT_PROCEED" });
});

// Fix 3: Creator auto-cancels deal after reship (with confirmed warning)
router.post("/creator/deals/:id/product-issue-auto-cancel", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const v = await verifyParticipant(id, creatorId, "CREATOR");
  if (!v.ok || !v.row) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = v.row;

  if (deal.status !== "PRODUCT_SHIPPED") {
    res.status(400).json({ error: "Deal is not in a state where auto-cancel is allowed." }); return;
  }
  if ((deal.reship_count ?? 0) < 1) {
    res.status(400).json({ error: "No reship has occurred on this deal." }); return;
  }

  await pool.query(
    `UPDATE "Deal"
     SET status='CANCELLED',
         "cancelledAt"=NOW(),
         "cancelledByType"='CREATOR_POST_RESHIP_CANCEL',
         "rejectionReason"='Deal cancelled after repeated product issues',
         "escrowStatus"='REFUNDED',
         "product_issue_raised"=false,
         "issue_resolved_at"=NOW(),
         "productIssueStatus"='RESOLVED_CANCELLED'
     WHERE id=$1`,
    [id]
  );

  await createSystemMessage(
    id,
    `❌ Deal cancelled after repeated product issues. Full refund issued.`,
    { kind: "AUTO_CANCEL_RESHIP" }
  );
  await createNotification({
    userId: deal.creatorId, userType: "CREATOR", type: "DEAL_CANCELLED",
    title: "Deal cancelled",
    body: `Deal cancelled after repeated product issues. Full refund has been processed for the brand.`,
    relatedEntityType: "Deal", relatedEntityId: id,
    emailTemplateId: 49, emailSubject: "Deal cancelled",
  });
  await createNotification({
    userId: deal.brandId, userType: "BRAND", type: "DEAL_CANCELLED",
    title: "Deal cancelled after repeated product issues",
    body: `The creator was unable to proceed after the reship. Full refund processed.`,
    relatedEntityType: "Deal", relatedEntityId: id,
    emailTemplateId: 50, emailSubject: "Deal cancelled",
  });

  const { handleCampaignDealCancelled } = await import("./campaigns");
  await handleCampaignDealCancelled(id as string);
  res.json({ ok: true });
});

// =====================================================
// AWB WRONG FLOW
// =====================================================

router.post("/creator/deals/:id/awb-wrong", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const v = await verifyParticipant(id, creatorId, "CREATOR");
  if (!v.ok || !v.row) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = v.row;

  if (deal.status !== "PRODUCT_SHIPPED") { res.status(400).json({ error: `AWB-wrong claims are only allowed while the deal is in PRODUCT_SHIPPED state (current: ${deal.status}).` }); return; }
  if (!deal.productShippedAt) { res.status(400).json({ error: "Product has not been shipped yet." }); return; }
  if (deal.productReceivedAt) { res.status(400).json({ error: "Product already received." }); return; }
  if (deal.awb_locked) { res.status(400).json({ error: "Brand has confirmed the AWB is correct. No further claims allowed." }); return; }
  if (deal.awb_wrong_deadline && new Date(deal.awb_wrong_deadline) > new Date()) {
    res.status(400).json({ error: "An AWB-wrong claim is already pending — wait for the brand to respond." }); return;
  }

  const responseHours = deal.brand_response_hours_snapshot ?? 48;
  const upd = await pool.query(
    `UPDATE "Deal"
     SET "awb_wrong_raised_at"=NOW(),
         "awb_wrong_deadline"=NOW() + ($2 || ' hours')::interval
     WHERE id=$1
       AND status='PRODUCT_SHIPPED'
       AND ("awb_locked" IS NOT TRUE)
       AND ("awb_wrong_deadline" IS NULL OR "awb_wrong_deadline" <= NOW())`,
    [id, responseHours]
  );
  if (upd.rowCount === 0) { res.status(409).json({ error: "Deal state changed — please refresh and try again." }); return; }
  await createSystemMessage(
    id,
    `⚠️ Creator reports the AWB looks incorrect. Brand has ${responseHours} hours to respond — Update the AWB or confirm it is correct. No response = deal auto-cancels.`,
    { kind: "AWB_WRONG" }
  );
  await createNotification({
    userId: deal.brandId, userType: "BRAND", type: "AWB_WRONG_RAISED",
    title: "Creator says the AWB is wrong",
    body: `Respond within ${responseHours} hours — update AWB or confirm it is correct. No response will auto-cancel the deal.`,
    relatedEntityType: "Deal", relatedEntityId: id,
    emailParams: { awb: deal.awbNumber ?? "" },
  });
  res.json({ ok: true });
});

router.post("/brand/deals/:id/awb-wrong/respond", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const v = await verifyParticipant(id, brandId, "BRAND");
  if (!v.ok || !v.row) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = v.row;

  if (deal.status !== "PRODUCT_SHIPPED") { res.status(400).json({ error: `AWB-wrong responses are only allowed while the deal is in PRODUCT_SHIPPED state (current: ${deal.status}).` }); return; }
  if (!deal.awb_wrong_raised_at || deal.awb_locked) {
    res.status(400).json({ error: "No active AWB-wrong claim to respond to." }); return;
  }
  const { action, awbNumber, courierName } = req.body ?? {};
  if (action !== "UPDATE" && action !== "CONFIRM") {
    res.status(400).json({ error: "Action must be UPDATE or CONFIRM." }); return;
  }

  if (action === "CONFIRM") {
    const upd = await pool.query(
      `UPDATE "Deal"
       SET "awb_locked"=true,
           "awb_wrong_deadline"=NULL,
           "awb_wrong_raised_at"=NULL
       WHERE id=$1
         AND status='PRODUCT_SHIPPED'
         AND "awb_wrong_raised_at" IS NOT NULL
         AND ("awb_locked" IS NOT TRUE)`,
      [id]
    );
    if (upd.rowCount === 0) { res.status(409).json({ error: "Deal state changed — please refresh and try again." }); return; }
    await createSystemMessage(id, `✅ Brand confirmed the AWB is correct. Use the tracking link to check the shipment.`, { kind: "AWB_CONFIRMED" });
    await createNotification({
      userId: deal.creatorId, userType: "CREATOR", type: "AWB_CONFIRMED",
      title: "Brand confirmed the AWB is correct",
      body: `Please use the tracking link to check your shipment status. No more AWB-wrong claims allowed for this deal.`,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
    res.json({ ok: true, action: "CONFIRM" });
    return;
  }

  // UPDATE
  const awbT = strNonEmpty(awbNumber);
  const courierT = strNonEmpty(courierName);
  if (!awbT || !courierT) { res.status(400).json({ error: "AWB number and courier name are required." }); return; }

  const limit = deal.awb_correction_limit_snapshot ?? 2;
  const newCount = (deal.awb_correction_count ?? 0) + 1;
  if (newCount > limit) {
    // Auto-escalate to admin
    await notifyAdminAlert({
      dealId: id, type: "AWB_CORRECTION_LIMIT_REACHED",
      title: `AWB corrections exceeded on deal ${id.slice(0, 8)}`,
      body: `Brand attempted ${newCount} AWB corrections (limit ${limit}). Manual review required.`,
    });
    res.status(400).json({ error: `Maximum ${limit} AWB corrections per deal already used. Admin has been notified.` });
    return;
  }

  const upd = await pool.query(
    `UPDATE "Deal"
     SET "awbNumber"=$2,
         "courierName"=$3,
         "awb_correction_count"=$4,
         "awb_wrong_raised_at"=NULL,
         "awb_wrong_deadline"=NULL,
         "shipDate"=COALESCE("shipDate", CURRENT_DATE)
     WHERE id=$1
       AND status='PRODUCT_SHIPPED'
       AND "awb_wrong_raised_at" IS NOT NULL
       AND ("awb_locked" IS NOT TRUE)`,
    [id, awbT, courierT, newCount]
  );
  if (upd.rowCount === 0) { res.status(409).json({ error: "Deal state changed — please refresh and try again." }); return; }
  await createSystemMessage(
    id,
    `🔄 Brand updated the AWB. New AWB: ${awbT} via ${courierT}. (Correction ${newCount} of ${limit})`,
    { kind: "AWB_UPDATED", awbNumber: awbT, courierName: courierT, count: newCount, limit }
  );
  await createNotification({
    userId: deal.creatorId, userType: "CREATOR", type: "AWB_UPDATED",
    title: "Brand updated the AWB",
    body: `New AWB: ${awbT} via ${courierT}.`,
    relatedEntityType: "Deal", relatedEntityId: id,
    emailParams: { awb: awbT },
  });
  res.json({ ok: true, action: "UPDATE", correctionCount: newCount, limit });
});

// =====================================================
// NON-DELIVERY FLOW
// =====================================================

router.post("/creator/deals/:id/not-received", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const v = await verifyParticipant(id, creatorId, "CREATOR");
  if (!v.ok || !v.row) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = v.row;

  if (deal.status !== "PRODUCT_SHIPPED") { res.status(400).json({ error: `Non-delivery can only be reported while the deal is in PRODUCT_SHIPPED state (current: ${deal.status}).` }); return; }
  if (!deal.productShippedAt || !deal.shipDate) { res.status(400).json({ error: "Product has not been shipped yet." }); return; }
  if (deal.productReceivedAt) { res.status(400).json({ error: "Product is already marked as received." }); return; }
  if (deal.non_delivery_reported_at) { res.status(400).json({ error: "Non-delivery is already being reviewed by admin." }); return; }
  if (deal.awb_wrong_deadline && new Date(deal.awb_wrong_deadline) > new Date()) { res.status(400).json({ error: "An AWB-wrong claim is currently active — wait for the brand to respond." }); return; }
  if (deal.product_issue_raised) { res.status(400).json({ error: "A product-issue is currently active on this deal." }); return; }

  const maxDays = deal.max_delivery_days_snapshot ?? 10;
  const referenceDate: Date = deal.delivery_extended_until ? new Date(deal.delivery_extended_until) : new Date(deal.shipDate);
  const now = new Date();
  if (deal.delivery_extended_until) {
    if (now < referenceDate) {
      res.status(400).json({ error: "Delivery deadline has been extended — please wait until the new expected date." }); return;
    }
  } else {
    const daysSinceShip = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceShip < maxDays) {
      res.status(400).json({ error: `You can only report non-delivery on or after day ${maxDays} (currently day ${daysSinceShip}).` }); return;
    }
  }

  await pool.query(
    `UPDATE "Deal"
     SET status='NON_DELIVERY_REPORTED',
         "non_delivery_reported_at"=NOW()
     WHERE id=$1`,
    [id]
  );
  await createSystemMessage(
    id,
    `🚨 Creator reports product not delivered. Admin has been notified to review and resolve.`,
    { kind: "NON_DELIVERY_REPORTED", awbNumber: deal.awbNumber, courierName: deal.courierName }
  );
  await notifyAdminAlert({
    dealId: id, type: "NON_DELIVERY_REPORTED",
    title: `Non-delivery reported on deal ${id.slice(0, 8)}`,
    body: `Creator reports the product never arrived. AWB: ${deal.awbNumber} via ${deal.courierName}. Shipped: ${deal.shipDate}.`,
  });
  res.json({ ok: true });
});

// Admin extends delivery
router.post("/admin/deals/:id/extend-delivery", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const dr = await pool.query(`SELECT * FROM "Deal" WHERE id=$1`, [id]);
  if (dr.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = dr.rows[0];

  if (!deal.non_delivery_reported_at) { res.status(400).json({ error: "No active non-delivery report on this deal." }); return; }
  const { days } = req.body ?? {};
  const n = parseInt(String(days), 10);
  if (isNaN(n) || n < 1 || n > 60) { res.status(400).json({ error: "Days must be a number between 1 and 60." }); return; }

  const maxExt = deal.max_delivery_extensions_snapshot ?? 2;
  const newCount = (deal.delivery_extension_count ?? 0) + 1;
  if (newCount > maxExt) {
    res.status(400).json({ error: `Maximum ${maxExt} extensions already granted. Choose Genuine or Fake AWB instead.` }); return;
  }

  // Calculate new "extended until" from the later of: current extended_until, or shipDate + maxDays
  const baseDate = deal.delivery_extended_until
    ? new Date(deal.delivery_extended_until)
    : new Date(new Date(deal.shipDate).getTime() + (deal.max_delivery_days_snapshot ?? 10) * 86400000);
  const extendedUntil = new Date(baseDate.getTime() + n * 86400000);

  await pool.query(
    `UPDATE "Deal"
     SET status='PRODUCT_SHIPPED',
         "non_delivery_reported_at"=NULL,
         "delivery_extension_count"=$2,
         "delivery_extended_until"=$3
     WHERE id=$1`,
    [id, newCount, extendedUntil]
  );
  await createSystemMessage(
    id,
    `📅 Admin extended the delivery window by ${n} days. New expected date: ${extendedUntil.toISOString().slice(0, 10)} (extension ${newCount} of ${maxExt}).`,
    { kind: "DELIVERY_EXTENDED", days: n, count: newCount, limit: maxExt, until: extendedUntil.toISOString() }
  );
  for (const u of [{ id: deal.brandId, type: "BRAND" as const }, { id: deal.creatorId, type: "CREATOR" as const }]) {
    await createNotification({
      userId: u.id, userType: u.type, type: "DELIVERY_EXTENDED",
      title: "Delivery extended",
      body: `Admin extended the delivery by ${n} days. New expected: ${extendedUntil.toISOString().slice(0, 10)}.`,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
  }
  res.json({ ok: true, days: n, extensionCount: newCount, limit: maxExt, extendedUntil });
});

// Admin resolves non-delivery: GENUINE or FAKE_AWB
router.post("/admin/deals/:id/non-delivery-resolve", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string | undefined;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Deal id required" }); return; }
  const dr = await pool.query(`SELECT * FROM "Deal" WHERE id=$1`, [id]);
  if (dr.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
  const deal = dr.rows[0];

  if (!deal.non_delivery_reported_at) { res.status(400).json({ error: "No active non-delivery report on this deal." }); return; }
  const { resolution } = req.body ?? {};
  if (resolution !== "GENUINE" && resolution !== "FAKE_AWB") {
    res.status(400).json({ error: "Resolution must be GENUINE or FAKE_AWB." }); return;
  }

  const splits = snapshotPercents(deal);
  const useGenuine = resolution === "GENUINE";
  const brandPct = useGenuine ? splits.nonDeliveryBrand : splits.fakeAwbBrand;
  const creatorPct = useGenuine ? splits.nonDeliveryCreator : splits.fakeAwbCreator;
  const collabryPct = useGenuine ? splits.nonDeliveryCollabry : splits.fakeAwbCollabry;

  const upd = await pool.query(
    `UPDATE "Deal"
     SET status='CANCELLED',
         "non_delivery_resolution"=$2,
         "non_delivery_resolved_at"=NOW(),
         "cancelledAt"=NOW(),
         "cancelledByType"='ADMIN_NON_DELIVERY',
         "rejectionReason"=$3,
         "escrowStatus"='SPLIT_RESOLVED',
         "disputeResolvedBy"=$4
     WHERE id=$1
       AND status='NON_DELIVERY_REPORTED'
       AND "non_delivery_reported_at" IS NOT NULL
       AND "non_delivery_resolution" IS NULL`,
    [id, resolution,
     useGenuine
       ? `Non-delivery resolved as GENUINE — brand ${brandPct}%, creator ${creatorPct}%, Collabry ${collabryPct}%.`
       : `Non-delivery resolved as FAKE AWB — brand ${brandPct}%, creator ${creatorPct}%, Collabry ${collabryPct}%. Brand received warning strike.`,
     adminId ?? "system"]
  );
  if ((upd.rowCount ?? 0) > 0) {
    const { handleCampaignDealCancelled } = await import("./campaigns");
    await handleCampaignDealCancelled(id as string);
  }
  if (upd.rowCount === 0) { res.status(409).json({ error: "Non-delivery already resolved or deal state changed — please refresh." }); return; }

  if (!useGenuine) {
    await pool.query(`UPDATE "Brand" SET "warning_strikes" = COALESCE("warning_strikes", 0) + 1 WHERE id=$1`, [deal.brandId]);
  }

  const splitMsg = `Brand refund: ${brandPct}% • Creator payout: ${creatorPct}% • Collabry: ${collabryPct}%`;
  await createSystemMessage(
    id,
    useGenuine
      ? `📦 Admin resolution: GENUINE non-delivery (courier lost it). ${splitMsg}.`
      : `🚨 Admin resolution: FAKE AWB (brand cheated). ${splitMsg}. Warning strike logged on the brand.`,
    { kind: "NON_DELIVERY_RESOLVED", resolution, splits: { brand: brandPct, creator: creatorPct, collabry: collabryPct } }
  );

  const brandTitle = useGenuine
    ? "Deal Cancelled — Product Not Delivered"
    : "Deal Closed — Fake AWB Ruling";
  const brandBody = useGenuine
    ? `This deal was cancelled because the product was not delivered within the agreed timeline. Refund has been processed successfully. ${splitMsg}.`
    : `${splitMsg}. A warning strike has been logged on your account.`;
  const creatorTitle = useGenuine
    ? "Deal Cancelled — Product Not Delivered"
    : "Deal Closed — Admin Ruled Fake AWB";
  const creatorBody = useGenuine
    ? `This deal was cancelled because the product was not delivered within the agreed timeline. ${splitMsg}.`
    : `${splitMsg}.`;

  for (const u of [
    { id: deal.brandId, type: "BRAND" as const, title: brandTitle, body: brandBody },
    { id: deal.creatorId, type: "CREATOR" as const, title: creatorTitle, body: creatorBody },
  ]) {
    await createNotification({
      userId: u.id, userType: u.type, type: "NON_DELIVERY_RESOLVED",
      title: u.title, body: u.body,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
  }

  if (useGenuine) {
    await createPopup({
      userId: deal.brandId, userType: "BRAND", type: "DEAL_CANCELLED",
      title: "Deal Cancelled",
      body: "This deal was cancelled because the product was not delivered within the agreed timeline. Your refund has been processed successfully. Please find another creator for this collaboration.",
      ctaText: "View Cancelled Deal", ctaPath: "/home-brand/deals?tab=cancelled",
      isCelebration: false, relatedEntityId: id,
    });
    await createPopup({
      userId: deal.creatorId, userType: "CREATOR", type: "DEAL_CANCELLED",
      title: "Deal Cancelled",
      body: "This deal was cancelled because the product was not delivered within the agreed timeline.",
      ctaText: "View Details", ctaPath: "/home-creator/deals?tab=cancelled",
      isCelebration: false, relatedEntityId: id,
    });
  }

  res.json({ ok: true, resolution, splits: { brand: brandPct, creator: creatorPct, collabry: collabryPct } });
});

// Admin: list active non-delivery reports needing attention
router.get("/admin/non-delivery-alerts", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(
    `SELECT d.id, d."brandId", d."creatorId", d."awbNumber", d."courierName", d."shipDate",
            d."non_delivery_reported_at", d."delivery_extension_count",
            d."max_delivery_extensions_snapshot" AS "maxExtensions",
            d."max_delivery_days_snapshot", d."delivery_extended_until",
            d."totalPayable",
            CASE WHEN d."shipDate" IS NOT NULL
                 THEN EXTRACT(DAY FROM (NOW() - d."shipDate"::timestamp))::int
                 ELSE NULL END AS "daysSinceShip",
            b."brandName", c."fullName" AS "creatorName"
     FROM "Deal" d
     JOIN "Brand" b ON b.id=d."brandId"
     JOIN "Creator" c ON c.id=d."creatorId"
     WHERE d."non_delivery_reported_at" IS NOT NULL AND d.status='NON_DELIVERY_REPORTED'
     ORDER BY d."non_delivery_reported_at" ASC`
  );
  res.json({ alerts: r.rows });
});

// Admin: ban brand (visible only when warning_strikes >= 2)
router.post("/admin/brands/:id/ban", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string | undefined;
  const { id } = req.params as Record<string, string>;
  if (!id) { res.status(400).json({ error: "Brand id required" }); return; }
  const br = await pool.query(`SELECT id,"warning_strikes",status FROM "Brand" WHERE id=$1`, [id]);
  if (br.rows.length === 0) { res.status(404).json({ error: "Brand not found" }); return; }
  if ((br.rows[0].warning_strikes ?? 0) < 2) {
    res.status(400).json({ error: "Brand has fewer than 2 warning strikes — ban not available." }); return;
  }
  const { reason } = req.body ?? {};
  await pool.query(
    `UPDATE "Brand" SET status='SUSPENDED', "suspendedAt"=NOW(), "suspendedBy"=$2, "suspendedReason"=$3 WHERE id=$1`,
    [id, adminId ?? "system", strNonEmpty(reason) || "Multiple fake-AWB rulings"]
  );
  res.json({ ok: true });
});

export default router;
