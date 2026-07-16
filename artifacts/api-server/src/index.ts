import app from "./app";
import { logger } from "./lib/logger";
import { startCampaignExpiryJob } from "./lib/jobs/campaignExpiry";
import { startSelectionExpiryJob } from "./lib/jobs/selectionExpiry";
import { startDealPipelineJob } from "./lib/jobs/dealPipeline";
import { startShippingCron } from "./lib/jobs/shippingCron";
import { startDealExpiryJob } from "./lib/jobs/dealExpiry";
import { startApplicantNotificationJob } from "./lib/jobs/applicantNotification";
import { initMatchmakingTables } from "./routes/matchmaking";
import { activateAllCreditHoldCampaigns } from "./lib/creditHoldActivation";
import { pool } from "@workspace/db";
import { ensureExtensionTable } from "./routes/dealExtensions";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initDealColumns() {
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(12,2)`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "payoutAdjustmentReason" TEXT`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "refundAmount" DECIMAL(12,2)`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "refundReason" TEXT`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "gstRateLocked" DECIMAL(5,2)`);
  await pool.query(`ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "reelScript" TEXT`);
}

async function initInvoiceSystem() {
  await pool.query(`ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "orderId" TEXT`);
  await pool.query(`ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "orderId" TEXT`);
  await pool.query(`ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "credits" INTEGER`);
  await pool.query(`ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "amountInr" INTEGER`);
  await pool.query(`ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "gstAmountInr" INTEGER`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Invoice" (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      "referenceId" TEXT NOT NULL,
      "recipientType" TEXT NOT NULL,
      "recipientId" TEXT NOT NULL,
      "imageUrl" TEXT NOT NULL,
      "uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notified BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "invoicePopupSeen" BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "invoice_referenceId_idx" ON "Invoice"("referenceId")`);
}

async function initPopupColumns() {
  await pool.query(`ALTER TABLE "Popup" ADD COLUMN IF NOT EXISTS "secondCtaText" TEXT`);
  await pool.query(`ALTER TABLE "Popup" ADD COLUMN IF NOT EXISTS "secondCtaPath" TEXT`);
}

async function initBarterColumns() {
  await pool.query(`ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "script" TEXT`);
}

