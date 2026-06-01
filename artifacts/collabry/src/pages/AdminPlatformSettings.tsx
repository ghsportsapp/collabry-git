import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Save, ArrowLeft, RefreshCw, Check, X, Clock, Zap, ChevronDown, ChevronUp } from "lucide-react";

const POPPINS = "'Poppins', sans-serif";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const PINK = "#E14F69";

const inputClass = "w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-white/5 border border-white/10 focus:border-white/30 transition-all";
const labelClass = "block text-white/90 text-sm mb-1.5";

function NumInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="mb-4">
      <label className={labelClass}>{label}</label>
      <input type="number" min="0" className={inputClass} value={value} onChange={e => onChange(e.target.value)} />
      {hint && <p className="text-white/70 text-xs mt-1">{hint}</p>}
    </div>
  );
}

type MainTab = "campaign" | "deal" | "shipping" | "revisions";
type CampaignSubTab = "paid" | "barter";
type CampaignSection = "settings" | "list";

const CAMPAIGN_DEFAULTS = {
  min_campaign_days: "1", max_campaign_days: "30", default_campaign_days: "5",
  min_campaign_price: "100", max_campaign_slots: "50", campaign_credits_cost: "0",
  campaign_approval_required: "false",
};

const BARTER_DEFAULTS = {
  min_barter_days: "1", max_barter_days: "30", barter_credits_cost: "10",
  min_barter_product_value: "0", max_barter_slots: "20",
};

const DEAL_DEFAULTS = {
  min_timeline_days: "14",
  timeline_description_text: "Allow enough time for the creator to plan, film, and deliver quality content.",
};

const SHIPPING_DEFAULTS = {
  max_product_delivery_days: "10",
  delivery_warning_day: "8",
  max_delivery_extensions: "2",
  product_issue_brand_response_hours: "48",
  awb_correction_limit: "2",
  product_issue_image_retention_days: "7",
  non_delivery_brand_refund_percent: "50",
  non_delivery_creator_percent: "20",
  non_delivery_collabry_percent: "30",
  fake_awb_brand_refund_percent: "70",
  fake_awb_creator_percent: "20",
  fake_awb_collabry_percent: "10",
  dispute_valid_brand_refund_percent: "50",
};

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    LIVE: { bg: "rgba(16,185,129,0.15)", color: "#4ade80", label: "Live" },
    PENDING_APPROVAL: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24", label: "Pending" },
    EXPIRED: { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)", label: "Expired" },
    CANCELLED: { bg: "rgba(239,68,68,0.12)", color: "#f87171", label: "Cancelled" },
    DRAFT: { bg: "rgba(99,102,241,0.15)", color: "#a5b4fc", label: "Draft" },
    APPROVED: { bg: "rgba(16,185,129,0.15)", color: "#4ade80", label: "Approved" },
    REJECTED: { bg: "rgba(239,68,68,0.12)", color: "#f87171", label: "Rejected" },
  };
  const s = map[status] ?? { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)", label: status };
  return (
    <span className="text-xs px-2 py-0.5 rounded-lg font-semibold" style={{ background: s.bg, color: s.color, fontFamily: POPPINS }}>
      {s.label}
    </span>
  );
}

