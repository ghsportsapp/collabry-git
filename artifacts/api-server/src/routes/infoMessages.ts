import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

// Public: get info message by step
router.get("/info-messages", async (req: Request, res: Response): Promise<void> => {
  const step = req.query["step"] as string;
  if (!step) { res.status(400).json({ error: "step query parameter required" }); return; }
  const r = await pool.query(`SELECT "messageText" FROM "InfoMessage" WHERE step=$1`, [step]);
  if (r.rows.length === 0) { res.json({ messageText: "" }); return; }
  res.json({ messageText: r.rows[0].messageText });
});

// Admin: list all info messages
router.get("/admin/info-messages", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const r = await pool.query(`SELECT id, step, "messageText", "updatedAt" FROM "InfoMessage" ORDER BY step`);
  res.json(r.rows);
});

// Admin: upsert info message
router.patch("/admin/info-messages/:step", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { step } = req.params as Record<string, string>;
  const { messageText } = req.body as { messageText?: string };
  if (messageText === undefined) { res.status(400).json({ error: "messageText is required" }); return; }
  await pool.query(
    `INSERT INTO "InfoMessage" (id, step, "messageText", "updatedAt") VALUES (gen_random_uuid(),$1,$2,NOW())
     ON CONFLICT (step) DO UPDATE SET "messageText"=$2, "updatedAt"=NOW()`,
    [step, messageText]
  );
  res.json({ ok: true });
});

export default router;
