import { pool } from "@workspace/db";
import { logger } from "./logger";
import { shouldPushNotification } from "./notificationPush";
import { sendPushToUser } from "./push";
import { sendToCreator, sendToBrand } from "./sseManager";
import { sendBrevoTemplateEmail } from "./brevoEmail";
import { resolveEmailTemplate, type ResolvedTemplate } from "./brevoTemplates";
import { sendEmail } from "./email";
import { shouldEmailNotification, renderNotificationEmail } from "./notificationEmail";
import { isWhatsAppEnabled, sendWhatsApp, toWhatsAppNumber } from "./aisensy";
import { resolveWhatsAppCampaign, COUNTERPARTY } from "./whatsappCampaigns";

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

  // WhatsApp — same fire-and-forget contract as email. Off unless AISENSY_ENABLED
  // is set, so this is inert until the campaigns are verified.
  void dispatchWhatsApp(n).catch((err) => {
    logger.error(
      { err, userId: n.userId, userType: n.userType, type: n.type },
      "Notification WhatsApp failed"
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
 * required-params gate keeps the email in-app.
 *
 * Direct deals (no campaign/barter linked) fall back to a generic label so
 * every deal template that requires `campaign_name` fires for BOTH campaign
 * deals and direct deals — otherwise the gate would silently skip half the
 * deal-related templates whenever the deal wasn't tied to a Campaign or
 * BarterCampaign row.
 */
interface DealMeta {
  params: Record<string, string | number>;
  source: string | null;
}

async function getDealMeta(dealId: string): Promise<DealMeta> {
  try {
    const r = await pool.query(
      `SELECT d."totalAgreedValue"::text AS amount,
              d.source                    AS source,
              b."brandName"  AS brand_name,
              c."fullName"   AS creator_name,
              COALESCE(camp.name, bart.name, 'your direct deal') AS campaign_name
         FROM "Deal" d
         JOIN "Brand"   b ON b.id = d."brandId"
         JOIN "Creator" c ON c.id = d."creatorId"
         LEFT JOIN "Campaign"       camp ON camp.id = d."campaignId"
         LEFT JOIN "BarterCampaign" bart ON bart.id = d."barterId"
        WHERE d.id = $1`,
      [dealId]
    );
    const row = r.rows[0];
    if (!row) return { params: {}, source: null };
    const params: Record<string, string | number> = {};
    if (row.brand_name) params["brand_name"] = row.brand_name;
    if (row.creator_name) params["creator_name"] = row.creator_name;
    if (row.campaign_name) params["campaign_name"] = row.campaign_name;
    if (row.amount != null) params["amount"] = Math.round(Number(row.amount));
    return { params, source: row.source ?? null };
  } catch (err) {
    logger.debug({ err, dealId }, "Deal email-params lookup failed");
    return { params: {}, source: null };
  }
}

/**
 * DEAL_COMPLETED fires to BOTH creator and brand on completion, and there are
 * three deal sources (CAMPAIGN paid, BARTER, and DIRECT). Historically the
 * SIMPLE map pinned it to template 66 for every recipient, so brands received
 * the creator's "your payout will be released" copy on their side too.
 *
 * The four-way split:
 *   CREATOR + paid/direct → template 66 (unchanged)
 *   CREATOR + barter      → template 88
 *   BRAND   + paid/direct → template 89
 *   BRAND   + barter      → template 90
 */
function dealCompletedTemplateId(source: string | null, userType: NotifUserType): number {
  const isBarter = source === "BARTER";
  if (userType === "CREATOR") return isBarter ? 88 : 66;
  return isBarter ? 90 : 89;
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
    let templateId = tpl.templateId;
    let subjectOverride: string | undefined = n.emailSubject ?? tpl.subject;
    if (n.relatedEntityType?.toUpperCase() === "DEAL" && n.relatedEntityId) {
      const meta = await getDealMeta(n.relatedEntityId);
      params = { ...meta.params, ...params };
      // DEAL_COMPLETED needs a different template per (userType, source). Only
      // override when the call site hasn't already pinned an explicit id, and
      // let Brevo's per-template stored subject win so brand doesn't inherit
      // the creator's "payout coming!" subject line.
      if (n.type === "DEAL_COMPLETED" && !n.emailTemplateId) {
        templateId = dealCompletedTemplateId(meta.source, n.userType);
        subjectOverride = n.emailSubject; // undefined → Brevo uses stored subject
      }
    }
    const missing = tpl.requiredParams.filter((p) => params[p] == null);
    if (missing.length === 0) {
      try {
        await sendBrevoTemplateEmail({
          templateId,
          to: email,
          firstName,
          ...(subjectOverride ? { subject: subjectOverride } : {}),
          params,
        });
        logger.info({ userId: n.userId, type: n.type, templateId }, "Notification email sent (template)");
        return;
      } catch (err) {
        // Brevo send failed (401 unauthorised, IP not allowlisted, template
        // disabled in dashboard, etc). Fall through to the legacy SMTP path
        // below so users on the pre-migration email allowlist still get an
        // email instead of silently getting nothing.
        logger.warn(
          { err, userId: n.userId, type: n.type, templateId },
          "Brevo template send failed — trying legacy SMTP fallback if eligible"
        );
      }
    } else {
      logger.debug({ userId: n.userId, type: n.type, templateId, missing }, "Template params missing — using legacy fallback if eligible");
    }
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

/**
 * WhatsApp via AiSensy. Every gate below skips silently rather than throwing,
 * because this runs alongside a notification that has already been created —
 * a missing phone or an unmapped type is a non-event, not an error.
 *
 * Gates, in order: feature flag -> type has a campaign -> recipient has a
 * dialable number -> the template's params can all be filled. See
 * whatsappCampaigns.ts for why most two-param campaigns stop at the last gate
 * until the approved template bodies land.
 */
async function dispatchWhatsApp(n: CreateNotifInput): Promise<void> {
  if (!isWhatsAppEnabled()) return;

  const camp = resolveWhatsAppCampaign(n.type, n.userType);
  if (!camp) return;

  // Creators keep their number on Creator.phone, but brands do NOT — brand
  // signup never writes Brand.phone (see brandAuth.ts); the number goes into
  // BrandCustomFieldValue under whichever signup field is of type 'tel'.
  // Reading Brand.phone here would silently skip every brand message.
  const result = await pool.query(
    n.userType === "BRAND"
      ? `SELECT b."brandName" AS name,
                (SELECT v.value
                   FROM "BrandCustomFieldValue" v
                   JOIN "BrandSignupField" f ON f.id = v."fieldId"
                  WHERE v."brandId" = b.id AND f."fieldType" = 'tel'
                  ORDER BY f."displayOrder", f."createdAt"
                  LIMIT 1) AS phone
           FROM "Brand" b WHERE b.id = $1`
      : `SELECT "fullName" AS name, phone FROM "Creator" WHERE id = $1`,
    [n.userId]
  );
  const destination = toWhatsAppNumber(result.rows[0]?.phone as string | null | undefined);
  if (!destination) {
    logger.debug({ userId: n.userId, type: n.type }, "Skipping WhatsApp — no dialable phone");
    return;
  }
  const name = (result.rows[0]?.name as string | null | undefined)?.trim() || undefined;
  // A creator is a person, so greet them by first name. A brand is a company —
  // use the whole name, because "Hi Snitch" reads wrong for "Snitch Clothing".
  const greeting = (n.userType === "BRAND" ? name : name?.split(/\s+/)[0]) || "there";

  const templateParams: string[] = [greeting];
  // `param2` present means a two-param template. null = we don't yet know what
  // {{2}} is, so sending would fill it with the wrong value.
  if ("param2" in camp) {
    if (!camp.param2) {
      logger.debug(
        { userId: n.userId, type: n.type, campaign: camp.campaign },
        "Skipping WhatsApp — awaiting approved template body for {{2}}"
      );
      return;
    }
    // Same enrichment the email path does: most deal call sites never pass
    // brand_name/creator_name explicitly, they come from the Deal row. Without
    // this the counterparty lookup below would miss on nearly every deal.
    let params: Record<string, string | number | null | undefined> = { ...n.emailParams };
    if (n.relatedEntityType?.toUpperCase() === "DEAL" && n.relatedEntityId) {
      const meta = await getDealMeta(n.relatedEntityId);
      params = { ...meta.params, ...params };
    }
    // "the other party" resolves against the recipient: a brand hears about the
    // creator, a creator hears about the brand.
    const key =
      camp.param2 === COUNTERPARTY
        ? n.userType === "BRAND"
          ? "creator_name"
          : "brand_name"
        : camp.param2;
    const value = params[key];
    if (value == null) {
      logger.debug(
        { userId: n.userId, type: n.type, campaign: camp.campaign, param: key },
        "Skipping WhatsApp — {{2}} param missing"
      );
      return;
    }
    templateParams.push(String(value));
  }

  const submittedMessageId = await sendWhatsApp({
    campaignName: camp.campaign,
    destination,
    userName: name ?? greeting,
    templateParams,
  });
  logger.info(
    { userId: n.userId, type: n.type, campaign: camp.campaign, submittedMessageId },
    "Notification WhatsApp sent"
  );
}
