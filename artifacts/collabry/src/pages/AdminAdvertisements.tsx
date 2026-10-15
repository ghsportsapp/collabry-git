import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, ChevronUp, ChevronDown, X, Upload, Pencil } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { goBack } from "@/lib/adminReturnTo";
import AdvertiseBrandEditor from "@/components/AdvertiseBrandEditor";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

const resolveImg = (u: string) => (u ? (/^(https?:|data:)/.test(u) ? u : `${BASE_URL}${u}`) : "");

// 16:9 within a small tolerance (covers 1920×1080, 1280×720, 1600×900, …).
const TARGET_RATIO = 16 / 9;
function is16x9(file: File): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { const r = img.naturalWidth / img.naturalHeight; URL.revokeObjectURL(url); resolve(Math.abs(r - TARGET_RATIO) <= TARGET_RATIO * 0.04); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

interface Ad {
  id: string;
  imageUrl: string;
  headline: string;
  bodyText: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/* 16:9 card preview with the "Ad" overlay our UI adds (admins do NOT bake it in). */
function AdPreview({ src }: { src: string }) {
  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: "16 / 9", background: "rgba(255,255,255,0.05)" }}>
      {src
        ? <img src={resolveImg(src)} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">16:9 image</div>}
      {src && (
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}>
          Ad
        </span>
      )}
    </div>
  );
}

