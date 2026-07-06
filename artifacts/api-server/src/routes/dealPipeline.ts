import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { requireCreator } from "../middleware/requireCreator";
import { requireAdmin } from "../middleware/requireAdmin";
import { createSystemMessage } from "../lib/dealChat";
import { createNotification } from "../lib/notifications";
import { createPopup } from "../lib/popups";
import {
  recordSubmission,
  markLatestSubmissionOutcome,
  listSubmissionsForDeal,
} from "../lib/dealSubmissions";

const router: IRouter = Router();

// =====================================================
// HELPERS
// =====================================================

function isValidUrl(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length > 0 && t.includes(".");
}

function isValidPlatformUrl(s: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof s !== "string") return { ok: false, reason: "URL is required" };
  const t = s.trim();
  if (t.length === 0 || !t.includes(".")) return { ok: false, reason: "Please enter a valid URL (e.g. drive.google.com/...)" };
  return { ok: true };
}

async function verifyDeal(
  dealId: string,
  participantId: string | null,
  participantType: "BRAND" | "CREATOR" | "ADMIN"
): Promise<{ ok: boolean; deal?: any }> {
  let q: string;
  let params: any[];
  if (participantType === "ADMIN") {
    q = `SELECT * FROM "Deal" WHERE id=$1`;
    params = [dealId];
  } else {
    const col = participantType === "BRAND" ? '"brandId"' : '"creatorId"';
    q = `SELECT * FROM "Deal" WHERE id=$1 AND ${col}=$2`;
    params = [dealId, participantId];
  }
  const r = await pool.query(q, params);
  if (r.rows.length === 0) return { ok: false };
  return { ok: true, deal: r.rows[0] };
}

async function getDealParticipants(dealId: string): Promise<{ brandId: string; creatorId: string } | null> {
  const r = await pool.query(`SELECT "brandId","creatorId" FROM "Deal" WHERE id=$1`, [dealId]);
  if (r.rows.length === 0) return null;
  return { brandId: r.rows[0].brandId, creatorId: r.rows[0].creatorId };
}

async function recalculateCreatorRating(creatorId: string): Promise<void> {
  const r = await pool.query(
    `SELECT COALESCE(AVG(rating)::numeric(3,2),0) AS avg, COUNT(*)::int AS cnt
     FROM "CreatorRating" WHERE "creatorId"=$1 AND "deletedAt" IS NULL`,
    [creatorId]
  );
  const avg = parseFloat(r.rows[0].avg);
  const cnt = parseInt(r.rows[0].cnt, 10);
  await pool.query(
    `UPDATE "Creator" SET "averageRating"=$2, "ratingCount"=$3 WHERE id=$1`,
    [creatorId, cnt > 0 ? avg : null, cnt]
  );
}

// Revision count is now informational only — there is no hard cap. Brand may
// request unlimited revisions; creator may freely exit the deal at the concept
// stage with a 100% brand refund (see /exit-at-concept).

// Statuses where concept submission/approval flow is active.
const CONCEPT_STATUSES = ["IN_ESCROW", "CONCEPT_SUBMITTED", "REVISION_REQUESTED"];
// Statuses where content submission is allowed (after concept approved + product step if any).
const CONTENT_READY_STATUSES = ["CONCEPT_APPROVED", "PRODUCT_RECEIVED", "IN_PROGRESS", "CONTENT_UPLOADED", "REVISION_REQUESTED"];

function serializeDeliverable(d: any) {
  return {
    id: d.id,
    dealId: d.dealId,
    type: d.type,
    slotLabel: d.slotLabel,
    conceptUrl: d.conceptUrl ?? null,
    conceptStatus: d.conceptStatus,
    conceptRevisionCount: d.conceptRevisionCount ?? 0,
    conceptRevisionReason: d.conceptRevisionReason ?? null,
    conceptRevisionBrief: d.conceptRevisionBrief ?? null,
    finalUrl: d.finalUrl ?? null,
    finalStatus: d.finalStatus,
    finalRevisionCount: d.finalRevisionCount ?? 0,
    finalRevisionReason: d.finalRevisionReason ?? null,
    finalRevisionBrief: d.finalRevisionBrief ?? null,
    livePostUrl: d.livePostUrl ?? null,
    livePostFlagged: d.livePostFlagged ?? false,
    livePostResubmissionCount: d.livePostResubmissionCount ?? 0,
    livePostAdminOverride: d.livePostAdminOverride ?? false,
    storyAutoConfirmed: d.storyAutoConfirmed ?? false,
    livePostConfirmedByBrand: d.livePostConfirmedByBrand ?? false,
  };
}

async function markAllConfirmedIfReady(id: string): Promise<boolean> {
  const all = await pool.query(`SELECT "livePostConfirmedByBrand", "storyAutoConfirmed", type FROM "DealDeliverable" WHERE "dealId"=$1`, [id]);
  const allDone = all.rows.every((r: any) => r.livePostConfirmedByBrand || r.storyAutoConfirmed);
  if (!allDone) return false;
  await pool.query(
    `UPDATE "Deal" SET status='DISPUTE_WINDOW_OPEN', "disputeWindowEnd"=NOW() + INTERVAL '7 days' WHERE id=$1`,
    [id]
  );
  await createSystemMessage(id, `✅ All live posts verified. 7-day dispute window has started. Payout will be released after the window.`);
  const p = await getDealParticipants(id);
  if (p) {
    const kycRes = await pool.query(`SELECT "kycStatus" FROM "Creator" WHERE id=$1`, [p.creatorId]);
    const kycOk = kycRes.rows[0]?.kycStatus === "VERIFIED";
    await Promise.all([
      createNotification({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_FINAL_POST_CONFIRMED",
        title: "All posts confirmed — dispute window open",
        body: "⚠️ Do not delete your posted content within 7 days of deal completion. Deleting content can lead to your payment being stopped and your account being banned. You will receive your payout once the 7-day dispute window closes.",
        relatedEntityType: "DEAL", relatedEntityId: id,
        emailTemplateId: 37, emailSubject: "All posts confirmed",
      }),
      createNotification({
        userId: p.brandId, userType: "BRAND", type: "DEAL_FINAL_POST_CONFIRMED",
        title: "All posts verified — 7-day window started",
        body: "If the creator deletes the posted content within 7 days of deal completion, you can raise a dispute from the deal page. The dispute window closes automatically after 7 days.",
        relatedEntityType: "DEAL", relatedEntityId: id,
        emailTemplateId: 38, emailSubject: "All posts verified",
      }),
      createPopup(kycOk ? {
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_COMPLETED",
        title: "Deal Completed 🎉",
        body: "The brand approved your posts! ⚠️ Do not delete your posted content within 7 days of deal completion. Deleting content can lead to your payment being stopped and your account being banned. You will receive your payout once the 7-day dispute window closes.",
        ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
        isCelebration: true, relatedEntityId: id,
      } : {
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_COMPLETE_KYC_NEEDED",
        title: "Complete Your KYC to Get Paid",
        body: "Your deal is complete! ⚠️ Do not delete your posted content within 7 days of deal completion. Deleting content can lead to your payment being stopped and your account being banned. To receive your payout, please submit your KYC details.",
        ctaText: "Update KYC →", ctaPath: "/home-creator/profile#kyc",
        secondCtaText: "Later",
        isCelebration: false, relatedEntityId: id,
      }),
      createPopup({
        userId: p.brandId, userType: "BRAND", type: "DEAL_COMPLETED",
        title: "Deal Completed Successfully 🎉",
        body: "The collaboration is complete! If the creator deletes the posted content within 7 days of deal completion, you can raise a dispute from the deal page. The dispute window closes automatically after 7 days.",
        ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=live",
        isCelebration: true, relatedEntityId: id,
      }),
    ]);
  }
  return true;
}

// =====================================================
// GET DELIVERABLES (brand + creator)
// =====================================================

async function listDeliverables(req: Request, res: Response, who: "BRAND" | "CREATOR"): Promise<void> {
  const userId = (req as any)[who === "BRAND" ? "brandId" : "creatorId"] as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, userId, who);
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  const rows = await pool.query(
    `SELECT * FROM "DealDeliverable" WHERE "dealId"=$1
     ORDER BY CASE type WHEN 'REEL' THEN 1 WHEN 'STORY' THEN 2 WHEN 'POST' THEN 3 ELSE 9 END, "slotLabel"`,
    [id]
  );
  res.json({
    dealStatus: v.deal!.status,
    postedBy: v.deal!.postedBy ?? "CREATOR",
    productRequired: v.deal!.productRequired,
    productShippedAt: v.deal!.productShippedAt,
    productReceivedAt: v.deal!.productReceivedAt,
    timelineStartAt: v.deal!.timelineStartAt,
    deadlineAt: v.deal!.deadlineAt,
    disputeWindowEnd: v.deal!.disputeWindowEnd,
    disputeRaised: v.deal!.disputeRaised ?? false,
    payoutStatus: v.deal!.payoutStatus,
    livePostReviewDeadline: v.deal!.livePostReviewDeadline ?? null,
    deliverables: rows.rows.map(serializeDeliverable),
    submissions: await listSubmissionsForDeal(id!),
    creatorActionDueSince: v.deal!.creatorActionDueSince ?? null,
    conceptInactivityStage: v.deal!.conceptInactivityStage ?? 0,
    finalInactivityStage: v.deal!.finalInactivityStage ?? 0,
  });
}

router.get("/brand/deals/:id/deliverables", requireBrand, (req, res) => listDeliverables(req, res, "BRAND"));
router.get("/creator/deals/:id/deliverables", requireCreator, (req, res) => listDeliverables(req, res, "CREATOR"));

// =====================================================
// CONCEPT FLOW
// =====================================================

