import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

const MAX_ACTIVE = 10;

router.get("/admin/fun-questions", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [qR, optR] = await Promise.all([
    pool.query(`SELECT * FROM "FunQuestion" WHERE "isActive"=true ORDER BY "displayOrder", "createdAt"`),
    pool.query(`SELECT * FROM "FunQuestionOption" ORDER BY "displayOrder"`),
  ]);
  const optsByQ: Record<string, any[]> = {};
  for (const o of optR.rows) {
    (optsByQ[o.questionId] ??= []).push({ id: o.id, optionText: o.optionText, displayOrder: o.displayOrder });
  }
  res.json(qR.rows.map(q => ({
    id: q.id,
    questionText: q.questionText,
    isActive: q.isActive,
    displayOrder: q.displayOrder,
    options: optsByQ[q.id] ?? [],
  })));
});

router.post("/admin/fun-questions", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { questionText, options } = req.body as { questionText?: string; options?: string[] };
  if (!questionText?.trim()) { res.status(400).json({ error: "Question text required" }); return; }
  const cleanOptions = (options ?? []).map(o => (o ?? "").trim()).filter(Boolean);
  if (cleanOptions.length < 2) { res.status(400).json({ error: "At least 2 options required" }); return; }
  if (cleanOptions.length > 4) { res.status(400).json({ error: "Maximum 4 options allowed" }); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cnt = await client.query(`SELECT COUNT(*)::int as c FROM "FunQuestion" WHERE "isActive"=true`);
    if (cnt.rows[0].c >= MAX_ACTIVE) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Maximum ${MAX_ACTIVE} active questions reached. Delete an existing question to add a new one.` });
      return;
    }

    const maxR = await client.query(`SELECT COALESCE(MAX("displayOrder"),0) as m FROM "FunQuestion"`);
    const nextOrder = parseInt(maxR.rows[0].m) + 1;

    const qR = await client.query(
      `INSERT INTO "FunQuestion" (id, "questionText", "displayOrder", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, NOW()) RETURNING id`,
      [questionText.trim(), nextOrder],
    );
    const qid = qR.rows[0].id;
    for (let i = 0; i < cleanOptions.length; i++) {
      await client.query(
        `INSERT INTO "FunQuestionOption" (id, "questionId", "optionText", "displayOrder")
         VALUES (gen_random_uuid()::text, $1, $2, $3)`,
        [qid, cleanOptions[i], i + 1],
      );
    }

    const creators = await client.query(`SELECT id FROM "Creator" WHERE status='ACTIVE'`);
    for (const c of creators.rows) {
      await client.query(
        `INSERT INTO "Notification" (id, "userId", "userType", type, title, body, "expiresAt")
         VALUES (gen_random_uuid()::text, $1, 'CREATOR', 'NEW_FUN_QUESTIONS', $2, $3, NOW() + INTERVAL '60 days')`,
        [c.id, "New Questions Added", "New fun questions are available. Answer them to complete your profile."],
      );
    }

    await client.query("COMMIT");
    res.json({ id: qid });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.patch("/admin/fun-questions/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { questionText, options } = req.body as { questionText?: string; options?: string[] };
  if (!questionText?.trim()) { res.status(400).json({ error: "Question text required" }); return; }
  const cleanOptions = (options ?? []).map(o => (o ?? "").trim()).filter(Boolean);
  if (cleanOptions.length < 2) { res.status(400).json({ error: "At least 2 options required" }); return; }
  if (cleanOptions.length > 4) { res.status(400).json({ error: "Maximum 4 options allowed" }); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE "FunQuestion" SET "questionText"=$1, "updatedAt"=NOW() WHERE id=$2`,
      [questionText.trim(), id],
    );
    await client.query(`DELETE FROM "CreatorFunAnswer" WHERE "questionId"=$1`, [id]);
    await client.query(`DELETE FROM "FunQuestionOption" WHERE "questionId"=$1`, [id]);
    for (let i = 0; i < cleanOptions.length; i++) {
      await client.query(
        `INSERT INTO "FunQuestionOption" (id, "questionId", "optionText", "displayOrder")
         VALUES (gen_random_uuid()::text, $1, $2, $3)`,
        [id, cleanOptions[i], i + 1],
      );
    }

    const creators = await client.query(`SELECT id FROM "Creator" WHERE status='ACTIVE'`);
    for (const c of creators.rows) {
      await client.query(
        `INSERT INTO "Notification" (id, "userId", "userType", type, title, body, "expiresAt")
         VALUES (gen_random_uuid()::text, $1, 'CREATOR', 'NEW_FUN_QUESTIONS', $2, $3, NOW() + INTERVAL '60 days')`,
        [c.id, "Fun Questions Updated", "A fun question was updated. Please review and answer."],
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/admin/fun-questions/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  await pool.query(`DELETE FROM "CreatorFunAnswer" WHERE "questionId"=$1`, [id]);
  await pool.query(`DELETE FROM "FunQuestionOption" WHERE "questionId"=$1`, [id]);
  await pool.query(`DELETE FROM "FunQuestion" WHERE id=$1`, [id]);
  res.json({ ok: true });
});

export default router;
