import type { Request, Response, NextFunction } from "express";
import { verifyToken, getAccessSecret } from "../lib/auth";

export function requireCreator(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Creator authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token, getAccessSecret());
    if (payload.userType !== "CREATOR") {
      res.status(403).json({ error: "Creator access required" });
      return;
    }
    (req as any).creatorId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