router.post("/creator/deals/:id/concept/submit", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!["IN_ESCROW", "REVISION_REQUESTED"].includes(v.deal!.status)) {
    res.status(400).json({ error: `Cannot submit concept in status ${v.deal!.status}` }); return;
  }
  const slots: { deliverableId: string; conceptUrl: string }[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
  const all = await pool.query(`SELECT * FROM "DealDeliverable" WHERE "dealId"=$1`, [id]);
  if (all.rows.length === 0) { res.status(400).json({ error: "No deliverables found for this deal" }); return; }
  const pendingIds = all.rows.filter(r => r.conceptStatus === "PENDING").map(r => r.id as string);
  if (pendingIds.length === 0) { res.status(400).json({ error: "All concepts have already been submitted" }); return; }
  const provided = new Map(slots.map(s => [s.deliverableId, s.conceptUrl]));
  for (const pid of pendingIds) {
    if (!provided.has(pid)) { res.status(400).json({ error: "Concept URL is required for every slot" }); return; }
    const chk = isValidPlatformUrl(provided.get(pid));
    if (!chk.ok) { res.status(400).json({ error: chk.reason }); return; }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const pid of pendingIds) {
      const url = provided.get(pid)!.trim();
      await client.query(
        `UPDATE "DealDeliverable" SET "conceptUrl"=$2, "conceptStatus"='SUBMITTED', "conceptSubmittedAt"=NOW() WHERE id=$1`,
        [pid, url]
      );
      await recordSubmission(client, { dealId: id!, deliverableId: pid, stage: "CONCEPT", url });
    }
    // Ball is now in brand's court — clear creator-pending tracking + reset nudge stage.
    await client.query(
      `UPDATE "Deal" SET status='CONCEPT_SUBMITTED',
                         "creatorActionDueSince"=NULL,
                         "conceptInactivityStage"=0
       WHERE id=$1`,
      [id]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  const conceptUrlLines = pendingIds.map(pid => {
    const row = all.rows.find((r: any) => r.id === pid);
    return `• ${row?.slotLabel ?? pid}: ${provided.get(pid)}`;
  }).join("\n");
  await createSystemMessage(id!, `🎬 Creator submitted ${pendingIds.length} concept${pendingIds.length > 1 ? "s" : ""} for review. Brand has 48 hours to review or it will be auto-approved.\n${conceptUrlLines}`);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CONCEPT_SUBMITTED",
      title: "Concept submitted for review", body: "Review the concepts within 48 hours or they will be auto-approved.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
    });
    await createPopup({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CONCEPT_SUBMITTED",
      title: "Concept Ready for Review",
      body: "The creator submitted their concept. Review within 48 hours or it will be auto-approved.",
      ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=live",
      isCelebration: false, relatedEntityId: id!,
    });
  }
  res.json({ ok: true });
});

router.post("/creator/deals/:id/concept/resubmit", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (v.deal!.status !== "REVISION_REQUESTED") { res.status(400).json({ error: "No revisions pending on this deal" }); return; }
  const slots: { deliverableId: string; conceptUrl: string }[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
  const rev = await pool.query(
    `SELECT * FROM "DealDeliverable" WHERE "dealId"=$1 AND "conceptStatus"='REVISION_REQUESTED'`, [id]
  );
  if (rev.rows.length === 0) { res.status(400).json({ error: "No concepts awaiting resubmission" }); return; }
  const provided = new Map(slots.map(s => [s.deliverableId, s.conceptUrl]));
  for (const r of rev.rows) {
    if (!provided.has(r.id)) { res.status(400).json({ error: "All revision-requested concepts must be resubmitted" }); return; }
    const chk = isValidPlatformUrl(provided.get(r.id));
    if (!chk.ok) { res.status(400).json({ error: chk.reason }); return; }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rev.rows) {
      const url = provided.get(r.id)!.trim();
      await client.query(
        `UPDATE "DealDeliverable" SET "conceptUrl"=$2, "conceptStatus"='SUBMITTED', "conceptSubmittedAt"=NOW() WHERE id=$1`,
        [r.id, url]
      );
      await recordSubmission(client, { dealId: id!, deliverableId: r.id, stage: "CONCEPT", url });
    }
    // If any are still SUBMITTED → status CONCEPT_SUBMITTED, else maybe all auto-approved → run finalize logic.
    const pend = await client.query(
      `SELECT COUNT(*) FILTER (WHERE "conceptStatus" IN ('PENDING','SUBMITTED','REVISION_REQUESTED'))::int AS p,
              COUNT(*)::int AS total
       FROM "DealDeliverable" WHERE "dealId"=$1`, [id]
    );
    if (pend.rows[0].p > 0) {
      await client.query(`UPDATE "Deal" SET status='CONCEPT_SUBMITTED' WHERE id=$1`, [id]);
    }
    // Ball is now in brand's court for these slots — clear creator nudges.
    await client.query(
      `UPDATE "Deal" SET "creatorActionDueSince"=NULL, "conceptInactivityStage"=0 WHERE id=$1`,
      [id]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  // Possibly all approved now → finalize
  await maybeFinalizeConceptApproval(id!);
  const resubConceptUrlLines = rev.rows.map((r: any) => `• ${r.slotLabel ?? r.id}: ${provided.get(r.id)}`).join("\n");
  await createSystemMessage(id!, `🔁 Creator resubmitted ${rev.rows.length} revised concept${rev.rows.length > 1 ? "s" : ""}:\n${resubConceptUrlLines}`);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CONCEPT_RESUBMITTED",
      title: "Revised concepts submitted", body: "Creator has resubmitted concepts for review.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
    });
    await createPopup({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CONCEPT_SUBMITTED",
      title: "Revised Concept Ready for Review",
      body: "The creator resubmitted their revised concept. Please review it.",
      ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=live",
      isCelebration: false, relatedEntityId: id!,
    });
  }
  res.json({ ok: true });
});

router.post("/brand/deals/:id/concept/approve", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!CONCEPT_STATUSES.includes(v.deal!.status)) { res.status(400).json({ error: "Concept review not active" }); return; }
  const { deliverableId } = req.body ?? {};
  if (typeof deliverableId !== "string" || !deliverableId) { res.status(400).json({ error: "deliverableId is required" }); return; }
  const r = await pool.query(`SELECT * FROM "DealDeliverable" WHERE id=$1 AND "dealId"=$2`, [deliverableId, id]);
  if (r.rows.length === 0) { res.status(404).json({ error: "Deliverable not found" }); return; }
  if (!["SUBMITTED", "REVISION_REQUESTED"].includes(r.rows[0].conceptStatus)) {
    res.status(400).json({ error: "Concept is not awaiting approval" }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the slot row to serialize concurrent approve/revise on the same slot.
    const lock = await client.query(
      `SELECT "conceptStatus" FROM "DealDeliverable" WHERE id=$1 FOR UPDATE`,
      [deliverableId]
    );
    if (lock.rows.length === 0 || !["SUBMITTED","REVISION_REQUESTED"].includes(lock.rows[0].conceptStatus)) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Concept is no longer awaiting approval" }); return;
    }
    await client.query(`UPDATE "DealDeliverable" SET "conceptStatus"='APPROVED' WHERE id=$1`, [deliverableId]);
    await markLatestSubmissionOutcome(client, {
      deliverableId, stage: "CONCEPT", outcome: "APPROVED", reviewedBy: "BRAND",
    });
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  await maybeFinalizeConceptApproval(id!);
  await createSystemMessage(id!, `✅ Brand approved concept for ${r.rows[0].slotLabel}.`);
  res.json({ ok: true });
});

router.post("/brand/deals/:id/concept/revise", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!CONCEPT_STATUSES.includes(v.deal!.status)) { res.status(400).json({ error: "Concept review not active" }); return; }
  const { deliverableId, reason, brief } = req.body ?? {};
  if (typeof deliverableId !== "string" || !deliverableId) { res.status(400).json({ error: "deliverableId is required" }); return; }
  const reasonText = (reason as string | undefined)?.trim();
  if (!reasonText) { res.status(400).json({ error: "Reason is required" }); return; }
  if (reasonText.length > 200) { res.status(400).json({ error: "Reason too long (max 200 chars)" }); return; }
  const briefText = (brief as string | undefined)?.trim();
  if (!briefText) { res.status(400).json({ error: "Brief is required" }); return; }
  if (briefText.length > 300) { res.status(400).json({ error: "Brief too long (max 300 chars)" }); return; }
  const r = await pool.query(`SELECT * FROM "DealDeliverable" WHERE id=$1 AND "dealId"=$2`, [deliverableId, id]);
  if (r.rows.length === 0) { res.status(404).json({ error: "Deliverable not found" }); return; }
  if (r.rows[0].conceptStatus !== "SUBMITTED") { res.status(400).json({ error: "Concept is not awaiting approval" }); return; }
  // Revision counter is informational; no hard cap. Creator can exit at concept stage if unhappy.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      `SELECT "conceptStatus" FROM "DealDeliverable" WHERE id=$1 FOR UPDATE`,
      [deliverableId]
    );
    if (lock.rows.length === 0 || lock.rows[0].conceptStatus !== "SUBMITTED") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Concept is no longer awaiting approval" }); return;
    }
    await client.query(
      `UPDATE "DealDeliverable" SET "conceptStatus"='REVISION_REQUESTED', "conceptRevisionCount"=COALESCE("conceptRevisionCount",0)+1, "conceptRevisionReason"=$2, "conceptRevisionBrief"=$3 WHERE id=$1`,
      [deliverableId, reasonText, briefText]
    );
    await markLatestSubmissionOutcome(client, {
      deliverableId, stage: "CONCEPT", outcome: "REVISION_REQUESTED", reviewedBy: "BRAND",
      revisionReason: reasonText, revisionBrief: briefText,
    });
    // Ball back in creator's court — start/refresh inactivity tracking.
    await client.query(
      `UPDATE "Deal" SET status='REVISION_REQUESTED',
                         "creatorActionDueSince"=NOW(),
                         "conceptInactivityStage"=0
       WHERE id=$1`,
      [id]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  await createSystemMessage(id!, `🔁 Brand requested revision on concept (${r.rows[0].slotLabel}). Reason: ${reasonText}. Details: ${briefText}`);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CONCEPT_REVISION_REQUESTED",
      title: "Concept revision requested",
      body: `Brand requested revision on ${r.rows[0].slotLabel}. ${reasonText}.`,
      relatedEntityType: "DEAL", relatedEntityId: id!,
    });
    await createPopup({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CONCEPT_REVISION_REQUESTED",
      title: "Concept Revision Requested",
      body: `Brand requested changes to your concept (${r.rows[0].slotLabel}). Review the feedback and resubmit through Collabry.\n\nFor better clarity and faster approvals, we recommend discussing feedback in the deal chat or over a quick video call.\n\nAll revisions and approvals must still be submitted through Collabry.`,
      ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
      isCelebration: false, relatedEntityId: id!,
    });
  }
  res.json({ ok: true });
});

