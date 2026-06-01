import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/categories", async (_req: Request, res: Response): Promise<void> => {
  const cats = await pool.query(
    `SELECT id, name, "displayOrder" FROM "Category" WHERE "isActive"=true ORDER BY "displayOrder", name`
  );
  const subs = await pool.query(
    `SELECT id, "categoryId", name, "displayOrder" FROM "Subcategory" WHERE "isActive"=true ORDER BY "displayOrder", name`
  );

  const result = cats.rows.map((c: any) => ({
    ...c,
    subcategories: subs.rows.filter((s: any) => s.categoryId === c.id),
  }));

  res.json(result);
});

export default router;
