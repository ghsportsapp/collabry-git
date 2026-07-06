#!/usr/bin/env node
// Delete a Creator account (and its dependents) by email.
//
// Usage:
//   DATABASE_URL=... node scripts/deleteCreator.mjs <email>          # dry-run
//   DATABASE_URL=... node scripts/deleteCreator.mjs <email> --yes    # actually delete
//
// The script prints how many rows will be removed from each dependent table,
// then either exits (dry-run) or executes everything in a single transaction.
// It refuses to delete if the creator has any Deals — those need manual review.

// `pg` isn't a direct dep of @workspace/api-server — it's pulled in via
// @workspace/db. In pnpm's isolated node_modules layout that means Node can't
// resolve it from this script's directory. Borrow lib/db's resolver instead,
// so we don't have to add a redundant dep + relock.
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../../..");
const requireFromDb = createRequire(path.join(workspaceRoot, "lib/db/package.json"));
const pg = requireFromDb("pg");

const EMAIL = process.argv[2];
const YES = process.argv.includes("--yes");

if (!EMAIL) {
  console.error("Usage: node scripts/deleteCreator.mjs <email> [--yes]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL env var is required");
  process.exit(1);
}

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

const pool = new pg.Pool(buildPoolConfig(process.env.DATABASE_URL));

// Tables that reference the creator directly. Order = safe delete order
// (children before parents). Notification / RefreshToken use userId + userType.
const DEPENDENTS = [
  { table: "CreatorRating",           column: "creatorId" },
  { table: "CreatorReport",           column: "creatorId" },
  { table: "ReportedVideo",           column: "creatorId" },
  { table: "BrandUnlockRecord",       column: "creatorId" },
  { table: "CampaignApplication",     column: "creatorId" },
  { table: "BarterApplication",       column: "creatorId" },
  { table: "DealRequest",             column: "creatorId" },
  { table: "KYCData",                 column: "creatorId" },
  { table: "CreatorKyc",              column: "creatorId" },
  { table: "CreatorCustomFieldValue", column: "creatorId" },
  { table: "Notification",            column: "userId", userType: "CREATOR" },
  { table: "RefreshToken",            column: "userId", userType: "CREATOR" },
];

function whereClause(dep) {
  return dep.userType
    ? `"${dep.column}"=$1 AND "userType"=$2`
    : `"${dep.column}"=$1`;
}
function whereParams(dep, creatorId) {
  return dep.userType ? [creatorId, dep.userType] : [creatorId];
}

async function tableExists(name) {
  const r = await pool.query(
    `SELECT to_regclass($1) AS oid`,
    [`public."${name}"`]
  );
  return r.rows[0].oid !== null;
}

async function main() {
  const found = await pool.query(
    `SELECT id, "fullName", email, phone, "instagramHandle" FROM "Creator" WHERE LOWER(email)=LOWER($1)`,
    [EMAIL]
  );
  if (found.rows.length === 0) {
    console.log(`No Creator row matches email ${EMAIL}. Nothing to do.`);
    await pool.end();
    return;
  }
  const creator = found.rows[0];
  const creatorId = creator.id;
  console.log(`Creator found:`);
  console.log(`  id              = ${creatorId}`);
  console.log(`  fullName        = ${creator.fullName}`);
  console.log(`  email           = ${creator.email}`);
  console.log(`  phone           = ${creator.phone}`);
  console.log(`  instagramHandle = ${creator.instagramHandle}`);

  // Deal has children (DealDeliverable etc.) — refuse if any exist.
  const deals = await pool.query(
    `SELECT id FROM "Deal" WHERE "creatorId"=$1`,
    [creatorId]
  );
  if (deals.rows.length > 0) {
    console.error(
      `\nRefusing to delete: creator has ${deals.rows.length} Deal row(s). ` +
      `Clean those up manually first (they have children in DealDeliverable/DealDispute/ProductIssueReport/Payout).`
    );
    await pool.end();
    process.exit(2);
  }

  console.log(`\nDependent row counts:`);
  const filtered = [];
  for (const dep of DEPENDENTS) {
    if (!(await tableExists(dep.table))) {
      console.log(`  ${dep.table.padEnd(28)}  (table missing — skipping)`);
      continue;
    }
    const c = await pool.query(
      `SELECT COUNT(*)::int AS n FROM "${dep.table}" WHERE ${whereClause(dep)}`,
      whereParams(dep, creatorId)
    );
    console.log(`  ${dep.table.padEnd(28)}  ${c.rows[0].n}`);
    filtered.push(dep);
  }

  if (!YES) {
    console.log(
      `\nDry-run. Re-run with --yes to delete the creator and all rows above.`
    );
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const dep of filtered) {
      const r = await client.query(
        `DELETE FROM "${dep.table}" WHERE ${whereClause(dep)}`,
        whereParams(dep, creatorId)
      );
      console.log(`  deleted ${r.rowCount} from ${dep.table}`);
    }
    // Cascades: CreatorCategory / CreatorPortfolio / CreatorFunAnswer.
    const cr = await client.query(`DELETE FROM "Creator" WHERE id=$1`, [creatorId]);
    console.log(`  deleted ${cr.rowCount} Creator row`);
    await client.query("COMMIT");
    console.log(`\nDone. ${EMAIL} can now sign up fresh.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`\nRolled back:`, err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
