import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCreator } from "../middleware/requireCreator";
import { verifyToken, getAccessSecret } from "../lib/auth";
import { addCreatorSSE, removeCreatorSSE } from "../lib/sseManager";
import { createPopup } from "../lib/popups";

const router: IRouter = Router();

router.get("/creator/home", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const [creatorR, portfolioR, funR, activeQR, unreadR, statsR] = await Promise.all([
    pool.query(
      `SELECT id, "fullName", "instagramHandle", "profilePhotoUrl", status, bio,
              "approvalBannerDismissed", "rejectionReason", "rejectionSolution",
              "changedSections", "resubmittedAt", "kycStatus", "averageRating"
       FROM "Creator" WHERE id=$1`,
      [creatorId],
    ),
    pool.query(`SELECT id FROM "CreatorPortfolio" WHERE "creatorId"=$1`, [creatorId]),
    pool.query(`SELECT "questionId" FROM "CreatorFunAnswer" WHERE "creatorId"=$1`, [creatorId]),
    pool.query(`SELECT id FROM "FunQuestion" WHERE "isActive"=true`),
    pool.query(
      `SELECT COUNT(*)::int as c FROM "Notification" WHERE "userId"=$1 AND "userType"='CREATOR' AND "isRead"=false`,
      [creatorId],
    ),
    pool.query(
      `SELECT
         COUNT(*)                                                       FILTER (WHERE status NOT IN ('CANCELLED','REJECTED','EXPIRED'))::int AS "totalDeals",
         COUNT(*)                                                       FILTER (WHERE status IN (
           'LIVE','IN_ESCROW','IN_PROGRESS','DELIVERED','REVIEW','DISPUTE',
           'CONCEPT_SUBMITTED','CONCEPT_APPROVED','PRODUCT_SHIPPED','PRODUCT_RECEIVED',
           'PRODUCT_ISSUE_RAISED','AWAITING_CREATOR_ISSUE_DECISION','NON_DELIVERY_REPORTED',
           'CONTENT_UPLOADED','REVISION_REQUESTED',
           'POST_LIVE_PENDING','URL_FLAGGED','FINAL_POST_CONFIRMED','OVERDUE'
         ))::int                                                        AS "activeDeals",
         COALESCE(SUM("paidAmount") FILTER (WHERE "payoutStatus"='RELEASED'), 0)::numeric AS "totalEarned"
       FROM "Deal" WHERE "creatorId"=$1`,
      [creatorId],
    ),
  ]);

  const pendingReqR = await pool.query(
    `SELECT COUNT(*)::int as c FROM "DealRequest" WHERE "creatorId"=$1 AND status IN ('PENDING','NEGOTIATING')`,
    [creatorId],
  );

  if (creatorR.rows.length === 0) { res.status(404).json({ error: "Creator not found" }); return; }
  const creator = creatorR.rows[0];
  const portfolioCount = portfolioR.rows.length;
  const answeredQIds = new Set(funR.rows.map(r => r.questionId));
  const activeQIds = activeQR.rows.map(r => r.id);
  const unansweredCount = activeQIds.filter(id => !answeredQIds.has(id)).length;
  const stats = statsR.rows[0];

  const pendingProfileSections: string[] = [];
  if (!creator.bio?.trim()) pendingProfileSections.push("bio");
  if (unansweredCount > 0) pendingProfileSections.push("fun_questions");
  if (creator.kycStatus !== "SUBMITTED" && creator.kycStatus !== "VERIFIED") pendingProfileSections.push("kyc");
  if (portfolioCount < 5) pendingProfileSections.push("portfolio");

  res.json({
    status: creator.status,
    fullName: creator.fullName,
    instagramHandle: creator.instagramHandle,
    profilePhotoUrl: creator.profilePhotoUrl,
    approvalBannerDismissed: creator.approvalBannerDismissed,
    rejectionReason: creator.rejectionReason ?? null,
    rejectionSolution: creator.rejectionSolution ?? null,
    changedSections: creator.changedSections ?? [],
    resubmittedAt: creator.resubmittedAt ?? null,
    totalDeals: stats.totalDeals ?? 0,
    activeDeals: stats.activeDeals ?? 0,
    pendingRequests: pendingReqR.rows[0].c ?? 0,
    averageRating: parseFloat(creator.averageRating) || 0,
    totalEarned: parseFloat(stats.totalEarned) || 0,
    pendingProfileSections,
    unreadNotificationCount: unreadR.rows[0].c,
    hasUnansweredFunQuestions: unansweredCount > 0,
    unansweredFunQuestionCount: unansweredCount,
  });
});