function PaidCampaignList({ adminFetch }: { adminFetch: (p: string, o?: RequestInit) => Promise<Response> }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [actioning, setActioning] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const q = filter !== "ALL" ? `?status=${filter}` : "";
    adminFetch(`${BASE_URL}/api/admin/campaigns${q}`)
      .then(r => r.ok ? r.json() : []).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const action = async (id: string, act: "approve" | "expire" | "cancel") => {
    setActioning(id + act);
    try {
      if (act === "approve") await adminFetch(`${BASE_URL}/api/admin/campaigns/${id}/approve`, { method: "POST" });
      else if (act === "expire") await adminFetch(`${BASE_URL}/api/admin/campaigns/${id}/expire`, { method: "POST" });
      else await adminFetch(`${BASE_URL}/api/admin/campaigns/${id}/cancel`, { method: "POST" });
      load();
    } finally { setActioning(null); }
  };

  const FILTERS = ["ALL", "LIVE", "PENDING_APPROVAL", "EXPIRED", "CANCELLED"];

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: filter === f ? PINK : "rgba(255,255,255,0.07)", color: "white", border: filter === f ? "none" : "1px solid rgba(255,255,255,0.10)" }}>
            {f === "ALL" ? "All" : f === "PENDING_APPROVAL" ? "Pending" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1.5 text-white/70 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {loading ? (
        <p className="text-white/70 text-sm py-4">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-white/70 text-sm py-8 text-center">No campaigns found</p>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          {items.map((c, i) => (
            <div key={c.id} className="px-4 py-3.5 flex items-center gap-3"
              style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-white text-sm font-medium truncate">{c.name}</p>
                  {statusBadge(c.status)}
                </div>
                <p className="text-white/70 text-xs">{c.brandName} · {c.slotsFilled ?? 0}/{c.slotCount} slots · {c.totalApps ?? 0} apps</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {c.status === "PENDING_APPROVAL" && (
                  <button onClick={() => action(c.id, "approve")} disabled={!!actioning}
                    className="p-1.5 rounded-lg transition-colors" style={{ background: "rgba(16,185,129,0.15)", color: "#4ade80" }}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                {c.status === "LIVE" && (
                  <button onClick={() => action(c.id, "expire")} disabled={!!actioning}
                    className="p-1.5 rounded-lg transition-colors" style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24" }}>
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                )}
                {(c.status === "LIVE" || c.status === "PENDING_APPROVAL") && (
                  <button onClick={() => action(c.id, "cancel")} disabled={!!actioning}
                    className="p-1.5 rounded-lg transition-colors" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BarterCampaignList({ adminFetch }: { adminFetch: (p: string, o?: RequestInit) => Promise<Response> }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("PENDING_APPROVAL");
  const [actioning, setActioning] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminFetch(`${BASE_URL}/api/admin/barter?status=${filter}`)
      .then(r => r.ok ? r.json() : []).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const action = async (id: string, act: "approve" | "reject" | "hold") => {
    setActioning(id + act);
    try {
      await adminFetch(`${BASE_URL}/api/admin/barter/${id}/${act}`, { method: "POST" });
      load();
    } finally { setActioning(null); }
  };

  const FILTERS = ["PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"];

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: filter === f ? PINK : "rgba(255,255,255,0.07)", color: "white", border: filter === f ? "none" : "1px solid rgba(255,255,255,0.10)" }}>
            {f === "PENDING_APPROVAL" ? "Pending" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1.5 text-white/70 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {loading ? (
        <p className="text-white/70 text-sm py-4">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-white/70 text-sm py-8 text-center">No barter campaigns found</p>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          {items.map((c, i) => (
            <div key={c.id} className="px-4 py-3.5 flex items-center gap-3"
              style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-white text-sm font-medium truncate">{c.name}</p>
                  {statusBadge(c.status)}
                </div>
                <p className="text-white/70 text-xs">{c.brandName} · Product: ₹{c.productValue?.toLocaleString("en-IN") ?? "—"} · {c.hoursWaiting ?? 0}h waiting</p>
              </div>
              {c.status === "PENDING_APPROVAL" && (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => action(c.id, "approve")} disabled={!!actioning}
                    className="p-1.5 rounded-lg" style={{ background: "rgba(16,185,129,0.15)", color: "#4ade80" }}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => action(c.id, "hold")} disabled={!!actioning}
                    className="p-1.5 rounded-lg" style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24" }}>
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => action(c.id, "reject")} disabled={!!actioning}
                    className="p-1.5 rounded-lg" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl mb-4 overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ background: open ? "rgba(240,24,122,0.06)" : "rgba(255,255,255,0.03)" }}>
        <span className="text-white font-semibold text-sm">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-white/70" /> : <ChevronDown className="w-4 h-4 text-white/70" />}
      </button>
      {open && <div className="px-5 py-5">{children}</div>}
    </div>
  );
}

export default function AdminPlatformSettings() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();
  const [mainTab, setMainTab] = useState<MainTab>("campaign");
  const [campSubTab, setCampSubTab] = useState<CampaignSubTab>("paid");
  const [campSection, setCampSection] = useState<CampaignSection>("settings");
  const [barterSection, setBarterSection] = useState<CampaignSection>("settings");

  const [campaignSettings, setCampaignSettings] = useState(CAMPAIGN_DEFAULTS);
  const [barterSettings, setBarterSettings] = useState(BARTER_DEFAULTS);
  const [dealSettings, setDealSettings] = useState(DEAL_DEFAULTS);
  const [shippingSettings, setShippingSettings] = useState(SHIPPING_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    adminFetch(`${BASE_URL}/api/admin/shipping-settings`).then(r => r.ok ? r.json() : null).then(d => { if (d) setShippingSettings(s => ({ ...s, ...d })); }).catch(() => {});
    adminFetch(`${BASE_URL}/api/admin/deal-settings`).then(r => r.ok ? r.json() : null).then(d => { if (d) setDealSettings(s => ({ ...s, ...d })); }).catch(() => {});
    adminFetch(`${BASE_URL}/api/admin/campaign-settings`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        const { min_barter_days, max_barter_days, barter_credits_cost, min_barter_product_value, max_barter_slots, ...camp } = d;
        setCampaignSettings(s => ({ ...s, ...camp }));
        setBarterSettings(s => ({
          ...s,
          ...(min_barter_days !== undefined && { min_barter_days }),
          ...(max_barter_days !== undefined && { max_barter_days }),
          ...(barter_credits_cost !== undefined && { barter_credits_cost }),
          ...(min_barter_product_value !== undefined && { min_barter_product_value }),
          ...(max_barter_slots !== undefined && { max_barter_slots }),
        }));
      }
    }).catch(() => {});
  }, [adminFetch]);

  const setCamp = (key: string) => (v: string) => setCampaignSettings(s => ({ ...s, [key]: v }));
  const setBarter = (key: string) => (v: string) => setBarterSettings(s => ({ ...s, [key]: v }));
  const setDeal = (key: string) => (v: string) => setDealSettings(s => ({ ...s, [key]: v }));
  const setShipping = (key: string) => (v: string) => setShippingSettings(s => ({ ...s, [key]: v }));

  const saveShipping = async () => {
    setSaving(true); setMsg(null);
    const ndSum = +shippingSettings.non_delivery_brand_refund_percent + +shippingSettings.non_delivery_creator_percent + +shippingSettings.non_delivery_collabry_percent;
    const fakeSum = +shippingSettings.fake_awb_brand_refund_percent + +shippingSettings.fake_awb_creator_percent + +shippingSettings.fake_awb_collabry_percent;
    if (ndSum !== 100) { setMsg({ text: `Non-delivery splits must total 100% (got ${ndSum}%)`, ok: false }); setSaving(false); setTimeout(() => setMsg(null), 4000); return; }
    if (fakeSum !== 100) { setMsg({ text: `Fake-AWB splits must total 100% (got ${fakeSum}%)`, ok: false }); setSaving(false); setTimeout(() => setMsg(null), 4000); return; }
    if (+shippingSettings.delivery_warning_day >= +shippingSettings.max_product_delivery_days) { setMsg({ text: "Warning day must be less than max delivery days", ok: false }); setSaving(false); setTimeout(() => setMsg(null), 4000); return; }
    try {
      const errors: string[] = [];
      for (const [key, value] of Object.entries(shippingSettings)) {
        const r = await adminFetch(`${BASE_URL}/api/admin/shipping-settings`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }),
        });
        if (!r.ok) { const d = await r.json().catch(() => ({})); errors.push(`${key}: ${d.error ?? "failed"}`); }
      }
      if (errors.length === 0) setMsg({ text: "Shipping settings saved", ok: true });
      else setMsg({ text: errors[0] ?? "Some fields failed", ok: false });
    } catch { setMsg({ text: "Network error", ok: false }); }
    finally { setSaving(false); setTimeout(() => setMsg(null), 4000); }
  };

  const saveCampaign = async () => {
    setSaving(true); setMsg(null);
    try {
      await adminFetch(`${BASE_URL}/api/admin/campaign-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...campaignSettings, ...barterSettings }) });
      setMsg({ text: "Saved", ok: true });
    } catch { setMsg({ text: "Error saving", ok: false }); }
    finally { setSaving(false); setTimeout(() => setMsg(null), 2500); }
  };

  const saveDeal = async () => {
    setSaving(true); setMsg(null);
    try {
      await Promise.all([
        adminFetch(`${BASE_URL}/api/admin/deal-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "min_timeline_days", value: dealSettings.min_timeline_days }) }),
        adminFetch(`${BASE_URL}/api/admin/deal-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "timeline_description_text", value: dealSettings.timeline_description_text }) }),
      ]);
      setMsg({ text: "Saved", ok: true });
    } catch { setMsg({ text: "Error saving", ok: false }); }
    finally { setSaving(false); setTimeout(() => setMsg(null), 2500); }
  };

  const MAIN_TABS: { key: MainTab; label: string }[] = [
    { key: "campaign", label: "Campaign Settings" },
    { key: "deal", label: "Deal Settings" },
    { key: "shipping", label: "Product Shipping" },
    { key: "revisions", label: "Revision Reasons" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/8">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
          <span className="text-white/70 text-lg">|</span>
          <span className="text-[#9CA3AF] text-sm">Platform Settings</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
          <p className="text-white/70 text-sm mt-1">Configure campaign rules, deal settings, and approval flows</p>
        </div>

        {/* Main tabs */}
        <div className="flex gap-0 mb-8 border-b border-white/10">
          {MAIN_TABS.map(t => (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className="px-6 py-3 text-sm font-semibold transition-all relative"
              style={{
                color: mainTab === t.key ? PINK : "rgba(255,255,255,0.70)",
                fontFamily: POPPINS,
                borderBottom: mainTab === t.key ? `2px solid ${PINK}` : "2px solid transparent",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {msg && (
          <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${msg.ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
            {msg.text}
          </div>
        )}

        {/* Campaign Settings Tab */}
        {mainTab === "campaign" && (
          <div>
            {/* Sub-tabs: Paid / Barter */}
            <div className="flex gap-2 mb-6">
              {(["paid", "barter"] as CampaignSubTab[]).map(t => (
                <button key={t} onClick={() => setCampSubTab(t)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: campSubTab === t ? "rgba(240,24,122,0.15)" : "rgba(255,255,255,0.06)",
                    color: campSubTab === t ? PINK : "rgba(255,255,255,0.75)",
                    border: `1px solid ${campSubTab === t ? "rgba(240,24,122,0.35)" : "rgba(255,255,255,0.10)"}`,
                  }}>
                  {t === "paid" ? "Paid Campaigns" : "Barter Campaigns"}
                </button>
              ))}
            </div>

            {/* Paid sub-tab */}
            {campSubTab === "paid" && (
              <div>
                <div className="flex gap-2 mb-5">
                  {(["settings", "list"] as CampaignSection[]).map(s => (
                    <button key={s} onClick={() => setCampSection(s)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                      style={{
                        background: campSection === s ? PINK : "rgba(255,255,255,0.07)",
                        color: "white",
                        border: campSection === s ? "none" : "1px solid rgba(255,255,255,0.10)",
                      }}>
                      {s === "settings" ? <><Zap className="w-3 h-3" /> Settings</> : <><RefreshCw className="w-3 h-3" /> Campaign List</>}
                    </button>
                  ))}
                </div>

                {campSection === "settings" && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h2 className="text-white font-semibold mb-1">Paid Campaign Rules</h2>
                    <p className="text-white/70 text-sm mb-5">Set limits and defaults for paid influencer campaigns.</p>
                    <div className="grid sm:grid-cols-2 gap-x-6">
                      <NumInput label="Min campaign duration (days)" value={campaignSettings.min_campaign_days} onChange={setCamp("min_campaign_days")} />
                      <NumInput label="Max campaign duration (days)" value={campaignSettings.max_campaign_days} onChange={setCamp("max_campaign_days")} hint="Brands cannot post campaigns longer than this" />
                      <NumInput label="Default campaign duration (days)" value={campaignSettings.default_campaign_days} onChange={setCamp("default_campaign_days")} />
                      <NumInput label="Min price per creator ₹" value={campaignSettings.min_campaign_price} onChange={setCamp("min_campaign_price")} />
                      <NumInput label="Max slots per campaign" value={campaignSettings.max_campaign_slots} onChange={setCamp("max_campaign_slots")} />
                      <NumInput label="Credits required to post" value={campaignSettings.campaign_credits_cost} onChange={setCamp("campaign_credits_cost")} hint="0 = no credits required" />
                    </div>
                    <div className="mt-2 mb-5">
                      <label className={labelClass}>Campaign approval required</label>
                      <div className="flex gap-3 flex-wrap">
                        {["false", "true"].map(v => (
                          <button key={v} onClick={() => setCamp("campaign_approval_required")(v)}
                            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                            style={{ background: campaignSettings.campaign_approval_required === v ? PINK : "rgba(255,255,255,0.07)", color: "white", border: campaignSettings.campaign_approval_required === v ? "none" : "1px solid rgba(255,255,255,0.10)" }}>
                            {v === "true" ? "Yes — Admin approval required" : "No — Goes live after payment"}
                          </button>
                        ))}
                      </div>
                      <p className="text-white/70 text-xs mt-2">If enabled, campaigns go to Pending after payment; admin approves before going live.</p>
                    </div>
                    <button onClick={saveCampaign} disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60"
                      style={{ background: PINK }}>
                      <Save className="w-4 h-4" />{saving ? "Saving…" : "Save Settings"}
                    </button>
                  </div>
                )}

                {campSection === "list" && (
                  <div>
                    <div className="mb-4">
                      <h2 className="text-white font-semibold">All Paid Campaigns</h2>
                      <p className="text-white/70 text-sm mt-0.5">Review, approve, expire or cancel campaigns.</p>
                    </div>
                    <PaidCampaignList adminFetch={adminFetch} />
                  </div>
                )}
              </div>
            )}

            {/* Barter sub-tab */}
            {campSubTab === "barter" && (
              <div>
                <div className="flex gap-2 mb-5">
                  {(["settings", "list"] as CampaignSection[]).map(s => (
                    <button key={s} onClick={() => setBarterSection(s)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                      style={{
                        background: barterSection === s ? PINK : "rgba(255,255,255,0.07)",
                        color: "white",
                        border: barterSection === s ? "none" : "1px solid rgba(255,255,255,0.10)",
                      }}>
                      {s === "settings" ? <><Zap className="w-3 h-3" /> Settings</> : <><RefreshCw className="w-3 h-3" /> Campaign List</>}
                    </button>
                  ))}
                </div>

                {barterSection === "settings" && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h2 className="text-white font-semibold mb-1">Barter Campaign Rules</h2>
                    <p className="text-white/70 text-sm mb-5">Set limits for product-barter campaigns.</p>
                    <div className="grid sm:grid-cols-2 gap-x-6">
                      <NumInput label="Min barter duration (days)" value={barterSettings.min_barter_days} onChange={setBarter("min_barter_days")} />
                      <NumInput label="Max barter duration (days)" value={barterSettings.max_barter_days} onChange={setBarter("max_barter_days")} />
                      <NumInput label="Credits per creator slot" value={barterSettings.barter_credits_cost} onChange={setBarter("barter_credits_cost")} hint="Deducted from brand on approval" />
                      <NumInput label="Min product value ₹" value={barterSettings.min_barter_product_value} onChange={setBarter("min_barter_product_value")} />
                      <NumInput label="Max slots per barter campaign" value={barterSettings.max_barter_slots} onChange={setBarter("max_barter_slots")} />
                    </div>
                    <button onClick={saveCampaign} disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60"
                      style={{ background: PINK }}>
                      <Save className="w-4 h-4" />{saving ? "Saving…" : "Save Settings"}
                    </button>
                  </div>
                )}

                {barterSection === "list" && (
                  <div>
                    <div className="mb-4">
                      <h2 className="text-white font-semibold">All Barter Campaigns</h2>
                      <p className="text-white/70 text-sm mt-0.5">Approve, hold or reject barter submissions from brands.</p>
                    </div>
                    <BarterCampaignList adminFetch={adminFetch} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Revision Reasons Tab */}
        {mainTab === "revisions" && (
          <RevisionReasonsAdmin adminFetch={adminFetch} />
        )}

        {/* Product Shipping Tab */}
        {mainTab === "shipping" && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-1">Delivery Timing</h2>
              <p className="text-white/70 text-sm mb-5">Controls how long brands have to deliver and when creators can flag non-delivery.</p>
              <div className="grid sm:grid-cols-2 gap-x-6">
                <NumInput label="Max delivery days" value={shippingSettings.max_product_delivery_days} onChange={setShipping("max_product_delivery_days")} hint="From ship date — after this, creator can report not-received." />
                <NumInput label="Warning day" value={shippingSettings.delivery_warning_day} onChange={setShipping("delivery_warning_day")} hint="Push creator a reminder on this day. Must be < max." />
                <NumInput label="Max admin extensions" value={shippingSettings.max_delivery_extensions} onChange={setShipping("max_delivery_extensions")} hint="How many times admin can extend delivery deadline." />
                <NumInput label="Brand response window (hours)" value={shippingSettings.product_issue_brand_response_hours} onChange={setShipping("product_issue_brand_response_hours")} hint="Brand has this long to respond to issue / AWB-wrong." />
                <NumInput label="AWB correction limit" value={shippingSettings.awb_correction_limit} onChange={setShipping("awb_correction_limit")} hint="Max AWB updates before admin alert." />
                <NumInput label="Issue image retention (days)" value={shippingSettings.product_issue_image_retention_days} onChange={setShipping("product_issue_image_retention_days")} hint="Cancelled-deal issue photos kept for this long, then purged." />
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-1">Escrow Splits — Non-delivery (Genuine)</h2>
              <p className="text-white/70 text-sm mb-5">Applied when admin rules a non-delivery report is genuine. Must total 100%.</p>
              <div className="grid sm:grid-cols-3 gap-x-6">
                <NumInput label="Brand refund %" value={shippingSettings.non_delivery_brand_refund_percent} onChange={setShipping("non_delivery_brand_refund_percent")} />
                <NumInput label="Creator share %" value={shippingSettings.non_delivery_creator_percent} onChange={setShipping("non_delivery_creator_percent")} />
                <NumInput label="Collabry share %" value={shippingSettings.non_delivery_collabry_percent} onChange={setShipping("non_delivery_collabry_percent")} />
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-1">Escrow Splits — Fake AWB (Brand at fault)</h2>
              <p className="text-white/70 text-sm mb-5">Applied when admin rules brand provided a fake AWB. Brand also gets a strike. Must total 100%.</p>
              <div className="grid sm:grid-cols-3 gap-x-6">
                <NumInput label="Brand refund %" value={shippingSettings.fake_awb_brand_refund_percent} onChange={setShipping("fake_awb_brand_refund_percent")} />
                <NumInput label="Creator share %" value={shippingSettings.fake_awb_creator_percent} onChange={setShipping("fake_awb_creator_percent")} />
                <NumInput label="Collabry share %" value={shippingSettings.fake_awb_collabry_percent} onChange={setShipping("fake_awb_collabry_percent")} />
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-1">Dispute — Valid in Brand's Favor</h2>
              <div className="grid sm:grid-cols-2 gap-x-6">
                <NumInput label="Brand refund %" value={shippingSettings.dispute_valid_brand_refund_percent} onChange={setShipping("dispute_valid_brand_refund_percent")} hint="Refund % when admin rules a brand dispute valid." />
              </div>
            </div>

            <button onClick={saveShipping} disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60"
              style={{ background: PINK }}>
              <Save className="w-4 h-4" />{saving ? "Saving…" : "Save Shipping Settings"}
            </button>

            <NonDeliveryAlerts adminFetch={adminFetch} />
          </div>
        )}

        {/* Deal Settings Tab */}
        {mainTab === "deal" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-white font-semibold mb-1">Deal Settings</h2>
            <p className="text-white/70 text-sm mb-5">Configure rules for direct influencer deals initiated through matchmaking or search.</p>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <NumInput label="Minimum timeline (days)" value={dealSettings.min_timeline_days} onChange={setDeal("min_timeline_days")} hint="Minimum days brands must give creators for a deal" />
            </div>
            <div className="mb-5">
              <label className={labelClass}>Timeline helper text (shown to brands)</label>
              <textarea rows={3} className={inputClass + " resize-none"} value={dealSettings.timeline_description_text}
                onChange={e => setDeal("timeline_description_text")(e.target.value)} />
            </div>
            <button onClick={saveDeal} disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60"
              style={{ background: PINK }}>
              <Save className="w-4 h-4" />{saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function RevisionReasonsAdmin({ adminFetch }: { adminFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  type Reason = { id: string; reason: string; type: "CONCEPT" | "CONTENT" | "BOTH"; displayOrder: number; isActive: boolean };
  const [items, setItems] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newReason, setNewReason] = useState("");
  const [newType, setNewType] = useState<"CONCEPT" | "CONTENT" | "BOTH">("BOTH");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/revision-reasons`);
      if (r.ok) { const d = await r.json(); setItems(d.reasons ?? []); }
      else setErr("Failed to load");
    } catch { setErr("Network error"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!newReason.trim()) return;
    setBusy(true);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/revision-reasons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: newReason.trim(), type: newType }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setNewReason(""); setNewType("BOTH"); await load(); }
    } finally { setBusy(false); }
  }
  async function patch(id: string, body: any) {
    setBusy(true);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/revision-reasons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else await load();
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this reason?")) return;
    setBusy(true);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/revision-reasons/${id}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else await load();
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-1">Revision Reasons</h2>
      <p className="text-white/70 text-sm mb-5">Reasons brands can pick when requesting a concept or content revision.</p>
      {err && <p className="text-red-400 text-sm mb-3">{err}</p>}

      {/* Add new */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="New reason..."
          className="flex-1 px-3 py-2 rounded-lg text-white text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }} />
        <select value={newType} onChange={e => setNewType(e.target.value as any)}
          className="px-3 py-2 rounded-lg text-white text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <option value="BOTH" style={{ background: "#13151D" }}>BOTH</option>
          <option value="CONCEPT" style={{ background: "#13151D" }}>CONCEPT</option>
          <option value="CONTENT" style={{ background: "#13151D" }}>CONTENT</option>
        </select>
        <button onClick={add} disabled={busy || !newReason.trim()}
          className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: "#E14F69" }}>Add</button>
      </div>

      {loading ? <p className="text-white/70 text-sm">Loading...</p> : (
        <div className="space-y-2">
          {items.length === 0 && <p className="text-white/70 text-sm">No reasons yet.</p>}
          {items.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <input defaultValue={r.reason} onBlur={e => { if (e.target.value.trim() && e.target.value !== r.reason) patch(r.id, { reason: e.target.value.trim() }); }}
                className="flex-1 bg-transparent text-white text-sm outline-none" />
              <select value={r.type} onChange={e => patch(r.id, { type: e.target.value })}
                className="px-2 py-1 rounded text-white text-xs outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
                <option value="BOTH" style={{ background: "#13151D" }}>BOTH</option>
                <option value="CONCEPT" style={{ background: "#13151D" }}>CONCEPT</option>
                <option value="CONTENT" style={{ background: "#13151D" }}>CONTENT</option>
              </select>
              <button onClick={() => patch(r.id, { isActive: !r.isActive })}
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: r.isActive ? "rgba(34,197,94,0.20)" : "rgba(255,255,255,0.10)", color: r.isActive ? "#4ade80" : "rgba(255,255,255,0.7)" }}>
                {r.isActive ? "Active" : "Inactive"}
              </button>
              <button onClick={() => remove(r.id)} className="text-red-400 text-xs px-2 hover:text-red-300">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NonDeliveryAlerts({ adminFetch }: { adminFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/non-delivery-alerts`);
      if (r.ok) { const d = await r.json(); setAlerts(d.alerts ?? []); }
      else setAlerts([]);
    } catch { setAlerts([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const extend = async (id: string) => {
    const days = prompt("Extend delivery deadline by how many days?", "3");
    if (!days || isNaN(+days) || +days <= 0) return;
    setBusy(id + "ext");
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deals/${id}/extend-delivery`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: +days }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      await load();
    } finally { setBusy(null); }
  };

  const resolve = async (id: string, resolution: "GENUINE" | "FAKE_AWB") => {
    if (!confirm(`Resolve as ${resolution}? This applies the escrow split immediately.`)) return;
    setBusy(id + resolution);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deals/${id}/non-delivery-resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolution }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      await load();
    } finally { setBusy(null); }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-white font-semibold">Non-delivery Alerts</h2>
        <button onClick={load} className="text-white/70 hover:text-white text-xs flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <p className="text-white/70 text-sm mb-5">Pending non-delivery reports awaiting your decision.</p>
      {loading && <p className="text-white/70 text-sm">Loading…</p>}
      {!loading && alerts.length === 0 && <p className="text-white/70 text-sm">No pending non-delivery alerts.</p>}
      <div className="space-y-3">
        {alerts.map((a: any) => (
          <div key={a.id} className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.20)" }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-white text-sm font-semibold">Deal {a.id.slice(0, 8)}…</p>
                <p className="text-white/75 text-xs">
                  Brand: {a.brandName ?? "—"} · Creator: {a.creatorName ?? "—"} · Reported {a.non_delivery_reported_at ? new Date(a.non_delivery_reported_at).toLocaleString("en-IN") : "—"}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-lg font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                Day {a.daysSinceShip ?? "?"}
              </span>
            </div>
            <p className="text-white/85 text-xs mb-3">
              AWB: {a.awbNumber ?? "—"} · Courier: {a.courierName ?? "—"} · Total ₹{a.totalPayable ?? 0}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => extend(a.id)} disabled={!!busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(59,130,246,0.15)", color: "#7DB7FF", border: "1px solid rgba(59,130,246,0.30)" }}>
                ⏱ Extend deadline ({a.delivery_extension_count ?? 0}/{a.maxExtensions ?? "?"})
              </button>
              <button onClick={() => resolve(a.id, "GENUINE")} disabled={!!busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(239,68,68,0.18)", color: "#f87171", border: "1px solid rgba(239,68,68,0.40)" }}>
                📦 Refund Brand &amp; Cancel Deal
              </button>
              <button onClick={() => resolve(a.id, "FAKE_AWB")} disabled={!!busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.30)" }}>
                ⚠ Fake AWB (brand strike)
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
