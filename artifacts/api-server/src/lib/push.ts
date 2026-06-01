import { pool } from "@workspace/db";
import { logger } from "./logger";
import { getFirebaseAdmin } from "./firebaseAdmin";
import type { NotifUserType } from "./notifications";

export interface PushPayload {
  title: string;
  body: string;
  /** Optional click action — typically a path inside the app, e.g. /home-brand/campaigns. */
  link?: string;
  /** Free-form structured data delivered to the SW. Values must all be strings. */
  data?: Record<string, string>;
}

/**
 * Look up the user's stored FCM token and send a push. No-op if Firebase isn't
 * configured, the user has no token, or the send fails. All errors are logged
 * but never thrown — push is best-effort, never blocks notification creation.
 */
export async function sendPushToUser(
  userId: string,
  userType: NotifUserType,
  payload: PushPayload
): Promise<void> {
  const fb = getFirebaseAdmin();
  if (!fb) return;

  const table = userType === "BRAND" ? "Brand" : "Creator";
  const result = await pool.query(
    `SELECT "fcmToken" FROM "${table}" WHERE id = $1`,
    [userId]
  );
  const token = result.rows[0]?.fcmToken as string | null | undefined;
  if (!token) {
    logger.debug({ userId, userType }, "Skipping push — no FCM token registered");
    return;
  }

  try {
    const msg: Parameters<typeof fb.messaging>[0] extends void
      ? never
      : Parameters<ReturnType<typeof fb.messaging>["send"]>[0] = {
      token,
      notification: { title: payload.title, body: payload.body },
      data: {
        ...(payload.link ? { link: payload.link } : {}),
        ...(payload.data ?? {}),
      },
      webpush: payload.link
        ? { fcmOptions: { link: payload.link } }
        : undefined,
    };
    await fb.messaging().send(msg);
    logger.info({ userId, userType }, "Push notification sent");
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    // Stale token — clear it so we don't retry on every notification.
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      await pool.query(
        `UPDATE "${table}" SET "fcmToken" = NULL WHERE id = $1`,
        [userId]
      );
      logger.info({ userId, userType, code }, "Cleared stale FCM token");
      return;
    }
    logger.error({ err, userId, userType }, "Push notification failed");
  }
}
