import { createPopup } from "../lib/popups";
import { createNotification } from "../lib/notifications";
import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getSupportEmail } from "../lib/supportEmail";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

// Status counts
router.get("/admin/creators/counts", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`
    SELECT status, COUNT(*) as count FROM "Creator"
    WHERE status != 'PENDING'
    GROUP BY status
  `);
  const counts: Record<string, number> = { ACTIVE: 0, REJECTED: 0, SUSPENDED: 0, BANNED: 0 };
  let total = 0;
  for (const row of r.rows) { counts[row.status] = parseInt(row.count); total += parseInt(row.count); }
  res.json({ ...counts, TOTAL: total });
});

// List creators
router.get("/admin/creators", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { page = "1", limit = "20", status = "ALL", search = "" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Applications tab = PENDING only; Users List = everything else
  if (status === "PENDING") { conditions.push(`c.status='PENDING'`); }
  else if (status !== "ALL") { params.push(status); conditions.push(`c.status=$${params.length}`); }
  else { /* ALL - no filter */ }

  if (search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    conditions.push(`(LOWER(c."fullName") LIKE $${params.length} OR LOWER(c."instagramHandle") LIKE $${params.length} OR LOWER(COALESCE(c.email,'')) LIKE $${params.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await pool.query(`SELECT COUNT(*) FROM "Creator" c ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  params.push(parseInt(limit), offset);
  const result = await pool.query(
    `SELECT c.id, c."fullName", c."instagramHandle", c.email, c."followerCount", c."profilePhotoUrl",
     c.status, c."pendingReason", c."createdAt", c."rejectionReason", c."rejectionNote",
     c."suspendedAt", c."bannedAt", c."kycStatus", c.gender,
     (SELECT string_agg(cat.name, ', ') FROM "CreatorCategory" cc JOIN "Category" cat ON cat.id=cc."categoryId" WHERE cc."creatorId"=c.id) as categories
     FROM "Creator" c ${where}
     ORDER BY c."createdAt" DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ creators: result.rows, total, page: parseInt(page) });
});

// Get single creator detail
router.get("/admin/creators/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const [creatorR, catsR, portfolioR, funR, customFieldsR, customValuesR] = await Promise.all([
    pool.query(`SELECT * FROM "Creator" WHERE id=$1`, [id]),
    pool.query(`SELECT cc.*, cat.name as "categoryName", sub.name as "subcategoryName"
                FROM "CreatorCategory" cc
                JOIN "Category" cat ON cat.id=cc."categoryId"
                LEFT JOIN "Subcategory" sub ON sub.id=cc."subcategoryId"
                WHERE cc."creatorId"=$1 ORDER BY cc."displayOrder"`, [id]),
    pool.query(`SELECT * FROM "CreatorPortfolio" WHERE "creatorId"=$1 ORDER BY "createdAt"`, [id]),
    pool.query(`SELECT * FROM "CreatorFunAnswer" WHERE "creatorId"=$1`, [id]),
    pool.query(`SELECT * FROM "CreatorSignupField" WHERE "isActive"=true ORDER BY "displayOrder"`, []),
    pool.query(`SELECT cfv.*, csf.label FROM "CreatorCustomFieldValue" cfv
                JOIN "CreatorSignupField" csf ON csf.id=cfv."fieldId"
                WHERE cfv."creatorId"=$1`, [id]),
  ]);
  if (creatorR.rows.length === 0) { res.status(404).json({ error: "Creator not found" }); return; }
  const creator = creatorR.rows[0];
  const fmt = (v: any) => v !== null && v !== undefined ? parseFloat(v) : null;
  Object.keys(creator).forEach(k => {
    if (["reelPriceMin","reelPriceMax","storyPriceMin","storyPriceMax","postPriceMin","postPriceMax","averageRating"].includes(k))
      creator[k] = fmt(creator[k]);
  });
  delete creator.passwordHash;

  // Enrich pendingCategories with actual category names
  if (Array.isArray(creator.pendingCategories) && creator.pendingCategories.length > 0) {
    const catIds: string[] = creator.pendingCategories.map((c: any) => c.categoryId);
    const catNamesR = await pool.query(`SELECT id::text, name FROM "Category" WHERE id::text = ANY($1::text[])`, [catIds]);
    const nameMap: Record<string, string> = Object.fromEntries(catNamesR.rows.map((r: any) => [r.id, r.name]));
    creator.pendingCategories = creator.pendingCategories.map((c: any) => ({ ...c, categoryName: nameMap[c.categoryId] ?? c.categoryId }));
  }

  res.json({ creator, categories: catsR.rows, portfolio: portfolioR.rows, funAnswers: funR.rows, customFields: customFieldsR.rows, customFieldValues: customValuesR.rows });
});

// Update admin notes
router.patch("/admin/creators/:id/notes", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { note } = req.body as { note?: string };
  await pool.query(`UPDATE "Creator" SET "adminNotes"=$1, "updatedAt"=NOW() WHERE id=$2`, [note ?? null, id]);
  res.json({ ok: true });
});

// Approve
router.post("/admin/creators/:id/approve", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const cr = await pool.query(`SELECT "fullName", status, "pendingReason", "pendingImages", "pendingCategories", "pendingFollowerCount", "pendingPricing" FROM "Creator" WHERE id=$1`, [id]);
  if (cr.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  const { fullName, pendingReason, pendingImages, pendingCategories, pendingFollowerCount, pendingPricing } = cr.rows[0];
  const reasons = (pendingReason ?? "").split("|").filter(Boolean) as string[];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Apply RE_VERIFICATION: apply pending follower count
    if (reasons.includes("RE_VERIFICATION") && pendingFollowerCount != null) {
      await client.query(`UPDATE "Creator" SET "followerCount"=$1, "pendingFollowerCount"=NULL WHERE id=$2`, [pendingFollowerCount, id]);
    }

    // Apply PRICING_CHANGE: apply each pending pricing type to actual columns
    if (reasons.includes("PRICING_CHANGE") && pendingPricing && typeof pendingPricing === "object") {
      for (const t of ["reel", "story", "post"] as const) {
        const p = pendingPricing[t];
        if (p && p.min != null && p.max != null) {
          await client.query(
            `UPDATE "Creator" SET "${t}PriceMin"=$1, "${t}PriceMax"=$2 WHERE id=$3`,
            [p.min, p.max, id]
          );
        }
      }
      if (pendingPricing.slabId) {
        await client.query(`UPDATE "Creator" SET "selectedSlabId"=$1 WHERE id=$2`, [pendingPricing.slabId, id]);
      }
      await client.query(`UPDATE "Creator" SET "pendingPricing"=NULL WHERE id=$1`, [id]);
    }

    // Clear pending state and set ACTIVE
    await client.query(
      `UPDATE "Creator" SET status='ACTIVE', "pendingReason"=NULL, "updatedAt"=NOW() WHERE id=$1`, [id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Notification: summarise what changed
  const isNewSignup = reasons.length === 0;
  const parts: string[] = [];
  if (isNewSignup) parts.push("profile");
  if (reasons.includes("RE_VERIFICATION")) parts.push("follower count");
  if (reasons.includes("PRICING_CHANGE")) parts.push("pricing");
  const summary = parts.join(", ");
  const notifTitle = isNewSignup ? "Profile Approved! 🎉" : `Updates Approved ✓`;
  const notifBody = isNewSignup
    ? "Your Collabry profile has been approved! You can now receive brand requests."
    : `Your updated ${summary} have been approved and are now live.`;
  await createNotification({
    userId: id, userType: "CREATOR", type: "CREATOR_APPROVED",
    title: notifTitle, body: notifBody,
    expiresInDays: 90,
  }).catch(() => {});
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'APPROVE_CREATOR','CREATOR',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ name: fullName, pendingReason })]
  );
  await createPopup({
    userId: id, userType: "CREATOR", type: "PROFILE_APPROVED",
    title: isNewSignup ? "Profile Approved! 🎉" : "Updates Approved! ✓",
    body: isNewSignup
      ? "Your Collabry profile has been approved! You can now receive brand requests."
      : `Your updated ${summary} have been approved and are now live.`,
    ctaText: "View Profile", ctaPath: "/home-creator",
    isCelebration: true,
  });
  res.json({ ok: true });
});

// Reject — accepts reasonId (from RejectionReason table) OR freeform reason text
router.post("/admin/creators/:id/reject", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { reasonId, reason: freeReason } = req.body as { reasonId?: string; reason?: string };

  const crCheck = await pool.query(`SELECT "pendingReason", status FROM "Creator" WHERE id=$1`, [id]);
  const pendingReason: string = crCheck.rows[0]?.pendingReason ?? "";
  const reasons = pendingReason.split("|").filter(Boolean);
  const isProfileChange = reasons.some(r => ["RE_VERIFICATION", "PRICING_CHANGE"].includes(r));

  // Rejecting profile updates (not a new signup): clear ALL pending data, restore ACTIVE
  if (isProfileChange) {
    await pool.query(
      `UPDATE "Creator" SET "pendingImages"=NULL, "pendingCategories"=NULL, "pendingFollowerCount"=NULL, "pendingPricing"=NULL,
       status='ACTIVE', "pendingReason"=NULL, "updatedAt"=NOW() WHERE id=$1`,
      [id]
    );
    const parts: string[] = [];
    if (reasons.includes("RE_VERIFICATION")) parts.push("follower count");
    if (reasons.includes("PRICING_CHANGE")) parts.push("pricing");
    const summary = parts.join(", ");
    const notifBody = freeReason?.trim()
      ? `Your updated ${summary} were not approved. Reason: ${freeReason.trim()}`
      : `Your updated ${summary} were not approved. Your current profile remains active.`;
    await createNotification({
      userId: id, userType: "CREATOR", type: "CREATOR_REJECTED",
      title: "Update Not Approved", body: notifBody,
      emailParams: { reason: freeReason?.trim() || `Updates to ${summary} were not approved.` },
      expiresInDays: 90,
    }).catch(() => {});
    await pool.query(
      `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
       VALUES (gen_random_uuid(),$1,'REJECT_PROFILE_CHANGE','CREATOR',$2,$3::jsonb,NOW())`,
      [adminId, id, JSON.stringify({ reasons, reason: freeReason ?? "not specified" })]
    );
    await createPopup({
      userId: id, userType: "CREATOR", type: "PROFILE_REJECTED",
      title: "Update Not Approved",
      body: notifBody,
      ctaText: "View Profile", ctaPath: "/home-creator",
      isCelebration: false,
    });
    res.json({ ok: true }); return;
  }

  let reason = "";
  let solution = "";

  if (reasonId) {
    const rr = await pool.query(`SELECT reason, solution FROM "RejectionReason" WHERE id=$1 AND "isActive"=true`, [reasonId]);
    if (rr.rows.length === 0) { res.status(400).json({ error: "Invalid rejection reason" }); return; }
    reason = rr.rows[0].reason;
    solution = rr.rows[0].solution;
  } else if (freeReason?.trim()) {
    reason = freeReason.trim();
    solution = "";
  } else {
    res.status(400).json({ error: "Rejection reason is required" }); return;
  }

  await pool.query(
    `UPDATE "Creator" SET status='REJECTED', "rejectionReason"=$1, "rejectionSolution"=$2, "rejectionNote"=NULL, "updatedAt"=NOW() WHERE id=$3`,
    [reason, solution || null, id]
  );
  await createNotification({
    userId: id, userType: "CREATOR", type: "CREATOR_REJECTED",
    title: "Profile Review Update", body: `Your profile was not approved. Reason: ${reason}.`,
    emailParams: { reason },
    expiresInDays: 90,
  }).catch(() => {});
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'REJECT_CREATOR','CREATOR',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ reason, solution })]
  );
  await createPopup({
    userId: id, userType: "CREATOR", type: "PROFILE_REJECTED",
    title: "Profile Not Approved",
    body: `Your profile was not approved. Reason: ${reason}.${solution ? ` ${solution}` : ""}`,
    ctaText: "View Profile", ctaPath: "/home-creator",
    isCelebration: false,
  });
  res.json({ ok: true });
});

// Suspend
router.post("/admin/creators/:id/suspend", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "Suspension reason is required" }); return; }
  await pool.query(
    `UPDATE "Creator" SET status='SUSPENDED', "suspendedAt"=NOW(), "suspendedBy"=$1, "suspensionReason"=$2, "updatedAt"=NOW() WHERE id=$3`,
    [adminId, reason, id]
  );
  const suspendEmail = await getSupportEmail();
  await createNotification({
    userId: id, userType: "CREATOR", type: "CREATOR_SUSPENDED",
    title: "Account Suspended",
    body: `Your account has been suspended. Reason: ${reason}. Contact ${suspendEmail}`,
    emailParams: { reason },
    expiresInDays: 90,
  }).catch(() => {});
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'SUSPEND_CREATOR','CREATOR',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ reason })]
  );
  await createPopup({
    userId: id, userType: "CREATOR", type: "ACCOUNT_SUSPENDED",
    title: "Account Suspended",
    body: `Your account has been suspended. Reason: ${reason}. Please contact ${suspendEmail} for assistance.`,
    ctaText: "Contact Support", ctaPath: "/home-creator",
    isCelebration: false,
  });
  res.json({ ok: true });
});

// Unsuspend
router.post("/admin/creators/:id/unsuspend", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  await pool.query(
    `UPDATE "Creator" SET status='ACTIVE', "suspendedAt"=NULL, "suspendedBy"=NULL, "suspensionReason"=NULL, "updatedAt"=NOW() WHERE id=$1`, [id]
  );
  await createNotification({
    userId: id, userType: "CREATOR", type: "CREATOR_UNSUSPENDED",
    title: "Account Reactivated ✓",
    body: "Your Collabry account has been reactivated. Welcome back!",
    expiresInDays: 90,
  }).catch(() => {});
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'UNSUSPEND_CREATOR','CREATOR',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({})]
  );
  await createPopup({
    userId: id, userType: "CREATOR", type: "ACCOUNT_UNSUSPENDED",
    title: "Account Reactivated! ✓",
    body: "Your Collabry account is back in good standing. You can now receive brand requests again.",
    ctaText: "Go to Dashboard", ctaPath: "/home-creator",
    isCelebration: true,
  });
  res.json({ ok: true });
});

// Ban
router.post("/admin/creators/:id/ban", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "Ban reason is required" }); return; }
  await pool.query(
    `UPDATE "Creator" SET status='BANNED', "bannedAt"=NOW(), "bannedBy"=$1, "bannedReason"=$2, "updatedAt"=NOW() WHERE id=$3`,
    [adminId, reason, id]
  );
  await pool.query(
    `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","expiresAt","createdAt")
     VALUES (gen_random_uuid(),$1,'CREATOR','CREATOR_BANNED',$2,$3,false,NOW()+INTERVAL '90 days',NOW())`,
    [id, "Account Banned", `Your account has been banned. Reason: ${reason}.`]
  );
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'BAN_CREATOR','CREATOR',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ reason })]
  );
  await createPopup({
    userId: id, userType: "CREATOR", type: "ACCOUNT_BANNED",
    title: "Account Banned",
    body: "Your Collabry account is banned. If you think this is a mistake, contact us.",
    ctaText: "Contact Us", ctaPath: "/about-us",
    isCelebration: false,
  });
  res.json({ ok: true });
});

// Unban
router.post("/admin/creators/:id/unban", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "Reason is required for unbanning" }); return; }
  await pool.query(
    `UPDATE "Creator" SET status='ACTIVE', "bannedAt"=NULL, "bannedBy"=NULL, "bannedReason"=NULL, "updatedAt"=NOW() WHERE id=$1`, [id]
  );
  await pool.query(
    `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","expiresAt","createdAt")
     VALUES (gen_random_uuid(),$1,'CREATOR','CREATOR_UNBANNED',$2,$3,false,NOW()+INTERVAL '90 days',NOW())`,
    [id, "Account Restored ✓", "Your Collabry account has been fully restored. Welcome back!"]
  );
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'UNBAN_CREATOR','CREATOR',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ reason })]
  );
  await createPopup({
    userId: id, userType: "CREATOR", type: "ACCOUNT_UNBANNED",
    title: "Account Fully Restored! ✓",
    body: "Your ban has been lifted and your account has been fully restored. Welcome back to Collabry!",
    ctaText: "Go to Dashboard", ctaPath: "/home-creator",
    isCelebration: true,
  });
  res.json({ ok: true });
});

// Delete creator account permanently
router.delete("/admin/creators/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { reason } = req.body as { reason?: string };

  const cr = await pool.query(`SELECT "fullName", "instagramHandle", email FROM "Creator" WHERE id=$1`, [id]);
  if (cr.rows.length === 0) { res.status(404).json({ error: "Creator not found" }); return; }
  const { fullName, instagramHandle } = cr.rows[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Clean up everything referencing this creator so email/phone/instagramHandle become reusable
    await client.query(`DELETE FROM "RefreshToken" WHERE "userId"=$1 AND "userType"='CREATOR'`, [id]);
    await client.query(`DELETE FROM "Notification" WHERE "userId"=$1`, [id]);
    await client.query(`DELETE FROM "BarterApplication" WHERE "creatorId"=$1`, [id]);
    await client.query(`DELETE FROM "CampaignApplication" WHERE "creatorId"=$1`, [id]);
    await client.query(`UPDATE "CampaignSlot" SET "creatorId"=NULL WHERE "creatorId"=$1`, [id]);
    await client.query(`DELETE FROM "BrandUnlockRecord" WHERE "creatorId"=$1`, [id]);
    // Delete deal children (RESTRICT FKs to Deal) before deleting Deal
    await client.query(`DELETE FROM "DealDeliverable" WHERE "dealId" IN (SELECT id FROM "Deal" WHERE "creatorId"=$1)`, [id]);
    await client.query(`DELETE FROM "DealDispute" WHERE "dealId" IN (SELECT id FROM "Deal" WHERE "creatorId"=$1)`, [id]);
    await client.query(`DELETE FROM "ProductIssueReport" WHERE "dealId" IN (SELECT id FROM "Deal" WHERE "creatorId"=$1)`, [id]);
    await client.query(`DELETE FROM "Deal" WHERE "creatorId"=$1`, [id]);
    await client.query(`DELETE FROM "DealRequest" WHERE "creatorId"=$1`, [id]);
    await client.query(`DELETE FROM "Payout" WHERE "creatorId"=$1`, [id]);
    await client.query(`DELETE FROM "ReportedVideo" WHERE "creatorId"=$1`, [id]);
    await client.query(`DELETE FROM "CreatorKyc" WHERE "creatorId"=$1`, [id]);
    await client.query(`DELETE FROM "CreatorRating" WHERE "creatorId"=$1`, [id]); // RESTRICT FK — must delete explicitly
    // Other Creator-owned tables (CreatorCategory, CreatorPortfolio, CreatorFunAnswer, CreatorCustomFieldValue, KYCData) cascade on delete
    await client.query(
      `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
       VALUES (gen_random_uuid(),$1,'DELETE_CREATOR','CREATOR',$2,$3::jsonb,NOW())`,
      [adminId, id, JSON.stringify({ name: fullName, handle: instagramHandle, reason: reason?.trim() ?? "Admin deletion" })]
    );
    await client.query(`DELETE FROM "Creator" WHERE id=$1`, [id]);
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
