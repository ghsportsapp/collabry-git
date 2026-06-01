import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Search, RefreshCw, X, ChevronRight,
  MoreHorizontal, Clock, AlertCircle, CheckCircle, XCircle
} from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import DealChat from "@/components/DealChat";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BG = "#0A0A0F";
const CARD = "#13151D";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

type FilterTab = "active" | "completed" | "cancelled" | "flagged";

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  IN_ESCROW:            { bg: "rgba(99,102,241,0.15)",  color: "#a5b4fc" },
  PENDING_PAYMENT:      { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  LIVE:                 { bg: "rgba(34,197,94,0.15)",   color: "#4ade80" },
  IN_PROGRESS:          { bg: "rgba(34,197,94,0.15)",   color: "#4ade80" },
  CONCEPT_SUBMITTED:    { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
  CONCEPT_APPROVED:     { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
  CONTENT_UPLOADED:     { bg: "rgba(168,85,247,0.15)",  color: "#c084fc" },
  REVISION_REQUESTED:   { bg: "rgba(245,158,11,0.15)",  color: "#fbbf24" },
  CONTENT_APPROVED:     { bg: "rgba(16,185,129,0.15)",  color: "#6ee7b7" },
  FINAL_POST_CONFIRMED: { bg: "rgba(16,185,129,0.15)",  color: "#6ee7b7" },
  POST_LIVE_PENDING:    { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
  URL_FLAGGED:          { bg: "rgba(239,68,68,0.18)",   color: "#f87171" },
  DISPUTE_WINDOW_OPEN:  { bg: "rgba(239,68,68,0.12)",   color: "#f87171" },
  DISPUTED:             { bg: "rgba(239,68,68,0.18)",   color: "#f87171" },
  OVERDUE:              { bg: "rgba(239,68,68,0.12)",   color: "#f87171" },
  DELIVERED:            { bg: "rgba(16,185,129,0.15)",  color: "#4ade80" },
  COMPLETED:            { bg: "rgba(16,185,129,0.15)",  color: "#34d399" },
  CANCELLED:            { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)" },
  REJECTED:             { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)" },
  EXPIRED:              { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)" },
};

const SOURCE_COLOR: Record<string, { bg: string; color: string }> = {
  CAMPAIGN:    { bg: "rgba(240,24,122,0.15)", color: "#E14F69" },
  BARTER:      { bg: "rgba(168,85,247,0.15)", color: "#c084fc" },
  MATCHMAKING: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  SEARCH:      { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
};

const STATUS_LABEL: Record<string, string> = {
  CONTENT_APPROVED: "Completed",
  DISPUTE_WINDOW_OPEN: "Completed",
  FINAL_POST_CONFIRMED: "Completed",
};

function StatusBadge({ s }: { s: string }) {
  const c = STATUS_COLOR[s] ?? { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.70)" };
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
      style={{ background: c.bg, color: c.color }}>
      {STATUS_LABEL[s] ?? s.replace(/_/g, " ")}
    </span>
  );
}

function SourceBadge({ s }: { s: string }) {
  const c = SOURCE_COLOR[s] ?? { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.70)" };
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: c.bg, color: c.color }}>
      {s}
    </span>
  );
}

function PayoutStatusBadge({ status }: { status?: string | null }) {
  if (!status || status === "PENDING") {
    return <span className="text-[10px] text-white/70">Pending</span>;
  }
  if (status === "RELEASED") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
        Paid to Creator
      </span>
    );
  }
  if (status === "REFUNDED_TO_BRAND") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
        Refunded to Brand
      </span>
    );
  }
  if (status === "PENDING_KYC") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
        Pending KYC
      </span>
    );
  }
  return <span className="text-[10px] text-white/70">{status.replace(/_/g, " ")}</span>;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
}
function fmtINR(n: any) { return `₹${parseFloat(n ?? 0).toLocaleString("en-IN")}`; }

