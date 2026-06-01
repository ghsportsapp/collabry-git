import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { requireCreator } from "../middleware/requireCreator";
import { requireAdmin } from "../middleware/requireAdmin";
import { createSystemMessage } from "../lib/dealChat";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

// ─── IST formatter ───────────────────────────────────────────────────────────
// Timestamps are stored as UTC; frontend shows in IST (UTC+5:30)

// ─── Contact info scan ────────────────────────────────────────────────────────
const PHONE_RE = /(\+91|0)?[6-9]\d{9}/;
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const URL_RE = /(https?:\/\/|www\.)[^\s]+/gi;

const ALLOWED_DOMAINS = ["drive.google.com", "instagram.com", "www.instagram.com"];

function containsContactInfo(text: string): boolean {
  if (PHONE_RE.test(text)) return true;
  if (EMAIL_RE.test(text)) return true;

  const urlMatches = text.match(URL_RE) ?? [];
  for (const url of urlMatches) {
    const isAllowed = ALLOWED_DOMAINS.some(d => url.toLowerCase().includes(d));
    if (!isAllowed) return true;
  }
  return false;
}

// ─── Verify deal participant ──────────────────────────────────────────────────
async function verifyParticipant(
  dealId: string,
  participantId: string,
  participantType: "BRAND" | "CREATOR"
): Promise<{ ok: boolean; status?: string; chatDeletedAt?: string | null }> {
  const col = participantType === "BRAND" ? '"brandId"' : '"creatorId"';
  const r = await pool.query(
    `SELECT status, "chatDeletedAt" FROM "Deal" WHERE id=$1 AND ${col}=$2`,
    [dealId, participantId]
  );
  if (r.rows.length === 0) return { ok: false };
  return { ok: true, status: r.rows[0].status, chatDeletedAt: r.rows[0].chatDeletedAt ?? null };
}

function serializeMessage(m: any) {
  return {
    id: m.id,
    dealId: m.dealId,
    senderType: m.senderType,
    senderId: m.senderId ?? null,
    messageType: m.messageType,
    content: m.content,
    metadata: m.metadata ?? null,
    createdAt: m.createdAt,
  };
}

// ─── Brand: GET chat ──────────────────────────────────────────────────────────
router.get("/brand/deals/:id/chat", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyParticipant(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (v.chatDeletedAt) {
    res.json({ chatArchived: true, messages: [], dealStatus: v.status }); return;
  }
  const msgs = await pool.query(
    `SELECT * FROM "DealMessage" WHERE "dealId"=$1 ORDER BY "createdAt" ASC`,
    [id]
  );
  res.json({ messages: msgs.rows.map(serializeMessage), dealStatus: v.status });
});

// ─── Creator: GET chat ────────────────────────────────────────────────────────
router.get("/creator/deals/:id/chat", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyParticipant(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (v.chatDeletedAt) {
    res.json({ chatArchived: true, messages: [], dealStatus: v.status }); return;
  }
  const msgs = await pool.query(
    `SELECT * FROM "DealMessage" WHERE "dealId"=$1 ORDER BY "createdAt" ASC`,
    [id]
  );
  res.json({ messages: msgs.rows.map(serializeMessage), dealStatus: v.status });
});

