import { useState, useEffect, useRef } from "react";
import { Users, BarChart2, Calendar, UserCheck, Target, MapPin, ChevronDown, Check } from "lucide-react";
import { POPPINS, PINK } from "@/components/BrandLayout";

/* The brand search filter bar, lifted so the campaign applicant lists can use
   the identical control. Same seven filters, same option source
   (/api/brand/search/filter-options) and same query-param names, so one bar can
   drive search and the campaign endpoints without translation.

   No price filter: campaigns don't negotiate off the rate card. */

export interface CreatorFilters {
  slabIds: string[];
  categoryIds: string[];
  creatorAges: string[];
  creatorGenders: string[];
  audienceAges: string[];
  audienceLocations: string[];
  creatorStates: string[];
}

export const EMPTY_CREATOR_FILTERS: CreatorFilters = {
  slabIds: [], categoryIds: [], creatorAges: [],
  creatorGenders: [], audienceAges: [], audienceLocations: [], creatorStates: [],
};

export interface FilterOptions {
  slabs: Array<{ id: string; label: string; minFollowers: number; maxFollowers: number | null }>;
  categories: Array<{ id: string; name: string }>;
  creatorAges: Array<{ label: string }>;
  creatorGenders: string[];
  audienceAges: string[];
  audienceLocations: string[];
  creatorStates: string[];
}

export function countActiveFilters(f: CreatorFilters): number {
  return f.slabIds.length + f.categoryIds.length + f.creatorAges.length +
    f.creatorGenders.length + f.audienceAges.length + f.audienceLocations.length +
    f.creatorStates.length;
}

/** Serialises to the same param names the search endpoint already accepts. */
export function creatorFilterParams(f: CreatorFilters): URLSearchParams {
  const p = new URLSearchParams();
  f.slabIds.forEach(v => p.append("slabId", v));
  f.categoryIds.forEach(v => p.append("category", v));
  f.creatorAges.forEach(v => p.append("creatorAge", v));
  f.creatorGenders.forEach(v => p.append("creatorGender", v));
  f.audienceAges.forEach(v => p.append("audienceAge", v));
  f.audienceLocations.forEach(v => p.append("audienceLocation", v));
  f.creatorStates.forEach(v => p.append("creatorState", v));
  return p;
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function FilterRow({ label, icon, active, open, onToggle, onClose, activeLabel, children }: {
  label: string; icon: React.ReactNode; active: boolean; open: boolean;
  onToggle: () => void; onClose: () => void; activeLabel: string | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /* Stable ref to the latest onClose so the effect never depends on it: an
     inline arrow changes identity every render, which would tear down and
     re-add the listener constantly and silently drop option clicks. */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    // A CSS-hidden copy (the mobile row on desktop) must not grab the handler.
    if (ref.current && ref.current.offsetParent === null) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <p className="text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.75)", fontFamily: POPPINS }}>
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
          fontFamily: POPPINS, cursor: "pointer",
        }}
      >
        {icon}
        <span className="flex-1 text-left text-xs"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeLabel ?? "Select"}
        </span>
        <ChevronDown size={14}
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 999,
          minWidth: "100%", maxHeight: 260, overflowY: "auto",
          background: "#1A1A28", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14, padding: 8, boxShadow: "0 12px 36px rgba(0,0,0,0.60)",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MultiPicker({ options, values, onToggle: onTog }: {
  options: { value: string; label: string }[]; values: string[]; onToggle: (v: string) => void;
}) {
  if (options.length === 0) {
    return <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, padding: "8px 10px", fontFamily: POPPINS }}>No options</p>;
  }
  return (
    <div>
      {options.map(o => {
        const sel = values.includes(o.value);
        return (
          <button key={o.value} onClick={() => onTog(o.value)}
            style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", background: sel ? "rgba(240,24,122,0.10)" : "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: POPPINS, color: sel ? PINK : "rgba(255,255,255,0.80)" }}>
            {o.label}
            {sel && <Check size={13} color={PINK} />}
          </button>
        );
      })}
    </div>
  );
}

