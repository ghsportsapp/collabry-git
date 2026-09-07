/* Opening a creator profile is a route change, so the matchmaking results page
   unmounts and its result-side filters, page number and scroll offset are lost.
   Same mechanism as the cache in BrandSearch.tsx, under its own key so the two
   never clobber each other. The brief and the scored list already survive in
   "mm_brief"/"mm_results", so this only carries what is local to the component.

   Lives in its own module rather than in the results page because the brief
   page has to clear it on submit, and the routes are lazily loaded — importing
   across pages would merge their chunks. */

export interface FilterState {
  gender: string;
  ages: string[];
  cats: string[];
  minScore: number;
  slabId: string | null;
}

export const EMPTY_FILTER: FilterState = {
  gender: "any", ages: [], cats: [], minScore: 0, slabId: null,
};

/** Matches the search page. */
export const MATCHMAKING_PAGE_SIZE = 20;

const MM_CACHE_KEY = "collabry_brand_matchmaking_v1";

export interface MatchmakingCache {
  filterState: FilterState;
  page: number;
  scrollY: number;
  /** Set only when leaving for a creator profile. Anything else — a fresh
   *  visit, a newly submitted brief — must open clean at page 1, so this gates
   *  the whole restore rather than just the offset. */
  returning: boolean;
}

export function readMatchmakingCache(): MatchmakingCache | null {
  try {
    const raw = sessionStorage.getItem(MM_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as MatchmakingCache;
    // Guard against a stale shape written by an earlier deploy.
    return c?.filterState && typeof c.page === "number" ? c : null;
  } catch { return null; }
}

export function writeMatchmakingCache(c: MatchmakingCache) {
  try { sessionStorage.setItem(MM_CACHE_KEY, JSON.stringify(c)); } catch { /* quota — non-fatal */ }
}

export function clearMatchmakingCache() {
  try { sessionStorage.removeItem(MM_CACHE_KEY); } catch { /* ignore */ }
}
