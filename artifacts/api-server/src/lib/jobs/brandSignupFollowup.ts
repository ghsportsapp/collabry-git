import { pool } from "@workspace/db";
import { createNotification } from "../notifications";
import { logger } from "../logger";

// Brand follow-up two days after signup (AiSensy "2automationfollowupbrand").
// Per Navneet it exists to nudge INACTIVE brands, and the signal is "no campaign
// created yet" (buying credits alone doesn't count), so brands with any paid or
// barter campaign are skipped.
//
// The window is 2-3 days, not "older than 2 days": an open-ended query would
// message every historic brand the first time this ships. A brand that missed
// its window (server down for a day) is simply skipped. The Notification row is
// the once-only marker, same as applicantNotification.ts uses its Popup rows.
const TYPE = "BRAND_SIGNUP_FOLLOWUP";

export async function runBrandSignupFollowup(): Promise<void> {
  try {
    const due = await pool.query(
      `SELECT b.id
         FROM "Brand" b
        WHERE b."createdAt" <= NOW() - INTERVAL '2 days'
          AND b."createdAt" >  NOW() - INTERVAL '3 days'
          AND b."suspendedAt" IS NULL
          AND b."bannedAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "Campaign" c WHERE c."brandId" = b.id)
          AND NOT EXISTS (SELECT 1 FROM "BarterCampaign" bc WHERE bc."brandId" = b.id)
          AND NOT EXISTS (
            SELECT 1 FROM "Notification" n WHERE n."userId" = b.id AND n.type = $1
          )`,
      [TYPE]
    );
    for (const row of due.rows) {
      await createNotification({
        userId: row.id as string, userType: "BRAND", type: TYPE,
        title: "Ready to start your first collab?",
        body: "You have free credits waiting. Browse creators or post a campaign to get started.",
        expiresInDays: 30,
      }).catch((err) => logger.error({ err, brandId: row.id }, "Brand signup follow-up failed"));
    }
  } catch (e) {
    logger.error({ err: e }, "Brand signup follow-up job error");
  }
}

export function startBrandSignupFollowupJob(): void {
  setInterval(runBrandSignupFollowup, 10 * 60 * 1000);
  runBrandSignupFollowup().catch(e => logger.error({ err: e }, "Initial brand signup follow-up sweep failed"));
}
