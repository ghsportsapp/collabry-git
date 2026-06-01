import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Bookmark, Lock, ChevronDown, X, Check,
  Users, Film, BookOpen, FileText, UserRound, UserCheck, MapPin,
} from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";
import UnlockCelebration from "@/components/UnlockCelebration";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const CARD_BG = "#2D0D1F";
const CARD_BOTTOM_BG = "#430B26";
const FILTER_BG = "#16161B";

interface ScoreBreakdownItem { param: string; label: string; pts: number; maxPts: number; reason: string; }
interface ScoredCreator {
  creatorId: string; totalScore: number; rank: number;
  followerCount: number;
  audienceGenderFemale: number | null; audienceGenderMale: number | null;
  audienceAge: string | null; audienceLocation: string | null; contentType: string | null;
  creatorAge?: number | null;
  reelPriceMin: number | null; reelPriceMax: number | null;
  storyPriceMin: number | null; storyPriceMax: number | null;
  postPriceMin: number | null; postPriceMax: number | null;
  averageRating: number | null; ratingCount: number;
  isUnlocked: boolean;
  categories: Array<{ id: string; name: string }>;
  profilePhotoUrl?: string | null;
  images?: string[];
  scoreBreakdown?: ScoreBreakdownItem[];
}
interface Slab {
  id: string; label: string; minFollowers: number; maxFollowers: number | null;
  recReelMin: number; recReelMax: number; recStoryMin: number; recStoryMax: number;
  recPostMin: number; recPostMax: number;
}
interface ActiveFilter { filterType: string; isActive: boolean; }
interface Category { id: string; name: string; }

