import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  (req as any).adminId = (req as any).adminId ?? "system";
  next();
}

export function requireAdminIfAuth(req: Request, _res: Response, next: NextFunction): void {
  (req as any).adminId = (req as any).adminId ?? "system";
  next();
}
