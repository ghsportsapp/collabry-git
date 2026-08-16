import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { Save, Eye, Upload, ArrowLeft, Plus, Trash2, AlertCircle, Image } from "lucide-react";
import { BRAND_DEFAULTS, BRAND_LANDING_UPDATE_CHANNEL, writeBrandLandingCache } from "@/hooks/useBrandLandingContent";
import { prepareBannerImage } from "@/lib/bannerImage";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function notifyBrandPage() {
  try { new BroadcastChannel(BRAND_LANDING_UPDATE_CHANNEL).postMessage("update"); } catch { /* ignore */ }
}

interface ContentItem {
  key: string;
  value: string;
  type: "text" | "image" | "color" | "json";
  section: string;
}

interface StatCard { value: string; label: string; }
interface CollabMode { num: string; title: string; desc: string; steps: string[]; }
interface ComparisonRow { feature: string; old: string; collabry: string; }
interface TeamMember { name: string; role: string; emoji?: string; color: string; image?: string; }
interface HeroBanner { imageUrl: string; altText: string; blurData?: string; }

const EDITOR_CACHE_KEY = "collabry_brand_editor_v1";
const BANNERS_KEY = "brand.hero.banners";
const MAX_BANNERS = 3;

function buildDefaults(): Record<string, ContentItem> {
  const result: Record<string, ContentItem> = {};
  for (const [key, value] of Object.entries(BRAND_DEFAULTS)) {
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

export default function AdminBrandLandingEditor() {
  const [content, setContent] = useState<Record<string, ContentItem>>(loadCached);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const loadContent = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/landing-content`);
      if (!res.ok) return;
      const items = (await res.json()) as ContentItem[];
      const brandItems = items.filter((i) => i.key.startsWith("brand."));
      const merged = buildDefaults();
      brandItems.forEach((item) => { merged[item.key] = item; });
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

  const g = (key: string) => content[key]?.value ?? BRAND_DEFAULTS[key] ?? "";
  const gj = <T,>(key: string): T => { try { return JSON.parse(g(key)) as T; } catch { return [] as unknown as T; } };

  const statCards: StatCard[] = gj("brand.stats.cards");
  const collabModes: CollabMode[] = gj("brand.collab_modes.modes");
  const compRows: ComparisonRow[] = gj("brand.comparison.rows");
  const teamMembers: TeamMember[] = gj("brand.team.members");
  const banners: HeroBanner[] = gj(BANNERS_KEY);

  const addBanner = async (file: File) => {
    setBannerError(null);
    setBannerBusy(true);
    try {
      const prepared = await prepareBannerImage(file);
      if ("error" in prepared) { setBannerError(prepared.error); return; }

      const formData = new FormData();
      formData.append("file", prepared.blob, "banner.webp");
      const r = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: formData });
      if (!r.ok) { setBannerError("Upload failed — please try again"); return; }
      const { objectPath } = (await r.json()) as { objectPath?: string };
      if (!objectPath) { setBannerError("Upload failed — please try again"); return; }

      updateJsonArray(BANNERS_KEY, [
        ...banners,
        { imageUrl: objectPath, altText: "", blurData: prepared.blurData },
      ].slice(0, MAX_BANNERS));
    } finally {
      setBannerBusy(false);
    }
  };

  const saveAll = async (): Promise<boolean> => {
    setSaving(true);
    const items = Object.values(content);
    writeBrandLandingCache(items);
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
      notifyBrandPage();
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
      setStatus({ type: "success", message: "Published! Changes are now live on /brand." });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleTeamImageUpload = async (index: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const r = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: formData });
    if (!r.ok) return;
    const { objectPath } = (await r.json()) as { objectPath: string };
    const m = [...teamMembers];
    m[index] = { ...m[index], image: objectPath };
    updateJsonArray("brand.team.members", m);
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
            <h1 className="text-white font-semibold text-sm">Brand Landing Page Editor</h1>
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
          <iframe key={previewKey} src={`${BASE_URL}/brand`} className="w-full h-[85vh]" />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">

          {/* Header */}
          <SectionBlock title="Header">
            <FieldRow label="Logo Text" value={g("brand.header.logo_text")} onChange={(v) => updateField("brand.header.logo_text", v)} />
            <FieldRow label="Sign Up Button Text" value={g("brand.header.signup_btn")} onChange={(v) => updateField("brand.header.signup_btn", v)} />
            <FieldRow label="Login Button Text" value={g("brand.header.login_btn")} onChange={(v) => updateField("brand.header.login_btn", v)} />
          </SectionBlock>

          {/* Hero */}
          <SectionBlock title="Hero Section">
            <FieldRow label="Heading Line 1 (white)" value={g("brand.hero.heading_line1")} onChange={(v) => updateField("brand.hero.heading_line1", v)} />
            <FieldRow label="Heading Highlight 1 (pink)" value={g("brand.hero.heading_highlight1")} onChange={(v) => updateField("brand.hero.heading_highlight1", v)} />
            <FieldRow label="Heading Line 2 (white)" value={g("brand.hero.heading_line2")} onChange={(v) => updateField("brand.hero.heading_line2", v)} />
            <FieldRow label="Heading Highlight 2 (pink)" value={g("brand.hero.heading_highlight2")} onChange={(v) => updateField("brand.hero.heading_highlight2", v)} />
            <FieldRow label="Subheading (gray)" value={g("brand.hero.subheading")} onChange={(v) => updateField("brand.hero.subheading", v)} multiline />
            <FieldRow label="CTA Button Text" value={g("brand.hero.cta_btn")} onChange={(v) => updateField("brand.hero.cta_btn", v)} />
            <div className="grid grid-cols-3 gap-3 mt-2">
              <FieldRow label="Trust Badge 1" value={g("brand.hero.badge1")} onChange={(v) => updateField("brand.hero.badge1", v)} />
              <FieldRow label="Trust Badge 2" value={g("brand.hero.badge2")} onChange={(v) => updateField("brand.hero.badge2", v)} />
              <FieldRow label="Trust Badge 3" value={g("brand.hero.badge3")} onChange={(v) => updateField("brand.hero.badge3", v)} />
            </div>

            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-wider mt-6 mb-1">Hero Banners</h4>
            <p className="text-[#9CA3AF] text-xs mb-3">
              Up to {MAX_BANNERS} square (1:1) images, max 5 MB each. Converted to WebP on upload.
              With no banners the hero keeps its current text-only layout.
            </p>

            {banners.map((banner, i) => (
              <div key={i} className="grid grid-cols-[64px_1fr_auto] gap-3 mb-3 items-center">
                <img
                  src={banner.imageUrl}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover border border-white/10"
                />
                <div>
                  <label className="text-[#9CA3AF] text-xs font-medium mb-1.5 block">Alt text (banner {i + 1})</label>
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                    placeholder="Describe the image for screen readers"
                    value={banner.altText ?? ""}
                    onChange={(e) => {
                      const b = [...banners];
                      b[i] = { ...b[i], altText: e.target.value };
                      updateJsonArray(BANNERS_KEY, b);
                    }}
                  />
                </div>
                <button
                  onClick={() => updateJsonArray(BANNERS_KEY, banners.filter((_, idx) => idx !== i))}
                  className="text-red-400 hover:text-red-300 p-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {bannerError && <p className="text-red-400 text-xs">{bannerError}</p>}

            {banners.length < MAX_BANNERS && (
              <>
                <button
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={bannerBusy}
                  className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-2 hover:text-[#d4156b] disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {bannerBusy ? "Uploading…" : `Add Banner (${banners.length}/${MAX_BANNERS})`}
                </button>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) addBanner(file);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </SectionBlock>

          {/* Stats */}
          <SectionBlock title="Stats Section — Why Influencer Marketing Fails">
            <FieldRow label="Section Heading (white)" value={g("brand.stats.heading_line1")} onChange={(v) => updateField("brand.stats.heading_line1", v)} />
            <FieldRow label="Section Highlight (pink)" value={g("brand.stats.heading_highlight1")} onChange={(v) => updateField("brand.stats.heading_highlight1", v)} />
            <FieldRow label="Subheading" value={g("brand.stats.subheading")} onChange={(v) => updateField("brand.stats.subheading", v)} />
            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-wider mt-6 mb-3">Stat Cards</h4>
            {statCards.map((card, i) => (
              <div key={i} className="grid grid-cols-[160px_1fr_auto] gap-3 mb-3 items-start">
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Value" value={card.value}
                  onChange={(e) => { const c = [...statCards]; c[i] = { ...c[i], value: e.target.value }; updateJsonArray("brand.stats.cards", c); }} />
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Label / Description" value={card.label}
                  onChange={(e) => { const c = [...statCards]; c[i] = { ...c[i], label: e.target.value }; updateJsonArray("brand.stats.cards", c); }} />
                <button onClick={() => { const c = statCards.filter((_, idx) => idx !== i); updateJsonArray("brand.stats.cards", c); }}
                  className="text-red-400 hover:text-red-300 p-2 mt-0.5"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => updateJsonArray("brand.stats.cards", [...statCards, { value: "", label: "" }])}
              className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-2 hover:text-[#d4156b]">
              <Plus className="w-4 h-4" /> Add Stat Card
            </button>
            <FieldRow label="Closing Bold Line" value={g("brand.stats.closing_line")} onChange={(v) => updateField("brand.stats.closing_line", v)} multiline />
          </SectionBlock>

          {/* 4 Ways to Collaborate */}
          <SectionBlock title="4 Ways to Collaborate">
            <FieldRow label="Section Heading (white)" value={g("brand.collab_modes.heading_line1")} onChange={(v) => updateField("brand.collab_modes.heading_line1", v)} />
            <FieldRow label="Section Highlight (pink)" value={g("brand.collab_modes.heading_highlight1")} onChange={(v) => updateField("brand.collab_modes.heading_highlight1", v)} />
            <FieldRow label="Subheading" value={g("brand.collab_modes.subheading")} onChange={(v) => updateField("brand.collab_modes.subheading", v)} />
            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-wider mt-6 mb-3">Modes</h4>
            {collabModes.map((mode, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-4 mb-4 bg-white/[0.02]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/70 text-xs font-semibold uppercase">Mode {i + 1}</span>
                  <button onClick={() => { const m = collabModes.filter((_, idx) => idx !== i); updateJsonArray("brand.collab_modes.modes", m); }}
                    className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                    placeholder="Number (01, 02…)" value={mode.num}
                    onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], num: e.target.value }; updateJsonArray("brand.collab_modes.modes", m); }} />
                  <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                    placeholder="Title" value={mode.title}
                    onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], title: e.target.value }; updateJsonArray("brand.collab_modes.modes", m); }} />
                </div>
                <textarea className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-[#E14F69]/50 focus:outline-none mb-3"
                  rows={2} placeholder="Description" value={mode.desc}
                  onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], desc: e.target.value }; updateJsonArray("brand.collab_modes.modes", m); }} />
                <label className="text-xs text-white/70 mb-2 block">Flow Steps (comma-separated)</label>
                <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Step 1, Step 2, Step 3, Step 4" value={mode.steps?.join(", ") ?? ""}
                  onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], steps: e.target.value.split(",").map((s) => s.trim()) }; updateJsonArray("brand.collab_modes.modes", m); }} />
              </div>
            ))}
            <button onClick={() => updateJsonArray("brand.collab_modes.modes", [...collabModes, { num: String(collabModes.length + 1).padStart(2, "0"), title: "", desc: "", steps: [] }])}
              className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-2 hover:text-[#d4156b]">
              <Plus className="w-4 h-4" /> Add Mode
            </button>
          </SectionBlock>

          {/* Old Way vs Collabry Way */}
          <SectionBlock title="Old Way vs Collabry Way">
            <FieldRow label="Section Heading (white)" value={g("brand.comparison.heading_line1")} onChange={(v) => updateField("brand.comparison.heading_line1", v)} />
            <FieldRow label="Section Highlight (pink)" value={g("brand.comparison.heading_highlight1")} onChange={(v) => updateField("brand.comparison.heading_highlight1", v)} />
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
                  onChange={(e) => { const r = [...compRows]; r[i] = { ...r[i], feature: e.target.value }; updateJsonArray("brand.comparison.rows", r); }} />
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Old way text" value={row.old}
                  onChange={(e) => { const r = [...compRows]; r[i] = { ...r[i], old: e.target.value }; updateJsonArray("brand.comparison.rows", r); }} />
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                  placeholder="Collabry way text" value={row.collabry}
                  onChange={(e) => { const r = [...compRows]; r[i] = { ...r[i], collabry: e.target.value }; updateJsonArray("brand.comparison.rows", r); }} />
                <button onClick={() => { const r = compRows.filter((_, idx) => idx !== i); updateJsonArray("brand.comparison.rows", r); }}
                  className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => updateJsonArray("brand.comparison.rows", [...compRows, { feature: "", old: "", collabry: "" }])}
              className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-3 hover:text-[#d4156b]">
              <Plus className="w-4 h-4" /> Add Row
            </button>
          </SectionBlock>

          {/* CTA Button */}
          <SectionBlock title="CTA Button">
            <FieldRow label="Button Text" value={g("brand.cta.btn_text")} onChange={(v) => updateField("brand.cta.btn_text", v)} />
            <FieldRow label="Button Link" value={g("brand.cta.btn_link")} onChange={(v) => updateField("brand.cta.btn_link", v)} />
          </SectionBlock>

          {/* Team */}
          <SectionBlock title="Meet the Team">
            <FieldRow label="Heading (white)" value={g("brand.team.heading_line1")} onChange={(v) => updateField("brand.team.heading_line1", v)} />
            <FieldRow label="Heading Highlight (pink)" value={g("brand.team.heading_highlight1")} onChange={(v) => updateField("brand.team.heading_highlight1", v)} />
            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-wider mt-6 mb-3">Team Members</h4>
            <div className="space-y-4">
              {teamMembers.map((member, i) => (
                <div key={i} className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-xs font-semibold uppercase">Member {i + 1}</span>
                    <button onClick={() => { const m = teamMembers.filter((_, idx) => idx !== i); updateJsonArray("brand.team.members", m); }}
                      className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{ background: member.color ?? "#2a2a3e" }}>
                      {member.image ? <img src={member.image} alt={member.name} className="w-full h-full object-cover" /> : <span className="text-xl">{member.emoji ?? "🧑"}</span>}
                    </div>
                    <label className="flex-1 cursor-pointer">
                      <div className="text-xs text-[#9CA3AF] hover:text-white transition-colors flex items-center gap-1.5 mb-1">
                        <Image className="w-3.5 h-3.5" />
                        {member.image ? "Change photo" : "Upload photo"}
                      </div>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleTeamImageUpload(i, file); }} />
                      {member.image && (
                        <button type="button" className="text-xs text-red-400 hover:text-red-300"
                          onClick={() => { const m = [...teamMembers]; m[i] = { ...m[i], image: undefined }; updateJsonArray("brand.team.members", m); }}>
                          Remove photo
                        </button>
                      )}
                    </label>
                  </div>
                  <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                    placeholder="Name" value={member.name}
                    onChange={(e) => { const m = [...teamMembers]; m[i] = { ...m[i], name: e.target.value }; updateJsonArray("brand.team.members", m); }} />
                  <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#9CA3AF] placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none"
                    placeholder="Role / Title" value={member.role}
                    onChange={(e) => { const m = [...teamMembers]; m[i] = { ...m[i], role: e.target.value }; updateJsonArray("brand.team.members", m); }} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/70 mb-1 block">Emoji (fallback)</label>
                      <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#E14F69]/50 focus:outline-none"
                        placeholder="🧑" value={member.emoji ?? ""}
                        onChange={(e) => { const m = [...teamMembers]; m[i] = { ...m[i], emoji: e.target.value }; updateJsonArray("brand.team.members", m); }} />
                    </div>
                    <div>
                      <label className="text-xs text-white/70 mb-1 block">Circle color</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={member.color}
                          onChange={(e) => { const m = [...teamMembers]; m[i] = { ...m[i], color: e.target.value }; updateJsonArray("brand.team.members", m); }}
                          className="w-7 h-7 rounded border border-white/10 cursor-pointer bg-transparent flex-shrink-0" />
                        <input className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:border-[#E14F69]/50 focus:outline-none"
                          value={member.color}
                          onChange={(e) => { const m = [...teamMembers]; m[i] = { ...m[i], color: e.target.value }; updateJsonArray("brand.team.members", m); }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => updateJsonArray("brand.team.members", [...teamMembers, { name: "", role: "", color: "#6366f1", emoji: "🧑" }])}
              className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-4 hover:text-[#d4156b]">
              <Plus className="w-4 h-4" /> Add Team Member
            </button>
          </SectionBlock>

          {/* Footer */}
          <SectionBlock title="Footer">
            <FieldRow label="Tagline" value={g("brand.footer.tagline")} onChange={(v) => updateField("brand.footer.tagline", v)} />
            <FieldRow label="Copyright" value={g("brand.footer.copyright")} onChange={(v) => updateField("brand.footer.copyright", v)} />
          </SectionBlock>

        </div>
      )}
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 p-6">
      <h3 className="text-white font-semibold text-lg mb-5 pb-3 border-b border-white/10">{title}</h3>
      {children}
    </div>
  );
}

function FieldRow({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div className="mb-4">
      <label className="block text-white/70 text-xs font-medium mb-1.5">{label}</label>
      {multiline ? (
        <textarea className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-[#E14F69]/50 focus:outline-none transition-colors"
          rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#E14F69]/50 focus:outline-none transition-colors"
          value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