export default function AdminAdvertisements() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<Ad | "new" | null>(null);
  const [tab, setTab] = useState<"banners" | "page">("banners");

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      const r = await adminFetch("/api/admin/ads");
      if (r.ok) setAds(await r.json());
      else { setAds([]); showToast("Failed to load ads", false); }
    } catch { setAds([]); showToast("Network error", false); }
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (ad: Ad) => {
    const r = await adminFetch(`/api/admin/ads/${ad.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !ad.isActive }) });
    if (r.ok) { const u = await r.json(); setAds(prev => (prev ?? []).map(a => a.id === ad.id ? u : a)); }
    else showToast("Failed to update", false);
  };

  const move = async (ad: Ad, dir: "up" | "down") => {
    const r = await adminFetch(`/api/admin/ads/${ad.id}/move`, { method: "POST", body: JSON.stringify({ dir }) });
    if (r.ok) load();
    else showToast("Failed to reorder", false);
  };

  const remove = async (ad: Ad) => {
    if (!window.confirm("Delete this ad? This cannot be undone.")) return;
    const r = await adminFetch(`/api/admin/ads/${ad.id}`, { method: "DELETE" });
    if (r.ok) { setAds(prev => (prev ?? []).filter(a => a.id !== ad.id)); showToast("Deleted"); }
    else showToast("Failed to delete", false);
  };

  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto pb-16" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-xl text-sm text-white shadow-lg ${toast.ok ? "bg-green-700/90" : "bg-red-700/90"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => goBack(navigate, "/admin-collabryangad")} title="Back" className="text-white/70 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-white font-bold text-lg">Advertisement</h1>
            <p className="text-white/50 text-xs">Creator ad banners + the public /advertise-your-brand page content.</p>
          </div>
        </div>
        {tab === "banners" && (
          <button onClick={() => setEditing("new")}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl text-white font-semibold"
            style={{ background: PINK }}>
            <Plus className="w-4 h-4" /> Add ad
          </button>
        )}
      </div>

      {/* Tabs: ad banners (creator feed) vs the /advertise-your-brand page content */}
      <div className="flex gap-2 mb-6">
        {([["banners", "Ad Banners"], ["page", "Advertise Page"]] as const).map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
            style={tab === key
              ? { background: PINK, color: "#fff" }
              : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.1)" }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "page" && <AdvertiseBrandEditor onToast={showToast} />}

      {tab === "banners" && (ads === null ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}</div>
      ) : ads.length === 0 ? (
        <p className="text-white/50 text-sm text-center py-16">No ads yet. Click "Add ad" to create one.</p>
      ) : (
        <div className="space-y-3">
          {ads.map((ad, i) => (
            <div key={ad.id} className="rounded-2xl p-3 flex items-center gap-3" style={card}>
              <div className="w-40 flex-shrink-0">
                <AdPreview src={ad.imageUrl} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{ad.headline || <span className="text-white/40">Untitled</span>}</p>
                <p className="text-white/50 text-xs line-clamp-2 mt-0.5">{ad.bodyText}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => toggleActive(ad)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={ad.isActive
                      ? { background: "rgba(16,185,129,0.14)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
                    {ad.isActive ? "● Active" : "○ Inactive"}
                  </button>
                  <span className="text-white/30 text-[11px]">#{ad.displayOrder}</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <button onClick={() => move(ad, "up")} disabled={i === 0} className="text-white/50 hover:text-white disabled:opacity-25 p-1"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => move(ad, "down")} disabled={i === ads.length - 1} className="text-white/50 hover:text-white disabled:opacity-25 p-1"><ChevronDown className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => setEditing(ad)} className="text-white/60 hover:text-white p-1.5" title="Edit"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => remove(ad)} className="text-red-400/70 hover:text-red-400 p-1.5" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {editing && (
        <AdEditor
          ad={editing === "new" ? null : editing}
          adminFetch={adminFetch}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); showToast("Saved"); }}
          onError={msg => showToast(msg, false)}
        />
      )}
    </div>
  );
}

function AdEditor({ ad, adminFetch, onClose, onSaved, onError }: {
  ad: Ad | null;
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState(ad?.imageUrl ?? "");
  const [headline, setHeadline] = useState(ad?.headline ?? "");
  const [bodyText, setBodyText] = useState(ad?.bodyText ?? "");
  const [isActive, setIsActive] = useState(ad?.isActive ?? true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickImage = async (file: File) => {
    setErr(null);
    const ok = await is16x9(file);
    if (!ok) { setErr("Image must be 16:9 (e.g. 1920×1080 or 1280×720). Please crop and re-upload."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: fd });
      if (!r.ok) { setErr("Upload failed — please try again."); return; }
      const { objectPath } = (await r.json()) as { objectPath?: string };
      if (objectPath) setImageUrl(objectPath);
      else setErr("Upload failed — please try again.");
    } catch { setErr("Upload failed — please try again."); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!imageUrl) { setErr("A 16:9 image is required."); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({ imageUrl, headline, bodyText, isActive });
      const r = ad
        ? await adminFetch(`/api/admin/ads/${ad.id}`, { method: "PATCH", body })
        : await adminFetch("/api/admin/ads", { method: "POST", body });
      if (r.ok) onSaved();
      else { const d = await r.json().catch(() => ({})); onError(d.error ?? "Failed to save"); }
    } catch { onError("Network error"); }
    finally { setSaving(false); }
  };

  const inputClass = "w-full bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E14F69] placeholder:text-white/40";
  const labelClass = "block text-white/70 text-xs mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" style={{ background: "rgba(0,0,0,0.8)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.1)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">{ad ? "Edit ad" : "New ad"}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-white/70" /></button>
        </div>

        <label className="block text-white/70 text-xs mb-1.5">Banner image (16:9)</label>
        <AdPreview src={imageUrl} />
        <label className="mt-2 mb-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-white/80 hover:text-white text-xs"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
          <input type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f); e.target.value = ""; }} />
        </label>

        <div className="space-y-3">
          <div><label className={labelClass}>Headline</label>
            <input className={inputClass} value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Short title" /></div>
          <div><label className={labelClass}>Body text</label>
            <textarea rows={4} className={inputClass + " resize-none"} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder="Longer paragraph shown on the ad detail card" /></div>
          <label className="flex items-center gap-2 text-white/80 text-sm cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Active (visible to creators)
          </label>
        </div>

        {err && <p className="text-xs mt-3" style={{ color: "#f87171" }}>{err}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/80"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>Cancel</button>
          <button onClick={save} disabled={saving || uploading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: PINK }}>
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
