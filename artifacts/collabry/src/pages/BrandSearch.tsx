import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Users, ChevronDown, Check, X, Search as SearchIcon,
  MapPin, Calendar, Film, UserCheck, Target, BarChart2,
  BookOpen, FileText, UserRound, Lock,
} from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";
import UnlockCelebration from "@/components/UnlockCelebration";

const CARD_BG = "#2D0D1F";
const CARD_BOTTOM_BG = "#430B26";
const FILTER_BG = "#16161B";

interface Slab { id: string; label: string; minFollowers: number; maxFollowers: number | null; }
interface Category { id: string; name: string; }
interface AgeBucket { label: string; min: number; max: number; }
interface FilterOptions {
  slabs: Slab[];
  categories: Category[];
  creatorAges: AgeBucket[];
  creatorContentTypes: string[];
  creatorGenders: string[];
  audienceAges: string[];
  audienceLocations: string[];
  creatorStates: string[];
  creatorImagesEnabled?: boolean;
}
interface CreatorPartial {
  id: string; followerCount: number;
  profilePhotoUrl: string | null; fullName: string | null;
  images: string[];
  audienceGenderFemale: number | null; audienceGenderMale: number | null;
  audienceAge: string | null; audienceLocation: string | null;
  state: string | null;
  gender: string | null; creatorAge: number | null;
  averageRating: number | null; ratingCount: number;
  reelPriceMin: number | null; reelPriceMax: number | null;
  storyPriceMin: number | null; storyPriceMax: number | null;
  postPriceMin: number | null; postPriceMax: number | null;
  isUnlocked: boolean;
  categories: Array<{ id: string; name: string }>;
}
interface Filters {
  slabIds: string[]; categoryIds: string[]; creatorAges: string[];
  creatorGenders: string[];
  audienceAges: string[]; audienceLocations: string[];
  creatorStates: string[];
}
const EMPTY_FILTERS: Filters = {
  slabIds: [], categoryIds: [], creatorAges: [],
  creatorGenders: [], audienceAges: [], audienceLocations: [], creatorStates: [],
};

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toString();
}
function toggle<T>(arr: T[], v: T): T[] { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }

/* Opening a creator profile is a route change, so this page unmounts and loses
   everything. Park the search in sessionStorage on the way out and seed state
   back from it on the way in, so "Back to Search" lands the brand on the same
   creator instead of a reset list. Session-scoped on purpose: it should not
   outlive the tab. */
const SEARCH_CACHE_KEY = "collabry_brand_search_v1";

interface SearchCache {
  filters: Filters;
  creators: CreatorPartial[];
  page: number;
  total: number;
  totalPages: number;
  scrollY: number;
  /** Only set when the brand left for a creator profile. A deliberate fresh
   *  visit to Search restores the filters but must not yank them down the page. */
  restoreScroll: boolean;
}

function readSearchCache(): SearchCache | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SearchCache;
    // Guard against a stale shape written by an earlier deploy.
    return Array.isArray(c?.creators) && c?.filters ? c : null;
  } catch { return null; }
}

function writeSearchCache(c: SearchCache) {
  try { sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(c)); } catch { /* quota — non-fatal */ }
}

