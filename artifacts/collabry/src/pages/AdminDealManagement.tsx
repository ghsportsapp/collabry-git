import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Sliders, ListChecks, RefreshCw, Search, X, MessageSquare, Upload, ExternalLink, Flag, Bell } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import AdminDealSettings from "./AdminDealSettings";
import DealChat from "@/components/DealChat";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

type Tab = "settings" | "all" | "creator-reports" | "brand-reports";

const TABS: { key: Tab; label: string; icon: typeof Sliders }[] = [
  { key: "settings", label: "Deal Settings", icon: Sliders },
  { key: "all", label: "All Deals", icon: ListChecks },
  { key: "creator-reports", label: "Creator Reports", icon: Flag },
  { key: "brand-reports", label: "Brand Reports", icon: Flag },
];

/* Every value below is a status this codebase actually writes to Deal.status,
 * in flow order, plus REFUNDED — a pseudo-status the API resolves from
 * payoutStatus/escrowStatus so admin can tell a refund from a cancellation.
 * (The old list offered ACCEPTED / DELIVERED / REJECTED, which are never
 * written to a deal, so those filters could only ever return nothing.) */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "All Statuses" },
  { value: "PENDING_PAYMENT", label: "Pending Payment" },
  { value: "IN_ESCROW", label: "In Escrow / Live" },
  { value: "CONCEPT_SUBMITTED", label: "Concept Submitted" },
  { value: "REVISION_REQUESTED", label: "Revision Requested" },
  { value: "CONCEPT_APPROVED", label: "Concept Approved" },
  { value: "IN_PROGRESS", label: "Awaiting Final Video" },
  { value: "PRODUCT_SHIPPED", label: "Product Shipped" },
  { value: "PRODUCT_RECEIVED", label: "Product Received" },
  { value: "PRODUCT_ISSUE_RAISED", label: "Product Issue Raised" },
  { value: "AWAITING_CREATOR_ISSUE_DECISION", label: "Awaiting Creator Decision" },
  { value: "NON_DELIVERY_REPORTED", label: "Non-Delivery Reported" },
  { value: "CONTENT_UPLOADED", label: "Final Video Submitted" },
  { value: "CONTENT_APPROVED", label: "Final Video Approved" },
  { value: "POST_LIVE_PENDING", label: "Post Live Pending" },
  { value: "URL_FLAGGED", label: "URL Flagged" },
  { value: "DISPUTE_WINDOW_OPEN", label: "Dispute Window Open" },
  { value: "DISPUTED", label: "Disputed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
];

/* Deal.source only ever holds these three. MATCHMAKING was in the old list
 * but is never written to a deal, so that option matched nothing. */
const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "All Sources" },
  { value: "CAMPAIGN", label: "Paid Campaign Deals" },
  { value: "BARTER", label: "Barter Deals" },
  { value: "SEARCH", label: "Search/Direct Deals" },
];

const DEALS_PER_PAGE = 25;

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const fmtINR = (n: any) => `₹${parseFloat(n ?? 0).toLocaleString("en-IN")}`;

/* ── Stage badge ──────────────────────────────────────────────────────────────
 * One DB status → exactly one label and one tone. Readable on #0A0A0F.
 * Grouped the way the deal flow reads: concept = indigo, product = purple,
 * final video = teal, anything needing admin attention = orange, terminal
 * failure = red. */
type Tone = "grey" | "amber" | "blue" | "indigo" | "purple" | "teal" | "green" | "orange" | "red";