async function maybeFinalizeConceptApproval(dealId: string): Promise<void> {
  // Lock the Deal row first to serialize concurrent finalize attempts (e.g. brand approves two slots in parallel tabs).
  const client = await pool.connect();
  let finalizedNow = false;
  let dealRow: any = null;
  try {
    await client.query("BEGIN");
    const dr = await client.query(`SELECT * FROM "Deal" WHERE id=$1 FOR UPDATE`, [dealId]);
    if (dr.rows.length === 0) { await client.query("ROLLBACK"); return; }
    const d = dr.rows[0];
    dealRow = d;
    if (d.conceptApprovedAt) { await client.query("ROLLBACK"); return; }
    const stat = await client.query(
      `SELECT COUNT(*) FILTER (WHERE "conceptStatus"!='APPROVED')::int AS pending
       FROM "DealDeliverable" WHERE "dealId"=$1`, [dealId]
    );
    if (stat.rows[0].pending > 0) { await client.query("ROLLBACK"); return; }
    if (d.productRequired) {
      await client.query(
        `UPDATE "Deal" SET status='CONCEPT_APPROVED', "conceptApprovedAt"=NOW(),
                           "creatorActionDueSince"=NULL, "conceptInactivityStage"=0
         WHERE id=$1`,
        [dealId]
      );
    } else {
      await client.query(
        `UPDATE "Deal" SET status='IN_PROGRESS', "conceptApprovedAt"=NOW(),
         "creatorActionDueSince"=NULL, "conceptInactivityStage"=0
         WHERE id=$1`,
        [dealId]
      );
    }
    await client.query("COMMIT");
    finalizedNow = true;
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  if (!finalizedNow || !dealRow) return;
  if (dealRow.productRequired) {
    await createSystemMessage(dealId, `✅ All concepts approved! Brand, please ship the product to start the timeline.`);
  } else {
    await createSystemMessage(dealId, `✅ All concepts approved! Upload your final content before the deal deadline.`);
  }
  const p = await getDealParticipants(dealId);
  if (p) {
    await createNotification({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CONCEPT_APPROVED",
      title: "All concepts approved",
      body: dealRow.productRequired ? "Brand will ship product next." : "Upload your final content before the deal deadline.",
      relatedEntityType: "DEAL", relatedEntityId: dealId,
    });
    await createPopup({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CONCEPT_APPROVED",
      title: "Concept Approved 🎉",
      body: dealRow.productRequired
        ? "All your concepts were approved! Brand will ship the product next."
        : "All concepts approved! Upload your final content before the deal deadline.",
      ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
      isCelebration: true, relatedEntityId: dealId,
    });
  }
}

// =====================================================
// CONTENT FLOW
// =====================================================

router.post("/creator/deals/:id/content/submit", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  const d = v.deal!;
  // Allow content submission once concepts are approved AND, if product required, product received.
  if (d.productRequired && !d.productReceivedAt) {
    res.status(400).json({ error: "Mark product as received before submitting content" }); return;
  }
  if (!CONTENT_READY_STATUSES.includes(d.status)) {
    res.status(400).json({ error: `Cannot submit content in status ${d.status}` }); return;
  }
  const slots: { deliverableId: string; finalUrl: string }[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
  const all = await pool.query(`SELECT * FROM "DealDeliverable" WHERE "dealId"=$1`, [id]);
  const pending = all.rows.filter(r => r.finalStatus === "PENDING");
  if (pending.length === 0) { res.status(400).json({ error: "All content has already been submitted" }); return; }
  const provided = new Map(slots.map(s => [s.deliverableId, s.finalUrl]));
  for (const r of pending) {
    if (!provided.has(r.id)) { res.status(400).json({ error: "Final content URL is required for every slot" }); return; }
    const chk = isValidPlatformUrl(provided.get(r.id));
    if (!chk.ok) { res.status(400).json({ error: chk.reason }); return; }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of pending) {
      const url = provided.get(r.id)!.trim();
      await client.query(
        `UPDATE "DealDeliverable" SET "finalUrl"=$2, "finalStatus"='SUBMITTED', "finalSubmittedAt"=NOW() WHERE id=$1`,
        [r.id, url]
      );
      await recordSubmission(client, { dealId: id!, deliverableId: r.id, stage: "FINAL", url });
    }
    await client.query(`UPDATE "Deal" SET status='CONTENT_UPLOADED' WHERE id=$1`, [id]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  const finalUrlLines = pending.map((r: any) => `• ${r.slotLabel ?? r.id}: ${provided.get(r.id)}`).join("\n");
  await createSystemMessage(id!, `📤 Creator uploaded ${pending.length} piece${pending.length > 1 ? "s" : ""} of final content. Brand has 48 hours to review or it will be auto-approved.\n${finalUrlLines}`);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CONTENT_SUBMITTED",
      title: "Final content submitted", body: "Review the content within 48 hours or it will be auto-approved.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
    });
    await createPopup({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CONTENT_SUBMITTED",
      title: "Content Ready for Review",
      body: "The creator submitted their final content. Review within 48 hours or it will be auto-approved.",
      ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=live",
      isCelebration: false, relatedEntityId: id!,
    });
  }
  res.json({ ok: true });
});

router.post("/creator/deals/:id/content/resubmit", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  const d = v.deal!;
  if (d.status !== "REVISION_REQUESTED") { res.status(400).json({ error: "No revisions pending on this deal" }); return; }
  const slots: { deliverableId: string; finalUrl: string }[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
  const rev = await pool.query(
    `SELECT * FROM "DealDeliverable" WHERE "dealId"=$1 AND "finalStatus"='REVISION_REQUESTED'`, [id]
  );
  if (rev.rows.length === 0) { res.status(400).json({ error: "No content awaiting resubmission" }); return; }
  const provided = new Map(slots.map(s => [s.deliverableId, s.finalUrl]));
  for (const r of rev.rows) {
    if (!provided.has(r.id)) { res.status(400).json({ error: "All revision-requested content must be resubmitted" }); return; }
    const chk = isValidPlatformUrl(provided.get(r.id));
    if (!chk.ok) { res.status(400).json({ error: chk.reason }); return; }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rev.rows) {
      const url = provided.get(r.id)!.trim();
      await client.query(
        `UPDATE "DealDeliverable" SET "finalUrl"=$2, "finalStatus"='SUBMITTED', "finalSubmittedAt"=NOW() WHERE id=$1`,
        [r.id, url]
      );
      await recordSubmission(client, { dealId: id!, deliverableId: r.id, stage: "FINAL", url });
    }
    const pend = await client.query(
      `SELECT COUNT(*) FILTER (WHERE "finalStatus" IN ('PENDING','SUBMITTED','REVISION_REQUESTED'))::int AS p
       FROM "DealDeliverable" WHERE "dealId"=$1`, [id]
    );
    if (pend.rows[0].p > 0) {
      await client.query(`UPDATE "Deal" SET status='CONTENT_UPLOADED' WHERE id=$1`, [id]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  await maybeFinalizeContentApproval(id!);
  const resubFinalUrlLines = rev.rows.map((r: any) => `• ${r.slotLabel ?? r.id}: ${provided.get(r.id)}`).join("\n");
  await createSystemMessage(id!, `🔁 Creator resubmitted ${rev.rows.length} revised piece${rev.rows.length > 1 ? "s" : ""} of content:\n${resubFinalUrlLines}`);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CONTENT_RESUBMITTED",
      title: "Revised content submitted", body: "Creator has resubmitted content for review.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
    });
    await createPopup({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CONTENT_SUBMITTED",
      title: "Revised Content Ready for Review",
      body: "The creator resubmitted their revised content. Please review it.",
      ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=live",
      isCelebration: false, relatedEntityId: id!,
    });
  }
  res.json({ ok: true });
});

router.post("/brand/deals/:id/content/approve", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!["CONTENT_UPLOADED", "REVISION_REQUESTED"].includes(v.deal!.status)) {
    res.status(400).json({ error: "Content review not active" }); return;
  }
  const { deliverableId } = req.body ?? {};
  if (typeof deliverableId !== "string" || !deliverableId) { res.status(400).json({ error: "deliverableId is required" }); return; }
  const r = await pool.query(`SELECT * FROM "DealDeliverable" WHERE id=$1 AND "dealId"=$2`, [deliverableId, id]);
  if (r.rows.length === 0) { res.status(404).json({ error: "Deliverable not found" }); return; }
  if (!["SUBMITTED", "REVISION_REQUESTED"].includes(r.rows[0].finalStatus)) {
    res.status(400).json({ error: "Content is not awaiting approval" }); return;
  }
  // Optional explicit confirmation flag from frontend confirmation modal.
  if (req.body?.confirmed === false) { res.status(400).json({ error: "Approval not confirmed" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      `SELECT "finalStatus" FROM "DealDeliverable" WHERE id=$1 FOR UPDATE`,
      [deliverableId]
    );
    if (lock.rows.length === 0 || !["SUBMITTED","REVISION_REQUESTED"].includes(lock.rows[0].finalStatus)) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Content is no longer awaiting approval" }); return;
    }
    await client.query(`UPDATE "DealDeliverable" SET "finalStatus"='APPROVED' WHERE id=$1`, [deliverableId]);
    await markLatestSubmissionOutcome(client, {
      deliverableId, stage: "FINAL", outcome: "APPROVED", reviewedBy: "BRAND",
    });
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  await maybeFinalizeContentApproval(id!);
  await createSystemMessage(id!, `✅ Brand approved content for ${r.rows[0].slotLabel}.`);
  res.json({ ok: true });
});

