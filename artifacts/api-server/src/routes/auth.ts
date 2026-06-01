import { Router, type IRouter, type Request, type Response } from "express";
import { verifyToken, getAccessSecret, getAdminSecret, generateAccessToken, type UserType } from "../lib/auth";
import { rotateRefreshToken, revokeToken, revokeAllTokens, hashToken } from "../lib/session";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const REFRESH_COOKIE = "collabry_refresh";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  path: "/",
};

router.post("/auth/refresh", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  if (!refreshToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  let payload;
  try {
    const secret = tryBothSecrets(refreshToken);
    if (!secret) throw new Error("Invalid token");
    payload = verifyToken(refreshToken, secret);
  } catch {
    res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  const { userId, userType } = payload;

  const result = await rotateRefreshToken(refreshToken, userId, userType as UserType);

  if (!result.ok) {
    res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
    if (result.reuseDetected) {
      res.status(401).json({ error: "Session compromised. Please log in again." });
    } else {
      res.status(401).json({ error: result.reason });
    }
    return;
  }

  const accessSecret =
    userType === "ADMIN" ? getAdminSecret() : getAccessSecret();
  const accessToken = generateAccessToken(userId, userType as UserType, accessSecret);

  const maxAge =
    userType === "ADMIN"
      ? 8 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;

  res.cookie(REFRESH_COOKIE, result.newToken, {
    ...COOKIE_OPTIONS,
    maxAge,
  });

  res.json({ accessToken, userId, userType });
});

router.post("/auth/logout", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  if (refreshToken) {
    try {
      await revokeToken(refreshToken);
    } catch {
      req.log.warn("Failed to revoke refresh token on logout");
    }
  }

  res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.post("/auth/logout-all", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  if (!refreshToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let payload;
  try {
    const secret = tryBothSecrets(refreshToken);
    if (!secret) throw new Error("Invalid token");
    payload = verifyToken(refreshToken, secret);
  } catch {
    res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  await revokeAllTokens(payload.userId, payload.userType as UserType);
  res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
  res.json({ ok: true });
});

function tryBothSecrets(token: string): string | null {
  const accessSecret = process.env["JWT_ACCESS_SECRET"];
  const adminSecret = process.env["JWT_ADMIN_SECRET"];

  if (accessSecret) {
    try {
      verifyToken(token, accessSecret);
      return accessSecret;
    } catch {}
  }

  if (adminSecret) {
    try {
      verifyToken(token, adminSecret);
      return adminSecret;
    } catch {}
  }

  return null;
}

export default router;