const TONES: Record<Tone, { bg: string; color: string; border: string }> = {
  grey:   { bg: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.78)", border: "rgba(255,255,255,0.14)" },
  amber:  { bg: "rgba(251,191,36,0.14)",  color: "#fbbf24", border: "rgba(251,191,36,0.30)" },
  blue:   { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa", border: "rgba(59,130,246,0.32)" },
  indigo: { bg: "rgba(99,102,241,0.16)",  color: "#a5b4fc", border: "rgba(99,102,241,0.34)" },
  purple: { bg: "rgba(168,85,247,0.15)",  color: "#c084fc", border: "rgba(168,85,247,0.32)" },
  teal:   { bg: "rgba(20,184,166,0.16)",  color: "#5eead4", border: "rgba(20,184,166,0.32)" },
  green:  { bg: "rgba(16,185,129,0.15)",  color: "#4ade80", border: "rgba(16,185,129,0.32)" },
  orange: { bg: "rgba(249,115,22,0.15)",  color: "#fb923c", border: "rgba(249,115,22,0.32)" },
  red:    { bg: "rgba(239,68,68,0.13)",   color: "#f87171", border: "rgba(239,68,68,0.30)" },
};

/** Every status this codebase writes to Deal.status. Labels match the deal
 *  flow, so one card = one unambiguous stage. */
const STAGE_MAP: Record<string, { label: string; tone: Tone }> = {
  PENDING_PAYMENT:                 { label: "Pending Payment", tone: "amber" },
  IN_ESCROW:                       { label: "In Escrow (Live)", tone: "blue" },
  CONCEPT_SUBMITTED:               { label: "Concept Submitted", tone: "indigo" },
  REVISION_REQUESTED:              { label: "Revision Requested", tone: "amber" },
  CONCEPT_APPROVED:                { label: "Concept Approved", tone: "indigo" },
  // Concepts are approved and no product ships, so the creator is now working
  // on the final video. Kept free of "·" — that separator means duration.
  IN_PROGRESS:                     { label: "Awaiting Final Video", tone: "indigo" },
  PRODUCT_SHIPPED:                 { label: "Product Shipped", tone: "purple" },
  PRODUCT_RECEIVED:                { label: "Product Received", tone: "purple" },
  PRODUCT_ISSUE_RAISED:            { label: "Product Issue Raised", tone: "orange" },
  AWAITING_CREATOR_ISSUE_DECISION: { label: "Awaiting Creator Decision", tone: "orange" },
  NON_DELIVERY_REPORTED:           { label: "Non-Delivery Reported", tone: "orange" },
  CONTENT_UPLOADED:                { label: "Final Video Submitted", tone: "teal" },
  CONTENT_APPROVED:                { label: "Final Video Approved", tone: "teal" },
  POST_LIVE_PENDING:               { label: "Post Live Pending", tone: "teal" },
  URL_FLAGGED:                     { label: "URL Flagged", tone: "red" },
  DISPUTE_WINDOW_OPEN:             { label: "Dispute Window Open", tone: "red" },
  DISPUTED:                        { label: "Disputed", tone: "red" },
  COMPLETED:                       { label: "Completed", tone: "green" },
  CANCELLED:                       { label: "Cancelled", tone: "red" },
  EXPIRED:                         { label: "Expired", tone: "red" },
};

const isRefunded = (d: any) =>
  d.payoutStatus === "REFUNDED_TO_BRAND" || d.escrowStatus === "REFUNDED";

/** Label for a bare status + source pair, with no deal row to inspect — used
 *  by the stage-change feed, which only records from/to status strings. Keeps
 *  the feed's wording identical to the cards', barter rule included. */
export function stageLabelOnly(status: string | null | undefined, source?: string | null): string {
  if (!status) return "—";
  if (source === "BARTER" && (status === "IN_ESCROW" || status === "PENDING_PAYMENT")) return "Live";
  return STAGE_MAP[status]?.label ?? String(status).replace(/_/g, " ");
}

/** The single source of truth for what stage a deal is in. */
export function resolveStage(d: any): { label: string; tone: Tone } {
  // A refund leaves status='CANCELLED', so admin could not otherwise tell a
  // refunded deal from a plain cancellation. Refund wins.
  if (isRefunded(d)) return { label: "Refunded", tone: "red" };

  // Barter involves no money at all: it goes live the moment the creator
  // accepts, and reuses IN_ESCROW as that live state. Neither payment stage
  // may ever surface on a barter card — including PENDING_PAYMENT, which is
  // unreachable for barter today but must not read as "awaiting payment" if
  // data ever drifts there.
  if (d.source === "BARTER" && (d.status === "IN_ESCROW" || d.status === "PENDING_PAYMENT")) {
    return { label: "Live", tone: "blue" };
  }

  if (d.status === "PENDING_PAYMENT") {
    return { label: "Pending Payment", tone: "amber" };
  }

  return STAGE_MAP[d.status] ?? { label: String(d.status ?? "—").replace(/_/g, " "), tone: "grey" };
}

/** How long the deal has been in its current stage, in one compact unit.
 *  Under an hour reads "<1h"; under two days stays in hours so "24h" is not
 *  rounded away to "1d"; beyond that, days. */
export function timeInStage(stageUpdatedAt: string | null | undefined, now: number = Date.now()): string | null {
  if (!stageUpdatedAt) return null;
  const then = new Date(stageUpdatedAt).getTime();
  if (!Number.isFinite(then)) return null;
  const mins = Math.floor((now - then) / 60000);
  if (mins < 0) return null;            // clock skew — say nothing rather than "-3h"
  if (mins < 60) return "<1h";
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** A real anchor, so ctrl/middle-click opens the review panel in a new tab,
 *  while a plain click stays inside the SPA. Falls back to plain text when the
 *  join gave us no id to link to. */
function AdminProfileLink(
  { href, navigate, title, children }:
  { href: string | null; navigate: (to: string) => void; title?: string; children: React.ReactNode }
) {
  if (!href) return <span className="text-white text-sm font-semibold">{children}</span>;
  return (
    <a href={href} title={title}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
      className="text-white text-sm font-semibold hover:underline underline-offset-2 transition-colors"
      style={{ textDecorationColor: PINK }}
      onMouseEnter={e => (e.currentTarget.style.color = PINK)}
      onMouseLeave={e => (e.currentTarget.style.color = "")}>
      {children}
    </a>
  );
}

function stageBadge(d: any) {
  const { label, tone } = resolveStage(d);
  const t = TONES[tone];
  // Absent until 001_deal_stage_tracking.sql has run; the badge just omits it.
  const age = timeInStage(d.stageUpdatedAt);
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
      {label}
      {age && <span style={{ opacity: 0.72 }}> · {age}</span>}
    </span>
  );
}

const SOURCE_LABEL: Record<string, { label: string; bg: string; color: string; border: string }> = {
  CAMPAIGN: { label: "Paid Campaign", bg: "rgba(225,79,105,0.15)", color: PINK,      border: "rgba(225,79,105,0.34)" },
  BARTER:   { label: "Barter",        bg: "rgba(168,85,247,0.15)", color: "#c084fc", border: "rgba(168,85,247,0.34)" },
  SEARCH:   { label: "Direct",        bg: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "rgba(59,130,246,0.34)" },
};

function sourceBadge(source: string) {
  const s = SOURCE_LABEL[source]
    ?? { label: source ?? "—", bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.14)" };
  return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
    style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{s.label}</span>;
}

function payoutStatusBadge(status?: string | null) {
  if (!status || status === "PENDING") return <span className="text-[10px] text-white/70">Pending</span>;
  if (status === "RELEASED") return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>Paid to Creator</span>;
  if (status === "REFUNDED_TO_BRAND") return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>Refunded to Brand</span>;
  if (status === "PENDING_KYC") return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>Pending KYC</span>;
  return <span className="text-[10px] text-white/70">{status.replace(/_/g, " ")}</span>;
}

/* Deep links into the admin review views. These are the panels admin already
 * uses to vet people — not the brand-facing unlocked profile. Neither page has
 * a per-record route, so each takes an id as a query param and opens its own
 * existing panel; no new routes invented. */
/** Where the review panel should send admin back to: wherever they are now,
 *  pinned to the All Deals tab. Read from the live location rather than
 *  written as a literal, so this keeps working if the route ever moves. */
function returnToHere(): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "all");
  return url.pathname + url.search;
}

const creatorAdminUrl = (id: string) =>
  `${BASE_URL}/admin-collabryangad/creator-onboarding?creatorId=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(returnToHere())}`;
const brandAdminUrl = (id: string) =>
  `${BASE_URL}/admin-collabryangad/brand-onboarding?brandId=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(returnToHere())}`;

/* ── Stage-change feed ────────────────────────────────────────────────────
 * The whole "notify admin" mechanism: the DealStageEvent log, newest first,
 * with an unread count. Opening the panel marks everything up to the newest
 * row shown as seen; anything that lands afterwards stays unread. */
