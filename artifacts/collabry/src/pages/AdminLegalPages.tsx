import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, ChevronUp, ChevronDown } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";

interface Section { heading: string; body: string }
type LegalType = "terms" | "privacy";

const TITLES: Record<LegalType, string> = { terms: "Terms & Conditions", privacy: "Privacy Policy" };

export default function AdminLegalPages() {
  const { adminFetch } = useAdminAuth();
  const [tab, setTab] = useState<LegalType>("terms");
  const [sections, setSections] = useState<Record<LegalType, Section[]>>({ terms: [], privacy: [] });
  const [loading, setLoading] = useState<Record<LegalType, boolean>>({ terms: true, privacy: true });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const loadType = async (type: LegalType) => {
    setLoading(p => ({ ...p, [type]: true }));
    try {
      const r = await fetch(`${BASE_URL}/api/legal/${type}`);
      if (r.ok) { const data = await r.json(); setSections(p => ({ ...p, [type]: data })); }
    } catch {}
    setLoading(p => ({ ...p, [type]: false }));
  };

  useEffect(() => { loadType("terms"); loadType("privacy"); }, []);

  const cur = sections[tab];

  const setSection = (i: number, field: keyof Section, val: string) => {
    setSections(p => {
      const arr = [...p[tab]];
      arr[i] = { ...arr[i], [field]: val };
      return { ...p, [tab]: arr };
    });
  };

  const addSection = () => setSections(p => ({ ...p, [tab]: [...p[tab], { heading: "", body: "" }] }));

  const removeSection = (i: number) => setSections(p => ({ ...p, [tab]: p[tab].filter((_, idx) => idx !== i) }));

  const moveSection = (i: number, dir: "up" | "down") => {
    setSections(p => {
      const arr = [...p[tab]];
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= arr.length) return p;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...p, [tab]: arr };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await adminFetch(`/api/admin/legal/${tab}`, {
        method: "PATCH",
        body: JSON.stringify({ sections: cur }),
      });
      if (r.ok) showToast(`${TITLES[tab]} saved successfully`);
      else { try { const d = await r.json(); showToast(d.error ?? "Failed to save", false); } catch { showToast("Failed to save", false); } }
    } catch { showToast("Network error", false); }
    setSaving(false);
  };

  const textareaClass = "w-full bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-white/40 placeholder:text-white/70 transition-all resize-none";
  const inputClass = "w-full bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-white/40 placeholder:text-white/70 transition-all";

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm text-white shadow-lg ${toast.ok ? "bg-green-700/90" : "bg-red-700/90"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-8">
        <Link href="/admin-collabryangad">
          <button className="text-white/80 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></button>
        </Link>
        <h1 className="text-white text-xl font-bold">Legal Pages</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {(["terms", "privacy"] as LegalType[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-full text-sm font-medium transition-all"
            style={{ background: tab === t ? "#E14F69" : "rgba(255,255,255,0.08)", color: "white" }}>
            {TITLES[t]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl p-5 mb-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-white/70 text-xs">
            Editing: <span className="text-white/80">{TITLES[tab]}</span> · {cur.length} section{cur.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <a href={tab === "terms" ? "/terms-conditions" : "/privacy-policies"} target="_blank" rel="noopener noreferrer"
              className="text-[#E14F69] text-xs hover:underline">Preview →</a>
          </div>
        </div>

        {loading[tab] ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {cur.map((s, i) => (
              <div key={i} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[#E14F69] text-xs font-bold w-6">{String(i + 1).padStart(2, "0")}</span>
                  <input className={inputClass + " flex-1"} placeholder="Section Heading" value={s.heading}
                    onChange={e => setSection(i, "heading", e.target.value)} />
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveSection(i, "up")} disabled={i === 0}
                      className="text-white/70 hover:text-white disabled:opacity-20 transition-colors"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveSection(i, "down")} disabled={i === cur.length - 1}
                      className="text-white/70 hover:text-white disabled:opacity-20 transition-colors"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <button onClick={() => removeSection(i)} className="text-white/70 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea className={textareaClass} rows={4} placeholder="Section body text..." value={s.body}
                  onChange={e => setSection(i, "body", e.target.value)} />
              </div>
            ))}

            <button onClick={addSection}
              className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 text-white/70 text-sm hover:border-white/30 hover:text-white/80 transition-all flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Add Section
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || loading[tab]}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50 transition-all"
          style={{ background: "#E14F69" }}>
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : `Save ${TITLES[tab]}`}
        </button>
      </div>
    </div>
  );
}
