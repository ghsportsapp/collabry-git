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

/**
 * Signup completion. Pushes three names for the same action:
 *
 *   - `signup_completed` — our original name, kept so GTM triggers built
 *     against it keep firing.
 *   - `brand_signup` / `creator_signup` — audience-specific, so each side can
 *     get its own trigger and conversion without a user_type condition.
 *   - `sign_up` — GA4's recommended event name, which is what a default
 *     GA4/Google Ads setup looks for.
 *
 * They are distinct event names, so this does not double-count a single
 * conversion — each tag fires on exactly one of them.
 */
export function trackSignup(
  userType: "BRAND" | "CREATOR",
  params: Record<string, unknown> = {},
): void {
  const payload = { user_type: userType, method: "email", ...params };
  trackEvent("signup_completed", payload);
  trackEvent(userType === "BRAND" ? "brand_signup" : "creator_signup", payload);
  trackEvent("sign_up", payload);
}

/** A single line item in a GA4 ecommerce payload. */
export interface EcommerceItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  price?: number;
  quantity?: number;
}

/**
 * A completed payment, in GA4 ecommerce shape.
 *
 * Pushes `payment_success` (our original name) plus a standard `purchase`
 * event carrying an `ecommerce` object — the latter is what GA4 and Google Ads
 * conversion tags read for revenue. `ecommerce: null` is pushed first because
 * GTM's built-in ecommerce variables resolve against the most recent
 * `ecommerce` object on the dataLayer, so without the reset a previous
 * purchase's items can leak into this one on an SPA route change.
 */
export function trackPurchase(purchase: {
  /** Unique per transaction — GA4 dedupes on this. */
  transactionId: string | null;
  value?: number;
  currency?: string;
  /** "credits" | "deal" — what was bought. */
  context: string;
  dealId?: string | null;
  items: EcommerceItem[];
}): void {
  const { transactionId, value, currency = "INR", context, dealId, items } = purchase;
  const hasValue = typeof value === "number" && Number.isFinite(value);

  trackEvent("payment_success", {
    currency,
    ...(hasValue ? { value } : {}),
    context,
    order_id: transactionId,
    deal_id: dealId ?? null,
  });

  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({
    event: "purchase",
    ecommerce: {
      ...(transactionId ? { transaction_id: transactionId } : {}),
      currency,
      ...(hasValue ? { value } : {}),
      items,
    },
    context,
    deal_id: dealId ?? null,
  });
}

export {};
