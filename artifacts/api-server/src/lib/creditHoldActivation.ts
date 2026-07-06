import { pool } from "@workspace/db";
import { createNotification } from "./notifications";

async function getCosts(): Promise<{ campaignCost: number; barterCost: number; barterDurationDays: number }> {
  const r = await pool.query(
    `SELECT key, value FROM "PlatformConfig" WHERE key IN ('campaign_credits_cost','barter_credits_cost','max_barter_days')`
  );
  const map = Object.fromEntries(r.rows.map((row: { key: string; value: string }) => [row.key, row.value]));
  return {
    campaignCost: parseInt(map["campaign_credits_cost"] ?? "1"),
    barterCost: parseInt(map["barter_credits_cost"] ?? "5"),
    barterDurationDays: parseInt(map["max_barter_days"] ?? "30"),
  };
}

export async function activateAllCreditHoldCampaigns(): Promise<void> {
  const [campBrands, barterBrands] = await Promise.all([
    pool.query<{ brandId: string }>(`SELECT DISTINCT "brandId" FROM "Campaign" WHERE status='CREDIT_HOLD'`),
    pool.query<{ brandId: string }>(`SELECT DISTINCT "brandId" FROM "BarterCampaign" WHERE status='CREDIT_HOLD'`),
  ]);
  const brandIds = Array.from(new Set([
    ...campBrands.rows.map(r => r.brandId),
    ...barterBrands.rows.map(r => r.brandId),
  ]));
  await Promise.allSettled(brandIds.map(id => activateCreditHoldCampaigns(id)));
}

export async function activateCreditHoldCampaigns(brandId: string): Promise<void> {
  const { campaignCost, barterCost, barterDurationDays } = await getCosts();

  const [camps, barters] = await Promise.all([
    pool.query<{ id: string; name: string; deliveryWindowDays: string | null }>(
      `SELECT id, name, "deliveryWindowDays" FROM "Campaign" WHERE "brandId"=$1 AND status='CREDIT_HOLD'`,
      [brandId]
    ),
    pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM "BarterCampaign" WHERE "brandId"=$1 AND status='CREDIT_HOLD'`,
      [brandId]
    ),
  ]);

  type Item =
    | { _type: "Campaign"; id: string; name: string; deliveryWindowDays: string | null }
    | { _type: "BarterCampaign"; id: string; name: string };

  const items: Item[] = [
    ...camps.rows.map(r => ({ _type: "Campaign" as const, ...r })),
    ...barters.rows.map(r => ({ _type: "BarterCampaign" as const, ...r })),
  ];

  if (items.length === 0) return;

  for (const item of items) {
    const creditsCost = item._type === "Campaign" ? campaignCost : barterCost;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const balRes = await client.query<{ creditBalance: number }>(
        `SELECT "creditBalance" FROM "Brand" WHERE id=$1 FOR UPDATE`,
        [brandId]
      );
      const balance = parseInt(String(balRes.rows[0]?.creditBalance ?? "0"));
      if (balance < creditsCost) {
        await client.query("ROLLBACK");
        continue;
      }
      const newBal = balance - creditsCost;
      await client.query(`UPDATE "Brand" SET "creditBalance"=$1,"updatedAt"=NOW() WHERE id=$2`, [newBal, brandId]);

      if (item._type === "Campaign") {
        const durationDays = parseInt(item.deliveryWindowDays ?? "30");
        await client.query(
          `INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","createdAt")
           VALUES (gen_random_uuid()::text,$1,'CAMPAIGN_POSTING',$2,$3,NOW())`,
          [brandId, -creditsCost, newBal]
        );
        await client.query(
          `UPDATE "Campaign" SET status='LIVE',"liveAt"=NOW(),"expiresAt"=NOW()+($1::int * INTERVAL '1 day'),"creditsCharged"=$2 WHERE id=$3`,
          [durationDays, creditsCost, item.id]
        );
      } else {
        await client.query(
          `INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","createdAt")
           VALUES (gen_random_uuid()::text,$1,'BARTER_POSTING',$2,$3,NOW())`,
          [brandId, -creditsCost, newBal]
        );
        await client.query(
          `UPDATE "BarterCampaign" SET status='LIVE',"liveAt"=NOW(),"expiresAt"=NOW()+($1::int * INTERVAL '1 day'),"creditsCharged"=$2 WHERE id=$3`,
          [barterDurationDays, creditsCost, item.id]
        );
      }

      await client.query("COMMIT");
      const isPaid = item._type === "Campaign";
      await createNotification({
        userId: brandId,
        userType: "BRAND",
        type: isPaid ? "CAMPAIGN_BACK_LIVE" : "BARTER_BACK_LIVE",
        title: isPaid ? "Campaign is Live!" : "Barter Campaign is Live!",
        body: `Your ${isPaid ? "" : "barter "}campaign "${item.name}" is now live — credits have been deducted. Creators can start applying.`,
        emailTemplateId: isPaid ? 17 : 25,
        emailSubject: isPaid ? "Your campaign is back live!" : "Your barter campaign is back live!",
        emailParams: { campaign_name: item.name, credits: creditsCost },
        relatedEntityType: isPaid ? "CAMPAIGN" : "BARTER_CAMPAIGN",
        relatedEntityId: item.id,
        expiresInDays: 90,
      }).catch(() => {});
    } catch {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}
