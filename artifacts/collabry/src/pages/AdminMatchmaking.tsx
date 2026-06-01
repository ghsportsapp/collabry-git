import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Plus, Trash2, Edit2, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

interface ScoringWeight { id: string; parameter: string; fullMatchPts: number; partialMatchPts: number; noMatchPts: number; relatedPts: number | null; }
interface FieldOption { id: string; field: string; label: string; value: string; displayOrder: number; isActive: boolean; }
interface FilterRow { filterType: string; isActive: boolean; }
interface AdjacencyRow { id: string; typeA: string; typeB: string; pts: number; adjacencyType: string; }
interface Dimension { id: string; dimensionKey: string; label: string; brandField: string; brandFieldLabel: string; creatorField: string; creatorFieldLabel: string; scoringParam: string; briefKey: string; creatorColumn: string; displayOrder: number; isActive: boolean; }
interface CreatorFieldOption { id: string; fieldKey: string; label: string; value: string; displayOrder: number; isActive: boolean; }

const FILTER_LABELS: Record<string, string> = {
  gender: "Influencer Gender", age: "Influencer Age Range",
  followerRange: "Follower Range", category: "Category", minScore: "Minimum Score",
};

const PARAM_META: Record<string, { icon: string; label: string; desc: string }> = {
  category:      { icon: "📂", label: "Category Match",         desc: "How well the brand's target creator category matches the creator's content categories. Exact = full, admin-defined related category = partial, other = no match." },
  goal:          { icon: "🎯", label: "Campaign Goal Match",    desc: "How well the brand's campaign goal aligns with the creator's primary content style. Exact mapping = full match, otherwise no match." },
  gender:        { icon: "👥", label: "Target Gender Match",    desc: "How well the brand's target customer gender matches the creator's audience gender split. Majority threshold determines full vs no match." },
  age:           { icon: "📅", label: "Target Age Range Match", desc: "How well the brand's target age group matches the creator's primary audience age bracket. Exact bracket = full match, otherwise no match." },
  location:      { icon: "📍", label: "Location Match",         desc: "How well the brand's target location matches the creator's primary audience location. Exact match = full, otherwise no match." },
  creatorGender: { icon: "🙋", label: "Creator Gender Match",   desc: "How well the brand's preferred creator gender matches the creator's own personal gender filled at signup. Exact match = full, otherwise no match." },
};

const PARAM_ORDER = ["category", "goal", "gender", "age", "location", "creatorGender"];

function tabClass(active: boolean) {
  return `px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all ${active ? "border-b-2 text-white" : "text-gray-300 hover:text-gray-200"}`;
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled}
      className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
      style={{ background: on ? PINK : "rgba(255,255,255,0.15)" }}>
      <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
        style={{ left: on ? "23px" : "4px" }} />
    </button>
  );
}

function NumInput({ value, onChange, min = 0, max = 100, className = "" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; className?: string }) {
  return (
    <input type="number" min={min} max={max} value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || 0)))}
      className={`w-16 text-center rounded-lg px-2 py-1.5 text-white text-sm font-semibold outline-none ${className}`}
      style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }} />
  );
}

export default function AdminMatchmaking() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState(0);

  const TAB_LABELS = ["Scoring Config", "Category Adjacency", "Result Filters", "Other Settings", "Field Options", "Profile Visibility", "Match Preview"];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-gray-400 hover:text-white text-sm">← Back</button>
          <h1 className="text-white font-bold text-xl" style={{ fontFamily: POPPINS }}>Matchmaking Config</h1>
        </div>

        <div className="flex gap-0 border-b border-white/10 mb-6 overflow-x-auto scrollbar-hide">
          {TAB_LABELS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={tabClass(tab === i)}
              style={{ borderColor: tab === i ? PINK : "transparent", fontFamily: POPPINS }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 0 && <TabScoringConfig />}
        {tab === 1 && <TabCategoryAdjacency />}
        {tab === 2 && <TabResultFilters />}
        {tab === 3 && <TabOtherSettings />}
        {tab === 4 && <TabFieldOptions />}
        {tab === 5 && <TabProfileVisibility />}
        {tab === 6 && <TabMatchPreview />}
      </div>
    </div>
  );
}

// ── Tab 0: Scoring Config ─────────────────────────────────────────────────────

