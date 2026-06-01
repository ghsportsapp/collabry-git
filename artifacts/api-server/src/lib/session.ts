import crypto from "crypto";
import { pool } from "@workspace/db";
import { generateRefreshToken, type UserType } from "./auth";

const ADMIN_INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function saveRefreshToken(
  userId: string,
  userType: UserType,
  token: string
): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt =
    userType === "ADMIN"
      ? new Date(Date.now() + 8 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO "RefreshToken" (id, "userId", "userType", "tokenHash", "expiresAt", "revoked", "createdAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, false, NOW())`,
    [userId, userType, tokenHash, expiresAt]
  );
}

export type RotateResult =
  | { ok: true; newToken: string }
  | { ok: false; reuseDetected: boolean; reason: string };

export async function rotateRefreshToken(
  oldToken: string,
  userId: string,
  userType: UserType
): Promise<RotateResult> {
  const oldHash = hashToken(oldToken);

  const result = await pool.query(
    `SELECT id, revoked, "expiresAt", "lastUsedAt"
     FROM "RefreshToken"
     WHERE "tokenHash" = $1 AND "userId" = $2 AND "userType" = $3`,
    [oldHash, userId, userType]
  );

  if (result.rows.length === 0) {
    await revokeAllTokens(userId, userType);
    return { ok: false, reuseDetected: true, reason: "Token not found — possible reuse" };
  }

  const record = result.rows[0];

  if (record.revoked) {
    await revokeAllTokens(userId, userType);
    return { ok: false, reuseDetected: true, reason: "Revoked token reused — all sessions invalidated" };
  }

  if (new Date(record.expiresAt) < new Date()) {
    return { ok: false, reuseDetected: false, reason: "Refresh token expired" };
  }

  if (userType === "ADMIN" && record.lastUsedAt) {
    const idleMs = Date.now() - new Date(record.lastUsedAt).getTime();
    if (idleMs > ADMIN_INACTIVITY_MS) {
      await revokeAllTokens(userId, userType);
      return { ok: false, reuseDetected: false, reason: "Admin session expired due to inactivity" };
    }
  }

  await pool.query(
    `UPDATE "RefreshToken" SET revoked = true WHERE id = $1`,
    [record.id]
  );

  const newToken = generateRefreshToken(userId, userType);
  const newHash = hashToken(newToken);
  const expiresAt =
    userType === "ADMIN"
      ? new Date(Date.now() + 8 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO "RefreshToken" (id, "userId", "userType", "tokenHash", "expiresAt", "revoked", "createdAt", "lastUsedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, false, NOW(), NOW())`,
    [userId, userType, newHash, expiresAt]
  );

  return { ok: true, newToken };
}

export async function revokeAllTokens(
  userId: string,
  userType: UserType
): Promise<void> {
  await pool.query(
    `UPDATE "RefreshToken" SET revoked = true
     WHERE "userId" = $1 AND "userType" = $2 AND revoked = false`,
    [userId, userType]
  );
}

export async function revokeToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await pool.query(
    `UPDATE "RefreshToken" SET revoked = true WHERE "tokenHash" = $1`,
    [tokenHash]
  );
}

export async function updateLastUsed(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await pool.query(
    `UPDATE "RefreshToken" SET "lastUsedAt" = NOW() WHERE "tokenHash" = $1`,
    [tokenHash]
  );
}
