import { pool } from "@workspace/db";
import { createSystemMessage } from "../dealChat";
import { createNotification } from "../notifications";
import { createPopup } from "../popups";
import {
  ensureSubmissionAndInactivitySchema,
  markLatestSubmissionOutcome,
} from "../dealSubmissions";

const AUTO_APPROVE_HOURS = 48;

// Concept-stage creator inactivity escalation (days since creatorActionDueSince).
// Stages: 2 = 48h early nudge, 3 = nudge. Deal expires via single deadline (deadlineAt).
// Brand-posted deals (postedBy='BRAND') skip this — there is no creator concept step.
const CONCEPT_EARLY_NUDGE_DAY = 2;
const CONCEPT_NUDGE_DAY = 3;

// Final-stage creator inactivity escalation (days since contentApprovedAt) — nudges only,
// admin must trigger any cancel manually.
const FINAL_NUDGE_DAY = 5;
const FINAL_WARN_DAY = 7;
const FINAL_ESCALATE_DAY = 10;

async function autoApproveConcepts(): Promise<void> {
  // Use the precise per-slot conceptSubmittedAt timestamp instead of LIKE-matching system messages.
  const stale = await pool.query(
    `SELECT dd.id AS slot_id, dd."dealId", dd."slotLabel"
     FROM "DealDeliverable" dd
     JOIN "Deal" d ON d.id=dd."dealId"
     WHERE dd."conceptStatus"='SUBMITTED'
       AND dd."conceptSubmittedAt" IS NOT NULL
       AND dd."conceptSubmittedAt" <= NOW() - ($1 || ' hours')::interval
       AND d.status IN ('CONCEPT_SUBMITTED','REVISION_REQUESTED')`,
    [AUTO_APPROVE_HOURS]
  );
  for (const row of stale.rows) {
    const upd = await pool.query(
      `UPDATE "DealDeliverable" SET "conceptStatus"='APPROVED' WHERE id=$1 AND "conceptStatus"='SUBMITTED' RETURNING id`,
      [row.slot_id]
    );
    if (upd.rowCount && upd.rowCount > 0) {
      await markLatestSubmissionOutcome(pool, {
        deliverableId: row.slot_id, stage: "CONCEPT", outcome: "APPROVED", reviewedBy: "AUTO",
      });
      await createSystemMessage(row.dealId, `⏱ Concept auto-approved (${row.slotLabel}): brand did not respond within ${AUTO_APPROVE_HOURS}h.`);
    }
  }
  const dealsToCheck = Array.from(new Set(stale.rows.map(r => r.dealId)));
  for (const dealId of dealsToCheck) {
    await maybeFinalizeConceptApproval(dealId);
  }
}

async function autoApproveContent(): Promise<void> {
  const stale = await pool.query(
    `SELECT dd.id AS slot_id, dd."dealId", dd."slotLabel"
     FROM "DealDeliverable" dd
     JOIN "Deal" d ON d.id=dd."dealId"
     WHERE dd."finalStatus"='SUBMITTED'
       AND dd."finalSubmittedAt" IS NOT NULL
       AND dd."finalSubmittedAt" <= NOW() - ($1 || ' hours')::interval
       AND d.status IN ('CONTENT_UPLOADED','REVISION_REQUESTED')`,
    [AUTO_APPROVE_HOURS]
  );
  for (const row of stale.rows) {
    const upd = await pool.query(
      `UPDATE "DealDeliverable" SET "finalStatus"='APPROVED' WHERE id=$1 AND "finalStatus"='SUBMITTED' RETURNING id`,
      [row.slot_id]
    );
    if (upd.rowCount && upd.rowCount > 0) {
      await markLatestSubmissionOutcome(pool, {
        deliverableId: row.slot_id, stage: "FINAL", outcome: "APPROVED", reviewedBy: "AUTO",
      });
      await createSystemMessage(row.dealId, `⏱ Content auto-approved (${row.slotLabel}): brand did not respond within ${AUTO_APPROVE_HOURS}h.`);
    }
  }
  const dealsToCheck = Array.from(new Set(stale.rows.map(r => r.dealId)));
  for (const dealId of dealsToCheck) {
    await maybeFinalizeContentApproval(dealId);
  }
}

