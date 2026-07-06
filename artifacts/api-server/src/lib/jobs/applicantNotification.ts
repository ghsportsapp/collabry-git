import { pool } from "@workspace/db";
import { createPopup } from "../popups";
import { createNotification } from "../notifications";

export async function runApplicantNotification(): Promise<void> {
  try {
    // Paid campaigns: LIVE 3+ days ago, popup not yet sent
    const paid = await pool.query(`
      SELECT c.id, c.name, c."brandId",
        COUNT(ca.id)::int AS applicant_count
      FROM "Campaign" c
      LEFT JOIN "CampaignApplication" ca
        ON ca."campaignId" = c.id AND ca.status = 'APPLIED'
      WHERE c.status IN ('LIVE', 'PARTIALLY_FILLED', 'HIDDEN')
        AND c."liveAt" IS NOT NULL
        AND c."liveAt" <= NOW() - INTERVAL '3 days'
        AND NOT EXISTS (
          SELECT 1 FROM "Popup"
          WHERE "relatedEntityId" = c.id
            AND type = 'BRAND_3DAY_APPLICANTS'
        )
      GROUP BY c.id, c.name, c."brandId"
      HAVING COUNT(ca.id) > 0
    `);

    for (const row of paid.rows) {
      const count: number = row.applicant_count;
      const name: string = row.name;
      const brandId: string = row.brandId;
      const campaignId: string = row.id;

      await createNotification({
        userId: brandId, userType: "BRAND", type: "CAMPAIGN_CREATORS_INTERESTED",
        title: "Creators are interested!",
        body: `${count} creator${count > 1 ? "s have" : " has"} applied to your campaign "${name}". Review applicants now.`,
        emailTemplateId: 18, emailSubject: "Creators are interested in your campaign",
        emailParams: { campaign_name: name, credits: count },
        relatedEntityType: "CAMPAIGN", relatedEntityId: campaignId,
        expiresInDays: 90,
      }).catch(() => {});
      await createPopup({
        userId: brandId,
        userType: "BRAND",
        type: "BRAND_3DAY_APPLICANTS",
        title: "Creators are interested! 🎉",
        body: `${count} creator${count > 1 ? "s have" : " has"} applied to "${name}" so far. Don't miss out — review and select now.`,
        ctaText: "See Applicants",
        ctaPath: `/home-brand/campaigns`,
        relatedEntityId: campaignId,
        isCelebration: false,
      });
    }

    // Barter campaigns: same logic
    const barters = await pool.query(`
      SELECT b.id, b.name, b."brandId",
        COUNT(ba.id)::int AS applicant_count
      FROM "BarterCampaign" b
      LEFT JOIN "BarterApplication" ba
        ON ba."barterId" = b.id AND ba.status = 'APPLIED'
      WHERE b.status IN ('LIVE', 'PARTIALLY_FILLED', 'HIDDEN')
        AND b."liveAt" IS NOT NULL
        AND b."liveAt" <= NOW() - INTERVAL '3 days'
        AND NOT EXISTS (
          SELECT 1 FROM "Popup"
          WHERE "relatedEntityId" = b.id
            AND type = 'BRAND_3DAY_APPLICANTS'
        )
      GROUP BY b.id, b.name, b."brandId"
      HAVING COUNT(ba.id) > 0
    `);

    for (const row of barters.rows) {
      const count: number = row.applicant_count;
      const name: string = row.name;
      const brandId: string = row.brandId;
      const barterId: string = row.id;

      await createNotification({
        userId: brandId, userType: "BRAND", type: "BARTER_CREATORS_INTERESTED",
        title: "Creators are interested!",
        body: `${count} creator${count > 1 ? "s have" : " has"} applied to your barter campaign "${name}". Review applicants now.`,
        emailTemplateId: 26, emailSubject: "Creators are interested in your barter campaign",
        emailParams: { campaign_name: name, credits: count },
        relatedEntityType: "BARTER_CAMPAIGN", relatedEntityId: barterId,
        expiresInDays: 90,
      }).catch(() => {});
      await createPopup({
        userId: brandId,
        userType: "BRAND",
        type: "BRAND_3DAY_APPLICANTS",
        title: "Creators are interested! 🎉",
        body: `${count} creator${count > 1 ? "s have" : " has"} applied to "${name}" so far. Don't miss out — review and select now.`,
        ctaText: "See Applicants",
        ctaPath: `/home-brand/campaigns`,
        relatedEntityId: barterId,
        isCelebration: false,
      });
    }
  } catch (e) {
    console.error("Applicant notification job error:", e);
  }
}

export function startApplicantNotificationJob(): void {
  // Run every 12 hours
  setInterval(runApplicantNotification, 12 * 60 * 60 * 1000);
  runApplicantNotification().catch(console.error);
}
