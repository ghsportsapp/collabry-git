import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Search, Plus, Trash2, ChevronUp, ChevronDown, X } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
type FieldStatus = "mandatory" | "optional" | "hidden";
const NEXT_STATUS: Record<FieldStatus, FieldStatus> = { mandatory: "optional", optional: "hidden", hidden: "mandatory" };
const FIELD_TYPE_LABELS: Record<string, string> = { text: "Text", number: "Number", tel: "Phone", email: "Email", url: "URL", date: "Date" };

interface Brand { id: string; brandName: string; contactName: string; email: string; logoUrl?: string; categoryName?: string; creditBalance: number; status: string; createdAt: string; }
interface UnifiedField {
  type: "default" | "custom";
  key?: string;
  id?: string;
  label: string;
  fieldType?: string;
  status: FieldStatus;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status === "ACTIVE" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
      {status}
    </span>
  );
}

function FieldStatusBadge({ status, loading, onClick, locked }: { status: FieldStatus; loading?: boolean; onClick?: () => void; locked?: boolean }) {
  const styles: Record<FieldStatus, string> = {
    mandatory: "bg-[#E14F69]/20 text-[#E14F69] border-[#E14F69]/30 hover:bg-[#E14F69]/10",
    optional:  "bg-white/10 text-white/70 border-white/15 hover:bg-white/20 hover:text-white/90",
    hidden:    "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white/70",
  };
  const labels: Record<FieldStatus, string> = { mandatory: "Mandatory", optional: "Optional", hidden: "Hidden" };
  if (locked) return <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#E14F69]/10 text-[#E14F69]/60 border border-[#E14F69]/20">Required · Locked</span>;
  return (
    <button onClick={onClick} disabled={loading}
      title="Click to cycle: Mandatory → Optional → Hidden"
      className={`text-xs px-2.5 py-0.5 rounded-full border transition-all cursor-pointer disabled:opacity-50 ${styles[status]}`}>
      {loading ? "..." : labels[status]}
    </button>
  );
}