router.get("/creator/earnings/history", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const r = await pool.query(
    `SELECT d.id, d.status, d.source,
            d."creatorPayout", d."payoutStatus", d."escrowStatus",
            d."totalAgreedValue", d."createdAt",
            d."payoutReleasedAt", d."paidAmount", d."payoutAdjustmentReason",
            d."orderId",
            b."brandName", b."logoUrl" AS "brandLogoUrl",
            c."name" AS "campaignName",
            bc."name" AS "barterName",
            i."imageUrl" AS "invoiceUrl"
     FROM "Deal" d
     JOIN "Brand" b ON b.id = d."brandId"
     LEFT JOIN "Campaign" c ON c.id = d."campaignId"
     LEFT JOIN "BarterCampaign" bc ON bc.id = d."barterId"
     LEFT JOIN "Invoice" i ON i."referenceId"=d.id AND i."recipientType"='CREATOR'
     WHERE d."creatorId" = $1
       AND d.status NOT IN ('DECLINED','EXPIRED','CANCELLED')
     ORDER BY d."createdAt" DESC`,
    [creatorId],
  );

  let totalPaid = 0;
  let totalPending = 0;
  const transactions = r.rows.map(row => {
    const creatorAmount = Number(row.creatorPayout) || Number(row.totalAgreedValue) || 0;
    const paidAmount = Number(row.paidAmount) || 0;
    const payoutStatus = (row.payoutStatus as string | null) ?? "PENDING";
    const escrowStatus = row.escrowStatus as string | null;
    const isPaid = payoutStatus === "PAID" || payoutStatus === "RELEASED";
    const isInEscrow = !isPaid && escrowStatus === "HELD";
    const amount = isPaid ? (paidAmount > 0 ? paidAmount : creatorAmount) : creatorAmount;
    if (isPaid) totalPaid += amount;
    else if (isInEscrow) totalPending += amount;

    // human-readable status label
    let statusLabel: string;
    if (isPaid) statusLabel = "Paid";
    else if (payoutStatus === "PENDING_KYC") statusLabel = "KYC Pending";
    else if (isInEscrow) statusLabel = "In Escrow";
    else statusLabel = "Pending";

    // deal name: campaign name, barter name, or "Direct Deal"
    const dealName = row.campaignName ?? row.barterName ?? "Direct Deal";
    const source: string = row.source ?? "DIRECT";

    return {
      id: row.id,
      dealName,
      source,
      brandName: row.brandName,
      brandLogoUrl: row.brandLogoUrl,
      amount,
      originalAmount: creatorAmount,
      date: isPaid && row.payoutReleasedAt ? row.payoutReleasedAt : row.createdAt,
      status: statusLabel,
      payoutStatus,
      adjustmentReason: (row.payoutAdjustmentReason as string | null) ?? null,
      orderId: (row.orderId as string | null) ?? null,
      invoiceUrl: (row.invoiceUrl as string | null) ?? null,
    };
  });

  res.json({ transactions, totalPaid, totalPending });
});

router.patch("/creator/dismiss-approval-banner", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  await pool.query(`UPDATE "Creator" SET "approvalBannerDismissed"=true, "updatedAt"=NOW() WHERE id=$1`, [creatorId]);
  res.json({ ok: true });
});

