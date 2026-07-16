import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useServerTime, fmtCountdown } from "@/hooks/useServerTime";
import { Zap, Clock, CheckCircle, XCircle, MessageCircle, AlertCircle, ChevronDown, ChevronUp, ChevronRight, Package, PackageCheck, CalendarClock, PlusCircle, AlertTriangle, FileText } from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import DealChat from "@/components/DealChat";
import DealScriptModal from "@/components/DealScriptModal";
import DealDeliverablesPanel from "@/components/DealDeliverablesPanel";
import DealProgressBar from "@/components/DealProgressBar";
import { CreatorLayout } from "@/components/CreatorNavLayout";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BG = "#0A0A0F";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

function extractYoutubeId(url: string): string | null {
  const m = url.trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function TutorialDropdown({ apiFetch }: { apiFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  const [open, setOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("tutorial") === "1"; } catch { return false; }
  });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("collabry:tutorial", handler);
    return () => window.removeEventListener("collabry:tutorial", handler);
  }, []);

  useEffect(() => {
    apiFetch("/api/platform-config/deal-tutorial-video")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setVideoUrl(d.url); })
      .catch(() => {});
  }, [apiFetch]);

  if (!videoUrl) return null;
  const videoId = extractYoutubeId(videoUrl);
  if (!videoId) return null;

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all"
        style={{
          background: "rgba(240,24,122,0.60)",
          border: "1px solid rgba(240,24,122,0.75)",
          boxShadow: open
            ? "0 0 0 1px rgba(240,24,122,0.50), 0 8px 32px rgba(240,24,122,0.28)"
            : "0 4px 20px rgba(240,24,122,0.22)",
          fontFamily: POPPINS,
        }}
      >
        <span className="flex items-center gap-2.5 text-[12px] font-bold text-white">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.22)" }}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="white">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </span>
          See How The Deal Flow Works
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: "rgba(255,255,255,0.22)", color: "white", letterSpacing: "0.03em" }}
          >
            Tutorial
          </span>
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-white opacity-90 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-white opacity-70 flex-shrink-0" />}
      </button>
      {open && (
        <div className="mt-2 rounded-xl overflow-hidden" style={{ aspectRatio: "16/9", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
            title="Deal Flow Tutorial"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
            style={{ border: "none", display: "block" }}
          />
        </div>
      )}
    </div>
  );
}

const CARD_BG = "#13131F";
const CARD_BORDER = "rgba(255,255,255,0.07)";

interface Brand { id: string; companyName: string | null; logoUrl: string | null; }
interface DealRow {
  id: string; orderId?: string | null; status: string;
  source?: string; campaignId?: string | null; campaignName?: string | null;
  barterProductName?: string | null; barterProductValue?: number | null;
  reelCount: number; storyCount: number; postCount: number;
  pricePerReel: number | null; pricePerStory: number | null; pricePerPost: number | null;
  subtotal: number; gstAmount: number; totalPayable: number; creatorPayout: number; commissionRate: number;
  timelineDays: number; timelineStartAt: string | null; deadlineAt: string | null;
  productRequired: boolean; productImageUrl?: string | null; paymentReferenceId: string | null; createdAt: string;
  productShippedAt: string | null; productReceivedAt: string | null;
  awbNumber: string | null; courierName: string | null; shipDate: string | null;
  deliveryAddress: string | null;
  payoutStatus: string | null; disputeWindowEnd: string | null; disputeRaised: boolean;
  postedBy: string | null;
  addressLocked?: boolean | null;
  awbLocked?: boolean | null;
  awbWrongDeadline?: string | null;
  productIssueRaised?: boolean | null;
  productIssueResponse?: string | null;
  productIssueImages?: string[] | null;
  productIssueDescription?: string | null;
  creatorIssueDecision?: string | null;
  brandResponseDeadline?: string | null;
  reshipCount?: number | null;
  makeItOptionAvailable?: boolean | null;
  awbCorrectionCount?: number | null;
  awbCorrectionLimitSnapshot?: number | null;
  maxDeliveryDaysSnapshot?: number | null;
  deliveryExtendedUntil?: string | null;
  deliveryExtensionCount?: number | null;
  maxDeliveryExtensionsSnapshot?: number | null;
  brandResponseHoursSnapshot?: number | null;
  nonDeliveryReportedAt?: string | null;
  nonDeliveryResolution?: string | null;
  productIssueStatus?: string | null;
  aboutProduct?: string | null;
  reelScript?: string | null;
  brand: Brand | null;
}
interface RequestRow {
  id: string; status: string;
  reelCount: number; storyCount: number; postCount: number;
  pricePerReel: number; pricePerStory: number; pricePerPost: number;
  totalValue: number; timelineDays: number; brief: string;
  proposedBy: string; roundNumber: number; expiresAt: string; createdAt: string;
  brand: Brand | null;
}

type Tab = "live" | "pending" | "completed" | "cancelled";

