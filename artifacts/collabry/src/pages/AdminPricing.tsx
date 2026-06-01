import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Pencil, Plus, Trash2, X, Check, Save } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const inputClass = "w-full bg-transparent border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-white/60 placeholder:text-white/70 transition-all";

interface Slab {
  id: string; label: string; minFollowers: number; maxFollowers: number | null;
  recReelMin: number; recReelMax: number; recStoryMin: number; recStoryMax: number;
  recPostMin: number; recPostMax: number;
  disclaimerRecommended: string; disclaimerHigher: string;
  isActive: boolean; displayOrder: number;
}

const DEFAULT_SLAB: Partial<Slab> = {
  label: "", minFollowers: 1000, maxFollowers: null,
  recReelMin: 200, recReelMax: 500, recStoryMin: 100, recStoryMax: 200,
  recPostMin: 150, recPostMax: 350,
  disclaimerRecommended: "Most deals happen in this range",
  disclaimerHigher: "Fewer deals happen in this range",
  isActive: true,
};

function validateAllSlabs(slabs: Slab[]): string | null {
  const active = slabs.filter(s => s.isActive).sort((a, b) => a.minFollowers - b.minFollowers);
  // Check each slab's own min/max
  for (const s of active) {
    if (s.maxFollowers !== null && s.maxFollowers <= s.minFollowers) {
      return `"${s.label}": max followers must be greater than min followers`;
    }
  }
  // Check overlaps
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]; const b = active[j];
      const aMax = a.maxFollowers ?? Infinity; const bMax = b.maxFollowers ?? Infinity;
      if (a.minFollowers <= bMax && aMax >= b.minFollowers) {
        return `Overlap between "${a.label}" and "${b.label}"`;
      }
    }
  }
  // Check gaps
  for (let i = 1; i < active.length; i++) {
    const prev = active[i - 1]; const curr = active[i];
    if (prev.maxFollowers !== null && curr.minFollowers !== prev.maxFollowers + 1) {
      return `Gap between "${prev.label}" (ends ${prev.maxFollowers.toLocaleString("en-IN")}) and "${curr.label}" (starts ${curr.minFollowers.toLocaleString("en-IN")}). Must be contiguous.`;
    }
  }
  return null;
}

