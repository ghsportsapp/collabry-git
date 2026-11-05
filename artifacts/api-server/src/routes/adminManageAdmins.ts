import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { pool } from "@workspace/db";
import { hashPassword } from "../lib/auth";
import { ADMIN_SECTION_KEYS } from "../lib/adminSections";

/**
 * Manage Admins — super-admin only (section key "manage-admins").
 *
 * These routes live under /admin/manage-admins, so adminGuard already runs
 * requireAdminAuth and allows only super admins (manage-admins is a SUPER_PREFIX).
 * Each handler re-checks req.admin.isSuperAdmin as defense in depth. Responses
 * never include password/OTP hashes.
 */

const router: IRouter = Router();

const SAFE_COLUMNS = `id, name, email, "allowedSections", "isSuperAdmin", disabled, "createdAt"`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^\d{4,6}$/;
const GRANTABLE = new Set<string>(ADMIN_SECTION_KEYS as readonly string[]);

function superAdmin(req: Request): { id: string; isSuperAdmin: boolean } | null {
  const a = (req as any).admin as { id: string; isSuperAdmin: boolean } | undefined;
  return a ?? null;
}

/** Reject with 403 unless the caller is a super admin. Returns true if allowed. */
function ensureSuper(req: Request, res: Response): boolean {
  const a = superAdmin(req);
  if (!a || !a.isSuperAdmin) { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

/** Validate an allowedSections array: only the 16 grantable keys (never
 *  manage-admins or any super-only capability). */
function cleanSections(input: unknown): { ok: true; value: string[] } | { ok: false; bad: string } {
  if (!Array.isArray(input)) return { ok: false, bad: "allowedSections must be an array" };
  const out: string[] = [];
  for (const s of input) {
    if (typeof s !== "string" || !GRANTABLE.has(s)) return { ok: false, bad: `Invalid section: ${String(s)}` };
    if (!out.includes(s)) out.push(s);
  }
  return { ok: true, value: out };
}

// GET /admin/manage-admins — list all admins (no hashes).
router.get("/admin/manage-admins", async (req: Request, res: Response): Promise<void> => {
  if (!ensureSuper(req, res)) return;
  const r = await pool.query(`SELECT ${SAFE_COLUMNS} FROM "Admin" ORDER BY "isSuperAdmin" DESC, LOWER(email) ASC`);
  res.json({ admins: r.rows });
});

// POST /admin/manage-admins — create a (non-super) admin.
router.post("/admin/manage-admins", async (req: Request, res: Response): Promise<void> => {
  if (!ensureSuper(req, res)) return;
  const { name, email, password, otp, allowedSections } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) { res.status(400).json({ error: "A valid email is required" }); return; }
  if (typeof password !== "string" || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
  if (typeof otp !== "string" || !OTP_RE.test(otp)) { res.status(400).json({ error: "OTP must be 4–6 digits" }); return; }
  const sections = cleanSections(allowedSections ?? []);
  if (!sections.ok) { res.status(400).json({ error: sections.bad }); return; }

  const emailNorm = email.trim().toLowerCase();
  const dup = await pool.query(`SELECT 1 FROM "Admin" WHERE LOWER(email)=LOWER($1) LIMIT 1`, [emailNorm]);
  if (dup.rows.length > 0) { res.status(409).json({ error: "An admin with this email already exists" }); return; }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const otpHash = await hashPassword(otp);
  try {
    const ins = await pool.query(
      `INSERT INTO "Admin" (id, username, email, name, "passwordHash", "otpHash", "isSuperAdmin", "allowedSections", "disabled", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,false,$7,false,NOW(),NOW())
       RETURNING ${SAFE_COLUMNS}`,
      [id, emailNorm, emailNorm, name.trim(), passwordHash, otpHash, sections.value]
    );
    res.json({ ok: true, admin: ins.rows[0] });
  } catch (e: any) {
    if (e?.code === "23505") { res.status(409).json({ error: "An admin with this email already exists" }); return; }
    res.status(500).json({ error: e?.message ?? "Could not create admin" });
  }
});

// PATCH /admin/manage-admins/:id — update sections / reset password / reset OTP / enable-disable.
router.patch("/admin/manage-admins/:id", async (req: Request, res: Response): Promise<void> => {
  if (!ensureSuper(req, res)) return;
  const me = superAdmin(req)!;
  const targetId = String(req.params["id"]);
  const { allowedSections, password, otp, disabled } = (req.body ?? {}) as Record<string, unknown>;

  const existing = await pool.query(`SELECT id FROM "Admin" WHERE id=$1 LIMIT 1`, [targetId]);
  if (existing.rows.length === 0) { res.status(404).json({ error: "Admin not found" }); return; }

  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}"=$${params.length}`); };

  if (allowedSections !== undefined) {
    const sections = cleanSections(allowedSections);
    if (!sections.ok) { res.status(400).json({ error: sections.bad }); return; }
    add("allowedSections", sections.value);
  }
  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
    add("passwordHash", await hashPassword(password));
  }
  if (otp !== undefined) {
    if (typeof otp !== "string" || !OTP_RE.test(otp)) { res.status(400).json({ error: "OTP must be 4–6 digits" }); return; }
    add("otpHash", await hashPassword(otp));
  }
  if (disabled !== undefined) {
    const d = !!disabled;
    if (d && targetId === me.id) { res.status(403).json({ error: "You cannot disable your own account" }); return; }
    add("disabled", d);
  }

  if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  params.push(targetId);
  const upd = await pool.query(
    `UPDATE "Admin" SET ${sets.join(", ")}, "updatedAt"=NOW() WHERE id=$${params.length} RETURNING ${SAFE_COLUMNS}`,
    params
  );
  res.json({ ok: true, admin: upd.rows[0] });
});

// DELETE /admin/manage-admins/:id — remove an admin (never yourself).
router.delete("/admin/manage-admins/:id", async (req: Request, res: Response): Promise<void> => {
  if (!ensureSuper(req, res)) return;
  const me = superAdmin(req)!;
  const targetId = String(req.params["id"]);
  if (targetId === me.id) { res.status(403).json({ error: "You cannot delete your own account" }); return; }
  const r = await pool.query(`DELETE FROM "Admin" WHERE id=$1 RETURNING id`, [targetId]);
  if (r.rows.length === 0) { res.status(404).json({ error: "Admin not found" }); return; }
  res.json({ ok: true });
});

export default router;