const TABS: { key: Tab; label: string }[] = [
  { key: "live",      label: "Live Deal" },
  { key: "pending",   label: "Pending Deal" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function countdown(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

export default function CreatorDeals() {
  const { creatorId, apiFetch, loading: authLoading } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return (["live","pending","completed","cancelled"].includes(p ?? "") ? p : "live") as Tab;
  });
  const targetDealId = (() => { try { return new URLSearchParams(window.location.search).get("deal"); } catch { return null; } })();
  const chatDealId = (() => { try { const p = new URLSearchParams(window.location.search); return p.get("chat") === "1" ? p.get("deal") : null; } catch { return null; } })();
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<{ tab: string }>).detail?.tab;
      if (["live", "pending", "completed", "cancelled"].includes(t)) setTab(t as Tab);
    };
    window.addEventListener("collabry:tab", handler);
    return () => window.removeEventListener("collabry:tab", handler);
  }, []);
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [pendingPaymentDeals, setPendingPaymentDeals] = useState<DealRow[]>([]);
  const [cancelledRequests, setCancelledRequests] = useState<any[]>([]);

  useEffect(() => { if (!authLoading && !creatorId) navigate("/login-creator"); }, [creatorId, authLoading, navigate]);

  // Keep a stable ref to apiFetch so token refreshes don't recreate `load`
  // and accidentally trigger a non-silent reload that unmounts DealsList.
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => { apiFetchRef.current = apiFetch; }, [apiFetch]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!creatorId) return;
    if (!opts?.silent) setLoading(true);
    try {
      const r = await apiFetchRef.current(`/api/creator/deals?tab=${tab}`);
      if (r.ok) {
        const d = await r.json();
        if (tab === "pending") {
          setRequests(d.requests ?? []);
          setPendingPaymentDeals(d.pendingPaymentDeals ?? []);
          setDeals([]);
          setCancelledRequests([]);
        } else {
          setDeals(d.deals ?? []);
          setRequests([]);
          setPendingPaymentDeals([]);
          setCancelledRequests(d.cancelledRequests ?? []);
        }
      }
    } finally { if (!opts?.silent) setLoading(false); }
  }, [creatorId, tab]);

  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!targetDealId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`deal-card-${targetDealId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.transition = "box-shadow 0.3s ease";
        el.style.boxShadow = "0 0 0 3px rgba(240,24,122,0.70)";
        setTimeout(() => { el.style.boxShadow = "none"; }, 2200);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [deals, pendingPaymentDeals, targetDealId]);

  // Always keep a ref to the latest load so the refresh listener can call it
  // even when tab or other deps haven't changed.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const handler = () => loadRef.current({ silent: true });
    window.addEventListener("collabry:refresh", handler);
    return () => window.removeEventListener("collabry:refresh", handler);
  }, []);

  if (authLoading || !creatorId) return null;

  return (
    <CreatorLayout status="ACTIVE" onLocked={() => {}}>
      <div style={{ fontFamily: POPPINS, paddingBottom: 80 }}>

        {/* ── Header + tabs ── */}
        <div style={{ maxWidth: 1280, margin: "0 auto", width: "100%", padding: "clamp(32px, 4vw, 56px) clamp(16px, 3vw, 32px) 0" }}>
          <h1 style={{
            textAlign: "center", fontWeight: 800, margin: "0 0 10px", lineHeight: 1.12,
            fontSize: "clamp(28px, 4vw, 48px)", fontFamily: POPPINS, letterSpacing: -1, color: "white",
          }}>
            Here are your <span style={{ color: PINK }}>deals</span>
          </h1>
          <p style={{
            textAlign: "center", margin: 0,
            color: "rgba(255,255,255,0.70)", fontSize: "clamp(13px, 1.3vw, 16px)", fontFamily: POPPINS,
          }}>
            Manage your active deals, pending requests and history.
          </p>

          {/* Tab bar */}
          <div className="grid grid-cols-4 gap-1.5 mt-6">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="py-2.5 rounded-full text-[11px] sm:text-[12px] font-semibold text-center"
                style={{
                  background: tab === t.key ? PINK : "rgba(255,255,255,0.06)",
                  color: "white",
                  border: `1px solid ${tab === t.key ? PINK : "rgba(255,255,255,0.10)"}`,
                  fontFamily: POPPINS,
                  cursor: "pointer",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ maxWidth: 1280, margin: "clamp(24px, 2.5vw, 36px) auto 0", width: "100%", padding: "0 clamp(16px, 3vw, 32px)" }}>

          {/* Deal flow tutorial */}
          <TutorialDropdown apiFetch={apiFetch} />

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ height: 200, borderRadius: 20, background: CARD_BG, opacity: 0.5 }} />
              ))}
            </div>
          ) : tab === "pending" ? (
            <PendingTab requests={requests} pendingPaymentDeals={pendingPaymentDeals} />
          ) : tab === "live" ? (
            <LiveTab deals={deals} apiFetch={apiFetch} onRefresh={load} chatDealId={chatDealId} />
          ) : (
            <HistoryTab deals={deals} cancelledRequests={cancelledRequests} tab={tab} />
          )}
        </div>
      </div>
    </CreatorLayout>
  );
}

// ─── Creator Delivery Address Form ───────────────────────────────────────────
function CreatorAddressForm({ deal, apiFetch, onRefresh }: {
  deal: DealRow;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [addressName, setAddressName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [phone, setPhone] = useState("");

  if (!deal.productRequired) return null;

  if (deal.deliveryAddress) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", marginBottom: 10 }}>
        <span style={{ fontSize: 13, flexShrink: 0 }}>📍</span>
        <div>
          <p style={{ color: "#7DB7FF", fontSize: 10, fontWeight: 700, textTransform: "uppercase", margin: "0 0 2px", fontFamily: POPPINS }}>
            Your delivery address {deal.addressLocked ? "(locked — brand has shipped)" : ""}
          </p>
          <p style={{ color: "rgba(255,255,255,0.90)", fontSize: 12, margin: 0, fontFamily: POPPINS }}>{deal.deliveryAddress}</p>
          {(deal as any).deliveryAddressPhone && (
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, margin: "2px 0 0", fontFamily: POPPINS }}>📞 {(deal as any).deliveryAddressPhone}</p>
          )}
        </div>
      </div>
    );
  }

  async function submit() {
    if (!addressName.trim() || !line1.trim() || !city.trim() || !state.trim() || !pincode.trim() || !phone.trim()) {
      setErr("Name, address line 1, city, state, pincode, and phone are required."); return;
    }
    if (!/^\d{10}$/.test(phone.trim())) {
      setErr("Phone must be a 10-digit Indian mobile number."); return;
    }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`/api/creator/deals/${deal.id}/delivery-address`, {
        method: "POST",
        body: JSON.stringify({ addressName: addressName.trim(), addressLine1: line1.trim(), addressLine2: line2.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim(), phone: phone.trim() }),
      });
      if (r.ok) { setOpen(false); onRefresh(); }
      else { const d = await r.json(); setErr(d.error ?? "Failed"); }
    } catch { setErr("Network error."); }
    finally { setBusy(false); }
  }

  const INP = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", width: "100%", padding: "8px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS, outline: "none" } as React.CSSProperties;
  const INP_ERR = { ...INP, border: "1px solid rgba(239,68,68,0.45)" };

  return (
    <div style={{ marginBottom: 10 }}>
      {!open ? (
        <button onClick={() => setOpen(true)}
          style={{ width: "100%", padding: "10px 0", borderRadius: 22, border: "none", background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: POPPINS }}>
          📍 Share Delivery Address
        </button>
      ) : (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 12 }}>
          <p style={{ color: "#fff", fontSize: 12, fontWeight: 700, marginBottom: 8, fontFamily: POPPINS }}>📍 Your Delivery Address</p>
          <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 11, marginBottom: 10, fontFamily: POPPINS }}>The brand will ship the product to this address. Once they ship, the address can't be changed.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input value={addressName} onChange={e => setAddressName(e.target.value)} placeholder="Full name *" style={!addressName.trim() ? INP_ERR : INP} />
            <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Phone (10-digit) *" style={!phone.trim() || !/^\d{10}$/.test(phone) ? INP_ERR : INP} />
            <input value={line1} onChange={e => setLine1(e.target.value)} placeholder="Address line 1 (House/Flat, Street) *" style={!line1.trim() ? INP_ERR : INP} />
            <input value={line2} onChange={e => setLine2(e.target.value)} placeholder="Address line 2 (optional)" style={INP} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="City *" style={!city.trim() ? INP_ERR : INP} />
              <input value={state} onChange={e => setState(e.target.value)} placeholder="State *" style={!state.trim() ? INP_ERR : INP} />
            </div>
            <input value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Pincode *" style={!pincode.trim() ? INP_ERR : INP} />
          </div>
          {err && <p style={{ color: "#f87171", fontSize: 11, marginTop: 6, fontFamily: POPPINS }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setOpen(false)} style={{ flex: 1, padding: "9px 0", borderRadius: 20, border: "none", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: POPPINS, cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={busy} style={{ flex: 1, padding: "9px 0", borderRadius: 20, border: "none", background: PINK, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: POPPINS, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Save Address"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Product Not Received Confirmation Modal ─────────────────────────────────
function ProductNotReceivedModal({ onClose, onConfirm, onTalkToBrand, busy }: {
  onClose: () => void;
  onConfirm: () => void;
  onTalkToBrand: () => void;
  busy: boolean;
}) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.80)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: "0 16px" }}>
      <div style={{ background: "#13151D", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 18, padding: 24, maxWidth: 420, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={18} color="#f87171" />
          </div>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: 0, fontFamily: POPPINS }}>Product Not Received?</p>
        </div>
        <p style={{ color: "rgba(255,255,255,0.90)", fontSize: 13, lineHeight: 1.65, marginBottom: 10, fontFamily: POPPINS }}>
          Marking a product as "not received" may lead to deal cancellation and dispute review.
        </p>
        <p style={{ color: "rgba(255,255,255,0.90)", fontSize: 13, lineHeight: 1.65, marginBottom: 10, fontFamily: POPPINS }}>
          We strongly recommend discussing the issue with the brand in the deal chat or over a call before proceeding. In many cases, delivery delays can be resolved quickly.
        </p>
        <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, lineHeight: 1.55, marginBottom: 22, fontFamily: POPPINS }}>
          Collabry will track the shipment status, so please confirm carefully before reporting the product as undelivered. You can still mark it as not delivered later if the issue is not resolved.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onTalkToBrand}
            style={{ width: "100%", padding: "13px 0", borderRadius: 22, border: "none", background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: POPPINS }}>
            💬 Talk to Brand
          </button>
          <button onClick={onConfirm} disabled={busy}
            style={{ width: "100%", padding: "12px 0", borderRadius: 22, border: "1px solid rgba(239,68,68,0.50)", background: "rgba(239,68,68,0.10)", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: POPPINS, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Reporting…" : "🚨 Mark as Not Received"}
          </button>
          <button onClick={onClose}
            style={{ width: "100%", padding: "11px 0", borderRadius: 22, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: POPPINS }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Shipping Section (Creator Side) ──────────────────────────────────
function CreatorProductShipping({ deal, apiFetch, onRefresh, onOpenChat }: {
  deal: DealRow;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
  onOpenChat?: () => void;
}) {
  const { accessToken: creatorAccessToken } = useCreatorAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { serverNow } = useServerTime();
  const [receivedConfirmed, setReceivedConfirmed] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [showAwbWrong, setShowAwbWrong] = useState(false);
  const [showNotReceivedModal, setShowNotReceivedModal] = useState(false);
  const [showReshipAutoCancel, setShowReshipAutoCancel] = useState(false);

  if (!deal.productRequired) return null;

  async function markReceived() {
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`/api/creator/deals/${deal.id}/product-received`, { method: "POST" });
      if (r.ok) { onRefresh(); }
      else { const d = await r.json(); setErr(d.error ?? "Failed"); }
    } catch { setErr("Network error. Please try again."); }
    finally { setBusy(false); }
  }

  async function doReportNotReceived() {
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`/api/creator/deals/${deal.id}/not-received`, { method: "POST" });
      if (r.ok) { setShowNotReceivedModal(false); onRefresh(); }
      else { const d = await r.json(); setErr(d.error ?? "Failed"); setShowNotReceivedModal(false); }
    } catch { setErr("Network error. Please try again."); setShowNotReceivedModal(false); }
    finally { setBusy(false); }
  }

  function reportNotReceived() {
    setShowNotReceivedModal(true);
  }

  async function decideMakeIt(decision: "PROCEED" | "CANNOT_PROCEED") {
    if (decision === "CANNOT_PROCEED" && !confirm("Confirm: you cannot work with this product as-is?")) return;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`/api/creator/deals/${deal.id}/issue-decision`, {
        method: "POST", body: JSON.stringify({ decision }),
      });
      if (r.ok) { onRefresh(); }
      else { const d = await r.json(); setErr(d.error ?? "Failed"); }
    } catch { setErr("Network error. Please try again."); }
    finally { setBusy(false); }
  }

  // ── Received already — show success
  if (deal.productReceivedAt) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.22)", marginBottom: 10 }}>
        <PackageCheck size={14} color="#22c55e" />
        <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 600, fontFamily: POPPINS }}>Product received · Timeline started</span>
      </div>
    );
  }

  // ── Non-delivery already reported — admin reviewing
  if (deal.nonDeliveryReportedAt && deal.status === "NON_DELIVERY_REPORTED") {
    return (
      <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
        <p style={{ color: "#f87171", fontSize: 12, fontWeight: 700, margin: "0 0 2px", fontFamily: POPPINS }}>🚨 Non-delivery reported</p>
        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, margin: 0, fontFamily: POPPINS }}>Admin is reviewing the case — you'll get a notification once it's resolved.</p>
      </div>
    );
  }

  // ── Issue raised by creator — waiting for brand
  if (deal.status === "PRODUCT_ISSUE_RAISED" && deal.productIssueRaised) {
    return (
      <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
        <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, margin: "0 0 2px", fontFamily: POPPINS }}>⚠️ Issue raised — waiting for brand</p>
        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, margin: 0, fontFamily: POPPINS }}>
          Waiting for the brand to review and respond. They can reship, ask you to work with it, or cancel the deal.
        </p>
      </div>
    );
  }

  // ── Brand asked Creator to make-it-work — decision panel
  if (deal.status === "AWAITING_CREATOR_ISSUE_DECISION") {
    return (
      <div style={{ marginBottom: 10, padding: 12, borderRadius: 10, background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.30)" }}>
        <p style={{ color: "#fff", fontSize: 13, fontWeight: 700, margin: "0 0 4px", fontFamily: POPPINS }}>💬 Brand asks: can you work with this product?</p>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, margin: "0 0 10px", fontFamily: POPPINS }}>
          If you proceed, the timeline starts now and no more issues can be raised. If not, brand will be asked to reship or cancel.
        </p>
        {err && <p style={{ color: "#f87171", fontSize: 11, marginBottom: 6, fontFamily: POPPINS }}>{err}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => decideMakeIt("CANNOT_PROCEED")} disabled={busy}
            style={{ flex: 1, padding: "9px 0", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: POPPINS, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            No, can't work with it
          </button>
          <button onClick={() => decideMakeIt("PROCEED")} disabled={busy}
            style={{ flex: 1, padding: "9px 0", borderRadius: 20, border: "none", background: PINK, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: POPPINS, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            Yes, I'll proceed
          </button>
        </div>
      </div>
    );
  }

  // ── Product shipped by brand — main two-button UI + extras
  if (deal.productShippedAt) {
    const maxDays = (deal as any).maxDeliveryDays ?? 10;
    const ref = deal.deliveryExtendedUntil ? new Date(deal.deliveryExtendedUntil) : (deal.shipDate ? new Date(deal.shipDate) : null);
    const daysSinceShip = ref ? Math.floor((Date.now() - ref.getTime()) / 86400000) : 0;
    const showNotReceived = !deal.deliveryExtendedUntil
      ? daysSinceShip >= maxDays
      : new Date() >= ref!;
    const awbWrongActive = !!deal.awbWrongDeadline && new Date(deal.awbWrongDeadline) > new Date();

    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", marginBottom: 8 }}>
          <Package size={14} color="#fbbf24" style={{ marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 600, fontFamily: POPPINS }}>
              Product shipped by brand{(deal.reshipCount ?? 0) > 0 ? ` (reship ${deal.reshipCount})` : ""}
            </span>
            {(deal.awbNumber || deal.courierName) && (
              <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 11, margin: "1px 0 0", fontFamily: POPPINS }}>
                {deal.courierName ? `${deal.courierName} ` : ""}{deal.awbNumber ? `· AWB: ${deal.awbNumber}` : ""}{deal.shipDate ? ` · Shipped ${deal.shipDate}` : ""}
                {deal.awbLocked ? "  ✓ confirmed correct" : ""}
              </p>
            )}
            {!deal.awbLocked && !awbWrongActive && (
              <button onClick={() => setShowAwbWrong(true)}
                style={{ background: "transparent", border: "none", color: "#7DB7FF", fontSize: 10, padding: 0, marginTop: 4, cursor: "pointer", textDecoration: "underline", fontFamily: POPPINS }}>
                AWB looks incorrect?
              </button>
            )}
          </div>
        </div>

        {err && <p style={{ color: "#f87171", fontSize: 11, marginBottom: 6, fontFamily: POPPINS }}>{err}</p>}

        {!receivedConfirmed ? (
          <button onClick={() => setReceivedConfirmed(true)} disabled={busy}
            style={{ width: "100%", padding: "13px 0", borderRadius: 22, border: "none", background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: POPPINS }}>
            📦 I Have Received the Product
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={markReceived} disabled={busy}
              style={{ flex: 3, padding: "11px 0", borderRadius: 22, border: "none", background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: POPPINS, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Confirming…" : "✓ Product is Good — Let's Start"}
            </button>
            <button
              onClick={() => {
                if ((deal.reshipCount ?? 0) >= 1) {
                  setShowReshipAutoCancel(true);
                } else {
                  setConfirmIssue(true);
                }
              }}
              disabled={busy || (deal.creatorIssueDecision === "PROCEED")}
              style={{ flex: 1, padding: "11px 0", borderRadius: 22, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#fff", fontSize: 11, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: POPPINS, opacity: busy || deal.creatorIssueDecision === "PROCEED" ? 0.5 : 1 }}>
              Issue
            </button>
          </div>
        )}

        {showNotReceived && (
          <button onClick={reportNotReceived} disabled={busy}
            style={{ width: "100%", marginTop: 8, padding: "9px 0", borderRadius: 20, border: "1px solid rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.10)", color: "#f87171", fontSize: 12, fontWeight: 600, fontFamily: POPPINS, cursor: busy ? "default" : "pointer" }}>
            🚨 Product not received yet (day {daysSinceShip})
          </button>
        )}

        {confirmIssue && (
          <ConfirmIssueModal
            onCancel={() => setConfirmIssue(false)}
            onConfirm={() => { setConfirmIssue(false); setShowIssueModal(true); }}
          />
        )}

        {showIssueModal && (
          <ProductIssueModal
            accessToken={creatorAccessToken}
            onClose={() => setShowIssueModal(false)}
            onSubmit={async (images, description) => {
              setBusy(true); setErr("");
              try {
                const r = await apiFetch(`/api/creator/deals/${deal.id}/product-issue`, {
                  method: "POST", body: JSON.stringify({ images, description }),
                });
                if (r.ok) { setShowIssueModal(false); onRefresh(); }
                else { const d = await r.json(); setErr(d.error ?? "Failed"); }
              } catch { setErr("Network error."); }
              finally { setBusy(false); }
            }}
          />
        )}

        {showAwbWrong && (
          <AwbWrongModal
            hours={deal.brandResponseHoursSnapshot ?? 48}
            onClose={() => setShowAwbWrong(false)}
            onSubmit={async () => {
              setBusy(true); setErr("");
              try {
                const r = await apiFetch(`/api/creator/deals/${deal.id}/awb-wrong`, { method: "POST" });
                if (r.ok) { setShowAwbWrong(false); onRefresh(); }
                else { const d = await r.json(); setErr(d.error ?? "Failed"); }
              } catch { setErr("Network error."); }
              finally { setBusy(false); }
            }}
          />
        )}

        {showNotReceivedModal && (
          <ProductNotReceivedModal
            onClose={() => setShowNotReceivedModal(false)}
            onConfirm={doReportNotReceived}
            onTalkToBrand={() => { setShowNotReceivedModal(false); onOpenChat?.(); }}
            busy={busy}
          />
        )}

        {showReshipAutoCancel && (
          <ReshipAutoCancelModal
            busy={busy}
            onCancel={() => setShowReshipAutoCancel(false)}
            onConfirm={async () => {
              setBusy(true); setErr("");
              try {
                const r = await apiFetch(`/api/creator/deals/${deal.id}/product-issue-auto-cancel`, { method: "POST" });
                if (r.ok) { setShowReshipAutoCancel(false); onRefresh(); }
                else { const d = await r.json(); setErr(d.error ?? "Failed"); setShowReshipAutoCancel(false); }
              } catch { setErr("Network error. Please try again."); setShowReshipAutoCancel(false); }
              finally { setBusy(false); }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
        <Package size={14} color="rgba(255,255,255,0.70)" />
        <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, fontFamily: POPPINS }}>Waiting for brand to ship product…</span>
      </div>
      {deal.productImageUrl && (
        <div style={{ marginTop: 6, padding: "7px 12px", borderRadius: 10, background: "rgba(240,24,122,0.06)", border: "1px solid rgba(240,24,122,0.18)" }}>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", fontFamily: POPPINS }}>Product Image  </span>
          <a href={/^https?:\/\//i.test(deal.productImageUrl!) ? deal.productImageUrl! : `https://${deal.productImageUrl}`} target="_blank" rel="noopener noreferrer"
            style={{ color: "#F0187A", fontSize: 12, fontWeight: 600, fontFamily: POPPINS, textDecoration: "underline", textUnderlineOffset: 2 }}>
            View ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Reship Auto-Cancel Warning Modal ────────────────────────────────────────