// ─── Deal Detail Drawer ────────────────────────────────────────────────────────
function AdminDealDetail({ dealId, adminFetch, onClose }: {
  dealId: string;
  adminFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  // URL flag review
  const [urlFlagAction, setUrlFlagAction] = useState<Record<string, "OVERRIDE" | "REQUEST_RESUBMIT">>({});
  const [urlFlagNote, setUrlFlagNote] = useState<Record<string, string>>({});

  // Pipeline dispute (new spec) — moved to card level, but keep for backward compat

  // Override status
  const [overrideStatus, setOverrideStatus] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  // Extend timeline
  const [extendDays, setExtendDays] = useState("");
  const [extendReason, setExtendReason] = useState("");
  // Cancel
  const [cancelReason, setCancelReason] = useState("");
  // Dispute (legacy)
  const [disputeResolution, setDisputeResolution] = useState("FULL_PAYOUT");
  const [disputeNotes, setDisputeNotes] = useState("");
  // Pipeline dispute outcome (new spec)
  const [pipelineOutcome, setPipelineOutcome] = useState<"VALID" | "INVALID">("INVALID");
  const [pipelineNotes, setPipelineNotes] = useState("");
  // Simulate payout
  const [payoutRef, setPayoutRef] = useState("");
  // Make payment modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReason, setPaymentReason] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState("");
  // Refund brand modal
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deals/${dealId}/detail`);
      if (r.ok) setData(await r.json());
      else setErr("Failed to load deal");
    } catch { setErr("Network error"); }
    finally { setLoading(false); }
  }, [dealId, adminFetch]);

  useEffect(() => { load(); }, [load]);

  async function doAction(url: string, body: any) {
    setActionLoading(true); setActionMsg("");
    try {
      const r = await adminFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setActionMsg(d.error ?? "Action failed"); return; }
      setActionMsg("✅ Done");
      load();
    } catch { setActionMsg("Network error"); }
    finally { setActionLoading(false); }
  }

  const deal = data?.deal;
  const msgs = data?.messages ?? [];
  const actions = data?.adminActions ?? [];
  const disputes = data?.disputes ?? [];
  const issues = data?.issues ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl h-full overflow-y-auto"
        style={{ background: "#0F0F18", borderLeft: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{ background: "#0F0F18", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h2 className="text-white font-bold text-base">Deal Detail</h2>
            {deal && <p className="text-white/70 text-[11px] font-mono">{deal.id.slice(0, 16)}…</p>}
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-white/80" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-6 h-6 text-white/70 animate-spin" />
          </div>
        ) : err ? (
          <p className="text-red-400 text-sm text-center py-12">{err}</p>
        ) : (
          <div className="px-5 py-5 space-y-6">

            {/* Deal Overview */}
            <section>
              <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Overview</h3>
              <div className="rounded-xl p-4 space-y-2" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-sm">{deal.brandName} → {deal.creatorName}</p>
                    <p className="text-white/70 text-[11px]">@{deal.instagramHandle}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge s={deal.status} />
                    <SourceBadge s={deal.source} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs pt-1">
                  <Row label="Reels" value={String(deal.reelCount)} />
                  <Row label="Stories" value={String(deal.storyCount)} />
                  <Row label="Photos" value={String(deal.postCount)} />
                  <Row label="Timeline" value={`${deal.timelineDays} days`} />
                  <Row label="Started" value={fmtDate(deal.timelineStartAt)} />
                  <Row label="Deadline" value={fmtDate(deal.deadlineAt)} />
                  <Row label="Created" value={fmtDate(deal.createdAt)} />
                </div>

                {/* Financial Breakdown */}
                <div className="mt-3 rounded-xl p-3.5 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-2">Financial Breakdown</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/75">Deal Amount</span>
                    <span className="text-white font-semibold">{fmtINR(deal.totalAgreedValue)}</span>
                  </div>
                  {Number(deal.gstAmount) > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/75">GST</span>
                      <span className="text-white/90">{fmtINR(deal.gstAmount)}</span>
                    </div>
                  )}
                  {deal.totalPayable && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/75">Brand Paid (incl. GST)</span>
                      <span className="text-white/90">{fmtINR(deal.totalPayable)}</span>
                    </div>
                  )}
                  {Number(deal.creatorPayout) > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/75">Platform Fee</span>
                      <span className="text-white/90">{fmtINR(Number(deal.totalAgreedValue || 0) - Number(deal.creatorPayout || 0))}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                    <span className="text-white/80 text-xs font-semibold">Creator Payout</span>
                    <span className="font-bold text-sm" style={{ color: "#4ade80" }}>{fmtINR(deal.creatorPayout ?? deal.totalAgreedValue)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className="text-white/75">Escrow</span>
                    <span className="text-white/90">{deal.escrowStatus ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/75">Payment Status</span>
                    <PayoutStatusBadge status={deal.payoutStatus} />
                  </div>
                  {deal.payoutStatus === "RELEASED" && deal.paidAmount && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/75">Paid to Creator</span>
                      <span className="text-green-400 font-semibold">{fmtINR(deal.paidAmount)}</span>
                    </div>
                  )}
                  {deal.payoutAdjustmentReason && (
                    <div className="text-xs pt-1">
                      <span className="text-white/70">Adj. reason: </span>
                      <span className="text-amber-400/80">{deal.payoutAdjustmentReason}</span>
                    </div>
                  )}
                  {deal.payoutStatus === "REFUNDED_TO_BRAND" && deal.refundAmount && (
                    <>
                      <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: "rgba(239,68,68,0.15)" }}>
                        <span className="text-red-400/80">Refunded to Brand</span>
                        <span className="text-red-300 font-semibold">{fmtINR(deal.refundAmount)}</span>
                      </div>
                      {deal.refundReason && (
                        <div className="text-xs">
                          <span className="text-white/70">Reason: </span>
                          <span className="text-white/80">{deal.refundReason}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Disputes */}
            {disputes.length > 0 && (
              <section>
                <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Disputes</h3>
                {disputes.map((d: any) => (
                  <div key={d.id} className="rounded-xl p-3 mb-2" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <p className="text-red-300 font-semibold text-sm">{d.reason}</p>
                    <p className="text-white/80 text-xs mt-1">{d.description}</p>
                    {d.adminDecision && <p className="text-green-400 text-xs mt-2">Decision: {d.adminDecision}</p>}
                    {d.adminNotes && <p className="text-white/70 text-xs">{d.adminNotes}</p>}
                  </div>
                ))}
              </section>
            )}

            {/* Product Issues */}
            {issues.length > 0 && (
              <section>
                <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Product Issues</h3>
                {issues.map((d: any) => (
                  <div key={d.id} className="rounded-xl p-3 mb-2" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
                    <p className="text-amber-300 font-semibold text-sm">{d.issueType}</p>
                    <p className="text-white/80 text-xs mt-1">{d.description}</p>
                    {d.adminDecision && <p className="text-green-400 text-xs mt-2">Decision: {d.adminDecision}</p>}
                  </div>
                ))}
              </section>
            )}

            {/* Chat History */}
            <section>
              <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Deal Chat</h3>
              <div className="rounded-xl p-4" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.07)", minHeight: 420 }}>
                <DealChat
                  dealId={dealId}
                  currentUserType="BRAND"
                  apiFetch={(_url, opts) => {
                    const isPost = opts?.method === "POST";
                    const endpoint = isPost
                      ? `${BASE_URL}/api/admin/deals/${dealId}/chat/send`
                      : `${BASE_URL}/api/admin/deals/${dealId}/chat`;
                    return adminFetch(endpoint, opts);
                  }}
                  dealStatus="COMPLETED"
                />
              </div>
            </section>

            {/* Admin Actions */}
            {actionMsg && (
              <p className={`text-sm text-center py-1 ${actionMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{actionMsg}</p>
            )}

            {/* Override Status */}
            <section>
              <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Override Status</h3>
              <div className="rounded-xl p-4 space-y-3" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.07)" }}>
                <select value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <option value="" style={{ background: "#13151D" }}>Select status…</option>
                  {["LIVE","IN_PROGRESS","CONCEPT_SUBMITTED","CONCEPT_APPROVED","CONTENT_UPLOADED",
                    "CONTENT_APPROVED","FINAL_POST_CONFIRMED","DISPUTE_WINDOW_OPEN","DISPUTED",
                    "OVERDUE","DELIVERED","COMPLETED","CANCELLED"].map(s => (
                    <option key={s} value={s} style={{ background: "#13151D" }}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <input value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                  placeholder="Reason (required)…"
                  className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }} />
                <button disabled={!overrideStatus || !overrideReason || actionLoading}
                  onClick={() => doAction(`${BASE_URL}/api/admin/deals/${dealId}/override-status`, { status: overrideStatus, reason: overrideReason })}
                  className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: PINK }}>
                  {actionLoading ? "Saving…" : "Override Status"}
                </button>
              </div>
            </section>

            {/* Resolve Dispute (only if disputed) */}
            {(deal?.status === "DISPUTED" || disputes.length > 0) && !disputes[0]?.resolvedAt && (
              <section>
                <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Resolve Dispute</h3>
                <div className="rounded-xl p-4 space-y-3" style={{ background: CARD, border: "1px solid rgba(239,68,68,0.20)" }}>
                  <select value={disputeResolution} onChange={e => setDisputeResolution(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
                    {["FULL_PAYOUT","PARTIAL_PAYOUT","NO_PAYOUT","FULL_REFUND"].map(r => (
                      <option key={r} value={r} style={{ background: "#13151D" }}>{r.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                  <textarea value={disputeNotes} onChange={e => setDisputeNotes(e.target.value)}
                    placeholder="Admin notes…" rows={3}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none resize-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }} />
                  <button disabled={actionLoading}
                    onClick={() => doAction(`${BASE_URL}/api/admin/deals/${dealId}/resolve-dispute`, { resolution: disputeResolution, notes: disputeNotes })}
                    className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
                    style={{ background: "#ef4444" }}>
                    {actionLoading ? "Saving…" : "Resolve Dispute"}
                  </button>
                </div>
              </section>
            )}

            {/* Resolve Pipeline Dispute (new spec) */}
            {deal?.status === "DISPUTED" && (
              <section>
                <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Resolve Pipeline Dispute</h3>
                <div className="rounded-xl p-4 space-y-3" style={{ background: CARD, border: "1px solid rgba(239,68,68,0.20)" }}>
                  <p className="text-white/75 text-[11px]">VALID = creator deleted post → 50% refund. INVALID = post is fine → full payout.</p>
                  <select value={pipelineOutcome} onChange={e => setPipelineOutcome(e.target.value as "VALID" | "INVALID")}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
                    <option value="INVALID" style={{ background: "#13151D" }}>INVALID — full payout to creator</option>
                    <option value="VALID" style={{ background: "#13151D" }}>VALID — 50% refund to brand</option>
                  </select>
                  <textarea value={pipelineNotes} onChange={e => setPipelineNotes(e.target.value)}
                    placeholder="Notes (required)…" rows={3}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none resize-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }} />
                  <button disabled={!pipelineNotes.trim() || actionLoading}
                    onClick={() => doAction(`${BASE_URL}/api/admin/deals/${dealId}/dispute/resolve`, { outcome: pipelineOutcome, notes: pipelineNotes.trim() })}
                    className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
                    style={{ background: "#ef4444" }}>
                    {actionLoading ? "Saving…" : "Resolve Pipeline Dispute"}
                  </button>
                </div>
              </section>
            )}

            {/* Pay Creator (COMPLETED / CONTENT_APPROVED + not yet refunded or paid) */}
            {(deal?.status === "COMPLETED" || deal?.status === "CONTENT_APPROVED" || deal?.status === "DISPUTE_WINDOW_OPEN") && deal?.payoutStatus !== "REFUNDED_TO_BRAND" && (
              <section>
                <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">
                  Pay Creator
                </h3>
                <div className="rounded-xl p-4 space-y-3" style={{ background: CARD, border: "1px solid rgba(34,197,94,0.25)" }}>
                  {deal?.payoutStatus === "RELEASED" ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#22c55e" }} />
                        <p className="text-green-400 text-sm font-semibold">Payment released to creator</p>
                      </div>
                      {deal.paidAmount && (
                        <p className="text-white/70 text-xs pl-4">
                          {fmtINR(deal.paidAmount)} paid
                          {deal.payoutAdjustmentReason && ` · ${deal.payoutAdjustmentReason}`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <p className="text-white/75 text-[11px]">Release payment to the creator. You can adjust the amount if needed — a reason is required for any change from the agreed payout.</p>
                        {deal?.payoutStatus === "PENDING_KYC" && (
                          <p className="text-amber-400 text-[11px]">⚠️ Creator KYC is not verified — payment will be queued until KYC is approved.</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)" }}>
                        <span className="text-white/80 text-xs">Agreed creator payout</span>
                        <span className="text-green-400 text-sm font-bold">{fmtINR(deal?.creatorPayout ?? deal?.totalAgreedValue)}</span>
                      </div>
                      <button
                        onClick={() => {
                          const orig = Number(deal?.creatorPayout ?? deal?.totalAgreedValue ?? 0);
                          setPaymentAmount(orig > 0 ? String(orig) : "");
                          setPaymentReason("");
                          setPaymentMsg("");
                          setPaymentModalOpen(true);
                        }}
                        className="w-full py-3 rounded-full text-white text-sm font-bold"
                        style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)" }}>
                        💸 Pay Creator
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* Refund Brand */}
            {deal?.payoutStatus !== "RELEASED" && (
              <section>
                <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">
                  Refund Brand
                </h3>
                <div className="rounded-xl p-4 space-y-3" style={{ background: CARD, border: deal?.payoutStatus === "REFUNDED_TO_BRAND" ? "1px solid rgba(239,68,68,0.30)" : "1px solid rgba(255,255,255,0.07)" }}>
                  {deal?.payoutStatus === "REFUNDED_TO_BRAND" ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f87171" }} />
                        <p className="text-red-400 text-sm font-semibold">Brand has been refunded</p>
                      </div>
                      {deal.refundAmount && (
                        <p className="text-white/70 text-xs pl-4">
                          {fmtINR(deal.refundAmount)} refunded
                          {deal.refundReason && ` · ${deal.refundReason}`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-white/70 text-[11px]">Refund escrow amount back to the brand. This will disable creator payment and close the financial flow for this deal.</p>
                      <button
                        onClick={() => {
                          const orig = Number(deal?.totalPayable ?? deal?.totalAgreedValue ?? 0);
                          setRefundAmount(orig > 0 ? String(orig) : "");
                          setRefundReason("");
                          setRefundMsg("");
                          setRefundModalOpen(true);
                        }}
                        className="w-full py-2.5 rounded-full text-white text-sm font-semibold"
                        style={{ background: "rgba(239,68,68,0.75)" }}>
                        ↩ Refund Brand
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* Refund Brand Modal */}
            {refundModalOpen && deal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
                style={{ background: "rgba(0,0,0,0.82)" }}
                onClick={e => { if (e.target === e.currentTarget) setRefundModalOpen(false); }}>
                <div className="w-full max-w-md rounded-2xl p-6 space-y-5"
                  style={{ background: "#0F0F18", border: "1px solid rgba(239,68,68,0.30)", boxShadow: "0 24px 80px rgba(0,0,0,0.85)" }}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-bold text-base">Refund Brand</h3>
                    <button onClick={() => setRefundModalOpen(false)}>
                      <X className="w-5 h-5 text-white/70" />
                    </button>
                  </div>

                  {/* Deal summary */}
                  <div className="rounded-xl p-3.5 space-y-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-white font-semibold text-sm">{deal.brandName} → {deal.creatorName}</p>
                    <p className="text-white/70 text-xs">@{deal.instagramHandle}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-white/70 text-xs">Original deal amount</span>
                      <span className="text-white text-sm font-bold">{fmtINR(deal.totalAgreedValue)}</span>
                    </div>
                    {deal.totalPayable && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-xs">Brand paid (incl. GST)</span>
                        <span className="text-white/90 text-xs font-semibold">{fmtINR(deal.totalPayable)}</span>
                      </div>
                    )}
                  </div>

                  {/* Refund amount */}
                  <div className="space-y-1.5">
                    <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">Refund Amount (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={refundAmount}
                      onChange={e => setRefundAmount(e.target.value)}
                      placeholder="Enter refund amount…"
                      className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  {/* Reason (mandatory) */}
                  <div className="space-y-1.5">
                    <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">
                      Reason <span className="text-red-400">(required)</span>
                    </label>
                    <textarea
                      value={refundReason}
                      onChange={e => setRefundReason(e.target.value)}
                      placeholder="e.g. Deal cancelled by admin — creator unresponsive…"
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none resize-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  {refundMsg && (
                    <p className={`text-sm text-center ${refundMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{refundMsg}</p>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setRefundModalOpen(false)}
                      className="flex-1 py-2.5 rounded-full text-white/90 text-sm font-semibold"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                      Cancel
                    </button>
                    <button
                      disabled={refundLoading || !refundAmount || !refundReason.trim()}
                      onClick={async () => {
                        const amt = Number(refundAmount);
                        if (isNaN(amt) || amt < 0) { setRefundMsg("Enter a valid amount"); return; }
                        if (!refundReason.trim()) { setRefundMsg("Reason is required"); return; }
                        setRefundLoading(true); setRefundMsg("");
                        try {
                          const r = await adminFetch(`${BASE_URL}/api/admin/deals/${dealId}/refund-brand`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ refundAmount: amt, refundReason: refundReason.trim() }),
                          });
                          const d = await r.json();
                          if (!r.ok) { setRefundMsg(d.error ?? "Refund failed"); return; }
                          setRefundMsg("✅ Refund processed successfully");
                          setTimeout(() => { setRefundModalOpen(false); load(); }, 1400);
                        } catch { setRefundMsg("Network error"); }
                        finally { setRefundLoading(false); }
                      }}
                      className="flex-1 py-2.5 rounded-full text-white text-sm font-bold disabled:opacity-50"
                      style={{ background: "rgba(239,68,68,0.85)" }}>
                      {refundLoading ? "Processing…" : "Confirm Refund"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Modal */}
            {paymentModalOpen && deal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
                style={{ background: "rgba(0,0,0,0.80)" }}
                onClick={e => { if (e.target === e.currentTarget) setPaymentModalOpen(false); }}>
                <div className="w-full max-w-md rounded-2xl p-6 space-y-5"
                  style={{ background: "#0F0F18", border: "1px solid rgba(34,197,94,0.30)", boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-bold text-base">Pay Creator</h3>
                      <p className="text-white/70 text-[11px] mt-0.5">{deal.brandName} → {deal.creatorName}</p>
                    </div>
                    <button onClick={() => setPaymentModalOpen(false)}>
                      <X className="w-5 h-5 text-white/70" />
                    </button>
                  </div>

                  {/* Deal summary */}
                  <div className="rounded-xl p-3.5 space-y-1.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-white font-semibold text-sm">{deal.brandName} → {deal.creatorName}</p>
                    <p className="text-white/70 text-xs">@{deal.instagramHandle}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-white/70 text-xs">Agreed payout</span>
                      <span className="text-white text-sm font-bold">{fmtINR(deal.creatorPayout ?? deal.totalAgreedValue)}</span>
                    </div>
                  </div>

                  {/* Amount input */}
                  <div className="space-y-1.5">
                    <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">Payment Amount (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      placeholder="Enter amount…"
                      className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                    {paymentAmount && Number(paymentAmount) !== Number(deal.creatorPayout ?? deal.totalAgreedValue) && (
                      <p className="text-amber-400 text-[11px]">
                        Adjusted from {fmtINR(deal.creatorPayout ?? deal.totalAgreedValue)} → {fmtINR(paymentAmount)} — reason required below.
                      </p>
                    )}
                  </div>

                  {/* Reason input */}
                  <div className="space-y-1.5">
                    <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">
                      Reason {Number(paymentAmount) !== Number(deal.creatorPayout ?? deal.totalAgreedValue) ? <span className="text-red-400">(required)</span> : "(optional)"}
                    </label>
                    <textarea
                      value={paymentReason}
                      onChange={e => setPaymentReason(e.target.value)}
                      placeholder="e.g. Partial payment due to late delivery…"
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none resize-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  {/* Payout reference */}
                  <div className="space-y-1.5">
                    <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">Reference ID (optional)</label>
                    <input
                      value={payoutRef}
                      onChange={e => setPayoutRef(e.target.value)}
                      placeholder="Bank/UPI reference…"
                      className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  {paymentMsg && (
                    <p className={`text-sm text-center ${paymentMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{paymentMsg}</p>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setPaymentModalOpen(false)}
                      className="flex-1 py-2.5 rounded-full text-white/90 text-sm font-semibold"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                      Cancel
                    </button>
                    <button
                      disabled={paymentLoading || !paymentAmount}
                      onClick={async () => {
                        const origAmt = Number(deal.creatorPayout ?? deal.totalAgreedValue ?? 0);
                        const newAmt = Number(paymentAmount);
                        if (Math.abs(newAmt - origAmt) > 0.005 && !paymentReason.trim()) {
                          setPaymentMsg("Reason is required when adjusting the amount.");
                          return;
                        }
                        setPaymentLoading(true); setPaymentMsg("");
                        try {
                          const body: Record<string, unknown> = { amount: newAmt };
                          if (paymentReason.trim()) body["adjustmentReason"] = paymentReason.trim();
                          if (payoutRef.trim()) body["payoutReferenceId"] = payoutRef.trim();
                          const r = await adminFetch(`${BASE_URL}/api/admin/deals/${dealId}/simulate-payout`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body),
                          });
                          const d = await r.json();
                          if (!r.ok) { setPaymentMsg(d.error ?? "Payment failed"); return; }
                          setPaymentMsg("✅ Payment released successfully");
                          setTimeout(() => { setPaymentModalOpen(false); load(); }, 1400);
                        } catch { setPaymentMsg("Network error"); }
                        finally { setPaymentLoading(false); }
                      }}
                      className="flex-1 py-2.5 rounded-full text-white text-sm font-bold disabled:opacity-50"
                      style={{ background: "#22c55e" }}>
                      {paymentLoading ? "Processing…" : "Confirm Payment"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Extend Timeline */}
            <section>
              <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Extend Timeline</h3>
              <div className="rounded-xl p-4 space-y-3" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex gap-3">
                  <input type="number" min={1} value={extendDays} onChange={e => setExtendDays(e.target.value)}
                    placeholder="Days to add"
                    className="w-32 px-3 py-2 rounded-lg text-white text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }} />
                  <input value={extendReason} onChange={e => setExtendReason(e.target.value)}
                    placeholder="Reason (required)…"
                    className="flex-1 px-3 py-2 rounded-lg text-white text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }} />
                </div>
                <button disabled={!extendDays || !extendReason || actionLoading}
                  onClick={() => doAction(`${BASE_URL}/api/admin/deals/${dealId}/extend-timeline`, { days: parseInt(extendDays), reason: extendReason })}
                  className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: "rgba(59,130,246,0.8)" }}>
                  {actionLoading ? "Saving…" : "Extend Timeline"}
                </button>
              </div>
            </section>

            {/* URL Flag Review */}
            {deal?.status === "URL_FLAGGED" && (data?.deliverables ?? []).some((d: any) => d.livePostFlagged) && (
              <section>
                <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">🚩 URL Flag Review</h3>
                <div className="space-y-3">
                  {(data?.deliverables ?? []).filter((d: any) => d.livePostFlagged).map((d: any) => (
                    <div key={d.id} className="rounded-xl p-3 space-y-2" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                      <div className="flex items-center justify-between">
                        <p className="text-red-300 font-semibold text-sm">{d.slotLabel} ({d.type})</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(239,68,68,0.18)", color: "#f87171" }}>Flagged</span>
                      </div>
                      {d.livePostUrl && (
                        <a href={/^https?:\/\//i.test(d.livePostUrl) ? d.livePostUrl : `https://${d.livePostUrl}`} target="_blank" rel="noopener noreferrer" className="text-pink-400 text-xs break-all block">{d.livePostUrl}</a>
                      )}
                      <p className="text-white/70 text-[10px]">Resubmissions used: {d.livePostResubmissionCount}/1</p>
                      <select value={urlFlagAction[d.id] ?? ""} onChange={e => setUrlFlagAction(p => ({ ...p, [d.id]: e.target.value as any }))}
                        className="w-full px-3 py-2 rounded-lg text-white text-xs outline-none"
                        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
                        <option value="" style={{ background: "#13151D" }}>Choose action…</option>
                        <option value="OVERRIDE" style={{ background: "#13151D" }}>✅ Override — force confirm this slot</option>
                        <option value="REQUEST_RESUBMIT" style={{ background: "#13151D" }}>🔄 Request resubmission from creator</option>
                      </select>
                      <input value={urlFlagNote[d.id] ?? ""} onChange={e => setUrlFlagNote(p => ({ ...p, [d.id]: e.target.value }))}
                        placeholder="Admin note (optional)…"
                        className="w-full px-3 py-2 rounded-lg text-white text-xs outline-none"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }} />
                      <button disabled={!urlFlagAction[d.id] || actionLoading}
                        onClick={() => doAction(`${BASE_URL}/api/admin/deals/${dealId}/url-flag/review`, { deliverableId: d.id, action: urlFlagAction[d.id], adminNote: urlFlagNote[d.id] ?? "" })}
                        className="w-full py-2 rounded-full text-white text-xs font-semibold disabled:opacity-40"
                        style={{ background: urlFlagAction[d.id] === "OVERRIDE" ? "#22C55E" : "rgba(59,130,246,0.80)" }}>
                        {actionLoading ? "Saving…" : urlFlagAction[d.id] === "OVERRIDE" ? "Force Confirm" : urlFlagAction[d.id] === "REQUEST_RESUBMIT" ? "Request Resubmit" : "Apply Action"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Cancel Deal */}
            <section>
              <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Cancel Deal</h3>
              <div className="rounded-xl p-4 space-y-3" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.07)" }}>
                <input value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  placeholder="Reason (required)…"
                  className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }} />
                <button disabled={!cancelReason || actionLoading}
                  onClick={() => doAction(`${BASE_URL}/api/admin/deals/${dealId}/cancel`, { reason: cancelReason })}
                  className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: "rgba(239,68,68,0.80)" }}>
                  {actionLoading ? "Saving…" : "Cancel Deal"}
                </button>
              </div>
            </section>

            {/* Admin Action Log */}
            {actions.length > 0 && (
              <section>
                <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-3">Admin Action Log</h3>
                <div className="space-y-2">
                  {actions.map((a: any) => (
                    <div key={a.id} className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-white/80 text-[12px] font-semibold">{a.action.replace(/_/g, " ")}</span>
                        <span className="text-white/70 text-[10px]">{fmtDate(a.createdAt)}</span>
                      </div>
                      {a.reason && <p className="text-white/70 text-[11px] mt-0.5">{a.reason}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-white/70">{label}: </span>
      <span className="text-white/85">{value}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminDeals() {
  const { adminId, adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterTab>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deals, setDeals] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [flaggedBadge, setFlaggedBadge] = useState(0);
  const [cardActionState, setCardActionState] = useState<Record<string, { loading?: boolean; done?: string; error?: string }>>({});
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId, navigate]);

  const loadFlaggedBadge = useCallback(async () => {
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deals/flagged`);
      if (r.ok) {
        const d = await r.json();
        const items = (d.deals ?? []) as any[];
        const count = items.filter((x: any) => x.status === "DISPUTED" || x.status === "URL_FLAGGED").length;
        setFlaggedBadge(count);
      }
    } catch {}
  }, [adminFetch]);

  const load = useCallback(async (f = filter, s = search, p = page) => {
    setLoading(true);
    try {
      let r: Response;
      if (f === "flagged") {
        r = await adminFetch(`${BASE_URL}/api/admin/deals/flagged`);
        if (r.ok) {
          const d = await r.json();
          setDeals(d.deals ?? []);
          setTotal(d.deals?.length ?? 0);
          const count = (d.deals ?? []).filter((x: any) => x.status === "DISPUTED" || x.status === "URL_FLAGGED").length;
          setFlaggedBadge(count);
        } else {
          setDeals([]);
        }
      } else {
        const params = new URLSearchParams({ filter: f, search: s.trim(), page: String(p), limit: "20" });
        r = await adminFetch(`${BASE_URL}/api/admin/deals/list?${params}`);
        if (r.ok) {
          const d = await r.json();
          setDeals(d.deals ?? []);
          setTotal(d.total ?? 0);
        } else {
          setDeals([]);
        }
      }
    } catch { setDeals([]); }
    finally { setLoading(false); }
  }, [filter, search, page, adminFetch]);

  async function doCardAction(key: string, url: string, body: any) {
    setCardActionState(p => ({ ...p, [key]: { loading: true } }));
    try {
      const r = await adminFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setCardActionState(p => ({ ...p, [key]: { error: d.error ?? "Action failed" } }));
        return;
      }
      setCardActionState(p => ({ ...p, [key]: { done: "✅ Done" } }));
      load();
    } catch {
      setCardActionState(p => ({ ...p, [key]: { error: "Network error" } }));
    }
  }

  useEffect(() => { load(); }, [filter, page]);
  useEffect(() => { if (adminId) loadFlaggedBadge(); }, [adminId]);

  function handleSearch(v: string) {
    setSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); load(filter, v, 1); }, 500);
  }

  function handleFilter(f: FilterTab) { setFilter(f); setPage(1); }

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!adminId) return null;

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: POPPINS }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ background: `${BG}F2`, backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-2xl" style={{ color: PINK, fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
          <span className="text-white/70 text-lg">|</span>
          <span className="text-white/80 text-sm">Deal Operations</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-white">Deal Operations</h1>
          <p className="text-white/70 text-sm mt-1">Monitor, intervene, and resolve all active deals</p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {([
            ["active", "Active", <Clock className="w-3.5 h-3.5" />],
            ["flagged", "Flagged & Disputed", <AlertCircle className="w-3.5 h-3.5" />],
            ["completed", "Completed", <CheckCircle className="w-3.5 h-3.5" />],
            ["cancelled", "Cancelled", <XCircle className="w-3.5 h-3.5" />],
          ] as const).map(([key, label, icon]) => (
            <button key={key} onClick={() => handleFilter(key)}
              className="relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-all"
              style={{ color: filter === key ? (key === "flagged" ? "#f87171" : PINK) : "rgba(255,255,255,0.70)", borderBottom: filter === key ? `2px solid ${key === "flagged" ? "#f87171" : PINK}` : "2px solid transparent" }}>
              {icon}{label}
              {key === "flagged" && flaggedBadge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white"
                  style={{ background: "#ef4444", lineHeight: 1 }}>{flaggedBadge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search + refresh */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search by deal ID, brand, creator, @handle…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }} />
          </div>
          <button onClick={() => load()} className="p-2.5 rounded-xl text-white/70 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Total count */}
        {deals !== null && filter !== "flagged" && (
          <p className="text-white/70 text-xs mb-3">
            {total} deal{total !== 1 ? "s" : ""} {filter === "active" ? "active" : filter}
          </p>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}
          </div>
        ) : filter === "flagged" ? (
          /* ── Flagged & Disputed two-section view ── */
          <div className="space-y-8">
            {/* Section A — Disputed */}
            {(() => {
              const disputed = (deals ?? []).filter((d: any) => d.status === "DISPUTED");
              return (
                <div>
                  <h2 className="text-white font-bold text-base mb-1 flex items-center gap-2">
                    ⚖️ Disputed Deals
                    {disputed.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style={{ background: "#ef4444" }}>{disputed.length}</span>
                    )}
                  </h2>
                  <p className="text-white/70 text-xs mb-4">Brand raised a dispute — admin must resolve.</p>
                  {disputed.length === 0 ? (
                    <div className="rounded-2xl py-10 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-white/70 text-sm">No disputed deals</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {disputed.map((d: any) => {
                        const resolveKey = `resolve-${d.id}`;
                        const cs = cardActionState[resolveKey];
                        return (
                          <div key={d.id} className="rounded-2xl p-5 space-y-4" style={{ background: CARD, border: "1px solid rgba(239,68,68,0.25)" }}>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-white font-semibold text-sm">{d.brandName}</span>
                                  <ChevronRight className="w-3 h-3 text-white/70" />
                                  <span className="text-white font-semibold text-sm">{d.creatorName}</span>
                                  <span className="text-white/70 text-xs">@{d.instagramHandle}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <StatusBadge s={d.status} />
                                  <SourceBadge s={d.source ?? "SEARCH"} />
                                  <span className="text-white/70 text-[10px]">Disputed {fmtDate(d.disputeRaisedAt ?? d.createdAt)}</span>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-white font-bold text-sm">{fmtINR(d.totalAgreedValue)}</p>
                                <p className="text-white/70 text-[10px]">Escrow: {d.escrowStatus ?? "—"}</p>
                              </div>
                            </div>
                            {/* Dispute reason */}
                            {(d.disputeReason || d.disputeDescription) && (
                              <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                                {d.disputeReason && <p className="text-red-300 text-xs font-semibold mb-1">{d.disputeReason}</p>}
                                {d.disputeDescription && <p className="text-white/80 text-xs leading-relaxed">{d.disputeDescription}</p>}
                              </div>
                            )}
                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button onClick={() => setSelectedDealId(d.id)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white/80"
                                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                💬 View Deal Chat
                              </button>
                            </div>
                            {/* Resolution panel */}
                            {cs?.done ? (
                              <p className="text-green-400 text-xs font-semibold">{cs.done} — deal resolved</p>
                            ) : (
                              <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.20)" }}>
                                <p className="text-white/90 text-xs font-semibold">Resolve Dispute</p>
                                {cs?.error && <p className="text-red-400 text-xs">{cs.error}</p>}
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <button
                                    disabled={cs?.loading}
                                    onClick={() => doCardAction(resolveKey, `${BASE_URL}/api/admin/deals/${d.id}/dispute/resolve`, { outcome: "VALID", notes: "Admin: dispute valid — 50% refund to brand." })}
                                    className="flex-1 py-2.5 rounded-full text-white text-xs font-semibold disabled:opacity-40 text-center"
                                    style={{ background: "rgba(239,68,68,0.80)" }}>
                                    {cs?.loading ? "Saving…" : "⚠️ Dispute valid — refund brand 50%"}
                                  </button>
                                  <button
                                    disabled={cs?.loading}
                                    onClick={() => doCardAction(resolveKey, `${BASE_URL}/api/admin/deals/${d.id}/dispute/resolve`, { outcome: "INVALID", notes: "Admin: dispute invalid — full payout to creator." })}
                                    className="flex-1 py-2.5 rounded-full text-white text-xs font-semibold disabled:opacity-40 text-center"
                                    style={{ background: "rgba(34,197,94,0.70)" }}>
                                    {cs?.loading ? "Saving…" : "✅ Dispute invalid — pay creator in full"}
                                  </button>
                                  <button
                                    disabled={cs?.loading}
                                    onClick={() => doCardAction(resolveKey, `${BASE_URL}/api/admin/deals/${d.id}/dispute/cancel`, {})}
                                    className="flex-1 py-2.5 rounded-full text-white text-xs font-semibold disabled:opacity-40 text-center"
                                    style={{ background: "rgba(99,102,241,0.75)" }}>
                                    {cs?.loading ? "Saving…" : "🔄 Cancel Dispute"}
                                  </button>
                                </div>
                                <p className="text-white/70 text-[10px]">Valid = brand gets 50% refund, creator gets nothing. Invalid = full payout to creator. Cancel = content verified live, deal returns to dispute window.</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Section B — URL Flagged */}
            {(() => {
              const urlFlagged = (deals ?? []).filter((d: any) => d.status === "URL_FLAGGED");
              return (
                <div>
                  <h2 className="text-white font-bold text-base mb-1 flex items-center gap-2">
                    🚩 URL Flagged Deals
                    {urlFlagged.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style={{ background: "#f59e0b" }}>{urlFlagged.length}</span>
                    )}
                  </h2>
                  <p className="text-white/70 text-xs mb-4">Brand flagged a live post URL — admin must decide per deliverable.</p>
                  {urlFlagged.length === 0 ? (
                    <div className="rounded-2xl py-10 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-white/70 text-sm">No flagged URL deals</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {urlFlagged.map((d: any) => {
                        const deliverables: any[] = d.flaggedDeliverables ?? [];
                        return (
                          <div key={d.id} className="rounded-2xl p-5 space-y-4" style={{ background: CARD, border: "1px solid rgba(245,158,11,0.25)" }}>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-white font-semibold text-sm">{d.brandName}</span>
                                  <ChevronRight className="w-3 h-3 text-white/70" />
                                  <span className="text-white font-semibold text-sm">{d.creatorName}</span>
                                  <span className="text-white/70 text-xs">@{d.instagramHandle}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <StatusBadge s={d.status} />
                                  <SourceBadge s={d.source ?? "SEARCH"} />
                                  <span className="text-white/70 text-[10px]">Flagged {fmtDate(d.createdAt)}</span>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-white font-bold text-sm">{fmtINR(d.totalAgreedValue)}</p>
                                <p className="text-white/70 text-[10px]">Escrow: {d.escrowStatus ?? "—"}</p>
                              </div>
                            </div>
                            {/* Flagged deliverables */}
                            {deliverables.length > 0 && (
                              <div className="space-y-3">
                                {deliverables.map((del: any) => {
                                  const delKey = `url-del-${del.id}`;
                                  const cs = cardActionState[delKey];
                                  return (
                                    <div key={del.id} className="rounded-xl p-3 space-y-2" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.20)" }}>
                                      <div className="flex items-center justify-between">
                                        <span className="text-amber-300 font-semibold text-xs">{del.slotLabel} ({del.type})</span>
                                        <span className="text-white/70 text-[10px]">Resubmissions: {del.livePostResubmissionCount}/1</span>
                                      </div>
                                      {del.livePostUrl && (
                                        <a href={/^https?:\/\//i.test(del.livePostUrl) ? del.livePostUrl : `https://${del.livePostUrl}`} target="_blank" rel="noopener noreferrer" className="text-pink-400 text-xs break-all block hover:underline">{del.livePostUrl}</a>
                                      )}
                                      {cs?.done ? (
                                        <p className="text-green-400 text-xs font-semibold">{cs.done}</p>
                                      ) : (
                                        <div className="space-y-2">
                                          {cs?.error && <p className="text-red-400 text-xs">{cs.error}</p>}
                                          <div className="flex gap-2 flex-wrap">
                                            <button
                                              disabled={cs?.loading}
                                              onClick={() => doCardAction(delKey, `${BASE_URL}/api/admin/deals/${d.id}/url-flag/review`, { deliverableId: del.id, action: "REQUEST_RESUBMIT", adminNote: "Admin: URL incorrect, please resubmit." })}
                                              className="flex-1 py-2 rounded-full text-white text-[11px] font-semibold disabled:opacity-40"
                                              style={{ background: "rgba(59,130,246,0.70)" }}>
                                              {cs?.loading ? "…" : "🔄 URL wrong — ask creator to resubmit"}
                                            </button>
                                            <button
                                              disabled={cs?.loading}
                                              onClick={() => doCardAction(delKey, `${BASE_URL}/api/admin/deals/${d.id}/url-flag/review`, { deliverableId: del.id, action: "OVERRIDE", adminNote: "Admin: URL correct — overriding brand flag." })}
                                              className="flex-1 py-2 rounded-full text-white text-[11px] font-semibold disabled:opacity-40"
                                              style={{ background: "rgba(34,197,94,0.70)" }}>
                                              {cs?.loading ? "…" : "✅ URL correct — override brand"}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {deliverables.length === 0 && (
                              <p className="text-white/70 text-xs">No flagged deliverables found — open deal detail to review.</p>
                            )}
                            {/* View chat button */}
                            <button onClick={() => setSelectedDealId(d.id)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white/80"
                              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                              💬 View Deal Chat
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : deals?.length === 0 ? (
          <p className="text-white/70 text-sm text-center py-16">No deals found</p>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {deals?.map((d, i) => {
              const parts: string[] = [];
              if (d.reelCount > 0) parts.push(`${d.reelCount}R`);
              if (d.storyCount > 0) parts.push(`${d.storyCount}S`);
              if (d.postCount > 0) parts.push(`${d.postCount}P`);
              return (
                <div key={d.id}
                  onClick={() => setSelectedDealId(d.id)}
                  className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  style={{ borderBottom: i < (deals?.length ?? 0) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white text-sm font-semibold truncate">{d.brandName}</span>
                      <ChevronRight className="w-3 h-3 text-white/70" />
                      <span className="text-white text-sm font-semibold truncate">{d.creatorName}</span>
                      <span className="text-white/70 text-xs">@{d.instagramHandle}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <StatusBadge s={d.status} />
                      <SourceBadge s={d.source} />
                      {parts.length > 0 && <span className="text-white/70 text-[10px]">{parts.join("+")}</span>}
                      <span className="text-white/70 text-[10px]">Created {fmtDate(d.createdAt)}</span>
                      {d.lastActivity && <span className="text-white/70 text-[10px]">Last activity {fmtDate(d.lastActivity)}</span>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right flex items-center gap-3">
                    <div className="space-y-0.5">
                      <p className="text-white font-bold text-sm">{fmtINR(d.totalAgreedValue)}</p>
                      {d.creatorPayout && Number(d.creatorPayout) > 0 && Number(d.creatorPayout) !== Number(d.totalAgreedValue) && (
                        <p className="text-[10px] font-semibold" style={{ color: "#4ade80" }}>
                          {fmtINR(d.creatorPayout)} to creator
                        </p>
                      )}
                      {d.payoutStatus === "RELEASED" && (
                        <p className="text-[10px] font-semibold" style={{ color: "#4ade80" }}>✓ Paid</p>
                      )}
                      {d.payoutStatus === "REFUNDED_TO_BRAND" && (
                        <p className="text-[10px] font-semibold" style={{ color: "#f87171" }}>↩ Refunded</p>
                      )}
                      {(d.status === "COMPLETED" || d.status === "CONTENT_APPROVED" || d.status === "DISPUTE_WINDOW_OPEN") && (!d.payoutStatus || d.payoutStatus === "PENDING") && (
                        <p className="text-[10px]" style={{ color: "#fbbf24" }}>Pay pending</p>
                      )}
                      <p className="text-white/70 text-[10px]">{d.timelineDays}d · {d.escrowStatus ?? "—"}</p>
                    </div>
                    <MoreHorizontal className="w-4 h-4 text-white/70" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.07)" }}>← Prev</button>
            <span className="text-white/70 text-sm">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.07)" }}>Next →</button>
          </div>
        )}
      </main>

      {/* Deal detail drawer */}
      {selectedDealId && (
        <AdminDealDetail
          dealId={selectedDealId}
          adminFetch={adminFetch}
          onClose={() => setSelectedDealId(null)}
        />
      )}
    </div>
  );
}
