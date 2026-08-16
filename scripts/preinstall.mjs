/**
 * Cross-platform preinstall guard.
 *
 * Replaces the previous `sh -c '...'` inline script: pnpm runs lifecycle
 * scripts through cmd.exe on Windows, where `sh` is not on PATH (a Git Bash
 * install does not put it there), so the old version failed before install
 * could start. Node is guaranteed available here — it is what runs pnpm.
 *
 * Behaviour is unchanged from the shell version:
 *   1. drop stray package-lock.json / yarn.lock
 *   2. refuse to run under any client other than pnpm
 */
import { rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

for (const lockfile of ["package-lock.json", "yarn.lock"]) {
  rmSync(join(root, lockfile), { force: true });
}

// pnpm sets e.g. "pnpm/10.34.5 npm/? node/v22.12.0 win32 x64"
if (!(process.env.npm_config_user_agent ?? "").startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
