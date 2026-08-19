import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Real authentication for admin endpoints that return personal data in bulk.
 *
 * `requireAdmin` in this codebase is a placeholder — it stamps an adminId and
 * calls next() without verifying anything, so every route carrying it is in
 * practice open. That is survivable for routes that return one record behind an
 * unguessable id; it is not survivable for an endpoint that emits every active
 * creator's phone number and email in a single response.
 *
 * Until real admin sessions exist, this gates on a secret supplied out of band
 * through ADMIN_API_SECRET and sent by the admin panel as `x-admin-secret`.
 */

/** Digest before comparing so the comparison is constant-time even when the
 *  supplied value differs in length from the expected one. */
const digest = (value: string): Buffer =>
  createHash("sha256").update(value, "utf8").digest();

export function requireAdminSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_API_SECRET;

  // Fail closed. A missing secret must never degrade to "allow everyone" on a
  // route like this — an unconfigured server refuses the export instead.
  if (!expected) {
    res.status(503).json({ error: "Export is not configured on this server." });
    return;
  }

  const provided = req.get("x-admin-secret");
  if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
