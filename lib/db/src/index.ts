import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Parse the URL ourselves so we can fully control SSL config.
// Managed Postgres providers (Aiven/Akamai, Neon, Render, Supabase, etc.)
// serve TLS with their own internal CA. When `sslmode=require` is in the URL,
// pg's auto-merging causes it to verify the chain anyway — so we strip
// sslmode and pass ssl explicitly.
//
// To swap in strict CA verification later: download the provider's CA bundle
// and replace `{ rejectUnauthorized: false }` with `{ ca: readFileSync(...) }`.
function buildPoolConfig(url: string): pg.PoolConfig {
  const u = new URL(url);
  const sslMode = u.searchParams.get("sslmode");
  const wantsSsl =
    sslMode !== null && sslMode !== "disable" && sslMode !== "allow";
  u.searchParams.delete("sslmode");
  u.searchParams.delete("ssl");
  return {
    connectionString: u.toString(),
    ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
export const db = drizzle(pool, { schema });

export * from "./schema";
