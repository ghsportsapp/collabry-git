import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, CheckCircle, XCircle, AlertCircle, Clock, Users, ChevronRight } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

const STATUSES = ["ALL","PENDING_APPROVAL","LIVE","HIDDEN","CREDIT_HOLD","REJECTED","EXPIRED","CANCELLED","DRAFT"];

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING_APPROVAL: { label: "Pending Review", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  LIVE: { label: "Live", color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  HIDDEN: { label: "Full (Hidden)", color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
  DRAFT: { label: "Draft", color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
  EXPIRED: { label: "Expired", color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
  CANCELLED: { label: "Cancelled", color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  REJECTED: { label: "Rejected", color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  CREDIT_HOLD: { label: "Credit Hold", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_META[status] ?? { label: status, color: "#6B7280", bg: "rgba(107,114,128,0.15)" };
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: s.color, background: s.bg, fontFamily: POPPINS }}>{s.label}</span>;
}

export default function AdminCampaigns({ embedded = false }: { embedded?: boolean } = {}) {
  const { adminFetch, adminId } = useAdminAuth();
  const [, navigate] = useLocation();
  const [campaigns, setCampaigns] = useState<any[] | null>(null);
  const [status, setStatus] = useState("PENDING_APPROVAL");
  const [search, setSearch] = useState("");
  const [selectedCamp, setSelectedCamp] = useState<any>(null);
  const [extendDays, setExtendDays] = useState("7");
  const [rejectReason, setRejectReason] = useState("");
  const [holdMsg, setHoldMsg] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showHoldForm, setShowHoldForm] = useState(false);

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId]);

  const load = useCallback(async () => {
    setCampaigns(null);
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (search) params.set("search", search);
    try {
      const r = await adminFetch(`/api/admin/campaigns?${params}`);
      setCampaigns(r.ok ? await r.json() : []);
    } catch { setCampaigns([]); }
  }, [status, search, adminFetch]);

  useEffect(() => { if (adminId) load(); }, [load, adminId]);

  const loadDetail = async (id: string) => {
    const r = await adminFetch(`/api/admin/campaigns/${id}`);
    if (r.ok) { setSelectedCamp(await r.json()); setShowRejectForm(false); setShowHoldForm(false); }
  };

  const doAction = async (action: string, payload?: any) => {
    if (!selectedCamp) return;
    setActionLoading(true);
    try {
      const r = await adminFetch(`/api/admin/campaigns/${selectedCamp.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      });
      const d = await r.json();
      if (r.ok) {
        setMsg({ text: action === "approve" ? "Campaign approved and is now Live!" : action === "reject" ? "Campaign rejected." : action === "hold" ? "Campaign put on hold." : `Action "${action}" done.`, ok: true });
        setShowRejectForm(false); setShowHoldForm(false); setRejectReason(""); setHoldMsg("");
        await loadDetail(selectedCamp.id);
        load();
      } else {
        setMsg({ text: d.error ?? "Action failed", ok: false });
      }
    } catch { setMsg({ text: "Error occurred", ok: false }); }
    setActionLoading(false);
    setTimeout(() => setMsg({ text: "", ok: true }), 5000);
  };

  if (!adminId) return null;

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—";

  const inner = (
    <>
      {!embedded && (
        <div className="mb-6">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 text-xs mb-1 hover:text-white/80">← Dashboard</button>
          <h1 className="text-white font-bold text-2xl" style={{ fontFamily: POPPINS }}>Paid Campaigns</h1>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} placeholder="Search campaigns…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-white text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: POPPINS }} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-white text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: POPPINS }}>
          {STATUSES.map(s => <option key={s} value={s} style={{ background: "#1a1a2e" }}>{s === "ALL" ? "All Statuses" : STATUS_META[s]?.label ?? s}</option>)}
        </select>
      </div>

      <div className="flex gap-4">
        {/* Campaign list */}
        <div className="flex-1 min-w-0">
          {campaigns === null ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />)}</div>
          ) : campaigns.length === 0 ? (
            <p className="text-white/70 text-sm text-center py-10" style={{ fontFamily: POPPINS }}>No campaigns found</p>
          ) : campaigns.map(c => (
            <button key={c.id} onClick={() => loadDetail(c.id)}
              className="w-full text-left rounded-xl p-3 mb-2 transition-all"
              style={{ background: selectedCamp?.id === c.id ? "rgba(240,24,122,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${selectedCamp?.id === c.id ? "rgba(240,24,122,0.3)" : "rgba(255,255,255,0.07)"}` }}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-medium text-sm truncate" style={{ fontFamily: POPPINS }}>{c.name}</p>
                  <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>{c.brandName} · {c.type} · {c.slotsFilled}/{c.slotCount} slots</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="flex gap-3 mt-1.5 flex-wrap">
                <span className="text-white/70 text-xs">₹{parseFloat(c.pricePerCreator ?? 0).toLocaleString("en-IN")}/creator</span>
                <span className="text-white/70 text-xs">{c.totalApps} apps</span>
                {c.status === "PENDING_APPROVAL" && (
                  <span className="text-amber-400 text-xs font-semibold">⏳ Awaiting review</span>
                )}
                {c.expiresAt && <span className="text-white/70 text-xs">exp {fmtDate(c.expiresAt)}</span>}
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        {selectedCamp && (
          <div className="flex-shrink-0" style={{ width: "440px" }}>
            <div className="rounded-2xl flex flex-col" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", maxHeight: "calc(100vh - 180px)" }}>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Header */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-white font-bold text-base leading-snug" style={{ fontFamily: POPPINS }}>{selectedCamp.name}</p>
                    <StatusBadge status={selectedCamp.status} />
                  </div>
                  <p className="text-white/55 text-xs" style={{ fontFamily: POPPINS }}>{selectedCamp.brandName}</p>
                </div>

                {msg.text && (
                  <div className="rounded-lg p-2" style={{ background: msg.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }}>
                    <p className="text-xs" style={{ color: msg.ok ? "#34d399" : "#f87171", fontFamily: POPPINS }}>{msg.text}</p>
                  </div>
                )}

                {/* Key metrics grid */}
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  {([
                    ["Content Type", selectedCamp.type ?? "—"],
                    ["Slots", `${selectedCamp.slotsFilled ?? 0} / ${selectedCamp.slotCount ?? "—"}`],
                    ["Price / Creator", `₹${parseFloat(selectedCamp.pricePerCreator ?? 0).toLocaleString("en-IN")}`],
                    ["Timeline", selectedCamp.timelineDays ? `${selectedCamp.timelineDays} days` : "—"],
                    ["Target Gender", selectedCamp.targetGender ?? "—"],
                    ["Target Age", selectedCamp.targetAge ?? "—"],
                    ["Delivery Window", selectedCamp.deliveryWindowDays ? `${selectedCamp.deliveryWindowDays} days` : "—"],
                    ["Who Publishes", selectedCamp.whoPublishes ?? "—"],
                    ["Product Required", selectedCamp.productRequired ? "Yes" : "No"],
                    ["Brief Length", selectedCamp.brief ? `${selectedCamp.brief.length} chars` : "—"],
                    ["Created", fmtDate(selectedCamp.createdAt)],
                    selectedCamp.liveAt ? ["Live Since", fmtDate(selectedCamp.liveAt)] : null,
                    selectedCamp.expiresAt ? ["Expires", fmtDate(selectedCamp.expiresAt)] : null,
                  ] as [string, string][]).filter(Boolean).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>{label}</p>
                      <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Target Location */}
                <div>
                  <p className="text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>Target Location</p>
                  <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{selectedCamp.targetLocation ?? "—"}</p>
                </div>

                {/* Categories */}
                <div>
                  <p className="text-[10px] mb-1.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedCamp.categories ?? []).length === 0
                      ? <span className="text-white/60 text-xs">—</span>
                      : (selectedCamp.categories ?? []).map((c: any) => (
                        <span key={c.name} className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>{c.name}</span>
                      ))}
                  </div>
                </div>

                {/* Product info */}
                {selectedCamp.productRequired && selectedCamp.productName && (
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>Product Name</p>
                    <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{selectedCamp.productName}</p>
                  </div>
                )}

                {/* Long-form text fields */}
                {([
                  ["Campaign Description", selectedCamp.description],
                  ["Brief", selectedCamp.brief],
                  ["Reel Script", selectedCamp.reelScript],
                  ["Story Script", selectedCamp.storyScript],
                  ["Photo Script", selectedCamp.photoScript],
                  ["Product Description", selectedCamp.productRequired ? selectedCamp.productDescription : null],
                ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>{label}</p>
                    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-white/85 text-xs leading-relaxed whitespace-pre-wrap" style={{ fontFamily: POPPINS }}>{value}</p>
                    </div>
                  </div>
                ))}

                {/* Product Photos */}
                {selectedCamp.productRequired && selectedCamp.productPhotos?.length > 0 && (
                  <div>
                    <p className="text-[10px] mb-1.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>Product Photos</p>
                    <div className="flex gap-2 flex-wrap">
                      {selectedCamp.productPhotos.map((url: string, i: number) => (
                        <button key={i} type="button"
                          onClick={() => window.open(/^https?:\/\//i.test(url) ? url : `https://${url}`, "_blank", "noopener,noreferrer")}
                          className="rounded-lg overflow-hidden hover:opacity-80 transition-opacity cursor-pointer"
                          style={{ width: 64, height: 64, flexShrink: 0, padding: 0, border: "none", background: "none" }}>
                          <img src={url} alt={`Product ${i + 1}`}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {selectedCamp.productPhotos.map((url: string, i: number) => (
                        <button key={i} type="button"
                          onClick={() => window.open(/^https?:\/\//i.test(url) ? url : `https://${url}`, "_blank", "noopener,noreferrer")}
                          className="block text-[10px] truncate hover:underline text-left w-full"
                          style={{ color: PINK, fontFamily: POPPINS, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          Photo {i + 1}: {url}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin metadata */}
                {selectedCamp.adminRejectionReason && (
                  <div>
                    <p className="text-[10px] mb-1" style={{ color: "rgba(239,68,68,0.65)", fontFamily: POPPINS }}>Rejection Reason</p>
                    <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <p className="text-red-300 text-xs leading-relaxed" style={{ fontFamily: POPPINS }}>{selectedCamp.adminRejectionReason}</p>
                    </div>
                  </div>
                )}
                {selectedCamp.adminNotes && (
                  <div>
                    <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>Admin Notes</p>
                    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-white/85 text-xs leading-relaxed" style={{ fontFamily: POPPINS }}>{selectedCamp.adminNotes}</p>
                    </div>
                  </div>
                )}

                {selectedCamp.status === "CREDIT_HOLD" && (
                  <div className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <p className="text-amber-400 text-xs leading-relaxed" style={{ fontFamily: POPPINS }}>
                      Campaign approved but brand has insufficient credits. Will go live automatically when they top up.
                    </p>
                  </div>
                )}
              </div>

              {/* Sticky actions footer */}
              {(selectedCamp.status === "PENDING_APPROVAL" || ["LIVE","HIDDEN"].includes(selectedCamp.status)) && (
                <div className="flex-shrink-0 p-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide" style={{ fontFamily: POPPINS }}>
                    {selectedCamp.status === "PENDING_APPROVAL" ? "Review Actions" : "Actions"}
                  </p>

                  {/* PENDING_APPROVAL actions */}
                  {selectedCamp.status === "PENDING_APPROVAL" && (
                    <>
                      <button onClick={() => { if (confirm(`Approve "${selectedCamp.name}"? Credits will be deducted from the brand.`)) doAction("approve"); }}
                        disabled={actionLoading}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-white text-xs font-semibold"
                        style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", fontFamily: POPPINS }}>
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" /> Approve Campaign
                      </button>

                      {!showRejectForm ? (
                        <button onClick={() => setShowRejectForm(true)} disabled={actionLoading}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold"
                          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontFamily: POPPINS }}>
                          <XCircle className="w-3.5 h-3.5" /> Reject Campaign
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
                            placeholder="Rejection reason (required)..."
                            className="w-full px-2.5 py-2 rounded-lg text-white text-xs outline-none resize-none"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.3)", fontFamily: POPPINS }} />
                          <div className="flex gap-2">
                            <button onClick={() => setShowRejectForm(false)}
                              className="flex-1 py-1.5 rounded-lg text-white/70 text-xs" style={{ background: "rgba(255,255,255,0.06)", fontFamily: POPPINS }}>
                              Cancel
                            </button>
                            <button onClick={() => { if (!rejectReason.trim()) return; doAction("reject", { reason: rejectReason }); }}
                              disabled={actionLoading || !rejectReason.trim()}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: rejectReason.trim() ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171", fontFamily: POPPINS }}>
                              Confirm Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {!showHoldForm ? (
                        <button onClick={() => setShowHoldForm(true)} disabled={actionLoading}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold"
                          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24", fontFamily: POPPINS }}>
                          <AlertCircle className="w-3.5 h-3.5" /> Put on Hold
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <textarea value={holdMsg} onChange={e => setHoldMsg(e.target.value)} rows={2}
                            placeholder="Internal notes (optional)..."
                            className="w-full px-2.5 py-2 rounded-lg text-white text-xs outline-none resize-none"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(245,158,11,0.3)", fontFamily: POPPINS }} />
                          <div className="flex gap-2">
                            <button onClick={() => setShowHoldForm(false)}
                              className="flex-1 py-1.5 rounded-lg text-white/70 text-xs" style={{ background: "rgba(255,255,255,0.06)", fontFamily: POPPINS }}>
                              Cancel
                            </button>
                            <button onClick={() => doAction("hold", { message: holdMsg || undefined })} disabled={actionLoading}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24", fontFamily: POPPINS }}>
                              Confirm Hold
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* LIVE / HIDDEN actions */}
                  {["LIVE","HIDDEN"].includes(selectedCamp.status) && (
                    <>
                      <div className="flex gap-2">
                        <input type="number" value={extendDays} onChange={e => setExtendDays(e.target.value)} min="1"
                          className="w-16 px-2 py-1.5 rounded-lg text-white text-xs outline-none text-center"
                          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: POPPINS }} />
                        <button onClick={() => doAction("extend", { days: parseInt(extendDays) })} disabled={actionLoading}
                          className="flex-1 py-1.5 rounded-lg text-white text-xs font-semibold"
                          style={{ background: "rgba(59,130,246,0.25)", border: "1px solid rgba(59,130,246,0.4)", fontFamily: POPPINS }}>
                          Extend +{extendDays}d
                        </button>
                      </div>
                      <button onClick={() => { if (confirm("Expire this campaign now?")) doAction("expire"); }} disabled={actionLoading}
                        className="w-full py-1.5 rounded-lg text-white text-xs font-semibold"
                        style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", fontFamily: POPPINS }}>
                        Expire Now
                      </button>
                      <button onClick={() => { if (confirm("Cancel this campaign?")) doAction("cancel"); }} disabled={actionLoading}
                        className="w-full py-1.5 rounded-lg text-red-400 text-xs font-semibold"
                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: POPPINS }}>
                        Cancel Campaign
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return inner;
  return (
    <div className="min-h-screen" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-12">
        {inner}
      </div>
    </div>
  );
}
