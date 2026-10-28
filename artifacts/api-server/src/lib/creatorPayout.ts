import { pool } from "@workspace/db";

// What a creator actually receives: the agreed value minus the platform
// commission. Same formula the deal routes use (subtotal * (1 - rate/100)),
// kept here so the WhatsApp copy quotes the figure creators see in the app.

const DEFAULT_COMMISSION_PERCENT = 5;

/** Current platform commission (%), from PlatformConfig; 5 when unset. */
export async function readCommissionRate(): Promise<number> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key='commission_rate'`);
  const n = parseFloat(r.rows[0]?.value);
  return isNaN(n) ? DEFAULT_COMMISSION_PERCENT : n;
}

/** Whole-rupee creator payout for a gross amount at a commission rate (%). */
export function payoutAfterCommission(gross: number, commissionPercent: number): number {
  return Math.round(gross * (1 - commissionPercent / 100));
}
