import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Save, Eye, Upload, ArrowLeft, Plus, Trash2, AlertCircle } from "lucide-react";
import { CREATOR_DEFAULTS, CREATOR_LANDING_UPDATE_CHANNEL, writeCreatorLandingCache } from "@/hooks/useCreatorLandingContent";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function notifyCreatorPage() {
  try { new BroadcastChannel(CREATOR_LANDING_UPDATE_CHANNEL).postMessage("update"); } catch { /* ignore */ }
}

interface ContentItem {
  key: string;
  value: string;
  type: "text" | "image" | "color" | "json";
  section: string;
}

interface EarningsCard { value: string; label: string; }
interface CollabMode { num: string; title: string; desc: string; steps: string[]; }
interface ComparisonRow { feature: string; old: string; collabry: string; }

const EDITOR_CACHE_KEY = "collabry_creator_editor_v1";

function buildDefaults(): Record<string, ContentItem> {
  const result: Record<string, ContentItem> = {};
  for (const [key, value] of Object.entries(CREATOR_DEFAULTS)) {
    const parts = key.split(".");
    const section = parts.slice(0, 2).join(".");
    const type = (value.startsWith("[") || value.startsWith("{")) ? "json" : "text";
    result[key] = { key, value, type: type as ContentItem["type"], section };
  }
  return result;
}

