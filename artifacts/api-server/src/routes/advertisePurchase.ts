import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAdminSecret } from "../middleware/requireAdminSecret";
import { createNotification } from "../lib/notifications";
import { logger } from "../lib/logger";
import { getAdvertiseBrand } from "./adminConfig";

// Paid "Advertise your brand" plans. Mirrors whiteGlove.ts (own table, shared
// idempotent fulfilment for verify-payment + the Razorpay webhook), minus the
// membership lookup — the team sets the placement up by hand after payment.

const router: IRouter = Router();

/** Razorpay order-notes marker, read back at verify/webhook time. */
export const ADVERTISE_PURPOSE = "advertise_brand";

export async function ensureAdvertisePurchaseTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "AdvertisePurchase" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "orderRef" TEXT NOT NULL,
      "brandId" TEXT NOT NULL,
      "planId" TEXT NOT NULL,
      "planName" TEXT NOT NULL,
      months INTEGER NOT NULL,
      "amountInr" INTEGER NOT NULL,
      "baseAmountInr" INTEGER,
      "gstRatePercent" INTEGER,
      "gstAmountInr" INTEGER,
      "totalAmountInr" INTEGER,
      "razorpayOrderId" TEXT NOT NULL,
      "razorpayPaymentId" TEXT NOT NULL UNIQUE,
      "contactedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_adp_brandId" ON "AdvertisePurchase" ("brandId")`);
}

interface FulfillResult {
  status: "recorded" | "duplicate";
  orderRef: string;
}

/**
 * Idempotently record a paid Advertise plan. Shared by verify-payment and the
 * Razorpay webhook so whichever lands first records it and the other is a
 * no-op. Idempotency key is the Razorpay payment id.
 */
export async function fulfillAdvertisePurchase(opts: {
  brandId: string;
  planId: string;
  planName: string;
  months: number;
  amountInr: number;        // total charged (incl GST)
  orderId: string;
  paymentId: string;
  baseAmountInr?: number;
  gstRatePercent?: number;
  gstAmountInr?: number;
  totalAmountInr?: number;
}): Promise<FulfillResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise sequence allocation so two concurrent purchases can't share an orderRef.
    await client.query(`LOCK TABLE "AdvertisePurchase" IN SHARE ROW EXCLUSIVE MODE`);
    const dup = await client.query(
      `SELECT "orderRef" FROM "AdvertisePurchase" WHERE "razorpayPaymentId"=$1`,
      [opts.paymentId],
    );
    if (dup.rows.length > 0) {
      await client.query("COMMIT");
      return { status: "duplicate", orderRef: dup.rows[0].orderRef as string };
    }
    const countRow = await client.query(`SELECT COUNT(*) FROM "AdvertisePurchase"`);
    const seq = parseInt(countRow.rows[0].count as string) + 1;
    const orderRef = `CLBad${String(seq).padStart(6, "0")}`;
    await client.query(
      `INSERT INTO "AdvertisePurchase"
         ("orderRef","brandId","planId","planName",months,"amountInr","razorpayOrderId","razorpayPaymentId",
          "baseAmountInr","gstRatePercent","gstAmountInr","totalAmountInr")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [orderRef, opts.brandId, opts.planId, opts.planName, opts.months, opts.amountInr, opts.orderId, opts.paymentId,
       opts.baseAmountInr ?? null, opts.gstRatePercent ?? null, opts.gstAmountInr ?? null, opts.totalAmountInr ?? opts.amountInr],
    );
    await client.query("COMMIT");
    // Its own type, not PAYMENT_SUCCESS: that one maps to the "credit payment
    // confirmed" WhatsApp, which would be the wrong message for an ad plan.
    void createNotification({
      userId: opts.brandId,
      userType: "BRAND",
      type: "ADVERTISE_PAYMENT_SUCCESS",
      title: "Payment successful",
      body: `Your Advertise ${opts.planName} plan is confirmed. Our team will reach out within 24 hours to set up your placement.`,
    }).catch(() => {});
    return { status: "recorded", orderRef };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Fulfil from a Razorpay order's notes — shared by verify-payment and the webhook. */
export function fulfillAdvertiseFromNotes(
  notes: Record<string, string>,
  orderId: string,
  paymentId: string,
): Promise<FulfillResult> {
  const total = parseInt(notes["totalInr"] ?? notes["amountInr"] ?? "0") || 0;
  const base = parseInt(notes["baseInr"] ?? "0") || 0;
  return fulfillAdvertisePurchase({
    brandId: String(notes["brandId"] ?? ""),
    planId: String(notes["planId"] ?? ""),
    planName: String(notes["planName"] ?? ""),
    months: parseInt(notes["months"] ?? "0") || 0,
    amountInr: total,
    orderId,
    paymentId,
    baseAmountInr: base || undefined,
    gstRatePercent: notes["gstRatePercent"] != null ? (parseInt(notes["gstRatePercent"]) || 0) : undefined,
    gstAmountInr: notes["gstInr"] != null ? (parseInt(notes["gstInr"]) || 0) : (total && base ? total - base : undefined),
    totalAmountInr: total || undefined,
  });
}

