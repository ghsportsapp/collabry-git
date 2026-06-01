import { pool } from "@workspace/db";

async function notify(userId: string, userType: string, title: string, body: string, type = "INFO") {
  await pool.query(
    `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","createdAt","expiresAt")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,false,NOW(),NOW()+INTERVAL '90 days')`,
    [userId, userType, type, title, body]
  ).catch(() => {});
}

export async function runSelectionExpiry(): Promise<void> {
  try {
    // Paid campaign selections past 48h confirmation window
    const paid = await pool.query(
      `UPDATE "CampaignApplication" ca
         SET status='EXPIRED', "expiredAt"=NOW()
       FROM "Campaign" c, "Creator" cr
       WHERE ca."campaignId"=c.id AND cr.id=ca."creatorId"
         AND ca.status='SELECTED' AND ca."confirmationDeadline" < NOW()
       RETURNING ca.id, ca."campaignId", ca."creatorId", c."brandId", c.name as "campName",
                 cr."instagramHandle", cr."fullName"`
    );
    for (const row of paid.rows) {
      const handle = row.instagramHandle ?? row.fullName ?? "Creator";
      await notify(row.brandId as string, "BRAND", "Creator did not respond in time",
        `@${handle} did not confirm within 48 hours for "${row.campName}". You can select another creator.`);
      await notify(row.creatorId as string, "CREATOR", "Selection expired",
        `Your 48-hour window to confirm "${row.campName}" passed. The selection has expired.`);
    }

    // Barter selections past 48h confirmation window
    const barter = await pool.query(
      `UPDATE "BarterApplication" ba
         SET status='EXPIRED', "expiredAt"=NOW()
       FROM "BarterCampaign" bc, "Creator" cr
       WHERE ba."barterId"=bc.id AND cr.id=ba."creatorId"
         AND ba.status='SELECTED' AND ba."confirmationDeadline" < NOW()
       RETURNING ba.id, ba."barterId", ba."creatorId", bc."brandId", bc.name as "campName",
                 cr."instagramHandle", cr."fullName"`
    );
    for (const row of barter.rows) {
      const handle = row.instagramHandle ?? row.fullName ?? "Creator";
      await notify(row.brandId as string, "BRAND", "Creator did not respond in time",
        `@${handle} did not confirm within 48 hours for "${row.campName}". You can select another creator.`);
      await notify(row.creatorId as string, "CREATOR", "Selection expired",
        `Your 48-hour window to confirm "${row.campName}" passed.`);
    }
  } catch (e) {
    console.error("Selection expiry job error:", e);
  }
}

export function startSelectionExpiryJob(): void {
  // Every 15 minutes
  setInterval(runSelectionExpiry, 15 * 60 * 1000);
  runSelectionExpiry().catch(console.error);
}