async function autoCloseDisputeWindows(): Promise<void> {
  const r = await pool.query(
    `SELECT id, "creatorId", "brandId" FROM "Deal"
     WHERE status='DISPUTE_WINDOW_OPEN' AND "disputeWindowEnd" IS NOT NULL AND "disputeWindowEnd" <= NOW()`
  );
  for (const d of r.rows) {
    await pool.query(
      `UPDATE "Deal" SET status='COMPLETED', "completedAt"=NOW() WHERE id=$1 AND status='DISPUTE_WINDOW_OPEN'`,
      [d.id]
    );
    await createSystemMessage(d.id, `🎉 Dispute window closed without disputes — deal completed. Payout will be released shortly.`);
    await createNotification({
      userId: d.creatorId, userType: "CREATOR", type: "DEAL_COMPLETED",
      title: "Deal completed", body: "Dispute window closed. Payout will be released shortly.",
      relatedEntityType: "DEAL", relatedEntityId: d.id,
    });
    await createNotification({
      userId: d.brandId, userType: "BRAND", type: "DEAL_COMPLETED",
      title: "Deal completed", body: "Don't forget to rate the creator.",
      relatedEntityType: "DEAL", relatedEntityId: d.id,
    });
    // Re-lock: remove unlock record only if no other active deal exists for this pair.
    const otherActive = await pool.query(
      `SELECT id FROM "Deal"
       WHERE "brandId"=$1 AND "creatorId"=$2
         AND status NOT IN ('COMPLETED','CANCELLED','REJECTED')
         AND id!=$3
       LIMIT 1`,
      [d.brandId, d.creatorId, d.id]
    );
    if (otherActive.rows.length === 0) {
      await pool.query(
        `DELETE FROM "BrandUnlockRecord" WHERE "brandId"=$1 AND "creatorId"=$2`,
        [d.brandId, d.creatorId]
      );
    }
  }
}

// Internal copies of finalize helpers using FOR UPDATE locking to avoid races.
async function maybeFinalizeConceptApproval(dealId: string): Promise<void> {
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
         "timelineStartAt"=NOW(), "deadlineAt"=NOW() + ("timelineDays" || ' days')::interval,
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
    await createSystemMessage(dealId, `✅ All concepts approved! Timeline started.`);
  }
}

