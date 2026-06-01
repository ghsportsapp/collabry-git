import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Save, ArrowLeft, Plus, Pencil, Trash2, X } from "lucide-react";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

const inputClass = "w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-white/5 border border-white/10 focus:border-white/30 transition-all";
const labelClass = "block text-white/90 text-sm mb-1.5";

interface RejectionReason {
  id: string;
  reason: string;
  solution: string;
  forRole: string;
  displayOrder: number;
  isActive: boolean;
}

function GstRateSection({ adminFetch }: { adminFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  const [rate, setRate] = useState<string>("18");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    adminFetch(`${BASE_URL}/api/admin/gst-rate`).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.rate != null) setRate(String(d.rate));
    }).catch(() => {});
  }, [adminFetch]);

  const handleSave = async () => {
    const n = parseFloat(rate);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setMsg({ text: "Rate must be between 0 and 100", ok: false });
      return;
    }
    setSaving(true); setMsg(null);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/gst-rate`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: n }),
      });
      if (r.ok) setMsg({ text: "GST rate saved", ok: true });
      else { const d = await r.json(); setMsg({ text: d.error ?? "Save failed", ok: false }); }
    } catch { setMsg({ text: "Error saving", ok: false }); }
    finally { setSaving(false); setTimeout(() => setMsg(null), 4000); }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-1">GST Rate</h2>
      <p className="text-white/70 text-xs mb-5">
        The GST percentage added on top of the deal value when the brand makes payment. Applies to all new deals — existing paid deals are unaffected.
      </p>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className={labelClass}>GST rate (%)</label>
          <div className="relative">
            <input
              type="number" min="0" max="100" step="0.5"
              className={inputClass}
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="e.g. 18"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 text-sm pointer-events-none">%</span>
          </div>
          {rate && Number.isFinite(parseFloat(rate)) && (
            <p className="text-white/70 text-xs mt-1">
              Brand pays ₹{(100 + parseFloat(rate)).toFixed(2)} for every ₹100 of deal value
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-60 flex-shrink-0"
          style={{ background: PINK }}>
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {msg && (
        <p className={`mt-3 text-xs font-medium ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}

function CommissionRateSection({ adminFetch }: { adminFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  const [rate, setRate] = useState<string>("5");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    adminFetch(`${BASE_URL}/api/admin/commission-rate`).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.rate != null) setRate(String(d.rate));
    }).catch(() => {});
  }, [adminFetch]);

  const handleSave = async () => {
    const n = parseFloat(rate);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setMsg({ text: "Rate must be between 0 and 100", ok: false });
      return;
    }
    setSaving(true); setMsg(null);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/commission-rate`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: n }),
      });
      if (r.ok) setMsg({ text: "Commission rate saved", ok: true });
      else { const d = await r.json(); setMsg({ text: d.error ?? "Save failed", ok: false }); }
    } catch { setMsg({ text: "Error saving", ok: false }); }
    finally { setSaving(false); setTimeout(() => setMsg(null), 4000); }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-1">Commission Rate</h2>
      <p className="text-white/70 text-xs mb-5">
        The percentage Collabry deducts from the deal value before paying out the creator. Applies to all new deals — existing deals are unaffected.
      </p>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className={labelClass}>Platform commission (%)</label>
          <div className="relative">
            <input
              type="number" min="0" max="100" step="0.5"
              className={inputClass}
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="e.g. 5"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 text-sm pointer-events-none">%</span>
          </div>
          {rate && Number.isFinite(parseFloat(rate)) && (
            <p className="text-white/70 text-xs mt-1">
              Creator receives {(100 - parseFloat(rate)).toFixed(2)}% of the agreed deal value
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-60 flex-shrink-0"
          style={{ background: PINK }}>
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {msg && (
        <p className={`mt-3 text-xs font-medium ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}