export default function BrandSearch() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const { total: credits, setTotal: setCreditsTotal } = useBrandCredits();
  // Read once, before first paint, so the restored list is already on screen
  // when the scroll position is reapplied below.
  const [cached] = useState(readSearchCache);
  const [opts, setOpts] = useState<FilterOptions | null>(null);
  const [creators, setCreators] = useState<CreatorPartial[]>(cached?.creators ?? []);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(cached?.page ?? 1);
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [filters, setFilters] = useState<Filters>(cached?.filters ?? EMPTY_FILTERS);
  const [openPill, setOpenPill] = useState<string | null>(null);
  const [unlockModal, setUnlockModal] = useState<CreatorPartial | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [celeb, setCeleb] = useState<{ show: boolean; username: string | null; fullName: string | null }>({ show: false, username: null, fullName: null });

  useEffect(() => { if (!authLoading && !brandId) navigate("/login-brand"); }, [brandId, authLoading, navigate]);

  useEffect(() => {
    if (!brandId) return;
    apiFetch("/api/brand/search/filter-options", { cache: "no-store" }).then(async r => {
      if (r.ok) setOpts(await r.json());
    });
  }, [brandId, apiFetch]);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(page)); p.set("limit", "20"); p.set("sort", "followers");
    filters.slabIds.forEach(id => p.append("slabId", id));
    filters.categoryIds.forEach(c => p.append("category", c));
    filters.creatorAges.forEach(a => p.append("creatorAge", a));
    filters.creatorGenders.forEach(g => p.append("creatorGender", g));
    filters.audienceAges.forEach(a => p.append("audienceAge", a));
    filters.audienceLocations.forEach(l => p.append("audienceLocation", l));
    filters.creatorStates.forEach(st => p.append("creatorState", st));
    return p.toString();
  }, [page, filters]);

  const reqId = useRef(0);
  useEffect(() => {
    if (!brandId) return;
    const myReq = ++reqId.current;
    setLoading(true);
    apiFetch(`/api/brand/search/creators-all?${buildQuery()}`)
      .then(async r => {
        if (myReq !== reqId.current) return;
        if (r.ok) { const d = await r.json(); setCreators(d.creators); setTotal(d.total); setTotalPages(d.totalPages); }
      })
      .finally(() => { if (myReq === reqId.current) setLoading(false); });
  }, [brandId, buildQuery, apiFetch]);

  /* ── Search state persistence (survives the trip to a creator profile) ── */

  // The unmount cleanup closes over its first render, so mirror live values.
  const latest = useRef({ filters, creators, page, total, totalPages });
  latest.current = { filters, creators, page, total, totalPages };

  const persist = useCallback((scrollY: number, restoreScroll: boolean) => {
    writeSearchCache({ ...latest.current, scrollY, restoreScroll });
  }, []);

  const leavingForProfile = useRef(false);
  const openProfile = useCallback((id: string) => {
    /* Snapshot the offset here, synchronously, rather than on unmount: the
       app-wide <ScrollToTop> resets window.scrollY in a layout effect on every
       location change, so by the time this page tears down the offset is 0. */
    persist(window.scrollY, true);
    leavingForProfile.current = true;
    navigate(`/home-brand/search/creator/${id}`);
  }, [navigate, persist]);

  useEffect(() => () => {
    // Leaving anywhere else: keep the filters/list for the session, but this is
    // not a return trip, so no scroll offset. (openProfile already wrote one.)
    if (leavingForProfile.current) return;
    persist(0, false);
  }, [persist]);

  /* Reapply the saved offset. Mount-only on purpose: this polls for the page to
     be ready rather than depending on auth/list state, because a dependency
     changing mid-restore would run this effect's cleanup and cancel the
     in-flight loop. */
  useLayoutEffect(() => {
    if (!cached?.restoreScroll) return;
    const target = cached.scrollY;
    const deadline = performance.now() + 3000;
    let cancelled = false;

    const done = () => writeSearchCache({ ...cached, restoreScroll: false });

    let lastHeight = -1;
    let stableFrames = 0;
    const tick = () => {
      if (cancelled) return;
      const height = document.documentElement.scrollHeight;
      /* Only scroll once the document can actually hold the offset. This page
         renders null until auth resolves and its route chunk is lazy, so an
         early attempt would clamp to a near-zero maximum and strand the brand
         part-way up the list. Instant because index.css sets
         `html { scroll-behavior: smooth }`, which "auto" would defer to. */
      if (height - window.innerHeight >= target) {
        window.scrollTo({ top: target, behavior: "instant" });
      }
      /* Hold it there until the layout stops moving. Cards render an image row
         until filter-options arrives and tells us images are off, and that
         reflow shrinks the document — which lets scroll anchoring drag the
         offset back up if we've already stopped watching. */
      const onTarget = Math.abs(window.scrollY - target) <= 1;
      stableFrames = height === lastHeight && onTarget ? stableFrames + 1 : 0;
      lastHeight = height;

      if (stableFrames < 8 && performance.now() < deadline) requestAnimationFrame(tick);
      else done(); // land, or give up rather than leave the flag armed
    };
    tick();

    // Never fight a brand who starts scrolling before we've finished.
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

  /* A real page change starts at the first creator. Seeded with the initial
     page so neither mount nor a restored page 3 counts as a change — that path
     is handled by the scroll restore above. */
  const prevPage = useRef(page);
  useEffect(() => {
    if (prevPage.current === page) return;
    prevPage.current = page;
    // Instant for the same reason as the restore, and so the first creator is
    // on screen immediately rather than after a long animation from the bottom.
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);

  const activeFilterCount = useMemo(() =>
    filters.slabIds.length + filters.categoryIds.length + filters.creatorAges.length +
    filters.creatorGenders.length +
    filters.audienceAges.length + filters.audienceLocations.length + filters.creatorStates.length,
    [filters]
  );

  const handleUnlock = async () => {
    if (!unlockModal) return;
    setUnlocking(true); setUnlockError(null);
    try {
      const target = unlockModal;
      const r = await apiFetch(`/api/brand/creators/${unlockModal.id}/unlock`, { method: "POST" });
      if (r.ok) {
        const d = await r.json();
        setCreditsTotal(d.newBalance);
        setCreators(list => list.map(c => c.id === unlockModal.id ? { ...c, isUnlocked: true } : c));
        const id = unlockModal.id;
        setUnlockModal(null);
        setCeleb({ show: true, username: d.instagramHandle ?? null, fullName: d.fullName ?? target.fullName ?? null });
        setTimeout(() => {
          setCeleb(s => ({ ...s, show: false }));
          openProfile(id);
        }, 2000);
      } else {
        const d = await r.json();
        setUnlockError(d.message ?? d.error ?? "Unlock failed");
      }
    } catch (e: any) { setUnlockError(e.message ?? "Unlock failed"); }
    finally { setUnlocking(false); }
  };

  if (authLoading || !brandId) return null;

  function clearFilters() { setFilters(EMPTY_FILTERS); setPage(1); setOpenPill(null); }

  function getActiveLabel(key: string): string | null {
    if (key === "followers") {
      if (filters.slabIds.length === 0) return null;
      if (filters.slabIds.length === 1) {
        const s = opts?.slabs.find(sl => sl.id === filters.slabIds[0]);
        return s ? s.label : null;
      }
      return `${filters.slabIds.length} selected`;
    }
    if (key === "category") return filters.categoryIds.length > 0 ? `${filters.categoryIds.length} selected` : null;
    if (key === "creatorAge") return filters.creatorAges.length === 0 ? null : filters.creatorAges.length === 1 ? filters.creatorAges[0] : `${filters.creatorAges.length} selected`;
    if (key === "creatorGender") return filters.creatorGenders.length === 0 ? null : filters.creatorGenders.length === 1 ? filters.creatorGenders[0] : `${filters.creatorGenders.length} selected`;
    if (key === "audienceAge") return filters.audienceAges.length === 0 ? null : filters.audienceAges.length === 1 ? filters.audienceAges[0] : `${filters.audienceAges.length} selected`;
    if (key === "audienceLocation") return filters.audienceLocations.length === 0 ? null : filters.audienceLocations.length === 1 ? filters.audienceLocations[0] : `${filters.audienceLocations.length} selected`;
    if (key === "creatorState") return filters.creatorStates.length === 0 ? null : filters.creatorStates.length === 1 ? filters.creatorStates[0] : `${filters.creatorStates.length} selected`;
    return null;
  }

  const PILL_DEFS = [
    { key: "followers",        label: "Followers",               icon: <Users size={13} color={PINK} /> },
    { key: "category",         label: "Category of Content",     icon: <BarChart2 size={13} color={PINK} /> },
    { key: "creatorAge",       label: "Creator's Age",           icon: <Calendar size={13} color={PINK} /> },
    { key: "creatorGender",    label: "Creator's Gender",        icon: <UserCheck size={13} color={PINK} /> },
    { key: "audienceAge",      label: "Audience's Age",          icon: <Target size={13} color={PINK} /> },
    { key: "audienceLocation", label: "Audience's Location",     icon: <MapPin size={13} color={PINK} /> },
    { key: "creatorState",     label: "Creator's State / UT",    icon: <MapPin size={13} color={PINK} /> },
  ];

  function renderFilterContent(key: string) {
    if (key === "followers") return (
      <MultiPicker
        options={opts?.slabs.map(s => ({ value: s.id, label: `${s.label} (${formatFollowers(s.minFollowers)}${s.maxFollowers ? `–${formatFollowers(s.maxFollowers)}` : "+"})` })) ?? []}
        values={filters.slabIds}
        onToggle={v => { setFilters(f => ({ ...f, slabIds: toggle(f.slabIds, v) })); setPage(1); }} />
    );
    if (key === "category") return (
      <MultiPicker
        options={opts?.categories.map(c => ({ value: c.id, label: c.name })) ?? []}
        values={filters.categoryIds}
        onToggle={v => { setFilters(f => ({ ...f, categoryIds: toggle(f.categoryIds, v) })); setPage(1); }} />
    );
    if (key === "creatorAge") return (
      <MultiPicker
        options={opts?.creatorAges.map(a => ({ value: a.label, label: a.label })) ?? []}
        values={filters.creatorAges}
        onToggle={v => { setFilters(f => ({ ...f, creatorAges: toggle(f.creatorAges, v) })); setPage(1); }} />
    );
    if (key === "creatorGender") return (
      <MultiPicker
        options={opts?.creatorGenders.map(g => ({ value: g, label: g.charAt(0) + g.slice(1).toLowerCase() })) ?? []}
        values={filters.creatorGenders}
        onToggle={v => { setFilters(f => ({ ...f, creatorGenders: toggle(f.creatorGenders, v) })); setPage(1); }} />
    );
    if (key === "audienceAge") return (
      <MultiPicker
        options={opts?.audienceAges.map(a => ({ value: a, label: a })) ?? []}
        values={filters.audienceAges}
        onToggle={v => { setFilters(f => ({ ...f, audienceAges: toggle(f.audienceAges, v) })); setPage(1); }} />
    );
    if (key === "audienceLocation") return (
      <MultiPicker
        options={opts?.audienceLocations.map(l => ({ value: l, label: l })) ?? []}
        values={filters.audienceLocations}
        onToggle={v => { setFilters(f => ({ ...f, audienceLocations: toggle(f.audienceLocations, v) })); setPage(1); }} />
    );
    if (key === "creatorState") return (
      <StateFilterPicker
        states={opts?.creatorStates ?? []}
        values={filters.creatorStates}
        onToggle={v => { setFilters(f => ({ ...f, creatorStates: toggle(f.creatorStates, v) })); setPage(1); }} />
    );
    return null;
  }

  function buildFilterRows(keyPrefix: string) {
    return PILL_DEFS.map(pd => {
      const active = pd.key === "followers"
        ? filters.slabIds.length > 0
        : pd.key === "category" ? filters.categoryIds.length > 0
        : pd.key === "creatorAge" ? filters.creatorAges.length > 0
        : pd.key === "creatorGender" ? filters.creatorGenders.length > 0
        : pd.key === "audienceAge" ? filters.audienceAges.length > 0
        : pd.key === "audienceLocation" ? filters.audienceLocations.length > 0
        : filters.creatorStates.length > 0;

      return (
        <FilterRow
          key={`${keyPrefix}-${pd.key}`}
          label={pd.label}
          icon={pd.icon}
          active={active}
          open={openPill === pd.key}
          onToggle={() => setOpenPill(p => p === pd.key ? null : pd.key)}
          onClose={() => setOpenPill(null)}
          activeLabel={getActiveLabel(pd.key)}
        >
          {renderFilterContent(pd.key)}
        </FilterRow>
      );
    });
  }

  return (
    <BrandLayout credits={credits}>
      <UnlockCelebration
        show={celeb.show}
        username={celeb.username}
        fullName={celeb.fullName}
        subtitle="Taking you there…"
      />

      {/* ── Hero heading ── */}
      <div className="text-center pt-8 pb-8 px-4">
        <h1
          className="font-bold leading-tight"
          style={{ fontSize: "clamp(20px,5vw,44px)", color: "white", fontFamily: "'Merriweather', serif" }}
        >
          Find Your Perfect creators. Filter smart.
          <br /><span style={{ color: PINK }}>No guesswork.</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.75)", fontFamily: POPPINS }}>
          Search. Filter. Collaborate. Discover verified creators across every niche.
        </p>
      </div>

      {/* ── Main layout ── */}
      <div
        className="max-w-6xl mx-auto px-4 pb-12 lg:grid lg:items-start lg:gap-8"
        style={{ gridTemplateColumns: "280px 1fr" } as React.CSSProperties}
      >
        {/* ── Filter sidebar ── */}
        <aside className="lg:sticky lg:top-4">
          {/* Desktop card */}
          <div
            className="hidden lg:block rounded-2xl"
            style={{
              background: FILTER_BG,
              boxShadow: "0 0 16px rgba(255,255,255,0.70)",
            }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <p className="font-bold text-base" style={{ color: PINK, fontFamily: POPPINS }}>
                Filter Creator
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS, background: "none", border: "none", cursor: "pointer" }}
                >
                  <X size={11} /> Clear all
                </button>
              )}
            </div>
            <div className="px-5 pb-5 space-y-2.5">
              {buildFilterRows("desktop")}
            </div>
          </div>

          {/* Mobile inline */}
          <div className="lg:hidden mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-base" style={{ color: "white", fontFamily: POPPINS }}>
                Filter Creator
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS, background: "none", border: "none", cursor: "pointer" }}
                >
                  <X size={11} /> Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {buildFilterRows("mobile")}
            </div>
          </div>
        </aside>

        {/* ── Results column ── */}
        <div>
          <p className="text-sm font-medium mb-5" style={{ color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
            {loading
              ? "Searching…"
              : <>
                  Showing top{" "}
                  <span style={{ color: PINK, fontWeight: 700 }}>{total}</span>
                  {" "}verified Collabry creator{total === 1 ? "" : "s"} for you.
                </>
            }
          </p>

          {loading && creators.length === 0 ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} style={{ height: 300, borderRadius: 16, background: CARD_BG, opacity: 0.5 }} />
              ))}
            </div>
          ) : creators.length === 0 ? (
            <div className="text-center pt-16">
              <SearchIcon size={36} color="rgba(255,255,255,0.15)" style={{ display: "block", margin: "0 auto 12px" }} />
              <p className="font-semibold text-sm" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>No creators found</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Try adjusting your filters</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {creators.map(c => (
                <CreatorCard
                  key={c.id}
                  c={c}
                  credits={credits ?? 0}
                  imagesEnabled={opts?.creatorImagesEnabled !== false}
                  onUnlock={() => { setUnlockModal(c); setUnlockError(null); }}
                  onView={() => openProfile(c.id)}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="text-xs rounded-full px-5 py-2"
                style={{
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "none",
                  color: "rgba(255,255,255,0.90)",
                  fontFamily: POPPINS,
                  opacity: page <= 1 ? 0.4 : 1,
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                ← Prev
              </button>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="text-xs font-semibold rounded-full px-5 py-2"
                style={{
                  border: "none",
                  background: PINK,
                  color: "#fff",
                  fontFamily: POPPINS,
                  opacity: page >= totalPages ? 0.4 : 1,
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Unlock modal ── */}
      {unlockModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}
          onClick={e => { if (e.target === e.currentTarget) { setUnlockModal(null); setUnlockError(null); } }}
        >
          <div style={{ width: "100%", maxWidth: 420, background: "#15151E", borderRadius: 20, padding: "24px 20px", border: "1px solid rgba(240,24,122,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <ProfileAvatar photo={unlockModal.profilePhotoUrl} name={unlockModal.fullName} size={44} />
              <div>
                <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0, fontFamily: POPPINS }}>Unlock Full Profile</p>
                <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, margin: "2px 0 0", fontFamily: POPPINS }}>
                  {formatFollowers(unlockModal.followerCount)} followers
                </p>
              </div>
            </div>
            <div style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.18)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: POPPINS }}>Profile Unlock Cost</span>
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: POPPINS }}>1 Credit</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: POPPINS }}>Your balance</span>
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: POPPINS }}>{credits ?? 0} Credits</span>
              </div>
            </div>
            <p style={{ color: "#f59e0b", fontSize: 11, marginBottom: 8, fontFamily: POPPINS }}>
              ⚠ Credits are non-refundable once spent
            </p>
            <p style={{ color: "#fff", fontSize: 11, marginBottom: 14, fontFamily: POPPINS }}>
              Once unlocked, this profile stays accessible forever — collaborate anytime without spending another credit.
            </p>
            {unlockError && <p style={{ color: "#f87171", fontSize: 12, marginBottom: 12, fontFamily: POPPINS }}>{unlockError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setUnlockModal(null); setUnlockError(null); }}
                style={{ flex: 1, padding: "12px 0", borderRadius: 24, border: "1px solid rgba(255,255,255,0.18)", background: "none", color: "rgba(255,255,255,0.80)", fontSize: 13, cursor: "pointer", fontFamily: POPPINS }}
              >
                Cancel
              </button>
              {(credits ?? 0) < 1 ? (
                <button
                  onClick={() => navigate("/home-brand/credits")}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 24, border: "none", background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: POPPINS }}
                >
                  Buy Credits
                </button>
              ) : (
                <button
                  onClick={handleUnlock}
                  disabled={unlocking}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 24, border: "none", background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: unlocking ? 0.6 : 1, fontFamily: POPPINS }}
                >
                  {unlocking ? "Unlocking…" : "Unlock · 1 Credit"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </BrandLayout>
  );
}