async function maybeFinalizeContentApproval(dealId: string): Promise<void> {
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
      // Creator now needs to publish on Instagram — start final-stage inactivity tracking.
      await client.query(
        `UPDATE "Deal" SET status='CONTENT_APPROVED', "contentApprovedAt"=NOW(),
                           "creatorActionDueSince"=NOW(), "finalInactivityStage"=0
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
    await createSystemMessage(dealId, `✅ Content approved — deal complete!`);
  } else {
    await createSystemMessage(dealId, `✅ All content approved! Creator, please publish on Instagram and submit live URLs.`);
  }
}

// ─── SHIPPING JOBS ────────────────────────────────────────────────────────────

// Auto-cancel deals where brand never responded to AWB-wrong claim within deadline
async function autoCancelStaleAwbWrong(): Promise<void> {
  const r = await pool.query(
    `SELECT id, "brandId", "creatorId" FROM "Deal"
     WHERE "awb_wrong_deadline" IS NOT NULL
       AND "awb_wrong_deadline" <= NOW()
       AND "awb_locked"=false
       AND status='PRODUCT_SHIPPED'
       AND "productReceivedAt" IS NULL`
  );
  for (const d of r.rows) {
    await pool.query(
      `UPDATE "Deal"
       SET status='CANCELLED',
           "cancelledAt"=NOW(),
           "cancelledByType"='AUTO_AWB_WRONG_TIMEOUT',
           "rejectionReason"='Brand did not respond to AWB-wrong claim within deadline',
           "escrowStatus"='REFUNDED',
           "awb_wrong_deadline"=NULL,
           "awb_wrong_raised_at"=NULL
       WHERE id=$1 AND status='PRODUCT_SHIPPED' AND "awb_locked"=false`,
      [d.id]
    );
    await createSystemMessage(d.id, `⏱ Brand did not respond to the AWB-wrong claim within the deadline. Deal auto-cancelled and escrow refunded.`);
    await createNotification({
      userId: d.brandId, userType: "BRAND", type: "AWB_WRONG_AUTO_CANCEL",
      title: "Deal auto-cancelled — no AWB response",
      body: "You did not respond to the creator's AWB-wrong claim within the deadline. The deal was cancelled and the escrow was refunded.",
      relatedEntityType: "Deal", relatedEntityId: d.id,
      emailTemplateId: 55, emailSubject: "Deal auto-cancelled — no AWB response",
    });
    await createNotification({
      userId: d.creatorId, userType: "CREATOR", type: "AWB_WRONG_AUTO_CANCEL",
      title: "Deal auto-cancelled",
      body: "Brand did not respond in time. The deal has been cancelled.",
      relatedEntityType: "Deal", relatedEntityId: d.id,
      emailTemplateId: 56, emailSubject: "Deal auto-cancelled",
    });
  }
}

// Auto-cancel deals where brand never responded to product-issue within deadline.
// Per spec: brand must respond with reship/make-it/cancel; if silent, default to CANCEL (creator already says it's bad).
async function autoCancelStaleProductIssue(): Promise<void> {
  const r = await pool.query(
    `SELECT id, "brandId", "creatorId" FROM "Deal"
     WHERE "brand_response_deadline" IS NOT NULL
       AND "brand_response_deadline" <= NOW()
       AND status='PRODUCT_ISSUE_RAISED'
       AND "product_issue_raised"=true`
  );
  for (const d of r.rows) {
    await pool.query(
      `UPDATE "Deal"
       SET status='CANCELLED',
           "cancelledAt"=NOW(),
           "cancelledByType"='AUTO_ISSUE_TIMEOUT',
           "rejectionReason"='Brand did not respond to product issue within deadline',
           "escrowStatus"='REFUNDED',
           "product_issue_response"='CANCEL',
           "issue_resolved_at"=NOW(),
           "brand_response_deadline"=NULL,
           "productIssueStatus"='RESOLVED_CANCELLED'
       WHERE id=$1 AND status='PRODUCT_ISSUE_RAISED'`,
      [d.id]
    );
    await createSystemMessage(d.id, `⏱ Brand did not respond to the product issue within the deadline. Deal auto-cancelled and escrow refunded.`);
    await createNotification({
      userId: d.brandId, userType: "BRAND", type: "PRODUCT_ISSUE_AUTO_CANCEL",
      title: "Deal auto-cancelled — no issue response",
      body: "You did not respond to the creator's product issue within the deadline. The deal was cancelled.",
      relatedEntityType: "Deal", relatedEntityId: d.id,
      emailTemplateId: 57, emailSubject: "Deal auto-cancelled — no issue response",
    });
    await createNotification({
      userId: d.creatorId, userType: "CREATOR", type: "PRODUCT_ISSUE_AUTO_CANCEL",
      title: "Deal auto-cancelled",
      body: "Brand did not respond in time. The deal has been cancelled.",
      relatedEntityType: "Deal", relatedEntityId: d.id,
      emailTemplateId: 58, emailSubject: "Deal auto-cancelled",
    });
  }
}

// Day-N delivery warning to creator (default: day 8 from snapshot, before non-delivery cap)
async function warnDeliveryDeadlineApproaching(): Promise<void> {
  const r = await pool.query(
    `SELECT id, "creatorId", "brandId", "shipDate", "delivery_warning_day_snapshot",
            "max_delivery_days_snapshot", "delivery_extended_until"
     FROM "Deal"
     WHERE status='PRODUCT_SHIPPED'
       AND "productReceivedAt" IS NULL
       AND "shipDate" IS NOT NULL
       AND "delivery_warning_sent_at" IS NULL`
  );
  for (const d of r.rows) {
    const warnDay = d.delivery_warning_day_snapshot ?? 8;
    const ref = d.delivery_extended_until ? new Date(d.delivery_extended_until) : new Date(d.shipDate);
    const daysSince = Math.floor((Date.now() - ref.getTime()) / 86400000);
    if (daysSince < warnDay) continue;
    await pool.query(
      `UPDATE "Deal" SET "delivery_warning_sent_at"=NOW() WHERE id=$1 AND "delivery_warning_sent_at" IS NULL`,
      [d.id]
    );
    await createSystemMessage(
      d.id,
      `⏰ Day ${warnDay} reached since shipment — if the product hasn't arrived, you'll be able to report non-delivery on day ${d.max_delivery_days_snapshot ?? 10}.`,
      { kind: "DELIVERY_WARNING" }
    );
    await createNotification({
      userId: d.creatorId, userType: "CREATOR", type: "DELIVERY_WARNING",
      title: "Product not delivered yet?",
      body: `It's been ${warnDay} days since shipment. If the product still hasn't arrived, you can report non-delivery on day ${d.max_delivery_days_snapshot ?? 10}.`,
      relatedEntityType: "Deal", relatedEntityId: d.id,
      emailTemplateId: 53, emailSubject: "Product not delivered yet?",
      emailParams: { day: warnDay },
    });
    await createNotification({
      userId: d.brandId, userType: "BRAND", type: "DELIVERY_WARNING",
      title: "Creator hasn't received the product",
      body: `${warnDay} days since shipment with no receipt. Please verify shipment status with your courier.`,
      relatedEntityType: "Deal", relatedEntityId: d.id,
      emailTemplateId: 54, emailSubject: "Creator hasn't received the product",
      emailParams: { day: warnDay },
    });
  }
}

// Daily image cleanup: clear product_issue_images from cancelled deals after retention window
async function cleanupExpiredIssueImages(): Promise<void> {
  await pool.query(
    `UPDATE "Deal"
     SET "product_issue_images"=NULL
     WHERE status='CANCELLED'
       AND "product_issue_images" IS NOT NULL
       AND "issue_resolved_at" IS NOT NULL
       AND "issue_resolved_at" <= NOW() - (COALESCE("image_retention_days_snapshot", 7) || ' days')::interval`
  );
}

// ─── Chat retention: ensure column exists ─────────────────────────────────────
async function ensureChatDeletedAtColumn(): Promise<void> {
  await pool.query(
    `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "chatDeletedAt" TIMESTAMPTZ NULL`
  );
}

// ─── CONCEPT-STAGE creator inactivity escalation ──────────────────────────────
// Day 3 → nudge, Day 5 → warning, Day 7 → auto-cancel + 100% brand refund.
async function escalateConceptInactivity(): Promise<void> {
  const r = await pool.query(
    `SELECT id, "brandId", "creatorId", "conceptInactivityStage",
            EXTRACT(EPOCH FROM (NOW() - "creatorActionDueSince"))/86400.0 AS days
       FROM "Deal"
      WHERE status IN ('IN_ESCROW','REVISION_REQUESTED')
        AND "conceptApprovedAt" IS NULL
        AND "creatorActionDueSince" IS NOT NULL
        AND COALESCE("postedBy",'CREATOR') != 'BRAND'`
  );
  for (const d of r.rows) {
    const stage = d.conceptInactivityStage ?? 0;
    const days = Number(d.days) || 0;
    // Day-3 nudge.
    if (days >= CONCEPT_NUDGE_DAY && stage < CONCEPT_NUDGE_DAY) {
      await pool.query(`UPDATE "Deal" SET "conceptInactivityStage"=$2 WHERE id=$1`, [d.id, CONCEPT_NUDGE_DAY]);
      await createSystemMessage(d.id, `🔔 Reminder — please submit or resubmit your concept to keep the deal moving.`);
      await createNotification({
        userId: d.creatorId, userType: "CREATOR", type: "DEAL_INACTIVITY_NUDGE",
        title: "Concept submission pending",
        body: "Submit your concept to keep the deal moving before the deadline.",
        relatedEntityType: "Deal", relatedEntityId: d.id,
        emailTemplateId: 41, emailSubject: "Reminder — submit your concept",
      });
      continue;
    }
    // 48h early nudge — gentle reminder, no penalty.
    if (days >= CONCEPT_EARLY_NUDGE_DAY && stage < CONCEPT_EARLY_NUDGE_DAY) {
      await pool.query(`UPDATE "Deal" SET "conceptInactivityStage"=$2 WHERE id=$1`, [d.id, CONCEPT_EARLY_NUDGE_DAY]);
      await createNotification({
        userId: d.creatorId, userType: "CREATOR", type: "DEAL_INACTIVITY_EARLY_NUDGE",
        title: "Time is Running",
        body: "Upload your concept video to keep the collaboration moving smoothly.",
        relatedEntityType: "Deal", relatedEntityId: d.id,
        emailTemplateId: 40, emailSubject: "Time is running — upload your concept",
      });
      await createPopup({
        userId: d.creatorId as string, userType: "CREATOR", type: "DEAL_INACTIVITY_EARLY_NUDGE",
        title: "Time is Running",
        body: "Upload your concept video to keep the collaboration moving smoothly.",
        ctaText: "Upload Now", ctaPath: "/home-creator/deals?tab=live",
        secondCtaText: "View Deal", secondCtaPath: "/home-creator/deals?tab=live",
        isCelebration: false, relatedEntityId: d.id,
      }).catch(() => {});
    }
  }
}

// ─── FINAL-STAGE creator inactivity escalation ────────────────────────────────
// Day 5 / 7 / 10 nudges (creator hasn't published live URL after content was approved).
// No auto-cancel — admin must trigger any action.
async function escalateFinalInactivity(): Promise<void> {
  const r = await pool.query(
    `SELECT id, "brandId", "creatorId", "finalInactivityStage",
            EXTRACT(EPOCH FROM (NOW() - "contentApprovedAt"))/86400.0 AS days
       FROM "Deal"
      WHERE status='CONTENT_APPROVED'
        AND "contentApprovedAt" IS NOT NULL
        AND COALESCE("postedBy",'CREATOR') != 'BRAND'`
  );
  for (const d of r.rows) {
    const stage = d.finalInactivityStage ?? 0;
    const days = Number(d.days) || 0;
    if (days >= FINAL_ESCALATE_DAY && stage < FINAL_ESCALATE_DAY) {
      await pool.query(`UPDATE "Deal" SET "finalInactivityStage"=$2 WHERE id=$1`, [d.id, FINAL_ESCALATE_DAY]);
      await createSystemMessage(d.id, `🚨 Day ${FINAL_ESCALATE_DAY} — content still not published. Admin has been notified to review this deal.`);
      await createNotification({
        userId: d.brandId, userType: "BRAND", type: "DEAL_FINAL_INACTIVITY_ESCALATED",
        title: "Creator hasn't published yet",
        body: `It's been ${FINAL_ESCALATE_DAY} days since content approval. Admin has been notified.`,
        relatedEntityType: "Deal", relatedEntityId: d.id,
        emailTemplateId: 44, emailSubject: "Creator hasn't published yet",
        emailParams: { day: FINAL_ESCALATE_DAY },
      });
      continue;
    }
    if (days >= FINAL_WARN_DAY && stage < FINAL_WARN_DAY) {
      await pool.query(`UPDATE "Deal" SET "finalInactivityStage"=$2 WHERE id=$1`, [d.id, FINAL_WARN_DAY]);
      await createSystemMessage(d.id, `⚠️ Day ${FINAL_WARN_DAY} — please publish on Instagram and submit the live URL.`);
      await createNotification({
        userId: d.creatorId, userType: "CREATOR", type: "DEAL_FINAL_INACTIVITY_WARNING",
        title: "Live URL still pending",
        body: "Publish on Instagram and submit the live URL to complete the deal.",
        relatedEntityType: "Deal", relatedEntityId: d.id,
        emailTemplateId: 43, emailSubject: "Live URL still pending",
        emailParams: { day: FINAL_WARN_DAY },
      });
      continue;
    }
    if (days >= FINAL_NUDGE_DAY && stage < FINAL_NUDGE_DAY) {
      await pool.query(`UPDATE "Deal" SET "finalInactivityStage"=$2 WHERE id=$1`, [d.id, FINAL_NUDGE_DAY]);
      await createSystemMessage(d.id, `🔔 Day ${FINAL_NUDGE_DAY} — friendly reminder for the creator to publish the approved content.`);
      await createNotification({
        userId: d.creatorId, userType: "CREATOR", type: "DEAL_FINAL_INACTIVITY_NUDGE",
        title: "Time to publish",
        body: "Your content was approved — publish on Instagram and submit the live URL.",
        relatedEntityType: "Deal", relatedEntityId: d.id,
        emailTemplateId: 42, emailSubject: "Time to publish",
        emailParams: { day: FINAL_NUDGE_DAY },
      });
    }
  }
}

