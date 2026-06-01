import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
} from "firebase/messaging";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let initAttempted = false;

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId && vapidKey);
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (initAttempted) return messaging;
  initAttempted = true;
  if (!isFirebaseConfigured()) return null;
  if (!(await isSupported())) return null;
  app = initializeApp(config as Record<string, string>);
  messaging = getMessaging(app);
  return messaging;
}

/**
 * Request notification permission and return the FCM registration token.
 * Returns null if permission is denied, Firebase is unconfigured, or the
 * browser does not support FCM (e.g. iOS Safari before 16.4 / not installed
 * as PWA).
 */
export async function requestFcmToken(): Promise<string | null> {
  const m = await getMessagingInstance();
  if (!m) return null;

  if (typeof Notification === "undefined") return null;
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return null;

  // The SW reads its Firebase config from URL search params (see public/firebase-messaging-sw.js).
  // We strip undefined values so the URL stays clean.
  const swParams = new URLSearchParams();
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === "string" && v) swParams.set(k, v);
  }
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${swParams.toString()}`
  );
  try {
    return await getToken(m, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return null;
  }
}

/**
 * Subscribe to foreground messages. The returned cleanup function unsubscribes.
 * In the background, the SW handles display; in the foreground, FCM does NOT
 * automatically show a notification — the caller decides how to surface it.
 */
export async function onForegroundMessage(
  handler: (payload: {
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
  }) => void
): Promise<() => void> {
  const m = await getMessagingInstance();
  if (!m) return () => {};
  return onMessage(m, handler);
}
