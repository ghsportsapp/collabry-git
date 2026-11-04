import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { comparePassword, generateAccessToken, generateRefreshToken, getAdminSecret, UserType } from "../lib/auth";
import { saveRefreshToken } from "../lib/session";
import { requireAdminAuth } from "../middleware/requireAdminAuth";
import { requireSection } from "../middleware/requireSection";

const router: IRouter = Router();

const REFRESH_COOKIE = "collabry_refresh";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  path: "/",
};

// ── Legacy login (username + password) — moved to /login-legacy in Phase 2. ──
// The panel now uses the RBAC login at /auth/admin/login. This legacy handler is
// kept only for scripts/triggerAllEmailFlows.mjs (updated to call /login-legacy).
router.post("/auth/admin/login-legacy", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username?.trim() || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const result = await pool.query(
    `SELECT id, username, email, "passwordHash" FROM "Admin"
     WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)
     LIMIT 1`,
    [username.trim()]
  );

  if (result.rows.length === 0) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const admin = result.rows[0];
  const valid = await comparePassword(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const adminSecret = getAdminSecret();
  const accessToken = generateAccessToken(admin.id, UserType.ADMIN, adminSecret);
  const refreshToken = generateRefreshToken(admin.id, UserType.ADMIN);
  await saveRefreshToken(admin.id, UserType.ADMIN, refreshToken);

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({ ok: true, accessToken, adminId: admin.id, username: admin.username });
});

// ─────────────────────────────────────────────────────────────────────────────
// RBAC login + dormant diagnostics (Phase 1).
//
// These are ADDITIVE and not wired to the live panel or to any existing admin
// data route. They exist so the new auth core can be exercised end-to-end (and
// so Phase 2 has a working login to cut the panel over to). Nothing here gates
// or changes any current admin endpoint.
// ─────────────────────────────────────────────────────────────────────────────

// Simple in-process login throttle (mirrors the panel's 3-try / 5-min lock).
// Per-process only — fine for a single admin API node; a shared store can
// replace it later if the API is scaled out.
const LOGIN_MAX_ATTEMPTS = 3;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const loginAttempts = new Map<string, { attempts: number; lockedUntil: number }>();

function loginLockRemaining(key: string): number {
  const s = loginAttempts.get(key);
  if (!s) return 0;
  const remaining = s.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}
function recordLoginFail(key: string): void {
  const s = loginAttempts.get(key) ?? { attempts: 0, lockedUntil: 0 };
  s.attempts += 1;
  if (s.attempts >= LOGIN_MAX_ATTEMPTS) s.lockedUntil = Date.now() + LOGIN_LOCK_MS;
  loginAttempts.set(key, s);
}
function clearLoginFail(key: string): void {
  loginAttempts.delete(key);
}

// POST /auth/admin/login — email + password + per-account OTP → admin JWT.
// This is the canonical admin login the panel uses (promoted from Phase 1's
// /login-rbac). The legacy username+password handler lives at /login-legacy.
router.post("/auth/admin/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password, otp } = (req.body ?? {}) as { email?: string; password?: string; otp?: string };
  if (!email?.trim() || !password || !otp) {
    res.status(400).json({ error: "Email, password and OTP are required" });
    return;
  }
  const key = email.trim().toLowerCase();

  if (loginLockRemaining(key) > 0) {
    res.status(429).json({ error: "Too many attempts. Please try again later." });
    return;
  }

  const result = await pool.query(
    `SELECT id, username, email, name, "passwordHash", "otpHash", "isSuperAdmin", "disabled", "allowedSections"
     FROM "Admin" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [key]
  );

  // Generic failure — never reveal which factor was wrong (avoids enumeration).
  const fail = () => { recordLoginFail(key); res.status(401).json({ error: "Invalid credentials" }); };

  if (result.rows.length === 0) { fail(); return; }
  const admin = result.rows[0];

  if (admin.disabled) { recordLoginFail(key); res.status(403).json({ error: "Account disabled" }); return; }

  const pwOk = await comparePassword(password, admin.passwordHash ?? "");
  if (!pwOk) { fail(); return; }

  const otpOk = admin.otpHash ? await comparePassword(String(otp), admin.otpHash) : false;
  if (!otpOk) { fail(); return; }

  clearLoginFail(key);

  const adminSecret = getAdminSecret();
  const accessToken = generateAccessToken(admin.id, UserType.ADMIN, adminSecret);
  const refreshToken = generateRefreshToken(admin.id, UserType.ADMIN);
  await saveRefreshToken(admin.id, UserType.ADMIN, refreshToken);

  res.cookie(REFRESH_COOKIE, refreshToken, { ...COOKIE_OPTIONS, maxAge: 8 * 60 * 60 * 1000 });

  res.json({
    ok: true,
    accessToken,
    adminId: admin.id,
    username: admin.username,
    name: admin.name ?? null,
    email: admin.email,
    isSuperAdmin: !!admin.isSuperAdmin,
    allowedSections: Array.isArray(admin.allowedSections) ? admin.allowedSections : [],
  });
});

// GET /auth/admin/me — the caller's own identity + permissions (verifies the JWT
// via the new requireAdminAuth). Exposes only the caller's own account.
router.get("/auth/admin/me", requireAdminAuth, (req: Request, res: Response): void => {
  const a = (req as any).admin;
  res.json({
    id: a.id, email: a.email, username: a.username, name: a.name,
    isSuperAdmin: a.isSuperAdmin, allowedSections: a.allowedSections,
  });
});

// GET /auth/admin/section-check/:section — proves requireSection end-to-end.
// 200 if this admin may access :section (super admin → always), else 403.
// Touches no real admin data; it only reports the caller's own access.
router.get(
  "/auth/admin/section-check/:section",
  requireAdminAuth,
  (req: Request, res: Response, next: NextFunction) => requireSection(String(req.params["section"]))(req, res, next),
  (req: Request, res: Response): void => {
    res.json({ ok: true, section: req.params["section"], access: "granted" });
  }
);

export default router;
