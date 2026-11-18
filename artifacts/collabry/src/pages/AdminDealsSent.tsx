import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Trash2, Bell, X, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

function returnToHere(): string {
  try { return window.location.pathname + window.location.search; } catch { return "/admin-collabryangad/deals-sent"; }
}
const creatorAdminUrl = (id: string) =>
  `${BASE_URL}/admin-collabryangad/creator-onboarding?creatorId=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(returnToHere())}`;
const brandAdminUrl = (id: string) =>
  `${BASE_URL}/admin-collabryangad/brand-onboarding?brandId=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(returnToHere())}`;

type DealStatus = "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

interface Row {
  rootId: string;
  brandId: string | null; brandName: string | null;
  creatorId: string | null; creatorHandle: string | null; creatorName: string | null;
  status: DealStatus;
  amount: number | null;
  sentAt: string;
  acceptedAt: string | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
  isUnseen: boolean;
}
interface Notif { rootId: string; brandName: string | null; creatorHandle: string | null; acceptedAt: string; }

const STATUS_META: Record<DealStatus, { label: string; color: string; bg: string; border: string }> = {
  SENT:     { label: "Deal Sent",     color: "#F59E0B", bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.35)" },
  ACCEPTED: { label: "Deal Accepted", color: "#10B981", bg: "rgba(16,185,129,0.14)", border: "rgba(16,185,129,0.35)" },
  REJECTED: { label: "Rejected",      color: "#EF4444", bg: "rgba(239,68,68,0.14)",  border: "rgba(239,68,68,0.35)" },
  EXPIRED:  { label: "Expired",       color: "#9CA3AF", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.30)" },
};

const fmtDate = (d: string | null) => d
  ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "—";
const fmtINR = (n: number | null) => n == null ? "—" : `₹${n.toLocaleString("en-IN")}`;

