import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, ChevronUp, ChevronDown, Users, Crown } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { goBack } from "@/lib/adminReturnTo";
import { WHITE_GLOVE_DEFAULT, type WhiteGlove, type ServicePoint, type Plan, type Founder } from "./whiteGloveContent";
import WhiteGlovePurchases from "./WhiteGlovePurchases";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

const resolveImg = (u: string) => (u ? (/^(https?:|data:)/.test(u) ? u : `${BASE_URL}${u}`) : "");

export default function AdminWhiteGlove() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<WhiteGlove>(WHITE_GLOVE_DEFAULT);
  const dataRef = useRef<WhiteGlove>(WHITE_GLOVE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showBrands, setShowBrands] = useState(false);
  const [founderBusy, setFounderBusy] = useState<number | null>(null);

  useEffect(() => { dataRef.current = data; }, [data]);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    fetch(`${BASE_URL}/api/white-glove`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Partial<WhiteGlove>) => {
        const merged = (d && typeof d === "object") ? { ...WHITE_GLOVE_DEFAULT, ...d } : WHITE_GLOVE_DEFAULT;
        setData(merged); dataRef.current = merged; setLoading(false);
      })
      .catch(() => {
        // API down / non-OK — fall back to built-in defaults so the editor still loads.
        setData(WHITE_GLOVE_DEFAULT); dataRef.current = WHITE_GLOVE_DEFAULT; setLoading(false);
      });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await adminFetch(`/api/admin/white-glove`, { method: "PATCH", body: JSON.stringify(dataRef.current) });
      if (r.ok) showToast("Saved — changes are live");
      else { try { const e = await r.json(); showToast(e.error ?? "Failed to save", false); } catch { showToast("Failed to save", false); } }
    } catch { showToast("Network error", false); }
    setSaving(false);
  }, [adminFetch]);

  const set = (patch: Partial<WhiteGlove>) => setData(p => { const n = { ...p, ...patch }; dataRef.current = n; return n; });

  // ── Points ──
  const setPoint = (i: number, patch: Partial<ServicePoint>) =>
    set({ points: dataRef.current.points.map((pt, j) => j === i ? { ...pt, ...patch } : pt) });
  const addPoint = () => set({ points: [...dataRef.current.points, { title: "", desc: "" }] });
  const removePoint = (i: number) => set({ points: dataRef.current.points.filter((_, j) => j !== i) });
  const movePoint = (i: number, dir: -1 | 1) => {
    const arr = [...dataRef.current.points];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set({ points: arr });
  };

  // ── Plans ──
  const setPlan = (i: number, patch: Partial<Plan>) =>
    set({ plans: dataRef.current.plans.map((pl, j) => j === i ? { ...pl, ...patch } : pl) });

  // ── Founders ──
  const setFounder = (i: number, patch: Partial<Founder>) =>
    set({ founders: dataRef.current.founders.map((f, j) => j === i ? { ...f, ...patch } : f) });
  const addFounder = () => set({ founders: [...dataRef.current.founders, { name: "", designation: "", image: "" }] });
  const removeFounder = (i: number) => set({ founders: dataRef.current.founders.filter((_, j) => j !== i) });
  const moveFounder = (i: number, dir: -1 | 1) => {
    const arr = [...dataRef.current.founders];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set({ founders: arr });
  };
  const uploadFounderImage = async (i: number, file: File) => {
    setFounderBusy(i);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: fd });
      if (!r.ok) { showToast("Image upload failed", false); return; }
      const { objectPath } = (await r.json()) as { objectPath?: string };
      if (objectPath) setFounder(i, { image: objectPath });
      else showToast("Image upload failed", false);
    } catch { showToast("Image upload failed", false); }
    finally { setFounderBusy(null); }
  };

  const inputClass = "w-full bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E14F69] placeholder:text-white/40";
  const textareaClass = inputClass + " resize-none";
  const labelClass = "block text-white/70 text-xs mb-1.5";
  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };
  const sectionTitle = "text-white font-semibold text-sm mb-4";

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0F" }}>
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: PINK, borderTopColor: "transparent" }} />
    </div>;
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto pb-28" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm text-white shadow-lg ${toast.ok ? "bg-green-700/90" : "bg-red-700/90"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => showBrands ? setShowBrands(false) : goBack(navigate, "/admin-collabryangad")} title="Back" className="text-white/70 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-white font-bold text-lg">White Glove Service</h1>
          <p className="text-white/50 text-xs">
            {showBrands ? "Paid White Glove brands — the team's to-contact list." : "Edits save live to the public /white-glove-service page."}
          </p>
        </div>
      </div>

      {showBrands ? (
        <>
          <button onClick={() => setShowBrands(false)}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg text-white/80 hover:text-white mb-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to content editor
          </button>
          <WhiteGlovePurchases />
        </>
      ) : (
        <>
          {/* White Glove Brands — gated list (passphrase handled inside) */}
          <button onClick={() => setShowBrands(true)}
            className="w-full flex items-center justify-center gap-2 mb-6 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ background: "rgba(225,79,105,0.14)", border: "1px solid rgba(225,79,105,0.4)" }}>
            <Users className="w-4 h-4" /> White Glove Brands
          </button>

          {/* Hero */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <h2 className={sectionTitle}>Hero</h2>
            <div className="space-y-3">
              <div><label className={labelClass}>Tag pill</label>
                <input className={inputClass} value={data.heroTag} onChange={e => set({ heroTag: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelClass}>Heading line 1 (white)</label>
                  <input className={inputClass} value={data.heroLine1} onChange={e => set({ heroLine1: e.target.value })} /></div>
                <div><label className={labelClass}>Heading line 2 (pink)</label>
                  <input className={inputClass} value={data.heroLine2} onChange={e => set({ heroLine2: e.target.value })} /></div>
              </div>
              <div><label className={labelClass}>Subheading</label>
                <textarea rows={3} className={textareaClass} value={data.heroSub} onChange={e => set({ heroSub: e.target.value })} /></div>
            </div>
          </div>

          {/* Included */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <h2 className={sectionTitle}>"Included" section</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelClass}>Heading line 1 (white)</label>
                  <input className={inputClass} value={data.includedLine1} onChange={e => set({ includedLine1: e.target.value })} /></div>
                <div><label className={labelClass}>Heading line 2 (pink)</label>
                  <input className={inputClass} value={data.includedLine2} onChange={e => set({ includedLine2: e.target.value })} /></div>
              </div>
              <div><label className={labelClass}>Subheading</label>
                <textarea rows={2} className={textareaClass} value={data.includedSub} onChange={e => set({ includedSub: e.target.value })} /></div>
            </div>
          </div>

          {/* Service points */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm">Service points ({data.points.length})</h2>
              <button onClick={addPoint} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white"
                style={{ background: "rgba(225,79,105,0.2)", border: "1px solid rgba(225,79,105,0.4)" }}>
                <Plus className="w-3.5 h-3.5" /> Add point
              </button>
            </div>
            <div className="space-y-3">
              {data.points.map((pt, i) => (
                <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/40 text-xs">Point {i + 1}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => movePoint(i, -1)} disabled={i === 0} className="text-white/50 hover:text-white disabled:opacity-25 p-1"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => movePoint(i, 1)} disabled={i === data.points.length - 1} className="text-white/50 hover:text-white disabled:opacity-25 p-1"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removePoint(i)} className="text-red-400/70 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <input className={inputClass + " mb-2"} placeholder="Title" value={pt.title} onChange={e => setPoint(i, { title: e.target.value })} />
                  <textarea rows={2} className={textareaClass} placeholder="Description" value={pt.desc} onChange={e => setPoint(i, { desc: e.target.value })} />
                </div>
              ))}
            </div>
          </div>

          {/* Pricing heading */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <h2 className={sectionTitle}>Pricing heading</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelClass}>Heading line 1 (white)</label>
                <input className={inputClass} value={data.pricingLine1} onChange={e => set({ pricingLine1: e.target.value })} /></div>
              <div><label className={labelClass}>Heading line 2 (pink)</label>
                <input className={inputClass} value={data.pricingLine2} onChange={e => set({ pricingLine2: e.target.value })} /></div>
            </div>
            <div className="mt-3 max-w-[200px]">
              <label className={labelClass}>GST rate %</label>
              <input type="number" min="0" max="100" className={inputClass}
                value={data.gstRatePercent}
                onChange={e => set({ gstRatePercent: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} />
              <p className="text-white/40 text-[11px] mt-1">Added on top of each plan's base price. Plan prices are pre-GST.</p>
            </div>
          </div>

          {/* Plans */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <h2 className={sectionTitle}>Plans</h2>
            <div className="space-y-4">
              {data.plans.map((pl, i) => (
                <div key={pl.id} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div><label className={labelClass}>Plan name</label>
                      <input className={inputClass} value={pl.name} onChange={e => setPlan(i, { name: e.target.value })} /></div>
                    <div><label className={labelClass}>Badge (blank = none)</label>
                      <input className={inputClass} placeholder="e.g. Most popular" value={pl.badge} onChange={e => setPlan(i, { badge: e.target.value })} /></div>
                  </div>
                  <div className="mb-3"><label className={labelClass}>Short description</label>
                    <input className={inputClass} value={pl.desc} onChange={e => setPlan(i, { desc: e.target.value })} /></div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div><label className={labelClass}>Months</label>
                      <input type="number" min="1" className={inputClass} value={pl.months} onChange={e => setPlan(i, { months: parseInt(e.target.value) || 1 })} /></div>
                    <div><label className={labelClass}>MRP (₹)</label>
                      <input type="number" min="0" className={inputClass} value={pl.mrp} onChange={e => setPlan(i, { mrp: parseInt(e.target.value) || 0 })} /></div>
                    <div><label className={labelClass}>Price (₹)</label>
                      <input type="number" min="0" className={inputClass} value={pl.price} onChange={e => setPlan(i, { price: parseInt(e.target.value) || 0 })} /></div>
                  </div>
                  <div className="mb-3"><label className={labelClass}>Button label</label>
                    <input className={inputClass} placeholder="e.g. Get started" value={pl.buttonLabel} onChange={e => setPlan(i, { buttonLabel: e.target.value })} /></div>
                  <div><label className={labelClass}>Perk lines (one per line)</label>
                    <textarea rows={2} className={textareaClass} value={pl.perks.join("\n")}
                      onChange={e => setPlan(i, { perks: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Member card copy */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <h2 className={sectionTitle}>Member card (shown to active members)</h2>
            <div className="space-y-3">
              <div><label className={labelClass}>Heading</label>
                <input className={inputClass} value={data.memberHeading} onChange={e => set({ memberHeading: e.target.value })} /></div>
              <div><label className={labelClass}>Subtext</label>
                <textarea rows={2} className={textareaClass} value={data.memberSubtext} onChange={e => set({ memberSubtext: e.target.value })} /></div>
            </div>
          </div>

          {/* Thank-you message */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <h2 className={sectionTitle}>Thank-you page message</h2>
            <label className={labelClass}>"Our message to you" (dropdown on the thank-you page)</label>
            <textarea rows={4} className={textareaClass} value={data.thankYouMessage} onChange={e => set({ thankYouMessage: e.target.value })} />
          </div>

          {/* Founders */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm flex items-center gap-2"><Crown className="w-4 h-4" style={{ color: PINK }} /> Founders ({data.founders.length})</h2>
              <button onClick={addFounder} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white"
                style={{ background: "rgba(225,79,105,0.2)", border: "1px solid rgba(225,79,105,0.4)" }}>
                <Plus className="w-3.5 h-3.5" /> Add founder
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div><label className={labelClass}>Section heading</label>
                <input className={inputClass} value={data.founderHeading} onChange={e => set({ founderHeading: e.target.value })} /></div>
              <div><label className={labelClass}>Section subheading</label>
                <input className={inputClass} value={data.founderSubheading} onChange={e => set({ founderSubheading: e.target.value })} /></div>
            </div>
            <div className="space-y-3">
              {data.founders.map((f, i) => {
                const src = resolveImg(f.image);
                return (
                  <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/40 text-xs">Founder {i + 1}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveFounder(i, -1)} disabled={i === 0} className="text-white/50 hover:text-white disabled:opacity-25 p-1"><ChevronUp className="w-4 h-4" /></button>
                        <button onClick={() => moveFounder(i, 1)} disabled={i === data.founders.length - 1} className="text-white/50 hover:text-white disabled:opacity-25 p-1"><ChevronDown className="w-4 h-4" /></button>
                        <button onClick={() => removeFounder(i)} className="text-red-400/70 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                        <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center"
                          style={{ background: "rgba(225,79,105,0.15)", border: "2px solid rgba(225,79,105,0.4)" }}>
                          {src ? <img src={src} alt="" className="w-full h-full object-cover" />
                            : <span className="font-bold text-lg" style={{ color: PINK }}>{(f.name || "?").trim()[0]?.toUpperCase()}</span>}
                        </div>
                        <label className="text-[11px] px-2 py-1 rounded-md cursor-pointer text-white/80 hover:text-white"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                          {founderBusy === i ? "Uploading…" : "Upload"}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const file = e.target.files?.[0]; if (file) uploadFounderImage(i, file); e.target.value = ""; }} />
                        </label>
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <input className={inputClass} placeholder="Name" value={f.name} onChange={e => setFounder(i, { name: e.target.value })} />
                        <input className={inputClass} placeholder="Designation" value={f.designation} onChange={e => setFounder(i, { designation: e.target.value })} />
                        <input className={inputClass} placeholder="Image URL (or use Upload)" value={f.image} onChange={e => setFounder(i, { image: e.target.value })} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="rounded-2xl p-5 mb-5" style={card}>
            <h2 className={sectionTitle}>Footer &amp; pricing note</h2>
            <div className="space-y-3">
              <div><label className={labelClass}>Pricing note (below the plan cards)</label>
                <input className={inputClass} value={data.pricingNote} onChange={e => set({ pricingNote: e.target.value })} /></div>
              <div><label className={labelClass}>Footer note</label>
                <input className={inputClass} value={data.footerNote} onChange={e => set({ footerNote: e.target.value })} /></div>
            </div>
          </div>

          {/* Sticky save */}
          <div className="fixed bottom-0 left-0 right-0 px-4 py-3 flex justify-center" style={{ background: "rgba(10,10,15,0.92)", borderTop: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}>
            <div className="max-w-4xl w-full flex justify-end">
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: PINK }}>
                <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
