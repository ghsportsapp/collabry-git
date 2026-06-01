import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { requireCreator } from "../middleware/requireCreator";

const router: IRouter = Router();

const TokenBody = z.object({
  fcmToken: z.string().min(1).max(2000).nullable(),
});

router.post(
  "/brand/fcm-token",
  requireBrand,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = TokenBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid fcmToken" });
      return;
    }
    const brandId = (req as Request & { brandId: string }).brandId;
    await pool.query(
      `UPDATE "Brand" SET "fcmToken" = $1 WHERE id = $2`,
      [parsed.data.fcmToken, brandId]
    );
    res.json({ ok: true });
  }
);

router.post(
  "/creator/fcm-token",
  requireCreator,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = TokenBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid fcmToken" });
      return;
    }
    const creatorId = (req as Request & { creatorId: string }).creatorId;
    await pool.query(
      `UPDATE "Creator" SET "fcmToken" = $1 WHERE id = $2`,
      [parsed.data.fcmToken, creatorId]
    );
    res.json({ ok: true });
  }
);

export default router;