// ─── Chat retention: delete chat after dispute window expires ─────────────────
// Permanently deletes DealMessage rows for completed deals whose dispute window
// has fully closed and no safety conditions (active dispute, unresolved escrow,
// or open admin action) are present.
async function deleteChatAfterDisputeExpiry(): Promise<void> {
  const eligible = await pool.query(
    `SELECT d.id
     FROM "Deal" d
     WHERE d.status = 'COMPLETED'
       AND d."disputeWindowEnd" IS NOT NULL
       AND d."disputeWindowEnd" <= NOW()
       AND d."chatDeletedAt" IS NULL
       -- Safety: no active dispute
       AND (d."disputeRaised" IS NULL OR d."disputeRaised" = false)
       -- Safety: no unresolved DealDispute record
       AND NOT EXISTS (
         SELECT 1 FROM "DealDispute" dd
         WHERE dd."dealId" = d.id AND dd."resolvedAt" IS NULL
       )
       -- Safety: escrow must be released or not tracked
       AND (d."escrowStatus" IS NULL OR d."escrowStatus" = 'RELEASED')`
  );

  for (const row of eligible.rows) {
    // Delete all messages for this deal
    await pool.query(`DELETE FROM "DealMessage" WHERE "dealId" = $1`, [row.id]);
    // Mark the deal so the API returns the archived state
    await pool.query(
      `UPDATE "Deal" SET "chatDeletedAt" = NOW() WHERE id = $1`,
      [row.id]
    );
  }
}

