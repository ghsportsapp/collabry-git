import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ChevronDown, X, Check, Loader2,
  LayoutGrid, CalendarDays, PenLine, CalendarRange, Navigation, ArrowRight,
  FileInput, User,
} from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

interface FieldOption { id: string; label: string; value: string; }
interface SavedBrief {
  id: string; productCategory: string | null; campaignGoal: string;
  targetGender: string; targetAge: string; targetLocation: string;
  targetCreatorGender: string;
  lastRunAt: string | null; createdAt: string;
}
interface CategoryOption { id: string; name: string; }

type BriefState = Record<string, string>;

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  icon: React.ElementType;
  isCategory?: boolean;
  briefOptsKey?: "age" | "location" | "creatorGender";
  staticOpts?: FieldOption[];
  required: boolean;
}

const CAMPAIGN_GOAL_OPTS: FieldOption[] = [
  { id: "cg1", label: "Product Promotion & Reviews",       value: "product_promotion_reviews" },
  { id: "cg2", label: "Brand Awareness & Viral Reach",     value: "brand_awareness_viral" },
  { id: "cg3", label: "Lifestyle & Everyday Integration",  value: "lifestyle_everyday" },
  { id: "cg4", label: "Educational & Informative Content", value: "educational_informative" },
];

const GENDER_OPTS: FieldOption[] = [
  { id: "gm", label: "Male",   value: "male" },
  { id: "gf", label: "Female", value: "female" },
  { id: "gmx", label: "Mixed", value: "mixed" },
];

const CREATOR_GENDER_OPTS: FieldOption[] = [
  { id: "cgm", label: "Male",   value: "male" },
  { id: "cgf", label: "Female", value: "female" },
  { id: "cgo", label: "Other",  value: "other" },
];

const LEFT_FIELDS: FieldDef[] = [
  { key: "productCategory",    label: "Target Creator Category", placeholder: "Select Creator Category", icon: LayoutGrid,    isCategory: true,               required: true },
  { key: "campaignGoal",       label: "Campaign Goal",           placeholder: "Select Campaign Goal",    icon: CalendarDays,  staticOpts: CAMPAIGN_GOAL_OPTS,  required: true },
  { key: "targetCreatorGender",label: "Creator Gender",          placeholder: "Select Creator Gender",   icon: User,          staticOpts: CREATOR_GENDER_OPTS, required: false },
];

const RIGHT_FIELDS: FieldDef[] = [
  { key: "targetGender",   label: "Target Customer Gender",    placeholder: "Select Target Gender", icon: PenLine,       staticOpts: GENDER_OPTS,  required: true },
  { key: "targetAge",      label: "Target Customer Age Range", placeholder: "Select Age Range",     icon: CalendarRange, briefOptsKey: "age",      required: true },
  { key: "targetLocation", label: "Target Customer Location",  placeholder: "Select Location",      icon: Navigation,    briefOptsKey: "location", required: true },
];

const ALL_FIELDS = [...LEFT_FIELDS, ...RIGHT_FIELDS];