// ── POST /api/brand/advertise/create-order (Razorpay) ──
router.post("/brand/advertise/create-order", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const planId = typeof req.body?.planId === "string" ? req.body.planId : "";
  // Price + GST rate come from the admin-managed config, never from the client.
  const { plans, gstRatePercent } = await getAdvertiseBrand();
  const plan = plans.find(p => p.id === planId);
  if (!plan) { res.status(400).json({ error: "Unknown plan" }); return; }
  const baseInr = Math.round(plan.price);
  if (!baseInr || baseInr < 1) { res.status(400).json({ error: "This plan has no price set" }); return; }
  // GST-inclusive total is what we charge. Same formula as the public page's
  // displayed total, so the shown and charged amounts match to the rupee.
  const rate = gstRatePercent;
  const totalInr = Math.round(baseInr * (1 + rate / 100));
  const gstInr = totalInr - baseInr;
  const amountPaise = totalInr * 100;

  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    res.status(503).json({ error: "RAZORPAY_NOT_CONFIGURED", message: "Payment gateway is not configured. Please contact support." });
    return;
  }
  try {
    const Razorpay = (await import("razorpay")).default as any;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.create({
      amount: amountPaise, currency: "INR",
      // Notes are authoritative server-side data read back at verify/webhook time.
      notes: {
        brandId,
        planId: plan.id,
        planName: plan.name,
        months: String(plan.months),
        amountInr: String(totalInr),
        baseInr: String(baseInr),
        gstRatePercent: String(rate),
        gstInr: String(gstInr),
        totalInr: String(totalInr),
        purpose: ADVERTISE_PURPOSE,
      },
    });
    res.json({ orderId: order.id, amount: amountPaise, currency: "INR", key: keyId, planName: plan.name, baseInr, gstRatePercent: rate, gstInr, totalInr, amountInr: totalInr });
  } catch (e: any) {
    logger.error({ err: e, brandId }, "Advertise create-order failed");
    res.status(500).json({ error: e.message ?? "Failed to create order" });
  }
});

// ── POST /api/brand/advertise/verify-payment (Razorpay) ──
router.post("/brand/advertise/verify-payment", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ error: "Missing payment fields" });
    return;
  }
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    res.status(503).json({ error: "RAZORPAY_NOT_CONFIGURED", message: "Payment gateway is not configured." });
    return;
  }
  try {
    const crypto = await import("crypto");
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    let valid = false;
    try {
      valid = expected.length === razorpay_signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    } catch { valid = false; }
    if (!valid) { res.status(400).json({ error: "Signature verification failed" }); return; }

    // Re-read the order from Razorpay for authoritative brand/plan/amount.
    const Razorpay = (await import("razorpay")).default as any;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.fetch(razorpay_order_id);
    const notes = (order?.notes ?? {}) as Record<string, string>;
    if (notes["purpose"] !== ADVERTISE_PURPOSE) { res.status(400).json({ error: "Invalid order" }); return; }
    if (notes["brandId"] !== brandId) { res.status(403).json({ error: "Order does not belong to this account" }); return; }

    const result = await fulfillAdvertiseFromNotes(notes, razorpay_order_id, razorpay_payment_id);
    res.json({ ok: true, orderRef: result.orderRef, duplicate: result.status === "duplicate" });
  } catch (e: any) {
    logger.error({ err: e, brandId }, "Advertise verify-payment failed");
    res.status(500).json({ error: e.message ?? "Payment verification failed" });
  }
});

// ── GET /api/admin/advertise/purchases ──
// Returns brand contact details in bulk, so it sits behind the real admin secret.
router.get("/admin/advertise/purchases", requireAdmin, requireAdminSecret, async (_req: Request, res: Response): Promise<void> => {
  const rows = await pool.query(
    `SELECT p.id, p."orderRef", p."brandId", p."planName", p.months, p."amountInr",
            p."baseAmountInr", p."gstRatePercent", p."gstAmountInr", p."totalAmountInr",
            p."razorpayPaymentId", p."contactedAt", p."createdAt",
            b."brandName", b."contactName", b.email
     FROM "AdvertisePurchase" p
     LEFT JOIN "Brand" b ON b.id = p."brandId"
     ORDER BY p."createdAt" DESC
     LIMIT 500`,
  );
  res.json(rows.rows);
});

// ── PATCH /api/admin/advertise/purchases/:id/contacted ──
router.patch("/admin/advertise/purchases/:id/contacted", requireAdmin, requireAdminSecret, async (req: Request, res: Response): Promise<void> => {
  const contacted = !!req.body?.contacted;
  const r = await pool.query(
    `UPDATE "AdvertisePurchase" SET "contactedAt" = ${contacted ? "NOW()" : "NULL"} WHERE id::text=$1 RETURNING "contactedAt"`,
    [req.params["id"]],
  );
  if (r.rows.length === 0) { res.status(404).json({ error: "Purchase not found" }); return; }
  res.json({ ok: true, contactedAt: r.rows[0].contactedAt });
});

export default router;
