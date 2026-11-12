import type { Request, Response, NextFunction } from "express";
import { requireAdminAuth, type AdminContext } from "./requireAdminAuth";

/**
 * Single path-scoped RBAC gate for the whole `/admin/*` surface (Phase 2 cutover).
 *
 * The admin sub-routers are all mounted at root (`router.use(subRouter)`), so a
 * per-router `.use()` guard would run on unrelated requests too. Instead this one
 * middleware, mounted once ahead of the admin routers, authenticates every
 * `/admin/*` request (real JWT via requireAdminAuth) and then checks the section
 * that owns the path — the centralized equivalent of attaching
 * requireAdminAuth + requireSection to each router, driven by the approved §2 map.
 *
 * Rules:
 *   • Non-/admin paths pass straight through (brand/creator/public untouched).
 *   • /auth/admin/* is NOT matched here (login is public; /me and /section-check
 *     carry their own requireAdminAuth).
 *   • Super admins bypass all section checks.
 *   • `/admin/search/filter-options` is shared read-only option data — open to
 *     any authenticated admin.
 *   • partial-profile-visibility + manage-admins are super-admin only.
 *   • Unmapped /admin/* paths fail CLOSED (super-admin only) — safe by default.
 *
 * Cross-link rule (Phase 3) falls out for free: /admin/creators is owned by
 * creator-onboarding and /admin/brands by brand-onboarding, so a deal/campaign
 * admin without the onboarding section gets 403 when opening a profile.
 */

type Decision =
  | { kind: "open" }
  | { kind: "super" }
  | { kind: "section"; sections: string[] };

// Open to any authenticated admin.
const OPEN_PREFIXES = ["/admin/search/filter-options"];

// Reserved to super admins (not grantable sections).
// deal-discount sets a brand-payment discount that can push the platform take
// below commission / negative, so it is super-admin only — distinct from the
// deal-management-gated /admin/deals surface.
const SUPER_PREFIXES = ["/admin/partial-profile-visibility", "/admin/manage-admins", "/admin/deal-discount"];

// Landing content + team members are shared by the three landing editors.
const LANDING_FAMILY = ["landing", "brand-landing", "creator-landing"];