function loadCached(): Record<string, ContentItem> {
  try {
    const raw = localStorage.getItem(EDITOR_CACHE_KEY);
    if (raw) return { ...buildDefaults(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return buildDefaults();
}

function saveCache(c: Record<string, ContentItem>) {
  try { localStorage.setItem(EDITOR_CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111118] border border-white/10 rounded-2xl p-6">
      <h2 className="text-white font-semibold text-base mb-6 pb-4 border-b border-white/10">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function FieldRow({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div>
      <label className="text-[#9CA3AF] text-xs font-medium mb-1.5 block">{label}</label>
      {multiline ? (
        <textarea
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-[#E14F69]/50 focus:outline-none leading-relaxed"
          rows={3} value={value} onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
          value={value} onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export default function AdminCreatorLandingEditor() {
  const [content, setContent] = useState<Record<string, ContentItem>>(loadCached);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const loadContent = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/landing-content`);
      if (!res.ok) return;
      const items = (await res.json()) as ContentItem[];
      const creatorItems = items.filter((i) => i.key.startsWith("creator."));
      const merged = buildDefaults();
      creatorItems.forEach((item) => { merged[item.key] = item; });
      setContent(merged);
      saveCache(merged);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadContent(); }, [loadContent]);

  const updateField = (key: string, value: string) => {
    setContent((prev) => {
      const next = { ...prev, [key]: { ...prev[key], value } };
      saveCache(next);
      return next;
    });
    setHasUnsaved(true);
  };

  const updateJsonArray = (key: string, arr: unknown[]) => updateField(key, JSON.stringify(arr));


  const g = (key: string) => content[key]?.value ?? CREATOR_DEFAULTS[key] ?? "";
  const gj = <T,>(key: string): T => { try { return JSON.parse(g(key)) as T; } catch { return [] as unknown as T; } };

  const earningsCards: EarningsCard[] = gj("creator.earnings.cards");
  const collabModes: CollabMode[] = gj("creator.collab_modes.modes");
  const compRows: ComparisonRow[] = gj("creator.comparison.rows");

  const saveAll = async (): Promise<boolean> => {
    setSaving(true);
    const items = Object.values(content);
    writeCreatorLandingCache(items);
    saveCache(content);
    try {
      const res = await fetch(`${BASE_URL}/api/landing-content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (!res.ok) throw new Error("Save failed");
      setHasUnsaved(false);
      setPreviewKey((k) => k + 1);
      notifyCreatorPage();
      setStatus({ type: "success", message: "Draft saved" });
      setTimeout(() => setStatus(null), 3000);
      return true;
    } catch {
      setStatus({ type: "error", message: "Failed to save" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    const ok = await saveAll();
    setPublishing(false);
    if (ok) {
      setStatus({ type: "success", message: "Published! Changes are now live on /creator." });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin-collabryangad" className="text-[#9CA3AF] hover:text-white transition-colors flex items-center gap-1.5 text-sm">
              <ArrowLeft className="w-4 h-4" />
              Admin Panel
            </Link>
            <span className="text-white/70">|</span>
            <h1 className="text-white font-semibold text-sm">Creator Landing Page Editor</h1>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsaved && (
              <span className="text-yellow-400 text-xs flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Unpublished changes
              </span>
            )}
            <button onClick={() => setShowPreview(!showPreview)}
              className="text-[#9CA3AF] hover:text-white text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
              <Eye className="w-4 h-4" />
              {showPreview ? "Edit" : "Preview"}
            </button>
            <button onClick={saveAll} disabled={saving || !hasUnsaved}
              className="text-white text-sm flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-40">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button onClick={publish} disabled={publishing}
              className="text-white text-sm flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#E14F69] hover:bg-[#d4156b] transition-colors disabled:opacity-60">
              <Upload className="w-4 h-4" />
              {publishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
      </header>

      {status && (
        <div className="mx-auto max-w-7xl px-4 mt-4">
          <div className={`rounded-lg px-4 py-2.5 text-sm ${status.type === "success" ? "bg-green-900/50 text-green-300 border border-green-800" : "bg-red-900/50 text-red-300 border border-red-800"}`}>
            {status.message}
          </div>
        </div>
      )}

      {showPreview ? (
        <div className="border-2 border-[#E14F69]/30 rounded-xl m-4 overflow-hidden">
          <iframe key={previewKey} src={`${BASE_URL}/creator`} className="w-full h-[85vh]" />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">

          {/* Header */}
          <SectionBlock title="Header">
            <FieldRow label="Logo Text" value={g("creator.header.logo_text")} onChange={(v) => updateField("creator.header.logo_text", v)} />
            <FieldRow label="Creator Sign Up Button Text" value={g("creator.header.signup_btn_creator")} onChange={(v) => updateField("creator.header.signup_btn_creator", v)} />
            <FieldRow label="Brand Sign Up Button Text" value={g("creator.header.signup_btn_brand")} onChange={(v) => updateField("creator.header.signup_btn_brand", v)} />
          </SectionBlock>

          {/* Hero */}
          <SectionBlock title="Hero Section">
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Heading Line 1 (white)" value={g("creator.hero.heading_line1")} onChange={(v) => updateField("creator.hero.heading_line1", v)} />
              <FieldRow label="Heading Highlight 1 (pink)" value={g("creator.hero.heading_highlight1")} onChange={(v) => updateField("creator.hero.heading_highlight1", v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Heading Line 2 (white)" value={g("creator.hero.heading_line2")} onChange={(v) => updateField("creator.hero.heading_line2", v)} />
              <FieldRow label="Heading Highlight 2 (pink)" value={g("creator.hero.heading_highlight2")} onChange={(v) => updateField("creator.hero.heading_highlight2", v)} />
            </div>
            <FieldRow label="Subheading (gray)" value={g("creator.hero.subheading")} onChange={(v) => updateField("creator.hero.subheading", v)} multiline />
            <FieldRow label="Tagline (bold white)" value={g("creator.hero.tagline")} onChange={(v) => updateField("creator.hero.tagline", v)} />
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="CTA Button Text" value={g("creator.hero.cta_btn")} onChange={(v) => updateField("creator.hero.cta_btn", v)} />
              <FieldRow label="CTA Button Link" value={g("creator.hero.cta_link")} onChange={(v) => updateField("creator.hero.cta_link", v)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FieldRow label="Trust Badge 1" value={g("creator.hero.badge1")} onChange={(v) => updateField("creator.hero.badge1", v)} />
              <FieldRow label="Trust Badge 2" value={g("creator.hero.badge2")} onChange={(v) => updateField("creator.hero.badge2", v)} />
              <FieldRow label="Trust Badge 3" value={g("creator.hero.badge3")} onChange={(v) => updateField("creator.hero.badge3", v)} />
            </div>
          </SectionBlock>

          {/* Earnings & Safety */}
          <SectionBlock title="Earnings & Safety Section">
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Heading (pink)" value={g("creator.earnings.heading_line1")} onChange={(v) => updateField("creator.earnings.heading_line1", v)} />
              <FieldRow label="Heading suffix (white)" value={g("creator.earnings.heading_highlight1")} onChange={(v) => updateField("creator.earnings.heading_highlight1", v)} />
            </div>
            <FieldRow label="Subheading" value={g("creator.earnings.subheading")} onChange={(v) => updateField("creator.earnings.subheading", v)} />
            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-wider mt-6 mb-3">Stat Cards</h4>
            {earningsCards.map((card, i) => (
              <div key={i} className="grid grid-cols-[160px_1fr_auto] gap-3 mb-3 items-start">
                <input
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Value / Title" value={card.value}
                  onChange={(e) => { const c = [...earningsCards]; c[i] = { ...c[i], value: e.target.value }; updateJsonArray("creator.earnings.cards", c); }} />
                <input
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Description" value={card.label}
                  onChange={(e) => { const c = [...earningsCards]; c[i] = { ...c[i], label: e.target.value }; updateJsonArray("creator.earnings.cards", c); }} />
                <button onClick={() => { const c = earningsCards.filter((_, idx) => idx !== i); updateJsonArray("creator.earnings.cards", c); }}
                  className="text-red-400 hover:text-red-300 p-2 mt-0.5"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => updateJsonArray("creator.earnings.cards", [...earningsCards, { value: "", label: "" }])}
              className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-2 hover:text-[#d4156b]">
              <Plus className="w-4 h-4" /> Add Card
            </button>
            <FieldRow label="Closing Bold Line" value={g("creator.earnings.closing_line")} onChange={(v) => updateField("creator.earnings.closing_line", v)} multiline />
          </SectionBlock>

          {/* 4 Ways to Get Discovered */}
          <SectionBlock title="4 Ways to Get Discovered">
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Section Heading (white)" value={g("creator.collab_modes.heading_line1")} onChange={(v) => updateField("creator.collab_modes.heading_line1", v)} />
              <FieldRow label="Section Highlight (pink)" value={g("creator.collab_modes.heading_highlight1")} onChange={(v) => updateField("creator.collab_modes.heading_highlight1", v)} />
            </div>
            <FieldRow label="Subheading" value={g("creator.collab_modes.subheading")} onChange={(v) => updateField("creator.collab_modes.subheading", v)} />
            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-wider mt-6 mb-3">Modes</h4>
            {collabModes.map((mode, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-4 mb-4 bg-white/[0.02]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/70 text-xs font-semibold uppercase">Mode {i + 1}</span>
                  <button onClick={() => { const m = collabModes.filter((_, idx) => idx !== i); updateJsonArray("creator.collab_modes.modes", m); }}
                    className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                    placeholder="Number (01, 02…)" value={mode.num}
                    onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], num: e.target.value }; updateJsonArray("creator.collab_modes.modes", m); }} />
                  <input
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                    placeholder="Title" value={mode.title}
                    onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], title: e.target.value }; updateJsonArray("creator.collab_modes.modes", m); }} />
                </div>
                <textarea
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-[#E14F69]/50 focus:outline-none mb-3"
                  rows={2} placeholder="Description" value={mode.desc}
                  onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], desc: e.target.value }; updateJsonArray("creator.collab_modes.modes", m); }} />
                <label className="text-xs text-white/70 mb-2 block">Flow Steps (comma-separated)</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Step 1, Step 2, Step 3, Step 4" value={mode.steps?.join(", ") ?? ""}
                  onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], steps: e.target.value.split(",").map((s) => s.trim()) }; updateJsonArray("creator.collab_modes.modes", m); }} />
              </div>
            ))}
            <button onClick={() => updateJsonArray("creator.collab_modes.modes", [...collabModes, { num: String(collabModes.length + 1).padStart(2, "0"), title: "", desc: "", steps: [] }])}
              className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-2 hover:text-[#d4156b]">
              <Plus className="w-4 h-4" /> Add Mode
            </button>
          </SectionBlock>

          {/* Old Way vs Collabry Way */}
          <SectionBlock title="Old Way vs Collabry Way">
            <FieldRow label="Section Heading (white)" value={g("creator.comparison.heading_line1")} onChange={(v) => updateField("creator.comparison.heading_line1", v)} />
            <FieldRow label="Section Highlight (pink)" value={g("creator.comparison.heading_highlight1")} onChange={(v) => updateField("creator.comparison.heading_highlight1", v)} />
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mt-4 mb-2">
              <span className="text-white/70 text-xs font-semibold uppercase px-1">Feature</span>
              <span className="text-white/70 text-xs font-semibold uppercase px-1">Old Way</span>
              <span className="text-white/70 text-xs font-semibold uppercase px-1">Collabry Way</span>
              <span />
            </div>
            {compRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-2 items-center">
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Feature name" value={row.feature ?? ""}
                  onChange={(e) => { const r = [...compRows]; r[i] = { ...r[i], feature: e.target.value }; updateJsonArray("creator.comparison.rows", r); }} />
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Old way text" value={row.old}
                  onChange={(e) => { const r = [...compRows]; r[i] = { ...r[i], old: e.target.value }; updateJsonArray("creator.comparison.rows", r); }} />
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Collabry way text" value={row.collabry}
                  onChange={(e) => { const r = [...compRows]; r[i] = { ...r[i], collabry: e.target.value }; updateJsonArray("creator.comparison.rows", r); }} />
                <button onClick={() => { const r = compRows.filter((_, idx) => idx !== i); updateJsonArray("creator.comparison.rows", r); }}
                  className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => updateJsonArray("creator.comparison.rows", [...compRows, { feature: "", old: "", collabry: "" }])}
              className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-3 hover:text-[#d4156b]">
              <Plus className="w-4 h-4" /> Add Row
            </button>
          </SectionBlock>

          <div className="h-8" />
        </div>
      )}
    </div>
  );
}