async function autoApproveExtensions(): Promise<void> {
  const stale = await pool.query(
    `SELECT dte.*, d."brandId", d."creatorId", d."deadlineAt"
     FROM "DealTimelineExtension" dte
     JOIN "Deal" d ON d.id = dte."dealId"
     WHERE dte.status = 'PENDING'
       AND dte."autoApproveDeadline" <= NOW()`
  );

  for (const ext of stale.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const base = ext.deadlineAt ? new Date(ext.deadlineAt) : new Date();
      const newDeadline = new Date(base.getTime() + Number(ext.extraDays) * 86_400_000);

      const upd = await client.query(
        `UPDATE "DealTimelineExtension"
         SET status='APPROVED', "approvedBy"='AUTO', "respondedAt"=NOW(), "newDeadline"=$1
         WHERE id=$2 AND status='PENDING'
         RETURNING id`,
        [newDeadline, ext.id]
      );
      if (!upd.rowCount || upd.rowCount === 0) { await client.query("ROLLBACK"); continue; }

      await client.query(
        `UPDATE "Deal"
         SET "deadlineAt"=$1, "timelineDays"="timelineDays"+$2
         WHERE id=$3`,
        [newDeadline, ext.extraDays, ext.dealId]
      );
      await client.query("COMMIT");

      const fmtDate = newDeadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      await createSystemMessage(
        ext.dealId,
        `⏱ Timeline extension auto-approved (brand did not respond within 48h). Extended by ${ext.extraDays} day(s). New deadline: ${fmtDate}.`
      );
      await createNotification({
        userId: ext.creatorId, userType: "CREATOR",
        type: "TIMELINE_EXTENSION_APPROVED",
        title: "Timeline Extension Auto-Approved ✅",
        body: `Your ${ext.extraDays}-day extension was auto-approved (brand didn't respond in 48h). New deadline: ${fmtDate}.`,
        relatedEntityType: "DEAL", relatedEntityId: ext.dealId,
        emailParams: { new_deadline: fmtDate },
      });
      await createNotification({
        userId: ext.brandId, userType: "BRAND",
        type: "TIMELINE_EXTENSION_APPROVED",
        title: "Timeline Extension Auto-Approved",
        body: `Creator's ${ext.extraDays}-day extension was auto-approved as you didn't respond within 48h. New deadline: ${fmtDate}.`,
        relatedEntityType: "DEAL", relatedEntityId: ext.dealId,
        emailTemplateId: 75, emailSubject: "Extension auto-approved",
        emailParams: { new_deadline: fmtDate, extension_days: ext.extraDays },
      });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("autoApproveExtensions error for ext", ext.id, e);
    } finally {
      client.release();
    }
  }
}

