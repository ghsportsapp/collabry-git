import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { comparePassword, generateAccessToken, generateAdminPreAuthToken, generateRefreshToken, getAdminSecret, verifyToken, UserType } from "../lib/auth";
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
// RBAC login — two steps:
//   1) POST /auth/admin/login/verify  {email,password} → short-lived preAuthToken
//   2) POST /auth/admin/login         {preAuthToken,otp} → admin JWT
// Step 2 requires the step-1 token, so the OTP step can't be skipped. Lockout is
// PER-ACCOUNT (keyed by lowercased email): one account's bad attempts never
// affect another account or device.
// ─────────────────────────────────────────────────────────────────────────────

// In-process login throttle, keyed PER-DEVICE (request IP) — 5 fails → lock that
// device for 5 min. One device's bad attempts never lock the account on another
// device, nor any other admin. A successful verify OR login resets the device's
// counter, so a correct password is never falsely locked by earlier typos.
// Per-process only — fine for a single admin API node.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const loginAttempts = new Map<string, { attempts: number; lockedUntil: number }>();

/** Best-effort client/device IP — first X-Forwarded-For hop (behind nginx) or
 *  the socket address. Good enough as a per-device lockout key. */
function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0]!.trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}
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
function sendLocked(res: Response, remainingMs: number): void {
  const secs = Math.ceil(remainingMs / 1000);
  const mins = Math.max(1, Math.ceil(secs / 60));
  res.status(429).json({ error: `Too many attempts. Try again in ${mins} min.`, retryAfterSeconds: secs });
}

// Step 1 — verify email + password. On success returns a 5-minute pre-auth token
// the OTP step requires. Password validity is revealed before OTP (accepted
// product decision). Failures count toward the per-account lockout.
router.post("/auth/admin/login/verify", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const key = clientIp(req); // per-device lockout key

  const locked = loginLockRemaining(key);
  if (locked > 0) { sendLocked(res, locked); return; }

  const result = await pool.query(
    `SELECT id, "passwordHash", "disabled" FROM "Admin" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  if (result.rows.length === 0) { recordLoginFail(key); res.status(401).json({ error: "Incorrect email or password" }); return; }
  const admin = result.rows[0];
  if (admin.disabled) { res.status(403).json({ error: "Account disabled" }); return; }

  const pwOk = await comparePassword(password, admin.passwordHash ?? "");
  if (!pwOk) { recordLoginFail(key); res.status(401).json({ error: "Incorrect email or password" }); return; }

  // Correct — reset this device's counter and hand back a short-lived token
  // that only the OTP step accepts.
  clearLoginFail(key);
  res.json({ ok: true, preAuthToken: generateAdminPreAuthToken(admin.id) });
});

// Step 2 — pre-auth token + per-account OTP → admin JWT. The pre-auth token
// proves step 1 passed; without it OTP can't be submitted.
router.post("/auth/admin/login", async (req: Request, res: Response): Promise<void> => {
  const { preAuthToken, otp } = (req.body ?? {}) as { preAuthToken?: string; otp?: string };
  if (!preAuthToken || !otp) {
    res.status(400).json({ error: "OTP is required" });
    return;
  }

  // Validate the step-1 token (admin secret, scope=preauth, not expired).
  let adminId: string;
  try {
    const payload = verifyToken(preAuthToken, getAdminSecret());
    if (payload.userType !== "ADMIN" || payload.scope !== "preauth") throw new Error("not a preauth token");
    adminId = payload.userId;
  } catch {
    res.status(401).json({ error: "Your session expired. Please re-enter your email and password.", code: "PREAUTH_EXPIRED" });
    return;
  }

  const result = await pool.query(
    `SELECT id, username, email, name, "otpHash", "isSuperAdmin", "disabled", "allowedSections"
     FROM "Admin" WHERE id = $1 LIMIT 1`,
    [adminId]
  );
  if (result.rows.length === 0) {
    res.status(401).json({ error: "Your session expired. Please re-enter your email and password.", code: "PREAUTH_EXPIRED" });
    return;
  }
  const admin = result.rows[0];
  if (admin.disabled) { res.status(403).json({ error: "Account disabled" }); return; }

  const key = clientIp(req); // per-device lockout key
  const locked = loginLockRemaining(key);
  if (locked > 0) { sendLocked(res, locked); return; }

  const otpOk = admin.otpHash ? await comparePassword(String(otp), admin.otpHash) : false;
  if (!otpOk) { recordLoginFail(key); res.status(401).json({ error: "Incorrect OTP" }); return; }

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
