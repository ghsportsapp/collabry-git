import { pool } from "@workspace/db";
import { logger } from "../logger";
import { createNotification } from "../notifications";
import { createSystemMessage } from "../dealChat";

async function runDeliveryWarnings(): Promise<void> {
  const r = await pool.query(`
    SELECT d.id, d."creatorId", d."shipDate", d."delivery_extended_until",
           d."delivery_warning_day_snapshot", d."max_delivery_days_snapshot",
           d."brand_response_hours_snapshot"
    FROM "Deal" d
    WHERE d.status = 'PRODUCT_SHIPPED'
      AND d."productShippedAt" IS NOT NULL
      AND d."delivery_warning_sent_at" IS NULL
      AND d."shipDate" IS NOT NULL
  `);

  for (const deal of r.rows) {
    try {
      const warningDay = deal.delivery_warning_day_snapshot ?? 8;
      const maxDays = deal.max_delivery_days_snapshot ?? 10;
      const ref = deal.delivery_extended_until
        ? new Date(deal.delivery_extended_until)
        : new Date(deal.shipDate);
      const daysSinceRef = Math.floor((Date.now() - ref.getTime()) / 86_400_000);

      if (daysSinceRef < warningDay) continue;

      const upd = await pool.query(
        `UPDATE "Deal" SET "delivery_warning_sent_at"=NOW() WHERE id=$1 AND "delivery_warning_sent_at" IS NULL`,
        [deal.id]
      );
      if ((upd.rowCount ?? 0) === 0) continue;

      await createNotification({
        userId: deal.creatorId,
        userType: "CREATOR",
        type: "DELIVERY_WARNING",
        title: `Day ${daysSinceRef} — product not received yet?`,
        body: `Your product was shipped ${daysSinceRef} days ago. If you haven't received it by day ${maxDays}, you can report non-delivery.`,
        relatedEntityType: "Deal",
        relatedEntityId: deal.id,
      });
      logger.info({ dealId: deal.id, daysSinceRef }, "Delivery warning sent");
    } catch (err) {
      logger.warn({ err, dealId: deal.id }, "Delivery warning failed for deal");
    }
  }
}

async function runAwbWrongAutoCancel(): Promise<void> {
  const r = await pool.query(`
    SELECT d.id, d."brandId", d."creatorId",
           d."awb_wrong_deadline", d."awbNumber", d."courierName",
           d."percent_split_snapshot"
    FROM "Deal" d
    WHERE d.status = 'PRODUCT_SHIPPED'
      AND d."awb_wrong_deadline" IS NOT NULL
      AND d."awb_wrong_deadline" < NOW()
      AND d."awb_locked" IS NOT TRUE
  `);

  for (const deal of r.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lock = await client.query(
        `SELECT id FROM "Deal" WHERE id=$1 AND status='PRODUCT_SHIPPED' AND "awb_wrong_deadline"<NOW() AND "awb_locked" IS NOT TRUE FOR UPDATE`,
        [deal.id]
      );
      if (lock.rows.length === 0) { await client.query("ROLLBACK"); continue; }

      await client.query(
        `UPDATE "Deal"
         SET status='CANCELLED',
             "cancelledAt"=NOW(),
             "cancelledByType"='AWB_WRONG_AUTO_CANCEL',
             "rejectionReason"='Brand did not respond to AWB-wrong claim in time',
             "escrowStatus"='REFUNDED',
             "awb_wrong_deadline"=NULL
         WHERE id=$1`,
        [deal.id]
      );
      await client.query("COMMIT");

      await createSystemMessage(
        deal.id,
        `❌ Brand did not respond to the AWB-wrong claim in time. Deal auto-cancelled and full refund issued to brand.`,
        { kind: "AWB_WRONG_AUTO_CANCEL" }
      );
      for (const { id, type, msg } of [
        { id: deal.brandId, type: "BRAND" as const, msg: "Deal cancelled — you did not respond to the AWB-wrong claim in time. Brand escrow has been refunded." },
        { id: deal.creatorId, type: "CREATOR" as const, msg: "Deal cancelled — brand did not respond to the AWB-wrong claim in time." },
      ]) {
        await createNotification({
          userId: id, userType: type, type: "DEAL_CANCELLED",
          title: "Deal auto-cancelled (AWB-wrong timeout)",
          body: msg,
          relatedEntityType: "Deal", relatedEntityId: deal.id,
        });
      }
      logger.info({ dealId: deal.id }, "AWB-wrong auto-cancel complete");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger.warn({ err, dealId: deal.id }, "AWB-wrong auto-cancel failed");
    } finally {
      client.release();
    }
  }
}