function ReshipAutoCancelModal({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#181828", borderRadius: 16, padding: 20, maxWidth: 360, width: "100%", border: "1px solid rgba(239,68,68,0.30)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
          </div>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 15, margin: 0, fontFamily: POPPINS }}>Raise another issue?</p>
        </div>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, lineHeight: 1.55, margin: "0 0 8px", fontFamily: POPPINS }}>
          You have already raised an issue once after a reship.
        </p>
        <p style={{ color: "#f87171", fontSize: 12, fontWeight: 600, lineHeight: 1.5, margin: "0 0 18px", fontFamily: POPPINS }}>
          Raising another issue will automatically cancel this deal and issue a full refund to the brand. This cannot be undone.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onCancel} disabled={busy}
            style={{ width: "100%", padding: "12px 0", borderRadius: 22, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: POPPINS }}>
            Go Back
          </button>
          <button onClick={onConfirm} disabled={busy}
            style={{ width: "100%", padding: "12px 0", borderRadius: 22, border: "none", background: "rgba(239,68,68,0.85)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: POPPINS, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Cancelling…" : "Yes, Cancel Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Issue Modal ─────────────────────────────────────────────────────
function ConfirmIssueModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#181828", borderRadius: 16, padding: 18, maxWidth: 360, width: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: "0 0 6px", fontFamily: POPPINS }}>Report a product issue?</h3>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 14px", fontFamily: POPPINS, lineHeight: 1.4 }}>
          You'll need to upload 1–3 photos showing the issue and describe what's wrong. We'll notify the brand to review and respond.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: POPPINS, cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "10px 0", borderRadius: 20, border: "none", background: PINK, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: POPPINS, cursor: "pointer" }}>Continue</button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Issue Modal ─────────────────────────────────────────────────────
function ProductIssueModal({ accessToken, onClose, onSubmit }: {
  accessToken: string | null;
  onClose: () => void;
  onSubmit: (images: string[], description: string) => Promise<void> | void;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!accessToken) { setErr("Please sign in to upload."); return; }
    setErr("");
    const remaining = 3 - images.length;
    const list = Array.from(files).slice(0, remaining);
    for (const f of list) {
      if (!/^image\/(jpe?g|png)$/i.test(f.type)) { setErr("Only JPG / PNG images allowed."); continue; }
      if (f.size > 4 * 1024 * 1024) { setErr("Each image must be under 4 MB."); continue; }
      setUploadingCount(c => c + 1);
      try {
        const formData = new FormData();
        formData.append("file", f);
        formData.append("prefix", "product-issue");
        const r = await fetch(`${BASE_URL}/api/uploads/private`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });
        if (!r.ok) { setErr("Upload failed. Try again."); continue; }
        const { objectPath } = (await r.json()) as { objectPath: string };
        setImages(prev => prev.length < 3 ? [...prev, objectPath] : prev);
      } finally {
        setUploadingCount(c => c - 1);
      }
    }
  }

  async function submit() {
    if (images.length < 1) { setErr("Please upload at least 1 image."); return; }
    if (!desc.trim()) { setErr("Please describe the issue."); return; }
    setBusy(true);
    try { await onSubmit(images, desc.trim()); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#181828", borderRadius: 16, padding: 18, maxWidth: 420, width: "100%", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: "0 0 4px", fontFamily: POPPINS }}>Report Product Issue</h3>
        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, margin: "0 0 12px", fontFamily: POPPINS }}>Upload 1–3 photos and describe what's wrong (max 4 MB each).</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
          {images.map((src, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1/1", borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
              <img src={src} alt={`issue ${i}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, lineHeight: "16px", cursor: "pointer" }}>×</button>
            </div>
          ))}
          {images.length < 3 && (
            <label style={{ aspectRatio: "1/1", border: "1px dashed rgba(255,255,255,0.70)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: uploadingCount > 0 ? "default" : "pointer", color: "rgba(255,255,255,0.75)", fontSize: 14, fontFamily: POPPINS, opacity: uploadingCount > 0 ? 0.5 : 1 }}>
              {uploadingCount > 0 ? "…" : "+"}
              <input type="file" accept="image/jpeg,image/png" multiple disabled={uploadingCount > 0} style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
            </label>
          )}
        </div>

        <textarea value={desc} onChange={e => setDesc(e.target.value.slice(0, 2000))}
          placeholder="What's wrong with the product? (max 2000 chars)" rows={4}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "#fff", fontSize: 12, fontFamily: POPPINS, outline: "none", resize: "vertical" }} />

        {err && <p style={{ color: "#f87171", fontSize: 11, margin: "8px 0 0", fontFamily: POPPINS }}>{err}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: "10px 0", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: POPPINS, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>Cancel</button>
          <button onClick={submit} disabled={busy || uploadingCount > 0} style={{ flex: 1, padding: "10px 0", borderRadius: 20, border: "none", background: PINK, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: POPPINS, cursor: (busy || uploadingCount > 0) ? "default" : "pointer", opacity: (busy || uploadingCount > 0) ? 0.6 : 1 }}>
            {busy ? "Submitting…" : uploadingCount > 0 ? "Uploading…" : "Submit Issue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AWB Wrong Modal ─────────────────────────────────────────────────────────
function AwbWrongModal({ hours, onClose, onSubmit }: { hours: number; onClose: () => void; onSubmit: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#181828", borderRadius: 16, padding: 18, maxWidth: 360, width: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: "0 0 6px", fontFamily: POPPINS }}>AWB looks incorrect?</h3>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 14px", fontFamily: POPPINS, lineHeight: 1.4 }}>
          We'll notify the brand. They will update the AWB or confirm it's correct.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: "10px 0", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: POPPINS, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>Cancel</button>
          <button onClick={async () => { setBusy(true); try { await onSubmit(); } finally { setBusy(false); } }} disabled={busy}
            style={{ flex: 1, padding: "10px 0", borderRadius: 20, border: "none", background: "#fbbf24", color: "#111", fontSize: 12, fontWeight: 700, fontFamily: POPPINS, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Sending…" : "Notify Brand"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Extension types ─────────────────────────────────────────────────────────
interface DealExtension {
  id: string;
  dealId: string;
  requestedAt: string;
  extraDays: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: "BRAND" | "AUTO" | null;
  respondedAt: string | null;
  autoApproveDeadline: string;
  originalDeadline: string | null;
  newDeadline: string | null;
}

// ─── ExtensionPanel (creator) ─────────────────────────────────────────────────
function ExtensionPanel({ deal, apiFetch, onRefresh }: {
  deal: DealRow;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [extensions, setExtensions] = useState<DealExtension[]>([]);
  const { serverNow } = useServerTime();
  const [loadingExt, setLoadingExt] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [extraDays, setExtraDays] = useState("7");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const TERMINAL = ["COMPLETED", "CONTENT_APPROVED", "CANCELLED", "REJECTED", "DISPUTE_WINDOW_OPEN", "FINAL_POST_CONFIRMED"];
  const canRequest = !TERMINAL.includes(deal.status);

  useEffect(() => {
    if (!open) return;
    setLoadingExt(true);
    apiFetch(`/api/creator/deals/${deal.id}/extensions`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setExtensions(Array.isArray(data) ? data : []))
      .catch(() => setExtensions([]))
      .finally(() => setLoadingExt(false));
  }, [open, deal.id, apiFetch]);

  const pending = extensions.find(e => e.status === "PENDING");
  const pastExtensions = extensions.filter(e => e.status !== "PENDING");

  async function submitRequest() {
    setError(null);
    const days = parseInt(extraDays, 10);
    if (!days || days < 1 || days > 30) { setError("Extra days must be between 1 and 30."); return; }
    if (!reason.trim()) { setError("Please provide a reason."); return; }
    setSubmitting(true);
    try {
      const r = await apiFetch(`/api/creator/deals/${deal.id}/request-extension`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraDays: days, reason: reason.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed to submit request"); return; }
      setShowModal(false);
      setReason("");
      setExtraDays("7");
      setOpen(true);
      apiFetch(`/api/creator/deals/${deal.id}/extensions`)
        .then(r2 => r2.ok ? r2.json() : [])
        .then(data => setExtensions(Array.isArray(data) ? data : []))
        .catch(() => {});
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const statusColor = (s: DealExtension["status"]) =>
    s === "APPROVED" ? "#22c55e" : s === "REJECTED" ? "#f87171" : "#fbbf24";
  const statusLabel = (e: DealExtension) =>
    e.status === "APPROVED"
      ? `Approved${e.approvedBy === "AUTO" ? " (auto)" : " by Brand"}`
      : e.status === "REJECTED"
      ? "Declined"
      : "Pending Brand Response";

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "10px 14px", borderRadius: 12,
          background: "rgba(240,24,122,0.15)", border: "1px solid rgba(255,255,255,0.08)",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.85)", fontSize: "clamp(12px, 1.1vw, 14px)", fontWeight: 600, fontFamily: POPPINS }}>
          <CalendarClock size={14} />
          Timeline Extension
          {extensions.length > 0 && (
            <span style={{ background: "rgba(240,24,122,0.18)", color: PINK, borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
              {extensions.length}
            </span>
          )}
          {pending && (
            <span style={{ background: "rgba(251,191,36,0.18)", color: "#fbbf24", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
              PENDING
            </span>
          )}
        </span>
        {open ? <ChevronUp size={14} color="rgba(255,255,255,0.70)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.70)" />}
      </button>

      {open && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 14, marginTop: 4 }}>
          {loadingExt && <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, fontFamily: POPPINS, margin: 0 }}>Loading…</p>}

          {pending && (
            <div style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.30)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, fontFamily: POPPINS }}>
                  ⏳ Pending: +{pending.extraDays} day(s)
                </span>
                <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 10, fontFamily: POPPINS }}>
                  Auto-approves in {fmtCountdown(pending.autoApproveDeadline, serverNow)}
                </span>
              </div>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: POPPINS, margin: 0 }}>
                "{pending.reason}"
              </p>
            </div>
          )}

          {pastExtensions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", fontFamily: POPPINS, marginBottom: 6, textTransform: "uppercase" }}>Extension History</p>
              {pastExtensions.map(e => (
                <div key={e.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: POPPINS }}>+{e.extraDays} day(s)</span>
                    <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 11, fontFamily: POPPINS }}> · {e.reason}</span>
                    {e.newDeadline && (
                      <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 10, fontFamily: POPPINS, margin: "2px 0 0" }}>
                        New deadline: {fmtDate(e.newDeadline)}
                      </p>
                    )}
                  </div>
                  <span style={{ color: statusColor(e.status), fontSize: 10, fontWeight: 700, fontFamily: POPPINS, marginLeft: 8, flexShrink: 0 }}>
                    {statusLabel(e)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!loadingExt && extensions.length === 0 && (
            <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 11, fontFamily: POPPINS, marginBottom: 10 }}>
              No extension requests yet.
            </p>
          )}

          {canRequest && !pending && (
            <button
              onClick={() => { setShowModal(true); setError(null); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                width: "100%", padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                background: "rgba(240,24,122,0.10)", border: "1px solid rgba(240,24,122,0.30)",
                color: PINK, fontSize: 12, fontWeight: 700, fontFamily: POPPINS,
              }}
            >
              <PlusCircle size={14} />
              Request Timeline Extension
            </button>
          )}
          {!canRequest && !pending && (
            <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 11, fontFamily: POPPINS, textAlign: "center" }}>
              Extensions are not available for this deal status.
            </p>
          )}
        </div>
      )}

      {showModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.85)", padding: "0 16px",
        }} onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setError(null); } }}>
          <div style={{ width: "100%", maxWidth: 420, borderRadius: 20, background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div>
                <h3 style={{ color: "#fff", fontWeight: 700, fontSize: 15, margin: 0 }}>Request Timeline Extension</h3>
                <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 11, margin: "3px 0 0" }}>Brand has 48h to respond — auto-approved if no reply</p>
              </div>
              <button onClick={() => { setShowModal(false); setError(null); }}>
                <XCircle size={20} color="rgba(255,255,255,0.75)" />
              </button>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Extra Days Needed (1–30)
                </label>
                <input
                  type="number" min={1} max={30}
                  value={extraDays} onChange={e => setExtraDays(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: POPPINS, outline: "none",
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Reason
                </label>
                <textarea
                  value={reason} onChange={e => setReason(e.target.value)}
                  rows={3} placeholder="Explain why you need more time…"
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: POPPINS,
                    resize: "none", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {error && <p style={{ color: "#f87171", fontSize: 12, fontFamily: POPPINS, marginBottom: 12 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowModal(false); setError(null); }}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 50, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600, fontFamily: POPPINS, border: "none", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={submitRequest} disabled={submitting}
                  style={{ flex: 2, padding: "10px 0", borderRadius: 50, background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: POPPINS, border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? "Sending…" : "Send Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Tab ────────────────────────────────────────────────────────────────
function ReportBrandModal({ deal, apiFetch, onClose }: {
  deal: DealRow;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    apiFetch("/api/creator/me/email").then(r => r.ok ? r.json() : null).then(d => { if (d?.email) setEmail(d.email); }).catch(() => {});
  }, [apiFetch]);
  async function submit() {
    if (!reason.trim() || !email.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch("/api/reports/deal-brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: deal.id, brandId: deal.brand?.id, reason, reporterEmail: email.trim() }) });
      if (r.ok) { setSuccess(true); setTimeout(onClose, 2200); }
      else { const d = await r.json(); setErr(d.error ?? "Failed to submit"); }
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }
  const INFO_ROW = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontFamily: POPPINS, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 13, color: "#fff", fontFamily: POPPINS, fontWeight: 500, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
  const INPUT_STYLE: React.CSSProperties = { background: "rgba(255,255,255,0.10)", color: "#fff", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: POPPINS, border: "1px solid rgba(255,255,255,0.20)", width: "100%", boxSizing: "border-box", outline: "none" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.70)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#1C0913", border: "1px solid rgba(240,24,122,0.50)", boxShadow: "0 0 32px rgba(240,24,122,0.25)", borderRadius: 14, padding: 24, fontFamily: POPPINS }}>
        <h3 style={{ color: "#fff", fontWeight: 700, fontSize: 17, margin: "0 0 5px" }}>Report Brand</h3>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontStyle: "italic", margin: "0 0 20px", lineHeight: 1.6 }}>We recommend resolving disputes directly — a quick call or message can solve most issues. If you still need to report, please provide details below.</p>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {INFO_ROW("Brand", deal.brand?.companyName ?? "—")}
          {INFO_ROW("Deal ID", deal.orderId ?? deal.id)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: POPPINS, display: "block", marginBottom: 4 }}>Your Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={INPUT_STYLE} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: POPPINS, display: "block", marginBottom: 4 }}>Reason</label>
            <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 1000))} placeholder="Describe the issue in detail..." rows={5}
              style={{ ...INPUT_STYLE, resize: "none", minHeight: 110 }} />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", textAlign: "right", marginTop: 2 }}>{reason.length}/1000</div>
          </div>
        </div>
        {err && <p style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>{err}</p>}
        {success && <p style={{ color: "#4ade80", fontSize: 12, marginTop: 8 }}>Report submitted. Our team will review and get back to you shortly.</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.80)", fontSize: 13, fontFamily: POPPINS, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={busy || !reason.trim() || !email.trim()}
            style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "#F0187A", border: "none", color: "#fff", fontSize: 13, fontFamily: POPPINS, cursor: busy || !reason.trim() || !email.trim() ? "not-allowed" : "pointer", opacity: busy || !reason.trim() || !email.trim() ? 0.55 : 1, fontWeight: 600 }}>
            {busy ? "Submitting…" : "Submit Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveTab({ deals, apiFetch, onRefresh, chatDealId }: {
  deals: DealRow[];
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
  chatDealId?: string | null;
}) {
  const [openChat, setOpenChat] = useState<string | null>(chatDealId ?? null);
  const [reportDeal, setReportDeal] = useState<DealRow | null>(null);
  const [scriptDeal, setScriptDeal] = useState<DealRow | null>(null);
  useEffect(() => {
    if (!chatDealId) return;
    setOpenChat(chatDealId);
    const timer = setTimeout(() => {
      document.getElementById(`deal-chat-${chatDealId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 600);
    return () => clearTimeout(timer);
  }, [chatDealId]);
  const { serverNow } = useServerTime();
  if (deals.length === 0) return <Empty icon={<Zap size={36} />} message="No live deals right now" sub="Accept a request to get started." />;
  return (
    <>
      {reportDeal && <ReportBrandModal deal={reportDeal} apiFetch={apiFetch} onClose={() => setReportDeal(null)} />}
      {scriptDeal && (
        <DealScriptModal
          aboutProduct={scriptDeal.aboutProduct ?? null}
          reelScript={scriptDeal.reelScript ?? null}
          onClose={() => setScriptDeal(null)}
        />
      )}
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {deals.map(d => (
        <div key={d.id} id={`deal-card-${d.id}`} style={{ background: CARD_BG, borderRadius: 20, border: "1px solid rgba(240,24,122,0.30)", overflow: "hidden" }}>

          {/* Card header */}
          <div style={{ padding: "20px 24px 18px", display: "flex", alignItems: "flex-start", gap: 16 }}>
            <BrandAvatar brand={d.brand} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: "#fff", fontSize: "clamp(15px, 1.5vw, 19px)", fontWeight: 700, margin: 0, fontFamily: POPPINS }}>
                {d.brand?.companyName ?? "Brand"}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(34,197,94,0.14)", borderRadius: 8, padding: "3px 10px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  <span style={{ color: "#22c55e", fontSize: "clamp(10px, 1vw, 12px)", fontWeight: 700, fontFamily: POPPINS }}>LIVE</span>
                </span>
                {d.source === "BARTER" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(251,146,60,0.12)", borderRadius: 8, padding: "3px 10px", border: "1px solid rgba(251,146,60,0.28)" }}>
                    <span style={{ color: "#fb923c", fontSize: "clamp(10px, 1vw, 12px)", fontWeight: 700, fontFamily: POPPINS }}>🎁 Barter Deal</span>
                  </span>
                )}
                {d.source === "CAMPAIGN" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(240,24,122,0.12)", borderRadius: 8, padding: "3px 10px", border: "1px solid rgba(240,24,122,0.25)" }}>
                    <span style={{ color: PINK, fontSize: "clamp(10px, 1vw, 12px)", fontWeight: 700, fontFamily: POPPINS }}>
                      📢 {d.campaignName ?? "Campaign"}
                    </span>
                  </span>
                )}
                {(() => {
                  if (!d.deadlineAt) return null;
                  const now = serverNow ?? Date.now();
                  const msLeft = new Date(d.deadlineAt).getTime() - now;
                  const daysLeft = Math.ceil(msLeft / 86400000);
                  const expired = msLeft <= 0;
                  const urgent = !expired && daysLeft <= 2;
                  const color = expired ? "#f87171" : urgent ? "#fb923c" : "#a78bfa";
                  const bg = expired ? "rgba(239,68,68,0.12)" : urgent ? "rgba(251,146,60,0.12)" : "rgba(167,139,250,0.12)";
                  const border = expired ? "rgba(239,68,68,0.30)" : urgent ? "rgba(251,146,60,0.30)" : "rgba(167,139,250,0.25)";
                  const label = expired ? "Expired" : `${daysLeft}d left`;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: bg, borderRadius: 8, padding: "3px 10px", border: `1px solid ${border}` }}>
                      <span style={{ color, fontSize: "clamp(10px, 1vw, 12px)", fontWeight: 700, fontFamily: POPPINS }}>⏱ {label}</span>
                    </span>
                  );
                })()}
              </div>
            </div>
            <button onClick={() => setReportDeal(d)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: POPPINS, padding: "2px 0", flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F0187A")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
              ⚑ Report
            </button>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Deal info */}
          <div style={{ padding: "20px 24px" }}>
            <DeliverablesSummary d={d} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "16px 28px", marginTop: 18 }}>
              {d.source === "BARTER" ? (
                <InfoLine
                  label="Product Payout"
                  value={[d.barterProductName, d.barterProductValue != null ? `₹${d.barterProductValue.toLocaleString("en-IN")}` : null].filter(Boolean).join(" · ") || "Barter Product"}
                  highlight
                />
              ) : (
                <InfoLine label="Your payout" value={fmt(d.creatorPayout)} highlight />
              )}
              <InfoLine label="Deal Timeline" value={`${d.timelineDays} days`} />
              {d.productRequired && !d.productReceivedAt ? (
                <InfoLine label="Expires on" value="Starts after product confirmation" />
              ) : d.deadlineAt ? (
                <InfoLine label="Expires on" value={new Date(d.deadlineAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} />
              ) : null}
            </div>
            {d.productRequired && !d.productReceivedAt && (
              <p style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.55)", fontFamily: "'Poppins', sans-serif", fontStyle: "italic", lineHeight: 1.5 }}>
                ⏳ Your deal timeline hasn't started yet. It will begin once you confirm the product is received and in good condition.
              </p>
            )}
            <p style={{ marginTop: d.productRequired && !d.productReceivedAt ? 6 : 10, fontSize: 11.5, color: "rgba(255,255,255,0.70)", fontFamily: "'Poppins', sans-serif", lineHeight: 1.5 }}>
              This deal will expire automatically on the deadline. Request a time extension from the brand if you need more time.
            </p>
          </div>

          {/* Functional panels */}
          <div style={{ padding: "0 24px 22px" }}>
            <div style={{ marginBottom: 14 }}>
              <DealProgressBar
                status={d.status}
                productRequired={d.productRequired}
                postedBy={d.postedBy ?? "CREATOR"}
                deliveryAddress={d.deliveryAddress}
                role="CREATOR"
              />
            </div>

            <CreatorAddressForm deal={d} apiFetch={apiFetch} onRefresh={onRefresh} />
            <CreatorProductShipping
              deal={d}
              apiFetch={apiFetch}
              onRefresh={onRefresh}
              onOpenChat={() => {
                setOpenChat(d.id);
                setTimeout(() => document.getElementById(`deal-chat-${d.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
              }}
            />

            <div style={{ marginBottom: 10 }}>
              <DealDeliverablesPanel dealId={d.id} role="CREATOR" apiFetch={apiFetch} onChange={onRefresh} />
            </div>

            <ExtensionPanel deal={d} apiFetch={apiFetch} onRefresh={onRefresh} />

            {/* Collapsible chat */}
            <div style={{ marginTop: 8 }}>
              {d.status === "REVISION_REQUESTED" && (
                <div style={{
                  marginBottom: 8,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(125,183,255,0.12), rgba(240,24,122,0.08))",
                  border: "1px solid rgba(125,183,255,0.20)",
                }}>
                  <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, margin: 0, fontFamily: POPPINS, lineHeight: 1.5 }}>
                    We recommend discussing feedback in the deal chat or on a Google Meet call for better understanding and smoother revisions.
                  </p>
                  <button
                    onClick={() => setOpenChat(d.id)}
                    style={{
                      marginTop: 8,
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid rgba(240,24,122,0.30)",
                      background: "rgba(240,24,122,0.16)",
                      color: "white",
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: POPPINS,
                      cursor: "pointer",
                    }}
                  >
                    Open Deal Chat
                  </button>
                </div>
              )}
              {(d.aboutProduct?.trim() || d.reelScript?.trim()) && (
                <button
                  onClick={() => setScriptDeal(d)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "11px 14px", borderRadius: 12, marginBottom: 8,
                    background: "rgba(240,24,122,0.15)", border: "1px solid rgba(255,255,255,0.08)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.85)", fontSize: "clamp(12px, 1.1vw, 14px)", fontWeight: 600, fontFamily: POPPINS }}>
                    <FileText size={15} />
                    Script
                  </span>
                  <ChevronRight size={15} color="rgba(255,255,255,0.70)" />
                </button>
              )}
              <button
                onClick={() => setOpenChat(openChat === d.id ? null : d.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "11px 14px", borderRadius: 12,
                  background: "rgba(240,24,122,0.15)", border: "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.85)", fontSize: "clamp(12px, 1.1vw, 14px)", fontWeight: 600, fontFamily: POPPINS }}>
                  <MessageCircle size={15} />
                  Deal Chat
                </span>
                {openChat === d.id
                  ? <ChevronUp size={15} color="rgba(255,255,255,0.70)" />
                  : <ChevronDown size={15} color="rgba(255,255,255,0.70)" />}
              </button>
              {openChat === d.id && (
                <div id={`deal-chat-${d.id}`} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 14, marginTop: 6 }}>
                  <DealChat
                    dealId={d.id}
                    currentUserType="CREATOR"
                    apiFetch={apiFetch}
                    dealStatus={d.status}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
    </>
  );
}

// ─── Pending Tab ─────────────────────────────────────────────────────────────
function PendingTab({ requests, pendingPaymentDeals }: { requests: RequestRow[]; pendingPaymentDeals: DealRow[] }) {
  const [, navigate] = useLocation();
  const { serverNow } = useServerTime();

  const isEmpty = requests.length === 0 && pendingPaymentDeals.length === 0;
  if (isEmpty) return <Empty icon={<Clock size={36} />} message="No pending negotiations" sub="When brands send you requests, they will appear here." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Active negotiation requests */}
      {requests.map(r => (
        <div key={r.id} style={{ background: CARD_BG, borderRadius: 20, border: `1px solid ${CARD_BORDER}`, overflow: "hidden" }}>

          {/* Header row */}
          <div style={{ padding: "20px 24px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
              <BrandAvatar brand={r.brand} size={52} />
              <div style={{ minWidth: 0 }}>
                <p style={{ color: "#fff", fontSize: "clamp(15px, 1.5vw, 19px)", fontWeight: 700, margin: 0, fontFamily: POPPINS }}>
                  {r.brand?.companyName ?? "Brand"}
                </p>
                <p style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(11px, 1vw, 13px)", margin: "4px 0 0", fontFamily: POPPINS }}>
                  Round {r.roundNumber} · {timeAgo(r.createdAt)}
                </p>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(10px, 0.9vw, 11px)", margin: "0 0 4px", fontFamily: POPPINS, textTransform: "uppercase", letterSpacing: "0.06em" }}>Expires</p>
              <p style={{ color: "#f59e0b", fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: 700, margin: 0, fontFamily: POPPINS }}>{fmtCountdown(r.expiresAt, serverNow)}</p>
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Deliverables + meta */}
          <div style={{ padding: "20px 24px" }}>
            <DeliverablesSummary d={r} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "16px 28px", marginTop: 18 }}>
              <InfoLine label="Timeline" value={`${r.timelineDays} days`} />
              <InfoLine label="Total value" value={fmt(r.totalValue)} highlight />
            </div>

            {r.brief && (
              <p style={{
                color: "rgba(255,255,255,0.70)",
                fontSize: "clamp(12px, 1.1vw, 14px)",
                margin: "16px 0 0",
                lineHeight: 1.6,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                fontFamily: POPPINS,
              }}>
                {r.brief}
              </p>
            )}
          </div>

          {/* CTA */}
          <div style={{ padding: "0 24px 22px" }}>
            {r.proposedBy === "CREATOR" ? (
              <div style={{
                padding: "14px 16px", borderRadius: 14,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(12px, 1.1vw, 14px)", fontFamily: POPPINS }}>
                  ⏳ Waiting for brand to respond…
                </span>
              </div>
            ) : (
              <button onClick={() => navigate("/home-creator/requests")}
                style={{
                  width: "100%",
                  padding: "clamp(13px, 1.4vw, 17px) 0",
                  borderRadius: 14, border: "none",
                  background: PINK, color: "#fff",
                  fontSize: "clamp(13px, 1.3vw, 16px)", fontWeight: 700,
                  cursor: "pointer", fontFamily: POPPINS, letterSpacing: 0.2,
                }}>
                View & Respond →
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Awaiting brand payment */}
      {pendingPaymentDeals.map(d => (
        <div key={d.id} id={`deal-card-${d.id}`} style={{ background: CARD_BG, borderRadius: 20, border: "1px solid rgba(251,191,36,0.30)", overflow: "hidden" }}>

          <div style={{ padding: "20px 24px 18px", display: "flex", alignItems: "center", gap: 16 }}>
            <BrandAvatar brand={d.brand} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: "#fff", fontSize: "clamp(15px, 1.5vw, 19px)", fontWeight: 700, margin: 0, fontFamily: POPPINS }}>
                {d.brand?.companyName ?? "Brand"}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(251,191,36,0.12)", borderRadius: 8, padding: "3px 10px" }}>
                  <span style={{ color: "#fbbf24", fontSize: "clamp(10px, 1vw, 12px)", fontWeight: 700, fontFamily: POPPINS }}>⏳ Awaiting Brand Payment</span>
                </span>
                {d.source === "CAMPAIGN" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(240,24,122,0.12)", borderRadius: 8, padding: "3px 10px", border: "1px solid rgba(240,24,122,0.25)" }}>
                    <span style={{ color: PINK, fontSize: "clamp(10px, 1vw, 12px)", fontWeight: 700, fontFamily: POPPINS }}>📢 Campaign</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {d.source === "CAMPAIGN" && d.campaignName && (
            <p style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(11px, 1vw, 13px)", margin: "0 24px 12px", fontFamily: POPPINS }}>
              From: <span style={{ color: "rgba(255,255,255,0.90)" }}>{d.campaignName}</span>
            </p>
          )}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          <div style={{ padding: "20px 24px" }}>
            <DeliverablesSummary d={d} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "16px 28px", marginTop: 18 }}>
              <InfoLine label="Your payout" value={fmt(d.creatorPayout)} highlight />
              <InfoLine label="Timeline" value={`${d.timelineDays} days`} />
            </div>
          </div>

          <div style={{ padding: "0 24px 22px" }}>
            <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.18)", display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={15} color="#fbbf24" style={{ flexShrink: 0 }} />
              <span style={{ color: "rgba(255,255,255,0.78)", fontSize: "clamp(12px, 1.1vw, 14px)", fontFamily: POPPINS }}>
                Waiting for the brand to complete payment. Deal goes LIVE once paid.
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── History tab (completed / cancelled) ─────────────────────────────────────
function HistoryTab({ deals, cancelledRequests, tab }: { deals: DealRow[]; cancelledRequests: any[]; tab: Tab }) {
  const totalItems = deals.length + (tab === "cancelled" ? cancelledRequests.length : 0);
  if (totalItems === 0) return (
    <Empty
      icon={tab === "completed" ? <CheckCircle size={36} /> : <XCircle size={36} />}
      message={tab === "completed" ? "No completed deals yet" : "No cancelled deals"}
      sub={tab === "completed" ? "Completed collaborations will appear here." : "Cancelled requests will appear here."}
    />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {deals.map(d => (
        <div key={d.id} id={`deal-card-${d.id}`} style={{ background: CARD_BG, borderRadius: 20, border: `1px solid ${CARD_BORDER}`, overflow: "hidden", opacity: tab === "cancelled" ? 0.75 : 1 }}>
          <div style={{ padding: "20px 24px 18px", display: "flex", alignItems: "center", gap: 16 }}>
            <BrandAvatar brand={d.brand} size={50} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: "#fff", fontSize: "clamp(15px, 1.5vw, 19px)", fontWeight: 700, margin: 0, fontFamily: POPPINS }}>
                {d.brand?.companyName ?? "Brand"}
              </p>
              <p style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(11px, 1vw, 13px)", margin: "4px 0 0", fontFamily: POPPINS }}>
                {timeAgo(d.createdAt)}
              </p>
            </div>
            <StatusBadge status={d.status} />
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          <div style={{ padding: "20px 24px" }}>
            <DeliverablesSummary d={d} />
            {tab === "completed" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "16px 28px", marginTop: 18 }}>
                  {d.source === "BARTER" ? (
                    <InfoLine
                      label="Product Payout"
                      value={[d.barterProductName, d.barterProductValue != null ? `₹${d.barterProductValue.toLocaleString("en-IN")}` : null].filter(Boolean).join(" · ") || "Barter Product"}
                      highlight
                    />
                  ) : (
                    <InfoLine label="Your payout" value={fmt(d.creatorPayout)} highlight />
                  )}
                  <PayoutStatusBadge deal={d} />
                </div>
                {d.disputeWindowEnd && !d.disputeRaised && new Date(d.disputeWindowEnd) > new Date() && (
                  <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)", display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={14} color="#fbbf24" />
                    <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "clamp(11px, 1vw, 13px)", fontFamily: POPPINS }}>
                      Brand has until {new Date(d.disputeWindowEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} to raise a dispute.
                    </span>
                  </div>
                )}
                {(d.postedBy === "CREATOR" || d.postedBy === "BOTH") && ["CONTENT_APPROVED", "COMPLETED", "DISPUTE_WINDOW_OPEN", "FINAL_POST_CONFIRMED"].includes(d.status) && (
                  <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: "rgba(255,180,0,0.12)", border: "1px solid rgba(255,180,0,0.3)" }}>
                    <span style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontFamily: POPPINS, lineHeight: 1.5, display: "block" }}>
                      ⚠️ Important: Do not delete your posted content within 7 days of deal completion. This can lead to your payment being stopped and your account being banned.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      {tab === "cancelled" && cancelledRequests.map(r => (
        <CancelledRequestCard key={r.id} req={r} side="creator" />
      ))}
    </div>
  );
}

function CancelledRequestCard({ req, side }: { req: any; side: "creator" | "brand" }) {
  const partyName = side === "creator" ? (req.brand?.companyName ?? req.brandName ?? "Brand") : (req.creator?.fullName ?? "Creator");
  const partyHandle = side === "creator" ? null : (req.creator?.instagramHandle ?? null);
  const rejectedByLabel = req.rejectedBy === "BRAND" ? "Brand"
    : req.rejectedBy === "CREATOR" ? (side === "creator" ? "You" : "Creator")
    : "Expired (no response in time)";
  const reasonText = req.rejectionReason ?? (req.rejectedBy === "SYSTEM" ? "The negotiation timed out." : "No reason provided.");

  return (
    <div style={{ background: CARD_BG, borderRadius: 20, border: `1px solid ${CARD_BORDER}`, overflow: "hidden", opacity: 0.85 }}>
      <div style={{ padding: "20px 24px 18px", display: "flex", alignItems: "center", gap: 16 }}>
        {side === "creator"
          ? <BrandAvatar brand={req.brand ?? null} size={50} />
          : <div style={{ width: 50, height: 50, borderRadius: "50%", background: req.creator?.profilePhotoUrl ? "transparent" : "rgba(240,24,122,0.12)", border: "1px solid rgba(240,24,122,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: PINK, fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
              {req.creator?.profilePhotoUrl
                ? <img src={req.creator.profilePhotoUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                : (partyName[0] ?? "C").toUpperCase()}
            </div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: "#fff", fontSize: "clamp(15px, 1.5vw, 19px)", fontWeight: 700, margin: 0, fontFamily: POPPINS }}>{partyName}</p>
          <p style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(11px, 1vw, 13px)", margin: "4px 0 0", fontFamily: POPPINS }}>
            {partyHandle ? `@${partyHandle} · ` : ""}{timeAgo(req.respondedAt ?? req.createdAt)}
          </p>
        </div>
        <StatusBadge status={req.status} />
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      <div style={{ padding: "20px 24px" }}>
        <DeliverablesSummary d={{ reelCount: req.reelCount, storyCount: req.storyCount, postCount: req.postCount, pricePerReel: req.pricePerReel, pricePerStory: req.pricePerStory, pricePerPost: req.pricePerPost }} />
        <p style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(12px, 1.1vw, 14px)", margin: "10px 0 0", fontFamily: POPPINS }}>
          Total {fmt(req.totalValue ?? 0)} · Round {req.roundNumber}
        </p>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16, marginTop: 16 }}>
          <p style={{ color: "rgba(239,68,68,0.85)", fontSize: "clamp(10px, 0.9vw, 12px)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", margin: "0 0 6px", fontFamily: POPPINS }}>
            Cancelled by {rejectedByLabel}
          </p>
          <p style={{ color: "rgba(255,255,255,0.90)", fontSize: "clamp(13px, 1.2vw, 15px)", margin: 0, lineHeight: 1.55, fontFamily: POPPINS }}>
            {reasonText}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Reusable sub-components ─────────────────────────────────────────────────
function DeliverablesSummary({ d }: { d: Pick<DealRow, "reelCount" | "storyCount" | "postCount" | "pricePerReel" | "pricePerStory" | "pricePerPost"> }) {
  const items = [
    d.reelCount > 0   && { emoji: "🎬", label: "Reel",  count: d.reelCount,  price: d.pricePerReel },
    d.storyCount > 0  && { emoji: "📖", label: "Story", count: d.storyCount, price: d.pricePerStory },
    d.postCount > 0   && { emoji: "🖼️", label: "Photo", count: d.postCount,  price: d.pricePerPost },
  ].filter(Boolean) as { emoji: string; label: string; count: number; price: number | null }[];

  if (items.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
          padding: "8px 16px",
        }}>
          <div style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(10px, 0.9vw, 11px)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: POPPINS }}>
            {item.emoji} {item.count} {item.count > 1 ? (item.label === "Story" ? "Stories" : item.label + "s") : item.label}
          </div>
          {item.price != null && item.price > 0 && (
            <div style={{ color: "#fff", fontSize: "clamp(14px, 1.3vw, 17px)", fontWeight: 700, fontFamily: POPPINS, marginTop: 4 }}>
              {fmt(item.price)}<span style={{ color: "rgba(255,255,255,0.70)", fontWeight: 400, fontSize: "clamp(10px, 0.9vw, 12px)" }}> /ea</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PayoutStatusBadge({ deal }: { deal: DealRow }) {
  const s = deal.payoutStatus;
  const inDisputeWindow = deal.status === "DISPUTE_WINDOW_OPEN";
  const creatorPosts = deal.postedBy === "CREATOR" || deal.postedBy === "BOTH";
  const disputeWindowLabel = creatorPosts ? "Dispute Window Open" : "Releases after 7 days";
  const label = s === "RELEASED" ? "Paid" : s === "PENDING_KYC" ? "KYC required" : deal.disputeRaised ? "Frozen — dispute" : inDisputeWindow ? disputeWindowLabel : "Pending release";
  const color = s === "RELEASED" ? "#22c55e" : s === "PENDING_KYC" ? "#f59e0b" : deal.disputeRaised ? "#ef4444" : inDisputeWindow ? "#fb923c" : "rgba(255,255,255,0.75)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(10px, 0.9vw, 12px)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, fontFamily: POPPINS }}>Payment</span>
      <span style={{ color, fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: 600, fontFamily: POPPINS }}>{label}</span>
      {inDisputeWindow && creatorPosts && (
        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "clamp(10px, 0.85vw, 11px)", fontFamily: POPPINS, lineHeight: 1.4, marginTop: 2 }}>
          Your payout will be processed once the 7-day dispute window closes with no disputes raised.
        </span>
      )}
    </div>
  );
}

function InfoLine({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(10px, 0.9vw, 12px)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, fontFamily: POPPINS }}>
        {label}
      </span>
      <span style={{ color: highlight ? PINK : "rgba(255,255,255,0.90)", fontSize: "clamp(15px, 1.4vw, 19px)", fontWeight: highlight ? 700 : 500, fontFamily: POPPINS }}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, [string, string, string]> = {
    COMPLETED:        ["#22c55e", "rgba(34,197,94,0.12)",      "Completed"],
    CONTENT_APPROVED: ["#22c55e", "rgba(34,197,94,0.12)",      "Completed"],
    CANCELLED:        ["#9ca3af", "rgba(156,163,175,0.12)",    "Cancelled"],
    REJECTED:         ["#ef4444", "rgba(239,68,68,0.12)",      "Rejected"],
    EXPIRED:          ["#9ca3af", "rgba(156,163,175,0.12)",    "Expired"],
    LIVE:             ["#22c55e", "rgba(34,197,94,0.12)",      "Live"],
    DISPUTED:         ["#f87171", "rgba(248,113,113,0.12)",    "Disputed"],
    DISPUTE_WINDOW_OPEN: ["#22c55e", "rgba(34,197,94,0.12)",  "Completed"],
  };
  const [color, bg, label] = cfg[status] ?? ["#9ca3af", "rgba(156,163,175,0.12)", status.replace(/_/g, " ")];
  return (
    <span style={{
      marginLeft: "auto", flexShrink: 0,
      padding: "5px 14px", borderRadius: 10,
      background: bg, color,
      fontSize: "clamp(11px, 1vw, 13px)", fontWeight: 700, fontFamily: POPPINS,
    }}>
      {label}
    </span>
  );
}

function BrandAvatar({ brand, size = 40 }: { brand: Brand | null; size?: number }) {
  const [err, setErr] = useState(false);
  const initial = brand?.companyName?.trim()[0]?.toUpperCase() ?? "B";
  if (brand?.logoUrl && !err) {
    return (
      <img src={brand.logoUrl} alt={brand.companyName ?? "brand"} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255,255,255,0.12)" }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "rgba(240,24,122,0.12)", border: "1px solid rgba(240,24,122,0.25)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: PINK, fontSize: size * 0.38, fontWeight: 700, fontFamily: POPPINS,
    }}>{initial}</div>
  );
}

function Empty({ icon, message, sub }: { icon: React.ReactNode; message: string; sub: string }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ color: "rgba(255,255,255,0.50)", display: "flex", justifyContent: "center", marginBottom: 18 }}>{icon}</div>
      <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "clamp(15px, 1.4vw, 18px)", fontWeight: 600, margin: "0 0 8px", fontFamily: POPPINS }}>{message}</p>
      <p style={{ color: "rgba(255,255,255,0.70)", fontSize: "clamp(12px, 1.1vw, 14px)", fontFamily: POPPINS }}>{sub}</p>
    </div>
  );
}

// suppress unused import warning
void BG;