router.post("/brand/deals/:id/content/revise", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!["CONTENT_UPLOADED", "REVISION_REQUESTED"].includes(v.deal!.status)) {
    res.status(400).json({ error: "Content review not active" }); return;
  }
  const { deliverableId, reason, brief } = req.body ?? {};
  if (typeof deliverableId !== "string" || !deliverableId) { res.status(400).json({ error: "deliverableId is required" }); return; }
  const reasonText = (reason as string | undefined)?.trim();
  if (!reasonText) { res.status(400).json({ error: "Reason is required" }); return; }
  if (reasonText.length > 200) { res.status(400).json({ error: "Reason too long (max 200 chars)" }); return; }
  const briefText = (brief as string | undefined)?.trim();
  if (!briefText) { res.status(400).json({ error: "Brief is required" }); return; }
  if (briefText.length > 300) { res.status(400).json({ error: "Brief too long (max 300 chars)" }); return; }
  const r = await pool.query(`SELECT * FROM "DealDeliverable" WHERE id=$1 AND "dealId"=$2`, [deliverableId, id]);
  if (r.rows.length === 0) { res.status(404).json({ error: "Deliverable not found" }); return; }
  if (r.rows[0].finalStatus !== "SUBMITTED") { res.status(400).json({ error: "Content is not awaiting approval" }); return; }
  // Revision counter is informational; no hard cap.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      `SELECT "finalStatus" FROM "DealDeliverable" WHERE id=$1 FOR UPDATE`,
      [deliverableId]
    );
    if (lock.rows.length === 0 || lock.rows[0].finalStatus !== "SUBMITTED") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Content is no longer awaiting approval" }); return;
    }
    await client.query(
      `UPDATE "DealDeliverable" SET "finalStatus"='REVISION_REQUESTED', "finalRevisionCount"=COALESCE("finalRevisionCount",0)+1, "finalRevisionReason"=$2, "finalRevisionBrief"=$3 WHERE id=$1`,
      [deliverableId, reasonText, briefText]
    );
    await markLatestSubmissionOutcome(client, {
      deliverableId, stage: "FINAL", outcome: "REVISION_REQUESTED", reviewedBy: "BRAND",
      revisionReason: reasonText, revisionBrief: briefText,
    });
    await client.query(`UPDATE "Deal" SET status='REVISION_REQUESTED' WHERE id=$1`, [id]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  await createSystemMessage(id!, `🔁 Brand requested revision on content (${r.rows[0].slotLabel}). Reason: ${reasonText}. Details: ${briefText}`);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CONTENT_REVISION_REQUESTED",
      title: "Content revision requested",
      body: `Brand requested revision on ${r.rows[0].slotLabel}. ${reasonText}.`,
      relatedEntityType: "DEAL", relatedEntityId: id!,
    });
    await createPopup({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CONTENT_REVISION_REQUESTED",
      title: "Content Revision Requested",
      body: `Brand requested changes to your content (${r.rows[0].slotLabel}). Review and resubmit.`,
      ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
      isCelebration: false, relatedEntityId: id!,
    });
  }
  res.json({ ok: true });
});

