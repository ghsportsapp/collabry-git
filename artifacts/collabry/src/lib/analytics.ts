// Google Tag Manager dataLayer helpers. GTM base snippet + the initial page_view
// are loaded in index.html; these helpers push additional events + user context
// from the SPA. All calls are no-ops if dataLayer isn't present (blocked by an
// ad blocker, or SSR context), so they never throw.
//
// Mirrors the shape of `pixel.ts` — one call site, both platforms fire.

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** Push an event to the dataLayer. Extra params flatten onto the same object. */
export function trackEvent(event: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

/** Fire a page_view — used on SPA route changes. Initial load also pushes one. */
export function trackPageView(pagePath: string): void {
  trackEvent("page_view", {
    page_path: pagePath,
    page_location: typeof window !== "undefined" ? window.location.href : pagePath,
    page_title: typeof document !== "undefined" ? document.title : undefined,
  });
}

/**
 * Push user identity + type onto the dataLayer so downstream tags (GA4, Meta,
 * Google Ads) can attribute later events to a known user. Call on login and
 * signup completion. The variables persist until page reload; call again on
 * every session start.
 */
export function identifyUser(
  userId: string,
  userType: "BRAND" | "CREATOR" | "ADMIN",
): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ user_id: userId, user_type: userType });
}

export {};
