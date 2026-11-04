/**
 * Admin RBAC section catalogue + the section → backend route-group map.
 *
 * DORMANT in Phase 1: this is configuration only. Nothing imports it into a live
 * router yet. Phase 2 will use SECTION_ROUTE_GROUPS to attach requireSection(...)
 * to each admin router, and SUPER_ADMIN_ONLY for routes no delegated admin may
 * reach. Reflects the approved §2 map with the final decisions:
 *   kyc-*, audience-fields          → creator-onboarding
 *   info-messages                   → deal-management
 *   partial-profile-visibility      → super-admin-only
 *   platform-settings               → super-admin-only
 *   manage-admins                   → super-admin-only (never grantable)
 */

/** Section keys a super admin may grant to a delegated admin. */
export const ADMIN_SECTION_KEYS = [
  "landing",
  "brand-landing",
  "creator-landing",
  "brand-onboarding",
  "credits",
  "categories",
  "about-us",
  "white-glove",
  "advertisement",
  "legal",
  "creator-onboarding",
  "pricing",
  "campaign-management",
  "deal-management",
  "matchmaking",
  "landing-videos",
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTION_KEYS)[number];

/**
 * Capabilities reserved to super admins — not grantable, not in the section
 * catalogue. Phase 2 gates these behind `req.admin.isSuperAdmin` directly.
 */
export const SUPER_ADMIN_ONLY = [
  "manage-admins",
  "partial-profile-visibility",
  "platform-settings",
] as const;

/**
 * section → backend path prefixes it owns. Phase 2 reads this to attach
 * requireSection(section) to matching admin routers. Prefixes are matched under
 * the `/api` mount (e.g. "/admin/creators" covers "/api/admin/creators/:id").
 * `/admin/search/filter-options` is intentionally omitted — it's shared,
 * read-only option data available to any authenticated admin.
 */
export const SECTION_ROUTE_GROUPS: Record<AdminSectionKey, string[]> = {
  "landing": ["/admin/landing-content"],
  "brand-landing": ["/admin/landing-content"],
  "creator-landing": ["/admin/landing-content"],
  "brand-onboarding": ["/admin/brands", "/admin/brand-signup-fields"],
  "credits": ["/admin/config/credits", "/admin/credits/gift", "/admin/credit-purchases"],
  "categories": ["/admin/categories", "/admin/subcategories", "/admin/category-messages"],
  "about-us": ["/admin/about-us"],
  "white-glove": ["/admin/white-glove"],
  "advertisement": ["/admin/ads", "/admin/ad-leads", "/admin/advertise/purchases", "/admin/advertise-brand"],
  "legal": ["/admin/legal"],
  "creator-onboarding": [
    "/admin/creators",
    "/admin/fun-questions",
    "/admin/rejection-reasons",
    "/admin/creator-reports",
    "/admin/creator-signup-config",
    "/admin/creator-signup-fields",
    "/admin/kyc-fields",
    "/admin/kyc-requests",
    "/admin/audience-fields",
    "/admin/signup-config/audience-fields",
  ],
  "pricing": ["/admin/slabs", "/admin/slab-messages"],
  "campaign-management": ["/admin/campaigns", "/admin/barter", "/admin/campaign-settings"],
  "deal-management": [
    "/admin/deals",
    "/admin/deal-settings",
    "/admin/shipping-settings",
    "/admin/commission-rate",
    "/admin/gst-rate",
    "/admin/deal-tutorial-video",
    "/admin/deal-stage-events",
    "/admin/deal-reports",
    "/admin/revision-reasons",
    "/admin/info-messages",
  ],
  "matchmaking": ["/admin/matchmaking"],
  "landing-videos": ["/admin/landing-videos"],
};

/**
 * Cross-section data links. Viewing a person's full profile always requires that
 * person's onboarding section, regardless of which screen linked to it — so a
 * Deal/Campaign admin without the onboarding section gets a 403 here and the UI
 * masks/unlinks the name. Phase 2 attaches requireSection(gatedBy) to these.
 */
export const PROFILE_CROSS_LINKS = [
  { resource: "/admin/creators/:id", gatedBy: "creator-onboarding" as const },
  { resource: "/admin/brands/:id", gatedBy: "brand-onboarding" as const },
] as const;
