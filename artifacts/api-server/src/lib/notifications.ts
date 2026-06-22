import { pool } from "@workspace/db";
import { logger } from "./logger";
import { shouldPushNotification } from "./notificationPush";
import { sendPushToUser } from "./push";
import { sendToCreator, sendToBrand } from "./sseManager";
import { sendBrevoTemplateEmail } from "./brevoEmail";
import { resolveEmailTemplate, type ResolvedTemplate } from "./brevoTemplates";
import { sendEmail } from "./email";
import { shouldEmailNotification, renderNotificationEmail } from "./notificationEmail";

export type NotifUserType = "BRAND" | "CREATOR";

export interface CreateNotifInput {
  userId: string;
  userType: NotifUserType;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  /**
   * Email wiring (all optional). For context-dependent types, the call site
   * passes the exact Brevo `emailTemplateId` (+ `emailSubject`); for the
   * unambiguous types the template is resolved automatically. `emailParams`
   * supplies the template's {{ params.* }} values (e.g. campaign_name, amount,
   * reason). If neither an explicit id nor a resolved template applies, the
   * notification stays in-app only.
   */
  emailTemplateId?: number;
  emailSubject?: string;
  emailParams?: Record<string, string | number | null | undefined>;
  /** Optional auto-expiry (days), matching the legacy admin direct-insert rows. */
  expiresInDays?: number;
}

export async function createNotification(n: CreateNotifInput): Promise<void> {
  const inserted = n.expiresInDays
    ? await pool.query(
        `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"relatedEntityType","relatedEntityId","isRead","createdAt","expiresAt")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,false,NOW(),NOW() + make_interval(days => $8))
         RETURNING id, "createdAt"`,
        [n.userId, n.userType, n.type, n.title, n.body, n.relatedEntityType ?? null, n.relatedEntityId ?? null, n.expiresInDays]
      )
    : await pool.query(
        `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"relatedEntityType","relatedEntityId","isRead","createdAt")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,false,NOW())
         RETURNING id, "createdAt"`,
        [n.userId, n.userType, n.type, n.title, n.body, n.relatedEntityType ?? null, n.relatedEntityId ?? null]
      );
  const row = inserted.rows[0] as { id: string; createdAt: string };

  // Real-time push to any open SSE connection so the in-app notification
  // bell updates live while the user is on the app (PWA included). This is a
  // distinct `notification` event — the client bumps the unread badge and
  // shows a lightweight toast, as opposed to the intrusive `popup` event.
  try {
    const ssePayload = {
      id: row.id,
      type: n.type,
      title: n.title,
      body: n.body,
      relatedEntityType: n.relatedEntityType ?? null,
      relatedEntityId: n.relatedEntityId ?? null,
      createdAt: row.createdAt,
      isRead: false,
    };
    if (n.userType === "CREATOR") sendToCreator(n.userId, "notification", ssePayload);
    else sendToBrand(n.userId, "notification", ssePayload);
  } catch (err) {
    logger.error({ err, userId: n.userId, userType: n.userType, type: n.type }, "Notification SSE push failed");
  }

  // Email — only whitelisted types send (call-site explicit template, else the
  // auto-resolver). Fully async: a mail failure never breaks the notification.
  const tpl: ResolvedTemplate | null = n.emailTemplateId
    ? { templateId: n.emailTemplateId, subject: n.emailSubject ?? "", requiredParams: [] }
    : resolveEmailTemplate(n.type, n.userType);
  // Fully async: param enrichment, the required-params gate, and the legacy
  // fallback all live inside dispatchEmail so a mail failure never blocks the
  // notification. Always called (even with no template) so previously-emailing
  // types still send via the legacy path.
  void dispatchEmail(n, tpl).catch((err) => {
    logger.error(
      { err, userId: n.userId, userType: n.userType, type: n.type },
      "Notification email failed"
    );
  });

  if (shouldPushNotification(n.type)) {
    void sendPushToUser(n.userId, n.userType, {
      title: n.title,
      body: n.body,
      data: {
        type: n.type,
        ...(n.relatedEntityType ? { relatedEntityType: n.relatedEntityType } : {}),
        ...(n.relatedEntityId ? { relatedEntityId: n.relatedEntityId } : {}),
      },
    }).catch((err) => {
      logger.error(
        { err, userId: n.userId, userType: n.userType, type: n.type },
        "Notification push failed"
      );
    });
  }
}

