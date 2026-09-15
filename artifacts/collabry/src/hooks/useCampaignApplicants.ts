import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { type CreatorFilters, EMPTY_CREATOR_FILTERS, creatorFilterParams } from "@/components/CreatorFilterBar";
import {
  type CampaignKind, campaignScope, readCampaignCache, writeCampaignCache, clearCampaignCache,
} from "@/lib/campaignApplicantsCache";

/* Server-side paging + filter/page/scroll restore for a campaign's applicant
   list. Shared by the Paid and Barter detail pages so the two can't drift —
   they differ only in the endpoint segment and where a profile link points.

   Same mechanism as BrandSearch: the server filters and pages the full set, the
   client asks for one page, and the position is parked in sessionStorage on the
   way to a creator profile. */

export const APPLICANTS_PAGE_SIZE = 50;

const STATUSES = ["PENDING", "SHORTLISTED", "SELECTED"];

export function useCampaignApplicants({ kind, campaignId, tab, apiFetch, enabled }: {
  kind: CampaignKind;
  campaignId: string;
  tab: number;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  enabled: boolean;
}) {
  const [, navigate] = useLocation();
  const scope = campaignScope(kind, campaignId, tab);

  /* Read once per scope, before first paint. Only a return trip from a profile
     restores; a fresh arrival or a different tab starts clean at page 1. */
  const [cached, setCached] = useState(() => readCampaignCache(scope));
  const restoring = cached?.returning === true && cached.scope === scope;

  const [apps, setApps] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFiltersRaw] = useState<CreatorFilters>(restoring ? cached!.filters : EMPTY_CREATOR_FILTERS);
  const [page, setPage] = useState(restoring ? cached!.page : 1);

  /* Switching tabs is a different scope: drop whatever the previous tab held
     rather than carrying its page number across. */
  const lastScope = useRef(scope);
  useEffect(() => {
    if (lastScope.current === scope) return;
    lastScope.current = scope;
    setApps(null); // a different tab is a different list — show the skeleton
    const next = readCampaignCache(scope);
    setCached(next);
    setFiltersRaw(next?.returning ? next.filters : EMPTY_CREATOR_FILTERS);
    setPage(next?.returning ? next.page : 1);
  }, [scope]);

  /** A filter change re-selects the whole set, so restart at the first page. */
  const setFilters = useCallback((next: CreatorFilters) => {
    setFiltersRaw(next);
    setPage(1);
  }, []);

  const base = kind === "paid" ? "campaigns" : "barter";
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const myReq = ++reqId.current;
    setLoading(true);
    const qs = creatorFilterParams(filters);
    qs.set("status", STATUSES[tab]!);
    qs.set("page", String(page));
    qs.set("limit", String(APPLICANTS_PAGE_SIZE));
    try {
      const r = await apiFetch(`/api/brand/${base}/${campaignId}/applications?${qs}`);
      if (myReq !== reqId.current) return; // a newer request already won
      if (!r.ok) { setApps([]); setTotal(0); setTotalPages(1); return; }
      const d = await r.json();
      /* Tolerate the pre-paging shape (a bare array) so a stale API server
         doesn't blank the page while a deploy rolls out. */
      if (Array.isArray(d)) {
        setApps(d); setTotal(d.length); setTotalPages(1);
        return;
      }
      setApps(d.applications ?? []);
      setTotal(d.total ?? 0);
      setTotalPages(Math.max(1, d.totalPages ?? 1));
      if (typeof d.page === "number" && d.page !== page) setPage(d.page); // server clamped
    } catch {
      if (myReq === reqId.current) { setApps([]); }
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [enabled, apiFetch, base, campaignId, tab, page, filters]);

  /* Deliberately does NOT blank the list first. Setting apps back to null on
     every filter tweak or page turn swaps the whole tab body for a skeleton,
     which unmounts the filter bar mid-interaction — the dropdown vanishes under
     the cursor. The previous page stays on screen until the next one arrives;
     `loading` drives any affordance. Only a scope change clears it (below). */
  useEffect(() => { reload(); }, [reload]);

  /* ── Persistence ── */

  const latest = useRef({ filters, page, scope });
  latest.current = { filters, page, scope };

  const leavingForProfile = useRef(false);

  /** Park the position, then navigate. The offset is read synchronously here
   *  because the app-wide <ScrollToTop> zeroes window.scrollY on every location
   *  change, so by unmount it is already gone. */
  const openProfile = useCallback((path: string, state?: Record<string, unknown>) => {
    const l = latest.current;
    writeCampaignCache({ scope: l.scope, filters: l.filters, page: l.page, scrollY: window.scrollY, returning: true });
    leavingForProfile.current = true;
    navigate(path, state ? { state } : undefined);
  }, [navigate]);

  useEffect(() => () => {
    // Left for anywhere but a profile — drop it so the next arrival is clean.
    if (leavingForProfile.current) return;
    clearCampaignCache();
  }, []);

  /* Reapply the saved offset. Mount-only: this polls for the document to be
     tall enough rather than depending on the list state, because a dependency
     changing mid-restore would cancel the in-flight loop. */
  useLayoutEffect(() => {
    if (!cached?.returning) {
      if (cached) clearCampaignCache(); // inert leftover
      return;
    }
    const target = cached.scrollY;
    const deadline = performance.now() + 3000;
    let cancelled = false;
    const done = () => writeCampaignCache({ ...cached, returning: false });

    let lastHeight = -1;
    let stableFrames = 0;
    const tick = () => {
      if (cancelled) return;
      const height = document.documentElement.scrollHeight;
      // Instant: index.css sets `html { scroll-behavior: smooth }`, which
      // "auto" would defer to and animate.
      if (height - window.innerHeight >= target) {
        window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
      }
      const onTarget = Math.abs(window.scrollY - target) <= 1;
      stableFrames = height === lastHeight && onTarget ? stableFrames + 1 : 0;
      lastHeight = height;
      if (stableFrames < 8 && performance.now() < deadline) requestAnimationFrame(tick);
      else done();
    };
    tick();

    const stop = () => { cancelled = true; done(); };
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A real page change starts at the first applicant. Seeded with the initial
     page so neither mount nor a restored page counts as a change. */
  const prevPage = useRef(page);
  useEffect(() => {
    if (prevPage.current === page) return;
    prevPage.current = page;
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [page]);

  return { apps, total, page, totalPages, loading, filters, setFilters, setPage, reload, openProfile };
}
