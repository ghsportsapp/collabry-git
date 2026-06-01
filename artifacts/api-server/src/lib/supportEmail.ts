import { pool } from "@workspace/db";

const FALLBACK = "support@collabry.in";

export async function getSupportEmail(): Promise<string> {
  try {
    const result = await pool.query(
      `SELECT value FROM "PlatformConfig" WHERE key='about_us_content'`
    );
    if (result.rows.length > 0) {
      const parsed = JSON.parse(result.rows[0].value) as Record<string, unknown>;
      if (typeof parsed.contactEmail === "string" && parsed.contactEmail.trim()) {
        return parsed.contactEmail.trim();
      }
    }
  } catch { /* fall through to fallback */ }
  return FALLBACK;
}