function StateFilterPicker({ states, values, onToggle: onTog }: {
  states: string[]; values: string[]; onToggle: (v: string) => void;
}) {
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
            <button key={s} onClick={() => onTog(s)}
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

export default function CreatorFilterBar({ opts, filters, onChange }: {
  opts: FilterOptions | null;
  filters: CreatorFilters;
  /** Called with the next filter set. Callers reset to page 1 here. */
  onChange: (next: CreatorFilters) => void;
}) {
  const [openPill, setOpenPill] = useState<string | null>(null);
  const active = countActiveFilters(filters);

  const set = (patch: Partial<CreatorFilters>) => onChange({ ...filters, ...patch });

  const PILL_DEFS = [
    { key: "followers",        label: "Followers",            icon: <Users size={13} color={PINK} /> },
    { key: "category",         label: "Category of Content",  icon: <BarChart2 size={13} color={PINK} /> },
    { key: "creatorAge",       label: "Creator's Age",        icon: <Calendar size={13} color={PINK} /> },
    { key: "creatorGender",    label: "Creator's Gender",     icon: <UserCheck size={13} color={PINK} /> },
    { key: "audienceAge",      label: "Audience's Age",       icon: <Target size={13} color={PINK} /> },
    { key: "audienceLocation", label: "Audience's Location",  icon: <MapPin size={13} color={PINK} /> },
    { key: "creatorState",     label: "Creator's State / UT", icon: <MapPin size={13} color={PINK} /> },
  ];

  function activeLabel(key: string): string | null {
    const many = (n: number, one: () => string) => n === 0 ? null : n === 1 ? one() : `${n} selected`;
    if (key === "followers") return many(filters.slabIds.length, () => opts?.slabs.find(s => s.id === filters.slabIds[0])?.label ?? "1 selected");
    if (key === "category") return many(filters.categoryIds.length, () => opts?.categories.find(c => c.id === filters.categoryIds[0])?.name ?? "1 selected");
    if (key === "creatorAge") return many(filters.creatorAges.length, () => filters.creatorAges[0]!);
    if (key === "creatorGender") return many(filters.creatorGenders.length, () => filters.creatorGenders[0]!);
    if (key === "audienceAge") return many(filters.audienceAges.length, () => filters.audienceAges[0]!);
    if (key === "audienceLocation") return many(filters.audienceLocations.length, () => filters.audienceLocations[0]!);
    if (key === "creatorState") return many(filters.creatorStates.length, () => filters.creatorStates[0]!);
    return null;
  }

  function content(key: string) {
    if (key === "followers") return (
      <MultiPicker
        options={opts?.slabs.map(s => ({ value: s.id, label: `${s.label} (${formatFollowers(s.minFollowers)}${s.maxFollowers ? `–${formatFollowers(s.maxFollowers)}` : "+"})` })) ?? []}
        values={filters.slabIds}
        onToggle={v => set({ slabIds: toggle(filters.slabIds, v) })} />
    );
    if (key === "category") return (
      <MultiPicker
        options={opts?.categories.map(c => ({ value: c.id, label: c.name })) ?? []}
        values={filters.categoryIds}
        onToggle={v => set({ categoryIds: toggle(filters.categoryIds, v) })} />
    );
    if (key === "creatorAge") return (
      <MultiPicker
        options={opts?.creatorAges.map(a => ({ value: a.label, label: a.label })) ?? []}
        values={filters.creatorAges}
        onToggle={v => set({ creatorAges: toggle(filters.creatorAges, v) })} />
    );
    if (key === "creatorGender") return (
      <MultiPicker
        options={opts?.creatorGenders.map(g => ({ value: g, label: g.charAt(0) + g.slice(1).toLowerCase() })) ?? []}
        values={filters.creatorGenders}
        onToggle={v => set({ creatorGenders: toggle(filters.creatorGenders, v) })} />
    );
    if (key === "audienceAge") return (
      <MultiPicker
        options={opts?.audienceAges.map(a => ({ value: a, label: a })) ?? []}
        values={filters.audienceAges}
        onToggle={v => set({ audienceAges: toggle(filters.audienceAges, v) })} />
    );
    if (key === "audienceLocation") return (
      <MultiPicker
        options={opts?.audienceLocations.map(l => ({ value: l, label: l })) ?? []}
        values={filters.audienceLocations}
        onToggle={v => set({ audienceLocations: toggle(filters.audienceLocations, v) })} />
    );
    if (key === "creatorState") return (
      <StateFilterPicker
        states={opts?.creatorStates ?? []}
        values={filters.creatorStates}
        onToggle={v => set({ creatorStates: toggle(filters.creatorStates, v) })} />
    );
    return null;
  }

  return (
    <div className="rounded-2xl p-4 mb-4" style={{ background: "#16161B", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Filter Creators</p>
        {active > 0 && (
          <button
            onClick={() => { onChange(EMPTY_CREATOR_FILTERS); setOpenPill(null); }}
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ color: PINK, background: "rgba(240,24,122,0.12)", border: "none", cursor: "pointer", fontFamily: POPPINS }}>
            Clear all ({active})
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {PILL_DEFS.map(pd => (
          <FilterRow
            key={pd.key}
            label={pd.label}
            icon={pd.icon}
            active={!!activeLabel(pd.key)}
            open={openPill === pd.key}
            onToggle={() => setOpenPill(p => p === pd.key ? null : pd.key)}
            onClose={() => setOpenPill(null)}
            activeLabel={activeLabel(pd.key)}
          >
            {content(pd.key)}
          </FilterRow>
        ))}
      </div>
    </div>
  );
}
