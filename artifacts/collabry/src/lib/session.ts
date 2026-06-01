import { decodeTokenPayload, isTokenExpired } from "./auth";
import { UserType } from "../types";

let _accessToken: string | null = null;
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export function setAccessToken(token: string): void {
  _accessToken = token;
  _scheduleRefresh(token);
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function clearAccessToken(): void {
  _accessToken = null;
  if (_refreshTimer) {
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
  }
}

export function getAuthHeaders(): Record<string, string> {
  if (!_accessToken) return {};
  return { Authorization: `Bearer ${_accessToken}` };
}

export function getCurrentUser(): { userId: string; userType: UserType } | null {
  if (!_accessToken) return null;
  const payload = decodeTokenPayload(_accessToken);
  if (!payload) return null;
  return { userId: payload.userId, userType: payload.userType };
}

export function isAuthenticated(): boolean {
  if (!_accessToken) return false;
  return !isTokenExpired(_accessToken);
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      clearAccessToken();
      return null;
    }
    const data = (await res.json()) as { accessToken?: string };
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      return data.accessToken;
    }
    clearAccessToken();
    return null;
  } catch {
    clearAccessToken();
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } finally {
    clearAccessToken();
  }
}

function _scheduleRefresh(token: string): void {
  if (_refreshTimer) clearTimeout(_refreshTimer);

  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return;

  const expiryMs = payload.exp * 1000;
  const now = Date.now();
  const msUntilRefresh = Math.max(expiryMs - now - 60_000, 0);

  const isAdmin = payload.userType === UserType.ADMIN;
  const maxRefreshInterval = isAdmin ? 8 * 60 * 1000 : 14 * 60 * 1000;
  const refreshIn = Math.min(msUntilRefresh, maxRefreshInterval);

  _refreshTimer = setTimeout(async () => {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      window.dispatchEvent(new CustomEvent("collabry:session-expired"));
    }
  }, refreshIn);
}

export async function initSession(): Promise<string | null> {
  return refreshAccessToken();
}
