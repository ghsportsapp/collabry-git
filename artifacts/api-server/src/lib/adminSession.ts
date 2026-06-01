import crypto from "crypto";
import bcryptjs from "bcryptjs";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { sendEmail } from "./email";

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export async function sendAdminOtp(adminId: string, adminEmail: string): Promise<void> {
  await pool.query(
    `UPDATE "AdminOtp" SET used = true WHERE "adminId" = $1 AND used = false`,
    [adminId]
  );

  const otp = generateOtp();
  const otpHash = await bcryptjs.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await pool.query(
    `INSERT INTO "AdminOtp" (id, "adminId", "otpHash", "expiresAt", used, "createdAt")
     VALUES (gen_random_uuid(), $1, $2, $3, false, NOW())`,
    [adminId, otpHash, expiresAt]
  );

  try {
    await sendEmail({
      to: adminEmail,
      subject: "Collabry Admin OTP",
      text: `Your Collabry admin OTP is: ${otp}\n\nThis code expires in 10 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Collabry Admin Login</h2>
          <p>Your one-time password is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #F0187A; padding: 20px; background: #f4f4f5; border-radius: 8px; text-align: center;">
            ${otp}
          </div>
          <p style="color: #666; margin-top: 16px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        </div>
      `,
    });
    logger.info({ adminId }, "Admin OTP sent");
  } catch (err) {
    logger.error({ err, adminId }, "Failed to send admin OTP email");
    throw new Error("Failed to send OTP email");
  }
}

export async function verifyAdminOtp(
  adminId: string,
  otp: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT id, "otpHash", "expiresAt", used
     FROM "AdminOtp"
     WHERE "adminId" = $1 AND used = false
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [adminId]
  );

  if (result.rows.length === 0) return false;

  const record = result.rows[0];

  if (record.used || new Date(record.expiresAt) < new Date()) return false;

  const valid = await bcryptjs.compare(otp, record.otpHash);
  if (!valid) return false;

  await pool.query(
    `UPDATE "AdminOtp" SET used = true WHERE id = $1`,
    [record.id]
  );

  return true;
}

export async function updateAdminLastActivity(adminId: string): Promise<void> {
  await pool.query(
    `UPDATE "RefreshToken" SET "lastUsedAt" = NOW()
     WHERE "userId" = $1 AND "userType" = 'ADMIN' AND revoked = false`,
    [adminId]
  );
}
