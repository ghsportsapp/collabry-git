#!/usr/bin/env node
// Seed (or update) the single super-admin account for the RBAC admin panel, and
// verify its hashes before cutover. Run on the VPS AFTER migration 005.
//
// Secrets come from env vars — never hardcode them, never printed back.
//
// Seed / upsert:
//   DATABASE_URL=... ADMIN_NAME="..." ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_OTP=1234 \
//     node scripts/seed-super-admin.mjs
//   (optional ADMIN_USERNAME — defaults to ADMIN_EMAIL)
//
// Verify (no writes — confirm the stored hashes accept a password + OTP):
//   DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_OTP=1234 \
//     node scripts/seed-super-admin.mjs --verify
//
// It upserts ONE row by LOWER(email) with isSuperAdmin=true, allowedSections '{}'
// (super admins ignore allowedSections — they get everything). bcrypt rounds (12)
// match the app's hashPassword, so app-side comparePassword accepts these hashes.

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../../..");

// `pg` is pulled in transitively via @workspace/db (not a direct dep here), so
// borrow lib/db's resolver — same approach as scripts/deleteCreator.mjs.
const requireFromDb = createRequire(path.join(workspaceRoot, "lib/db/package.json"));
const pg = requireFromDb("pg");
// bcryptjs IS a direct dependency of @workspace/api-server; resolve from its pkg.
const requireFromApiServer = createRequire(path.join(workspaceRoot, "artifacts/api-server/package.json"));
const bcrypt = requireFromApiServer("bcryptjs");

const VERIFY = process.argv.includes("--verify");
const BCRYPT_ROUNDS = 12; // matches lib/auth.ts hashPassword

function buildPoolConfig(url) {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  const wantsSsl = mode !== null && mode !== "disable" && mode !== "allow";
  u.searchParams.delete("sslmode");
  u.searchParams.delete("ssl");
  return {
    connectionString: u.toString(),
    ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (missing.length > 0) {
    console.error(`Missing required env var(s): ${missing.join(", ")}`);
    process.exit(1);
  }
}

async function main() {
  requireEnv(["DATABASE_URL"]);
  const pool = new pg.Pool(buildPoolConfig(process.env.DATABASE_URL));

  try {
    if (VERIFY) {
      requireEnv(["ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_OTP"]);
      const r = await pool.query(
        `SELECT id, username, email, name, "passwordHash", "otpHash", "isSuperAdmin", "disabled", "allowedSections"
         FROM "Admin" WHERE LOWER(email)=LOWER($1) LIMIT 1`,
        [process.env.ADMIN_EMAIL.trim()]
      );
      if (r.rows.length === 0) {
        console.error(`✗ No Admin row for ${process.env.ADMIN_EMAIL.trim()}. Run the seed (without --verify) first.`);
        process.exit(2);
      }
      const row = r.rows[0];
      const pwOk = await bcrypt.compare(process.env.ADMIN_PASSWORD, row.passwordHash ?? "");
      const otpOk = row.otpHash ? await bcrypt.compare(process.env.ADMIN_OTP, row.otpHash) : false;
      console.log(`Admin:           ${row.email} (username: ${row.username}, name: ${row.name ?? "—"})`);
      console.log(`isSuperAdmin:    ${row.isSuperAdmin}`);
      console.log(`disabled:        ${row.disabled}`);
      console.log(`allowedSections: {${(row.allowedSections ?? []).join(", ")}}`);
      console.log(`password check:  ${pwOk ? "PASS ✓" : "FAIL ✗"}`);
      console.log(`OTP check:       ${otpOk ? "PASS ✓" : "FAIL ✗"}`);
      process.exit(pwOk && otpOk ? 0 : 3);
    }

    // ── Seed / upsert ──
    requireEnv(["ADMIN_NAME", "ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_OTP"]);
    const name = process.env.ADMIN_NAME.trim();
    const email = process.env.ADMIN_EMAIL.trim();
    const username = (process.env.ADMIN_USERNAME ?? email).trim();
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, BCRYPT_ROUNDS);
    const otpHash = await bcrypt.hash(process.env.ADMIN_OTP, BCRYPT_ROUNDS);

    const existing = await pool.query(`SELECT id FROM "Admin" WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE "Admin"
           SET name=$2, username=$3, "passwordHash"=$4, "otpHash"=$5,
               "isSuperAdmin"=true, "allowedSections"='{}', "disabled"=false, "updatedAt"=NOW()
         WHERE id=$1`,
        [existing.rows[0].id, name, username, passwordHash, otpHash]
      );
      console.log(`✓ Updated existing super-admin (${email}). isSuperAdmin=true, disabled=false.`);
    } else {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "Admin"
           (id, username, email, name, "passwordHash", "otpHash", "isSuperAdmin", "allowedSections", "disabled", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,true,'{}',false,NOW(),NOW())`,
        [id, username, email, name, passwordHash, otpHash]
      );
      console.log(`✓ Created super-admin (${email}). isSuperAdmin=true.`);
    }
    console.log("Done. Verify with: node scripts/seed-super-admin.mjs --verify");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err?.message ?? err);
  process.exit(1);
});
