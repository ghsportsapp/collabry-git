import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { verifyToken, getAdminSecret } from "../lib/auth";

/**
 * REAL admin authentication. Used by adminGuard (which runs it for every
 * /admin/* request) and by the /auth/admin/me and section-check endpoints.
 *
 * Verifies the admin JWT (admin secret + scheme, same as /auth/admin/login),
 * loads the Admin row, rejects disabled accounts, and populates req.adminId +
 * req.admin (id, username, email, name, allowedSections, isSuperAdmin).
 */

export interface AdminContext {
  id: string;
  username: string;
  email: string;
  name: string | null;
  allowedSections: string[];
  isSuperAdmin: boolean;
  disabled: boolean;
}

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  let adminId: string;
  try {
    const payload = verifyToken(authHeader.slice(7), getAdminSecret());
    if (payload.userType !== "ADMIN") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    // A step-1 (preauth) token only unlocks the OTP step — never real admin APIs.
    if (payload.scope === "preauth") {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    adminId = payload.userId;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const r = await pool.query(
      `SELECT id, username, email, name, "allowedSections", "isSuperAdmin", "disabled"
       FROM "Admin" WHERE id=$1 LIMIT 1`,
      [adminId]
    );
    if (r.rows.length === 0) {
      res.status(401).json({ error: "Admin account not found" });
      return;
    }
    const row = r.rows[0];
    if (row.disabled) {
      res.status(403).json({ error: "Account disabled" });
      return;
    }
    const admin: AdminContext = {
      id: row.id,
      username: row.username,
      email: row.email,
      name: row.name ?? null,
      allowedSections: Array.isArray(row.allowedSections) ? row.allowedSections : [],
      isSuperAdmin: !!row.isSuperAdmin,
      disabled: !!row.disabled,
    };
    (req as any).adminId = admin.id;
    (req as any).admin = admin;
    next();
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Admin auth failed" });
  }
}
