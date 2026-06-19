// Meta (Facebook) Pixel helpers. The base pixel + initial PageView are loaded
// in index.html; these helpers fire additional events from the SPA. All calls
// are no-ops if fbq isn't loaded (e.g. blocked by an ad blocker), so they never
// throw.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function pixelTrack(event: string, params?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (params) window.fbq("track", event, params);
    else window.fbq("track", event);
  }
}

/** Fire a PageView — used on SPA route changes (initial load fires in index.html). */
export function pixelPageView(): void {
  pixelTrack("PageView");
}

export {};
