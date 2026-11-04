import type { Request, Response, NextFunction } from "express";
import type { AdminContext } from "./requireAdminAuth";

/**
 * Per-section authorization gate. DORMANT in Phase 1: defined and unit-testable,
 * NOT attached to any live admin router yet (Phase 2 wires it in).
 *
 * Must run AFTER requireAdminAuth (which populates req.admin). Passes when the
 * admin is a super admin (full access), or when `sectionKey` is in their
 * allowedSections; otherwise 403.
 */
export function requireSection(sectionKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const admin = (req as any).admin as AdminContext | undefined;
    if (!admin) {
      // requireAdminAuth did not run before this — fail closed.
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    if (admin.isSuperAdmin || admin.allowedSections.includes(sectionKey)) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden: section not allowed" });
  };
}