function BrandDetailModal({ brandId, onClose }: { brandId: string; onClose: () => void }) {
  const { adminFetch } = useAdminAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditExpiryDays, setCreditExpiryDays] = useState("30");
  const [creditReason, setCreditReason] = useState("");
  const [creditType, setCreditType] = useState<"add" | "remove">("add");
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    adminFetch(`/api/admin/brands/${brandId}`).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [brandId]);

  const handleAdjustCredits = async () => {
    if (!creditAmount || !creditReason.trim()) return;
    if (creditType === "add") {
      const days = parseInt(creditExpiryDays);
      if (!days || days < 1) return;
    }
    setActionLoading(true);
    const body: any = { amount: parseInt(creditAmount), type: creditType, reason: creditReason };
    if (creditType === "add") body.expiryDays = parseInt(creditExpiryDays);
    await adminFetch(`/api/admin/brands/${brandId}/adjust-credits`, { method: "POST", body: JSON.stringify(body) });
    setData(await adminFetch(`/api/admin/brands/${brandId}`).then(r => r.json()));
    setCreditAmount(""); setCreditReason(""); setActionLoading(false);
  };
  const handleSuspend = async () => {
    if (!suspendReason.trim()) return;
    setActionLoading(true);
    await adminFetch(`/api/admin/brands/${brandId}/suspend`, { method: "POST", body: JSON.stringify({ reason: suspendReason }) });
    setData(await adminFetch(`/api/admin/brands/${brandId}`).then(r => r.json()));
    setShowSuspendConfirm(false); setSuspendReason(""); setActionLoading(false);
  };
  const handleUnsuspend = async () => {
    setActionLoading(true);
    await adminFetch(`/api/admin/brands/${brandId}/unsuspend`, { method: "POST" });
    setData(await adminFetch(`/api/admin/brands/${brandId}`).then(r => r.json()));
    setActionLoading(false);
  };
  const handleDelete = async () => {
    setActionLoading(true);
    const r = await adminFetch(`/api/admin/brands/${brandId}`, { method: "DELETE", body: JSON.stringify({ reason: deleteReason.trim() || undefined }) });
    if (r.ok) { onClose(); }
    setActionLoading(false);
  };
  const brand = data?.brand;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-lg h-full overflow-y-auto" style={{ background: "#111118", borderLeft: "1px solid rgba(255,255,255,0.10)" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10" style={{ background: "#111118" }}>
          <h2 className="text-white font-semibold">Brand Details</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {loading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-[#E14F69] border-t-transparent rounded-full animate-spin" /></div>
        : !brand ? null : (
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              {brand.logoUrl && <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0"><img src={brand.logoUrl} alt="" className="w-full h-full object-cover" /></div>}
              <div>
                <h3 className="text-white font-bold text-lg">{brand.brandName}</h3>
                <p className="text-white/70 text-sm">{brand.email}</p>
                <StatusBadge status={brand.status} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Contact", brand.contactName], ["Category", brand.categoryName], ["Website", brand.websiteUrl], ["Instagram", brand.instagramHandle], ["Signup", new Date(brand.createdAt).toLocaleDateString("en-IN")], ["Bio", brand.bio]].map(([k, v]) => v ? (
                <div key={k} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <p className="text-white/70 text-xs mb-0.5">{k}</p>
                  <p className="text-white text-sm break-all">{v}</p>
                </div>
              ) : null)}
            </div>
            {data?.customFields?.filter((f: any) => f.value).map((f: any) => (
              <div key={f.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                <p className="text-white/70 text-xs mb-0.5">{f.label}</p>
                <p className="text-white text-sm">{f.value}</p>
              </div>
            ))}
            <div className="rounded-xl p-4" style={{ background: "rgba(240,24,122,0.1)", border: "1px solid rgba(240,24,122,0.2)" }}>
              <p className="text-white/70 text-xs mb-1">Credit Balance</p>
              <p className="text-white font-bold text-2xl">{brand.creditBalance}</p>
              {brand.freeCreditsExpiry && <p className="text-white/70 text-xs">Expires {new Date(brand.freeCreditsExpiry).toLocaleDateString("en-IN")}</p>}
            </div>
            <div className="space-y-3">
              <h4 className="text-white font-semibold text-sm">Adjust Credits</h4>
              <div className="flex gap-2">
                <button onClick={() => setCreditType("add")} className={`flex-1 py-2 rounded-lg text-sm ${creditType === "add" ? "text-white font-semibold" : "text-white/70 border border-white/10"}`} style={{ background: creditType === "add" ? "#E14F69" : "transparent" }}>Add</button>
                <button onClick={() => setCreditType("remove")} className={`flex-1 py-2 rounded-lg text-sm ${creditType === "remove" ? "text-white font-semibold" : "text-white/70 border border-white/10"}`} style={{ background: creditType === "remove" ? "#E14F69" : "transparent" }}>Remove</button>
              </div>
              <input className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm" type="number" placeholder="Amount" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} />
              {creditType === "add" && (
                <div>
                  <input className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm" type="number" min="1" placeholder="Expires after (days)" value={creditExpiryDays} onChange={e => setCreditExpiryDays(e.target.value)} />
                  <p className="text-white/70 text-[11px] mt-1">Brand will see "Expires in {creditExpiryDays || 0} days" and get a notification.</p>
                </div>
              )}
              <input className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm" placeholder="Reason (required)" value={creditReason} onChange={e => setCreditReason(e.target.value)} />
              <button onClick={handleAdjustCredits} disabled={actionLoading || !creditAmount || !creditReason.trim() || (creditType === "add" && (!creditExpiryDays || parseInt(creditExpiryDays) < 1))} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
                {actionLoading ? "Saving..." : "Apply"}
              </button>
            </div>
            <div className="pt-4 border-t border-white/10">
              {brand.status === "ACTIVE" ? (
                !showSuspendConfirm ? (
                  <button onClick={() => setShowSuspendConfirm(true)} className="w-full py-2.5 rounded-lg border border-red-500/40 text-red-400 text-sm hover:bg-red-500/10">Suspend Brand</button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-white text-sm">Suspend <strong>{brand.brandName}</strong>? They will not be able to login.</p>
                    <input className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm" placeholder="Reason for suspension" value={suspendReason} onChange={e => setSuspendReason(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => setShowSuspendConfirm(false)} className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/80 text-sm">Cancel</button>
                      <button onClick={handleSuspend} disabled={actionLoading || !suspendReason.trim()} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50">Confirm Suspend</button>
                    </div>
                  </div>
                )
              ) : (
                <button onClick={handleUnsuspend} disabled={actionLoading} className="w-full py-2.5 rounded-lg border border-green-500/40 text-green-400 text-sm hover:bg-green-500/10 disabled:opacity-50">Unsuspend Brand</button>
              )}
            </div>
            <div className="pt-3 border-t border-white/10">
              {!showDeleteConfirm ? (
                <button onClick={() => setShowDeleteConfirm(true)} className="w-full py-2.5 rounded-lg border border-red-900/40 text-red-700 text-sm hover:bg-red-900/10">Delete Brand Account</button>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <p className="text-red-400 text-sm font-medium">⚠ This is permanent and cannot be undone.</p>
                    <p className="text-red-400/70 text-xs mt-1">The brand account and all associated data will be permanently deleted.</p>
                  </div>
                  <input className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm" placeholder="Reason (optional)" value={deleteReason} onChange={e => setDeleteReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowDeleteConfirm(false); setDeleteReason(""); }} className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/80 text-sm">Cancel</button>
                    <button onClick={handleDelete} disabled={actionLoading} className="flex-1 py-2.5 rounded-lg text-white text-sm disabled:opacity-50" style={{ background: "#7f1d1d" }}>Delete Permanently</button>
                  </div>
                </div>
              )}
            </div>
            {data?.credits?.length > 0 && (
              <div>
                <h4 className="text-white font-semibold text-sm mb-3">Credit History</h4>
                <div className="space-y-2">
                  {data.credits.map((t: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-xs py-2 border-b border-white/5">
                      <span className="text-white/70">{t.transactionType.replace(/_/g, " ")}</span>
                      <span className={t.amount > 0 ? "text-green-400" : "text-red-400"}>{t.amount > 0 ? "+" : ""}{t.amount}</span>
                      <span className="text-white/70">{t.balanceAfter} bal</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminBrandOnboarding() {
  const { adminFetch } = useAdminAuth();
  const [tab, setTab] = useState<"brands" | "fields">("brands");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  // Unified fields state
  const [unifiedFields, setUnifiedFields] = useState<UnifiedField[]>([]);
  const [togglingIdx, setTogglingIdx] = useState<number | null>(null);

  // Add custom field form
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldStatus, setNewFieldStatus] = useState<FieldStatus>("optional");
  const [addingField, setAddingField] = useState(false);

  const loadBrands = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", status: statusFilter });
      if (search.trim()) params.set("search", search);
      const r = await adminFetch(`/api/admin/brands?${params}`);
      const data = await r.json();
      setBrands(data.brands ?? []); setTotal(data.total ?? 0);
    } finally { setLoading(false); }
  };

  const loadUnifiedFields = async () => {
    const r = await adminFetch("/api/admin/unified-field-order");
    if (r.ok) setUnifiedFields(await r.json());
  };

  useEffect(() => { if (tab === "brands") loadBrands(); }, [tab, page, search, statusFilter]);
  useEffect(() => { if (tab === "fields") loadUnifiedFields(); }, [tab]);

  // Save the full unified order to backend
  const saveOrder = async (fields: UnifiedField[]) => {
    const orderPayload = fields.map(f => f.type === "default" ? { type: "default", key: f.key } : { type: "custom", id: f.id });
    await adminFetch("/api/admin/unified-field-order", {
      method: "PATCH",
      body: JSON.stringify({ order: orderPayload }),
      headers: { "Content-Type": "application/json" },
    });
  };

  const moveField = async (idx: number, dir: "up" | "down") => {
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= unifiedFields.length) return;
    const updated = [...unifiedFields];
    [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];
    setUnifiedFields(updated);
    await saveOrder(updated);
  };

  const handleCycleStatus = async (idx: number) => {
    const f = unifiedFields[idx];
    setTogglingIdx(idx);
    const newStatus = NEXT_STATUS[f.status];
    try {
      if (f.type === "default" && f.key) {
        await adminFetch(`/api/admin/default-field-config/${f.key}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
          headers: { "Content-Type": "application/json" },
        });
      } else if (f.type === "custom" && f.id) {
        await adminFetch(`/api/admin/brand-signup-fields/${f.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
          headers: { "Content-Type": "application/json" },
        });
      }
      setUnifiedFields(prev => prev.map((x, i) => i === idx ? { ...x, status: newStatus } : x));
    } finally { setTogglingIdx(null); }
  };

  const handleDeleteField = async (idx: number) => {
    const f = unifiedFields[idx];
    if (f.type !== "custom" || !f.id) return;
    await adminFetch(`/api/admin/brand-signup-fields/${f.id}`, { method: "DELETE" });
    setUnifiedFields(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddField = async () => {
    if (!newFieldLabel.trim()) return;
    setAddingField(true);
    try {
      const r = await adminFetch("/api/admin/brand-signup-fields", {
        method: "POST",
        body: JSON.stringify({ label: newFieldLabel.trim(), fieldType: newFieldType, status: newFieldStatus }),
        headers: { "Content-Type": "application/json" },
      });
      if (r.ok) {
        const field = await r.json();
        setUnifiedFields(prev => [...prev, { type: "custom", id: field.id, label: field.label, fieldType: field.fieldType, status: field.status }]);
        setNewFieldLabel(""); setNewFieldType("text"); setNewFieldStatus("optional");
      }
    } finally { setAddingField(false); }
  };

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <Link href="/admin-collabryangad">
            <button className="text-white/70 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
          </Link>
          <h1 className="text-white font-bold text-lg">Brand Onboarding</h1>
        </div>
        <div className="flex rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          {(["brands", "fields"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 text-sm font-medium transition-all rounded-full capitalize ${tab === t ? "text-white" : "text-white/70"}`}
              style={{ background: tab === t ? "#E14F69" : "transparent" }}>
              {t === "brands" ? "Brands" : "Signup Fields"}
            </button>
          ))}
        </div>
      </header>

      <main className="px-6 py-6">
        {tab === "brands" && (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm outline-none focus:border-[#E14F69]/50 placeholder:text-white/70"
                  placeholder="Search brands..." />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white/90 text-sm outline-none">
                <option value="ALL">All</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
            {loading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#E14F69] border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8" style={{ background: "rgba(255,255,255,0.03)" }}>
                      {["Brand", "Contact", "Email", "Credits", "Status", "Joined"].map(h => (
                        <th key={h} className="text-left text-white/70 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {brands.map(b => (
                      <tr key={b.id} onClick={() => setSelectedBrandId(b.id)} className="border-b border-white/5 cursor-pointer hover:bg-white/3 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {b.logoUrl ? <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"><img src={b.logoUrl} alt="" className="w-full h-full object-cover" /></div>
                              : <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold text-xs" style={{ background: "#E14F69" }}>{b.brandName?.[0] ?? "?"}</div>}
                            <span className="text-white font-medium">{b.brandName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/80">{b.contactName}</td>
                        <td className="px-4 py-3 text-white/80">{b.email}</td>
                        <td className="px-4 py-3 text-[#E14F69] font-semibold">{b.creditBalance}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-3 text-white/70">{new Date(b.createdAt).toLocaleDateString("en-IN")}</td>
                      </tr>
                    ))}
                    {brands.length === 0 && <tr><td colSpan={6} className="text-center text-white/70 py-12">No brands found</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between mt-4 text-white/70 text-sm">
              <span>{total} total brand{total !== 1 ? "s" : ""}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-30 hover:bg-white/5">← Prev</button>
                <span className="px-3 py-1.5">Page {page}</span>
                <button disabled={brands.length < 20} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-30 hover:bg-white/5">Next →</button>
              </div>
            </div>
          </>
        )}

        {tab === "fields" && (
          <div className="max-w-2xl">
            {/* ── Fixed / locked fields ─────────────────────────────────────── */}
            <div className="rounded-2xl p-5 mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">Fixed Fields</h3>
                <span className="text-white/70 text-xs">Always shown · cannot be hidden or reordered</span>
              </div>
              <div className="space-y-2">
                {[{ label: "Brand Name", note: "Position 1" }, { label: "Email", note: "Position 2" }, { label: "Password", note: "Always last" }].map(f => (
                  <div key={f.label} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div><span className="text-white/80 text-sm">{f.label}</span><span className="text-white/70 text-xs ml-2">{f.note}</span></div>
                    <FieldStatusBadge status="mandatory" locked />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Unified configurable fields ───────────────────────────────── */}
            <div className="rounded-2xl p-5 mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">Signup Fields</h3>
                <span className="text-white/70 text-xs">Drag with arrows · click badge to change status</span>
              </div>
              {unifiedFields.length === 0 ? (
                <p className="text-white/70 text-sm text-center py-6">Loading…</p>
              ) : (
                <div className="space-y-2">
                  {unifiedFields.map((f, i) => (
                    <div key={f.type === "default" ? f.key : f.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.04)" }}>
                      {/* Reorder arrows */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button onClick={() => moveField(i, "up")} disabled={i === 0} className="text-white/70 hover:text-white disabled:opacity-20"><ChevronUp className="w-3 h-3" /></button>
                        <button onClick={() => moveField(i, "down")} disabled={i === unifiedFields.length - 1} className="text-white/70 hover:text-white disabled:opacity-20"><ChevronDown className="w-3 h-3" /></button>
                      </div>
                      {/* Label */}
                      <span className={`text-sm flex-1 ${f.status === "hidden" ? "text-white/70 line-through" : "text-white/90"}`}>{f.label}</span>
                      {/* Type badge for custom fields */}
                      {f.type === "custom" && (
                        <span className="text-white/70 text-xs px-2 py-0.5 rounded bg-white/5 flex-shrink-0">{FIELD_TYPE_LABELS[f.fieldType ?? "text"] ?? "Text"}</span>
                      )}
                      {/* Default tag */}
                      {f.type === "default" && (
                        <span className="text-white/70 text-xs flex-shrink-0">Default</span>
                      )}
                      {/* Status badge */}
                      <FieldStatusBadge
                        status={f.status}
                        loading={togglingIdx === i}
                        onClick={() => handleCycleStatus(i)}
                      />
                      {/* Delete (custom only) */}
                      {f.type === "custom" && (
                        <button onClick={() => handleDeleteField(i)} className="text-white/70 hover:text-red-400 transition-colors ml-1 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-white/70 text-xs mt-3">Hidden fields are not shown on the signup form and never validated. Click badge to cycle: Mandatory → Optional → Hidden.</p>
            </div>

            {/* ── Add custom field ──────────────────────────────────────────── */}
            <div className="rounded-2xl p-5" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.2)" }}>
              <h3 className="text-white font-semibold text-sm mb-4">Add Custom Field</h3>
              <div className="space-y-3">
                <input
                  className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#E14F69] outline-none placeholder:text-white/70"
                  placeholder="Field label (e.g. GST Number, Phone Number)"
                  value={newFieldLabel}
                  onChange={e => setNewFieldLabel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddField()}
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-white/70 text-xs mb-1.5">Input Type</label>
                    <select value={newFieldType} onChange={e => setNewFieldType(e.target.value)}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E14F69]">
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="tel">Phone Number</option>
                      <option value="email">Email</option>
                      <option value="url">URL / Website</option>
                      <option value="date">Date</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-white/70 text-xs mb-1.5">Status</label>
                    <select value={newFieldStatus} onChange={e => setNewFieldStatus(e.target.value as FieldStatus)}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E14F69]">
                      <option value="mandatory">Mandatory</option>
                      <option value="optional">Optional</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </div>
                </div>
                <button onClick={handleAddField} disabled={addingField || !newFieldLabel.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 w-full justify-center"
                  style={{ background: "#E14F69" }}>
                  <Plus className="w-4 h-4" /> Add Field
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedBrandId && <BrandDetailModal brandId={selectedBrandId} onClose={() => setSelectedBrandId(null)} />}
    </div>
  );
}