// ─── Brand: POST send message ─────────────────────────────────────────────────
router.post("/brand/deals/:id/chat/send", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyParticipant(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (v.chatDeletedAt) { res.status(410).json({ error: "This conversation has been archived." }); return; }
  if (v.status === "COMPLETED" || v.status === "CANCELLED") {
    res.status(400).json({ error: "This deal is closed. Chat is read-only." }); return;
  }
  // DISPUTED deals may still chat (admin monitors)
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Message content required" }); return;
  }
  if (containsContactInfo(content)) {
    res.status(400).json({ error: "You cannot share personal contact information in deal chat." }); return;
  }
  const r = await pool.query(
    `INSERT INTO "DealMessage" (id,"dealId","senderType","senderId","messageType",content,"createdAt")
     VALUES (gen_random_uuid(),$1,'BRAND',$2,'USER_MESSAGE',$3,NOW()) RETURNING *`,
    [id, brandId, content.trim()]
  );
  const dealInfo = await pool.query(
    `SELECT d."creatorId", c."instagramHandle", c."fullName", b."brandName"
     FROM "Deal" d
     JOIN "Creator" c ON c.id=d."creatorId"
     JOIN "Brand" b ON b.id=d."brandId"
     WHERE d.id=$1`,
    [id]
  );
  if (dealInfo.rows.length > 0) {
    const { creatorId: notifyCreatorId, instagramHandle, brandName } = dealInfo.rows[0];
    await createNotification({
      userId: notifyCreatorId, userType: "CREATOR", type: "DEAL_CHAT_MESSAGE",
      title: "New message in your deal",
      body: `You have a new message from ${brandName} in deal with @${instagramHandle}`,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
  }
  res.json({ message: serializeMessage(r.rows[0]) });
});

// ─── Creator: POST send message ───────────────────────────────────────────────
router.post("/creator/deals/:id/chat/send", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyParticipant(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }
  if (v.chatDeletedAt) { res.status(410).json({ error: "This conversation has been archived." }); return; }
  if (v.status === "COMPLETED" || v.status === "CANCELLED") {
    res.status(400).json({ error: "This deal is closed. Chat is read-only." }); return;
  }
  // DISPUTED deals may still chat (admin monitors)
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Message content required" }); return;
  }
  if (containsContactInfo(content)) {
    res.status(400).json({ error: "You cannot share personal contact information in deal chat." }); return;
  }
  const r = await pool.query(
    `INSERT INTO "DealMessage" (id,"dealId","senderType","senderId","messageType",content,"createdAt")
     VALUES (gen_random_uuid(),$1,'CREATOR',$2,'USER_MESSAGE',$3,NOW()) RETURNING *`,
    [id, creatorId, content.trim()]
  );
  const dealInfo2 = await pool.query(
    `SELECT d."brandId", c."instagramHandle", c."fullName"
     FROM "Deal" d
     JOIN "Creator" c ON c.id=d."creatorId"
     JOIN "Brand" b ON b.id=d."brandId"
     WHERE d.id=$1`,
    [id]
  );
  if (dealInfo2.rows.length > 0) {
    const { brandId: notifyBrandId, instagramHandle, fullName } = dealInfo2.rows[0];
    await createNotification({
      userId: notifyBrandId, userType: "BRAND", type: "DEAL_CHAT_MESSAGE",
      title: "New message in your deal",
      body: `You have a new message from ${fullName} in deal with @${instagramHandle}`,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
  }
  res.json({ message: serializeMessage(r.rows[0]) });
});

// ─── Admin: GET /admin/deals ──────────────────────────────────────────────────
const ACTIVE_STATUSES = [
  "IN_ESCROW","PENDING_PAYMENT","LIVE","IN_PROGRESS","DELIVERED","REVIEW",
  "CONCEPT_SUBMITTED","CONCEPT_APPROVED","PRODUCT_SHIPPED","PRODUCT_RECEIVED",
  "CONTENT_UPLOADED","REVISION_REQUESTED","CONTENT_APPROVED",
  "FINAL_POST_CONFIRMED","DISPUTE_WINDOW_OPEN","DISPUTED","OVERDUE"
];

router.get("/admin/deals/list", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { filter = "active", search = "", page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (pageNum - 1) * pageSize;

  let statusFilter = "";
  if (filter === "active") statusFilter = `AND d.status = ANY(ARRAY[${ACTIVE_STATUSES.map(s => `'${s}'`).join(",")}])`;
  else if (filter === "completed") statusFilter = `AND d.status IN ('COMPLETED','CONTENT_APPROVED','DISPUTE_WINDOW_OPEN')`;
  else if (filter === "cancelled") statusFilter = `AND d.status IN ('CANCELLED','REJECTED','EXPIRED')`;

  let searchFilter = "";
  const params: any[] = [];
  if (search.trim()) {
    params.push(`%${search.trim()}%`);
    searchFilter = `AND (b."brandName" ILIKE $${params.length} OR c."fullName" ILIKE $${params.length} OR c."instagramHandle" ILIKE $${params.length} OR d.id ILIKE $${params.length} OR d."orderId" ILIKE $${params.length})`;
  }

  params.push(pageSize, offset);
  const countParams = params.slice(0, -2);

  const q = `
    SELECT d.id, d.status, d.source, d."createdAt", d."totalAgreedValue", d."totalPayable",
           d."reelCount", d."storyCount", d."postCount", d."timelineDays",
           d."creatorPayout", d."gstAmount", d."commissionRate",
           d."payoutStatus", d."escrowStatus",
           b."brandName", b."logoUrl" as "brandLogoUrl",
           c."fullName" as "creatorName", c."instagramHandle",
           (SELECT "createdAt" FROM "DealMessage" WHERE "dealId"=d.id ORDER BY "createdAt" DESC LIMIT 1) as "lastActivity"
    FROM "Deal" d
    JOIN "Brand" b ON b.id=d."brandId"
    JOIN "Creator" c ON c.id=d."creatorId"
    WHERE 1=1 ${statusFilter} ${searchFilter}
    ORDER BY COALESCE(
      (SELECT "createdAt" FROM "DealMessage" WHERE "dealId"=d.id ORDER BY "createdAt" DESC LIMIT 1),
      d."createdAt"
    ) DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const countQ = `
    SELECT COUNT(*) as total FROM "Deal" d
    JOIN "Brand" b ON b.id=d."brandId"
    JOIN "Creator" c ON c.id=d."creatorId"
    WHERE 1=1 ${statusFilter} ${searchFilter}
  `;

  const [rows, countRows] = await Promise.all([
    pool.query(q, params),
    pool.query(countQ, countParams),
  ]);

  res.json({
    deals: rows.rows,
    total: parseInt(countRows.rows[0].total),
    page: pageNum,
    pageSize,
  });
});

// ─── Admin: GET /admin/deals/:id ──────────────────────────────────────────────
router.get("/admin/deals/:id/detail", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;

  const [dealRow, messagesRow, deliverablesRow, disputesRow, issuesRow, actionsRow] = await Promise.all([
    pool.query(
      `SELECT d.*, b."brandName", b."logoUrl" as "brandLogoUrl", b.phone as "brandPhone",
              c."fullName" as "creatorName", c."instagramHandle", c."profilePhotoUrl", c.phone as "creatorPhone"
       FROM "Deal" d
       JOIN "Brand" b ON b.id=d."brandId"
       JOIN "Creator" c ON c.id=d."creatorId"
       WHERE d.id=$1`,
      [id]
    ),
    pool.query(`SELECT * FROM "DealMessage" WHERE "dealId"=$1 ORDER BY "createdAt" ASC`, [id]),
    pool.query(`SELECT * FROM "DealDeliverable" WHERE "dealId"=$1 ORDER BY type, "slotLabel"`, [id]),
    pool.query(`SELECT * FROM "DealDispute" WHERE "dealId"=$1`, [id]),
    pool.query(`SELECT * FROM "ProductIssueReport" WHERE "dealId"=$1 ORDER BY "raisedAt" DESC`, [id]),
    pool.query(
      `SELECT * FROM "AdminActionLog" WHERE "entityType"='Deal' AND "entityId"=$1 ORDER BY "createdAt" DESC LIMIT 50`,
      [id]
    ),
  ]);

  if (dealRow.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }

  res.json({
    deal: dealRow.rows[0],
    messages: messagesRow.rows,
    deliverables: deliverablesRow.rows,
    disputes: disputesRow.rows,
    issues: issuesRow.rows,
    adminActions: actionsRow.rows,
  });
});

// ─── Admin: Override status ────────────────────────────────────────────────────
router.post("/admin/deals/:id/override-status", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { status, reason } = req.body ?? {};
  if (!status || !reason) { res.status(400).json({ error: "status and reason required" }); return; }

  const valid = [...ACTIVE_STATUSES, "COMPLETED", "CANCELLED"];
  if (!valid.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }

  await pool.query(`UPDATE "Deal" SET status=$2 WHERE id=$1`, [id, status]);
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,reason,"createdAt")
     VALUES (gen_random_uuid(),$1,'OVERRIDE_STATUS','Deal',$2,$3,$4,NOW())`,
    [adminId, id, JSON.stringify({ newStatus: status }), reason]
  );
  await createSystemMessage(id, `⚙️ Admin override: Status changed to ${status}. Reason: ${reason}`);
  res.json({ ok: true });
});