function FieldRow({
  field, value, onClick,
}: { field: FieldDef; value: string; onClick: () => void }) {
  const Icon = field.icon;
  const filled = !!value;
  return (
    <div>
      <p className="text-sm font-medium mb-2" style={{ color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
        {field.label}
      </p>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 rounded-2xl transition-all"
        style={{
          height: 44,
          background: filled ? PINK : "transparent",
          border: filled ? "none" : "1.5px solid rgba(255,255,255,0.18)",
          fontFamily: POPPINS,
        }}
      >
        <Icon
          className="w-[18px] h-[18px] flex-shrink-0"
          style={{ color: filled ? "white" : "rgba(255,255,255,0.70)" }}
        />
        <span
          className="flex-1 text-left text-sm font-medium truncate"
          style={{ color: filled ? "white" : "rgba(255,255,255,0.70)" }}
        >
          {value || field.placeholder}
        </span>
        <ChevronDown
          className="w-4 h-4 flex-shrink-0"
          style={{ color: filled ? "white" : "rgba(255,255,255,0.70)" }}
        />
      </button>
    </div>
  );
}

export default function BrandMatchmaking() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();

  const [brief, setBrief] = useState<BriefState>({});
  const [briefOpts, setBriefOpts] = useState<{ age: FieldOption[]; location: FieldOption[]; creatorGender: FieldOption[] }>({ age: [], location: [], creatorGender: [] });
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([]);
  const [showSavedDropdown, setShowSavedDropdown] = useState(false);
  const [loadedBriefLabel, setLoadedBriefLabel] = useState<string | null>(null);
  const [saveAsBrief, setSaveAsBrief] = useState(true);
  const [bottomSheet, setBottomSheet] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingBriefId = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading, navigate]);

  useEffect(() => {
    if (!brandId) return;
    fetch(`${BASE_URL}/api/categories`)
      .then(r => r.ok ? r.json() : [])
      .then((cats: any[]) => setCategories(cats.map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    fetch(`${BASE_URL}/api/matchmaking/brief-options`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d) return;
        setBriefOpts({
          age:           (d.ageOptions           ?? []).map((o: any, i: number) => ({ id: `age_${i}`, label: o.label === "Broad Audience" ? "All" : o.label, value: o.value })),
          location:      (d.locationOptions       ?? []).map((o: any, i: number) => ({ id: `loc_${i}`, label: o.label, value: o.value })),
          creatorGender: (d.creatorGenderOptions  ?? []).map((o: any, i: number) => ({ id: `cg_${i}`,  label: o.label, value: o.value })),
        });
      })
      .catch(() => {});
    apiFetch("/api/brand/matchmaking/briefs").then(r => r.ok ? r.json() : []).then(setSavedBriefs).catch(() => {});
    const stored = sessionStorage.getItem("mm_brief");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setBrief(parsed.brief ?? {});
        existingBriefId.current = parsed.briefId ?? null;
        setSaveAsBrief(parsed.saved !== false);
      } catch { /* ignore */ }
    }
  }, [brandId, apiFetch]);

  const requiredFields = ALL_FIELDS.filter(f => f.required).map(f => f.key);
  const isReady = requiredFields.every(k => brief[k]);

  function getOptionsFor(field: FieldDef): FieldOption[] {
    if (field.staticOpts) return field.staticOpts;
    if (field.briefOptsKey) return briefOpts[field.briefOptsKey] ?? [];
    if (field.isCategory) return categories.map(c => ({ id: c.id, label: c.name, value: c.name }));
    return [];
  }

  function loadBrief(b: SavedBrief) {
    setBrief({
      ...(b.productCategory ? { productCategory: b.productCategory } : {}),
      campaignGoal: b.campaignGoal,
      targetGender: b.targetGender, targetAge: b.targetAge, targetLocation: b.targetLocation,
      ...(b.targetCreatorGender ? { targetCreatorGender: b.targetCreatorGender } : {}),
    });
    existingBriefId.current = b.id;
    setSaveAsBrief(true);
    setShowSavedDropdown(false);
    setLoadedBriefLabel(b.campaignGoal + (b.targetLocation ? " · " + b.targetLocation : ""));
  }

  async function handleRun() {
    if (!isReady) return;
    setRunning(true); setError(null);
    try {
      const r = await apiFetch("/api/brand/matchmaking/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCategory: brief.productCategory ?? null,
          campaignGoal: brief.campaignGoal,
          targetGender: brief.targetGender, targetAge: brief.targetAge, targetLocation: brief.targetLocation,
          targetCreatorGender: brief.targetCreatorGender ?? "",
          saveAsBrief, existingBriefId: existingBriefId.current ?? undefined,
        }),
      });
      if (!r.ok) {
        const text = await r.text();
        let msg = "Failed to run matchmaking";
        try { const e = JSON.parse(text); msg = e.error ?? msg; } catch { msg = text || msg; }
        setError(msg); return;
      }
      const data = await r.json();
      sessionStorage.setItem("mm_results", JSON.stringify({ results: data.results, briefId: data.briefId, totalCreators: data.totalCreators }));
      sessionStorage.setItem("mm_brief", JSON.stringify({ brief, briefId: data.briefId, saved: saveAsBrief }));
      navigate("/home-brand/matchmaking/results");
    } catch (err: any) { setError(err?.message ?? "Network error."); }
    finally { setRunning(false); }
  }

  const activeSheet = bottomSheet ? ALL_FIELDS.find(f => f.key === bottomSheet) : null;
  const sheetOpts = activeSheet ? getOptionsFor(activeSheet) : [];
  const sheetCurrent = bottomSheet ? (brief[bottomSheet] ?? "") : "";

  if (authLoading || !brandId) return null;

  return (
    <BrandLayout credits={null} activeTab="matchmaking">
      {/* ── Hero heading ── */}
      <div className="text-center pt-8 pb-6 px-4">
        <h1 className="font-bold leading-tight" style={{ fontSize: "clamp(20px,5vw,48px)", color: "white", fontFamily: "'Merriweather', serif" }}>
          Smart Creator{" "}
          <span style={{ color: PINK }}>Matchmaking</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.75)", fontFamily: POPPINS }}>
          Tell us about your requirement—we will find the best creators for you.
        </p>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-12">
        {/* ── Load a saved brief ── */}
        <div className="relative mb-5">
          <button
            type="button"
            onClick={() => savedBriefs.length > 0 && setShowSavedDropdown(v => !v)}
            className="w-full flex items-center gap-3 px-5 rounded-2xl transition-all"
            style={{
              height: 48,
              background: "rgba(88,4,44,0.70)",
              border: "1.5px solid rgba(240,24,122,0.40)",
              fontFamily: POPPINS,
              cursor: savedBriefs.length === 0 ? "default" : "pointer",
            }}
          >
            <FileInput className="w-5 h-5 flex-shrink-0" style={{ color: PINK }} />
            <span className="flex-1 text-left" style={{ fontFamily: POPPINS }}>
              <span className="text-sm font-semibold text-white">Load a saved brief</span>
              <span className="text-xs ml-2" style={{ color: "rgba(255,255,255,0.55)" }}>
                {loadedBriefLabel ?? "None"}
              </span>
            </span>
            <ChevronDown
              className={`w-5 h-5 flex-shrink-0 transition-transform ${showSavedDropdown ? "rotate-180" : ""}`}
              style={{ color: "rgba(255,255,255,0.9)" }}
            />
          </button>

          {showSavedDropdown && savedBriefs.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 z-20 rounded-2xl overflow-hidden"
              style={{ background: "#1a0d1a", border: "1px solid rgba(240,24,122,0.25)" }}
            >
              {savedBriefs.map((b, idx) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => loadBrief(b)}
                  className="w-full text-left px-5 py-3.5 hover:bg-white/5 transition-colors"
                  style={{
                    borderBottom: idx < savedBriefs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    fontFamily: POPPINS,
                  }}
                >
                  <p className="text-white text-sm font-semibold truncate">{b.campaignGoal} · {b.targetLocation}</p>
                  <p className="text-white/70 text-xs mt-0.5">
                    {b.lastRunAt
                      ? `Last run ${new Date(b.lastRunAt).toLocaleDateString("en-IN")}`
                      : `Saved ${new Date(b.createdAt).toLocaleDateString("en-IN")}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── "Fill all required fields" label ── */}
        <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.75)", fontFamily: POPPINS }}>
          Fill all required fields
        </p>

        {/* ── 2-column grid on desktop, 1-column on mobile ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5">
          {/* Left column */}
          <div className="space-y-5">
            {LEFT_FIELDS.map(field => (
              <FieldRow
                key={field.key}
                field={field}
                value={brief[field.key] ?? ""}
                onClick={() => setBottomSheet(field.key)}
              />
            ))}
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {RIGHT_FIELDS.map(field => (
              <FieldRow
                key={field.key}
                field={field}
                value={brief[field.key] ?? ""}
                onClick={() => setBottomSheet(field.key)}
              />
            ))}
          </div>
        </div>

        {/* ── Save brief checkbox ── */}
        <label className="flex items-center gap-3 mt-7 mb-7 cursor-pointer select-none">
          <button
            type="button"
            onClick={() => setSaveAsBrief(v => !v)}
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: saveAsBrief ? PINK : "transparent",
              border: saveAsBrief ? "none" : "1.5px solid rgba(255,255,255,0.15)",
            }}
          >
            {saveAsBrief && <Check className="w-3 h-3 text-white" />}
          </button>
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)", fontFamily: POPPINS }}>
            Save this brief for future use
          </span>
        </label>

        {error && (
          <p className="mb-4 text-red-400 text-xs" style={{ fontFamily: POPPINS }}>{error}</p>
        )}

        {/* ── Clear All + Find Matches row ── */}
        <div className="flex items-center justify-center gap-4">
          {/* Clear All */}
          <button
            type="button"
            onClick={() => { setBrief({}); existingBriefId.current = null; setLoadedBriefLabel(null); }}
            className="flex items-center justify-center rounded-full font-semibold text-sm transition-all"
            style={{
              height: 48,
              paddingLeft: 28,
              paddingRight: 28,
              border: "1.5px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.80)",
              fontFamily: POPPINS,
              whiteSpace: "nowrap",
            }}
          >
            Clear All
          </button>

          {/* Find Matches */}
          <button
            type="button"
            onClick={handleRun}
            disabled={!isReady || running}
            className="flex items-center justify-center gap-2 rounded-full font-bold text-sm transition-all disabled:opacity-50"
            style={{
              height: 48,
              paddingLeft: 36,
              paddingRight: 36,
              background: PINK,
              color: "white",
              fontFamily: POPPINS,
              whiteSpace: "nowrap",
            }}
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Scoring…</>
            ) : (
              <>Find Matches <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>

      {/* ── Bottom sheet (option picker) ── */}
      {bottomSheet && activeSheet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setBottomSheet(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl"
            style={{ background: "#1a0d1a", maxHeight: "80vh" }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 pt-4 pb-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>
                {activeSheet.label}
              </p>
              <button onClick={() => setBottomSheet(null)}>
                <X className="w-5 h-5 text-white/75" />
              </button>
            </div>
            <div
              className="overflow-y-auto px-4 py-3 space-y-1"
              style={{ maxHeight: "55vh", scrollbarWidth: "none" }}
            >
              {sheetOpts.length === 0 && (
                <p className="text-white/70 text-xs text-center py-6" style={{ fontFamily: POPPINS }}>
                  {activeSheet.isCategory ? "No categories configured yet" : "No options available"}
                </p>
              )}
              {sheetOpts.map(opt => {
                const selected = sheetCurrent === opt.label || sheetCurrent === opt.value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setBrief(prev => ({ ...prev, [bottomSheet]: opt.label }));
                      setBottomSheet(null);
                    }}
                    className="w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all"
                    style={{
                      background: selected ? "rgba(240,24,122,0.12)" : "rgba(255,255,255,0.03)",
                      border: selected ? "1px solid rgba(240,24,122,0.40)" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span
                      className="text-sm font-medium"
                      style={{ color: selected ? "white" : "rgba(255,255,255,0.90)", fontFamily: POPPINS }}
                    >
                      {opt.label}
                    </span>
                    {selected && <Check className="w-4 h-4" style={{ color: PINK }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </BrandLayout>
  );
}
