import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireBrand } from "../middleware/requireBrand";
import { hashPassword, comparePassword } from "../lib/auth";

const router: IRouter = Router();

router.get("/brand/profile", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;

  const brandResult = await pool.query(
    `SELECT b.id, b."brandName", b."contactName", b.email, b."websiteUrl", b."categoryId", b."subcategoryId",
     b."instagramHandle", b."logoUrl", b.bio, b."creditBalance", b."freeCreditsExpiry", b.status, b."createdAt",
     c.name as "categoryName", s.name as "subcategoryName"
     FROM "Brand" b
     LEFT JOIN "Category" c ON c.id = b."categoryId"
     LEFT JOIN "Subcategory" s ON s.id = b."subcategoryId"
     WHERE b.id=$1`,
    [brandId]
  );

  if (brandResult.rows.length === 0) { res.status(404).json({ error: "Brand not found" }); return; }

  const creditsResult = await pool.query(
    `SELECT "transactionType", amount, "expiresAt" FROM "CreditTransaction" WHERE "brandId"=$1 ORDER BY "createdAt" DESC`,
    [brandId]
  );

  const customFieldsResult = await pool.query(
    `SELECT f.id, f.label, f."fieldType", f."isRequired", cfv.value
     FROM "BrandSignupField" f
     LEFT JOIN "BrandCustomFieldValue" cfv ON cfv."fieldId"=f.id AND cfv."brandId"=$1
     WHERE f."isActive"=true ORDER BY f."displayOrder"`,
    [brandId]
  );

  res.json({
    brand: brandResult.rows[0],
    credits: creditsResult.rows,
    customFields: customFieldsResult.rows,
  });
});

router.patch("/brand/profile", requireBrand, async (req: Request, res: Response): Promise<void> => {
  const brandId = (req as any).brandId as string;
  const { brandName, contactName, websiteUrl, categoryId, subcategoryId, instagramHandle, logoUrl, bio, currentPassword, newPassword, customFields } = req.body as Record<string, any>;

  if (brandName !== undefined) {
    const nameCheck = await pool.query(
      `SELECT id FROM "Brand" WHERE LOWER("brandName")=LOWER($1) AND id<>$2`, [brandName.trim(), brandId]
    );
    if (nameCheck.rows.length > 0) { res.status(400).json({ error: "This brand name is already taken" }); return; }
  }

  if (instagramHandle !== undefined && instagramHandle?.trim()) {
    const cleanIg = instagramHandle.trim().replace(/^@/, "").toLowerCase();
    const igCheck = await pool.query(
      `SELECT 1 FROM "Creator" WHERE LOWER("instagramHandle")=$1
       UNION ALL SELECT 1 FROM "Brand" WHERE LOWER("instagramHandle")=$1 AND id<>$2 LIMIT 1`,
      [cleanIg, brandId]
    );
    if (igCheck.rows.length > 0) { res.status(400).json({ error: "This Instagram handle is already in use by another account" }); return; }
  }

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (brandName !== undefined) { updates.push(`"brandName"=$${idx++}`); values.push(brandName.trim()); }
  if (contactName !== undefined) { updates.push(`"contactName"=$${idx++}`); values.push(contactName.trim()); }
  if (websiteUrl !== undefined) { updates.push(`"websiteUrl"=$${idx++}`); values.push(websiteUrl?.trim() || null); }
  if (categoryId !== undefined) { updates.push(`"categoryId"=$${idx++}`); values.push(categoryId || null); }
  if (subcategoryId !== undefined) { updates.push(`"subcategoryId"=$${idx++}`); values.push(subcategoryId || null); }
  if (instagramHandle !== undefined) { updates.push(`"instagramHandle"=$${idx++}`); values.push(instagramHandle?.trim() || null); }
  if (logoUrl !== undefined) { updates.push(`"logoUrl"=$${idx++}`); values.push(logoUrl); }
  if (bio !== undefined) { updates.push(`bio=$${idx++}`); values.push(bio?.slice(0, 150) || null); }

  if (newPassword) {
    if (!currentPassword) { res.status(400).json({ error: "Current password is required to change password" }); return; }
    if (newPassword.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
    const brandResult = await pool.query(`SELECT "passwordHash" FROM "Brand" WHERE id=$1`, [brandId]);
    const storedHash = brandResult.rows[0]?.passwordHash ?? null;
    let valid = false;
    try { valid = await comparePassword(currentPassword, storedHash ?? ""); } catch { valid = false; }
    if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }
    let sameAsCurrent = false;
    try { sameAsCurrent = storedHash ? await comparePassword(newPassword, storedHash) : false; } catch { sameAsCurrent = false; }
    if (sameAsCurrent) { res.status(400).json({ error: "New password must be different from current password" }); return; }
    const hash = await hashPassword(newPassword);
    updates.push(`"passwordHash"=$${idx++}`);
    values.push(hash);
  }

  if (updates.length > 0) {
    updates.push(`"updatedAt"=NOW()`);
    values.push(brandId);
    await pool.query(`UPDATE "Brand" SET ${updates.join(",")} WHERE id=$${idx}`, values);
  }

  if (customFields && typeof customFields === "object") {
    const fieldIds = Object.keys(customFields);
    if (fieldIds.length > 0) {
      const telFieldsRes = await pool.query(
        `SELECT id FROM "BrandSignupField" WHERE id=ANY($1) AND "fieldType"='tel'`,
        [fieldIds]
      );
      const telFieldIds = new Set(telFieldsRes.rows.map((f: any) => f.id));
      for (const [fieldId, value] of Object.entries(customFields)) {
        if (telFieldIds.has(fieldId) && String(value ?? "").trim()) {
          const phone = String(value).replace(/\D/g, "");
          if (!/^\d{10}$/.test(phone)) { res.status(400).json({ error: "Phone number must be exactly 10 digits" }); return; }
          const phoneCheck = await pool.query(
            `SELECT 1 FROM "Creator" WHERE phone=$1
             UNION ALL
             SELECT 1 FROM "BrandCustomFieldValue" v
               JOIN "BrandSignupField" f ON f.id=v."fieldId"
               WHERE f."fieldType"='tel' AND v.value=$1 AND v."brandId"<>$2
             LIMIT 1`,
            [phone, brandId]
          );
          if (phoneCheck.rows.length > 0) { res.status(400).json({ error: "This phone number is already linked to another account" }); return; }
        }
      }
    }
    for (const [fieldId, value] of Object.entries(customFields)) {
      await pool.query(
        `INSERT INTO "BrandCustomFieldValue" (id,"brandId","fieldId",value,"updatedAt")
         VALUES (gen_random_uuid(),$1,$2,$3,NOW())
         ON CONFLICT ("brandId","fieldId") DO UPDATE SET value=$3,"updatedAt"=NOW()`,
        [brandId, fieldId, String(value ?? "")]
      );
    }
  }

  res.json({ ok: true });
});

export default router;