async function initCreatorColumns() {
  const stmts = [
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "pendingCategories" JSONB`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "pendingImages" TEXT[]`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "pendingFollowerCount" INTEGER`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "pendingInstagramHandle" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "instagramHandleLockedUntil" TIMESTAMPTZ`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "pendingPricing" JSONB`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "pendingReason" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "rejectionSolution" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMPTZ`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "suspendedBy" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMPTZ`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "bannedBy" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "bannedReason" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(50)`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "youtubeHandle" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "otherSocialHandle" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "email" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "approvalBannerDismissed" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "changedSections" TEXT[]`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "resubmittedAt" TIMESTAMPTZ`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "kycRejectionReason" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "kycSubmittedAt" TIMESTAMPTZ`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "contentType" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "images" TEXT[]`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "selectedSlabId" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "state" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "passwordResetTokenExpiry" TIMESTAMPTZ`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "audienceType" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "fcmToken" TEXT`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "hiddenFromSearch" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "hiddenFromMatchmaking" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS "excludedFromMatchmaking" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMPTZ`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "suspendedBy" TEXT`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMPTZ`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "bannedBy" TEXT`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "bannedReason" TEXT`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "fcmToken" TEXT`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "passwordResetTokenExpiry" TIMESTAMPTZ`,
    `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "instagramHandle" TEXT`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "keyMessage" TEXT`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "targetAudienceType" TEXT`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "deliveryWindowDays" INTEGER`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "creditsCharged" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "adminRejectionReason" TEXT`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "adminReviewedBy" TEXT`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "heldAt" TIMESTAMPTZ`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT`,
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ`,
    `ALTER TABLE "CampaignApplication" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMPTZ`,
    `ALTER TABLE "CampaignApplication" ADD COLUMN IF NOT EXISTS "declinedAt" TIMESTAMPTZ`,
    `ALTER TABLE "CampaignApplication" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMPTZ`,
    `ALTER TABLE "CampaignApplication" ADD COLUMN IF NOT EXISTS "confirmationDeadline" TIMESTAMPTZ`,
    `ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "keyMessage" TEXT`,
    `ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "targetAudienceType" TEXT`,
    `ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "deliveryWindowDays" INTEGER`,
    `ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER`,
    `ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "creditsCharged" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "adminRejectionReason" TEXT`,
    `ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT`,
    `ALTER TABLE "BarterCampaign" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ`,
    `ALTER TABLE "BarterApplication" ADD COLUMN IF NOT EXISTS "confirmationDeadline" TIMESTAMPTZ`,
    `ALTER TABLE "BarterApplication" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMPTZ`,
    `ALTER TABLE "BarterApplication" ADD COLUMN IF NOT EXISTS "declinedAt" TIMESTAMPTZ`,
    `ALTER TABLE "BarterApplication" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMPTZ`,
  ];
  for (const stmt of stmts) {
    await pool.query(stmt);
  }
}

async function syncCampaignSlotCounts() {
  // Recompute slotsFilled for all active campaigns based on SELECTED+CONFIRMED applications.
  // Needed after the slot-reservation logic moved from "confirm" to "select".
  await pool.query(`
    UPDATE "Campaign" c
    SET "slotsFilled" = (
      SELECT COUNT(*)::int FROM "CampaignApplication"
      WHERE "campaignId" = c.id AND status IN ('SELECTED','CONFIRMED')
    )
    WHERE c.status IN ('LIVE','HIDDEN','PENDING_APPROVAL','CREDIT_HOLD')
  `);
  await pool.query(`
    UPDATE "BarterCampaign" bc
    SET "slotsFilled" = (
      SELECT COUNT(*)::int FROM "BarterApplication"
      WHERE "barterId" = bc.id AND status IN ('SELECTED','CONFIRMED')
    )
    WHERE bc.status IN ('LIVE','HIDDEN','PENDING_APPROVAL','CREDIT_HOLD')
  `);
  // Fix campaign visibility: hide if now full, restore LIVE if slot freed
  await pool.query(`
    UPDATE "Campaign" SET status='HIDDEN'
    WHERE "slotsFilled" >= "slotCount" AND status='LIVE' AND "expiresAt" > NOW()
  `);
  await pool.query(`
    UPDATE "Campaign" SET status='LIVE'
    WHERE "slotsFilled" < "slotCount" AND status='HIDDEN' AND "expiresAt" > NOW()
  `);
  await pool.query(`
    UPDATE "BarterCampaign" SET status='HIDDEN'
    WHERE "slotsFilled" >= "slotCount" AND status='LIVE' AND "expiresAt" > NOW()
  `);
  await pool.query(`
    UPDATE "BarterCampaign" SET status='LIVE'
    WHERE "slotsFilled" < "slotCount" AND status='HIDDEN' AND "expiresAt" > NOW()
  `);
}

async function bootstrap() {
  try {
    await initMatchmakingTables();
    logger.info("initMatchmakingTables complete");
  } catch (e) {
    logger.error({ err: e }, "initMatchmakingTables failed — continuing without new tables");
  }

  try {
    await initDealColumns();
    logger.info("initDealColumns complete");
  } catch (e) {
    logger.error({ err: e }, "initDealColumns failed — continuing");
  }

  try {
    await initPopupColumns();
    logger.info("initPopupColumns complete");
  } catch (e) {
    logger.error({ err: e }, "initPopupColumns failed — continuing");
  }

  try {
    await initBarterColumns();
    logger.info("initBarterColumns complete");
  } catch (e) {
    logger.error({ err: e }, "initBarterColumns failed — continuing");
  }

  try {
    await initCreatorColumns();
    logger.info("initCreatorColumns complete");
  } catch (e) {
    logger.error({ err: e }, "initCreatorColumns failed — continuing");
  }

  try {
    await ensureExtensionTable();
    logger.info("ensureExtensionTable complete");
  } catch (e) {
    logger.error({ err: e }, "ensureExtensionTable failed — continuing");
  }

  try {
    await initInvoiceSystem();
    logger.info("initInvoiceSystem complete");
  } catch (e) {
    logger.error({ err: e }, "initInvoiceSystem failed — continuing");
  }

  try {
    await syncCampaignSlotCounts();
    logger.info("syncCampaignSlotCounts complete");
  } catch (e) {
    logger.error({ err: e }, "syncCampaignSlotCounts failed — continuing");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startCampaignExpiryJob();
    startSelectionExpiryJob();
    startDealPipelineJob().catch(e => { logger.error({ err: e }, "startDealPipelineJob error"); });
    startShippingCron();
    startDealExpiryJob();
    startApplicantNotificationJob();
    activateAllCreditHoldCampaigns().catch(e => { logger.error({ err: e }, "startup credit-hold sweep failed"); });
  });
}

bootstrap();
