export const ADMIN_EMAIL = "navneetsingh7937@gmail.com";
const HARDCODED_PW = "Collabry@Sportsapp123#";
const HARDCODED_OTP = "8858";

const SESSION_KEY = "collabry_admin_session";
const PW_HASH_KEY = "collabry_admin_pw_hash";
const PW_LOCK_KEY = "collabry_admin_pw_lock";
const OTP_LOCK_KEY = "collabry_admin_otp_lock";
const CHANGE_OTP_LOCK_KEY = "collabry_admin_change_otp_lock";

const MAX_ATTEMPTS = 3;
export const LOCK_DURATION_MS = 5 * 60 * 1000;
export const INACTIVITY_MS = 10 * 60 * 1000;

interface AdminSession {
  token: string;
  lastActivityAt: number;
}

export interface LockState {
  attempts: number;
  lockedUntil: number;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readLock(key: string): LockState {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as LockState;
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

function writeLock(key: string, state: LockState) {
  localStorage.setItem(key, JSON.stringify(state));
}

export function checkLocked(type: "pw" | "otp" | "change_otp"): { locked: boolean; remainingMs: number } {
  const key = type === "pw" ? PW_LOCK_KEY : type === "otp" ? OTP_LOCK_KEY : CHANGE_OTP_LOCK_KEY;
  const state = readLock(key);
  const remaining = (state.lockedUntil ?? 0) - Date.now();
  return { locked: remaining > 0, remainingMs: Math.max(0, remaining) };
}

export function recordFailedAttempt(type: "pw" | "otp" | "change_otp"): { locked: boolean; attemptsLeft: number } {
  const key = type === "pw" ? PW_LOCK_KEY : type === "otp" ? OTP_LOCK_KEY : CHANGE_OTP_LOCK_KEY;
  const state = readLock(key);
  const newAttempts = (state.attempts ?? 0) + 1;
  const locked = newAttempts >= MAX_ATTEMPTS;
  writeLock(key, {
    attempts: newAttempts,
    lockedUntil: locked ? Date.now() + LOCK_DURATION_MS : (state.lockedUntil ?? 0),
  });
  return { locked, attemptsLeft: Math.max(0, MAX_ATTEMPTS - newAttempts) };
}

export function clearAttempts(type: "pw" | "otp" | "change_otp") {
  const key = type === "pw" ? PW_LOCK_KEY : type === "otp" ? OTP_LOCK_KEY : CHANGE_OTP_LOCK_KEY;
  localStorage.removeItem(key);
}

export async function verifyAdminPassword(input: string): Promise<boolean> {
  const stored = localStorage.getItem(PW_HASH_KEY);
  if (stored) {
    const hash = await sha256(input);
    return hash === stored;
  }
  return input === HARDCODED_PW;
}

export async function changeAdminPassword(newPassword: string): Promise<void> {
  const hash = await sha256(newPassword);
  localStorage.setItem(PW_HASH_KEY, hash);
}

export function verifyAdminOtp(input: string): boolean {
  return input.trim() === HARDCODED_OTP;
}

export function createAdminSession(): void {
  const session: AdminSession = { token: generateToken(), lastActivityAt: Date.now() };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// ── RBAC session (Phase 2) ───────────────────────────────────────────────────
// The real admin session now carries the backend JWT + the account's identity
// and permissions. Stored under the same SESSION_KEY (so isAdminLoggedIn /
// inactivity / updateAdminActivity keep working), just with more fields.
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
