import { pool } from "@workspace/db";
import { createPopup } from "../popups";
import { logger } from "../logger";

const ACTIVE_STATUSES = [
  "IN_ESCROW", "REVISION_REQUESTED", "CONCEPT_SUBMITTED", "CONCEPT_APPROVED",
  "CONTENT_SUBMITTED", "CONTENT_APPROVED", "CONTENT_UPLOADED",
  "PRODUCT_SHIPPED", "PRODUCT_RECEIVED", "PRODUCT_ISSUE_RAISED",
  "AWAITING_CREATOR_ISSUE_DECISION", "NON_DELIVERY_REPORTED",
  "POST_LIVE_PENDING", "URL_FLAGGED",
];

export async function runDealExpiry(): Promise<void> {
  try {
    const expired = await pool.query(
      `SELECT d.id, d."creatorId", d."brandId"
       FROM "Deal" d
       WHERE d."deadlineAt" IS NOT NULL
         AND d."deadlineAt" < NOW()
         AND d.status = ANY($1::text[])`,
      [ACTIVE_STATUSES]
    );
    if (expired.rows.length === 0) return;
    logger.info({ count: expired.rows.length }, "Deal expiry: expiring deals");
    for (const deal of expired.rows) {
      try {
        const updated = await pool.query(
          `UPDATE "Deal" SET status='EXPIRED' WHERE id=$1 AND status = ANY($2::text[]) RETURNING id`,
          [deal.id, ACTIVE_STATUSES]
        );
        if (!updated.rows[0]) continue;
        const EXPIRED_BODY = "This deal expired because the timeline ended before completion. Contact Collabry support in case of disputes.";
        await pool.query(
          `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","createdAt","expiresAt")
           VALUES (gen_random_uuid()::text,$1,'CREATOR','DEAL_EXPIRED','Deal Expired',$2,
           false,NOW(),NOW()+INTERVAL '90 days')`,
          [deal.creatorId, EXPIRED_BODY]
        ).catch(() => {});
        await pool.query(
          `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","createdAt","expiresAt")
           VALUES (gen_random_uuid()::text,$1,'BRAND','DEAL_EXPIRED','Deal Expired',$2,
           false,NOW(),NOW()+INTERVAL '90 days')`,
          [deal.brandId, EXPIRED_BODY]
        ).catch(() => {});
        await createPopup({
          userId: deal.creatorId as string, userType: "CREATOR", type: "DEAL_EXPIRED",
          title: "Deal Expired",
          body: EXPIRED_BODY,
          ctaText: "View Deal", ctaPath: "/home-creator/deals?tab=cancelled",
          isCelebration: false, relatedEntityId: deal.id,
        }).catch(() => {});
        await createPopup({
          userId: deal.brandId as string, userType: "BRAND", type: "DEAL_EXPIRED",
          title: "Deal Expired",
          body: EXPIRED_BODY,
          ctaText: "View Deal", ctaPath: "/home-brand/deals?tab=cancelled",
          isCelebration: false, relatedEntityId: deal.id,
        }).catch(() => {});
      } catch (e) {
        logger.error({ err: e, dealId: deal.id }, "Deal expiry: single deal error");
      }
    }
  } catch (e) {
    logger.error({ err: e }, "Deal expiry job error");
  }
}

export function startDealExpiryJob(): void {
  setInterval(runDealExpiry, 60 * 1000);
  runDealExpiry().catch(e => logger.error({ err: e }, "Initial deal expiry sweep failed"));
}
