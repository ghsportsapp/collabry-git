import type { Request, Response, NextFunction } from "express";
import { verifyToken, getAccessSecret } from "../lib/auth";

export function requireBrand(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Brand authentication required" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token, getAccessSecret());
    if (payload.userType !== "BRAND") {
      res.status(403).json({ error: "Brand access required" });
      return;
    }
    (req as any).brandId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