async function runProductIssueAutoCancel(): Promise<void> {
  const r = await pool.query(`
    SELECT d.id, d."brandId", d."creatorId", d."brand_response_deadline"
    FROM "Deal" d
    WHERE d.status = 'PRODUCT_ISSUE_RAISED'
      AND d."brand_response_deadline" IS NOT NULL
      AND d."brand_response_deadline" < NOW()
  `);

  for (const deal of r.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lock = await client.query(
        `SELECT id FROM "Deal" WHERE id=$1 AND status='PRODUCT_ISSUE_RAISED' AND "brand_response_deadline"<NOW() FOR UPDATE`,
        [deal.id]
      );
      if (lock.rows.length === 0) { await client.query("ROLLBACK"); continue; }

      await client.query(
        `UPDATE "Deal"
         SET status='CANCELLED',
             "cancelledAt"=NOW(),
             "cancelledByType"='PRODUCT_ISSUE_AUTO_CANCEL',
             "rejectionReason"='Brand did not respond to product issue in time',
             "escrowStatus"='REFUNDED',
             "brand_response_deadline"=NULL,
             "productIssueStatus"='RESOLVED_AUTO_CANCEL',
             "issue_resolved_at"=NOW()
         WHERE id=$1`,
        [deal.id]
      );
      await client.query("COMMIT");

      await createSystemMessage(
        deal.id,
        `❌ Brand did not respond to the product issue in time. Deal auto-cancelled and full refund issued.`,
        { kind: "PRODUCT_ISSUE_AUTO_CANCEL" }
      );
      for (const { id, type, msg } of [
        { id: deal.brandId, type: "BRAND" as const, msg: "Deal cancelled — you did not respond to the product issue in time. Escrow has been refunded to you." },
        { id: deal.creatorId, type: "CREATOR" as const, msg: "Deal cancelled — brand did not respond to the product issue in time. Full refund issued to brand." },
      ]) {
        await createNotification({
          userId: id, userType: type, type: "DEAL_CANCELLED",
          title: "Deal auto-cancelled (product issue timeout)",
          body: msg,
          relatedEntityType: "Deal", relatedEntityId: deal.id,
        });
      }
      logger.info({ dealId: deal.id }, "Product issue auto-cancel complete");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger.warn({ err, dealId: deal.id }, "Product issue auto-cancel failed");
    } finally {
      client.release();
    }
  }
}

async function runIssueImageCleanup(): Promise<void> {
  const r = await pool.query(`
    SELECT d.id, d."image_retention_days_snapshot", d."cancelledAt", d."issue_resolved_at"
    FROM "Deal" d
    WHERE d.status = 'CANCELLED'
      AND d."product_issue_images" IS NOT NULL
      AND array_length(d."product_issue_images", 1) > 0
      AND (
        (d."issue_resolved_at" IS NOT NULL AND d."issue_resolved_at" + (COALESCE(d."image_retention_days_snapshot", 7) || ' days')::interval < NOW())
        OR
        (d."cancelledAt" IS NOT NULL AND d."cancelledAt" + (COALESCE(d."image_retention_days_snapshot", 7) || ' days')::interval < NOW())
      )
  `);

  for (const deal of r.rows) {
    try {
      await pool.query(
        `UPDATE "Deal" SET "product_issue_images"=NULL WHERE id=$1`,
        [deal.id]
      );
      logger.info({ dealId: deal.id }, "Issue images cleaned up");
    } catch (err) {
      logger.warn({ err, dealId: deal.id }, "Issue image cleanup failed");
    }
  }
}

async function runLivePostAutoConfirm(): Promise<void> {
  // Find deals where review deadline has passed and still have unconfirmed non-story slots
  const r = await pool.query(`
    SELECT d.id FROM "Deal" d
    WHERE d.status = 'POST_LIVE_PENDING'
      AND d."livePostReviewDeadline" IS NOT NULL
      AND d."livePostReviewDeadline" < NOW()
  `);
  for (const deal of r.rows) {
    try {
      // Auto-confirm all unconfirmed, non-flagged, non-story slots
      const upd = await pool.query(`
        UPDATE "DealDeliverable"
        SET "livePostConfirmedByBrand"=true
        WHERE "dealId"=$1
          AND "livePostConfirmedByBrand"=false
          AND "livePostFlagged"=false
          AND "storyAutoConfirmed"=false
          AND "livePostUrl" IS NOT NULL
      `, [deal.id]);
      if ((upd.rowCount ?? 0) > 0) {
        await createSystemMessage(deal.id, `⏰ Brand review window expired. ${upd.rowCount} live post(s) auto-confirmed by system.`);
        logger.info({ dealId: deal.id, count: upd.rowCount }, "Auto-confirmed live post slots after deadline");
      }
      // Check if all confirmed now → open dispute window
      const allRows = await pool.query(
        `SELECT "livePostConfirmedByBrand", "storyAutoConfirmed", "livePostFlagged" FROM "DealDeliverable" WHERE "dealId"=$1`, [deal.id]
      );
      const allDone = allRows.rows.every((row: any) => row.livePostConfirmedByBrand || row.storyAutoConfirmed);
      if (allDone) {
        await pool.query(
          `UPDATE "Deal" SET status='DISPUTE_WINDOW_OPEN', "disputeWindowEnd"=NOW() + INTERVAL '7 days' WHERE id=$1`,
          [deal.id]
        );
        await createSystemMessage(deal.id, `✅ All live posts confirmed (auto + brand). 7-day dispute window has started.`);
      }
    } catch (err) {
      logger.warn({ err, dealId: deal.id }, "Live post auto-confirm failed for deal");
    }
  }
}

async function runShippingJobs(): Promise<void> {
  try {
    await runDeliveryWarnings();
    await runAwbWrongAutoCancel();
    await runProductIssueAutoCancel();
    await runIssueImageCleanup();
    await runLivePostAutoConfirm();
  } catch (err) {
    logger.error({ err }, "Shipping cron job error");
  }
}

export function startShippingCron(): void {
  const INTERVAL_MS = 60 * 60 * 1000;
  logger.info("Shipping cron job started (interval: 1 hour)");
  runShippingJobs().catch(err => logger.error({ err }, "Initial shipping cron run failed"));
  setInterval(() => {
    runShippingJobs().catch(err => logger.error({ err }, "Shipping cron job error"));
  }, INTERVAL_MS);
}