export default function AdminDealsSent() {
  const { adminFetch, adminId } = useAdminAuth();
  const [, navigate] = useLocation();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId]);

  const load = useCallback(async (toPage: number, searchTerm: string, silent = false) => {
    if (!silent) setRows(null);
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ page: String(toPage), search: searchTerm });
      const r = await adminFetch(`${BASE_URL}/api/admin/deals-sent?${params.toString()}`);
      if (!r.ok) { if (!silent) setRows([]); return; }
      const d = await r.json();
      setRows(d.deals ?? []);
      setNotifications(d.notifications ?? []);
      setPage(d.page ?? toPage);
      setTotalPages(d.totalPages ?? 1);
      setTotal(d.total ?? 0);
    } catch { if (!silent) setRows([]); }
    finally { setRefreshing(false); }
  }, [adminFetch]);

  useEffect(() => { if (adminId) load(1, ""); }, [adminId, load]);

  // Light poll so a row that flips Sent→Accepted mid-session updates (status is
  // always recomputed server-side) and the notification bar reflects it.
  useEffect(() => {
    if (!adminId) return;
    const t = setInterval(() => load(page, appliedSearch, true), 30_000);
    return () => clearInterval(t);
  }, [adminId, page, appliedSearch, load]);

  const runSearch = () => { setAppliedSearch(searchInput.trim()); load(1, searchInput.trim()); };

  const markSeen = async (rootId: string) => {
    setRows(rs => rs ? rs.map(x => x.rootId === rootId ? { ...x, isUnseen: false } : x) : rs);
    try { await adminFetch(`${BASE_URL}/api/admin/deals-sent/${rootId}/seen`, { method: "POST" }); } catch { /* ignore */ }
  };

  const hideRow = async (rootId: string) => {
    try { await adminFetch(`${BASE_URL}/api/admin/deals-sent/${rootId}/hide`, { method: "POST" }); } catch { /* ignore */ }
    load(page, appliedSearch, true);
  };

  const dismissNotifications = async () => {
    setNotifications([]);
    try { await adminFetch(`${BASE_URL}/api/admin/deals-sent/mark-viewed`, { method: "POST" }); } catch { /* ignore */ }
  };

  const jumpToDeal = async (rootId: string) => {
    // Jump works against the unfiltered list — clear any active search first.
    setSearchInput(""); setAppliedSearch("");
    let targetPage = 1;
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deals-sent/${rootId}/locate`);
      if (r.ok) targetPage = (await r.json()).page ?? 1;
    } catch { /* ignore */ }
    await load(targetPage, "");
    setHighlightId(rootId);
    setTimeout(() => {
      document.getElementById(`dsrow-${rootId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    setTimeout(() => setHighlightId(null), 4000);
  };

  if (!adminId) return null;

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-16">
        <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 text-xs mb-1 hover:text-white/90">← Dashboard</button>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h1 className="text-white font-bold text-2xl">Deals Sent</h1>
          <button onClick={() => load(page, appliedSearch)} title="Refresh"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/80"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <p className="text-white/60 text-sm mb-5">Direct deals from the moment a brand sends one. {total} total.</p>

        {/* Notification bar — newly accepted since you last viewed */}
        {notifications.length > 0 && (
          <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)" }}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" style={{ color: "#10B981" }} />
                <span className="text-sm font-semibold" style={{ color: "#10B981" }}>
                  {notifications.length} deal{notifications.length > 1 ? "s" : ""} newly accepted
                </span>
              </div>
              <button onClick={dismissNotifications} className="text-white/50 hover:text-white/80" title="Mark viewed">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {notifications.map(n => (
                <button key={n.rootId} onClick={() => jumpToDeal(n.rootId)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium hover:opacity-80"
                  style={{ background: "rgba(16,185,129,0.14)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.30)" }}>
                  {n.brandName ?? "Brand"} → @{n.creatorHandle ?? "creator"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") runSearch(); }}
              placeholder="Search by brand name or creator @username…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }} />
          </div>
          <button onClick={runSearch} className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: PINK }}>Search</button>
          {appliedSearch && (
            <button onClick={() => { setSearchInput(""); setAppliedSearch(""); load(1, ""); }}
              className="px-3 py-2.5 rounded-xl text-white/70 text-sm" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>Clear</button>
          )}
        </div>

        {/* List */}
        {rows === null ? (
          <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="rounded-xl animate-pulse" style={{ height: 72, background: "rgba(255,255,255,0.04)" }} />)}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl p-8 text-center text-white/50 text-sm" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {appliedSearch ? "No direct deals match your search." : "No direct deals sent yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(d => {
              const meta = STATUS_META[d.status];
              const flash = highlightId === d.rootId;
              return (
                <div key={d.rootId} id={`dsrow-${d.rootId}`}
                  onClick={() => d.isUnseen && markSeen(d.rootId)}
                  className="rounded-xl p-3.5 transition-all"
                  style={{
                    background: d.isUnseen ? "rgba(225,79,105,0.06)" : "#13151D",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderLeft: d.isUnseen ? `4px solid ${PINK}` : "4px solid transparent",
                    boxShadow: flash ? "0 0 0 3px rgba(225,79,105,0.35)" : undefined,
                    cursor: d.isUnseen ? "pointer" : "default",
                  }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    {/* Brand → Creator */}
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {d.brandId && d.brandName
                        ? <a href={brandAdminUrl(d.brandId)} onClick={e => e.stopPropagation()}
                            className="text-white font-semibold text-sm hover:underline">{d.brandName}</a>
                        : <span className="text-white/50 font-semibold text-sm">{d.brandName ?? "—"}</span>}
                      <span className="text-white/35 text-sm">→</span>
                      {d.creatorId && d.creatorHandle
                        ? <a href={creatorAdminUrl(d.creatorId)} onClick={e => e.stopPropagation()}
                            className="text-white font-semibold text-sm hover:underline">@{d.creatorHandle}</a>
                        : <span className="text-white/50 font-semibold text-sm">{d.creatorHandle ? `@${d.creatorHandle}` : "—"}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>{meta.label}</span>
                      <button onClick={e => { e.stopPropagation(); hideRow(d.rootId); }} title="Remove from this list (deal stays in All Deals)"
                        className="p-1.5 rounded-lg text-white/40 hover:text-red-400 transition-colors"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-[11px] text-white/70 tabular-nums">
                    <span><span className="text-white/40">Amount</span> {fmtINR(d.amount)}</span>
                    <span><span className="text-white/40">Sent</span> {fmtDate(d.sentAt)}</span>
                    {d.status === "ACCEPTED" && <span><span className="text-white/40">Accepted</span> {fmtDate(d.acceptedAt)}</span>}
                    {d.status === "REJECTED" && <span style={{ color: "#f87171" }}>Rejected {fmtDate(d.resolvedAt)}{d.rejectionReason ? ` · ${d.rejectionReason}` : ""}</span>}
                    {d.status === "EXPIRED" && <span style={{ color: "#9CA3AF" }}>Expired {fmtDate(d.resolvedAt)}</span>}
                    {d.status === "SENT" && <span><span className="text-white/40">Accepted</span> —</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {rows && rows.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-5">
            <button disabled={page <= 1} onClick={() => load(page - 1, appliedSearch)}
              className="p-2 rounded-lg disabled:opacity-30" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <ChevronLeft className="w-4 h-4 text-white/80" />
            </button>
            <span className="text-white/70 text-sm">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => load(page + 1, appliedSearch)}
              className="p-2 rounded-lg disabled:opacity-30" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <ChevronRight className="w-4 h-4 text-white/80" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