// ─── Profile Avatar ────────────────────────────────────────────────────────────
function ProfileAvatar({ photo, name, size = 44 }: { photo: string | null; name: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const initial = name ? name.trim()[0]?.toUpperCase() ?? "?" : "?";
  if (photo && !err) {
    return (
      <img
        src={photo} alt={name ?? "creator"} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid rgba(240,24,122,0.30)" }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "rgba(240,24,122,0.15)", border: "1.5px solid rgba(240,24,122,0.30)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: PINK, fontSize: size * 0.38, fontWeight: 700, fontFamily: POPPINS,
    }}>
      {initial}
    </div>
  );
}

// ─── Price / Meta row helpers ──────────────────────────────────────────────────
function PriceRow({ icon: Icon, label, min, max }: { icon: React.ElementType; label: string; min: number | null; max: number | null }) {
  if (!min) return null;
  const capLabel = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: PINK }} />
      <span className="text-[11.5px] leading-tight" style={{ color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>
        <span style={{ color: "rgba(255,255,255,0.70)" }}>Pricing/ {capLabel}- </span>₹{min.toLocaleString("en-IN")}–₹{(max ?? min).toLocaleString("en-IN")}
      </span>
    </div>
  );
}

function MetaRow({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: PINK }} />
      <span className="text-[11.5px] leading-tight" style={{ color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>{text}</span>
    </div>
  );
}

