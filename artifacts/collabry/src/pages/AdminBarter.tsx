import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Package, CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

const QUEUE_STATUSES = ["PENDING_APPROVAL","LIVE","HIDDEN","CREDIT_HOLD","REJECTED","EXPIRED"];

export default function AdminBarter({ embedded = false }: { embedded?: boolean } = {}) {
  const { adminFetch, adminId } = useAdminAuth();
  const [, navigate] = useLocation();
  const [barters, setBarters] = useState<any[] | null>(null);
  const [queueStatus, setQueueStatus] = useState("PENDING_APPROVAL");
  const [selected, setSelected] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [holdMessage, setHoldMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId]);

  const load = useCallback(async () => {
    setBarters(null);
    try {
      const r = await adminFetch(`/api/admin/barter?status=${queueStatus}`);
      if (r.ok) setBarters(await r.json());
      else setBarters([]);
    } catch { setBarters([]); }
  }, [queueStatus, adminFetch]);

  useEffect(() => { if (adminId) load(); }, [load, adminId]);

  const doAction = async (action: "approve" | "reject" | "hold", payload?: any) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const r = await adminFetch(`/api/admin/barter/${selected.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      });
      const d = await r.json();
      if (r.ok) {
        setMsg({ text: `Barter campaign ${action}d successfully. Status: ${d.status ?? "updated"}.`, ok: true });
        setSelected(null);
        load();
      } else {
        setMsg({ text: d.error ?? "Action failed", ok: false });
      }
    } catch { setMsg({ text: "Error occurred", ok: false }); }
    setActionLoading(false);
    setTimeout(() => setMsg(null), 5000);
  };

  if (!adminId) return null;

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
  const fmtK = (n: number) => n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n ?? 0);

  const inner = (
    <>
      {!embedded && (
        <div className="mb-6">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 text-xs mb-1 hover:text-white/80">← Dashboard</button>
          <h1 className="text-white font-bold text-2xl">Barter Campaign Review</h1>
          <p className="text-white/70 text-sm mt-1">Review and moderate barter campaign submissions</p>
        </div>
      )}

      {msg && (
          <div className="rounded-xl p-3 mb-4" style={{ background: msg.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${msg.ok ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}` }}>
            <p className="text-sm" style={{ color: msg.ok ? "#10B981" : "#EF4444" }}>{msg.text}</p>
          </div>
        )}

        {/* Queue filter */}
        <div className="flex gap-2 flex-wrap mb-5">
          {QUEUE_STATUSES.map(s => (
            <button key={s} onClick={() => { setQueueStatus(s); setSelected(null); }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: queueStatus === s ? PINK : "rgba(255,255,255,0.08)", color: queueStatus === s ? "#fff" : "rgba(255,255,255,0.8)" }}>
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          {/* List */}
          <div className="flex-1 space-y-2">
            {barters === null ? (
              [1,2,3].map(i => <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />)
            ) : barters.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/70 text-sm">No {queueStatus.toLowerCase().replace("_", " ")} campaigns</p>
              </div>
            ) : barters.map(b => (
              <button key={b.id} onClick={() => setSelected(b)}
                className="w-full text-left rounded-2xl p-4 transition-all"
                style={{ background: selected?.id === b.id ? "rgba(240,24,122,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${selected?.id === b.id ? "rgba(240,24,122,0.25)" : "rgba(255,255,255,0.07)"}` }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{b.name}</p>
                    <p className="text-white/70 text-xs">{b.brandName} · {b.contentType}</p>
                  </div>
                  {queueStatus === "PENDING_APPROVAL" && b.hoursWaiting > 36 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0" style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}>
                      {b.hoursWaiting}h waiting
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-white/70">
                  <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" />{b.productName}</span>
                  <span>₹{parseFloat(b.productValueInr ?? 0).toLocaleString("en-IN")}</span>
                  <span>{b.slotCount} slots</span>
                  <span>{fmtDate(b.createdAt)}</span>
                </div>
                {b.categories?.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {b.categories.map((c: any, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}>{c.name}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="flex-shrink-0" style={{ width: "440px" }}>
              <div className="rounded-2xl flex flex-col" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", maxHeight: "calc(100vh - 180px)" }}>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                  {/* Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-white font-bold text-base leading-snug" style={{ fontFamily: POPPINS }}>{selected.name}</p>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0"
                        style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", fontFamily: POPPINS }}>
                        {queueStatus.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-white/55 text-xs" style={{ fontFamily: POPPINS }}>{selected.brandName}</p>
                  </div>

                  {/* Key metrics grid */}
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                    {([
                      ["Content Type", selected.contentType ?? "—"],
                      ["Slots", `${selected.slotCount ?? "—"}`],
                      ["Product Name", selected.productName ?? "—"],
                      ["Product Value", `₹${parseFloat(selected.productValueInr ?? 0).toLocaleString("en-IN")}`],
                      ["Timeline", selected.timelineDays ? `${selected.timelineDays} days` : "—"],
                      ["Target Gender", selected.targetGender ?? "—"],
                      ["Target Age", selected.targetAge ?? "—"],
                      ["Delivery Window", selected.deliveryWindowDays ? `${selected.deliveryWindowDays} days` : "—"],
                      ["Who Publishes", selected.whoPublishes ?? "—"],
                      ["Submitted", fmtDate(selected.createdAt)],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>{label}</p>
                        <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Target Location */}
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>Target Location</p>
                    <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{selected.targetLocation ?? "—"}</p>
                  </div>

                  {/* Categories */}
                  <div>
                    <p className="text-[10px] mb-1.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>Categories</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(selected.categories ?? []).length === 0
                        ? <span className="text-white/60 text-xs">—</span>
                        : (selected.categories ?? []).map((c: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>{c.name}</span>
                        ))}
                    </div>
                  </div>

                  {/* Long-form text fields */}
                  {([
                    ["Campaign Description", selected.description ?? selected.contentRequirements],
                    ["Reel Script", selected.script],
                    ["Key Message", selected.keyMessage],
                    ["Dos & Don'ts", selected.dosAndDonts],
                    ["Product Description", selected.productDescription],
                  ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>{label}</p>
                      <div className="rounded-xl p-3 overflow-hidden" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <p className="text-white/85 text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ fontFamily: POPPINS, wordBreak: "break-word", overflowWrap: "break-word" }}>{value}</p>
                      </div>
                    </div>
                  ))}

                  {/* Product photos */}
                  {selected.productPhotos?.length > 0 && (
                    <div>
                      <p className="text-[10px] mb-1.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>Product Photos</p>
                      <div className="flex gap-2 flex-wrap">
                        {selected.productPhotos.map((url: string, i: number) => (
                          <button key={i} type="button"
                            onClick={() => window.open(/^https?:\/\//i.test(url) ? url : `https://${url}`, "_blank", "noopener,noreferrer")}
                            title="Open image in new tab"
                            className="rounded-lg overflow-hidden hover:opacity-80 transition-opacity cursor-pointer"
                            style={{ width: 64, height: 64, flexShrink: 0, padding: 0, border: "none", background: "none" }}>
                            <img src={url} alt={`Product ${i + 1}`}
                              className="w-full h-full object-cover"
                              onError={e => { (e.target as any).style.display = "none"; }} />
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 space-y-1">
                        {selected.productPhotos.map((url: string, i: number) => (
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

                  {/* Rejection reason (for rejected campaigns) */}
                  {selected.status === "REJECTED" && (selected.adminRejectionReason || selected.rejectionReason) && (
                    <div>
                      <p className="text-[10px] mb-1" style={{ color: "rgba(239,68,68,0.65)", fontFamily: POPPINS }}>Rejection Reason</p>
                      <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <p className="text-red-300 text-xs leading-relaxed" style={{ fontFamily: POPPINS }}>{selected.adminRejectionReason ?? selected.rejectionReason}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sticky actions footer */}
                {queueStatus === "PENDING_APPROVAL" && (
                  <div className="flex-shrink-0 p-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide" style={{ fontFamily: POPPINS }}>Review Actions</p>

                    <button onClick={() => doAction("approve")} disabled={actionLoading}
                      className="w-full py-2.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                      style={{ background: "#10B981", fontFamily: POPPINS }}>
                      <CheckCircle className="w-4 h-4" />Approve
                    </button>

                    <div>
                      <input value={holdMessage} onChange={e => setHoldMessage(e.target.value)} placeholder="Message to brand (optional)…"
                        className="w-full px-3 py-2 rounded-xl text-white text-xs outline-none mb-1"
                        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: POPPINS }} />
                      <button onClick={() => doAction("hold", { message: holdMessage || undefined })} disabled={actionLoading}
                        className="w-full py-2.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                        style={{ background: "rgba(245,158,11,0.3)", border: "1px solid rgba(245,158,11,0.4)", fontFamily: POPPINS }}>
                        <MessageSquare className="w-4 h-4" />Request Info
                      </button>
                    </div>

                    <div>
                      <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Rejection reason *"
                        className="w-full px-3 py-2 rounded-xl text-white text-xs outline-none mb-1"
                        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: POPPINS }} />
                      <button onClick={() => {
                        if (!rejectReason.trim()) { setMsg({ text: "Rejection reason required", ok: false }); setTimeout(() => setMsg(null), 3000); return; }
                        doAction("reject", { reason: rejectReason });
                      }} disabled={actionLoading}
                        className="w-full py-2.5 rounded-xl text-red-400 font-semibold text-sm flex items-center justify-center gap-2"
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: POPPINS }}>
                        <XCircle className="w-4 h-4" />Reject
                      </button>
                    </div>
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