// ─── Admin: Resolve dispute ────────────────────────────────────────────────────
router.post("/admin/deals/:id/resolve-dispute", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { resolution, notes } = req.body ?? {};
  const RESOLUTIONS = ["FULL_PAYOUT", "PARTIAL_PAYOUT", "NO_PAYOUT", "FULL_REFUND"];
  if (!resolution || !RESOLUTIONS.includes(resolution)) { res.status(400).json({ error: "Valid resolution required" }); return; }

  await pool.query(
    `UPDATE "DealDispute" SET "adminDecision"=$2, "adminNotes"=$3, "resolvedBy"=$4, "resolvedAt"=NOW() WHERE "dealId"=$1`,
    [id, resolution, notes ?? null, adminId]
  );
  await pool.query(`UPDATE "Deal" SET status='COMPLETED' WHERE id=$1`, [id]);
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,reason,"createdAt")
     VALUES (gen_random_uuid(),$1,'RESOLVE_DISPUTE','Deal',$2,$3,$4,NOW())`,
    [adminId, id, JSON.stringify({ resolution }), notes ?? ""]
  );
  await createSystemMessage(id, `⚖️ Dispute resolved by admin: ${resolution.replace("_", " ")}. ${notes ?? ""}`);
  res.json({ ok: true });
});

// ─── Admin: Extend timeline ────────────────────────────────────────────────────
router.post("/admin/deals/:id/extend-timeline", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { days, reason } = req.body ?? {};
  const daysNum = parseInt(days) || 0;
  if (daysNum < 1 || !reason) { res.status(400).json({ error: "days (≥1) and reason required" }); return; }

  await pool.query(
    `UPDATE "Deal" SET "timelineDays"="timelineDays"+$2,
     "deadlineAt"=COALESCE("deadlineAt", NOW()) + ($2 || ' days')::interval
     WHERE id=$1`,
    [id, daysNum]
  );
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,reason,"createdAt")
     VALUES (gen_random_uuid(),$1,'EXTEND_TIMELINE','Deal',$2,$3,$4,NOW())`,
    [adminId, id, JSON.stringify({ addedDays: daysNum }), reason]
  );
  await createSystemMessage(id, `📅 Admin extended timeline by ${daysNum} day${daysNum > 1 ? "s" : ""}. Reason: ${reason}`);
  res.json({ ok: true });
});

