-- ─────────────────────────────────────────────────────────────────────────────
-- Admin RBAC: real per-admin accounts with section scoping.
--
-- Adds scoping columns to the existing "Admin" table so each admin account can
-- be limited to specific panel sections. A super admin (isSuperAdmin=true) has
-- full access and is the only role that may manage admins. allowedSections is
-- the list of section keys a normal admin may access ('{}' = none until granted).
--
-- Run this against the live database BEFORE deploying the RBAC cutover. It is
-- additive and idempotent — re-running it is safe, and it changes NO existing
-- behavior on its own (the columns are unused until the Phase 2 cutover).
--
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/005_admin_rbac.sql
--
-- DO NOT run `prisma db push` — the live schema is managed by raw SQL + these
-- migrations (schema.prisma is stale). After this, seed the super-admin row with
-- scripts/seed-super-admin.mjs.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Display name (login is by email; username already exists and stays).
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "name" text;

-- bcrypt hash of the account's fixed OTP code (set by the super admin). Never
-- stored in plaintext; compared the same way as passwordHash.
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "otpHash" text;

-- Section keys this admin may access. '{}' = none; ignored when isSuperAdmin.
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "allowedSections" text[] NOT NULL DEFAULT '{}';

-- Full access + the only role that can open "Manage Admins".
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "isSuperAdmin" boolean NOT NULL DEFAULT false;

-- Soft lock: a disabled admin cannot log in.
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "disabled" boolean NOT NULL DEFAULT false;

-- createdAt already exists on legacy rows; added defensively for any that lack it.
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT NOW();
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT NOW();

-- Case-insensitive email uniqueness (login looks up by LOWER(email)).
CREATE UNIQUE INDEX IF NOT EXISTS "Admin_email_lower_uniq" ON "Admin" (LOWER(email));

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- DROP INDEX IF EXISTS "Admin_email_lower_uniq";
-- ALTER TABLE "Admin" DROP COLUMN IF EXISTS "updatedAt";
-- ALTER TABLE "Admin" DROP COLUMN IF EXISTS "disabled";
-- ALTER TABLE "Admin" DROP COLUMN IF EXISTS "isSuperAdmin";
-- ALTER TABLE "Admin" DROP COLUMN IF EXISTS "allowedSections";
-- ALTER TABLE "Admin" DROP COLUMN IF EXISTS "otpHash";
-- ALTER TABLE "Admin" DROP COLUMN IF EXISTS "name";