function fmtK(n: number) { return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n); }
function fmtSlabLabel(s: Slab) {
  const lo = s.minFollowers >= 1_000_000 ? `${s.minFollowers / 1_000_000}M` : s.minFollowers >= 1000 ? `${s.minFollowers / 1000}K` : String(s.minFollowers);
  const hi = s.maxFollowers
    ? (s.maxFollowers >= 1_000_000 ? `${s.maxFollowers / 1_000_000}M` : `${s.maxFollowers / 1000}K`)
    : "+";
  return `${lo}${s.maxFollowers ? "-" : ""}${hi}`;
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

interface FilterState { gender: string; ages: string[]; cats: string[]; minScore: number; slabId: string | null; }
const EMPTY_FILTER: FilterState = { gender: "any", ages: [], cats: [], minScore: 0, slabId: null };

interface FilterPanelProps {
  filterState: FilterState;
  setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
  categories: Category[];
  slabs: Slab[];
  activeFilters: ActiveFilter[];
  genderOptions: string[];
  ageGroupOptions: string[];
  onClose?: () => void;
  isMobile?: boolean;
}

function FilterPanel({ filterState, setFilterState, categories, slabs, activeFilters, genderOptions, ageGroupOptions, onClose, isMobile }: FilterPanelProps) {
  const [local, setLocal] = useState<FilterState>(filterState);

  const hasGender = activeFilters.some(f => f.filterType === "gender" && f.isActive);
  const hasAge = activeFilters.some(f => f.filterType === "age" && f.isActive);
  const hasCat = activeFilters.some(f => f.filterType === "category" && f.isActive);
  const hasScore = activeFilters.some(f => f.filterType === "minScore" && f.isActive);

  function pill(
    label: string, active: boolean, onClick: () => void
  ) {
    return (
      <button
        key={label}
        type="button"
        onClick={onClick}
        className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
        style={{
          background: active ? PINK : "transparent",
          border: active ? "none" : "1px solid rgba(255,255,255,0.22)",
          color: "white",
          fontFamily: POPPINS,
        }}
      >
        {label}
      </button>
    );
  }

  function apply() { setFilterState(local); onClose?.(); }
  function clear() { setLocal(EMPTY_FILTER); setFilterState(EMPTY_FILTER); onClose?.(); }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: FILTER_BG,
        boxShadow: isMobile
          ? "0 2px 12px rgba(0,0,0,0.28)"
          : "0 0 16px rgba(255,255,255,0.70)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>Filter Creator</p>
        {onClose && (
          <button onClick={onClose} type="button">
            <X className="w-5 h-5 text-white/75" />
          </button>
        )}
      </div>

      <div className="px-5 pb-5 space-y-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
        {/* Category */}
        {(hasCat || categories.length > 0) && (
          <div>
            <p className="text-white text-sm font-semibold mb-2.5" style={{ fontFamily: POPPINS }}>Category</p>
            <div className="flex flex-wrap gap-2">
              {categories.map(c =>
                pill(c.name, local.cats.includes(c.id), () =>
                  setLocal(p => ({ ...p, cats: p.cats.includes(c.id) ? p.cats.filter(x => x !== c.id) : [...p.cats, c.id] }))
                )
              )}
            </div>
          </div>
        )}

        {/* Followers / Slab */}
        {slabs.length > 0 && (
          <div>
            <p className="text-white text-sm font-semibold mb-2.5" style={{ fontFamily: POPPINS }}>Followers</p>
            <div className="flex flex-wrap gap-2">
              {slabs.map(s =>
                pill(fmtSlabLabel(s), local.slabId === s.id, () =>
                  setLocal(p => ({ ...p, slabId: p.slabId === s.id ? null : s.id }))
                )
              )}
            </div>
          </div>
        )}

        {/* Gender */}
        {hasGender && genderOptions.length > 0 && (
          <div>
            <p className="text-white text-sm font-semibold mb-2.5" style={{ fontFamily: POPPINS }}>Creator Gender</p>
            <div className="flex flex-wrap gap-2">
              {genderOptions.map(g =>
                pill(g, local.gender === g.toLowerCase(), () => setLocal(p => ({ ...p, gender: g.toLowerCase() })))
              )}
            </div>
          </div>
        )}

        {/* Age */}
        {hasAge && ageGroupOptions.length > 0 && (
          <div>
            <p className="text-white text-sm font-semibold mb-2.5" style={{ fontFamily: POPPINS }}>Creator Audience Age</p>
            <div className="flex flex-wrap gap-2">
              {ageGroupOptions.map(a =>
                pill(a, local.ages.includes(a), () =>
                  setLocal(p => ({ ...p, ages: p.ages.includes(a) ? p.ages.filter(x => x !== a) : [...p.ages, a] }))
                )
              )}
            </div>
          </div>
        )}

        {/* Min score */}
        {hasScore && (
          <div>
            <p className="text-white text-sm font-semibold mb-2.5" style={{ fontFamily: POPPINS }}>
              Minimum Score: {local.minScore}/100
            </p>
            <input
              type="range" min={0} max={100} step={5}
              value={local.minScore}
              onChange={e => setLocal(p => ({ ...p, minScore: parseInt(e.target.value) }))}
              className="w-full accent-pink-500"
            />
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          <button
            type="button" onClick={clear}
            className="flex-1 py-2.5 rounded-full text-xs font-semibold"
            style={{ border: "1.5px solid rgba(255,255,255,0.15)", color: "white", fontFamily: POPPINS }}
          >
            Clear All
          </button>
          <button
            type="button" onClick={apply}
            className="flex-1 py-2.5 rounded-full text-xs font-semibold active:scale-95 active:opacity-80 transition-transform duration-100"
            style={{ background: PINK, color: "white", fontFamily: POPPINS }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

function ProfileAvatar({ photo, size = 48 }: { photo: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  if (photo && !err) {
    return (
      <img
        src={photo} alt="" onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid rgba(240,24,122,0.30)" }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "rgba(240,24,122,0.15)", border: "1.5px solid rgba(240,24,122,0.30)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <UserRound style={{ width: size * 0.45, height: size * 0.45, color: PINK }} />
    </div>
  );
}

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

function MatchCard({
  c, onUnlock, onView,
}: { c: ScoredCreator; onUnlock: () => void; onView: () => void }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const female = c.audienceGenderFemale;
  const male = c.audienceGenderMale ?? (female !== null ? 100 - female : null);
  const genderText = female !== null && male !== null ? `${female}% Female ${male}% Male` : null;
  const images = (c.images ?? []).slice(0, 4);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: "1px solid rgba(255,255,255,0.15)" }}>
      {/* Top info */}
      <div className="p-4">
        {/* Row 1: avatar + followers + rank/score */}
        <div className="flex items-center gap-3 mb-3">
          <ProfileAvatar photo={c.profilePhotoUrl ?? null} size={48} />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Users className="w-4 h-4 flex-shrink-0" style={{ color: PINK }} />
            <span className="font-bold text-xl" style={{ color: "white", fontFamily: POPPINS }}>
              {fmtK(c.followerCount)} <span className="text-base font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>followers</span>
            </span>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="font-bold leading-none" style={{ color: PINK, fontSize: 22, fontFamily: POPPINS }}>#{c.rank}</p>
            <p className="font-bold text-xs mt-0.5" style={{ color: "white", fontFamily: POPPINS }}>{c.totalScore}/100 Match</p>
            <div className="mt-1.5 rounded-full" style={{ height: 3, background: "rgba(255,255,255,0.70)", width: 80, marginLeft: "auto", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(c.totalScore, 100)}%`, background: PINK, borderRadius: 99 }} />
            </div>
          </div>
        </div>

        {/* Row 2: category pills */}
        {c.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {c.categories.map(cat => (
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

        {/* Row 3: 2-col — pricing left, meta right */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex flex-col gap-2">
            <PriceRow icon={Film}     label="Reel"  min={c.reelPriceMin}  max={c.reelPriceMax} />
            <PriceRow icon={BookOpen} label="Story" min={c.storyPriceMin} max={c.storyPriceMax} />
            <PriceRow icon={FileText} label="Post"  min={c.postPriceMin}  max={c.postPriceMax} />
          </div>
          <div className="flex flex-col gap-2">
            {c.creatorAge != null && <MetaRow icon={UserRound} text={`Creator Age- ${c.creatorAge} years`} />}
            {genderText && <MetaRow icon={UserCheck} text={`Audience- ${genderText}`} />}
            {c.audienceLocation && <MetaRow icon={MapPin} text={`Audience Location- ${c.audienceLocation}`} />}
          </div>
        </div>
      </div>

      {/* Images row */}
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

      {/* Bottom action bar */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 gap-2"
        style={{ background: CARD_BOTTOM_BG }}
      >
        <button
          type="button"
          onClick={() => setShowBreakdown(b => !b)}
          className="flex items-center justify-center sm:justify-start gap-1 w-full sm:w-auto order-2 sm:order-1"
          style={{ color: "rgba(255,255,255,0.80)", fontFamily: POPPINS, fontSize: 12, fontWeight: 600 }}
        >
          <span className="hidden sm:inline" style={{ fontSize: 14 }}>Compatibility Report</span>
          <span className="sm:hidden">Compatibility Report</span>
          <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: showBreakdown ? "rotate(180deg)" : "none" }} />
        </button>

        {c.isUnlocked ? (
          <button
            type="button" onClick={onView}
            className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-5 py-2 rounded-full text-xs font-semibold order-1 sm:order-2"
            style={{ border: `1.5px solid ${PINK}`, color: PINK, fontFamily: POPPINS, background: "transparent" }}
          >
            <Check className="w-3.5 h-3.5" />
            Profile Unlocked — View Full Profile
          </button>
        ) : (
          <button
            type="button" onClick={onUnlock}
            className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-5 py-2 rounded-full text-xs font-semibold order-1 sm:order-2"
            style={{ border: "1.5px solid rgba(255,255,255,0.15)", color: "white", fontFamily: POPPINS, background: "transparent" }}
          >
            <Lock className="w-3.5 h-3.5" />
            Unlock Full Profile — 1 Credit
          </button>
        )}
      </div>

      {/* Score breakdown panel */}
      {showBreakdown && c.scoreBreakdown && c.scoreBreakdown.length > 0 && (
        <div className="px-4 py-3 space-y-2" style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {(() => {
            const s = c.totalScore;
            const vibe =
              s >= 80 ? { emoji: "💘", label: "Soulmate Match", quote: "The stars aligned. This creator was practically made for your campaign.", bg: "linear-gradient(90deg, rgba(240,24,122,0.18), rgba(255,180,0,0.10))", glow: true } :
              s >= 64 ? { emoji: "✨", label: "Strong Spark",    quote: "Great chemistry here — a few small differences, but the connection is real.",           bg: "rgba(240,24,122,0.13)", glow: false } :
              s >= 50 ? { emoji: "🌸", label: "Potential Romance", quote: "Not perfect on paper, but sometimes the best stories start with a little uncertainty.", bg: "rgba(240,24,122,0.09)", glow: false } :
                        { emoji: "🤍", label: "Just Friends",    quote: "The hearts aren't quite in sync — but hey, opposites sometimes surprise you.",          bg: "rgba(255,255,255,0.05)", glow: false };
            return (
              <div style={{ background: vibe.bg, border: "1px solid rgba(240,24,122,0.25)", borderRadius: 10, padding: "10px 16px" }}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span style={{ fontSize: 15 }}>{vibe.emoji}</span>
                  <span style={{ fontFamily: POPPINS, fontWeight: 700, fontSize: 14, color: PINK, ...(vibe.glow ? { textShadow: "0 0 8px rgba(255,200,0,0.5)" } : {}) }}>{vibe.label}</span>
                </div>
                <p style={{ fontFamily: POPPINS, fontSize: 13, fontStyle: "italic", color: "rgba(255,255,255,0.85)", margin: 0 }}>{vibe.quote}</p>
              </div>
            );
          })()}
          {c.scoreBreakdown.map(item => {
            const pct = item.maxPts > 0 ? item.pts / item.maxPts : 0;
            const textColor = pct === 1 ? "#4ade80" : pct >= 0.5 ? "#fbbf24" : "rgba(255,255,255,0.70)";
            return (
              <div key={item.param}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.75)", fontFamily: POPPINS }}>{item.label}</span>
                  <span className="text-[11px] font-bold" style={{ color: PINK, fontFamily: POPPINS }}>{item.pts}/{item.maxPts}</span>
                </div>
                <div className="h-1 rounded-full w-full mb-0.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: PINK }} />
                </div>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>{item.reason}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BrandMatchmakingResults() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();

  const [allResults, setAllResults] = useState<ScoredCreator[] | null>(null);
  const [briefId, setBriefId] = useState<string | null>(null);
  const [briefExpired, setBriefExpired] = useState(false);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const { credits, setCredits } = useBrandCredits();
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [genderOptions, setGenderOptions] = useState<string[]>([]);
  const [ageGroupOptions, setAgeGroupOptions] = useState<string[]>([]);
  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTER);
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [unlockModal, setUnlockModal] = useState<ScoredCreator | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [savedBriefMsg, setSavedBriefMsg] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [celebUser, setCelebUser] = useState<{ username: string | null; fullName: string | null }>({ username: null, fullName: null });

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading, navigate]);

  useEffect(() => {
    const stored = sessionStorage.getItem("mm_results");
    if (!stored) { setBriefExpired(true); return; }
    try {
      const parsed = JSON.parse(stored);
      setAllResults(parsed.results ?? []);
      setBriefId(parsed.briefId ?? null);
    } catch { setBriefExpired(true); }

    fetch(`${BASE_URL}/api/slabs`).then(r => r.ok ? r.json() : []).then(setSlabs).catch(() => {});
    fetch(`${BASE_URL}/api/matchmaking/filters`).then(r => r.ok ? r.json() : []).then(setActiveFilters).catch(() => {});
    fetch(`${BASE_URL}/api/categories`).then(r => r.ok ? r.json() : []).then(setCategories).catch(() => {});
    fetch(`${BASE_URL}/api/matchmaking/brief-options`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d) return;
        const EXCLUDED = new Set(["non binary", "prefer not to say"]);
        const opts: string[] = (d.creatorGenderOptions ?? [])
          .map((o: any) => o.label as string)
          .filter((l: string) => !EXCLUDED.has(l.toLowerCase()));
        setGenderOptions(["Any", ...opts]);
      }).catch(() => {});
    fetch(`${BASE_URL}/api/creator-signup-config`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d) return;
        const groups: string[] = Array.isArray(d.creator_audience_age_groups)
          ? (d.creator_audience_age_groups as Array<any>).filter(g => g.isActive !== false).map(g => typeof g === "string" ? g : String(g.label ?? g))
          : [];
        setAgeGroupOptions(groups);
      }).catch(() => {});
  }, [brandId, authLoading, navigate]);

  if (authLoading || !brandId) return null;

  if (briefExpired) {
    return (
      <BrandLayout credits={credits?.total ?? null} activeTab="matchmaking">
        <div className="max-w-xl mx-auto px-4 pt-20 text-center">
          <p className="text-white text-4xl mb-4">⏱</p>
          <p className="text-white font-bold text-base mb-2" style={{ fontFamily: POPPINS }}>Brief expired</p>
          <p className="text-white/70 text-sm mb-6" style={{ fontFamily: POPPINS }}>Your session expired or you refreshed the page. Please run matchmaking again.</p>
          <button onClick={() => navigate("/home-brand/matchmaking")}
            className="px-6 py-2.5 rounded-full text-white text-sm font-semibold" style={{ background: PINK, fontFamily: POPPINS }}>
            ← Run Matchmaking
          </button>
        </div>
      </BrandLayout>
    );
  }

  // Apply filters
  const selectedSlab = filterState.slabId ? slabs.find(s => s.id === filterState.slabId) ?? null : null;

  const filtered = (allResults ?? []).filter(c => {
    if (selectedSlab) {
      const ok = c.followerCount >= selectedSlab.minFollowers;
      const inRange = selectedSlab.maxFollowers ? ok && c.followerCount <= selectedSlab.maxFollowers : ok;
      if (!inRange) return false;
    }
    if (filterState.minScore > 0 && c.totalScore < filterState.minScore) return false;
    if (filterState.gender !== "any") {
      const f = c.audienceGenderFemale ?? 50;
      if (filterState.gender === "female" && f < 50) return false;
      if (filterState.gender === "male" && f >= 50) return false;
    }
    if (filterState.ages.length > 0) {
      if (!filterState.ages.includes(c.audienceAge ?? "")) return false;
    }
    if (filterState.cats.length > 0) {
      if (!c.categories.some(cat => filterState.cats.includes(cat.id))) return false;
    }
    return true;
  });

  async function handleUnlock() {
    if (!unlockModal) return;
    setUnlocking(true); setUnlockError(null);
    try {
      const r = await apiFetch(`/api/brand/creators/${unlockModal.creatorId}/unlock`, { method: "POST" });
      if (!r.ok) { const e = await r.json(); setUnlockError(e.message ?? e.error ?? "Failed"); return; }
      const d = await r.json().catch(() => ({}));
      setAllResults(prev => prev ? prev.map(c => c.creatorId === unlockModal.creatorId ? { ...c, isUnlocked: true } : c) : prev);
      setCredits(prev => prev ? { ...prev, total: prev.total - 1 } : prev);
      const targetId = unlockModal.creatorId;
      setUnlockModal(null);
      setCelebration(targetId);
      setCelebUser({ username: d.instagramHandle ?? null, fullName: d.fullName ?? null });
      setTimeout(() => { setCelebration(null); navigate(`/home-brand/matchmaking/creator/${targetId}`); }, 2000);
    } catch { setUnlockError("Network error. Please try again."); }
    finally { setUnlocking(false); }
  }

  async function saveBrief() {
    if (!briefId) return;
    await apiFetch(`/api/brand/matchmaking/run`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saveAsBrief: true, existingBriefId: briefId, ...(JSON.parse(sessionStorage.getItem("mm_brief") ?? "{}").brief ?? {}) }),
    }).catch(() => {});
    setSavedBriefMsg(true);
    setTimeout(() => setSavedBriefMsg(false), 2000);
  }

  const filterPanelProps: FilterPanelProps = {
    filterState, setFilterState, categories, slabs, activeFilters, genderOptions, ageGroupOptions,
  };

  return (
    <>
      <UnlockCelebration show={!!celebration} username={celebUser.username} fullName={celebUser.fullName} subtitle="Taking you there…" />

      <BrandLayout credits={credits?.total ?? null} activeTab="matchmaking">
        {/* ── Hero heading (same as brief page) ── */}
        <div className="text-center pt-8 pb-6 px-4" style={{ fontFamily: POPPINS }}>
          <h1 className="font-bold leading-tight" style={{ fontSize: "clamp(20px,5vw,48px)", color: "white" }}>
            Smart Creator <span style={{ color: PINK }}>Matchmaking</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            Tell us about your campaign—we rank the best creators for you.
          </p>
        </div>

        <div className="px-4 pb-10">
          {/* ── Nav row (back + save brief) ── */}
          <div className="flex items-center justify-between mb-5 max-w-screen-xl mx-auto">
            <button
              onClick={() => navigate("/home-brand/matchmaking")}
              className="flex items-center gap-1.5 text-white/80 text-xs"
              style={{ fontFamily: POPPINS }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Edit Brief
            </button>
            <button
              onClick={saveBrief}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "rgba(240,24,122,0.12)", color: PINK, fontFamily: POPPINS }}
            >
              <Bookmark className="w-3.5 h-3.5" />
              {savedBriefMsg ? "Saved!" : "Save Brief"}
            </button>
          </div>

          {/* ── Main 2-col layout ── */}
          <div className="max-w-screen-xl mx-auto lg:flex lg:gap-6 lg:items-start">

            {/* ── Desktop sidebar ── */}
            <div className="hidden lg:block lg:w-72 lg:flex-shrink-0 lg:sticky" style={{ top: 16 }}>
              <FilterPanel {...filterPanelProps} />
            </div>

            {/* ── Right content area ── */}
            <div className="flex-1 min-w-0">

              {/* ── Mobile filter accordion ── */}
              <div className="lg:hidden mb-4">
                {!showMobileFilter ? (
                  <button
                    type="button"
                    onClick={() => setShowMobileFilter(true)}
                    className="w-full flex items-center justify-between px-5 rounded-2xl transition-all"
                    style={{
                      height: 52,
                      background: FILTER_BG,
                      border: "1px solid rgba(255,255,255,0.10)",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.28)",
                      fontFamily: POPPINS,
                    }}
                  >
                    <span className="text-white font-bold text-sm">Filter Creator</span>
                    <ChevronDown className="w-5 h-5 text-white/80" />
                  </button>
                ) : (
                  <FilterPanel
                    {...filterPanelProps}
                    onClose={() => setShowMobileFilter(false)}
                    isMobile
                  />
                )}
              </div>

              {/* ── Results count ── */}
              <p className="text-white font-semibold text-base mb-5" style={{ fontFamily: POPPINS }}>
                Showing top{" "}
                <span style={{ color: PINK }}>{filtered.length}</span>{" "}
                creator{filtered.length !== 1 ? "s" : ""} for you.
              </p>

              {/* ── Creator cards ── */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-20 gap-3">
                  <p className="text-white font-semibold" style={{ fontFamily: POPPINS, fontSize: 16 }}>No creators match your brief.</p>
                  <p className="text-white/65" style={{ fontFamily: POPPINS, fontSize: 13, maxWidth: 320, lineHeight: 1.6 }}>
                    Try adjusting your filters — or explore all creators on Search to find your perfect match.
                  </p>
                  <button
                    onClick={() => navigate("/home-brand/search")}
                    style={{ background: PINK, color: "#fff", fontFamily: POPPINS, fontSize: 14, borderRadius: 10, padding: "10px 24px", border: "none", cursor: "pointer", marginTop: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#d4106a")}
                    onMouseLeave={e => (e.currentTarget.style.background = PINK)}
                  >
                    Explore Search →
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filtered.map(c => (
                    <MatchCard
                      key={c.creatorId}
                      c={c}
                      onUnlock={() => setUnlockModal(c)}
                      onView={() => navigate(`/home-brand/matchmaking/creator/${c.creatorId}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Unlock modal ── */}
        {unlockModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.80)" }}
            onClick={e => { if (e.target === e.currentTarget) { setUnlockModal(null); setUnlockError(null); } }}
          >
            <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#15151D", border: "1px solid rgba(240,24,122,0.30)" }}>
              <h3 className="text-white font-bold text-base mb-3" style={{ fontFamily: POPPINS }}>Unlock Full Profile</h3>
              <div className="flex flex-col items-center mb-4">
                <div className="w-16 h-16 rounded-full mb-2 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.10)" }}>
                  <Lock className="w-6 h-6 text-white/70" />
                </div>
                <p className="text-white/90 text-xs" style={{ fontFamily: POPPINS }}>#{unlockModal.rank} Match · {unlockModal.totalScore}/100 score</p>
              </div>
              <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(240,24,122,0.10)", border: "1px solid rgba(240,24,122,0.20)" }}>
                <div className="flex justify-between mb-1">
                  <span className="text-white/90 text-xs" style={{ fontFamily: POPPINS }}>Profile Unlock Cost</span>
                  <span className="text-white font-bold text-xs" style={{ fontFamily: POPPINS }}>1 Credit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/90 text-xs" style={{ fontFamily: POPPINS }}>Your balance</span>
                  <span className="text-white font-bold text-xs" style={{ fontFamily: POPPINS }}>{credits?.total ?? 0} Credits</span>
                </div>
              </div>
              <p className="text-amber-300/80 text-[11px] mb-2 flex items-start gap-1.5" style={{ fontFamily: POPPINS }}>
                <span>⚠️</span> Credits are non-refundable once spent
              </p>
              <p className="text-white text-[11px] mb-4" style={{ fontFamily: POPPINS }}>
                Once unlocked, this profile stays accessible forever — collaborate anytime without spending another credit.
              </p>
              {unlockError && <p className="text-red-400 text-xs mb-3" style={{ fontFamily: POPPINS }}>{unlockError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setUnlockModal(null); setUnlockError(null); }}
                  className="flex-1 py-2.5 rounded-full border border-white/20 text-white text-xs"
                  style={{ fontFamily: POPPINS }}
                >
                  Cancel
                </button>
                {(credits?.total ?? 0) < 1 ? (
                  <button
                    onClick={() => navigate("/home-brand/credits")}
                    className="flex-1 py-2.5 rounded-full text-white text-xs font-semibold"
                    style={{ background: PINK, fontFamily: POPPINS }}
                  >
                    Buy Credits
                  </button>
                ) : (
                  <button
                    onClick={handleUnlock}
                    disabled={unlocking}
                    className="flex-1 py-2.5 rounded-full text-white text-xs font-semibold disabled:opacity-50"
                    style={{ background: PINK, fontFamily: POPPINS }}
                  >
                    {unlocking ? "Unlocking..." : "Unlock · 1 Credit"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </BrandLayout>
    </>
  );
}
