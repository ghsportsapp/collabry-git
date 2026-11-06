// Admin session helpers for the real JWT login (RBAC). The old hardcoded
// email/password/OTP, client-side verifiers and localStorage global-lock were
// removed in Phase 5 — authentication and the per-device lockout now live
// entirely on the backend (/auth/admin/login[/verify], adminGuard).

const SESSION_KEY = "collabry_admin_session";
// Idle logout window: the admin stays logged in until Logout or 5 full minutes
// of genuine inactivity. Any activity (mouse/key/scroll/nav/API call) resets it.
export const INACTIVITY_MS = 5 * 60 * 1000;

interface AdminSession {
  token: string;
  lastActivityAt: number;
}

// The admin session carries the backend JWT + the account's identity and
// permissions, with a sliding inactivity timeout.
export interface AdminAuthData {
  token: string;            // backend admin JWT (sent as Authorization: Bearer)
  adminId: string;
  username: string;
  name: string | null;
  isSuperAdmin: boolean;
  allowedSections: string[];
}

export function createAdminAuthSession(data: AdminAuthData): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, lastActivityAt: Date.now() }));
}

export function getAdminAuth(): AdminAuthData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<AdminAuthData> & { lastActivityAt?: number };
    if (Date.now() - (s.lastActivityAt ?? 0) > INACTIVITY_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (!s.token) return null;
    return {
      token: s.token,
      adminId: s.adminId ?? "",
      username: s.username ?? "",
      name: s.name ?? null,
      isSuperAdmin: !!s.isSuperAdmin,
      allowedSections: Array.isArray(s.allowedSections) ? s.allowedSections : [],
    };
  } catch {
    return null;
  }
}

export function getAdminSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AdminSession;
    if (Date.now() - (session.lastActivityAt ?? 0) > INACTIVITY_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function updateAdminActivity(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as AdminSession;
    session.lastActivityAt = Date.now();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isAdminLoggedIn(): boolean {
  return getAdminSession() !== null;
}