/**
 * Auto-fill the four common deal params (campaign_name, creator_name,
 * brand_name, amount) from the related Deal so most deal emails need no
 * per-call-site params. Best-effort: a bad/missing row returns {} and the
 * required-params gate keeps the email in-app. Direct deals (no campaign/barter)
 * simply have no campaign_name; their templates don't use it.
 */
async function getDealEmailParams(dealId: string): Promise<Record<string, string | number>> {
  try {
    const r = await pool.query(
      `SELECT d."totalAgreedValue"::text AS amount,
              b."brandName"  AS brand_name,
              c."fullName"   AS creator_name,
              COALESCE(camp.name, bart.name) AS campaign_name
         FROM "Deal" d
         JOIN "Brand"   b ON b.id = d."brandId"
         JOIN "Creator" c ON c.id = d."creatorId"
         LEFT JOIN "Campaign"       camp ON camp.id = d."campaignId"
         LEFT JOIN "BarterCampaign" bart ON bart.id = d."barterId"
        WHERE d.id = $1`,
      [dealId]
    );
    const row = r.rows[0];
    if (!row) return {};
    const out: Record<string, string | number> = {};
    if (row.brand_name) out["brand_name"] = row.brand_name;
    if (row.creator_name) out["creator_name"] = row.creator_name;
    if (row.campaign_name) out["campaign_name"] = row.campaign_name;
    if (row.amount != null) out["amount"] = Math.round(Number(row.amount));
    return out;
  } catch (err) {
    logger.debug({ err, dealId }, "Deal email-params lookup failed");
    return {};
  }
}

async function dispatchEmail(n: CreateNotifInput, tpl: ResolvedTemplate | null): Promise<void> {
  const table = n.userType === "BRAND" ? "Brand" : "Creator";
  const nameCol = n.userType === "BRAND" ? '"brandName"' : '"fullName"';
  const result = await pool.query(
    `SELECT email, ${nameCol} AS name FROM "${table}" WHERE id = $1`,
    [n.userId]
  );
  const email = result.rows[0]?.email as string | null | undefined;
  if (!email) {
    logger.debug(
      { userId: n.userId, userType: n.userType, type: n.type },
      "Skipping email — no email on record"
    );
    return;
  }
  const name = (result.rows[0]?.name as string | null | undefined) ?? undefined;
  const firstName = name ? name.trim().split(/\s+/)[0] : undefined;

  // 1) Preferred path: a mapped Brevo template with all required params present.
  if (tpl) {
    // Effective params: deal-derived auto-fill underneath, explicit on top.
    let params: Record<string, string | number | null | undefined> = { ...n.emailParams };
    if (n.relatedEntityType?.toUpperCase() === "DEAL" && n.relatedEntityId) {
      const auto = await getDealEmailParams(n.relatedEntityId);
      params = { ...auto, ...params };
    }
    const missing = tpl.requiredParams.filter((p) => params[p] == null);
    if (missing.length === 0) {
      await sendBrevoTemplateEmail({
        templateId: tpl.templateId,
        to: email,
        firstName,
        subject: n.emailSubject ?? tpl.subject,
        params,
      });
      logger.info({ userId: n.userId, type: n.type, templateId: tpl.templateId }, "Notification email sent (template)");
      return;
    }
    logger.debug({ userId: n.userId, type: n.type, templateId: tpl.templateId, missing }, "Template params missing — using legacy fallback if eligible");
  }

  // 2) Legacy fallback: any type that emailed before the Brevo migration still
  //    emails (generic branded email over SMTP) to the real recipient, so no
  //    customer loses a notification email while template wiring is completed.
  if (shouldEmailNotification(n.type)) {
    const rendered = renderNotificationEmail({ title: n.title, body: n.body });
    await sendEmail({ to: email, ...rendered });
    logger.info({ userId: n.userId, type: n.type }, "Notification email sent (legacy fallback)");
  }
}