export async function runDealPipelineJob(): Promise<void> {
  try { await autoApproveExtensions(); } catch (e) { console.error("autoApproveExtensions error", e); }
  try { await autoApproveConcepts(); } catch (e) { console.error("autoApproveConcepts error", e); }
  try { await autoApproveContent(); } catch (e) { console.error("autoApproveContent error", e); }
  try { await autoCloseDisputeWindows(); } catch (e) { console.error("autoCloseDisputeWindows error", e); }
  try { await autoCancelStaleAwbWrong(); } catch (e) { console.error("autoCancelStaleAwbWrong error", e); }
  try { await autoCancelStaleProductIssue(); } catch (e) { console.error("autoCancelStaleProductIssue error", e); }
  try { await warnDeliveryDeadlineApproaching(); } catch (e) { console.error("warnDeliveryDeadlineApproaching error", e); }
  try { await cleanupExpiredIssueImages(); } catch (e) { console.error("cleanupExpiredIssueImages error", e); }
  try { await deleteChatAfterDisputeExpiry(); } catch (e) { console.error("deleteChatAfterDisputeExpiry error", e); }
  try { await escalateConceptInactivity(); } catch (e) { console.error("escalateConceptInactivity error", e); }
  try { await escalateFinalInactivity(); } catch (e) { console.error("escalateFinalInactivity error", e); }
}

export async function startDealPipelineJob(): Promise<void> {
  await ensureChatDeletedAtColumn().catch(e => console.error("ensureChatDeletedAtColumn error", e));
  await ensureSubmissionAndInactivitySchema().catch(e => console.error("ensureSubmissionAndInactivitySchema error", e));
  setInterval(runDealPipelineJob, 5 * 60 * 1000);
  runDealPipelineJob().catch(console.error);
}