async function maybeFinalizeContentApproval(dealId: string): Promise<void> {
  // Lock the Deal row first to serialize concurrent finalize attempts (e.g. brand approves two slots in parallel tabs).
  const client = await pool.connect();
  let finalizedNow = false;
  let postedByOut = "CREATOR";
  try {
    await client.query("BEGIN");
    const dr = await client.query(`SELECT * FROM "Deal" WHERE id=$1 FOR UPDATE`, [dealId]);
    if (dr.rows.length === 0) { await client.query("ROLLBACK"); return; }
    const d = dr.rows[0];
    if (d.contentApprovedAt) { await client.query("ROLLBACK"); return; }
    const stat = await client.query(
      `SELECT COUNT(*) FILTER (WHERE "finalStatus"!='APPROVED')::int AS pending
       FROM "DealDeliverable" WHERE "dealId"=$1`, [dealId]
    );
    if (stat.rows[0].pending > 0) { await client.query("ROLLBACK"); return; }
    const postedBy = d.postedBy ?? "CREATOR";
    postedByOut = postedBy;
    if (postedBy === "BRAND") {
      await client.query(
        `UPDATE "Deal" SET status='COMPLETED', "contentApprovedAt"=NOW(), "completedAt"=NOW(),
                           "creatorActionDueSince"=NULL, "finalInactivityStage"=0
         WHERE id=$1`,
        [dealId]
      );
    } else {
      // Complete the deal directly — no live URL step required.
      await client.query(
        `UPDATE "Deal" SET status='COMPLETED', "contentApprovedAt"=NOW(), "completedAt"=NOW(),
                           "creatorActionDueSince"=NULL, "finalInactivityStage"=0
         WHERE id=$1`,
        [dealId]
      );
    }
    await client.query("COMMIT");
    finalizedNow = true;
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  if (!finalizedNow) return;
  if (postedByOut === "BRAND") {
    await createSystemMessage(dealId, `✅ Content approved! Brand will publish — deal complete. Payout will be released shortly.`);
    const p = await getDealParticipants(dealId);
    if (p) {
      await createNotification({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_COMPLETED",
        title: "Deal completed — payout incoming",
        body: "Brand approved your content. Your payout will be released shortly. Do not delete any submitted content files.",
        relatedEntityType: "DEAL", relatedEntityId: dealId,
      });
      const kycRes2 = await pool.query(`SELECT "kycStatus" FROM "Creator" WHERE id=$1`, [p.creatorId]);
      const kycOk2 = kycRes2.rows[0]?.kycStatus === "VERIFIED";
      await createPopup(kycOk2 ? {
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_COMPLETED",
        title: "Content Approved 🎉",
        body: "All your content has been approved! Your payout will be released shortly. Do not delete any submitted content files.",
        ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=completed",
        isCelebration: true, relatedEntityId: dealId,
      } : {
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_COMPLETE_KYC_NEEDED",
        title: "Complete Your KYC to Get Paid",
        body: "Your deal is complete! Do not delete any submitted content files. To receive your payout, please submit your KYC details.",
        ctaText: "Update KYC →", ctaPath: "/home-creator/profile#kyc",
        secondCtaText: "Later",
        isCelebration: false, relatedEntityId: dealId,
      });
      await createNotification({
        userId: p.brandId, userType: "BRAND", type: "DEAL_COMPLETED",
        title: "Deal completed",
        body: "Don't forget to rate the creator. For any concerns with this deal, contact our support team.",
        relatedEntityType: "DEAL", relatedEntityId: dealId,
      });
      await createPopup({
        userId: p.brandId, userType: "BRAND", type: "DEAL_COMPLETED",
        title: "Deal Completed 🎉",
        body: "You've approved the content and the deal is now complete. Don't forget to rate the creator! For any concerns, contact our support team.",
        ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=completed",
        isCelebration: true, relatedEntityId: dealId,
      });
    }
  } else {
    await createSystemMessage(dealId, `✅ All content approved! The deal is now complete. Payout will be released shortly.`);
    const p = await getDealParticipants(dealId);
    if (p) {
      const kycRes = await pool.query(`SELECT "kycStatus" FROM "Creator" WHERE id=$1`, [p.creatorId]);
      const kycOk = kycRes.rows[0]?.kycStatus === "VERIFIED";
      await createNotification({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_COMPLETED",
        title: "Deal completed — payout incoming",
        body: "Brand approved your content. ⚠️ Do not delete your posted content within 7 days of deal completion. Deleting content can lead to your payment being stopped and your account being banned. You will receive your payout once the 7-day dispute window closes.",
        relatedEntityType: "DEAL", relatedEntityId: dealId,
      });
      await createPopup(kycOk ? {
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_COMPLETED",
        title: "Content Approved 🎉",
        body: "All your content has been approved! ⚠️ Do not delete your posted content within 7 days of deal completion. Deleting content can lead to your payment being stopped and your account being banned. You will receive your payout once the 7-day dispute window closes.",
        ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=completed",
        isCelebration: true, relatedEntityId: dealId,
      } : {
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_COMPLETE_KYC_NEEDED",
        title: "Complete Your KYC to Get Paid",
        body: "Your deal is complete! ⚠️ Do NOT delete your posted content for 7 days. To receive your payout, please submit your KYC details.",
        ctaText: "Update KYC →", ctaPath: "/home-creator/profile#kyc",
        secondCtaText: "Later",
        isCelebration: false, relatedEntityId: dealId,
      });
      await createNotification({
        userId: p.brandId, userType: "BRAND", type: "DEAL_COMPLETED",
        title: "Deal completed",
        body: "Don't forget to rate the creator. If the creator deletes the posted content within 7 days of deal completion, you can raise a dispute from the deal page. The dispute window closes automatically after 7 days.",
        relatedEntityType: "DEAL", relatedEntityId: dealId,
      });
      await createPopup({
        userId: p.brandId, userType: "BRAND", type: "DEAL_COMPLETED",
        title: "Deal Completed 🎉",
        body: "You've approved the content and the deal is now complete. Don't forget to rate the creator! If the creator deletes the posted content within 7 days of deal completion, you can raise a dispute from the deal page. The dispute window closes automatically after 7 days.",
        ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=completed",
        isCelebration: true, relatedEntityId: dealId,
      });
    }
  }
}

// =====================================================
// FINAL POST + DISPUTE WINDOW
// =====================================================

router.post("/creator/deals/:id/final-post/submit", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  const d = v.deal!;
  const postedBy = d.postedBy ?? "CREATOR";
  if (postedBy === "BRAND") { res.status(400).json({ error: "Brand is responsible for posting on this deal" }); return; }
  if (d.status !== "CONTENT_APPROVED") { res.status(400).json({ error: "Final post can only be submitted after content approval" }); return; }

  const slots: { deliverableId: string; livePostUrl: string }[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
  const all = await pool.query(`SELECT * FROM "DealDeliverable" WHERE "dealId"=$1`, [id]);
  const provided = new Map(slots.map(s => [s.deliverableId, s.livePostUrl]));

  const nonStory = all.rows.filter((r: any) => r.type !== "STORY");
  const stories  = all.rows.filter((r: any) => r.type === "STORY");

  for (const r of nonStory) {
    if (!provided.has(r.id)) { res.status(400).json({ error: `Live post URL required for ${r.slotLabel}` }); return; }
    if (!isValidUrl(provided.get(r.id))) { res.status(400).json({ error: `URL for ${r.slotLabel} must be a valid http(s) link` }); return; }
  }

  const reviewHrsCfg = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='brand_live_post_review_hours'`);
  const reviewHrs = parseInt(reviewHrsCfg.rows[0]?.value ?? "48", 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of nonStory) {
      await client.query(
        `UPDATE "DealDeliverable" SET "livePostUrl"=$2, "livePostConfirmedByBrand"=false, "livePostFlagged"=false WHERE id=$1`,
        [r.id, provided.get(r.id)!.trim()]
      );
    }
    for (const r of stories) {
      await client.query(
        `UPDATE "DealDeliverable" SET "storyAutoConfirmed"=true, "livePostConfirmedByBrand"=true WHERE id=$1`,
        [r.id]
      );
    }
    await client.query(
      `UPDATE "Deal" SET status='POST_LIVE_PENDING', "finalPostConfirmedAt"=NOW(),
       "livePostReviewDeadline"=NOW() + ($2 || ' hours')::interval WHERE id=$1`,
      [id, reviewHrs]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }

  const storyNote = stories.length > 0 ? ` (${stories.length} story slot${stories.length > 1 ? "s" : ""} auto-confirmed — stories expire in 24hrs)` : "";
  const reviewNote = nonStory.length > 0 ? ` Brand has ${reviewHrs}hrs to review each link.` : "";
  const liveUrlLines = [...nonStory, ...stories].map((r: any) => `• ${r.slotLabel ?? r.id}: ${provided.get(r.id)}`).join("\n");
  await createSystemMessage(id!, `📲 Creator submitted live post URLs${storyNote}.${reviewNote} Auto-confirm triggers if brand is silent.\n${liveUrlLines}`);

  const p = await getDealParticipants(id!);
  if (p && nonStory.length > 0) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_FINAL_POST_CONFIRMED",
      title: "Review creator's live post links",
      body: `Confirm or flag each post link. You have ${reviewHrs}hrs before auto-confirm.`,
      relatedEntityType: "DEAL", relatedEntityId: id!,
      emailTemplateId: 38, emailSubject: "Review creator's live posts",
    });
    await createPopup({
      userId: p.brandId, userType: "BRAND", type: "DEAL_FINAL_POST_CONFIRMED",
      title: "Live Content Submitted",
      body: "The creator submitted the live Instagram content for your review.",
      ctaText: "Review Post", ctaPath: "/home-brand/deals?tab=live",
      relatedEntityId: id!,
    });
  }

  if (nonStory.length === 0) {
    await markAllConfirmedIfReady(id!);
  }
  res.json({ ok: true });
});

// Per-slot brand review (CONFIRM or FLAG)
router.post("/brand/deals/:id/final-post/review-slot", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!["POST_LIVE_PENDING", "URL_FLAGGED"].includes(v.deal!.status)) {
    res.status(400).json({ error: "No pending post review for this deal" }); return;
  }
  const { deliverableId, action, flagReason } = req.body ?? {};
  if (!deliverableId || !["CONFIRM", "FLAG"].includes(action)) {
    res.status(400).json({ error: "deliverableId and action (CONFIRM|FLAG) required" }); return;
  }
  const slotRes = await pool.query(
    `SELECT * FROM "DealDeliverable" WHERE id=$1 AND "dealId"=$2`, [deliverableId, id]
  );
  if (!slotRes.rows.length) { res.status(404).json({ error: "Deliverable not found" }); return; }
  const slot = slotRes.rows[0];
  if (slot.storyAutoConfirmed) { res.status(400).json({ error: "Story slots are auto-confirmed and cannot be reviewed manually" }); return; }
  if (slot.livePostAdminOverride) { res.status(400).json({ error: "This slot was already overridden by admin" }); return; }
  if (!slot.livePostUrl && action === "CONFIRM") { res.status(400).json({ error: "No live post URL submitted for this slot" }); return; }

  if (action === "CONFIRM") {
    await pool.query(`UPDATE "DealDeliverable" SET "livePostConfirmedByBrand"=true, "livePostFlagged"=false WHERE id=$1`, [deliverableId]);
    await createSystemMessage(id!, `✅ Brand confirmed live post for ${slot.slotLabel}.`);
    await markAllConfirmedIfReady(id!);
    const p = await getDealParticipants(id!);
    if (p) {
      await createNotification({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_FINAL_POST_CONFIRMED",
        title: `Post confirmed — ${slot.slotLabel}`,
        body: "Brand confirmed your live post link.",
        relatedEntityType: "DEAL", relatedEntityId: id!,
        emailTemplateId: 37, emailSubject: "Brand confirmed your post",
      });
    }
  } else {
    // FLAG
    await pool.query(`UPDATE "DealDeliverable" SET "livePostFlagged"=true WHERE id=$1`, [deliverableId]);
    await pool.query(`UPDATE "Deal" SET status='URL_FLAGGED' WHERE id=$1`, [id]);
    const reason = ((flagReason as string | undefined) ?? "").trim() || "No reason provided";
    await createSystemMessage(id!, `🚩 Brand flagged live post for ${slot.slotLabel}. Reason: ${reason}. Admin is reviewing.`);
    const p = await getDealParticipants(id!);
    if (p) {
      await createNotification({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_FLAGGED",
        title: `Your post was flagged — ${slot.slotLabel}`,
        body: `Brand flagged your live post URL. Admin is reviewing the case.`,
        relatedEntityType: "DEAL", relatedEntityId: id!,
        emailTemplateId: 39, emailSubject: "Live post flagged — resubmit needed",
      });
      await createPopup({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_FLAGGED",
        title: "Live Content Flagged",
        body: "The brand flagged your live submission and requested changes.",
        ctaText: "Open Deal", ctaPath: "/home-creator/deals?tab=live",
        relatedEntityId: id!,
      });
    }
  }
  res.json({ ok: true });
});

// Legacy approve — kept for backward compat, marks ALL non-story slots confirmed
router.post("/brand/deals/:id/final-post/approve", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!["POST_LIVE_PENDING", "URL_FLAGGED"].includes(v.deal!.status)) {
    res.status(400).json({ error: "No pending post confirmation from creator" }); return;
  }
  await pool.query(
    `UPDATE "DealDeliverable" SET "livePostConfirmedByBrand"=true WHERE "dealId"=$1 AND NOT "storyAutoConfirmed"`,
    [id]
  );
  await markAllConfirmedIfReady(id!);
  res.json({ ok: true });
});

// Creator resubmit a flagged slot (max 1 per slot)
router.post("/creator/deals/:id/final-post/resubmit-slot", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (v.deal!.status !== "URL_FLAGGED") { res.status(400).json({ error: "No flagged URL to resubmit" }); return; }
  const { deliverableId, livePostUrl } = req.body ?? {};
  if (!deliverableId || !isValidUrl(livePostUrl)) {
    res.status(400).json({ error: "deliverableId and valid livePostUrl required" }); return;
  }
  const slotRes = await pool.query(
    `SELECT * FROM "DealDeliverable" WHERE id=$1 AND "dealId"=$2`, [deliverableId, id]
  );
  if (!slotRes.rows.length) { res.status(404).json({ error: "Deliverable not found" }); return; }
  const slot = slotRes.rows[0];
  if (!slot.livePostFlagged) { res.status(400).json({ error: "This slot is not flagged" }); return; }
  if (slot.livePostResubmissionCount >= 1) {
    res.status(400).json({ error: "Maximum 1 resubmission allowed per slot" }); return;
  }
  await pool.query(
    `UPDATE "DealDeliverable" SET "livePostUrl"=$2, "livePostFlagged"=false,
     "livePostResubmissionCount"="livePostResubmissionCount"+1 WHERE id=$1`,
    [deliverableId, (livePostUrl as string).trim()]
  );
  // If no more flagged slots, revert deal to POST_LIVE_PENDING
  const stillFlagged = await pool.query(
    `SELECT id FROM "DealDeliverable" WHERE "dealId"=$1 AND "livePostFlagged"=true`, [id]
  );
  if (stillFlagged.rows.length === 0) {
    await pool.query(`UPDATE "Deal" SET status='POST_LIVE_PENDING' WHERE id=$1`, [id]);
  }
  await createSystemMessage(id!, `🔁 Creator resubmitted live post URL for ${slot.slotLabel}. Brand, please re-review.`);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_FINAL_POST_CONFIRMED",
      title: `Creator resubmitted — ${slot.slotLabel}`,
      body: "The creator has updated the live post URL. Please confirm or flag again.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
      emailTemplateId: 36, emailSubject: "Creator resubmitted URL",
    });
    await createPopup({
      userId: p.brandId, userType: "BRAND", type: "DEAL_FINAL_POST_CONFIRMED",
      title: "Post Link Resubmitted",
      body: `The creator updated their live post URL for ${slot.slotLabel}. Please confirm or flag the new link.`,
      ctaText: "Review Now", ctaPath: "/home-brand/deals?tab=live",
      relatedEntityId: id!,
    });
  }
  res.json({ ok: true });
});

// Admin: review a flagged slot — OVERRIDE (force confirm) or REQUEST_RESUBMIT (send back to creator)
router.post("/admin/deals/:id/url-flag/review", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const dealRes = await pool.query(`SELECT * FROM "Deal" WHERE id=$1`, [id]);
  if (!dealRes.rows.length) { res.status(404).json({ error: "Deal not found" }); return; }
  if (dealRes.rows[0].status !== "URL_FLAGGED") {
    res.status(400).json({ error: "Deal is not in URL_FLAGGED status" }); return;
  }
  const { deliverableId, action, adminNote } = req.body ?? {};
  if (!deliverableId || !["OVERRIDE", "REQUEST_RESUBMIT"].includes(action)) {
    res.status(400).json({ error: "deliverableId and action (OVERRIDE|REQUEST_RESUBMIT) required" }); return;
  }
  const slotRes = await pool.query(
    `SELECT * FROM "DealDeliverable" WHERE id=$1 AND "dealId"=$2`, [deliverableId, id]
  );
  if (!slotRes.rows.length) { res.status(404).json({ error: "Deliverable not found" }); return; }
  const slot = slotRes.rows[0];
  const note = ((adminNote as string | undefined) ?? "").trim();

  if (action === "OVERRIDE") {
    await pool.query(
      `UPDATE "DealDeliverable" SET "livePostFlagged"=false, "livePostAdminOverride"=true, "livePostConfirmedByBrand"=true WHERE id=$1`,
      [deliverableId]
    );
    const stillFlagged = await pool.query(
      `SELECT id FROM "DealDeliverable" WHERE "dealId"=$1 AND "livePostFlagged"=true`, [id]
    );
    if (stillFlagged.rows.length === 0) {
      await pool.query(`UPDATE "Deal" SET status='POST_LIVE_PENDING' WHERE id=$1`, [id]);
    }
    await createSystemMessage(id!, `🛡️ Admin overrode brand flag for ${slot.slotLabel} — post confirmed.${note ? " Note: " + note : ""}`);
    await markAllConfirmedIfReady(id!);
  } else {
    // REQUEST_RESUBMIT — allow creator another try even if already used resubmission
    await pool.query(
      `UPDATE "DealDeliverable" SET "livePostFlagged"=false, "livePostResubmissionCount"=0 WHERE id=$1`,
      [deliverableId]
    );
    await pool.query(`UPDATE "Deal" SET status='URL_FLAGGED' WHERE id=$1`, [id]);
    await createSystemMessage(id!, `🔄 Admin requested creator to resubmit live post URL for ${slot.slotLabel}.${note ? " Note: " + note : ""}`);
    const p = await getDealParticipants(id!);
    if (p) await createNotification({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_FLAGGED",
      title: `Please resubmit your post URL — ${slot.slotLabel}`,
      body: note || "Admin has requested you submit a new live post URL for this slot.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
      emailTemplateId: 39, emailSubject: "Please resubmit your post URL",
    });
  }
  res.json({ ok: true });
});

// Admin: list deals with URL_FLAGGED status (plus optionally other flagged statuses)
router.get("/admin/deals/flagged", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const result = await pool.query(`
    SELECT d.id, d.status, d."createdAt", d."totalAgreedValue", d.source,
           d."escrowStatus", d."disputeRaisedAt",
           b."brandName", cr."instagramHandle", cr."fullName" AS "creatorName",
           disp.reason AS "disputeReason",
           disp.description AS "disputeDescription",
           (
             SELECT json_agg(json_build_object(
               'id', del.id,
               'slotLabel', del."slotLabel",
               'type', del.type,
               'livePostUrl', del."livePostUrl",
               'livePostResubmissionCount', del."livePostResubmissionCount"
             ) ORDER BY del."slotLabel")
             FROM "DealDeliverable" del
             WHERE del."dealId"=d.id AND del."livePostFlagged"=true
           ) AS "flaggedDeliverables"
    FROM "Deal" d
    JOIN "Brand" b ON b.id=d."brandId"
    JOIN "Creator" cr ON cr.id=d."creatorId"
    LEFT JOIN LATERAL (
      SELECT reason, description FROM "DealDispute"
      WHERE "dealId"=d.id
      ORDER BY "raisedAt" DESC
      LIMIT 1
    ) disp ON true
    WHERE d.status IN ('DISPUTED','URL_FLAGGED','PRODUCT_ISSUE_RAISED','NON_DELIVERY_REPORTED')
    ORDER BY d."createdAt" ASC
    LIMIT 200
  `);
  res.json({ deals: result.rows });
});

router.post("/brand/deals/:id/dispute", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  const d = v.deal!;
  if (!["DISPUTE_WINDOW_OPEN", "COMPLETED"].includes(d.status)) {
    res.status(400).json({ error: "Disputes can only be raised within the 7-day window after final post" }); return;
  }
  if (d.disputeRaised) { res.status(400).json({ error: "A dispute has already been raised on this deal" }); return; }
  if (!d.disputeWindowEnd || new Date(d.disputeWindowEnd) < new Date()) {
    res.status(400).json({ error: "The 7-day dispute window has expired" }); return;
  }
  const description = ((req.body?.description as string | undefined) ?? "").trim();
  const evidenceUrl = ((req.body?.evidenceUrl as string | undefined) ?? "").trim();
  if (!description) { res.status(400).json({ error: "Description is required" }); return; }
  if (description.length > 2000) { res.status(400).json({ error: "Description too long (max 2000 chars)" }); return; }
  if (evidenceUrl && !isValidUrl(evidenceUrl)) { res.status(400).json({ error: "Evidence URL must be a valid http(s) link" }); return; }
  const reason = "Creator deleted posted content";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "DealDispute" (id,"dealId","raisedBy",reason,description,"evidenceUrl","raisedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,NOW())`,
      [id, brandId, reason, description, evidenceUrl || null]
    );
    await client.query(
      `UPDATE "Deal" SET status='DISPUTED', "disputeRaised"=true, "disputeRaisedAt"=NOW() WHERE id=$1`,
      [id]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  await createSystemMessage(id!, `⚠️ Brand raised a dispute. Reason: ${reason}. An admin will review and resolve.`);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_DISPUTE_RAISED",
      title: "Dispute raised",
      body: `Brand raised a dispute: ${reason}. Awaiting admin review.`,
      relatedEntityType: "DEAL", relatedEntityId: id!,
    });
    await createPopup({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_DISPUTE_RAISED",
      title: "Dispute Raised",
      body: "The brand raised a dispute for this collaboration. Our team will review it shortly.",
      ctaText: "Open Deal", ctaPath: "/home-creator/deals?tab=live",
      relatedEntityId: id!,
    });
  }
  res.json({ ok: true });
});

