import { pool } from "@workspace/db";
import { logger } from "./logger";
import { sendEmail } from "./email";
import { shouldEmailNotification, renderNotificationEmail } from "./notificationEmail";
import { shouldPushNotification } from "./notificationPush";
import { sendPushToUser } from "./push";
import { sendToCreator, sendToBrand } from "./sseManager";

export type NotifUserType = "BRAND" | "CREATOR";

export interface CreateNotifInput {
  userId: string;
  userType: NotifUserType;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

export async function createNotification(n: CreateNotifInput): Promise<void> {
  const inserted = await pool.query(
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

  if (shouldEmailNotification(n.type)) {
    void mirrorToEmail(n).catch((err) => {
      logger.error(
        { err, userId: n.userId, userType: n.userType, type: n.type },
        "Notification email mirror failed"
      );
    });
  }

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

async function mirrorToEmail(n: CreateNotifInput): Promise<void> {
  const table = n.userType === "BRAND" ? "Brand" : "Creator";
  const result = await pool.query(
    `SELECT email FROM "${table}" WHERE id = $1`,
    [n.userId]
  );
  const email = result.rows[0]?.email as string | null | undefined;
  if (!email) {
    logger.debug(
      { userId: n.userId, userType: n.userType, type: n.type },
      "Skipping email mirror — no email on record"
    );
    return;
  }
  const rendered = renderNotificationEmail({ title: n.title, body: n.body });
  await sendEmail({ to: email, ...rendered });
  logger.info(
    { userId: n.userId, userType: n.userType, type: n.type },
    "Notification email sent"
  );
}
