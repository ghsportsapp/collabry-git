import admin, { type ServiceAccount } from "firebase-admin";
import { logger } from "./logger";

let initialized = false;
let usable = false;

/**
 * Lazy-initialize Firebase Admin from FIREBASE_SERVICE_ACCOUNT (JSON string).
 * If the env var is missing or unparseable, the SDK is treated as unavailable
 * and push helpers no-op — letting the app boot without push configured.
 */
export function getFirebaseAdmin(): typeof admin | null {
  if (initialized) return usable ? admin : null;
  initialized = true;

  const raw = process.env["FIREBASE_SERVICE_ACCOUNT"];
  if (!raw) {
    logger.warn(
      "FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled"
    );
    return null;
  }

  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch (err) {
    logger.error({ err }, "FIREBASE_SERVICE_ACCOUNT is not valid JSON — push notifications disabled");
    return null;
  }

  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({ credential: admin.credential.cert(parsed) });
    }
    usable = true;
    return admin;
  } catch (err) {
    logger.error({ err }, "Firebase Admin init failed — push notifications disabled");
    return null;
  }
}