function TabScoringConfig() {
  const { adminFetch } = useAdminAuth();
  const [weights, setWeights] = useState<ScoringWeight[]>([]);
  const [genderMajThreshold, setGenderMajThreshold] = useState(55);
  const [genderMixedMin, setGenderMixedMin] = useState(40);
  const [genderMixedMax, setGenderMixedMax] = useState(60);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/matchmaking/scoring-weights")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setWeights(d.weights ?? []);
        setGenderMajThreshold(d.genderMajorityThreshold ?? 55);
        setGenderMixedMin(d.genderMixedMin ?? 40);
        setGenderMixedMax(d.genderMixedMax ?? 60);
      });
  }, []);

  function updateWeight(id: string, field: keyof ScoringWeight, val: number) {
    setWeights(ws => ws.map(w => w.id === id ? { ...w, [field]: val } : w));
  }

  const ordered = PARAM_ORDER.map(p => weights.find(w => w.parameter === p)).filter(Boolean) as ScoringWeight[];
  const total = ordered.reduce((s, w) => s + (w.fullMatchPts || 0), 0);
  const anyNoMatchZero = ordered.some(w => (w.noMatchPts ?? 0) < 1);
  const canSave = total === 100 && !anyNoMatchZero;

  async function save() {
    setSaving(true); setMsg(null);
    const r = await adminFetch("/api/admin/matchmaking/scoring-weights", {
      method: "PATCH",
      body: JSON.stringify({
        weights: ordered,
        genderMajorityThreshold: genderMajThreshold,
        genderMixedMin,
        genderMixedMax,
      }),
    });
    setSaving(false);
    if (r.ok) setMsg("Saved!");
    else { const e = await r.json(); setMsg(e.error ?? "Error saving"); }
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="pb-12">
      <div className="mb-1">
        <h2 className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>Matchmaking Scoring Configuration</h2>
        <p className="text-gray-300 text-xs mt-1" style={{ fontFamily: POPPINS }}>Control exactly how many points each match type earns. Total of all Full Match points must equal 100.</p>
      </div>

      {/* Running total */}
      <div className="sticky top-0 z-10 py-3 mb-4" style={{ background: "rgba(3,7,18,0.95)", backdropFilter: "blur(8px)" }}>
        <div className="rounded-xl p-4 flex items-center justify-between gap-4"
          style={{ background: total === 100 ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)", border: `1px solid ${total === 100 ? "rgba(34,197,94,0.30)" : "rgba(239,68,68,0.30)"}` }}>
          <div>
            <p className="font-bold text-lg leading-none" style={{ color: total === 100 ? "#4ade80" : "#f87171", fontFamily: POPPINS }}>
              Total: {total} / 100
            </p>
            <p className="text-xs mt-0.5" style={{ color: total === 100 ? "#86efac" : "#fca5a5", fontFamily: POPPINS }}>
              {total === 100 ? "✓ Ready to save" : total < 100 ? `⚠ ${100 - total} points remaining to allocate` : `⚠ ${total - 100} points over limit`}
              {anyNoMatchZero && " · No Match pts must be ≥ 1 for all params"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className={`text-sm font-semibold ${msg === "Saved!" ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>{msg}</span>}
            <button onClick={save} disabled={saving || !canSave}
              className="px-5 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 transition-opacity"
              style={{ background: PINK, fontFamily: POPPINS }}>
              {saving ? "Saving…" : "Save All"}
            </button>
          </div>
        </div>
      </div>

      {/* Parameter cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ordered.map(w => {
          const meta = PARAM_META[w.parameter] ?? { icon: "⚙️", label: w.parameter, desc: "" };
          const isGender = w.parameter === "gender";
          const isCategory = w.parameter === "category";

          return (
            <div key={w.id} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <div className="mb-3">
                <p className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>{meta.icon} {meta.label}</p>
                <p className="text-gray-400 text-[11px] mt-0.5 leading-relaxed" style={{ fontFamily: POPPINS }}>{meta.desc}</p>
              </div>

              <div className="space-y-2">
                {/* Full match */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
                      {isCategory ? "Exact category match" : "Full match"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <NumInput value={w.fullMatchPts} onChange={v => updateWeight(w.id, "fullMatchPts", v)} />
                    <span className="text-gray-400 text-xs" style={{ fontFamily: POPPINS }}>pts</span>
                  </div>
                </div>

                {/* Related match — category only (via admin-configured adjacency) */}
                {isCategory && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>Related category</p>
                      <p className="text-gray-500 text-[10px]" style={{ fontFamily: POPPINS }}>Admin-defined category adjacency</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <NumInput value={w.relatedPts ?? 0} onChange={v => updateWeight(w.id, "relatedPts", v)} />
                      <span className="text-gray-400 text-xs" style={{ fontFamily: POPPINS }}>pts</span>
                    </div>
                  </div>
                )}

                {/* No match */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>No match</p>
                    <p className="text-gray-500 text-[10px]" style={{ fontFamily: POPPINS }}>
                      {(w.noMatchPts ?? 0) < 1 ? "⚠ Must be ≥ 1" : "Minimum — never 0"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <NumInput value={w.noMatchPts} onChange={v => updateWeight(w.id, "noMatchPts", v)}
                      className={(w.noMatchPts ?? 0) < 1 ? "border-red-500/60" : ""} />
                    <span className="text-gray-400 text-xs" style={{ fontFamily: POPPINS }}>pts</span>
                  </div>
                </div>

                {/* Gender thresholds (only on gender param) */}
                {isGender && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-gray-300 text-[11px] font-semibold uppercase tracking-wide" style={{ fontFamily: POPPINS }}>Gender Thresholds</p>
                    {[
                      { label: "Majority threshold %", val: genderMajThreshold, set: setGenderMajThreshold, hint: "e.g. 55 → ≥55% = majority" },
                      { label: "Mixed range min %",    val: genderMixedMin,    set: setGenderMixedMin,    hint: "e.g. 40 → ≥40% = mixed" },
                      { label: "Mixed range max %",    val: genderMixedMax,    set: setGenderMixedMax,    hint: "e.g. 60 → ≤60% = mixed" },
                    ].map(({ label, val, set, hint }) => (
                      <div key={label} className="flex items-center justify-between">
                        <div>
                          <p className="text-white/90 text-xs" style={{ fontFamily: POPPINS }}>{label}</p>
                          <p className="text-gray-500 text-[10px]" style={{ fontFamily: POPPINS }}>{hint}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <NumInput value={val} onChange={set} max={100} />
                          <span className="text-gray-400 text-xs">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom save bar */}
      <div className="mt-6 flex items-center justify-between">
        {msg && <span className={`text-sm font-semibold ${msg === "Saved!" ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>{msg}</span>}
        <div />
        <button onClick={save} disabled={saving || !canSave}
          className="px-8 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-opacity"
          style={{ background: PINK, fontFamily: POPPINS }}>
          {saving ? "Saving…" : "Save Scoring Config"}
        </button>
      </div>
    </div>
  );
}

// ── Tab 1: Match Mapping (dimension-driven) ───────────────────────────────────

type MatchLevel = "FULL" | "PARTIAL" | "NONE";
type MappingState = Record<string, Record<string, MatchLevel>>;

function nextLevel(l: MatchLevel): MatchLevel {
  if (l === "NONE") return "FULL";
  if (l === "FULL") return "PARTIAL";
  return "NONE";
}

function levelStyle(l: MatchLevel): { bg: string; color: string; label: string } {
  if (l === "FULL")    return { bg: "rgba(34,197,94,0.15)",   color: "#4ade80", label: "Full" };
  if (l === "PARTIAL") return { bg: "rgba(245,158,11,0.15)",  color: "#fbbf24", label: "Partial" };
  return                      { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.70)", label: "No Match" };
}

function TabMatchMapping() {
  const { adminFetch } = useAdminAuth();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [brandOpts, setBrandOpts] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [creatorOpts, setCreatorOpts] = useState<Record<string, string[]>>({});
  const [mappings, setMappings] = useState<Record<string, MappingState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [dimsR, optsR, mapsR, crR] = await Promise.all([
        adminFetch("/api/admin/matchmaking/dimensions"),
        adminFetch("/api/admin/matchmaking/options"),
        adminFetch("/api/admin/matchmaking/mappings"),
        adminFetch("/api/admin/matchmaking/creator-options"),
      ]);
      if (dimsR.ok) setDimensions((await dimsR.json()).filter((d: Dimension) => d.isActive));
      if (optsR.ok) {
        const all: Array<{ field: string; label: string; value: string; isActive: boolean }> = await optsR.json();
        const grouped: Record<string, Array<{ label: string; value: string }>> = {};
        for (const o of all) {
          if (o.isActive === false) continue;
          if (!grouped[o.field]) grouped[o.field] = [];
          grouped[o.field].push({ label: o.label, value: o.value });
        }
        setBrandOpts(grouped);
      }
      if (crR.ok) {
        const cr = await crR.json();
        const opts: Record<string, string[]> = {};
        for (const k of Object.keys(cr)) {
          if (Array.isArray(cr[k])) opts[k] = cr[k] as string[];
        }
        setCreatorOpts(opts);
      }
      if (mapsR.ok) {
        const rows: Array<{ mappingType: string; brandOption: string; creatorOption: string; matchLevel: MatchLevel }> = await mapsR.json();
        const state: Record<string, MappingState> = {};
        for (const r of rows) {
          if (!state[r.mappingType]) state[r.mappingType] = {};
          if (!state[r.mappingType][r.brandOption]) state[r.mappingType][r.brandOption] = {};
          state[r.mappingType][r.brandOption][r.creatorOption] = r.matchLevel;
        }
        setMappings(state);
      }
      setLoading(false);
    }
    load();
  }, []);

  function toggle(dimKey: string, brandOpt: string, creatorOpt: string) {
    setMappings(prev => {
      const sec = { ...(prev[dimKey] ?? {}) };
      const brand = { ...(sec[brandOpt] ?? {}) };
      brand[creatorOpt] = nextLevel(brand[creatorOpt] ?? "NONE");
      sec[brandOpt] = brand;
      return { ...prev, [dimKey]: sec };
    });
  }

  async function save(dim: Dimension) {
    setSaving(s => ({ ...s, [dim.dimensionKey]: true }));
    setMsgs(m => ({ ...m, [dim.dimensionKey]: "" }));
    const bOpts = brandOpts[dim.brandField] ?? [];
    const cOpts = creatorOpts[dim.creatorField] ?? [];
    const rows: Array<{ brandOption: string; creatorOption: string; matchLevel: MatchLevel }> = [];
    for (const bo of bOpts) {
      for (const co of cOpts) {
        rows.push({ brandOption: bo.label, creatorOption: co, matchLevel: mappings[dim.dimensionKey]?.[bo.label]?.[co] ?? "NONE" });
      }
    }
    const r = await adminFetch(`/api/admin/matchmaking/mappings/${dim.dimensionKey}`, { method: "PUT", body: JSON.stringify(rows) });
    setSaving(s => ({ ...s, [dim.dimensionKey]: false }));
    setMsgs(m => ({ ...m, [dim.dimensionKey]: r.ok ? "Saved!" : "Error saving" }));
    setTimeout(() => setMsgs(m => ({ ...m, [dim.dimensionKey]: "" })), 2500);
  }

  if (loading) return <p className="text-gray-400 text-sm py-6" style={{ fontFamily: POPPINS }}>Loading dimensions…</p>;
  if (dimensions.length === 0) return (
    <div className="rounded-xl p-5 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
      <p className="text-white/80 text-sm mb-2" style={{ fontFamily: POPPINS }}>No active dimensions configured.</p>
      <p className="text-gray-400 text-xs" style={{ fontFamily: POPPINS }}>Go to the <strong>Field Config</strong> tab to add brand→creator field mappings.</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      <p className="text-gray-300 text-sm" style={{ fontFamily: POPPINS }}>
        Configure which creator options earn full or partial points for each brand brief option. Click a pill to cycle: <span style={{ color: "#4ade80" }}>Full</span> → <span style={{ color: "#fbbf24" }}>Partial</span> → No Match. Dimensions are managed in the <strong>Field Config</strong> tab.
      </p>

      {dimensions.map(dim => {
        const bOpts = brandOpts[dim.brandField] ?? [];
        const cOpts = creatorOpts[dim.creatorField] ?? [];
        const isSaving = saving[dim.dimensionKey];
        const msg = msgs[dim.dimensionKey];

        return (
          <div key={dim.dimensionKey} className="rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 flex items-start justify-between gap-2" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div>
                <p className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>{dim.brandFieldLabel} → {dim.creatorFieldLabel}</p>
                <p className="text-gray-400 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>{dim.label} · scoring param: <span style={{ color: PINK }}>{dim.scoringParam}</span></p>
              </div>
            </div>

            {bOpts.length === 0 || cOpts.length === 0 ? (
              <p className="text-gray-400 text-xs px-4 py-3" style={{ fontFamily: POPPINS }}>
                {bOpts.length === 0
                  ? `No brand options for field "${dim.brandField}" — add them in Field Options.`
                  : `No creator options for field "${dim.creatorField}" — add them in Field Config → Creator Field Options.`}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
                      <th className="px-4 py-2.5 text-left text-white/70 font-semibold" style={{ fontFamily: POPPINS, minWidth: 130 }}>{dim.brandFieldLabel}</th>
                      {cOpts.map(co => (
                        <th key={co} className="px-3 py-2.5 text-center text-white/70 font-semibold" style={{ fontFamily: POPPINS, minWidth: 90 }}>{co}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bOpts.map((bo, i) => (
                      <tr key={bo.value} style={{ borderBottom: i < bOpts.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <td className="px-4 py-2.5 text-white/80 font-medium" style={{ fontFamily: POPPINS }}>{bo.label}</td>
                        {cOpts.map(co => {
                          const level: MatchLevel = mappings[dim.dimensionKey]?.[bo.label]?.[co] ?? "NONE";
                          const s = levelStyle(level);
                          return (
                            <td key={co} className="px-3 py-2 text-center">
                              <button onClick={() => toggle(dim.dimensionKey, bo.label, co)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                                style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}40` }}>
                                {s.label}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-4 py-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {msg && <span className={`text-xs font-semibold ${msg === "Saved!" ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>{msg}</span>}
              <button onClick={() => save(dim)} disabled={isSaving || bOpts.length === 0 || cOpts.length === 0}
                className="ml-auto px-4 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 transition-opacity"
                style={{ background: PINK, fontFamily: POPPINS }}>
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 2: Field Config ───────────────────────────────────────────────────────

function TabFieldConfig() {
  const { adminFetch } = useAdminAuth();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [creatorOpts, setCreatorOpts] = useState<CreatorFieldOption[]>([]);
  const [loadingDims, setLoadingDims] = useState(true);
  const [showAddDim, setShowAddDim] = useState(false);
  const [dimForm, setDimForm] = useState({ dimensionKey: "", label: "", brandField: "", brandFieldLabel: "", creatorField: "", creatorFieldLabel: "", scoringParam: "", briefKey: "", creatorColumn: "" });
  const [savingDim, setSavingDim] = useState(false);
  const [dimMsg, setDimMsg] = useState<string | null>(null);
  const [deletingDim, setDeletingDim] = useState<string | null>(null);
  const [addCfOpt, setAddCfOpt] = useState<Record<string, { label: string; value: string }>>({});
  const [savingCf, setSavingCf] = useState<Record<string, boolean>>({});
  const [cfMsg, setCfMsg] = useState<{ key: string; text: string } | null>(null);
  const [deletingCf, setDeletingCf] = useState<string | null>(null);
  const [editingCf, setEditingCf] = useState<Record<string, string>>({});

  async function loadDims() {
    setLoadingDims(true);
    const r = await adminFetch("/api/admin/matchmaking/dimensions");
    if (r.ok) setDimensions(await r.json());
    setLoadingDims(false);
  }
  async function loadCreatorOpts() {
    const r = await adminFetch("/api/admin/matchmaking/creator-field-options");
    if (r.ok) setCreatorOpts(await r.json());
  }
  useEffect(() => { loadDims(); loadCreatorOpts(); }, []);

  async function saveDim() {
    if (!dimForm.dimensionKey || !dimForm.label || !dimForm.brandField || !dimForm.brandFieldLabel || !dimForm.creatorField || !dimForm.creatorFieldLabel || !dimForm.scoringParam || !dimForm.briefKey || !dimForm.creatorColumn) {
      setDimMsg("All fields are required"); return;
    }
    setSavingDim(true); setDimMsg(null);
    const r = await adminFetch("/api/admin/matchmaking/dimensions", { method: "POST", body: JSON.stringify(dimForm) });
    setSavingDim(false);
    if (r.ok) {
      setDimMsg("Dimension added!"); setShowAddDim(false);
      setDimForm({ dimensionKey: "", label: "", brandField: "", brandFieldLabel: "", creatorField: "", creatorFieldLabel: "", scoringParam: "", briefKey: "", creatorColumn: "" });
      loadDims();
    } else {
      const e = await r.json(); setDimMsg(e.error ?? "Error");
    }
    setTimeout(() => setDimMsg(null), 3000);
  }

  async function deleteDim(id: string) {
    if (!confirm("Delete this dimension? This also removes all its saved mappings.")) return;
    setDeletingDim(id);
    await adminFetch(`/api/admin/matchmaking/dimensions/${id}`, { method: "DELETE" });
    setDeletingDim(null); loadDims();
  }

  async function toggleDimActive(dim: Dimension) {
    await adminFetch(`/api/admin/matchmaking/dimensions/${dim.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !dim.isActive }) });
    loadDims();
  }

  function cfOptsByField(field: string) { return creatorOpts.filter(o => o.fieldKey === field).sort((a, b) => a.displayOrder - b.displayOrder); }
  const uniqueCreatorFields = [...new Set(dimensions.map(d => d.creatorField))];

  async function addCfOption(fieldKey: string) {
    const o = addCfOpt[fieldKey]; if (!o?.label?.trim()) return;
    const value = o.value?.trim() || o.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    setSavingCf(s => ({ ...s, [fieldKey]: true }));
    const r = await adminFetch("/api/admin/matchmaking/creator-field-options", { method: "POST", body: JSON.stringify({ fieldKey, label: o.label.trim(), value }) });
    setSavingCf(s => ({ ...s, [fieldKey]: false }));
    if (r.ok) { setAddCfOpt(p => ({ ...p, [fieldKey]: { label: "", value: "" } })); setCfMsg({ key: fieldKey, text: "Added" }); loadCreatorOpts(); }
    else { const e = await r.json(); setCfMsg({ key: fieldKey, text: e.error ?? "Error" }); }
    setTimeout(() => setCfMsg(null), 2500);
  }

  async function deleteCfOption(id: string) {
    setDeletingCf(id);
    await adminFetch(`/api/admin/matchmaking/creator-field-options/${id}`, { method: "DELETE" });
    setDeletingCf(null); loadCreatorOpts();
  }

  async function saveCfEdit(id: string) {
    const label = (editingCf[id] ?? "").trim(); if (!label) return;
    await adminFetch(`/api/admin/matchmaking/creator-field-options/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
    setEditingCf(p => { const n = { ...p }; delete n[id]; return n; }); loadCreatorOpts();
  }

  const inputCls = "w-full rounded-lg px-3 py-1.5 text-white text-xs outline-none placeholder-gray-600";
  const inputSty = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" } as const;

  return (
    <div className="space-y-8 pb-12">
      {/* ── Dimensions ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Mapping Dimensions</h3>
            <p className="text-gray-400 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>Each dimension defines: which brand brief field maps to which creator field for scoring. The mapping matrix in the "Match Mapping" tab is built from these.</p>
          </div>
          <button onClick={() => setShowAddDim(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
            style={{ background: PINK, fontFamily: POPPINS }}>
            <Plus className="w-3.5 h-3.5" /> {showAddDim ? "Cancel" : "Add Dimension"}
          </button>
        </div>

        {showAddDim && (
          <div className="rounded-xl p-4 mb-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <p className="text-white font-semibold text-xs mb-2" style={{ fontFamily: POPPINS }}>New Dimension</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { key: "dimensionKey",     label: "Dimension Key (unique, e.g. goal_content)",   hint: "Unique identifier" },
                { key: "label",            label: "Display Label",                                hint: "e.g. Campaign Goal → Content Type" },
                { key: "brandField",       label: "Brand Field Key",                              hint: "Key in MatchmakingFieldOption, e.g. goal" },
                { key: "brandFieldLabel",  label: "Brand Field Label",                            hint: "e.g. Campaign Goal" },
                { key: "creatorField",     label: "Creator Field Key",                            hint: "Key in Creator Field Options, e.g. contentType" },
                { key: "creatorFieldLabel",label: "Creator Field Label",                          hint: "e.g. Content Type" },
                { key: "scoringParam",     label: "Scoring Param",                                hint: "Key in ScoringWeight, e.g. goal" },
                { key: "briefKey",         label: "Brief Key",                                    hint: "req.body field, e.g. campaignGoal" },
                { key: "creatorColumn",    label: "Creator DB Column",                            hint: "Creator table column, e.g. contentType" },
              ].map(({ key, label, hint }) => (
                <div key={key}>
                  <p className="text-gray-400 text-[10px] mb-0.5" style={{ fontFamily: POPPINS }}>{label}</p>
                  <input value={(dimForm as any)[key]} onChange={e => setDimForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={hint} className={inputCls} style={inputSty} />
                </div>
              ))}
            </div>
            {dimMsg && <p className={`text-xs ${dimMsg.includes("!") ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>{dimMsg}</p>}
            <button onClick={saveDim} disabled={savingDim}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40"
              style={{ background: PINK, fontFamily: POPPINS }}>
              {savingDim ? "Adding…" : "Add Dimension"}
            </button>
          </div>
        )}

        {dimMsg && !showAddDim && <p className="text-green-400 text-xs mb-2" style={{ fontFamily: POPPINS }}>{dimMsg}</p>}

        {loadingDims ? (
          <p className="text-gray-400 text-xs" style={{ fontFamily: POPPINS }}>Loading…</p>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            {dimensions.length === 0 ? (
              <p className="text-gray-400 text-xs px-4 py-3" style={{ fontFamily: POPPINS }}>No dimensions yet. Click "Add Dimension" to create the first one.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {dimensions.map(dim => (
                  <div key={dim.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white text-xs font-semibold" style={{ fontFamily: POPPINS }}>{dim.label}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(240,24,122,0.15)", color: PINK, fontFamily: POPPINS }}>{dim.dimensionKey}</span>
                        {!dim.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70">inactive</span>}
                      </div>
                      <p className="text-gray-400 text-[10px] mt-0.5" style={{ fontFamily: POPPINS }}>
                        Brand: <span className="text-white/80">{dim.brandField}</span> · Creator: <span className="text-white/80">{dim.creatorField}</span> · Param: <span className="text-white/80">{dim.scoringParam}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Toggle on={dim.isActive} onToggle={() => toggleDimActive(dim)} />
                      <button onClick={() => deleteDim(dim.id)} disabled={deletingDim === dim.id} className="disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5 text-red-500/60 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Creator Field Options ── */}
      <div>
        <h3 className="text-white font-bold text-sm mb-1" style={{ fontFamily: POPPINS }}>Creator Field Options</h3>
        <p className="text-gray-400 text-xs mb-4" style={{ fontFamily: POPPINS }}>
          These are the admin-managed options for creator-side fields (e.g. Content Type, Audience Type). They appear as columns in the Match Mapping matrix and as the source of truth for the scoring engine — changes here instantly reflect everywhere.
        </p>

        {uniqueCreatorFields.length === 0 ? (
          <p className="text-gray-400 text-xs" style={{ fontFamily: POPPINS }}>No creator fields defined yet. Add a dimension above first.</p>
        ) : (
          <div className="space-y-4">
            {uniqueCreatorFields.map(fieldKey => {
              const opts = cfOptsByField(fieldKey);
              const form = addCfOpt[fieldKey] ?? { label: "", value: "" };
              const isSaving = savingCf[fieldKey];
              const showMsg = cfMsg?.key === fieldKey;
              const dimUsingField = dimensions.find(d => d.creatorField === fieldKey);
              return (
                <div key={fieldKey} className="rounded-xl border border-white/10 overflow-hidden">
                  <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <p className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>{dimUsingField?.creatorFieldLabel ?? fieldKey}</p>
                    <p className="text-gray-400 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>field key: {fieldKey}</p>
                  </div>
                  <div className="divide-y divide-white/5">
                    {opts.map(opt => (
                      <div key={opt.id} className="flex items-center gap-3 px-4 py-2.5">
                        {editingCf[opt.id] !== undefined ? (
                          <>
                            <input autoFocus value={editingCf[opt.id]} onChange={e => setEditingCf(p => ({ ...p, [opt.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") saveCfEdit(opt.id); if (e.key === "Escape") setEditingCf(p => { const n = { ...p }; delete n[opt.id]; return n; }); }}
                              className="flex-1 bg-white/10 rounded px-3 py-1.5 text-white text-sm outline-none" style={{ border: `1px solid ${PINK}66` }} />
                            <button onClick={() => saveCfEdit(opt.id)}><Check className="w-4 h-4 text-green-400" /></button>
                            <button onClick={() => setEditingCf(p => { const n = { ...p }; delete n[opt.id]; return n; })}><X className="w-4 h-4 text-red-400" /></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-white text-sm" style={{ fontFamily: POPPINS }}>{opt.label}</span>
                            <span className="text-gray-500 text-xs" style={{ fontFamily: POPPINS }}>{opt.value}</span>
                            <button onClick={() => setEditingCf(p => ({ ...p, [opt.id]: opt.label }))}><Edit2 className="w-3.5 h-3.5 text-gray-400 hover:text-white" /></button>
                            <button onClick={() => deleteCfOption(opt.id)} disabled={deletingCf === opt.id} className="disabled:opacity-40"><Trash2 className="w-3.5 h-3.5 text-red-500/60 hover:text-red-400" /></button>
                          </>
                        )}
                      </div>
                    ))}
                    {opts.length === 0 && <p className="text-gray-500 text-xs px-4 py-2.5" style={{ fontFamily: POPPINS }}>No options yet.</p>}
                  </div>
                  <div className="px-4 py-3 space-y-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {showMsg && <p className={`text-xs ${cfMsg!.text === "Added" ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>{cfMsg!.text}</p>}
                    <div className="flex gap-2">
                      <input placeholder="Option label…" value={form.label} onChange={e => setAddCfOpt(p => ({ ...p, [fieldKey]: { ...form, label: e.target.value } }))}
                        onKeyDown={e => { if (e.key === "Enter") addCfOption(fieldKey); }}
                        className="flex-1 rounded-lg px-3 py-1.5 text-white text-sm outline-none placeholder-gray-600"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }} />
                      <button onClick={() => addCfOption(fieldKey)} disabled={isSaving || !form.label.trim()}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 flex items-center gap-1"
                        style={{ background: PINK, fontFamily: POPPINS }}>
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 3: Field Options ──────────────────────────────────────────────────────

interface FieldSection { key: string; label: string; }

function TabFieldOptions() {
  const { adminFetch } = useAdminAuth();
  const [sections, setSections] = useState<FieldSection[]>([]);
  const [optsByField, setOptsByField] = useState<Record<string, FieldOption[]>>({});
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [editingHeading, setEditingHeading] = useState<Record<string, string>>({});
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSection, setNewSection] = useState({ key: "", label: "" });
  const [savingSection, setSavingSection] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function loadOpts() {
    const r = await adminFetch("/api/admin/matchmaking/options");
    if (!r.ok) return;
    const all: FieldOption[] = await r.json();
    const grouped: Record<string, FieldOption[]> = {};
    for (const o of all) {
      if (!grouped[o.field]) grouped[o.field] = [];
      grouped[o.field].push(o);
    }
    for (const k in grouped) grouped[k].sort((a, b) => a.displayOrder - b.displayOrder);
    setOptsByField(grouped);
  }

  async function loadSections() {
    const r = await adminFetch("/api/admin/matchmaking/field-sections");
    if (r.ok) setSections(await r.json());
  }

  useEffect(() => { loadOpts(); loadSections(); }, []);

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 2500);
  }

  function getLabel(key: string) {
    return sections.find(s => s.key === key)?.label ?? key;
  }

  async function persistSections(updated: FieldSection[]) {
    await adminFetch("/api/admin/matchmaking/field-sections", { method: "PUT", body: JSON.stringify(updated) });
    setSections(updated);
  }

  async function addOption(field: string) {
    const label = (adding[field] ?? "").trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const r = await adminFetch("/api/admin/matchmaking/options", {
      method: "POST", body: JSON.stringify({ field, label, value }),
    });
    if (r.ok) { setAdding(p => ({ ...p, [field]: "" })); flash("Option added", true); loadOpts(); }
    else { const e = await r.json(); flash(e.error ?? "Error adding option", false); }
  }

  async function deleteOption(id: string) {
    await adminFetch(`/api/admin/matchmaking/options/${id}`, { method: "DELETE" });
    loadOpts();
  }

  async function deleteGroup(key: string) {
    if (!confirm(`Delete the entire "${getLabel(key)}" section and all its options? This cannot be undone.`)) return;
    setDeletingGroup(key);
    // DELETE /options-field/:key already removes from sections list on the server
    await adminFetch(`/api/admin/matchmaking/options-field/${key}`, { method: "DELETE" });
    setDeletingGroup(null);
    flash("Section deleted", true);
    loadOpts();
    loadSections(); // server already removed it, re-fetch to sync
  }

  async function saveEdit(id: string) {
    const label = (editing[id] ?? "").trim();
    if (!label) return;
    await adminFetch(`/api/admin/matchmaking/options/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
    setEditing(p => { const n = { ...p }; delete n[id]; return n; });
    loadOpts();
  }

  async function saveHeading(key: string) {
    const label = (editingHeading[key] ?? "").trim();
    if (!label) return;
    const updated = sections.map(s => s.key === key ? { ...s, label } : s);
    const r = await adminFetch("/api/admin/matchmaking/field-sections", { method: "PUT", body: JSON.stringify(updated) });
    if (r.ok) {
      setSections(updated);
      setEditingHeading(p => { const n = { ...p }; delete n[key]; return n; });
      flash("Heading saved", true);
    } else {
      flash("Error saving heading", false);
    }
  }

  async function addSection() {
    const key = newSection.key.trim().replace(/\s+/g, "_");
    const label = newSection.label.trim();
    if (!key || !label) { flash("Both field key and label are required", false); return; }
    if (sections.some(s => s.key === key)) { flash("A section with this field key already exists", false); return; }
    setSavingSection(true);
    const updated = [...sections, { key, label }];
    const r = await adminFetch("/api/admin/matchmaking/field-sections", { method: "PUT", body: JSON.stringify(updated) });
    setSavingSection(false);
    if (r.ok) {
      setSections(updated);
      setNewSection({ key: "", label: "" });
      setShowAddSection(false);
      flash("Section added", true);
    } else {
      flash("Error adding section", false);
    }
  }

  async function move(opts: FieldOption[], idx: number, dir: -1 | 1) {
    const a = opts[idx]; const b = opts[idx + dir];
    if (!a || !b) return;
    await Promise.all([
      adminFetch(`/api/admin/matchmaking/options/${a.id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: b.displayOrder }) }),
      adminFetch(`/api/admin/matchmaking/options/${b.id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: a.displayOrder }) }),
    ]);
    loadOpts();
  }

  const inputSty = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" } as const;

  return (
    <div className="space-y-6 pb-12">
      {/* ── header row ── */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-gray-300 text-sm" style={{ fontFamily: POPPINS }}>
          These options appear when brands fill the matchmaking brief. Each section is one dropdown field. Delete a section to remove it entirely from both the admin panel and brand brief.
        </p>
        <button
          onClick={() => setShowAddSection(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
          style={{ background: PINK, fontFamily: POPPINS }}
        >
          <Plus className="w-3.5 h-3.5" /> {showAddSection ? "Cancel" : "Add Section"}
        </button>
      </div>

      {/* ── Add section form ── */}
      {showAddSection && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <p className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>New Section</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-gray-400 text-[10px] mb-1" style={{ fontFamily: POPPINS }}>Section Heading (display label)</p>
              <input
                placeholder="e.g. Target Creator Age"
                value={newSection.label}
                onChange={e => setNewSection(p => ({ ...p, label: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") addSection(); }}
                className="w-full rounded-lg px-3 py-1.5 text-white text-sm outline-none placeholder-gray-600"
                style={inputSty}
              />
            </div>
            <div>
              <p className="text-gray-400 text-[10px] mb-1" style={{ fontFamily: POPPINS }}>Field Key (unique, no spaces — used in scoring)</p>
              <input
                placeholder="e.g. creatorAge"
                value={newSection.key}
                onChange={e => setNewSection(p => ({ ...p, key: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") addSection(); }}
                className="w-full rounded-lg px-3 py-1.5 text-white text-sm outline-none placeholder-gray-600"
                style={inputSty}
              />
            </div>
          </div>
          <button
            onClick={addSection}
            disabled={savingSection || !newSection.key.trim() || !newSection.label.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 flex items-center gap-1"
            style={{ background: PINK, fontFamily: POPPINS }}
          >
            <Plus className="w-3.5 h-3.5" /> {savingSection ? "Adding…" : "Add Section"}
          </button>
        </div>
      )}

      {msg && (
        <p className={`text-sm font-semibold ${msg.ok ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>
          {msg.text}
        </p>
      )}

      {/* ── Sections list ── */}
      {sections.length === 0 && (
        <p className="text-gray-400 text-sm" style={{ fontFamily: POPPINS }}>No sections yet. Click "Add Section" to create the first one.</p>
      )}

      {sections.map(sec => {
        const opts = optsByField[sec.key] ?? [];
        const isEditingHeading = editingHeading[sec.key] !== undefined;
        const isDeletingGroup = deletingGroup === sec.key;

        return (
          <div key={sec.key} className="rounded-xl border border-white/10 overflow-hidden">
            {/* ── Section header ── */}
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="flex-1 min-w-0">
                {isEditingHeading ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editingHeading[sec.key]}
                      onChange={e => setEditingHeading(p => ({ ...p, [sec.key]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveHeading(sec.key);
                        if (e.key === "Escape") setEditingHeading(p => { const n = { ...p }; delete n[sec.key]; return n; });
                      }}
                      className="rounded-lg px-3 py-1 text-white text-sm font-semibold outline-none"
                      style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${PINK}66`, minWidth: 180 }}
                    />
                    <button onClick={() => saveHeading(sec.key)} title="Save"><Check className="w-4 h-4 text-green-400" /></button>
                    <button onClick={() => setEditingHeading(p => { const n = { ...p }; delete n[sec.key]; return n; })} title="Cancel"><X className="w-4 h-4 text-white/70" /></button>
                  </div>
                ) : (
                  <p className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>{sec.label}</p>
                )}
                <p className="text-gray-400 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>field: {sec.key}</p>
              </div>

              {!isEditingHeading && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setEditingHeading(p => ({ ...p, [sec.key]: sec.label }))}
                    title="Edit heading"
                    className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
                  </button>
                  <button
                    onClick={() => deleteGroup(sec.key)}
                    disabled={isDeletingGroup}
                    title="Delete this entire section"
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500/60 hover:text-red-400" />
                  </button>
                </div>
              )}
            </div>

            {/* ── Options list ── */}
            <div className="divide-y divide-white/5">
              {opts.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => move(opts, i, -1)} disabled={i === 0}>
                      <ChevronUp className="w-3.5 h-3.5 text-white/70 hover:text-white disabled:opacity-20" />
                    </button>
                    <button onClick={() => move(opts, i, 1)} disabled={i === opts.length - 1}>
                      <ChevronDown className="w-3.5 h-3.5 text-white/70 hover:text-white disabled:opacity-20" />
                    </button>
                  </div>
                  {editing[opt.id] !== undefined ? (
                    <>
                      <input autoFocus value={editing[opt.id]}
                        onChange={e => setEditing(p => ({ ...p, [opt.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === "Enter") saveEdit(opt.id);
                          if (e.key === "Escape") setEditing(p => { const n = { ...p }; delete n[opt.id]; return n; });
                        }}
                        className="flex-1 bg-white/10 rounded px-3 py-1.5 text-white text-sm outline-none"
                        style={{ border: "1px solid rgba(240,24,122,0.40)" }} />
                      <button onClick={() => saveEdit(opt.id)}><Check className="w-4 h-4 text-green-400" /></button>
                      <button onClick={() => setEditing(p => { const n = { ...p }; delete n[opt.id]; return n; })}><X className="w-4 h-4 text-red-400" /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-white text-sm" style={{ fontFamily: POPPINS }}>{opt.label}</span>
                      <span className="text-gray-500 text-xs" style={{ fontFamily: POPPINS }}>{opt.value}</span>
                      <button onClick={() => setEditing(p => ({ ...p, [opt.id]: opt.label }))}><Edit2 className="w-3.5 h-3.5 text-gray-400 hover:text-white" /></button>
                      <button onClick={() => deleteOption(opt.id)}><Trash2 className="w-3.5 h-3.5 text-red-500/60 hover:text-red-400" /></button>
                    </>
                  )}
                </div>
              ))}
              {opts.length === 0 && (
                <p className="text-gray-500 text-xs px-4 py-3" style={{ fontFamily: POPPINS }}>No options yet. Add the first one below.</p>
              )}
            </div>

            {/* ── Add option row ── */}
            <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex gap-2">
                <input
                  placeholder="Add option label…"
                  value={adding[sec.key] ?? ""}
                  onChange={e => setAdding(p => ({ ...p, [sec.key]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") addOption(sec.key); }}
                  className="flex-1 rounded-lg px-3 py-1.5 text-white text-sm outline-none placeholder-gray-600"
                  style={inputSty}
                />
                <button
                  onClick={() => addOption(sec.key)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1"
                  style={{ background: PINK, fontFamily: POPPINS }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 2: Result Filters ─────────────────────────────────────────────────────

function TabResultFilters() {
  const { adminFetch } = useAdminAuth();
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/matchmaking/filters").then(r => r.ok ? r.json() : []).then(setFilters);
  }, []);

  function toggle(filterType: string) {
    setFilters(fs => fs.map(f => f.filterType === filterType ? { ...f, isActive: !f.isActive } : f));
  }

  async function save() {
    setSaving(true); setMsg(null);
    const r = await adminFetch("/api/admin/matchmaking/filters", {
      method: "PATCH", body: JSON.stringify({ filters: filters.map(f => ({ type: f.filterType, isActive: f.isActive })) }),
    });
    setSaving(false);
    setMsg(r.ok ? "Saved!" : "Error");
    setTimeout(() => setMsg(null), 2500);
  }

  return (
    <div>
      <p className="text-gray-300 text-sm mb-4" style={{ fontFamily: POPPINS }}>Choose which filters brands can use on matchmaking results.</p>
      <div className="rounded-xl border border-white/10 overflow-hidden mb-4">
        {filters.map((f, i) => (
          <div key={f.filterType} className="flex items-center justify-between px-5 py-3.5"
            style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
            <span className="text-white text-sm font-medium" style={{ fontFamily: POPPINS }}>{FILTER_LABELS[f.filterType] ?? f.filterType}</span>
            <Toggle on={f.isActive} onToggle={() => toggle(f.filterType)} />
          </div>
        ))}
      </div>
      {msg && <p className={`text-sm mb-2 ${msg === "Saved!" ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>{msg}</p>}
      <button onClick={save} disabled={saving}
        className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
        style={{ background: PINK, fontFamily: POPPINS }}>
        {saving ? "Saving..." : "Save Filter Config"}
      </button>
    </div>
  );
}

// ── Tab 1: Category Adjacency ─────────────────────────────────────────────────

const ADJ_TYPES: Array<{ key: string; label: string; desc: string; labelA: string; labelB: string }> = [
  { key: "category", label: "Category Adjacencies", desc: "Related categories that earn partial (related) credit in scoring instead of no match", labelA: "Category A", labelB: "Category B" },
];

// Backend returns: { categoryAdjacency, goalAdjacency, locationAdjacency, customerTypeAdjacency }
// Each is an array with different col names; we normalise to { id, typeA, typeB, pts }
function normaliseAdj(rows: any[], colA: string, colB: string): AdjacencyRow[] {
  return rows
    .filter((r: any) => !r[colB] || r[colA] <= r[colB]) // show only one direction
    .map((r: any) => ({ id: r.id, typeA: r[colA], typeB: r[colB], pts: r.pts, adjacencyType: "" }));
}

function TabCategoryAdjacency() {
  const { adminFetch } = useAdminAuth();
  const [adjByType, setAdjByType] = useState<Record<string, AdjacencyRow[]>>({});
  const [addForm, setAddForm] = useState<Record<string, { a: string; b: string }>>({});
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await adminFetch("/api/admin/matchmaking/adjacency");
    if (!r.ok) { setLoading(false); return; }
    const d = await r.json();
    setAdjByType({
      category: normaliseAdj(d.categoryAdjacency ?? [], "categoryA", "categoryB"),
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function getForm(key: string) {
    return addForm[key] ?? { a: "", b: "" };
  }

  function setForm(key: string, patch: Partial<{ a: string; b: string }>) {
    setAddForm(p => ({ ...p, [key]: { ...getForm(key), ...patch } }));
  }

  async function add(key: string) {
    const f = getForm(key);
    if (!f.a.trim() || !f.b.trim()) return;
    setAdding(p => ({ ...p, [key]: true }));
    try {
      const r = await adminFetch("/api/admin/matchmaking/adjacency", {
        method: "POST",
        body: JSON.stringify({ type: key, entityA: f.a.trim(), entityB: f.b.trim() }),
      });
      if (r.ok) {
        setAddForm(p => ({ ...p, [key]: { a: "", b: "" } }));
        setMsg({ type: key, text: "Added" });
        load();
      } else {
        const e = await r.json();
        setMsg({ type: key, text: e.error ?? "Error adding" });
      }
    } finally {
      setAdding(p => ({ ...p, [key]: false }));
      setTimeout(() => setMsg(null), 2500);
    }
  }

  async function del(id: string, key: string) {
    setDeleting(p => ({ ...p, [id]: true }));
    try {
      await adminFetch(`/api/admin/matchmaking/adjacency/${id}?type=${key}`, { method: "DELETE" });
      load();
    } finally { setDeleting(p => ({ ...p, [id]: false })); }
  }

  if (loading) return <p className="text-gray-400 text-sm py-6">Loading…</p>;

  return (
    <div className="space-y-6 pb-10">
      <p className="text-gray-300 text-sm" style={{ fontFamily: POPPINS }}>
        Adjacencies define "related but not exact" matches. When the scorer finds a pair here, it awards partial points instead of no-match points. All pairs are bidirectional — add once, works both ways.
      </p>

      {ADJ_TYPES.map(({ key, label, desc, labelA, labelB }) => {
        const rows = adjByType[key] ?? [];
        const f = getForm(key);
        const isAdding = adding[key];
        const showMsg = msg?.type === key;

        return (
          <div key={key} className="rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>{label}</p>
              <p className="text-gray-400 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>{desc}</p>
            </div>

            {rows.length === 0 ? (
              <p className="text-gray-500 text-xs px-4 py-3" style={{ fontFamily: POPPINS }}>No adjacencies configured yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {rows.map(row => (
                  <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-white/80 text-sm flex-1" style={{ fontFamily: POPPINS }}>{row.typeA}</span>
                    <span className="text-white/70 text-xs">↔</span>
                    <span className="text-white/80 text-sm flex-1" style={{ fontFamily: POPPINS }}>{row.typeB}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(240,24,122,0.15)", color: PINK, fontFamily: POPPINS }}>{row.pts}pt</span>
                    <button onClick={() => del(row.id, key)} disabled={deleting[row.id]} className="flex-shrink-0 disabled:opacity-40">
                      <Trash2 className="w-3.5 h-3.5 text-red-500/60 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-3 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {showMsg && <p className={`text-xs ${msg!.text === "Added" ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>{msg!.text}</p>}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <p className="text-gray-400 text-[10px] mb-1" style={{ fontFamily: POPPINS }}>{labelA}</p>
                  <input value={f.a} onChange={e => setForm(key, { a: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") add(key); }}
                    placeholder={labelA}
                    className="w-full rounded-lg px-3 py-1.5 text-white text-xs outline-none placeholder-gray-600"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }} />
                </div>
                <span className="text-white/70 text-xs pb-2">↔</span>
                <div className="flex-1">
                  <p className="text-gray-400 text-[10px] mb-1" style={{ fontFamily: POPPINS }}>{labelB}</p>
                  <input value={f.b} onChange={e => setForm(key, { b: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") add(key); }}
                    placeholder={labelB}
                    className="w-full rounded-lg px-3 py-1.5 text-white text-xs outline-none placeholder-gray-600"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }} />
                </div>
                <button onClick={() => add(key)} disabled={isAdding || !f.a.trim() || !f.b.trim()}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 flex items-center gap-1"
                  style={{ background: PINK, fontFamily: POPPINS }}>
                  <Plus className="w-3.5 h-3.5" /> {isAdding ? "…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 4: Other Settings ─────────────────────────────────────────────────────

function TabOtherSettings() {
  const { adminFetch } = useAdminAuth();
  const [minScore, setMinScore] = useState(0);
  const [defaultCompletion, setDefaultCompletion] = useState(70);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch("/api/admin/matchmaking/settings").then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      setMinScore(d.minScore ?? 0);
      setDefaultCompletion(d.defaultCompletion ?? 70);
    });
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    const r = await adminFetch("/api/admin/matchmaking/settings", { method: "PATCH", body: JSON.stringify({ minScore, defaultCompletion }) });
    setSaving(false);
    setMsg(r.ok ? "Saved!" : "Error");
    setTimeout(() => setMsg(null), 2500);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 p-5">
        <h3 className="text-white font-semibold text-sm mb-4" style={{ fontFamily: POPPINS }}>Score Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-gray-300 text-xs mb-1.5 block" style={{ fontFamily: POPPINS }}>Minimum Score Threshold ({minScore}/100)</label>
            <input type="range" min={0} max={80} step={5} value={minScore} onChange={e => setMinScore(parseInt(e.target.value))} className="w-full accent-pink-500" />
            <p className="text-gray-400 text-xs mt-1" style={{ fontFamily: POPPINS }}>Creators below this score are hidden from results</p>
          </div>
          <div>
            <label className="text-gray-300 text-xs mb-1.5 block" style={{ fontFamily: POPPINS }}>Default Deal Completion Rate</label>
            <input type="number" min={0} max={100} value={defaultCompletion} onChange={e => setDefaultCompletion(parseInt(e.target.value) || 70)}
              className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }} />
            <p className="text-gray-400 text-xs mt-1" style={{ fontFamily: POPPINS }}>Used for new creators without deal history</p>
          </div>
        </div>
        {msg && <p className={`text-sm mt-3 ${msg === "Saved!" ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>{msg}</p>}
        <button onClick={save} disabled={saving} className="mt-4 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: PINK, fontFamily: POPPINS }}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ── Tab 5: Profile Visibility ──────────────────────────────────────────────────

function TabProfileVisibility() {
  const { adminFetch } = useAdminAuth();
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminFetch("/api/admin/partial-profile-visibility")
      .then(r => r.json()).then(d => setFields(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id: string, isVisible: boolean) => {
    setSaving(id);
    try {
      const r = await adminFetch(`/api/admin/partial-profile-visibility/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible }),
      });
      if (r.ok) { load(); setMsg("Saved"); setTimeout(() => setMsg(null), 2000); }
    } finally { setSaving(null); }
  };

  if (loading) return <p className="text-gray-400 text-sm py-6">Loading…</p>;

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h2 className="text-white font-semibold" style={{ fontFamily: POPPINS }}>Creator Profile Visibility</h2>
        <p className="text-gray-300 text-sm mt-1" style={{ fontFamily: POPPINS }}>Control which creator profile fields are visible to brands in search/matchmaking results before a deal is initiated.</p>
      </div>
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
      <div className="rounded-xl overflow-hidden border border-white/10">
        {fields.map((f, i) => (
          <div key={f.id} className="flex items-center justify-between px-5 py-3.5"
            style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderBottom: i < fields.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <div>
              <p className="text-white text-sm font-medium" style={{ fontFamily: POPPINS }}>{f.label}</p>
              <p className="text-gray-400 text-xs" style={{ fontFamily: POPPINS }}>{f.fieldKey}</p>
            </div>
            <Toggle on={f.isVisible} onToggle={() => toggle(f.id, !f.isVisible)} disabled={saving === f.id} />
          </div>
        ))}
      </div>
      <p className="text-gray-500 text-xs" style={{ fontFamily: POPPINS }}>Hidden fields remain in the database but are stripped from brand-facing API responses.</p>
    </div>
  );
}

// ── Tab 8: Match Preview ──────────────────────────────────────────────────────

const GENDER_OPTS = ["Male", "Female", "Mixed"];
const AGE_OPTS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];

function PreviewSelect({ label, value, opts, onChange }: { label: string; value: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-gray-400 text-[10px] mb-0.5" style={{ fontFamily: POPPINS }}>{label}</p>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-1.5 text-white text-xs outline-none"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: POPPINS }}>
        <option value="">— select —</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function PreviewInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="text-gray-400 text-[10px] mb-0.5" style={{ fontFamily: POPPINS }}>{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? ""}
        className="w-full rounded-lg px-3 py-1.5 text-white text-xs outline-none placeholder-gray-600"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: POPPINS }} />
    </div>
  );
}

interface PreviewResult { totalScore: number; maxTotal: number; percentage: number; breakdown: Array<{ param: string; label: string; pts: number; maxPts: number; reason: string }>; }

const PREVIEW_CAMPAIGN_GOAL_OPTS = [
  "Product Promotion & Reviews",
  "Brand Awareness & Viral Reach",
  "Lifestyle & Everyday Integration",
  "Educational & Informative Content",
];
const PREVIEW_CREATOR_GOAL_OPTS = [
  "i review or recommend products",
  "i create entertainment or viral content",
  "i share lifestyle content",
  "i create educational or informative content",
];
const PREVIEW_GENDER_OPTS = ["Male", "Female", "Mixed"];
const PREVIEW_AGE_OPTS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];

function TabMatchPreview() {
  const { adminFetch } = useAdminAuth();
  const [brand, setBrand] = useState({ productCategory: "", campaignGoal: "", targetGender: "", targetAge: "", targetLocation: "" });
  const [creator, setCreator] = useState({ campaignGoal: "", audienceLocation: "", audienceAge: "", audienceGenderFemale: "", audienceGenderMale: "", categoriesRaw: "" });
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runPreview() {
    setRunning(true); setErr(null); setResult(null);
    const r = await adminFetch("/api/admin/matchmaking/preview", {
      method: "POST",
      body: JSON.stringify({
        brand: {
          productCategory: brand.productCategory || undefined,
          campaignGoal: brand.campaignGoal || undefined,
          targetGender: brand.targetGender || undefined,
          targetAge: brand.targetAge || undefined,
          targetLocation: brand.targetLocation || undefined,
        },
        creator: {
          campaignGoal: creator.campaignGoal || undefined,
          audienceLocation: creator.audienceLocation || undefined,
          audienceAge: creator.audienceAge || undefined,
          audienceGenderFemale: creator.audienceGenderFemale ? Number(creator.audienceGenderFemale) : undefined,
          audienceGenderMale: creator.audienceGenderMale ? Number(creator.audienceGenderMale) : undefined,
          categories: creator.categoriesRaw.split(",").map(s => s.trim()).filter(Boolean),
        },
      }),
    });
    if (r.ok) { setResult(await r.json()); }
    else { try { const e = await r.json(); setErr(e.error ?? "Error"); } catch { setErr("Error"); } }
    setRunning(false);
  }

  const scoreColor = (pts: number, maxPts: number) => {
    const ratio = maxPts > 0 ? pts / maxPts : 0;
    if (ratio >= 1) return "#4ade80";
    if (ratio >= 0.5) return "#fbbf24";
    return "rgba(255,255,255,0.70)";
  };

  return (
    <div className="space-y-6 pb-12">
      <p className="text-gray-300 text-sm" style={{ fontFamily: POPPINS }}>
        Simulate a brand brief against a hypothetical creator to preview how each of the 5 scoring parameters contributes to the total match score.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Brand Brief */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <p className="text-white font-bold text-sm mb-1" style={{ fontFamily: POPPINS }}>Brand Brief</p>
          <PreviewInput  label="Product Category" value={brand.productCategory} onChange={v => setBrand(p => ({ ...p, productCategory: v }))} placeholder="e.g. Fashion" />
          <PreviewSelect label="Campaign Goal" value={brand.campaignGoal} opts={PREVIEW_CAMPAIGN_GOAL_OPTS} onChange={v => setBrand(p => ({ ...p, campaignGoal: v }))} />
          <PreviewSelect label="Target Gender" value={brand.targetGender} opts={PREVIEW_GENDER_OPTS} onChange={v => setBrand(p => ({ ...p, targetGender: v }))} />
          <PreviewSelect label="Target Age" value={brand.targetAge} opts={PREVIEW_AGE_OPTS} onChange={v => setBrand(p => ({ ...p, targetAge: v }))} />
          <PreviewInput  label="Target Location" value={brand.targetLocation} onChange={v => setBrand(p => ({ ...p, targetLocation: v }))} placeholder="e.g. Mumbai" />
        </div>

        {/* Creator Profile */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <p className="text-white font-bold text-sm mb-1" style={{ fontFamily: POPPINS }}>Creator Profile</p>
          <PreviewInput  label="Categories (comma-separated)" value={creator.categoriesRaw} onChange={v => setCreator(p => ({ ...p, categoriesRaw: v }))} placeholder="e.g. Fashion, Lifestyle" />
          <PreviewSelect label="Content Style (Campaign Goal)" value={creator.campaignGoal} opts={PREVIEW_CREATOR_GOAL_OPTS} onChange={v => setCreator(p => ({ ...p, campaignGoal: v }))} />
          <PreviewSelect label="Audience Age" value={creator.audienceAge} opts={PREVIEW_AGE_OPTS} onChange={v => setCreator(p => ({ ...p, audienceAge: v }))} />
          <PreviewInput  label="Audience % Female (0-100)" value={creator.audienceGenderFemale} onChange={v => setCreator(p => ({ ...p, audienceGenderFemale: v }))} placeholder="e.g. 62" />
          <PreviewInput  label="Audience % Male (0-100)" value={creator.audienceGenderMale} onChange={v => setCreator(p => ({ ...p, audienceGenderMale: v }))} placeholder="e.g. 38" />
          <PreviewInput  label="Audience Location" value={creator.audienceLocation} onChange={v => setCreator(p => ({ ...p, audienceLocation: v }))} placeholder="e.g. Mumbai" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={runPreview} disabled={running}
          className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-opacity"
          style={{ background: PINK, fontFamily: POPPINS }}>
          {running ? "Running…" : "Run Preview"}
        </button>
        {result && (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold" style={{ color: scoreColor(result.totalScore, result.maxTotal), fontFamily: POPPINS }}>
              {result.totalScore}
            </span>
            <span className="text-gray-400 text-sm" style={{ fontFamily: POPPINS }}>/ {result.maxTotal} pts ({result.percentage}%)</span>
          </div>
        )}
        {err && <p className="text-red-400 text-sm" style={{ fontFamily: POPPINS }}>{err}</p>}
      </div>

      {result && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.04)" }}>
            <p className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Score Breakdown</p>
          </div>
          <div className="divide-y divide-white/5">
            {result.breakdown.map(b => {
              const ratio = b.maxPts > 0 ? b.pts / b.maxPts : 0;
              const barWidth = Math.round(ratio * 100);
              const col = scoreColor(b.pts, b.maxPts);
              return (
                <div key={b.param} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>{b.label}</span>
                    <span className="text-xs font-bold" style={{ color: col, fontFamily: POPPINS }}>{b.pts} / {b.maxPts}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, background: col }} />
                  </div>
                  <p className="text-gray-400 text-[10px]" style={{ fontFamily: POPPINS }}>{b.reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