function RejectionReasonsSection({ adminFetch }: { adminFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<RejectionReason | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ reason: "", solution: "", forRole: "CREATOR" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [filterRole, setFilterRole] = useState<"ALL" | "CREATOR" | "BRAND" | "BOTH">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/rejection-reasons`);
      if (r.ok) setReasons(await r.json());
    } finally { setLoading(false); }
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const startAdd = () => { setForm({ reason: "", solution: "", forRole: "CREATOR" }); setAdding(true); setEditing(null); setErr(""); };
  const startEdit = (r: RejectionReason) => { setForm({ reason: r.reason, solution: r.solution, forRole: r.forRole }); setEditing(r); setAdding(false); setErr(""); };
  const cancelForm = () => { setAdding(false); setEditing(null); setErr(""); };

  const handleSave = async () => {
    if (!form.reason.trim() || !form.solution.trim()) { setErr("Reason and solution are required."); return; }
    setSaving(true); setErr("");
    try {
      let r: Response;
      if (adding) {
        r = await adminFetch(`${BASE_URL}/api/admin/rejection-reasons`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else if (editing) {
        r = await adminFetch(`${BASE_URL}/api/admin/rejection-reasons/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else return;
      if (r.ok) { cancelForm(); await load(); }
      else { const d = await r.json(); setErr(d.error ?? "Save failed"); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deactivate this rejection reason?")) return;
    await adminFetch(`${BASE_URL}/api/admin/rejection-reasons/${id}`, { method: "DELETE" });
    await load();
  };

  const ROLE_LABEL: Record<string, string> = { CREATOR: "Creator only", BRAND: "Brand only", BOTH: "Both" };
  const ROLE_COLOR: Record<string, string> = { CREATOR: "#22c55e", BRAND: PINK, BOTH: "#a78bfa" };

  const filtered = filterRole === "ALL" ? reasons : reasons.filter(r => r.forRole === filterRole);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-semibold">Rejection Reasons</h2>
        <button onClick={startAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ background: PINK }}>
          <Plus className="w-3.5 h-3.5" /> Add Reason
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(["ALL", "CREATOR", "BRAND", "BOTH"] as const).map(role => (
          <button key={role} onClick={() => setFilterRole(role)}
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: filterRole === role ? PINK : "rgba(255,255,255,0.08)", color: filterRole === role ? "#fff" : "rgba(255,255,255,0.75)" }}>
            {role === "ALL" ? "All" : ROLE_LABEL[role]}
          </button>
        ))}
      </div>

      {(adding || editing) && (
        <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-sm font-semibold">{adding ? "Add Rejection Reason" : "Edit Rejection Reason"}</p>
            <button onClick={cancelForm}><X className="w-4 h-4 text-white/75" /></button>
          </div>
          <div className="mb-3">
            <label className="text-white/80 text-xs mb-1 block">Reason text (shown to user)</label>
            <input className={inputClass} value={form.reason} onChange={e => setForm(s => ({ ...s, reason: e.target.value }))} placeholder="e.g. Budget doesn't match my rates" />
          </div>
          <div className="mb-3">
            <label className="text-white/80 text-xs mb-1 block">Solution hint (shown to other party)</label>
            <input className={inputClass} value={form.solution} onChange={e => setForm(s => ({ ...s, solution: e.target.value }))} placeholder="e.g. Consider adjusting the budget" />
          </div>
          <div className="mb-3">
            <label className="text-white/80 text-xs mb-1 block">Available to</label>
            <div className="flex gap-2">
              {["CREATOR", "BRAND", "BOTH"].map(role => (
                <button key={role} onClick={() => setForm(s => ({ ...s, forRole: role }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: form.forRole === role ? ROLE_COLOR[role] + "33" : "rgba(255,255,255,0.06)", color: form.forRole === role ? ROLE_COLOR[role] : "rgba(255,255,255,0.75)", border: `1px solid ${form.forRole === role ? ROLE_COLOR[role] + "66" : "transparent"}` }}>
                  {ROLE_LABEL[role]}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="text-red-400 text-xs mb-2">{err}</p>}
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: PINK }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-14 rounded-xl animate-pulse bg-white/5" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-white/70 text-sm text-center py-6">No rejection reasons found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-white text-sm font-medium">{r.reason}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: ROLE_COLOR[r.forRole] + "22", color: ROLE_COLOR[r.forRole] }}>
                    {ROLE_LABEL[r.forRole] ?? r.forRole}
                  </span>
                </div>
                <p className="text-white/70 text-xs truncate">{r.solution}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                  <Pencil className="w-3.5 h-3.5 text-white/75" />
                </button>
                <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-white/75 hover:text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SHIPPING_DEFAULTS = {
  max_product_delivery_days: "10",
  delivery_warning_day: "8",
  max_delivery_extensions: "2",
  product_issue_brand_response_hours: "48",
  awb_correction_limit: "2",
  non_delivery_brand_refund_percent: "50",
  non_delivery_creator_percent: "20",
  non_delivery_collabry_percent: "30",
  fake_awb_brand_refund_percent: "70",
  fake_awb_creator_percent: "20",
  fake_awb_collabry_percent: "10",
  dispute_valid_brand_refund_percent: "50",
  product_issue_image_retention_days: "7",
};

export default function AdminDealSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const { adminFetch, adminId } = useAdminAuth();
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState({
    min_timeline_days: "14",
    timeline_description_text: "Allow enough time for the creator to plan, film, and deliver quality content.",
    max_deal_finalize_days: "2",
    require_courier_awb: "false",
    max_script_brief_chars: "2000",
    max_revision_brief_chars: "2000",
  });
  const [shipping, setShipping] = useState({ ...SHIPPING_DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId]);

  useEffect(() => {
    if (!adminId) return;
    adminFetch(`${BASE_URL}/api/admin/deal-settings`).then(r => r.ok ? r.json() : null).then(d => { if (d) setSettings(s => ({ ...s, ...d })); }).catch(() => {});
    adminFetch(`${BASE_URL}/api/admin/shipping-settings`).then(r => r.ok ? r.json() : null).then(d => { if (d) setShipping(s => ({ ...s, ...d })); }).catch(() => {});
  }, [adminId, adminFetch]);

  const saveAll = async () => {
    setSaving(true); setMsg(null);
    try {
      const dealPatches = [
        "min_timeline_days", "timeline_description_text", "max_deal_finalize_days",
        "require_courier_awb", "max_script_brief_chars", "max_revision_brief_chars",
      ].map(key => adminFetch(`${BASE_URL}/api/admin/deal-settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: (settings as any)[key] }),
      }));
      const shippingPatches = (Object.keys(shipping) as (keyof typeof shipping)[]).map(key =>
        adminFetch(`${BASE_URL}/api/admin/shipping-settings`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value: shipping[key] }),
        })
      );
      const results = await Promise.all([...dealPatches, ...shippingPatches]);
      const failures = await Promise.all(results.map(async r => r.ok ? null : (await r.json().catch(() => ({ error: "Error" }))).error));
      const errs = failures.filter(Boolean) as string[];
      if (errs.length) { setMsg({ text: errs[0] ?? "Some settings failed to save", ok: false }); }
      else { setMsg({ text: "All settings saved", ok: true }); }
    } catch { setMsg({ text: "Error saving", ok: false }); }
    finally { setSaving(false); setTimeout(() => setMsg(null), 4000); }
  };

  if (!adminId) return null;

  const inner = (
    <>
      {!embedded && (
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Deal Settings</h1>
          <p className="text-white/70 text-sm mt-1">Configure rules that apply to all deals and campaign forms</p>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-white font-semibold mb-5">Timeline & Negotiation Settings</h2>

        <div className="mb-5">
          <label className={labelClass}>Minimum content delivery timeline (days)</label>
          <input
            type="number" min="1" max="365"
            className={inputClass}
            value={settings.min_timeline_days}
            onChange={e => setSettings(s => ({ ...s, min_timeline_days: e.target.value }))}
          />
          <p className="text-white/70 text-xs mt-1">Brands cannot set a timeline shorter than this when sending requests or creating campaigns</p>
        </div>

        <div className="mb-5">
          <label className={labelClass}>Max days to respond per negotiation round</label>
          <input
            type="number" min="1" max="30"
            className={inputClass}
            value={settings.max_deal_finalize_days}
            onChange={e => setSettings(s => ({ ...s, max_deal_finalize_days: e.target.value }))}
          />
          <p className="text-white/70 text-xs mt-1">Each negotiation round expires after this many days if the recipient doesn't respond</p>
        </div>

        <div className="mb-5">
          <label className={labelClass}>Description shown below timeline field</label>
          <textarea
            rows={3} className={inputClass + " resize-none"}
            value={settings.timeline_description_text}
            onChange={e => setSettings(s => ({ ...s, timeline_description_text: e.target.value }))}
          />
          <p className="text-white/70 text-xs mt-1">This text is shown below the timeline input in all request and campaign forms</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-white font-semibold mb-5">Brief & Script Character Limits</h2>

        <div className="mb-5">
          <label className={labelClass}>Max characters for script/brief fields in request form</label>
          <input
            type="number" min="100" max="10000"
            className={inputClass}
            value={settings.max_script_brief_chars}
            onChange={e => setSettings(s => ({ ...s, max_script_brief_chars: e.target.value }))}
          />
          <p className="text-white/70 text-xs mt-1">Applies to "About the Product", reel scripts, story scripts, and post content in brand request forms</p>
        </div>

        <div className="mb-5">
          <label className={labelClass}>Max characters for revision brief/details field</label>
          <input
            type="number" min="100" max="10000"
            className={inputClass}
            value={settings.max_revision_brief_chars}
            onChange={e => setSettings(s => ({ ...s, max_revision_brief_chars: e.target.value }))}
          />
          <p className="text-white/70 text-xs mt-1">Applies to the "Details" textarea when brand requests a revision on concept or content</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-white font-semibold mb-1">Product Shipping Settings</h2>
        <p className="text-white/70 text-xs mb-5">Values are snapshotted at deal creation — changing them won't affect live deals.</p>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <label className={labelClass}>Require courier name &amp; AWB number on shipping</label>
            <p className="text-white/70 text-xs mt-0.5">
              When ON, brands must enter courier and tracking number when marking a product as shipped.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettings(s => ({ ...s, require_courier_awb: s.require_courier_awb === "true" ? "false" : "true" }))}
            className="relative flex-shrink-0 mt-1"
            style={{ width: 44, height: 24, borderRadius: 999, background: settings.require_courier_awb === "true" ? PINK : "rgba(255,255,255,0.15)", transition: "background 0.2s" }}
            aria-pressed={settings.require_courier_awb === "true"}
          >
            <span style={{ position: "absolute", top: 2, left: settings.require_courier_awb === "true" ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Max delivery days</label>
            <input type="number" min="1" max="60" className={inputClass} value={shipping.max_product_delivery_days} onChange={e => setShipping(s => ({ ...s, max_product_delivery_days: e.target.value }))} />
            <p className="text-white/70 text-xs mt-1">Days from ship date before creator can report non-delivery</p>
          </div>
          <div>
            <label className={labelClass}>Warning day</label>
            <input type="number" min="1" max="60" className={inputClass} value={shipping.delivery_warning_day} onChange={e => setShipping(s => ({ ...s, delivery_warning_day: e.target.value }))} />
            <p className="text-white/70 text-xs mt-1">Day N since ship date when creator gets a "package late?" push notification</p>
          </div>
          <div>
            <label className={labelClass}>Max delivery extensions (admin)</label>
            <input type="number" min="0" max="10" className={inputClass} value={shipping.max_delivery_extensions} onChange={e => setShipping(s => ({ ...s, max_delivery_extensions: e.target.value }))} />
            <p className="text-white/70 text-xs mt-1">How many times admin can extend delivery before forcing resolution</p>
          </div>
          <div>
            <label className={labelClass}>Brand response hours (product issue)</label>
            <input type="number" min="1" max="168" className={inputClass} value={shipping.product_issue_brand_response_hours} onChange={e => setShipping(s => ({ ...s, product_issue_brand_response_hours: e.target.value }))} />
            <p className="text-white/70 text-xs mt-1">Hours brand has to respond to a product issue before auto-cancel triggers</p>
          </div>
          <div>
            <label className={labelClass}>AWB correction limit</label>
            <input type="number" min="1" max="10" className={inputClass} value={shipping.awb_correction_limit} onChange={e => setShipping(s => ({ ...s, awb_correction_limit: e.target.value }))} />
            <p className="text-white/70 text-xs mt-1">Max times brand can update the AWB before admin is notified</p>
          </div>
          <div>
            <label className={labelClass}>Issue image retention (days)</label>
            <input type="number" min="1" max="90" className={inputClass} value={shipping.product_issue_image_retention_days} onChange={e => setShipping(s => ({ ...s, product_issue_image_retention_days: e.target.value }))} />
            <p className="text-white/70 text-xs mt-1">Days to keep product issue images after the deal is cancelled</p>
          </div>
        </div>

        <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-3">Payout Splits (must total 100% per scenario)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-white/75 text-xs mb-1 block">Non-delivery → Brand refund %</label>
            <input type="number" min="0" max="100" className={inputClass} value={shipping.non_delivery_brand_refund_percent} onChange={e => setShipping(s => ({ ...s, non_delivery_brand_refund_percent: e.target.value }))} />
          </div>
          <div>
            <label className="text-white/75 text-xs mb-1 block">Non-delivery → Creator %</label>
            <input type="number" min="0" max="100" className={inputClass} value={shipping.non_delivery_creator_percent} onChange={e => setShipping(s => ({ ...s, non_delivery_creator_percent: e.target.value }))} />
          </div>
          <div>
            <label className="text-white/75 text-xs mb-1 block">Non-delivery → Collabry %</label>
            <input type="number" min="0" max="100" className={inputClass} value={shipping.non_delivery_collabry_percent} onChange={e => setShipping(s => ({ ...s, non_delivery_collabry_percent: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-white/75 text-xs mb-1 block">Fake AWB → Brand refund %</label>
            <input type="number" min="0" max="100" className={inputClass} value={shipping.fake_awb_brand_refund_percent} onChange={e => setShipping(s => ({ ...s, fake_awb_brand_refund_percent: e.target.value }))} />
          </div>
          <div>
            <label className="text-white/75 text-xs mb-1 block">Fake AWB → Creator %</label>
            <input type="number" min="0" max="100" className={inputClass} value={shipping.fake_awb_creator_percent} onChange={e => setShipping(s => ({ ...s, fake_awb_creator_percent: e.target.value }))} />
          </div>
          <div>
            <label className="text-white/75 text-xs mb-1 block">Fake AWB → Collabry %</label>
            <input type="number" min="0" max="100" className={inputClass} value={shipping.fake_awb_collabry_percent} onChange={e => setShipping(s => ({ ...s, fake_awb_collabry_percent: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-white/75 text-xs mb-1 block">Valid dispute → Brand refund %</label>
            <input type="number" min="0" max="100" className={inputClass} value={shipping.dispute_valid_brand_refund_percent} onChange={e => setShipping(s => ({ ...s, dispute_valid_brand_refund_percent: e.target.value }))} />
            <p className="text-white/70 text-xs mt-1">Used when admin rules in favour of the creator in a content dispute</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${msg.ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
          {msg.text}
        </div>
      )}

      <button onClick={saveAll} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-60 mb-8"
        style={{ background: PINK }}>
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save All Settings"}
      </button>

      <GstRateSection adminFetch={adminFetch} />
      <CommissionRateSection adminFetch={adminFetch} />
      <RejectionReasonsSection adminFetch={adminFetch} />
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
          <span className="text-[#9CA3AF] text-sm">Deal Settings</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-10">
        {inner}
      </main>
    </div>
  );
}
