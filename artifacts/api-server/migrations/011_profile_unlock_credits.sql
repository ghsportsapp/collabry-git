-- ─────────────────────────────────────────────────────────────────────────────
-- Configurable profile-unlock cost.
--
-- The cost to unlock a creator profile was hardcoded to 1 credit in the unlock
-- endpoint. This makes it a single GLOBAL, admin-configurable value via the
-- PlatformConfig key 'profile_unlock_credits' (default 1). The value is read live
-- at unlock time, so changing it affects only FUTURE unlocks; already-unlocked
-- profiles (BrandUnlockRecord) are never revisited or re-charged.
--
-- Only inserted if absent — never overwrites an admin-set value. Additive and
-- idempotent. The application floors the value at 1 and treats a missing/unparseable
-- value as 1, so it is safe to deploy the code before or after this migration.
--
-- Run BEFORE deploying the API. DO NOT run `prisma db push` — the live schema is
-- managed by raw SQL + these migrations (schema.prisma is stale).
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/011_profile_unlock_credits.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

INSERT INTO "PlatformConfig" (id, key, value, description, "updatedAt")
VALUES (gen_random_uuid(), 'profile_unlock_credits', '1',
        'Credits deducted to unlock a creator profile (global, min 1)', NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ── Rollback, if ever needed ────────────────────────────────────────────────
-- DELETE FROM "PlatformConfig" WHERE key = 'profile_unlock_credits';