function StageChangeBell(
  { events, unseen, onJumpToDeal, onMarkAll, onRefresh }:
  {
    events: any[] | null;
    unseen: number;
    onJumpToDeal: (e: any) => void;
    onMarkAll: () => void;
    onRefresh: () => void;
  }
) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on an outside click, like the other admin popovers.
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /* Opening deliberately does NOT mark everything read: a deal stays flagged —
     in this list and as a highlighted card — until admin actually opens that
     deal. "Mark all read" is there for when they want to clear the board. */
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onRefresh();
  }

  return (
    <div ref={boxRef} className="relative">
      <button onClick={toggle} aria-label="Recent stage changes"
        className="relative p-2.5 text-white/70 hover:text-white transition-colors rounded-xl"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <Bell className="w-4 h-4" />
        {unseen > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: PINK, color: "white" }}>
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-40 rounded-2xl overflow-hidden"
          style={{
            width: "min(22rem, calc(100vw - 2rem))",
            background: "#13151D",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
          }}>
          <div className="px-4 py-3 flex items-center justify-between gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="text-white text-xs font-bold">
              Recent stage changes
              {unseen > 0 && <span className="text-white/45 font-medium"> · {unseen} new</span>}
            </span>
            <div className="flex items-center gap-2">
              {unseen > 0 && (
                <button onClick={onMarkAll} className="text-[10px] font-semibold hover:underline" style={{ color: PINK }}>
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {events === null ? (
              <p className="text-white/50 text-xs text-center py-8">Loading…</p>
            ) : events.length === 0 ? (
              <p className="text-white/50 text-xs text-center py-8 px-4">
                No stage changes recorded yet.
              </p>
            ) : (
              events.map(e => {
                const ago = timeInStage(e.changedAt);
                const from = stageLabelOnly(e.fromStage, e.source);
                const to = stageLabelOnly(e.toStage, e.source);
                const isNew = !!e.hasUnseen;
                return (
                  <button key={e.id}
                    onClick={() => { setOpen(false); onJumpToDeal(e); }}
                    className="w-full text-left pr-4 py-2.5 transition-colors hover:bg-white/5"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      // Unread: pink left accent + tint. Read: flat and dimmed.
                      borderLeft: isNew ? `3px solid ${PINK}` : "3px solid transparent",
                      paddingLeft: "0.8125rem",
                      background: isNew ? "rgba(225,79,105,0.09)" : "transparent",
                      opacity: isNew ? 1 : 0.62,
                    }}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-white text-xs ${isNew ? "font-bold" : "font-medium"}`}>{e.brandName ?? "—"}</span>
                      <span className="text-white/50 text-[11px]">→</span>
                      <span className={`text-white text-xs ${isNew ? "font-bold" : "font-medium"}`}>@{e.creatorHandle ?? "—"}</span>
                      {isNew && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: PINK, color: "white" }}>NEW</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[11px]">
                      {/* Two different DB statuses can share one label (barter
                          collapses both payment stages to "Live"). Showing
                          "Live → Live" would read as a no-op, so collapse it. */}
                      {from !== to && (
                        <>
                          <span className="text-white/55">{from}</span>
                          <span className="text-white/35">→</span>
                        </>
                      )}
                      <span style={{ color: isNew ? PINK : "rgba(255,255,255,0.75)" }} className="font-semibold">{to}</span>
                      {ago && <span className="text-white/40 ml-auto">{ago} ago</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AllDealsList() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();
  const [deals, setDeals] = useState<any[] | null>(null);
  const [status, setStatus] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  /* One fetch of the stage-change log serves both the bell and the card
     highlights — `unseenDeals` is derived from these same rows, never a
     second request. */
  const [stageEvents, setStageEvents] = useState<any[] | null>(null);
  const [unseenDeals, setUnseenDeals] = useState<Set<string>>(new Set());
  const searchRef = useRef("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  // Chat drawer
  const [chatDealId, setChatDealId] = useState<string | null>(null);
  const [chatDealLabel, setChatDealLabel] = useState("");

  // Pay Creator modal
  const [payDeal, setPayDeal] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payReason, setPayReason] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [payMsg, setPayMsg] = useState("");

  // Refund Brand modal
  const [refundDeal, setRefundDeal] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState("");

  // Invoice upload modal
  const [invoiceDeal, setInvoiceDeal] = useState<any | null>(null);
  const [invoiceRecipient, setInvoiceRecipient] = useState<"BRAND" | "CREATOR">("BRAND");
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const invoiceFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (toPage = 1) => {
    setDeals(null);
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (source !== "ALL") params.set("source", source);
    const q = searchRef.current.trim();
    if (q) params.set("search", q);
    // `page` is what opts the API into the paged response shape.
    params.set("page", String(toPage));
    params.set("limit", String(DEALS_PER_PAGE));
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deals?${params}`);
      if (!r.ok) { setDeals([]); setTotal(0); setTotalPages(1); return; }
      const d = await r.json();
      // Tolerate the legacy bare-array shape, in case the deployed API
      // predates paging.
      if (Array.isArray(d)) {
        setDeals(d); setTotal(d.length); setTotalPages(1); setPage(1);
      } else {
        setDeals(d.deals ?? []);
        setTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? 1);
        setPage(d.page ?? toPage);
      }
    } catch { setDeals([]); setTotal(0); setTotalPages(1); }
  }, [status, source, adminFetch]);

  // Any filter change restarts at page 1 — staying on page 6 of a narrower
  // result set would look like an empty tab.
  useEffect(() => { load(1); }, [status, source]);

  /* ── Stage-change log (shared by the bell and the card highlights) ── */
  const loadEvents = useCallback(async () => {
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deal-stage-events?limit=30`);
      if (!r.ok) { setStageEvents([]); setUnseenDeals(new Set()); return; }
      const d = await r.json();
      const evs: any[] = d.events ?? [];
      setStageEvents(evs);
      setUnseenDeals(new Set(evs.filter(e => e.hasUnseen).map(e => e.dealId)));
    } catch { setStageEvents([]); setUnseenDeals(new Set()); }
  }, [adminFetch]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  /** Acknowledge one deal: clears its card highlight and its bell row. */
  const markDealSeen = useCallback(async (dealId: string) => {
    if (!dealId || !unseenDeals.has(dealId)) return;
    // Optimistic — the highlight should vanish on click, not after a round trip.
    setUnseenDeals(prev => { const next = new Set(prev); next.delete(dealId); return next; });
    setStageEvents(prev => prev?.map(e => e.dealId === dealId ? { ...e, hasUnseen: false } : e) ?? prev);
    try {
      await adminFetch(`${BASE_URL}/api/admin/deal-stage-events/seen`, {
        method: "POST", body: JSON.stringify({ dealId }),
      });
    } catch { loadEvents(); }   // put it back the way the server sees it
  }, [adminFetch, unseenDeals, loadEvents]);

  const markAllSeen = useCallback(async () => {
    setUnseenDeals(new Set());
    setStageEvents(prev => prev?.map(e => ({ ...e, hasUnseen: false })) ?? prev);
    try {
      await adminFetch(`${BASE_URL}/api/admin/deal-stage-events/seen`, {
        method: "POST", body: JSON.stringify({ before: new Date().toISOString() }),
      });
    } catch { loadEvents(); }
  }, [adminFetch, loadEvents]);

  function handleSearch(v: string) {
    setSearch(v);
    searchRef.current = v;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => load(1), 500);
  }

  /* Jump from a stage-change event to the deal card itself.
   * Deliberately does NOT touch the search box — stuffing a deal id in there
   * was the old behaviour and it matched nothing. If the card is already
   * rendered we just scroll to it; otherwise we clear the filters and ask the
   * API which page holds it, then load that page. Either way the card gets
   * highlighted and the deal is marked seen. */
  const jumpToDeal = useCallback(async (e: any) => {
    const dealId = e.dealId;
    if (!dealId) return;

    const onThisPage = (deals ?? []).some(d => d.id === dealId);
    if (!onThisPage) {
      // Filters could be hiding it, so drop them before locating the row.
      const hadFilters = status !== "ALL" || source !== "ALL" || searchRef.current.trim() !== "";
      if (hadFilters) {
        setStatus("ALL"); setSource("ALL");
        setSearch(""); searchRef.current = "";
      }
      let target = 1;
      try {
        const r = await adminFetch(`${BASE_URL}/api/admin/deals/${dealId}/page?limit=${DEALS_PER_PAGE}`);
        if (r.ok) target = (await r.json()).page ?? 1;
      } catch { /* fall back to page 1 */ }
      await load(target);
    }

    setHighlightId(dealId);
    markDealSeen(dealId);
  }, [deals, status, source, adminFetch, load, markDealSeen]);

  // Scroll to and flash the jumped-to card once it has rendered.
  useEffect(() => {
    if (!highlightId || deals === null) return;
    const el = document.querySelector(`[data-deal-id="${highlightId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightId(null), 2200);
    return () => clearTimeout(t);
  }, [highlightId, deals]);

  function goToPage(p: number) {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next === page) return;
    load(next);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openChat(deal: any) {
    setChatDealId(deal.id);
    setChatDealLabel(`${deal.brandName ?? "Brand"} → @${deal.creatorHandle ?? "creator"}`);
  }

  function openPayModal(deal: any) {
    const orig = Number(deal.creatorPayout ?? deal.totalAgreedValue ?? 0);
    setPayDeal(deal);
    setPayAmount(orig > 0 ? String(orig) : "");
    setPayReason("");
    setPayRef("");
    setPayMsg("");
  }

  function openRefundModal(deal: any) {
    const orig = Number(deal.totalPayable ?? deal.totalAgreedValue ?? 0);
    setRefundDeal(deal);
    setRefundAmount(orig > 0 ? String(orig) : "");
    setRefundReason("");
    setRefundMsg("");
  }

  async function confirmPay() {
    if (!payDeal) return;
    const origAmt = Number(payDeal.creatorPayout ?? payDeal.totalAgreedValue ?? 0);
    const newAmt = Number(payAmount);
    if (Math.abs(newAmt - origAmt) > 0.005 && !payReason.trim()) {
      setPayMsg("Reason is required when adjusting the amount."); return;
    }
    setPayLoading(true); setPayMsg("");
    try {
      const body: Record<string, unknown> = { amount: newAmt };
      if (payReason.trim()) body["adjustmentReason"] = payReason.trim();
      if (payRef.trim()) body["payoutReferenceId"] = payRef.trim();
      const r = await adminFetch(`${BASE_URL}/api/admin/deals/${payDeal.id}/simulate-payout`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setPayMsg(d.error ?? "Payment failed"); return; }
      setPayMsg("✅ Payment released successfully");
      setTimeout(() => { setPayDeal(null); load(); }, 1400);
    } catch { setPayMsg("Network error"); }
    finally { setPayLoading(false); }
  }

  async function confirmRefund() {
    if (!refundDeal) return;
    const amt = Number(refundAmount);
    if (isNaN(amt) || amt < 0) { setRefundMsg("Enter a valid amount"); return; }
    if (!refundReason.trim()) { setRefundMsg("Reason is required"); return; }
    setRefundLoading(true); setRefundMsg("");
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deals/${refundDeal.id}/refund-brand`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundAmount: amt, refundReason: refundReason.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setRefundMsg(d.error ?? "Refund failed"); return; }
      setRefundMsg("✅ Refund processed successfully");
      setTimeout(() => { setRefundDeal(null); load(); }, 1400);
    } catch { setRefundMsg("Network error"); }
    finally { setRefundLoading(false); }
  }

  const canPay = (d: any) =>
    d.payoutStatus !== "RELEASED" &&
    d.payoutStatus !== "REFUNDED_TO_BRAND" &&
    Number(d.creatorPayout ?? 0) > 0;

  const canRefund = (d: any) =>
    d.source !== "BARTER" &&              // no money ever changed hands
    d.payoutStatus !== "RELEASED" &&
    d.payoutStatus !== "REFUNDED_TO_BRAND";

  function openInvoiceModal(deal: any, recipient: "BRAND" | "CREATOR") {
    setInvoiceDeal(deal);
    setInvoiceRecipient(recipient);
    setInvoiceImage(null);
    setInvoiceMsg("");
    setTimeout(() => invoiceFileRef.current?.click(), 50);
  }

  function handleInvoiceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setInvoiceMsg("File too large (max 8MB)"); return; }
    const reader = new FileReader();
    reader.onload = ev => setInvoiceImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function confirmInvoiceUpload() {
    if (!invoiceDeal || !invoiceImage) return;
    setInvoiceLoading(true); setInvoiceMsg("");
    try {
      const type = invoiceRecipient === "BRAND" ? "DEAL_BRAND" : "DEAL_CREATOR";
      const recipientId = invoiceRecipient === "BRAND" ? invoiceDeal.brandId : invoiceDeal.creatorId;
      const r = await adminFetch(`${BASE_URL}/api/admin/invoices/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId: invoiceDeal.id, recipientType: invoiceRecipient, recipientId, image: invoiceImage, type }),
      });
      const d = await r.json();
      if (!r.ok) { setInvoiceMsg(d.error ?? "Upload failed"); return; }
      setInvoiceMsg("✅ Invoice uploaded successfully");
      setTimeout(() => { setInvoiceDeal(null); setInvoiceImage(null); load(); }, 1400);
    } catch { setInvoiceMsg("Network error"); }
    finally { setInvoiceLoading(false); }
  }

  return (
    <div>
      {/* ── Chat Drawer ── */}
      {chatDealId && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget) setChatDealId(null); }}>
          <div className="w-full max-w-xl h-full flex flex-col" style={{ background: "#0F0F18", borderLeft: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ background: "#0F0F18", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div>
                <h2 className="text-white font-bold text-sm">Deal Chat</h2>
                <p className="text-white/70 text-[11px] mt-0.5">{chatDealLabel}</p>
              </div>
              <button onClick={() => setChatDealId(null)}><X className="w-5 h-5 text-white/80" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden p-4">
              <DealChat
                dealId={chatDealId}
                currentUserType="BRAND"
                apiFetch={(_url, opts) => {
                  const isPost = opts?.method === "POST";
                  const endpoint = isPost
                    ? `${BASE_URL}/api/admin/deals/${chatDealId}/chat/send`
                    : `${BASE_URL}/api/admin/deals/${chatDealId}/chat`;
                  return adminFetch(endpoint, opts);
                }}
                dealStatus="COMPLETED"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Pay Creator Modal ── */}
      {payDeal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.82)" }}
          onClick={e => { if (e.target === e.currentTarget) setPayDeal(null); }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-5"
            style={{ background: "#0F0F18", border: "1px solid rgba(34,197,94,0.30)", boxShadow: "0 24px 80px rgba(0,0,0,0.85)", fontFamily: POPPINS }}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-white font-bold text-base">Pay Creator</h3>
                <p className="text-white/70 text-[11px] mt-0.5">{payDeal.brandName} → {payDeal.creatorName}</p>
              </div>
              <button onClick={() => setPayDeal(null)}><X className="w-5 h-5 text-white/70" /></button>
            </div>

            <div className="rounded-xl p-3.5 space-y-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-white/70 text-xs">@{payDeal.creatorHandle}</p>
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-xs">Deal Amount</span>
                <span className="text-white text-xs font-semibold">{fmtINR(payDeal.totalAgreedValue)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <span className="text-white/90 text-xs font-semibold">Agreed Creator Payout</span>
                <span className="font-bold text-sm" style={{ color: "#4ade80" }}>{fmtINR(payDeal.creatorPayout ?? payDeal.totalAgreedValue)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">Payment Amount (₹)</label>
              <input type="number" min={0} step={1} value={payAmount} onChange={e => setPayAmount(e.target.value)}
                placeholder="Enter amount…"
                className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} />
              {payAmount && Number(payAmount) !== Number(payDeal.creatorPayout ?? payDeal.totalAgreedValue) && (
                <p className="text-amber-400 text-[11px]">
                  Adjusted from {fmtINR(payDeal.creatorPayout ?? payDeal.totalAgreedValue)} → {fmtINR(payAmount)} — reason required below.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">
                Reason {Number(payAmount) !== Number(payDeal.creatorPayout ?? payDeal.totalAgreedValue)
                  ? <span className="text-red-400">(required)</span> : "(optional)"}
              </label>
              <textarea value={payReason} onChange={e => setPayReason(e.target.value)}
                placeholder="e.g. Partial payment due to late delivery…" rows={3}
                className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} />
            </div>

            <div className="space-y-1.5">
              <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">Reference ID (optional)</label>
              <input value={payRef} onChange={e => setPayRef(e.target.value)}
                placeholder="Bank/UPI reference…"
                className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} />
            </div>

            {payMsg && <p className={`text-sm text-center ${payMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{payMsg}</p>}

            <div className="flex gap-3">
              <button onClick={() => setPayDeal(null)}
                className="flex-1 py-2.5 rounded-full text-white/90 text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                Cancel
              </button>
              <button disabled={payLoading || !payAmount} onClick={confirmPay}
                className="flex-1 py-2.5 rounded-full text-white text-sm font-bold disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)" }}>
                {payLoading ? "Processing…" : "💸 Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Refund Brand Modal ── */}
      {refundDeal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.82)" }}
          onClick={e => { if (e.target === e.currentTarget) setRefundDeal(null); }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-5"
            style={{ background: "#0F0F18", border: "1px solid rgba(239,68,68,0.30)", boxShadow: "0 24px 80px rgba(0,0,0,0.85)", fontFamily: POPPINS }}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-white font-bold text-base">Refund Brand</h3>
                <p className="text-white/70 text-[11px] mt-0.5">{refundDeal.brandName} → {refundDeal.creatorName}</p>
              </div>
              <button onClick={() => setRefundDeal(null)}><X className="w-5 h-5 text-white/70" /></button>
            </div>

            <div className="rounded-xl p-3.5 space-y-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-white/70 text-xs">@{refundDeal.creatorHandle}</p>
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-xs">Deal Amount</span>
                <span className="text-white text-xs font-semibold">{fmtINR(refundDeal.totalAgreedValue)}</span>
              </div>
              {refundDeal.totalPayable && (
                <div className="flex items-center justify-between">
                  <span className="text-white/70 text-xs">Brand Paid (incl. GST)</span>
                  <span className="text-white/90 text-xs font-semibold">{fmtINR(refundDeal.totalPayable)}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">Refund Amount (₹)</label>
              <input type="number" min={0} step={1} value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                placeholder="Enter refund amount…"
                className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} />
            </div>

            <div className="space-y-1.5">
              <label className="text-white/80 text-xs font-semibold uppercase tracking-wider">
                Reason <span className="text-red-400">(required)</span>
              </label>
              <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)}
                placeholder="e.g. Deal cancelled — creator unresponsive…" rows={3}
                className="w-full px-3 py-2.5 rounded-lg text-white text-sm outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} />
            </div>

            {refundMsg && <p className={`text-sm text-center ${refundMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{refundMsg}</p>}

            <div className="flex gap-3">
              <button onClick={() => setRefundDeal(null)}
                className="flex-1 py-2.5 rounded-full text-white/90 text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                Cancel
              </button>
              <button disabled={refundLoading || !refundAmount || !refundReason.trim()} onClick={confirmRefund}
                className="flex-1 py-2.5 rounded-full text-white text-sm font-bold disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.85)" }}>
                {refundLoading ? "Processing…" : "↩ Confirm Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice Upload Modal ── */}
      <input ref={invoiceFileRef} type="file" accept="image/jpeg,image/png,image/jpg,application/pdf" className="hidden" onChange={handleInvoiceFile} />
      {invoiceDeal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={e => { if (e.target === e.currentTarget) setInvoiceDeal(null); }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: "#0F0F18", border: "1px solid rgba(255,255,255,0.12)", fontFamily: POPPINS }}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-white font-bold text-sm">Upload Invoice</h3>
                <p className="text-white/60 text-[11px] mt-0.5">
                  {invoiceDeal.orderId ?? invoiceDeal.id.slice(0, 8).toUpperCase()} · {invoiceRecipient === "BRAND" ? "Brand" : "Creator"} copy
                </p>
              </div>
              <button onClick={() => setInvoiceDeal(null)}><X className="w-5 h-5 text-white/70" /></button>
            </div>

            {invoiceImage ? (
              <div className="rounded-xl overflow-hidden border border-white/10 relative">
                <img src={invoiceImage} alt="Invoice preview" className="w-full max-h-40 object-contain bg-black/30" />
                <button onClick={() => setInvoiceImage(null)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(239,68,68,0.80)" }}>
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <button onClick={() => invoiceFileRef.current?.click()}
                className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors hover:border-white/30"
                style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                <Upload className="w-6 h-6 text-white/50" />
                <span className="text-white/60 text-xs">Click to select image or PDF</span>
              </button>
            )}

            {invoiceMsg && (
              <p className={`text-sm text-center ${invoiceMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{invoiceMsg}</p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setInvoiceDeal(null)}
                className="flex-1 py-2.5 rounded-full text-white/80 text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                Cancel
              </button>
              <button disabled={!invoiceImage || invoiceLoading} onClick={confirmInvoiceUpload}
                className="flex-1 py-2.5 rounded-full text-white text-sm font-bold disabled:opacity-40"
                style={{ background: PINK }}>
                {invoiceLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters (sticky while the list scrolls) ── */}
      <div ref={listTopRef} className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-3 mb-1"
        style={{ background: "#0A0A0F", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
            <input value={search} onChange={e => handleSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && load(1)}
              placeholder="Search by brand, creator, @handle, or order ID…"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />
            {search && (
              <button onClick={() => handleSearch("")} aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {/* An active filter is outlined in pink, so it is obvious at a glance
              why the list is short. */}
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-white text-sm outline-none max-w-[16rem] cursor-pointer"
            style={{
              background: status !== "ALL" ? "rgba(225,79,105,0.12)" : "rgba(255,255,255,0.07)",
              border: `1px solid ${status !== "ALL" ? PINK : "rgba(255,255,255,0.1)"}`,
              color: status !== "ALL" ? "#ffd7de" : "white",
            }}>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ background: "#1a1a2e", color: "white" }}>{s.label}</option>)}
          </select>
          <select value={source} onChange={e => setSource(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-white text-sm outline-none cursor-pointer"
            style={{
              background: source !== "ALL" ? "rgba(225,79,105,0.12)" : "rgba(255,255,255,0.07)",
              border: `1px solid ${source !== "ALL" ? PINK : "rgba(255,255,255,0.1)"}`,
              color: source !== "ALL" ? "#ffd7de" : "white",
            }}>
            {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ background: "#1a1a2e", color: "white" }}>{s.label}</option>)}
          </select>
          <div className="flex items-center gap-2 ml-auto sm:ml-0">
            <button onClick={() => { load(page); loadEvents(); }} title="Refresh deals"
              aria-label="Refresh deals"
              className="p-2.5 text-white/70 hover:text-white transition-colors rounded-xl"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <RefreshCw className="w-4 h-4" />
            </button>
            <StageChangeBell
              events={stageEvents}
              unseen={unseenDeals.size}
              onJumpToDeal={jumpToDeal}
              onMarkAll={markAllSeen}
              onRefresh={loadEvents} />
          </div>
        </div>

        {/* Result count + active-filter reset */}
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          <span className="text-white/85 text-xs font-semibold">
            {deals === null ? "Loading…" : total === 0 ? "No deals" : `Showing ${deals.length} of ${total} deal${total === 1 ? "" : "s"}`}
            {totalPages > 1 && deals !== null && total > 0 && <span className="text-white/45 font-medium"> · page {page} of {totalPages}</span>}
          </span>
          {unseenDeals.size > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(225,79,105,0.14)", color: PINK, border: `1px solid rgba(225,79,105,0.35)` }}>
              {unseenDeals.size} need{unseenDeals.size === 1 ? "s" : ""} attention
            </span>
          )}
          {(status !== "ALL" || source !== "ALL" || search.trim()) && (
            <button
              onClick={() => {
                // Clearing only the search box leaves status/source untouched,
                // so the [status, source] effect won't fire — reload by hand.
                const filtersWereSet = status !== "ALL" || source !== "ALL";
                setSearch(""); searchRef.current = "";
                setStatus("ALL"); setSource("ALL");
                if (!filtersWereSet) load(1);
              }}
              className="text-[11px] font-semibold hover:underline" style={{ color: PINK }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Deal Cards ── */}
      {deals === null ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />)}</div>
      ) : deals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ListChecks className="w-8 h-8 text-white/20" />
          <p className="text-white/75 text-sm font-semibold">No deals match these filters</p>
          <p className="text-white/45 text-xs max-w-xs">
            {status !== "ALL" || source !== "ALL" || search.trim()
              ? "Try a different stage or source, or clear the search."
              : "Deals appear here once a creator accepts a brand's offer."}
          </p>
          {(status !== "ALL" || source !== "ALL" || search.trim()) && (
            <button
              onClick={() => {
                const filtersWereSet = status !== "ALL" || source !== "ALL";
                setSearch(""); searchRef.current = "";
                setStatus("ALL"); setSource("ALL");
                if (!filtersWereSet) load(1);
              }}
              className="mt-1 px-4 py-1.5 rounded-full text-xs font-semibold text-white"
              style={{ background: PINK }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map(d => {
            const breakdown: string[] = [];
            if (d.reelCount > 0) breakdown.push(`${d.reelCount} Reel${d.reelCount > 1 ? "s" : ""}`);
            if (d.storyCount > 0) breakdown.push(`${d.storyCount} Stor${d.storyCount > 1 ? "ies" : "y"}`);
            if (d.postCount > 0) breakdown.push(`${d.postCount} Photo${d.postCount > 1 ? "s" : ""}`);

            const platformFee = Number(d.totalAgreedValue || 0) - Number(d.creatorPayout || 0);
            const showBreakdown = Number(d.creatorPayout) > 0;

            const refunded = d.payoutStatus === "REFUNDED_TO_BRAND";
            const paid = d.payoutStatus === "RELEASED";
            const isBarter = d.source === "BARTER";
            const isUnseen = unseenDeals.has(d.id);
            const isFlashing = d.id === highlightId;

            return (
              <div key={d.id} data-deal-id={d.id}
                data-unseen={isUnseen ? "1" : undefined}
                /* Clicking anywhere on a flagged card acknowledges it, which is
                   what removes the pink treatment below. */
                onClick={isUnseen ? () => markDealSeen(d.id) : undefined}
                className="rounded-2xl p-4 transition-all duration-300"
                style={{
                  background: isUnseen ? "rgba(225,79,105,0.045)" : "#13151D",
                  border: refunded
                    ? "1px solid rgba(239,68,68,0.20)"
                    : paid
                    ? "1px solid rgba(34,197,94,0.18)"
                    : "1px solid rgba(255,255,255,0.07)",
                  // 4px pink rail marks a deal with an unacknowledged change.
                  borderLeft: isUnseen ? `4px solid ${PINK}` : undefined,
                  boxShadow: isFlashing ? `0 0 0 3px rgba(225,79,105,0.35)` : undefined,
                  cursor: isUnseen ? "pointer" : undefined,
                }}>
                {/* Line 1 — the identity of the deal, the loudest thing here */}
                <div className="flex items-start justify-between gap-3 flex-wrap mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <AdminProfileLink
                      href={d.brandId ? brandAdminUrl(d.brandId) : null}
                      navigate={navigate}
                      title={d.brandName ? `Open ${d.brandName} in Brand Onboarding` : undefined}>
                      {d.brandName ?? "—"}
                    </AdminProfileLink>
                    <span className="text-white/45 text-sm">→</span>
                    <AdminProfileLink
                      href={d.creatorId ? creatorAdminUrl(d.creatorId) : null}
                      navigate={navigate}
                      title={d.creatorHandle ? `Open @${d.creatorHandle} in Creator Onboarding` : undefined}>
                      @{d.creatorHandle ?? "—"}
                    </AdminProfileLink>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                    {sourceBadge(d.source)}
                    {stageBadge(d)}
                  </div>
                </div>

                {/* Line 2 — quiet meta row */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45 mb-3">
                  {d.orderId && <><span className="font-mono text-white/40">{d.orderId}</span><span className="text-white/20">·</span></>}
                  {d.campaignName && d.campaignName !== "—" && <><span className="text-white/60">{d.campaignName}</span><span className="text-white/20">·</span></>}
                  {d.categoryName && <><span>{d.categoryName}</span><span className="text-white/20">·</span></>}
                  {breakdown.length > 0 && <><span>{breakdown.join(" + ")}</span><span className="text-white/20">·</span></>}
                  <span>{d.timelineDays}d timeline</span>
                  <span className="text-white/20">·</span>
                  <span>{fmtDate(d.createdAt)}</span>
                </div>

                {/* Financial Breakdown */}
                <div className="rounded-xl px-3 py-2.5 mb-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {isBarter ? (
                    /* Barter moves no money: one cell, and none of the GST /
                       fee / payout / payment-status columns. */
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-white/45 text-[10px] uppercase tracking-wider mb-0.5">Deal Amount</p>
                        <p className="text-white font-bold text-sm">₹0</p>
                      </div>
                      <span className="text-white/35 text-[11px]">No payment — barter collaboration</span>
                    </div>
                  ) : (
                    <div className="flex items-end gap-x-6 gap-y-2 flex-wrap">
                      <div className="min-w-[5.5rem]">
                        <p className="text-white/45 text-[10px] uppercase tracking-wider mb-0.5">Deal Amount</p>
                        <p className="text-white font-bold text-sm tabular-nums">{fmtINR(d.totalAgreedValue)}</p>
                      </div>
                      {showBreakdown && (
                        <>
                          <div className="min-w-[4.5rem]">
                            <p className="text-white/45 text-[10px] uppercase tracking-wider mb-0.5">GST</p>
                            <p className="text-white/85 text-sm font-semibold tabular-nums">{fmtINR(d.gstAmount)}</p>
                          </div>
                          <div className="min-w-[5.5rem]">
                            <p className="text-white/45 text-[10px] uppercase tracking-wider mb-0.5">Platform Fee</p>
                            <p className="text-white/85 text-sm font-semibold tabular-nums">{fmtINR(platformFee)}</p>
                          </div>
                          <div className="min-w-[6rem]">
                            <p className="text-white/45 text-[10px] uppercase tracking-wider mb-0.5">Creator Payout</p>
                            <p className="font-bold text-sm tabular-nums" style={{ color: "#4ade80" }}>{fmtINR(d.creatorPayout)}</p>
                          </div>
                        </>
                      )}
                      <div className="ml-auto text-right">
                        <p className="text-white/45 text-[10px] uppercase tracking-wider mb-0.5">Payment</p>
                        {payoutStatusBadge(d.payoutStatus)}
                      </div>
                    </div>
                  )}

                  {/* Post-payment info */}
                  {paid && d.paidAmount && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <p className="text-green-400/80 text-[11px]">
                        {fmtINR(d.paidAmount)} paid to creator
                        {d.payoutAdjustmentReason && <span className="text-white/70"> · {d.payoutAdjustmentReason}</span>}
                      </p>
                    </div>
                  )}

                  {/* Post-refund info */}
                  {refunded && d.refundAmount && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: "rgba(239,68,68,0.12)" }}>
                      <p className="text-red-400/80 text-[11px]">
                        {fmtINR(d.refundAmount)} refunded to brand
                        {d.refundReason && <span className="text-white/70"> · {d.refundReason}</span>}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => openChat(d)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/90 hover:text-white transition-colors"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
                    <MessageSquare className="w-3 h-3" />
                    Chat
                  </button>

                  {canPay(d) && (
                    <button onClick={() => openPayModal(d)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)" }}>
                      💸 Pay Creator
                    </button>
                  )}

                  {canRefund(d) && (
                    <button onClick={() => openRefundModal(d)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white"
                      style={{ background: "rgba(239,68,68,0.70)", border: "1px solid rgba(239,68,68,0.30)" }}>
                      ↩ Refund Brand
                    </button>
                  )}

                  {/* Brand Invoice */}
                  {d.brandInvoiceUrl ? (
                    <a href={d.brandInvoiceUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{ background: "rgba(240,24,122,0.12)", color: PINK, border: "1px solid rgba(240,24,122,0.25)" }}>
                      <ExternalLink className="w-3 h-3" />
                      Brand Invoice
                    </a>
                  ) : (
                    <button onClick={() => openInvoiceModal(d, "BRAND")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/70 hover:text-white transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <Upload className="w-3 h-3" />
                      Brand Invoice
                    </button>
                  )}

                  {/* Creator Invoice — only after creator payout has been released */}
                  {d.creatorInvoiceUrl ? (
                    <a href={d.creatorInvoiceUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}>
                      <ExternalLink className="w-3 h-3" />
                      Creator Invoice
                    </a>
                  ) : d.payoutStatus === "RELEASED" ? (
                    <button onClick={() => openInvoiceModal(d, "CREATOR")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/70 hover:text-white transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <Upload className="w-3 h-3" />
                      Creator Invoice
                    </button>
                  ) : (
                    <span
                      title="Pay the creator first to upload their invoice"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/30 cursor-not-allowed"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.08)" }}>
                      <Upload className="w-3 h-3" />
                      Creator Invoice
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2 pb-1 flex-wrap">
              <button onClick={() => goToPage(page - 1)} disabled={page <= 1}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-white/85 disabled:opacity-35 disabled:cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                ← Prev
              </button>
              <span className="text-white/60 text-[11px] px-2">Page {page} of {totalPages}</span>
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-white/85 disabled:opacity-35 disabled:cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const fmtDateTime = (d: string) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

function DealReportsList({ type }: { type: "creator" | "brand" }) {
  const { adminFetch } = useAdminAuth();
  const [reports, setReports] = useState<any[] | null>(null);

  useEffect(() => {
    (async () => {
      const r = await adminFetch(`${BASE_URL}/api/admin/deal-reports/${type}`);
      if (r.ok) { const d = await r.json(); setReports(d.reports ?? []); }
      else setReports([]);
    })();
  }, [type, adminFetch]);

  if (reports === null) return <div className="text-white/50 text-sm text-center py-12" style={{ fontFamily: POPPINS }}>Loading…</div>;
  if (reports.length === 0) return <div className="text-white/50 text-sm text-center py-12" style={{ fontFamily: POPPINS }}>No reports submitted yet.</div>;

  return (
    <div className="space-y-4">
      {reports.map(r => (
        <div key={r.id} className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
          <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
            <span className="text-white/40 text-[11px] font-mono">{r.orderId ?? r.dealId}</span>
            <span className="text-white/40 text-[11px]">{fmtDateTime(r.createdAt)}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-0.5">Brand</p>
              <p className="text-white text-sm font-semibold">{r.brandName ?? "—"}</p>
            </div>
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-0.5">Creator</p>
              <p className="text-white text-sm font-semibold">@{r.creatorHandle ?? "—"}{r.creatorName ? <span className="text-white/50 font-normal ml-1 text-xs">({r.creatorName})</span> : null}</p>
            </div>
            <div className="col-span-2">
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-0.5">
                {type === "creator" ? "Reported by (Brand email)" : "Reported by (Creator email)"}
              </p>
              <p className="text-[#F0187A] text-sm">{r.reporterEmail ?? "—"}</p>
            </div>
          </div>
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Reason</p>
            <p className="text-white/85 text-sm leading-relaxed" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>{r.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const TAB_KEYS = new Set<string>(TABS.map(t => t.key));

export default function AdminDealManagement() {
  const { adminId } = useAdminAuth();
  const [, navigate] = useLocation();
  /* ?tab= makes the tab addressable, so a review panel can send admin back to
     All Deals rather than dumping them on the default Settings tab. */
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "settings";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && TAB_KEYS.has(t) ? (t as Tab) : "settings";
  });

  // Keep the URL in step without adding a history entry per tab click.
  function selectTab(next: Tab) {
    setTab(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId, navigate]);
  if (!adminId) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/8">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
          <span className="text-white/70 text-lg">|</span>
          <span className="text-[#9CA3AF] text-sm">Deal Management</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Deal Management</h1>
          <p className="text-white/70 text-sm mt-1">Configure deal rules and view all finalized deals</p>
        </div>

        <div className="flex gap-0 mb-8 border-b border-white/10">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => selectTab(t.key)}
                className="px-5 py-3 text-sm font-semibold transition-all flex items-center gap-2"
                style={{
                  color: active ? PINK : "rgba(255,255,255,0.70)",
                  borderBottom: active ? `2px solid ${PINK}` : "2px solid transparent",
                }}>
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "settings" && <AdminDealSettings embedded />}
        {tab === "all" && <AllDealsList />}
        {tab === "creator-reports" && <DealReportsList type="creator" />}
        {tab === "brand-reports" && <DealReportsList type="brand" />}
      </main>
    </div>
  );
}
