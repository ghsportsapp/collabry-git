import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCreator } from "../middleware/requireCreator";

const router: IRouter = Router();

router.get("/creator/brands/:brandId/profile", requireCreator, async (req: Request, res: Response): Promise<void> => {
  const { brandId } = req.params;

  const brandResult = await pool.query(
    `SELECT b.id, b."brandName", b."logoUrl", b.bio, b."websiteUrl", b."instagramHandle",
     c.name as "categoryName", s.name as "subcategoryName"
     FROM "Brand" b
     LEFT JOIN "Category" c ON c.id = b."categoryId"
     LEFT JOIN "Subcategory" s ON s.id = b."subcategoryId"
     WHERE b.id = $1 AND b.status = 'ACTIVE'`,
    [brandId]
  );

  if (brandResult.rows.length === 0) { res.status(404).json({ error: "Brand not found" }); return; }

  const customFieldsResult = await pool.query(
    `SELECT f.label, f."fieldType", cfv.value
     FROM "BrandSignupField" f
     LEFT JOIN "BrandCustomFieldValue" cfv ON cfv."fieldId"=f.id AND cfv."brandId"=$1
     WHERE f."isActive"=true AND f."fieldType" <> 'tel' AND cfv.value IS NOT NULL AND cfv.value <> ''
     ORDER BY f."displayOrder"`,
    [brandId]
  );

  res.json({
    brand: brandResult.rows[0],
    customFields: customFieldsResult.rows,
  });
});

export default router;