router.post("/admin/deals/:id/dispute/resolve", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string | undefined;
  const { id } = req.params as Record<string, string>;
  const { outcome, notes } = req.body ?? {};
  if (!["VALID", "INVALID"].includes(outcome)) { res.status(400).json({ error: "outcome must be VALID or INVALID" }); return; }
  const v = await verifyDeal(id!, null, "ADMIN");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (v.deal!.status !== "DISPUTED") { res.status(400).json({ error: "No active dispute on this deal" }); return; }
  const dispute = await pool.query(`SELECT id FROM "DealDispute" WHERE "dealId"=$1`, [id]);
  if (dispute.rows.length === 0) { res.status(400).json({ error: "Dispute record not found" }); return; }
  const newOutcome = outcome === "VALID" ? "PARTIAL_REFUND" : "FULL_PAYOUT";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE "DealDispute" SET "adminDecision"=$2, "adminNotes"=$3, "resolvedBy"=$4, "resolvedAt"=NOW() WHERE id=$1`,
      [dispute.rows[0].id, outcome, (notes as string | undefined)?.trim() || null, adminId ?? null]
    );
    await client.query(
      `UPDATE "Deal" SET status='COMPLETED', "completedAt"=NOW(), "disputeOutcome"=$2 WHERE id=$1`,
      [id, newOutcome]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  const msg = outcome === "VALID"
    ? "⚖️ Admin resolved dispute: VALID. 50% refund issued to brand. Creator payout cancelled."
    : "⚖️ Admin resolved dispute: INVALID. Full payout will be released to creator.";
  await createSystemMessage(id!, msg);
  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_DISPUTE_RESOLVED",
      title: outcome === "VALID" ? "Dispute resolved" : "Dispute declined",
      body: outcome === "VALID" ? "Dispute upheld. 50% refund issued." : "Dispute denied. Full payout to creator.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
      emailTemplateId: outcome === "VALID" ? 60 : 62,
      emailSubject: outcome === "VALID" ? "Dispute upheld" : "Dispute declined",
    });
    await createNotification({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_DISPUTE_RESOLVED",
      title: "Dispute resolved",
      body: outcome === "VALID" ? "Dispute upheld. Payout cancelled." : "Dispute resolved in your favor. Full payout incoming.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
      emailTemplateId: outcome === "VALID" ? 61 : 63,
      emailSubject: outcome === "VALID" ? "Dispute upheld — payout cancelled" : "Dispute resolved in your favour",
    });
    if (outcome === "INVALID") {
      await createPopup({
        userId: p.brandId, userType: "BRAND", type: "DEAL_DISPUTE_RESOLVED",
        title: "Dispute Declined",
        body: "After review, the dispute could not be approved.",
        ctaText: "View Details", ctaPath: "/home-brand/deals?tab=live",
        relatedEntityId: id!,
      });
      await createPopup({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_DISPUTE_RESOLVED",
        title: "Dispute Resolved 🎉",
        body: "The dispute was reviewed and resolved in your favor.",
        ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
        isCelebration: true, relatedEntityId: id!,
      });
    } else {
      await createPopup({
        userId: p.brandId, userType: "BRAND", type: "DEAL_DISPUTE_RESOLVED",
        title: "Dispute Resolved",
        body: "The dispute was upheld. A 50% refund has been processed.",
        ctaText: "View Details", ctaPath: "/home-brand/deals?tab=live",
        relatedEntityId: id!,
      });
      await createPopup({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_DISPUTE_RESOLVED",
        title: "Dispute Decision",
        body: "The dispute was reviewed and upheld. Your payout has been cancelled.",
        ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
        relatedEntityId: id!,
      });
    }
  }
  res.json({ ok: true });
});

router.post("/admin/deals/:id/dispute/cancel", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string | undefined;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, null, "ADMIN");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (v.deal!.status !== "DISPUTED") { res.status(400).json({ error: "No active dispute on this deal" }); return; }
  const dispute = await pool.query(`SELECT id FROM "DealDispute" WHERE "dealId"=$1 AND "resolvedAt" IS NULL`, [id]);
  if (dispute.rows.length === 0) { res.status(400).json({ error: "Dispute record not found" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE "DealDispute" SET "adminDecision"='CANCELLED', "adminNotes"=$2, "resolvedBy"=$3, "resolvedAt"=NOW() WHERE id=$1`,
      [dispute.rows[0].id, "Admin: dispute cancelled — creator content verified live.", adminId ?? null]
    );
    await client.query(
      `UPDATE "Deal" SET status='DISPUTE_WINDOW_OPEN', "disputeOutcome"='CANCELLED' WHERE id=$1`,
      [id]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  await createSystemMessage(id!, `✅ Admin cancelled the dispute — creator content verified as live. Dispute window continues. Payout will be released normally after the window.`);
  const p = await getDealParticipants(id!);
  if (p) {
    await Promise.all([
      createNotification({
        userId: p.brandId, userType: "BRAND", type: "DEAL_DISPUTE_RESOLVED",
        title: "Dispute closed",
        body: "The dispute was closed. Creator content is verified live.",
        relatedEntityType: "DEAL", relatedEntityId: id!,
        emailTemplateId: 64, emailSubject: "Dispute closed",
      }),
      createNotification({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_DISPUTE_RESOLVED",
        title: "Dispute resolved in your favor",
        body: "The dispute was closed. Your payout will continue normally.",
        relatedEntityType: "DEAL", relatedEntityId: id!,
        emailTemplateId: 65, emailSubject: "Dispute resolved in your favour",
      }),
      createPopup({
        userId: p.brandId, userType: "BRAND", type: "DEAL_DISPUTE_RESOLVED",
        title: "Dispute Closed",
        body: "The dispute was closed because the creator content is live and active.",
        ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=live",
        relatedEntityId: id!,
      }),
      createPopup({
        userId: p.creatorId, userType: "CREATOR", type: "DEAL_DISPUTE_RESOLVED",
        title: "Dispute Resolved ✅",
        body: "The dispute was closed successfully and your payout process will continue.",
        ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=live",
        relatedEntityId: id!,
      }),
    ]);
  }
  res.json({ ok: true });
});

