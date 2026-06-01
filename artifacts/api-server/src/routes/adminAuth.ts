import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { comparePassword, generateAccessToken, generateRefreshToken, getAdminSecret, UserType } from "../lib/auth";
import { saveRefreshToken } from "../lib/session";

const router: IRouter = Router();

const REFRESH_COOKIE = "collabry_refresh";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  path: "/",
};

router.post("/auth/admin/login", async (req: Request, res: Response): Promise<void> => {
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

export default router;
