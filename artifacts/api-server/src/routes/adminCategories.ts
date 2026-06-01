import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

router.get("/admin/categories", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const cats = await pool.query(
    `SELECT c.id, c.name, c."displayOrder", c."isActive", c."createdAt",
     COUNT(DISTINCT s.id) as "subcategoryCount"
     FROM "Category" c
     LEFT JOIN "Subcategory" s ON s."categoryId"=c.id AND s."isActive"=true
     GROUP BY c.id, c.name, c."displayOrder", c."isActive", c."createdAt"
     ORDER BY c."displayOrder", c.name`
  );

  const adjacency = await pool.query(
    `SELECT ca."categoryA", ca."categoryB", ca.pts,
     c1.name as "nameA", c2.name as "nameB"
     FROM "CategoryAdjacency" ca
     JOIN "Category" c1 ON c1.id=ca."categoryA"
     JOIN "Category" c2 ON c2.id=ca."categoryB"`
  );

  const relMap: Record<string, Array<{ id: string; name: string }>> = {};
  adjacency.rows.forEach((r: any) => {
    if (!relMap[r.categoryA]) relMap[r.categoryA] = [];
    if (!relMap[r.categoryB]) relMap[r.categoryB] = [];
    relMap[r.categoryA].push({ id: r.categoryB, name: r.nameB });
    relMap[r.categoryB].push({ id: r.categoryA, name: r.nameA });
  });

  const result = cats.rows.map((c: any) => ({
    ...c,
    subcategoryCount: parseInt(c.subcategoryCount),
    relatedCategories: relMap[c.id] ?? [],
  }));

  res.json(result);
});

router.get("/admin/categories/:id/subcategories", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT id, name, "displayOrder", "isActive", "createdAt" FROM "Subcategory"
     WHERE "categoryId"=$1 ORDER BY "displayOrder", name`,
    [req.params.id]
  );
  res.json(result.rows);
});

router.post("/admin/categories", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { name, relatedCategoryIds = [] } = req.body as { name?: string; relatedCategoryIds?: string[] };
  if (!name?.trim()) { res.status(400).json({ error: "Category name is required" }); return; }

  const existing = await pool.query(`SELECT id FROM "Category" WHERE LOWER(name)=LOWER($1)`, [name.trim()]);
  if (existing.rows.length > 0) { res.status(400).json({ error: "Category with this name already exists" }); return; }

  const maxOrder = await pool.query(`SELECT COALESCE(MAX("displayOrder"), 0) as max FROM "Category"`);
  const nextOrder = (maxOrder.rows[0].max as number) + 1;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const catResult = await client.query(
      `INSERT INTO "Category" (id, name, "displayOrder", "isActive", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(),$1,$2,true,NOW(),NOW()) RETURNING *`,
      [name.trim(), nextOrder]
    );
    const catId = catResult.rows[0].id;

    for (const relId of relatedCategoryIds) {
      const [a, b] = [catId, relId].sort();
      await client.query(
        `INSERT INTO "CategoryAdjacency" (id,"categoryA","categoryB",pts,"createdBy","createdAt")
         VALUES (gen_random_uuid(),$1,$2,11,$3,NOW()) ON CONFLICT ("categoryA","categoryB") DO NOTHING`,
        [a, b, adminId]
      );
    }

    await client.query(
      `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
       VALUES (gen_random_uuid(),$1,'CREATE_CATEGORY','CATEGORY',$2,$3::jsonb,NOW())`,
      [adminId, catId, JSON.stringify({ name: name.trim(), relatedCategoryIds })]
    );
    await client.query("COMMIT");
    res.json(catResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.patch("/admin/categories/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { name, relatedCategoryIds } = req.body as { name?: string; relatedCategoryIds?: string[] };

  if (name !== undefined) {
    await pool.query(`UPDATE "Category" SET name=$1,"updatedAt"=NOW() WHERE id=$2`, [name.trim(), id]);
  }

  const { isActive } = req.body as { isActive?: boolean };
  if (isActive !== undefined) {
    await pool.query(`UPDATE "Category" SET "isActive"=$1,"updatedAt"=NOW() WHERE id=$2`, [isActive, id]);
  }

  if (relatedCategoryIds !== undefined) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM "CategoryAdjacency" WHERE "categoryA"=$1 OR "categoryB"=$1`, [id]);
      for (const relId of relatedCategoryIds) {
        const [a, b] = [id, relId].sort();
        await client.query(
          `INSERT INTO "CategoryAdjacency" (id,"categoryA","categoryB",pts,"createdBy","createdAt")
           VALUES (gen_random_uuid(),$1,$2,11,$3,NOW()) ON CONFLICT ("categoryA","categoryB") DO NOTHING`,
          [a, b, adminId]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'UPDATE_CATEGORY','CATEGORY',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ name, relatedCategoryIds })]
  );

  res.json({ ok: true });
});