// ── Reapply for verification ────────────────────────────────────────────────
router.post("/creator/reapply", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cR = await client.query(`SELECT status, "fullName" FROM "Creator" WHERE id=$1 FOR UPDATE`, [creatorId]);
    if (cR.rows.length === 0) { await client.query("ROLLBACK"); res.status(404).json({ error: "Not found" }); return; }
    if (cR.rows[0].status !== "REJECTED") { await client.query("ROLLBACK"); res.status(400).json({ error: "Only rejected profiles can reapply" }); return; }

    await client.query(
      `UPDATE "Creator" SET status='PENDING', "changedSections"='{}'::text[], "resubmittedAt"=NOW(),
       "rejectionReason"=NULL, "rejectionSolution"=NULL, "rejectionNote"=NULL, "updatedAt"=NOW() WHERE id=$1`,
      [creatorId],
    );

    const admins = await client.query(`SELECT id FROM "Admin"`);
    for (const a of admins.rows) {
      await client.query(
        `INSERT INTO "Notification" (id, "userId", "userType", type, title, body, "expiresAt")
         VALUES (gen_random_uuid()::text, $1, 'ADMIN', 'CREATOR_REAPPLIED', $2, $3, NOW() + INTERVAL '30 days')`,
        [a.id, "Creator Reapplied", `Creator ${cR.rows[0].fullName} has reapplied for verification.`],
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// ── Notifications ───────────────────────────────────────────────────────────
router.get("/creator/notifications", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const [listR, countR] = await Promise.all([
    pool.query(
      `SELECT * FROM "Notification" WHERE "userId"=$1 AND "userType"='CREATOR'
       ORDER BY "createdAt" DESC LIMIT 100`,
      [creatorId],
    ),
    pool.query(
      `SELECT COUNT(*)::int as c FROM "Notification" WHERE "userId"=$1 AND "userType"='CREATOR' AND "isRead"=false`,
      [creatorId],
    ),
  ]);
  res.json({ notifications: listR.rows, unreadCount: countR.rows[0].c });
});

router.patch("/creator/notifications/mark-all-read", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  await pool.query(
    `UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND "userType"='CREATOR' AND "isRead"=false`,
    [creatorId],
  );
  res.json({ ok: true });
});

// ── Fun Questions (creator) ─────────────────────────────────────────────────
router.get("/creator/fun-questions", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const [qR, optR, ansR] = await Promise.all([
    pool.query(`SELECT * FROM "FunQuestion" WHERE "isActive"=true ORDER BY "displayOrder", "createdAt"`),
    pool.query(`SELECT * FROM "FunQuestionOption" ORDER BY "displayOrder"`),
    pool.query(`SELECT "questionId", "selectedOptions" FROM "CreatorFunAnswer" WHERE "creatorId"=$1`, [creatorId]),
  ]);
  const optsByQ: Record<string, any[]> = {};
  for (const o of optR.rows) {
    (optsByQ[o.questionId] ??= []).push({ id: o.id, optionText: o.optionText });
  }
  const ansByQ: Record<string, string[]> = {};
  for (const a of ansR.rows) ansByQ[a.questionId] = a.selectedOptions ?? [];
  res.json({
    questions: qR.rows.map(q => ({
      id: q.id,
      questionText: q.questionText,
      options: optsByQ[q.id] ?? [],
      selectedOptionId: (ansByQ[q.id] ?? [])[0] ?? null,
    })),
  });
});

router.patch("/creator/fun-answers", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { questionId, optionId } = req.body as { questionId?: string; optionId?: string };
  if (!questionId || !optionId) { res.status(400).json({ error: "questionId and optionId required" }); return; }
  // verify option belongs to question
  const ok = await pool.query(`SELECT 1 FROM "FunQuestionOption" WHERE id=$1 AND "questionId"=$2`, [optionId, questionId]);
  if (ok.rows.length === 0) { res.status(400).json({ error: "Invalid option" }); return; }

  const existing = await pool.query(`SELECT id FROM "CreatorFunAnswer" WHERE "creatorId"=$1 AND "questionId"=$2`, [creatorId, questionId]);
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE "CreatorFunAnswer" SET "selectedOptions"=ARRAY[$1]::text[] WHERE "creatorId"=$2 AND "questionId"=$3`,
      [optionId, creatorId, questionId],
    );
  } else {
    await pool.query(
      `INSERT INTO "CreatorFunAnswer" (id, "creatorId", "questionId", "selectedOptions")
       VALUES (gen_random_uuid()::text, $1, $2, ARRAY[$3]::text[])`,
      [creatorId, questionId, optionId],
    );
  }
  res.json({ ok: true });
});

// ── Creator: Popup endpoints ──
router.get("/creator/popups/pending", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const r = await pool.query(
    `SELECT id,type,title,body,"ctaText","ctaPath","isCelebration","secondCtaText","secondCtaPath" FROM "Popup"
     WHERE "userId"=$1 AND "userType"='CREATOR' AND status='PENDING' AND "expiresAt">NOW()
     ORDER BY "createdAt" ASC`,
    [creatorId],
  );
  res.json({ popups: r.rows });
});

router.patch("/creator/popups/:id/dismiss", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  await pool.query(
    `UPDATE "Popup" SET status='DISMISSED' WHERE id=$1 AND "userId"=$2 AND "userType"='CREATOR'`,
    [req.params["id"], creatorId],
  );
  res.json({ ok: true });
});

router.get("/creator/notifications/stream", (req: Request, res: Response): void => {
  const token =
    req.headers.authorization?.replace("Bearer ", "") ||
    (req.query["token"] as string | undefined);

  if (!token) { res.status(401).end(); return; }

  let creatorId: string;
  try {
    const payload = verifyToken(token, getAccessSecret());
    if (payload.userType !== "CREATOR") { res.status(403).end(); return; }
    creatorId = payload.userId;
  } catch {
    res.status(401).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  addCreatorSSE(creatorId, res);

  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeCreatorSSE(creatorId, res);
  });
});

export default router;