// =====================================================
// PAYOUT
// =====================================================

router.post("/admin/deals/:id/simulate-payout", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, null, "ADMIN");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  const d = v.deal!;
  const PAYOUT_ELIGIBLE = ["COMPLETED","CONTENT_APPROVED","DISPUTE_WINDOW_OPEN","FINAL_POST_CONFIRMED","PENDING_PAYMENT","IN_ESCROW","IN_PROGRESS","OVERDUE"];
  if (!PAYOUT_ELIGIBLE.includes(d.status)) { res.status(400).json({ error: "Deal is not in a payable state" }); return; }
  if (d.payoutStatus === "RELEASED") { res.status(400).json({ error: "Payout already released" }); return; }

  // Ensure extra payout columns exist
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "payoutAdjustmentReason" TEXT`);

  // Parse amount and optional adjustment reason
  const originalPayout = Number(d.creatorPayout) || 0;
  const bodyAmount = req.body?.amount !== undefined && req.body.amount !== "" ? Number(req.body.amount) : originalPayout;
  const adjustmentReason = ((req.body?.adjustmentReason as string | undefined) ?? "").trim();
  const amountChanged = Math.abs(bodyAmount - originalPayout) > 0.005;
  if (isNaN(bodyAmount) || bodyAmount < 0) { res.status(400).json({ error: "Invalid payment amount" }); return; }
  if (amountChanged && !adjustmentReason) { res.status(400).json({ error: "Reason is required when amount is adjusted" }); return; }

  const cr = await pool.query(`SELECT "kycStatus" FROM "Creator" WHERE id=$1`, [d.creatorId]);
  const kyc = cr.rows[0]?.kycStatus as string | undefined;
  if (kyc !== "VERIFIED") {
    await pool.query(`UPDATE "Deal" SET "payoutStatus"='PENDING_KYC' WHERE id=$1`, [id]);
    await createSystemMessage(id!, `💰 Payout blocked: creator KYC is ${kyc ?? "missing"}. Creator must complete KYC.`);
    await createNotification({
      userId: d.creatorId, userType: "CREATOR", type: "PAYOUT_PENDING_KYC",
      title: "Payout pending KYC",
      body: "Complete KYC verification to receive your payout.",
      relatedEntityType: "DEAL", relatedEntityId: id!,
    });
    await createPopup({
      userId: d.creatorId, userType: "CREATOR", type: "PAYOUT_PENDING_KYC",
      title: "KYC Required for Payout",
      body: "Your payout is ready but we can't process it without your KYC. Please update your details immediately.",
      ctaText: "Update KYC →", ctaPath: "/home-creator/kyc",
      secondCtaText: "Later",
      isCelebration: false, relatedEntityId: id!,
    });
    res.json({ ok: true, payoutStatus: "PENDING_KYC" });
    return;
  }

  const ref = (req.body?.payoutReferenceId as string | undefined)?.trim() || `PAY_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const finalPayout = bodyAmount;
  await pool.query(
    `UPDATE "Deal" SET "payoutStatus"='RELEASED', "payoutReleasedAt"=NOW(), "payoutReferenceId"=$2,
                       "paidAmount"=$3, "payoutAdjustmentReason"=$4
     WHERE id=$1`,
    [id, ref, finalPayout, adjustmentReason || null]
  );
  const deductionNote = amountChanged
    ? ` (adjusted from ₹${originalPayout.toFixed(2)}; reason: ${adjustmentReason})`
    : "";
  await createSystemMessage(id!, `💰 Payment released to creator: ₹${finalPayout.toFixed(2)}${deductionNote} (ref: ${ref}).`);
  await createNotification({
    userId: d.creatorId, userType: "CREATOR", type: "PAYOUT_RELEASED",
    title: "Payment received",
    body: `₹${finalPayout.toLocaleString("en-IN")} has been released to your account.${adjustmentReason ? ` Note: ${adjustmentReason}` : ""} Ref: ${ref}.`,
    relatedEntityType: "DEAL", relatedEntityId: id!,
    emailParams: { reference: ref, amount: Math.round(finalPayout) },
  });
  await createPopup({
    userId: d.creatorId, userType: "CREATOR", type: "PAYOUT_RELEASED",
    title: "Payment Released! 💸",
    body: `₹${finalPayout.toLocaleString("en-IN")} has been sent to your account.${adjustmentReason ? ` Note: ${adjustmentReason}` : ""}`,
    ctaText: "View Deals", ctaPath: "/home-creator/deals?tab=completed",
    isCelebration: true, relatedEntityId: id!,
  });
  res.json({ ok: true, payoutStatus: "RELEASED", payoutReferenceId: ref, paidAmount: finalPayout });
});

// =====================================================
// ADMIN: REFUND BRAND
// =====================================================

router.post("/admin/deals/:id/refund-brand", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;

  // Ensure refund columns exist
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "refundAmount" DECIMAL(12,2)`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "refundReason" TEXT`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMPTZ`);

  const dealRes = await pool.query(`SELECT * FROM "Deal" WHERE id=$1`, [id]);
  if (dealRes.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
  const d = dealRes.rows[0];

  if (d.payoutStatus === "RELEASED") {
    res.status(400).json({ error: "Cannot refund — payment already released to creator" }); return;
  }
  if (d.payoutStatus === "REFUNDED_TO_BRAND") {
    res.status(400).json({ error: "Brand has already been refunded" }); return;
  }

  const refundAmount = Number(req.body?.refundAmount);
  const refundReason = ((req.body?.refundReason as string | undefined) ?? "").trim();

  if (isNaN(refundAmount) || refundAmount < 0) {
    res.status(400).json({ error: "Invalid refund amount" }); return;
  }
  if (!refundReason) { res.status(400).json({ error: "Refund reason is required" }); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE "Deal"
       SET "payoutStatus"='REFUNDED_TO_BRAND',
           "escrowStatus"='REFUNDED',
           "refundAmount"=$2,
           "refundReason"=$3,
           "refundedAt"=NOW(),
           status='CANCELLED',
           "cancelledAt"=NOW(),
           "cancelledByType"='ADMIN_REFUND'
       WHERE id=$1`,
      [id, refundAmount, refundReason]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); client.release(); throw e; }
  finally { client.release(); }

  await createSystemMessage(id!, `❌ Deal cancelled by Collabry. ₹${refundAmount.toLocaleString("en-IN")} refunded to brand. Reason: ${refundReason}`);

  const p = await getDealParticipants(id!);
  if (p) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CANCELLED",
      title: "Deal cancelled by Collabry",
      body: `This deal has been cancelled by Collabry. ₹${refundAmount.toLocaleString("en-IN")} has been refunded to your account. Reason: ${refundReason}`,
      relatedEntityType: "DEAL", relatedEntityId: id!,
      emailTemplateId: 69, emailSubject: "Deal cancelled by Collabry",
      emailParams: { reason: refundReason, amount: Math.round(refundAmount) },
    });
    await createPopup({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CANCELLED",
      title: "Deal Cancelled by Collabry",
      body: `This deal has been cancelled by Collabry. ₹${refundAmount.toLocaleString("en-IN")} has been refunded to your account.\n\nReason: ${refundReason}`,
      ctaText: "View Cancelled Deal", ctaPath: "/home-brand/deals?tab=cancelled",
      isCelebration: false, relatedEntityId: id!,
    });
    await createNotification({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CANCELLED",
      title: "Deal cancelled by Collabry",
      body: `This deal has been cancelled by Collabry. Reason: ${refundReason}`,
      relatedEntityType: "DEAL", relatedEntityId: id!,
      emailTemplateId: 70, emailSubject: "Deal cancelled by Collabry",
      emailParams: { reason: refundReason },
    });
    await createPopup({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CANCELLED",
      title: "Deal Cancelled by Collabry",
      body: `This deal has been cancelled by Collabry.\n\nReason: ${refundReason}`,
      ctaText: "View Cancelled Deal", ctaPath: "/home-creator/deals?tab=cancelled",
      isCelebration: false, relatedEntityId: id!,
    });
  }

  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId","entityType","entityId",action,reason,"createdAt")
     VALUES (gen_random_uuid(),$1,'Deal',$2,'REFUND_BRAND',$3,NOW())`,
    [adminId, id, refundReason]
  );

  res.json({ ok: true, refundAmount, refundedAt: new Date().toISOString() });
});

// =====================================================
// RATINGS
// =====================================================

router.post("/brand/deals/:id/rate", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!["COMPLETED", "DISPUTE_WINDOW_OPEN"].includes(v.deal!.status)) { res.status(400).json({ error: "Can only rate after deal completion" }); return; }
  const ratingNum = Number(req.body?.rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    res.status(400).json({ error: "Rating must be an integer 1–5" }); return;
  }
  const reviewText = ((req.body?.reviewText as string | undefined) ?? "").trim();
  if (reviewText.length > 250) { res.status(400).json({ error: "Review text max 250 characters" }); return; }
  try {
    await pool.query(
      `INSERT INTO "CreatorRating" (id,"dealId","creatorId","brandId",rating,"reviewText","createdAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,NOW())`,
      [id, v.deal!.creatorId, brandId, ratingNum, reviewText || null]
    );
  } catch (e: any) {
    if (e?.code === "23505") { res.status(400).json({ error: "You have already rated this deal" }); return; }
    throw e;
  }
  await recalculateCreatorRating(v.deal!.creatorId);
  res.json({ ok: true });
});