router.delete("/admin/categories/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;

  const catResult = await pool.query(`SELECT name FROM "Category" WHERE id=$1`, [id]);
  if (catResult.rows.length === 0) { res.status(404).json({ error: "Category not found" }); return; }
  const catName = catResult.rows[0].name;

  await pool.query(`UPDATE "Category" SET "isActive"=false,"updatedAt"=NOW() WHERE id=$1`, [id]);
  await pool.query(`UPDATE "Subcategory" SET "isActive"=false,"updatedAt"=NOW() WHERE "categoryId"=$1`, [id]);

  const affectedBrands = await pool.query(
    `SELECT id FROM "Brand" WHERE "categoryId"=$1 AND status='ACTIVE'`, [id]
  );

  for (const brand of affectedBrands.rows) {
    await pool.query(
      `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","createdAt")
       VALUES (gen_random_uuid(),$1,'BRAND','CATEGORY_REMOVED',$2,$3,false,NOW())`,
      [brand.id, `Category Removed: ${catName}`, `The category "${catName}" has been removed from Collabry. Please update your brand category in My Profile.`]
    );
  }

  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'DELETE_CATEGORY','CATEGORY',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ catName, affectedBrands: affectedBrands.rowCount })]
  );

  res.json({ ok: true, affectedBrands: affectedBrands.rowCount });
});

router.post("/admin/categories/:categoryId/subcategories", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { categoryId } = req.params as Record<string, string>;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Subcategory name is required" }); return; }

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM "Subcategory" WHERE "categoryId"=$1 AND "isActive"=true`, [categoryId]
  );
  if (parseInt(countResult.rows[0].count) >= 8) {
    res.status(400).json({ error: "Maximum 8 subcategories per category" }); return;
  }

  // Check for an existing inactive subcategory with the same name — reactivate instead of inserting
  const existing = await pool.query(
    `SELECT id FROM "Subcategory" WHERE "categoryId"=$1 AND LOWER(name)=LOWER($2)`,
    [categoryId, name.trim()]
  );
  if (existing.rows.length > 0) {
    const result = await pool.query(
      `UPDATE "Subcategory" SET "isActive"=true,"updatedAt"=NOW() WHERE id=$1 RETURNING *`,
      [existing.rows[0].id]
    );
    res.json(result.rows[0]);
    return;
  }

  const maxOrder = await pool.query(
    `SELECT COALESCE(MAX("displayOrder"), 0) as max FROM "Subcategory" WHERE "categoryId"=$1`, [categoryId]
  );

  const result = await pool.query(
    `INSERT INTO "Subcategory" (id,"categoryId",name,"displayOrder","isActive","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,true,NOW(),NOW()) RETURNING *`,
    [categoryId, name.trim(), (maxOrder.rows[0].max as number) + 1]
  );

  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'CREATE_SUBCATEGORY','SUBCATEGORY',$2,$3::jsonb,NOW())`,
    [adminId, result.rows[0].id, JSON.stringify({ categoryId, name: name.trim() })]
  );

  res.json(result.rows[0]);
});

router.patch("/admin/subcategories/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }

  await pool.query(`UPDATE "Subcategory" SET name=$1,"updatedAt"=NOW() WHERE id=$2`, [name.trim(), id]);

  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'UPDATE_SUBCATEGORY','SUBCATEGORY',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ name: name.trim() })]
  );

  res.json({ ok: true });
});

router.delete("/admin/subcategories/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId = (req as any).adminId as string;
  const { id } = req.params as Record<string, string>;

  const subResult = await pool.query(`SELECT name,"categoryId" FROM "Subcategory" WHERE id=$1`, [id]);
  if (subResult.rows.length === 0) { res.status(404).json({ error: "Subcategory not found" }); return; }

  await pool.query(`UPDATE "Subcategory" SET "isActive"=false,"updatedAt"=NOW() WHERE id=$1`, [id]);

  const affectedBrands = await pool.query(
    `SELECT id FROM "Brand" WHERE "subcategoryId"=$1 AND status='ACTIVE'`, [id]
  );

  for (const brand of affectedBrands.rows) {
    await pool.query(
      `INSERT INTO "Notification" (id,"userId","userType",type,title,body,"isRead","createdAt")
       VALUES (gen_random_uuid(),$1,'BRAND','SUBCATEGORY_REMOVED',$2,$3,false,NOW())`,
      [brand.id, `Subcategory Removed`, `A subcategory you selected has been removed. Please update your brand sub-category in My Profile.`]
    );
  }

  await pool.query(
    `INSERT INTO "AdminActionLog" (id,"adminId",action,"entityType","entityId",details,"createdAt")
     VALUES (gen_random_uuid(),$1,'DELETE_SUBCATEGORY','SUBCATEGORY',$2,$3::jsonb,NOW())`,
    [adminId, id, JSON.stringify({ name: subResult.rows[0].name, affectedBrands: affectedBrands.rowCount })]
  );

  res.json({ ok: true, affectedBrands: affectedBrands.rowCount });
});

export default router;
