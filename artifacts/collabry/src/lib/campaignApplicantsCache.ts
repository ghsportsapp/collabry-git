import type { CreatorFilters } from "@/components/CreatorFilterBar";
import { EMPTY_CREATOR_FILTERS } from "@/components/CreatorFilterBar";

/* Opening a creator profile is a route change, so the campaign detail page
   unmounts and loses its filters, page and scroll offset. Same mechanism as the
   search and matchmaking caches, under its own key so none of the three can
   clobber another.

   The payload is scoped to one campaign AND one tab: returning to a different
   campaign, or a different tab of the same one, must start clean rather than
   inherit someone else's page number. */

const CACHE_KEY = "collabry_brand_campaign_applicants_v1";

export type CampaignKind = "paid" | "barter";

export interface CampaignApplicantsCache {
  /** kind + campaign id + tab index — the scope this snapshot belongs to. */
  scope: string;
  filters: CreatorFilters;
  page: number;
  scrollY: number;
  /** Set only when leaving for a creator profile. A fresh arrival must open
   *  clean at page 1, so this gates the whole restore, not just the offset. */
  returning: boolean;
}

export function campaignScope(kind: CampaignKind, campaignId: string, tab: number): string {
  return `${kind}:${campaignId}:${tab}`;
}

/** Returns the snapshot only when it belongs to the scope being opened. */
export function readCampaignCache(scope: string): CampaignApplicantsCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CampaignApplicantsCache;
    if (!c?.filters || typeof c.page !== "number") return null; // stale shape
    return c.scope === scope ? c : null;
  } catch { return null; }
}

/**
 * Which tab to open on arrival, when a profile trip is pending for this
 * campaign. The snapshot is scoped per tab, so without reopening the tab it was
 * taken on, the scope wouldn't match and nothing would restore.
 */
export function readReturnTab(kind: CampaignKind, campaignId: string): number | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CampaignApplicantsCache;
    if (!c?.returning || typeof c.scope !== "string") return null;
    const [k, id, tab] = c.scope.split(":");
    if (k !== kind || id !== campaignId) return null;
    const n = Number(tab);
    return Number.isInteger(n) ? n : null;
  } catch { return null; }
}

export function writeCampaignCache(c: CampaignApplicantsCache) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota — non-fatal */ }
}

export function clearCampaignCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

export { EMPTY_CREATOR_FILTERS };
