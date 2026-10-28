import { pool } from "@workspace/db";
import { createNotification } from "../notifications";
import { logger } from "../logger";

// Creator reminder two days before the deal deadline (AiSensy
// "2_days_left_in_deal_creator"). Same active statuses dealExpiry.ts expires,
// so a reminder is only sent for a deal that can still expire. The
// Notification row is the once-only marker per deal.
const TYPE = "DEAL_EXPIRING_SOON";

const ACTIVE_STATUSES = [
  "IN_ESCROW", "REVISION_REQUESTED", "CONCEPT_SUBMITTED", "CONCEPT_APPROVED",
  "CONTENT_SUBMITTED", "CONTENT_APPROVED", "CONTENT_UPLOADED",
  "PRODUCT_SHIPPED", "PRODUCT_RECEIVED", "PRODUCT_ISSUE_RAISED",
  "AWAITING_CREATOR_ISSUE_DECISION", "NON_DELIVERY_REPORTED",
  "POST_LIVE_PENDING", "URL_FLAGGED",
];

export async function runDealExpiringSoon(): Promise<void> {
  try {
    const due = await pool.query(
      `SELECT d.id, d."creatorId"
         FROM "Deal" d
        WHERE d."deadlineAt" IS NOT NULL
          AND d."deadlineAt" >  NOW()
          AND d."deadlineAt" <= NOW() + INTERVAL '2 days'
          AND d.status = ANY($1::text[])
          AND NOT EXISTS (
            SELECT 1 FROM "Notification" n
             WHERE n."userId" = d."creatorId" AND n.type = $2 AND n."relatedEntityId" = d.id
          )`,
      [ACTIVE_STATUSES, TYPE]
    );
    for (const deal of due.rows) {
      await createNotification({
        userId: deal.creatorId as string, userType: "CREATOR", type: TYPE,
        title: "2 days left in your deal",
        body: "Your deal deadline is 2 days away. Complete your pending steps before it expires.",
        relatedEntityType: "DEAL", relatedEntityId: deal.id as string,
        expiresInDays: 30,
      }).catch((err) => logger.error({ err, dealId: deal.id }, "Deal expiring-soon notification failed"));
    }
  } catch (e) {
    logger.error({ err: e }, "Deal expiring-soon job error");
  }
}

export function startDealExpiringSoonJob(): void {
  setInterval(runDealExpiringSoon, 10 * 60 * 1000);
  runDealExpiringSoon().catch(e => logger.error({ err: e }, "Initial deal expiring-soon sweep failed"));
}