// ─── Creator Card ──────────────────────────────────────────────────────────────
function CreatorCard({ c, imagesEnabled, onUnlock, onView }: {
  c: CreatorPartial; credits: number; imagesEnabled: boolean;
  onUnlock: () => void; onView: () => void;
}) {
  const cats = c.categories ?? [];
  const totalAud = (c.audienceGenderFemale ?? 0) + (c.audienceGenderMale ?? 0);
  const femPct = totalAud > 0 ? Math.round(((c.audienceGenderFemale ?? 0) / totalAud) * 100) : null;
  const malePct = femPct !== null ? 100 - femPct : null;
  const genderText = femPct !== null && malePct !== null ? `${femPct}% Female ${malePct}% Male` : null;
  const images = (c.images ?? []).slice(0, 4);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: "1px solid rgba(255,255,255,0.15)" }}>
      {/* Top info */}
      <div className="p-4">
        {/* Row 1: avatar + followers */}
        <div className="flex items-center gap-3 mb-3">
          <ProfileAvatar photo={c.profilePhotoUrl} name={c.fullName} size={48} />
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 flex-shrink-0" style={{ color: PINK }} />
            <span className="font-bold text-xl" style={{ color: "white", fontFamily: POPPINS }}>
              {formatFollowers(c.followerCount)} <span className="text-base font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>followers</span>
            </span>
          </div>
        </div>

        {/* Row 2: categories */}
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {cats.map(cat => (
              <span
                key={cat.id}
                className="px-3 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: "rgba(240,24,122,0.22)", color: "white", border: "1px solid rgba(240,24,122,0.35)", fontFamily: POPPINS }}
              >
                {cat.name}
              </span>
            ))}
          </div>
        )}

        {/* Row 3: 2-col pricing + meta */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex flex-col gap-2">
            <PriceRow icon={Film} label="Reel" min={c.reelPriceMin} max={c.reelPriceMax} />
            <PriceRow icon={BookOpen} label="Story" min={c.storyPriceMin} max={c.storyPriceMax} />
            <PriceRow icon={FileText} label="Photo" min={c.postPriceMin} max={c.postPriceMax} />
          </div>
          <div className="flex flex-col gap-2">
            {c.creatorAge != null && <MetaRow icon={UserRound} text={`Creator Age- ${c.creatorAge} years`} />}
            {genderText && <MetaRow icon={UserCheck} text={`Audience- ${genderText}`} />}
            {c.state && <MetaRow icon={MapPin} text={`Creator Location- ${c.state}, India`} />}
          </div>
        </div>
      </div>

      {/* Images row */}
      {imagesEnabled && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => {
              const src = images[i];
              return src ? (
                <div key={i} className="rounded-xl overflow-hidden aspect-square">
                  <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div key={i} className="rounded-xl aspect-square" style={{ background: "rgba(255,255,255,0.06)" }} />
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div
        className="flex items-center justify-center lg:justify-end px-4 py-3"
        style={{ background: CARD_BOTTOM_BG }}
      >
        {c.isUnlocked ? (
          <button
            type="button"
            onClick={onView}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-semibold"
            style={{ border: `1.5px solid ${PINK}`, color: PINK, fontFamily: POPPINS, background: "transparent" }}
          >
            <Check className="w-3.5 h-3.5" />
            Profile Unlocked — View Full Profile
          </button>
        ) : (
          <button
            type="button"
            onClick={onUnlock}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-semibold"
            style={{ border: "1.5px solid rgba(255,255,255,0.15)", color: "white", fontFamily: POPPINS, background: "transparent" }}
          >
            <Lock className="w-3.5 h-3.5" />
            Unlock Full Profile — 1 Credit
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Filter Row ────────────────────────────────────────────────────────────────
function FilterRow({ label, icon, active, open, onToggle, onClose, activeLabel, children }: {
  label: string; icon: React.ReactNode; active: boolean; open: boolean;
  onToggle: () => void; onClose: () => void; activeLabel: string | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep a stable ref to the latest onClose so the effect never needs it as a dependency.
  // Without this, onClose (an inline arrow) changes identity every render, causing the
  // effect to teardown/re-add the listener on every state update → creates a timing gap
  // during which clicks on options are silently dropped.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    // If this row is CSS-hidden (e.g. the mobile copy on desktop), don't attach a handler.
    // offsetParent is null for elements with display:none anywhere in their ancestor chain.
    if (ref.current && ref.current.offsetParent === null) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [open]); // intentionally excludes onClose — handled via ref above

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <p
        className="text-xs font-semibold mb-1.5"
        style={{ color: "rgba(255,255,255,0.75)", fontFamily: POPPINS }}
      >
        {label}
      </p>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 rounded-xl transition-all"
        style={{
          height: 40,
          background: active ? PINK : "transparent",
          border: `1.5px solid ${active ? "transparent" : "rgba(255,255,255,0.15)"}`,
          color: active ? "white" : "rgba(255,255,255,0.70)",
          fontFamily: POPPINS,
          cursor: "pointer",
        }}
      >
        {icon}
        <span
          className="flex-1 text-left text-xs"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {activeLabel ?? "Select"}
        </span>
        <ChevronDown
          size={14}
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 999,
            minWidth: "100%",
            maxHeight: 260,
            overflowY: "auto",
            background: "#1A1A28",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            padding: 8,
            boxShadow: "0 12px 36px rgba(0,0,0,0.60)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Pickers ───────────────────────────────────────────────────────────────────
function SinglePicker({ options, value, onChange }: { options: { value: string; label: string }[]; value: string | null; onChange: (v: string | null) => void }) {
  if (options.length === 0) return <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, padding: "8px 10px", fontFamily: POPPINS }}>No options</p>;
  return (
    <div>
      {[{ value: null as string | null, label: "Any" }, ...options.map(o => ({ ...o, value: o.value as string | null }))].map(o => (
        <button
          key={o.value ?? "__any"}
          onClick={() => onChange(o.value)}
          style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: POPPINS, color: value === o.value ? PINK : "rgba(255,255,255,0.80)" }}
        >
          {o.label}
          {value === o.value && <Check size={13} color={PINK} />}
        </button>
      ))}
    </div>
  );
}

function StateFilterPicker({ states, values, onToggle }: { states: string[]; values: string[]; onToggle: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = states.filter(s => s.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div className="px-1 pb-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search state or UT…"
          className="w-full px-3 py-1.5 rounded-lg text-xs text-white outline-none placeholder:text-white/70"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }} />
      </div>
      <div className="max-h-44 overflow-y-auto">
        {filtered.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, padding: "8px 10px", fontFamily: POPPINS }}>No match</p>
        ) : filtered.map(s => {
          const sel = values.includes(s);
          return (
            <button key={s} onClick={() => onToggle(s)}
              style={{ width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", background: sel ? "rgba(240,24,122,0.10)" : "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: POPPINS, color: sel ? PINK : "rgba(255,255,255,0.80)" }}>
              {s}
              {sel && <Check size={13} color={PINK} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiPicker({ options, values, onToggle }: { options: { value: string; label: string }[]; values: string[]; onToggle: (v: string) => void }) {
  if (options.length === 0) return <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, padding: "8px 10px", fontFamily: POPPINS }}>No options</p>;
  return (
    <div>
      {options.map(o => {
        const sel = values.includes(o.value);
        return (
          <button
            key={o.value}
            onClick={() => onToggle(o.value)}
            style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", background: sel ? "rgba(240,24,122,0.10)" : "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: POPPINS, color: sel ? PINK : "rgba(255,255,255,0.80)" }}
          >
            {o.label}
            {sel && <Check size={13} color={PINK} />}
        </button>
        );
      })}
    </div>
  );
}
