import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { activateCreditHoldCampaigns } from "../lib/creditHoldActivation";
import { createPopup } from "../lib/popups";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

router.get("/admin/brands", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { search, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereClause = "WHERE 1=1";
  const values: any[] = [];
  let idx = 1;

  if (search?.trim()) {
    whereClause += ` AND (LOWER(b."brandName") LIKE $${idx} OR LOWER(b.email) LIKE $${idx})`;
    values.push(`%${search.toLowerCase()}%`);
    idx++;
  }
  if (status && status !== "ALL") {
    whereClause += ` AND b.status=$${idx++}`;
    values.push(status);
  }

  const countResult = await pool.query(`SELECT COUNT(*) FROM "Brand" b ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count);

  values.push(parseInt(limit), offset);
  const result = await pool.query(
    `SELECT b.id, b."brandName", b."contactName", b.email, b."logoUrl", b."categoryId",
     b."creditBalance", b.status, b."createdAt", b."suspendedAt",
     c.name as "categoryName"
     FROM "Brand" b
     LEFT JOIN "Category" c ON c.id = b."categoryId"
     ${whereClause}
     ORDER BY b."createdAt" DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    values
  );

  res.json({ brands: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
});

router.get("/admin/brands/list-all", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, "brandName", email, "logoUrl", "creditBalance", status FROM "Brand" WHERE status='ACTIVE' ORDER BY "brandName"`
  );
  res.json(result.rows);
});

router.get("/admin/brands/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const brandResult = await pool.query(
    `SELECT b.*, c.name as "categoryName", s.name as "subcategoryName"
     FROM "Brand" b
     LEFT JOIN "Category" c ON c.id = b."categoryId"
     LEFT JOIN "Subcategory" s ON s.id = b."subcategoryId"
     WHERE b.id=$1`,
    [id]
  );
  if (brandResult.rows.length === 0) { res.status(404).json({ error: "Brand not found" }); return; }

  const creditsResult = await pool.query(
    `SELECT "transactionType", amount, "balanceAfter", "adminReason", "expiresAt", "createdAt"
     FROM "CreditTransaction" WHERE "brandId"=$1 ORDER BY "createdAt" DESC LIMIT 20`,
    [id]
  );

  const customFieldsResult = await pool.query(
    `SELECT f.id, f.label, f."fieldType", f."isRequired", cfv.value
     FROM "BrandSignupField" f
     LEFT JOIN "BrandCustomFieldValue" cfv ON cfv."fieldId"=f.id AND cfv."brandId"=$1
     WHERE f."isActive"=true ORDER BY f."displayOrder"`,
    [id]
  );

  const brand = { ...brandResult.rows[0] };
  delete brand.passwordHash;
  delete brand.passwordResetToken;
  delete brand.passwordResetTokenExpiry;

  res.json({ brand, credits: creditsResult.rows, customFields: customFieldsResult.rows });
});

router.post("/admin/brands/:id/adjust-credits", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const adminId = (req as any).adminId as string;
  const { amount, type, reason, expiryDays } = req.body as { amount: number; type: "add" | "remove"; reason: string; expiryDays?: number };

  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount must be positive" }); return; }
  if (!type || !["add", "remove"].includes(type)) { res.status(400).json({ error: "Type must be 'add' or 'remove'" }); return; }
  if (!reason?.trim()) { res.status(400).json({ error: "Reason is required" }); return; }

  let expiresAt: Date | null = null;
  if (type === "add") {
    const days = Number(expiryDays);
    if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1) {
      res.status(400).json({ error: "expiryDays must be a positive integer when adding credits" });
      return;
    }
    expiresAt = new Date(Date.now() + days * 86400000);
  }

  const txType = type === "add" ? "ADMIN_GIFT" : "ADMIN_REMOVE";
  let newBalance = 0;
  let actualDelta = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const brandResult = await client.query(`SELECT "creditBalance" FROM "Brand" WHERE id=$1 FOR UPDATE`, [id]);
    if (brandResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Brand not found" });
      return;
    }
    const current = brandResult.rows[0].creditBalance as number;
    const requestedDelta = type === "add" ? amount : -amount;
    newBalance = Math.max(0, current + requestedDelta);
    actualDelta = newBalance - current; // signed; for "remove" clamped at zero this may be smaller in magnitude than `amount`

    await client.query(`UPDATE "Brand" SET "creditBalance"=$1,"updatedAt"=NOW() WHERE id=$2`, [newBalance, id]);
    await client.query(
      `INSERT INTO "CreditTransaction" (id,"brandId","transactionType",amount,"balanceAfter","adminId","adminReason","expiresAt","createdAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,NOW())`,
      [id, txType, Math.abs(actualDelta), newBalance, adminId, reason.trim(), expiresAt]
    );
    await client.query(
      `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,reason,"createdAt")
       VALUES (gen_random_uuid(),$1,'CREDIT_ADJUST','BRAND',$2,$3,$4,NOW())`,
      [adminId, id, JSON.stringify({ type, requestedAmount: amount, actualDelta: Math.abs(actualDelta), newBalance, expiresAt }), reason.trim()]
    );

    await client.query("COMMIT");
    if (type === "add" && actualDelta > 0) {
      activateCreditHoldCampaigns(id).catch(() => {});
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Notification fires only after a successful commit so a rolled-back
  // adjustment doesn't leak a bogus "credits added" message.
  const notifType = type === "add" ? "ADMIN_GIFT_RECEIVED" : "ADMIN_CREDIT_REMOVED";
  const notifAmount = Math.abs(actualDelta);
  const notifTitle = type === "add"
    ? `You received ${notifAmount} free credit${notifAmount === 1 ? "" : "s"}!`
    : `${notifAmount} credit${notifAmount === 1 ? "" : "s"} removed`;
  const expiryStr = expiresAt
    ? ` · Expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"} (${expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})`
    : "";
  const notifBody = `Reason: ${reason.trim()}${expiryStr}`;
  if (notifAmount > 0) {
    await createNotification({
      userId: id, userType: "BRAND", type: notifType,
      title: notifTitle, body: notifBody,
      emailParams: { credits: notifAmount, admin_message: reason.trim() },
      expiresInDays: 90,
    }).catch(() => {});
  }

  // Popup for credit adjustment
  const popupAmount = Math.abs(actualDelta);
  if (type === "add" && popupAmount > 0) {
    await createPopup({
      userId: id, userType: "BRAND", type: "ADMIN_GIFT_RECEIVED",
      title: `You received ${popupAmount} free credit${popupAmount === 1 ? "" : "s"}! 🎁`,
      body: `Reason: ${reason.trim()}${expiresAt ? ` · Expires ${expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}`,
      ctaText: "View Credits", ctaPath: "/home-brand/credits",
      isCelebration: true,
    }).catch(() => {});
  } else if (type === "remove" && popupAmount > 0) {
    await createPopup({
      userId: id, userType: "BRAND", type: "ADMIN_CREDIT_REMOVED",
      title: `${popupAmount} credit${popupAmount === 1 ? "" : "s"} removed`,
      body: `Reason: ${reason.trim()}`,
      ctaText: "View Credits", ctaPath: "/home-brand/credits",
      isCelebration: false,
    }).catch(() => {});
  }

  res.json({ ok: true, newBalance });
});

router.post("/admin/brands/:id/suspend", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const adminId = (req as any).adminId as string;
  const { reason } = req.body as { reason?: string };

  await pool.query(
    `UPDATE "Brand" SET status='SUSPENDED',"suspendedAt"=NOW(),"suspendedBy"=$1,"suspendedReason"=$2 WHERE id=$3`,
    [adminId, reason?.trim() || null, id]
  );
  await pool.query(`UPDATE "RefreshToken" SET revoked=true WHERE "userId"=$1 AND "userType"='BRAND'`, [id]);
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",reason,"createdAt")
     VALUES (gen_random_uuid(),$1,'SUSPEND_BRAND','BRAND',$2,$3,NOW())`,
    [adminId, id, reason?.trim() || null]
  );
  await createNotification({
    userId: id, userType: "BRAND", type: "ACCOUNT_SUSPENDED",
    title: "Account Suspended",
    body: reason?.trim() ? `Your account has been suspended. Reason: ${reason.trim()}` : "Your account has been suspended. Please contact support.",
    ...(reason?.trim() ? { emailParams: { admin_message: reason.trim() } } : {}),
  }).catch(() => {});

  res.json({ ok: true });
});

router.post("/admin/brands/:id/unsuspend", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const adminId = (req as any).adminId as string;

  await pool.query(
    `UPDATE "Brand" SET status='ACTIVE',"suspendedAt"=NULL,"suspendedBy"=NULL,"suspendedReason"=NULL WHERE id=$1`,
    [id]
  );
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId","createdAt")
     VALUES (gen_random_uuid(),$1,'UNSUSPEND_BRAND','BRAND',$2,NOW())`,
    [adminId, id]
  );
  await createNotification({
    userId: id, userType: "BRAND", type: "ACCOUNT_UNSUSPENDED",
    title: "Account Reinstated ✓",
    body: "Your account has been reinstated. You can now log in and use Collabry again.",
    emailParams: { admin_message: "Your account is back in good standing — welcome back to Collabry!" },
  }).catch(() => {});
  await createPopup({
    userId: id, userType: "BRAND", type: "ACCOUNT_UNSUSPENDED",
    title: "Account Reinstated! ✓",
    body: "Your account is back in good standing. Welcome back to Collabry!",
    ctaText: "Go to Dashboard", ctaPath: "/home-brand",
    isCelebration: true,
  }).catch(() => {});

  res.json({ ok: true });
});

// Delete brand account permanently
router.delete("/admin/brands/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const adminId = (req as any).adminId as string;
  const { reason } = req.body as { reason?: string };

  const br = await pool.query(`SELECT "brandName", email FROM "Brand" WHERE id=$1`, [id]);
  if (br.rows.length === 0) { res.status(404).json({ error: "Brand not found" }); return; }
  const { brandName } = br.rows[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Clean up everything referencing this brand so email/brandName/instagramHandle become reusable
    await client.query(`DELETE FROM "RefreshToken" WHERE "userId"=$1 AND "userType"='BRAND'`, [id]);
    await client.query(`DELETE FROM "Notification" WHERE "userId"=$1`, [id]);
    await client.query(`DELETE FROM "BrandCustomFieldValue" WHERE "brandId"=$1`, [id]);
    await client.query(`DELETE FROM "BrandUnlockRecord" WHERE "brandId"=$1`, [id]);
    await client.query(`DELETE FROM "CreditTransaction" WHERE "brandId"=$1`, [id]);
    await client.query(`DELETE FROM "Payment" WHERE "brandId"=$1`, [id]);
    await client.query(`DELETE FROM "MatchmakingBrief" WHERE "brandId"=$1`, [id]);
    await client.query(`DELETE FROM "CreatorRating" WHERE "brandId"=$1`, [id]);
    await client.query(`DELETE FROM "DealRequest" WHERE "brandId"=$1`, [id]);
    // Delete deal children (RESTRICT FKs to Deal) before deleting Deal
    await client.query(`DELETE FROM "DealDeliverable" WHERE "dealId" IN (SELECT id FROM "Deal" WHERE "brandId"=$1)`, [id]);
    await client.query(`DELETE FROM "DealDispute" WHERE "dealId" IN (SELECT id FROM "Deal" WHERE "brandId"=$1)`, [id]);
    await client.query(`DELETE FROM "ProductIssueReport" WHERE "dealId" IN (SELECT id FROM "Deal" WHERE "brandId"=$1)`, [id]);
    await client.query(`DELETE FROM "Deal" WHERE "brandId"=$1`, [id]);
    // Campaign children (RESTRICT FKs to Campaign) before deleting Campaign
    await client.query(`DELETE FROM "CampaignApplication" WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "brandId"=$1)`, [id]);
    await client.query(`DELETE FROM "CampaignSlot" WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "brandId"=$1)`, [id]);
    await client.query(`DELETE FROM "CampaignCategory" WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "brandId"=$1)`, [id]);
    await client.query(`DELETE FROM "Campaign" WHERE "brandId"=$1`, [id]);
    // BarterCampaign children (RESTRICT FKs to BarterCampaign) before deleting BarterCampaign
    await client.query(`DELETE FROM "BarterApplication" WHERE "barterId" IN (SELECT id FROM "BarterCampaign" WHERE "brandId"=$1)`, [id]);
    await client.query(`DELETE FROM "BarterCategory" WHERE "barterId" IN (SELECT id FROM "BarterCampaign" WHERE "brandId"=$1)`, [id]);
    await client.query(`DELETE FROM "BarterCampaign" WHERE "brandId"=$1`, [id]);
    await client.query(
      `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
       VALUES (gen_random_uuid(),$1,'DELETE_BRAND','BRAND',$2,$3::jsonb,NOW())`,
      [adminId, id, JSON.stringify({ name: brandName, reason: reason?.trim() ?? "Admin deletion" })]
    );
    await client.query(`DELETE FROM "Brand" WHERE id=$1`, [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ ok: true });
});

export default router;
