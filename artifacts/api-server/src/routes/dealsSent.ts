import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * "Deals Sent" admin tracker — DIRECT deals only, built over DealRequest.
 *
 * Direct deals are DealRequest chains; paid-campaign and barter deals never
 * create DealRequest rows (their Deal.requestId is NULL), so this router is
 * inherently direct-only and never reads or writes the "All Deals" surface.
 *
 * Gated to the "deals-sent" RBAC section by adminGuard (prefix /admin/deals-sent).
 */
const router: IRouter = Router();

const PAGE_SIZE = 30;

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

// Wrap a handler so any thrown error (e.g. a SQL/query failure) is logged and
// returned as an explicit 500 with a message, instead of bubbling to Express and
// rendering as a silent empty list on the admin page.
function guard(label: string, fn: AsyncHandler): AsyncHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (e: any) {
      logger.error({ err: e, path: req.path, label }, `deals-sent: ${label} failed`);
      if (!res.headersSent) {
        res.status(500).json({ error: `Failed to ${label}`, message: e?.message ?? "Internal error" });
      }
    }
  };
}

// Per-chain (per root) status is always recomputed here, never cached on a row.
function deriveStatus(row: {
  acceptedAt: Date | null;
  latestStatus: string | null;
  expiresAt: Date | null;
}): "ACCEPTED" | "SENT" | "REJECTED" | "EXPIRED" {
  if (row.acceptedAt != null) return "ACCEPTED";
  if (row.latestStatus === "REJECTED") return "REJECTED";
  if (row.latestStatus === "EXPIRED") return "EXPIRED";
  // PENDING / NEGOTIATING: expired on the fly if past expiry (lazy-cron gap).
  if (row.expiresAt != null && Date.now() > new Date(row.expiresAt).getTime()) return "EXPIRED";
  return "SENT";
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

// GET /admin/deals-sent?page=&search=
router.get("/admin/deals-sent", guard("load the deals-sent list", async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const searchRaw = String(req.query["search"] ?? "").trim();
  const hasSearch = searchRaw.length > 0;
  const searchParam = `%${searchRaw}%`;

  // Baseline the per-admin "last viewed" on first visit (NOW ⇒ no historical
  // acceptance floods the notification bar; only live Sent→Accepted after this).
  await pool.query(
    `INSERT INTO "AdminDealsSentView" ("adminId") VALUES ($1) ON CONFLICT ("adminId") DO NOTHING`,
    [adminId],
  );
  const vr = await pool.query(
    `SELECT "lastTrackerViewedAt" FROM "AdminDealsSentView" WHERE "adminId"=$1`, [adminId],
  );
  const lastViewed: Date = vr.rows[0]?.lastTrackerViewedAt ?? new Date();

  // One tracker row per chain = per round-1 root (parentRequestId IS NULL).
  const searchSql = hasSearch
    ? `AND (b."brandName" ILIKE $1 OR cr."instagramHandle" ILIKE $1 OR cr."fullName" ILIKE $1)`
    : "";
  // Brand/Creator are LEFT JOINed so a row still shows if either was removed.
  // NOTE: lateral joins must live in the FROM list (before WHERE), so `joins`
  // and `whereSql` are kept separate — baking WHERE into the FROM and appending
  // the laterals after it is invalid SQL.
  const joins = `
    FROM "DealRequest" dr
    LEFT JOIN "Brand" b    ON b.id  = dr."brandId"
    LEFT JOIN "Creator" cr ON cr.id = dr."creatorId"`;
  const whereSql = `
    WHERE dr."parentRequestId" IS NULL
      AND dr."trackerHiddenAt" IS NULL
      ${searchSql}`;

  const countParams = hasSearch ? [searchParam] : [];
  const countRes = await pool.query(`SELECT COUNT(*)::int AS c ${joins} ${whereSql}`, countParams);
  const total = countRes.rows[0]?.c ?? 0;

  const listParams = hasSearch ? [searchParam, PAGE_SIZE, offset] : [PAGE_SIZE, offset];
  const limIdx = hasSearch ? "$2" : "$1";
  const offIdx = hasSearch ? "$3" : "$2";
  const rows = await pool.query(
    `SELECT
       dr.id                         AS "rootId",
       dr."createdAt"                AS "sentAt",
       (dr."trackerSeenAt" IS NULL)  AS "isUnseen",
       b.id AS "brandId", b."brandName",
       cr.id AS "creatorId", cr."instagramHandle", cr."fullName",
       latest.status                 AS "latestStatus",
       latest."expiresAt"            AS "expiresAt",
       latest."respondedAt"          AS "respondedAt",
       latest."rejectionReason"      AS "rejectionReason",
       latest."totalDealValue"       AS "latestOfferedTotal",
       deal."createdAt"              AS "acceptedAt",
       deal."totalAgreedValue"       AS "acceptedAmount"
     ${joins}
     LEFT JOIN LATERAL (
       SELECT ch.status, ch."expiresAt", ch."respondedAt", ch."rejectionReason", ch."totalDealValue"
         FROM "DealRequest" ch
        WHERE ch."rootRequestId" = dr.id
        ORDER BY ch."roundNumber" DESC, ch."createdAt" DESC
        LIMIT 1
     ) latest ON true
     LEFT JOIN LATERAL (
       SELECT d."createdAt", d."totalAgreedValue"
         FROM "Deal" d
         JOIN "DealRequest" acc ON acc.id = d."requestId"
        WHERE acc."rootRequestId" = dr.id
        ORDER BY d."createdAt" ASC
        LIMIT 1
     ) deal ON true
     ${whereSql}
     ORDER BY dr."createdAt" DESC, dr.id DESC
     LIMIT ${limIdx} OFFSET ${offIdx}`,
    listParams,
  );

  const deals = rows.rows.map((r: any) => {
    const status = deriveStatus(r);
    const acceptedAmount = num(r.acceptedAmount);
    const offered = num(r.latestOfferedTotal);
    return {
      rootId: r.rootId,
      brandId: r.brandId ?? null,
      brandName: r.brandName ?? null,
      creatorId: r.creatorId ?? null,
      creatorHandle: r.instagramHandle ?? null,
      creatorName: r.fullName ?? null,
      status,
      amount: status === "ACCEPTED" ? acceptedAmount : offered,
      sentAt: r.sentAt,
      acceptedAt: r.acceptedAt ?? null,
      // Resolution date for non-accepted outcomes (dash in UI otherwise).
      resolvedAt: status === "REJECTED" ? (r.respondedAt ?? null)
        : status === "EXPIRED" ? (r.expiresAt ?? null)
        : null,
      rejectionReason: status === "REJECTED" ? (r.rejectionReason ?? null) : null,
      isUnseen: !!r.isUnseen,
    };
  });

  // Notification bar: direct deals accepted since this admin last marked viewed.
  // Deal.requestId → DealRequest keeps this direct-only (campaign/barter = NULL).
  const notifRes = await pool.query(
    `SELECT root.id AS "rootId", b."brandName", cr."instagramHandle", d."createdAt" AS "acceptedAt"
       FROM "Deal" d
       JOIN "DealRequest" acc  ON acc.id = d."requestId"
       JOIN "DealRequest" root ON root.id = acc."rootRequestId"
       LEFT JOIN "Brand" b    ON b.id = root."brandId"
       LEFT JOIN "Creator" cr ON cr.id = root."creatorId"
      WHERE d."createdAt" > $1
        AND root."trackerHiddenAt" IS NULL
      ORDER BY d."createdAt" DESC
      LIMIT 50`,
    [lastViewed],
  );
  const notifications = notifRes.rows.map((n: any) => ({
    rootId: n.rootId,
    brandName: n.brandName ?? null,
    creatorHandle: n.instagramHandle ?? null,
    acceptedAt: n.acceptedAt,
  }));

  res.json({
    deals,
    notifications,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    pageSize: PAGE_SIZE,
  });
}));

