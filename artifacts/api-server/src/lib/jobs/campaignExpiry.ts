import { pool } from "@workspace/db";
import { expireCampaign, expireBarterCampaign } from "../../routes/campaigns";

export async function runCampaignExpiry(): Promise<void> {
  try {
    const campaigns = await pool.query(
      `SELECT id FROM "Campaign" WHERE status IN ('LIVE','PARTIALLY_FILLED') AND "expiresAt" <= NOW()`
    );
    for (const c of campaigns.rows) {
      await expireCampaign(c.id as string).catch(e => console.error("Campaign expiry error", c.id, e));
    }
    const barters = await pool.query(
      `SELECT id FROM "BarterCampaign" WHERE status IN ('LIVE','PARTIALLY_FILLED') AND "expiresAt" <= NOW()`
    );
    for (const b of barters.rows) {
      await expireBarterCampaign(b.id as string).catch(e => console.error("Barter expiry error", b.id, e));
    }
  } catch (e) {
    console.error("Campaign expiry job error:", e);
  }
}

export function startCampaignExpiryJob(): void {
  // Run every hour
  setInterval(runCampaignExpiry, 60 * 60 * 1000);
  // Also run on startup
  runCampaignExpiry().catch(console.error);
}