// ─── Admin: Cancel deal ────────────────────────────────────────────────────────
router.post("/admin/deals/:id/cancel", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { reason } = req.body ?? {};
  if (!reason) { res.status(400).json({ error: "reason required" }); return; }

  await pool.query(`UPDATE "Deal" SET status='CANCELLED' WHERE id=$1`, [id]);
  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",reason,"createdAt")
     VALUES (gen_random_uuid(),$1,'CANCEL_DEAL','Deal',$2,$3,NOW())`,
    [adminId, id, reason]
  );
  await createSystemMessage(id, `❌ Deal cancelled by admin. Reason: ${reason}`);
  if (id) {
    const { handleCampaignDealCancelled } = await import("./campaigns");
    await handleCampaignDealCancelled(id);
  }
  res.json({ ok: true });
});

// ─── Brand: Mark product as shipped ──────────────────────────────────────────
router.post("/brand/deals/:id/product-shipped", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyParticipant(id!, brandId, "BRAND");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }

  const dealRow = await pool.query(`SELECT status,"productRequired","productShippedAt","productReceivedAt","requireCourierAwb" FROM "Deal" WHERE id=$1`, [id]);
  const deal = dealRow.rows[0];
  if (!deal.productRequired) { res.status(400).json({ error: "This deal does not require product shipping" }); return; }
  if (deal.productShippedAt) { res.status(400).json({ error: "Product already marked as shipped" }); return; }
  if (deal.status !== "CONCEPT_APPROVED") {
    res.status(400).json({ error: "Concepts must be approved before shipping the product" }); return;
  }

  const { awbNumber, courierName, shipDate } = req.body ?? {};
  const awbTrim = (awbNumber as string | undefined)?.trim() || "";
  const courierTrim = (courierName as string | undefined)?.trim() || "";
  const shipDateTrim = (shipDate as string | undefined)?.trim() || "";

  if (!courierTrim) { res.status(400).json({ error: "Courier name is required." }); return; }
  if (!awbTrim) { res.status(400).json({ error: "AWB / tracking number is required." }); return; }
  if (!shipDateTrim) { res.status(400).json({ error: "Ship date is required." }); return; }

  await pool.query(
    `UPDATE "Deal"
     SET status='PRODUCT_SHIPPED',
         "productShippedAt"=NOW(),
         "awbNumber"=$2,
         "courierName"=$3,
         "shipDate"=$4,
         "address_locked"=true,
         "awb_locked"=false,
         "awb_correction_count"=0
     WHERE id=$1`,
    [id, awbTrim, courierTrim, shipDateTrim]
  );

  const awbInfo = ` AWB: ${awbTrim} via ${courierTrim} (shipped ${shipDateTrim})`;
  await createSystemMessage(id, `📦 Brand marked product as shipped.${awbInfo} Creator, please confirm when you receive it.`);
  const dealFull = await pool.query(`SELECT "creatorId" FROM "Deal" WHERE id=$1`, [id]);
  if (dealFull.rows.length > 0) {
    await createNotification({
      userId: dealFull.rows[0].creatorId, userType: "CREATOR", type: "PRODUCT_SHIPPED",
      title: "Product is on the way!",
      body: `The brand has shipped the product.${awbTrim ? ` AWB: ${awbTrim}${courierTrim ? ` via ${courierTrim}` : ""}` : ""} Confirm receipt once it arrives.`,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
  }
  res.json({ ok: true });
});

// ─── Creator: Mark product as received (starts timeline) ──────────────────────
router.post("/creator/deals/:id/product-received", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyParticipant(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }

  const dealRow = await pool.query(
    `SELECT status,"productRequired","productShippedAt","productReceivedAt","timelineDays" FROM "Deal" WHERE id=$1`,
    [id]
  );
  const deal = dealRow.rows[0];
  if (!deal.productRequired) { res.status(400).json({ error: "This deal does not require product shipping" }); return; }
  if (!deal.productShippedAt) { res.status(400).json({ error: "Brand has not shipped the product yet" }); return; }
  if (deal.productReceivedAt) { res.status(400).json({ error: "Product already marked as received" }); return; }
  if (deal.status !== "PRODUCT_SHIPPED") {
    res.status(400).json({ error: `Cannot mark received in status ${deal.status}` }); return;
  }

  await pool.query(
    `UPDATE "Deal"
     SET status='PRODUCT_RECEIVED',
         "productReceivedAt"=NOW(),
         "receivedMarkedBy"=$2,
         "timelineStartAt"=NOW(),
         "deadlineAt"=NOW() + ($3 || ' days')::interval
     WHERE id=$1`,
    [id, creatorId, deal.timelineDays]
  );

  await createSystemMessage(id, `✅ Creator confirmed product received! Deal timeline has started. Deadline: ${deal.timelineDays} days from now.`);
  const dealFull2 = await pool.query(`SELECT "brandId" FROM "Deal" WHERE id=$1`, [id]);
  if (dealFull2.rows.length > 0) {
    await createNotification({
      userId: dealFull2.rows[0].brandId, userType: "BRAND", type: "PRODUCT_RECEIVED",
      title: "Creator received the product!",
      body: `The creator confirmed receipt. The deal timeline has started — ${deal.timelineDays} day${deal.timelineDays !== 1 ? "s" : ""} to deliver content.`,
      relatedEntityType: "Deal", relatedEntityId: id,
    });
  }
  res.json({ ok: true });
});

// ─── Creator: Submit delivery address ────────────────────────────────────────
router.post("/creator/deals/:id/delivery-address", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const creatorId = (req as any).creatorId as string;
  const { id } = req.params as Record<string, string>;
  const v = await verifyParticipant(id!, creatorId, "CREATOR");
  if (!v.ok) { res.status(404).json({ error: "Deal not found" }); return; }

  const dealRow = await pool.query(
    `SELECT status, "productRequired", "brandId", "address_locked" FROM "Deal" WHERE id=$1`,
    [id]
  );
  const deal = dealRow.rows[0];
  if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }
  if (!deal.productRequired) { res.status(400).json({ error: "This deal does not require product shipping." }); return; }
  if (deal.address_locked) { res.status(400).json({ error: "Address can no longer be changed — the brand has already shipped." }); return; }

  const { addressName, addressLine1, addressLine2, city, state, pincode, phone } = req.body ?? {};
  const n = (s: unknown) => (typeof s === "string" ? s.trim() : "");
  if (!n(addressName) || !n(addressLine1) || !n(city) || !n(state) || !n(pincode) || !n(phone)) {
    res.status(400).json({ error: "Name, address line 1, city, state, pincode and phone are all required." }); return;
  }
  const phoneTrim = n(phone).replace(/[^\d+]/g, "");
  if (phoneTrim.length < 10) { res.status(400).json({ error: "Please enter a valid phone number." }); return; }
  const parts = [n(addressName), n(addressLine1)];
  if (n(addressLine2)) parts.push(n(addressLine2));
  parts.push(n(city), `${n(state)} - ${n(pincode)}`);
  const address = parts.join(", ");

  await pool.query(
    `UPDATE "Deal" SET "deliveryAddress"=$2, "delivery_address_phone"=$3 WHERE id=$1`,
    [id, address, phoneTrim]
  );
  await createSystemMessage(id, `📍 Creator's delivery address:\n${address}\n📞 Phone: ${phoneTrim}`);

  await createNotification({
    userId: deal.brandId, userType: "BRAND", type: "FIELD_REQUIRED",
    title: "Creator shared delivery address",
    body: `Address: ${address} | Phone: ${phoneTrim}. Please review and click Ship Product when ready.`,
    relatedEntityType: "Deal", relatedEntityId: id,
  });

  res.json({ ok: true, deliveryAddress: address, phone: phoneTrim });
});