// path prefix → owning section(s). Longest prefix wins. Mirrors SECTION_ROUTE_GROUPS
// (adminSections.ts) with the approved final decisions baked in.
const SECTION_PREFIXES: Array<{ prefix: string; sections: string[] }> = [
  // creator-onboarding
  { prefix: "/admin/creators", sections: ["creator-onboarding"] },
  { prefix: "/admin/creator-reports", sections: ["creator-onboarding"] },
  { prefix: "/admin/creator-signup-config", sections: ["creator-onboarding"] },
  { prefix: "/admin/creator-signup-fields", sections: ["creator-onboarding"] },
  { prefix: "/admin/fun-questions", sections: ["creator-onboarding"] },
  { prefix: "/admin/rejection-reasons", sections: ["creator-onboarding"] },
  { prefix: "/admin/kyc-fields", sections: ["creator-onboarding"] },
  { prefix: "/admin/kyc-requests", sections: ["creator-onboarding"] },
  { prefix: "/admin/audience-fields", sections: ["creator-onboarding"] },
  { prefix: "/admin/signup-config", sections: ["creator-onboarding"] },
  // brand-onboarding
  { prefix: "/admin/brands", sections: ["brand-onboarding"] },
  { prefix: "/admin/brand-signup-fields", sections: ["brand-onboarding"] },
  { prefix: "/admin/default-field-config", sections: ["brand-onboarding"] },
  { prefix: "/admin/unified-field-order", sections: ["brand-onboarding"] },
  // credits
  { prefix: "/admin/config/credits", sections: ["credits"] },
  { prefix: "/admin/credits", sections: ["credits"] },
  { prefix: "/admin/credit-purchases", sections: ["credits"] },
  // categories
  { prefix: "/admin/categories", sections: ["categories"] },
  { prefix: "/admin/subcategories", sections: ["categories"] },
  { prefix: "/admin/category-messages", sections: ["categories"] },
  // pricing
  { prefix: "/admin/slabs", sections: ["pricing"] },
  { prefix: "/admin/slab-messages", sections: ["pricing"] },
  // campaign-management
  { prefix: "/admin/campaigns", sections: ["campaign-management"] },
  { prefix: "/admin/barter", sections: ["campaign-management"] },
  { prefix: "/admin/campaign-settings", sections: ["campaign-management"] },
  // deal-management
  { prefix: "/admin/deals", sections: ["deal-management"] },
  { prefix: "/admin/deal-settings", sections: ["deal-management"] },
  { prefix: "/admin/deal-reports", sections: ["deal-management"] },
  { prefix: "/admin/deal-stage-events", sections: ["deal-management"] },
  { prefix: "/admin/deal-tutorial-video", sections: ["deal-management"] },
  { prefix: "/admin/shipping-settings", sections: ["deal-management"] },
  { prefix: "/admin/commission-rate", sections: ["deal-management"] },
  { prefix: "/admin/gst-rate", sections: ["deal-management"] },
  { prefix: "/admin/revision-reasons", sections: ["deal-management"] },
  { prefix: "/admin/info-messages", sections: ["deal-management"] },
  { prefix: "/admin/non-delivery-alerts", sections: ["deal-management"] },
  { prefix: "/admin/ratings", sections: ["deal-management"] },
  { prefix: "/admin/invoices", sections: ["deal-management"] },
  // matchmaking
  { prefix: "/admin/matchmaking", sections: ["matchmaking"] },
  // chatbot
  { prefix: "/admin/chatbot", sections: ["chatbot"] },
  // about-us / legal / white-glove / advertisement
  { prefix: "/admin/about-us", sections: ["about-us"] },
  { prefix: "/admin/legal", sections: ["legal"] },
  { prefix: "/admin/white-glove", sections: ["white-glove"] },
  { prefix: "/admin/ads", sections: ["advertisement"] },
  { prefix: "/admin/ad-leads", sections: ["advertisement"] },
  { prefix: "/admin/advertise", sections: ["advertisement"] },
  // landing family (shared by the three landing editors)
  { prefix: "/admin/landing-content", sections: LANDING_FAMILY },
  { prefix: "/admin/landing-videos", sections: ["landing-videos"] },
  { prefix: "/admin/team-members", sections: LANDING_FAMILY },
].sort((a, b) => b.prefix.length - a.prefix.length); // longest prefix wins

function classify(path: string): Decision {
  if (OPEN_PREFIXES.some((p) => path === p || path.startsWith(p))) return { kind: "open" };
  if (SUPER_PREFIXES.some((p) => path === p || path.startsWith(p))) return { kind: "super" };
  const hit = SECTION_PREFIXES.find((e) => path === e.prefix || path.startsWith(e.prefix + "/") || path.startsWith(e.prefix));
  if (hit) return { kind: "section", sections: hit.sections };
  return { kind: "super" }; // unmapped → fail closed
}

export function adminGuard(req: Request, res: Response, next: NextFunction): void {
  const path = req.path.replace(/^\/api/, "");
  if (!path.startsWith("/admin/")) { next(); return; }

  const decision = classify(path);

  // Every /admin/* request must carry a valid admin JWT. requireAdminAuth sends
  // its own 401/403 on failure and only invokes this callback on success.
  void requireAdminAuth(req, res, () => {
    const admin = (req as any).admin as AdminContext | undefined;
    if (!admin) { res.status(401).json({ error: "Admin authentication required" }); return; }
    if (admin.isSuperAdmin) { next(); return; }
    if (decision.kind === "open") { next(); return; }
    if (decision.kind === "section" && decision.sections.some((s) => admin.allowedSections.includes(s))) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden: section not allowed" });
  });
}