// GET /admin/deals-sent/:rootId/locate — which unfiltered page holds this chain,
// so a notification click can jump to the right page then scroll to the row.
router.get("/admin/deals-sent/:rootId/locate", guard("locate the deal page", async (req: Request, res: Response): Promise<void> => {
  const { rootId } = req.params as Record<string, string>;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS ahead
       FROM "DealRequest" x, "DealRequest" t
      WHERE t.id = $1
        AND x."parentRequestId" IS NULL
        AND x."trackerHiddenAt" IS NULL
        AND (x."createdAt", x.id) > (t."createdAt", t.id)`,
    [rootId],
  );
  if (r.rowCount === 0) { res.status(404).json({ error: "Not found" }); return; }
  const ahead = r.rows[0]?.ahead ?? 0;
  res.json({ page: Math.floor(ahead / PAGE_SIZE) + 1 });
}));

// POST /admin/deals-sent/:rootId/seen — stamp the global seen flag (row click).
router.post("/admin/deals-sent/:rootId/seen", guard("mark the deal seen", async (req: Request, res: Response): Promise<void> => {
  const { rootId } = req.params as Record<string, string>;
  await pool.query(
    `UPDATE "DealRequest" SET "trackerSeenAt"=NOW()
      WHERE id=$1 AND "parentRequestId" IS NULL AND "trackerSeenAt" IS NULL`,
    [rootId],
  );
  res.json({ ok: true });
}));

// POST /admin/deals-sent/:rootId/hide — the tracker Delete (global hide). The
// underlying DealRequest/Deal rows are untouched; this only filters the tracker.
router.post("/admin/deals-sent/:rootId/hide", guard("hide the deal", async (req: Request, res: Response): Promise<void> => {
  const { rootId } = req.params as Record<string, string>;
  const r = await pool.query(
    `UPDATE "DealRequest" SET "trackerHiddenAt"=NOW()
      WHERE id=$1 AND "parentRequestId" IS NULL RETURNING id`,
    [rootId],
  );
  if (r.rowCount === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
}));

// POST /admin/deals-sent/mark-viewed — advance this admin's baseline, clearing
// the notification bar.
router.post("/admin/deals-sent/mark-viewed", guard("mark the list viewed", async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  await pool.query(
    `INSERT INTO "AdminDealsSentView" ("adminId","lastTrackerViewedAt") VALUES ($1, NOW())
       ON CONFLICT ("adminId") DO UPDATE SET "lastTrackerViewedAt"=NOW()`,
    [adminId],
  );
  res.json({ ok: true });
}));

export default router;