router.get("/brand/deals/:id/my-rating", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const r = await pool.query(
    `SELECT id, rating, "reviewText", "createdAt" FROM "CreatorRating"
     WHERE "dealId"=$1 AND "brandId"=$2 AND "deletedAt" IS NULL`,
    [id, brandId]
  );
  res.json({ rating: r.rows[0] ?? null });
});

router.delete("/admin/ratings/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string | undefined;
  const { id } = req.params as Record<string, string>;
  const r = await pool.query(`SELECT "creatorId","deletedAt" FROM "CreatorRating" WHERE id=$1`, [id]);
  if (r.rows.length === 0) { res.status(404).json({ error: "Rating not found" }); return; }
  if (r.rows[0].deletedAt) { res.status(400).json({ error: "Already deleted" }); return; }
  await pool.query(
    `UPDATE "CreatorRating" SET "deletedAt"=NOW(), "deletedBy"=$2 WHERE id=$1`,
    [id, adminId ?? null]
  );
  await recalculateCreatorRating(r.rows[0].creatorId);
  res.json({ ok: true });
});

// Public-ish: ratings list for an unlocked creator (used by BrandCreatorProfile).
// Requires brand auth so we can scope; but simply returns aggregate + reviews.
router.get("/brand/creators/:id/ratings", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const agg = await pool.query(
    `SELECT COALESCE(AVG(rating)::numeric(3,2),0) AS avg, COUNT(*)::int AS cnt
     FROM "CreatorRating" WHERE "creatorId"=$1 AND "deletedAt" IS NULL`,
    [id]
  );
  const reviews = await pool.query(
    `SELECT cr.id, cr.rating, cr."reviewText", cr."createdAt", b."brandName"
     FROM "CreatorRating" cr
     JOIN "Brand" b ON b.id=cr."brandId"
     WHERE cr."creatorId"=$1 AND cr."deletedAt" IS NULL
     ORDER BY cr."createdAt" DESC LIMIT 50`,
    [id]
  );
  res.json({
    averageRating: parseInt(agg.rows[0].cnt, 10) > 0 ? parseFloat(agg.rows[0].avg) : null,
    ratingCount: parseInt(agg.rows[0].cnt, 10),
    reviews: reviews.rows.map(r => ({
      id: r.id, rating: r.rating, reviewText: r.reviewText, createdAt: r.createdAt, brandName: r.brandName,
    })),
  });
});

// Creator: view their own ratings/reviews
router.get("/creator/ratings", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const agg = await pool.query(
    `SELECT COALESCE(AVG(rating)::numeric(3,2),0) AS avg, COUNT(*)::int AS cnt
     FROM "CreatorRating" WHERE "creatorId"=$1 AND "deletedAt" IS NULL`,
    [creatorId]
  );
  const reviews = await pool.query(
    `SELECT cr.id, cr.rating, cr."reviewText", cr."createdAt", b."brandName"
     FROM "CreatorRating" cr
     JOIN "Brand" b ON b.id=cr."brandId"
     WHERE cr."creatorId"=$1 AND cr."deletedAt" IS NULL
     ORDER BY cr."createdAt" DESC LIMIT 50`,
    [creatorId]
  );
  res.json({
    averageRating: parseInt(agg.rows[0].cnt, 10) > 0 ? parseFloat(agg.rows[0].avg) : null,
    ratingCount: parseInt(agg.rows[0].cnt, 10),
    reviews: reviews.rows.map(r => ({
      id: r.id, rating: r.rating, reviewText: r.reviewText, createdAt: r.createdAt, brandName: r.brandName,
    })),
  });
});

// =====================================================
// CONCEPT-STAGE EXIT / CANCEL (100% brand refund)
// =====================================================
// Allowed only while the deal is still at the concept stage AND no product has shipped.
// Both endpoints converge on a single helper to keep refund/cancel logic identical.

const CONCEPT_EXIT_ALLOWED_STATUSES = ["IN_ESCROW", "CONCEPT_SUBMITTED", "REVISION_REQUESTED"];

async function performConceptStageCancel(
  dealId: string,
  args: {
    cancelledByType: string;
    reason: string;
    systemMsg: string;
    requireInactiveDays?: number; // re-validate under lock (used by brand cancel)
  }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dr = await client.query(`SELECT * FROM "Deal" WHERE id=$1 FOR UPDATE`, [dealId]);
    if (dr.rows.length === 0) { await client.query("ROLLBACK"); return { ok: false, status: 404, error: "Deal not found" }; }
    const d = dr.rows[0];
    if (!CONCEPT_EXIT_ALLOWED_STATUSES.includes(d.status) || d.conceptApprovedAt) {
      await client.query("ROLLBACK");
      return { ok: false, status: 400, error: "Deal is past the concept stage and can no longer be cancelled here" };
    }
    if (d.productShippedAt || d.awbNumber) {
      await client.query("ROLLBACK");
      return { ok: false, status: 400, error: "Product already shipped — use the shipping/dispute flow instead" };
    }
    if (typeof args.requireInactiveDays === "number") {
      // Re-check under lock to close TOCTOU: creator may have just submitted/resubmitted.
      const due = d.creatorActionDueSince ? new Date(d.creatorActionDueSince).getTime() : null;
      const days = due ? (Date.now() - due) / 86400000 : 0;
      if (!due || days < args.requireInactiveDays) {
        await client.query("ROLLBACK");
        return { ok: false, status: 400, error: `Creator is no longer inactive (${days.toFixed(1)} days)` };
      }
    }
    await client.query(
      `UPDATE "Deal"
         SET status='CANCELLED',
             "cancelledAt"=NOW(),
             "cancelledByType"=$2,
             "rejectionReason"=$3,
             "escrowStatus"='REFUNDED',
             "creatorActionDueSince"=NULL,
             "conceptInactivityStage"=0
       WHERE id=$1`,
      [dealId, args.cancelledByType, args.reason]
    );
    // Refund any held campaign-slot credits if applicable (mirrors campaigns.ts pattern).
    await client.query(
      `UPDATE "CampaignSlot" SET "refundedAt"=NOW(), "escrowStatus"='REFUNDED'
       WHERE "dealId"=$1 AND "refundedAt" IS NULL`,
      [dealId]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  await createSystemMessage(dealId, args.systemMsg);
  const p = await getDealParticipants(dealId);
  if (p) {
    await createNotification({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CANCELLED",
      title: "Deal cancelled — escrow refunded",
      body: "The deal was cancelled at the concept stage and your escrow has been refunded in full.",
      relatedEntityType: "Deal", relatedEntityId: dealId,
      emailTemplateId: 71, emailSubject: "Deal cancelled at concept stage",
    });
    await createPopup({
      userId: p.brandId, userType: "BRAND", type: "DEAL_CANCELLED",
      title: "Creator Exited Deal",
      body: "The creator exited the collaboration deal at the concept stage. Your escrow has been refunded in full.",
      ctaText: "View Details", ctaPath: "/home-brand/deals?tab=cancelled",
      isCelebration: false, relatedEntityId: dealId,
    });
    await createNotification({
      userId: p.creatorId, userType: "CREATOR", type: "DEAL_CANCELLED",
      title: "Deal cancelled",
      body: "The deal was cancelled at the concept stage.",
      relatedEntityType: "Deal", relatedEntityId: dealId,
      emailTemplateId: 72, emailSubject: "Deal cancelled at concept stage",
    });
  }
  // Decrement campaign/barter slotsFilled and restore LIVE if needed
  const { handleCampaignDealCancelled } = await import("./campaigns");
  await handleCampaignDealCancelled(dealId);
  return { ok: true };
}

// Creator may exit any time during the concept stage — no questions asked.
router.post("/creator/deals/:id/exit-at-concept", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyDeal(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  const result = await performConceptStageCancel(id!, {
    cancelledByType: "CREATOR_EXIT_AT_CONCEPT",
    reason: "Creator exited at concept stage",
    systemMsg: "↩️ Creator exited the deal at the concept stage. Brand's escrow has been refunded in full.",
  });
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ ok: true });
});

// =====================================================
// PRODUCT FLOW STATUS GATES (overridden behavior — see dealChat.ts for original)
// =====================================================
// These wrap the existing product-shipped/received flow with the new state machine.

router.post("/brand/deals/:id/product-shipped-v2", requireBrand, async (req: Request, res: Response): Promise<void> => {
  // Kept inline in dealChat.ts; this endpoint simply enforces the new gate by delegating logic.
  // Use the dealChat.ts route — this stub exists only to document the contract.
  res.status(410).json({ error: "Use /brand/deals/:id/product-shipped" });
});

export default router;