// ─── Admin: GET chat ──────────────────────────────────────────────────────────
router.get("/admin/deals/:id/chat", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const dealCheck = await pool.query(`SELECT "chatDeletedAt" FROM "Deal" WHERE id=$1`, [id]);
  if (dealCheck.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
  if (dealCheck.rows[0].chatDeletedAt) {
    res.json({ chatArchived: true, messages: [] }); return;
  }
  const msgs = await pool.query(
    `SELECT * FROM "DealMessage" WHERE "dealId"=$1 ORDER BY "createdAt" ASC`,
    [id]
  );
  res.json({ messages: msgs.rows.map(m => ({
    id: m.id, dealId: m.dealId, senderType: m.senderType, senderId: m.senderId,
    messageType: m.messageType, content: m.content, metadata: m.metadata, createdAt: m.createdAt,
  })) });
});

// ─── Admin: POST send message ─────────────────────────────────────────────────
router.post("/admin/deals/:id/chat/send", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string | undefined;
  const { id } = req.params as Record<string, string>;
  const exists = await pool.query(`SELECT id FROM "Deal" WHERE id=$1`, [id]);
  if (exists.rows.length === 0) { res.status(404).json({ error: "Deal not found" }); return; }
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Message content required" }); return;
  }
  if (content.trim().length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 chars)" }); return;
  }
  const r = await pool.query(
    `INSERT INTO "DealMessage" (id,"dealId","senderType","senderId","messageType",content,"createdAt")
     VALUES (gen_random_uuid(),$1,'SYSTEM',$2,'ADMIN_MESSAGE',$3,NOW()) RETURNING *`,
    [id, adminId ?? null, content.trim()]
  );
  res.json({ message: serializeMessage(r.rows[0]) });
});

export default router;
