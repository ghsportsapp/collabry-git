/**
 * Admin review panels (creator / brand onboarding) are reachable two ways:
 * from the admin dashboard, and deep-linked from another admin screen such as
 * Deal Management. When deep-linked, the caller passes ?returnTo=<path> so
 * Back goes where admin actually came from instead of the onboarding home.
 *
 * No path is hardcoded here — the value comes from the calling screen.
 */

/** The ?returnTo= target for this page load, or null if not deep-linked. */
export function readReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return null;
  // Same-origin, absolute-path only: never let a query param bounce admin to
  // another site or to a protocol-relative URL.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

/**
 * Go back to wherever admin came from.
 * `fallback` is used when the page was opened directly (no returnTo).
 */
export function goBack(navigate: (to: string) => void, fallback: string): void {
  const target = readReturnTo();
  navigate(target ?? fallback);
}
