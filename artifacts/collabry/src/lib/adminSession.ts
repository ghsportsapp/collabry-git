import { getAccessToken, refreshAccessToken, clearAccessToken } from "./session";
import { decodeTokenPayload } from "./auth";
import { UserType } from "../types";

const ADMIN_INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

let _lastActivityAt: number | null = null;
let _inactivityTimer: ReturnType<typeof setTimeout> | null = null;

export function recordAdminActivity(): void {
  _lastActivityAt = Date.now();
  _resetInactivityTimer();
}

export function isAdminSessionActive(): boolean {
  const token = getAccessToken();
  if (!token) return false;

  const payload = decodeTokenPayload(token);
  if (!payload || payload.userType !== UserType.ADMIN) return false;

  if (_lastActivityAt !== null) {
    const idle = Date.now() - _lastActivityAt;
    if (idle > ADMIN_INACTIVITY_MS) return false;
  }

  return true;
}

export function startAdminActivityTracking(): void {
  const events = ["mousedown", "keydown", "touchstart", "scroll"];
  const handler = () => recordAdminActivity();
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
  recordAdminActivity();
}

export function stopAdminActivityTracking(): void {
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }
}

function _resetInactivityTimer(): void {
  if (_inactivityTimer) clearTimeout(_inactivityTimer);

  _inactivityTimer = setTimeout(() => {
    clearAccessToken();
    window.dispatchEvent(new CustomEvent("collabry:admin-session-expired"));
  }, ADMIN_INACTIVITY_MS);
}

export async function requestAdminOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/auth/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Failed to send OTP" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function verifyAdminOtp(
  email: string,
  password: string,
  otp: string
): Promise<{ ok: boolean; accessToken?: string; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/auth/verify-otp`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, otp }),
    });
    const data = await res.json() as { accessToken?: string; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Invalid OTP" };
    return { ok: true, accessToken: data.accessToken };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function adminRefresh(): Promise<boolean> {
  if (!isAdminSessionActive()) {
    clearAccessToken();
    return false;
  }
  const token = await refreshAccessToken();
  return !!token;
}
