import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Save, ArrowLeft } from "lucide-react";

const POPPINS = "'Poppins', sans-serif";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

const inputClass = "w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-white/5 border border-white/10 focus:border-white/30 transition-all";
const labelClass = "block text-white/90 text-sm mb-1.5";

const DEFAULTS = {
  min_campaign_days: "1", max_campaign_days: "30", default_campaign_days: "5",
  min_campaign_price: "100", max_campaign_slots: "50", campaign_credits_cost: "0",
  campaign_approval_required: "false",
  min_barter_days: "1", max_barter_days: "30", barter_credits_cost: "10",
  min_barter_product_value: "0", max_barter_slots: "20",
};

function NumInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="mb-4">
      <label className={labelClass}>{label}</label>
      <input type="number" min="0" className={inputClass} value={value} onChange={e => onChange(e.target.value)} />
      {hint && <p className="text-white/70 text-xs mt-1">{hint}</p>}
    </div>
  );
}

export default function AdminCampaignSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const { adminFetch, adminId } = useAdminAuth();
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId]);

  useEffect(() => {
    if (!adminId) return;
    adminFetch(`${BASE_URL}/api/admin/campaign-settings`).then(r => r.ok ? r.json() : null).then(d => { if (d) setSettings(s => ({ ...s, ...d })); }).catch(() => {});
  }, [adminId, adminFetch]);

  const set = (key: string) => (v: string) => setSettings(s => ({ ...s, [key]: v }));

  const saveAll = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/campaign-settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setMsg(r.ok ? { text: "All settings saved", ok: true } : { text: "Save failed", ok: false });
    } catch { setMsg({ text: "Error saving", ok: false }); }
    finally { setSaving(false); setTimeout(() => setMsg(null), 3000); }
  };

  if (!adminId) return null;

  const inner = (
    <>
      {!embedded && (
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Campaign Settings</h1>
          <p className="text-white/70 text-sm mt-1">Configure rules for paid and barter campaigns</p>
        </div>
      )}

      {/* Paid Campaign */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-5">Paid Campaign Settings</h2>
          <div className="grid sm:grid-cols-2 gap-x-6">
            <NumInput label="Min campaign duration (days)" value={settings.min_campaign_days} onChange={set("min_campaign_days")} />
            <NumInput label="Max campaign duration (days)" value={settings.max_campaign_days} onChange={set("max_campaign_days")} />
            <NumInput label="Default campaign duration (days)" value={settings.default_campaign_days} onChange={set("default_campaign_days")} />
            <NumInput label="Min price per creator ₹" value={settings.min_campaign_price} onChange={set("min_campaign_price")} />
            <NumInput label="Max slots per campaign" value={settings.max_campaign_slots} onChange={set("max_campaign_slots")} />
            <NumInput label="Credits required to post campaign" value={settings.campaign_credits_cost} onChange={set("campaign_credits_cost")} hint="0 = no credits required" />
          </div>
          <div className="mt-2">
            <label className={labelClass}>Campaign approval required</label>
            <div className="flex gap-3">
              {["false", "true"].map(v => (
                <button key={v} onClick={() => set("campaign_approval_required")(v)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: settings.campaign_approval_required === v ? "#E14F69" : "rgba(255,255,255,0.07)",
                    color: "white", border: settings.campaign_approval_required === v ? "none" : "1px solid rgba(255,255,255,0.10)",
                  }}>
                  {v === "true" ? "Yes — Admin approval required" : "No — Goes live after payment"}
                </button>
              ))}
            </div>
            <p className="text-white/70 text-xs mt-2">If enabled, campaigns go to PENDING_APPROVAL after payment, then admin approves before going live</p>
          </div>
        </div>

        {/* Barter Campaign */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-5">Barter Campaign Settings</h2>
          <div className="grid sm:grid-cols-2 gap-x-6">
            <NumInput label="Min barter duration (days)" value={settings.min_barter_days} onChange={set("min_barter_days")} />
            <NumInput label="Max barter duration (days)" value={settings.max_barter_days} onChange={set("max_barter_days")} />
            <NumInput label="Credits per creator slot (deducted on approval)" value={settings.barter_credits_cost} onChange={set("barter_credits_cost")} />
            <NumInput label="Min product value ₹" value={settings.min_barter_product_value} onChange={set("min_barter_product_value")} />
            <NumInput label="Max slots per barter campaign" value={settings.max_barter_slots} onChange={set("max_barter_slots")} />
          </div>
        </div>

        {msg && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${msg.ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
            {msg.text}
          </div>
        )}

        <button onClick={saveAll} disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-60"
          style={{ background: "#E14F69" }}>
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save All Settings"}
        </button>
    </>
  );

  if (embedded) return inner;
  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/8">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
          <span className="text-white/70 text-lg">|</span>
          <span className="text-[#9CA3AF] text-sm">Campaign Settings</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-10">
        {inner}
      </main>
    </div>
  );
}
