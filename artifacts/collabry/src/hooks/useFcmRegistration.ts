import { useEffect } from "react";
import {
  requestFcmToken,
  onForegroundMessage,
  isFirebaseConfigured,
} from "@/lib/firebase";

const STORAGE_KEY = "collabry.fcmTokenSyncedAt";
const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // re-register weekly

interface Options {
  /** Provides the auth bearer token to talk to the backend. */
  getAccessToken: () => string | null | undefined;
  /** `BRAND` or `CREATOR` — chooses the endpoint. */
  userType: "BRAND" | "CREATOR";
  /** Defaults to "" → calls relative `/api/...`. Override if the API is on a different host. */
  apiBaseUrl?: string;
}

/**
 * Once per logged-in session (and at most weekly), requests an FCM token
 * and POSTs it to the backend. Also wires a foreground message listener so
 * the user sees toasts when a push arrives while the tab is focused.
 *
 * Safe to call when Firebase isn't configured — it just no-ops.
 */
export function useFcmRegistration({
  getAccessToken,
  userType,
  apiBaseUrl = "",
}: Options): void {
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const token = getAccessToken();
    if (!token) return;

    const lastSyncedRaw = window.localStorage.getItem(STORAGE_KEY);
    const lastSynced = lastSyncedRaw ? Number(lastSyncedRaw) : 0;
    const dueForSync = Date.now() - lastSynced > SYNC_INTERVAL_MS;
    if (!dueForSync) return;

    let cancelled = false;
    (async () => {
      const fcmToken = await requestFcmToken();
      if (cancelled || !fcmToken) return;
      const endpoint =
        userType === "BRAND"
          ? `${apiBaseUrl}/api/brand/fcm-token`
          : `${apiBaseUrl}/api/creator/fcm-token`;
      try {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ fcmToken }),
        });
        if (r.ok) {
          window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
        }
      } catch {
        // best-effort; we'll try again next session
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, userType, apiBaseUrl]);

  // Foreground message handler — fire-and-forget subscription for the
  // component's lifetime.
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let unsub: (() => void) | null = null;
    void onForegroundMessage((payload) => {
      const title = payload.notification?.title ?? "Collabry";
      const body = payload.notification?.body ?? "";
      // Lightweight foreground surface — replace with the project's toast
      // system if desired. Avoid showing twice when the SW also shows.
      try {
        if (
          "Notification" in window &&
          Notification.permission === "granted" &&
          document.visibilityState === "visible"
        ) {
          new Notification(title, { body, icon: "/pwa-192x192.png" });
        }
      } catch {
        // Some browsers throw on direct construction in foreground; ignore.
      }
    }).then((u) => {
      unsub = u;
    });
    return () => {
      unsub?.();
    };
  }, []);
}