export default function AdminPricing() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [loading, setLoading] = useState(false);
  const [editSlab, setEditSlab] = useState<Partial<Slab> | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    const r = await adminFetch("/api/admin/slabs");
    if (r.ok) setSlabs(await r.json());
    setLoading(false);
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  // Re-validate whenever slabs change
  useEffect(() => {
    if (slabs.length > 0) setValidationError(validateAllSlabs(slabs));
  }, [slabs]);

  const validateForSave = (slab: Partial<Slab>): string | null => {
    const min = slab.minFollowers ?? 0;
    const max = slab.maxFollowers;
    if (max !== null && max !== undefined && max <= min) return "Max followers must be greater than min followers";
    const others = slabs.filter(s => s.id !== slab.id && s.isActive);
    for (const s of others) {
      const sMin = s.minFollowers; const sMax = s.maxFollowers;
      const thisMax = max ?? Infinity; const otherMax = sMax ?? Infinity;
      if (min <= otherMax && thisMax >= sMin)
        return `Overlaps with "${s.label}" (${sMin.toLocaleString("en-IN")}–${sMax ? sMax.toLocaleString("en-IN") : "∞"})`;
    }
    const allActive = [...others, slab as Slab].filter(s => s.isActive !== false).sort((a, b) => a.minFollowers - b.minFollowers);
    for (let i = 1; i < allActive.length; i++) {
      const prev = allActive[i - 1]; const curr = allActive[i];
      if (prev.maxFollowers !== null && prev.maxFollowers !== undefined && curr.minFollowers !== prev.maxFollowers + 1)
        return `Gap: "${prev.label}" ends at ${prev.maxFollowers.toLocaleString("en-IN")} but "${curr.label ?? slab.label}" starts at ${curr.minFollowers.toLocaleString("en-IN")}. They must be contiguous.`;
    }
    return null;
  };

  const handleSave = async () => {
    if (!editSlab?.label?.trim()) { showToast("Label is required", false); return; }
    if (editSlab.minFollowers === undefined || isNaN(editSlab.minFollowers)) { showToast("Min followers is required", false); return; }
    const overlapErr = validateForSave(editSlab);
    if (overlapErr) { showToast(overlapErr, false); return; }
    setSaving(true);
    try {
      if (editSlab.id) {
        const r = await adminFetch(`/api/admin/slabs/${editSlab.id}`, { method: "PATCH", body: JSON.stringify(editSlab) });
        if (r.ok) { showToast("Slab updated"); setEditSlab(null); load(); }
        else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
      } else {
        const r = await adminFetch("/api/admin/slabs", { method: "POST", body: JSON.stringify(editSlab) });
        if (r.ok) { showToast("Slab created"); setEditSlab(null); load(); }
        else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (slab: Slab) => {
    if (!window.confirm(`Delete "${slab.label}"? This cannot be undone.`)) return;
    const r = await adminFetch(`/api/admin/slabs/${slab.id}`, { method: "DELETE" });
    if (r.ok) { showToast(`"${slab.label}" deleted`); load(); }
    else { const d = await r.json(); showToast(d.error ?? "Delete failed", false); }
  };

  const handleSaveAll = async () => {
    const err = validateAllSlabs(slabs);
    if (err) { showToast(err, false); return; }
    setSavingAll(true);
    try {
      // Re-save each slab to confirm current state is persisted
      for (const s of slabs) {
        await adminFetch(`/api/admin/slabs/${s.id}`, { method: "PATCH", body: JSON.stringify(s) });
      }
      showToast("All slabs saved successfully");
    } finally { setSavingAll(false); }
  };

  const fmt = (n: number) => `₹${n?.toLocaleString("en-IN")}`;

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm text-white shadow-lg ${toast.ok ? "bg-green-700/90" : "bg-red-700/90"}`}
          style={{ fontFamily: POPPINS }}>{toast.msg}</div>
      )}

      {/* Edit modal */}
      {editSlab && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget) setEditSlab(null); }}>
          <div className="w-full max-w-lg rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-semibold">{editSlab.id ? "Edit Slab" : "Add New Slab"}</h2>
              <button onClick={() => setEditSlab(null)} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-xs mb-1.5">Slab Name</label>
                <input className={inputClass} placeholder="e.g. Nano" value={editSlab.label ?? ""} onChange={e => setEditSlab(p => ({ ...p!, label: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/70 text-xs mb-1.5">Min Followers</label>
                  <input className={inputClass} type="number" value={editSlab.minFollowers ?? ""} onChange={e => setEditSlab(p => ({ ...p!, minFollowers: parseInt(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-white/70 text-xs mb-1.5">Max Followers (blank = unlimited)</label>
                  <input className={inputClass} type="number" placeholder="No limit" value={editSlab.maxFollowers ?? ""} onChange={e => setEditSlab(p => ({ ...p!, maxFollowers: e.target.value ? parseInt(e.target.value) : null }))} />
                </div>
              </div>

              {(["Reel","Story","Post"] as const).map(type => {
                const t = type.toLowerCase() as "reel"|"story"|"post";
                return (
                  <div key={type}>
                    <label className="block text-white/70 text-xs mb-1.5">Recommended {type === "Post" ? "Photo" : type} Price (₹)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input className={inputClass} type="number" placeholder="Min" value={(editSlab as any)[`rec${type}Min`] ?? ""} onChange={e => setEditSlab(p => ({ ...p!, [`rec${type}Min`]: parseFloat(e.target.value) }))} />
                      <input className={inputClass} type="number" placeholder="Max" value={(editSlab as any)[`rec${type}Max`] ?? ""} onChange={e => setEditSlab(p => ({ ...p!, [`rec${type}Max`]: parseFloat(e.target.value) }))} />
                    </div>
                  </div>
                );
              })}

              <div>
                <label className="block text-white/70 text-xs mb-1.5">Disclaimer (range matches slab)</label>
                <input className={inputClass} value={editSlab.disclaimerRecommended ?? ""} onChange={e => setEditSlab(p => ({ ...p!, disclaimerRecommended: e.target.value }))} />
              </div>
              <div>
                <label className="block text-white/70 text-xs mb-1.5">Disclaimer (range higher than slab)</label>
                <input className={inputClass} value={editSlab.disclaimerHigher ?? ""} onChange={e => setEditSlab(p => ({ ...p!, disclaimerHigher: e.target.value }))} />
              </div>
              {editSlab.id && (
                <label className="flex items-center gap-2 cursor-pointer" onClick={() => setEditSlab(p => ({ ...p!, isActive: !p!.isActive }))}>
                  <div className="w-4 h-4 rounded border flex items-center justify-center" style={{ background: editSlab.isActive ? PINK : "transparent", borderColor: editSlab.isActive ? PINK : "rgba(255,255,255,0.20)" }}>
                    {editSlab.isActive && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="text-white/90 text-sm">Active</span>
                </label>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditSlab(null)} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: PINK }}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/80 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-white text-xl font-bold">Pricing & Slabs</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveAll}
            disabled={savingAll || !!validationError}
            title={validationError ?? "Save all slabs"}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: validationError ? "rgba(255,255,255,0.08)" : "rgba(34,197,94,0.20)", border: `1px solid ${validationError ? "rgba(255,255,255,0.12)" : "rgba(34,197,94,0.40)"}`, color: validationError ? "rgba(255,255,255,0.70)" : "rgb(134,239,172)" }}
          >
            <Save className="w-4 h-4" />
            {savingAll ? "Saving..." : "Save All"}
          </button>
          <button onClick={() => setEditSlab({ ...DEFAULT_SLAB })} className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-semibold" style={{ background: PINK }}>
            <Plus className="w-4 h-4" /> Add Slab
          </button>
        </div>
      </div>

      {/* Validation error banner */}
      {validationError && slabs.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)", color: "rgb(252,165,165)", fontFamily: POPPINS }}>
          ⚠ {validationError} — Fix overlaps or gaps before saving.
        </div>
      )}

      {loading ? (
        <div className="text-white/70 text-center py-16">Loading...</div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                {["Slab", "Followers", "Reel", "Story", "Post", "Status", ""].map(h => (
                  <th key={h} className="text-left text-white/70 font-medium px-4 py-3" style={{ fontFamily: POPPINS }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slabs.map(s => (
                <tr key={s.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">{s.label}</td>
                  <td className="px-4 py-3 text-white/80 text-xs">
                    {s.minFollowers.toLocaleString("en-IN")} — {s.maxFollowers ? s.maxFollowers.toLocaleString("en-IN") : "∞"}
                  </td>
                  <td className="px-4 py-3 text-white/80 text-xs">{fmt(s.recReelMin)} – {fmt(s.recReelMax)}</td>
                  <td className="px-4 py-3 text-white/80 text-xs">{fmt(s.recStoryMin)} – {fmt(s.recStoryMax)}</td>
                  <td className="px-4 py-3 text-white/80 text-xs">{fmt(s.recPostMin)} – {fmt(s.recPostMax)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full ${s.isActive ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/70"}`}>
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditSlab({ ...s })} className="text-white/70 hover:text-white transition-colors p-1" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(s)} className="text-white/70 hover:text-red-400 transition-colors p-1" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
