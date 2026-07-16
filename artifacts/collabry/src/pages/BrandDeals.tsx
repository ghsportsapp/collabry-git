import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useServerTime, fmtCountdown } from "@/hooks/useServerTime";
import { Clock, Handshake, Check, X as XIcon, Eye, ChevronRight, MessageCircle, ChevronDown, ChevronUp, Package, PackageCheck, Truck, FileText, CalendarClock } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { useSupportEmail } from "@/hooks/useSupportEmail";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";
import DealScriptModal, { hasDealScript } from "@/components/DealScriptModal";
import DealChat from "@/components/DealChat";
import DealDeliverablesPanel from "@/components/DealDeliverablesPanel";
import DealProgressBar from "@/components/DealProgressBar";
import RatingPopup from "@/components/RatingPopup";

type Tab = "live" | "pending" | "completed" | "cancelled";
type ModalAction = "review" | "counter-back" | "reject" | null;

interface RequestRow {
  id: string;
  status: string;
  reelCount: number; storyCount: number; postCount: number;
  pricePerReel: number; pricePerStory: number; pricePerPost: number;
  totalValue: number;
  timelineDays: number;
  expiresAt: string;
  createdAt: string;
  roundNumber: number;
  proposedBy: string;
  creator: { id: string; fullName: string; instagramHandle: string; profilePhotoUrl: string | null; followerCount: number };
  slab: { reelMin: number; reelMax: number; storyMin: number; storyMax: number; postMin: number; postMax: number };
}

interface DealRow {
  id: string;
  orderId?: string | null;
  status: string;
  source?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  reelCount: number; storyCount: number; postCount: number;
  pricePerReel: number; pricePerStory: number; pricePerPost: number;
  subtotal: number; gstAmount: number; totalPayable: number; creatorPayout: number; commissionRate: number; gstRate: number;
  timelineDays: number; deadlineAt: string | null; createdAt: string;
  paymentReferenceId: string | null;
  productRequired: boolean; productShippedAt: string | null; productReceivedAt: string | null;
  awbNumber: string | null; courierName: string | null; shipDate: string | null;
  deliveryAddress: string | null;
  deliveryAddressPhone: string | null;
  disputeWindowEnd: string | null; disputeRaised: boolean;
  // Shipping/issue/AWB/non-delivery state
  addressLocked?: boolean | null;
  awbLocked?: boolean | null;
  awbWrongDeadline?: string | null;
  awbWrongRaisedAt?: string | null;
  productIssueRaised?: boolean | null;
  productIssueResponse?: string | null;
  productIssueImages?: string[] | null;
  productIssueDescription?: string | null;
  creatorIssueDecision?: string | null;
  brandResponseDeadline?: string | null;
  reshipCount?: number | null;
  makeItOptionAvailable?: boolean | null;
  awbCorrectionCount?: number | null;
  awbCorrectionLimit?: number | null;
  brandResponseHours?: number | null;
  nonDeliveryReportedAt?: string | null;
  nonDeliveryResolution?: string | null;
  productIssueStatus?: string | null;
  aboutProduct?: string | null;
  reelScript?: string | null;
  storyScript?: string | null;
  postContent?: string | null;
  creator: { id: string; fullName: string; instagramHandle: string; profilePhotoUrl: string | null; followerCount: number } | null;
  postedBy?: string | null;
}


const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live Deal" },
  { id: "pending", label: "Pending Deal" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

export default function BrandDeals() {
  const { brandId, brandName, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const { total: credits } = useBrandCredits();
  const [tab, setTab] = useState<Tab>(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return (["live", "pending", "completed", "cancelled"].includes(p ?? "") ? p : "live") as Tab;
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
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [pendingPaymentDeals, setPendingPaymentDeals] = useState<DealRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [cancelledRequests, setCancelledRequests] = useState<any[]>([]);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedReq, setSelectedReq] = useState<RequestRow | null>(null);
  const [chain, setChain] = useState<RequestRow[]>([]);
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading, navigate]);

  useEffect(() => {
    if (!brandId) return;
  }, [brandId, apiFetch]);

  // Keep a stable ref to apiFetch so token refreshes don't recreate `load`
  // and accidentally trigger a non-silent reload that unmounts DealsList.
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => { apiFetchRef.current = apiFetch; }, [apiFetch]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!brandId) return;
    if (!opts?.silent) setLoading(true);
    try {
      const r = await apiFetchRef.current(`/api/brand/deals?tab=${tab}`);
      if (r.ok) {
        const d = await r.json();
        setRequests(d.requests ?? []);
        setPendingPaymentDeals(d.pendingPaymentDeals ?? []);
        setDeals(d.deals ?? []);
        setCancelledRequests(d.cancelledRequests ?? []);
      }
    } finally { if (!opts?.silent) setLoading(false); }
  }, [brandId, tab]);

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

  const goToPaymentReturn = (dealId: string, totalPayable: any, orderId: any, fallback: number) => {
    const params = new URLSearchParams({ status: "CHARGED", context: "deal", dealId, amount: String(totalPayable ?? fallback), orderId: orderId ?? "" });
    navigate(`/payment-return?${params.toString()}`);
  };

  const handleSimulatePayment = async (dealId: string, _amount: number) => {
    setPaying(dealId);
    setError(null);
    try {
      const r = await apiFetch(`/api/brand/deals/${dealId}/simulate-payment`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Payment failed"); setPaying(null); return; }

      // Gateway configured → open Razorpay, then verify to activate escrow.
      if (d.orderId && d.keyId) {
        const opened = await openRazorpayCheckout({
          key: d.keyId, orderId: d.orderId, amount: d.amount, currency: d.currency ?? "INR",
          description: "Deal payment (held in escrow)",
          prefill: brandName ? { name: brandName } : undefined,
          onSuccess: async (resp) => {
            try {
              const vr = await apiFetch(`/api/brand/deals/${dealId}/verify-payment`, {
                method: "POST",
                body: JSON.stringify({
                  razorpay_order_id: resp.razorpay_order_id,
                  razorpay_payment_id: resp.razorpay_payment_id,
                  razorpay_signature: resp.razorpay_signature,
                }),
              });
              const vd = await vr.json();
              if (vr.ok && vd.ok) { goToPaymentReturn(dealId, vd.totalPayable, vd.orderId, _amount); }
              else { setError(vd.error ?? "Payment verification failed. If money was deducted it will reflect shortly."); setPaying(null); }
            } catch (e: any) { setError(e?.message ?? "Could not verify payment."); setPaying(null); }
          },
          onDismiss: () => setPaying(null),
          onFailure: (m) => { setError(m); setPaying(null); },
        });
        if (!opened) { setError("Could not load the payment gateway. Check your connection and try again."); setPaying(null); }
        return;
      }

      // No gateway (stub) — already activated server-side.
      goToPaymentReturn(dealId, d.totalPayable, d.orderId, _amount);
    } catch (e: any) { setError(e.message ?? "Payment failed"); setPaying(null); }
  };

  const openReview = async (req: RequestRow) => {
    setSelectedReq(req);
    setModalAction("review");
    setModalError(null);
    const chainRes = await apiFetch(`/api/brand/requests/${req.id}`).catch(() => null);
    if (chainRes?.ok) { const d = await chainRes.json(); setChain(d.chain ?? []); }
  };

  const closeModal = () => { setSelectedReq(null); setModalAction(null); setChain([]); setModalError(null); };

  const doAction = async (endpoint: string, body?: object) => {
    if (!selectedReq) return;
    setModalError(null);
    const r = await apiFetch(`/api/brand/requests/${selectedReq.id}/${endpoint}`, {
      method: "POST", body: body ? JSON.stringify(body) : undefined,
    });
    if (r.ok) { closeModal(); await load({ silent: true }); }
    else { const d = await r.json(); setModalError(d.error ?? "Action failed"); }
  };

  if (authLoading || !brandId) return null;

  return (
    <BrandLayout credits={credits}>
      <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 pt-5 lg:pt-6 pb-8">
        <div className="mb-6 text-center">
          <h1 className="text-white text-2xl sm:text-3xl font-bold mb-1.5" style={{ fontFamily: POPPINS }}>
            Here are your <span style={{ color: PINK }}>deals</span>
          </h1>
          <p className="text-white/70 text-xs sm:text-sm" style={{ fontFamily: POPPINS }}>Manage your active deals, pending requests and history.</p>
        </div>

        {/* Tabs — full width, evenly spaced */}
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="py-2.5 rounded-full text-[11px] sm:text-[12px] font-semibold text-center"
              style={{
                background: tab === t.id ? PINK : "rgba(255,255,255,0.06)",
                color: "white", border: `1px solid ${tab === t.id ? PINK : "rgba(255,255,255,0.10)"}`,
                fontFamily: POPPINS,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Deal flow tutorial dropdown */}
        <TutorialDropdown apiFetch={apiFetch} />

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg text-red-300 text-xs" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0,1,2].map(i => <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}
          </div>
        ) : tab === "pending" ? (
          <PendingTab
            requests={requests}
            pendingPaymentDeals={pendingPaymentDeals}
            paying={paying}
            onSimulatePayment={handleSimulatePayment}
            onReviewRequest={openReview}
          />
        ) : tab === "live" ? (
          <DealsList deals={deals} variant="live" apiFetch={apiFetch} onRefresh={() => load({ silent: true })} chatDealId={chatDealId} />
        ) : tab === "completed" ? (
          <DealsList deals={deals} variant="completed" apiFetch={apiFetch} onRefresh={() => load({ silent: true })} />
        ) : (
          <DealsList deals={deals} variant="cancelled" apiFetch={apiFetch} onRefresh={() => load({ silent: true })} cancelledRequests={cancelledRequests} />
        )}
      </div>

      {/* ── Modals ── */}
      {selectedReq && modalAction === "review" && (
        <ReviewModal
          req={selectedReq}
          chain={chain}
          error={modalError}
          onClose={closeModal}
          onAccept={() => doAction("accept-counter")}
          onCounterBack={() => { setModalAction("counter-back"); setModalError(null); }}
          onStayOnOriginal={() => doAction("stay-on-original")}
          onReject={() => { setModalAction("reject"); setModalError(null); }}
        />
      )}
      {selectedReq && modalAction === "counter-back" && (
        <CounterBackModal
          req={selectedReq}
          chain={chain}
          error={modalError}
          onClose={closeModal}
          onBack={() => setModalAction("review")}
          onSubmit={(body) => doAction("counter-back", body)}
        />
      )}
      {selectedReq && modalAction === "reject" && (
        <RejectModal
          req={selectedReq}
          error={modalError}
          onClose={closeModal}
          onBack={() => setModalAction("review")}
          onSubmit={() => doAction("reject")}
        />
      )}
    </BrandLayout>
  );
}

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

function humanizeStatus(s: string): string {
  const map: Record<string, string> = {
    IN_ESCROW: "In Escrow", CONCEPT_SUBMITTED: "Concept Submitted", CONCEPT_APPROVED: "Concept Approved",
    REVISION_REQUESTED: "Revision Requested", PRODUCT_SHIPPED: "Product Shipped",
    PRODUCT_RECEIVED: "Product Received", PRODUCT_ISSUE_RAISED: "Product Issue", IN_PROGRESS: "In Progress",
    AWAITING_CREATOR_ISSUE_DECISION: "Awaiting Creator", NON_DELIVERY_REPORTED: "Non-Delivery Reported",
    CONTENT_UPLOADED: "Content Uploaded", CONTENT_APPROVED: "Completed",
    POST_LIVE_PENDING: "Post Pending", URL_FLAGGED: "Post Flagged",
    DISPUTE_WINDOW_OPEN: "Dispute Window", FINAL_POST_CONFIRMED: "Photos Confirmed",
    COMPLETED: "Completed", CANCELLED: "Cancelled", DISPUTED: "Disputed",
  };
  return map[s] ?? s.replace(/_/g, " ");
}

function ViewOrderModal({ deal, onClose }: { deal: DealRow; onClose: () => void }) {
  const INR = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const { serverNow } = useServerTime();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0"
          style={{ background: "#15151D", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h3 className="text-white font-bold text-base">Order Details</h3>
            {(deal.source === "CAMPAIGN" || deal.source === "BARTER") && deal.campaignName && (
              <p className="text-[11px] mt-0.5" style={{ color: PINK }}>{deal.source === "BARTER" ? "Barter" : "Campaign"}: {deal.campaignName}</p>
            )}
          </div>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Creator */}
          <div className="flex items-center gap-3 py-1">
            <Avatar url={deal.creator?.profilePhotoUrl} name={deal.creator?.fullName ?? "Creator"} />
            <div>
              <p className="text-white font-semibold text-sm">{deal.creator?.fullName ?? "Creator"}</p>
              <p className="text-white/70 text-[11px]">@{deal.creator?.instagramHandle ?? "—"}</p>
            </div>
          </div>

          {/* Deliverables */}
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-2">Deliverables</p>
            {deal.reelCount > 0 && (
              <div className="flex justify-between text-[12px] py-0.5">
                <span className="text-white/90">{deal.reelCount} {deal.reelCount === 1 ? "Reel" : "Reels"}</span>
                <span className="text-white font-semibold">{INR(deal.pricePerReel)} / reel · {INR(deal.reelCount * deal.pricePerReel)}</span>
              </div>
            )}
            {deal.storyCount > 0 && (
              <div className="flex justify-between text-[12px] py-0.5">
                <span className="text-white/90">{deal.storyCount} {deal.storyCount === 1 ? "Story" : "Stories"}</span>
                <span className="text-white font-semibold">{INR(deal.pricePerStory)} / story · {INR(deal.storyCount * deal.pricePerStory)}</span>
              </div>
            )}
            {deal.postCount > 0 && (
              <div className="flex justify-between text-[12px] py-0.5">
                <span className="text-white/90">{deal.postCount} {deal.postCount === 1 ? "Post" : "Posts"}</span>
                <span className="text-white font-semibold">{INR(deal.pricePerPost)} / post · {INR(deal.postCount * deal.pricePerPost)}</span>
              </div>
            )}
          </div>

          {/* Payment */}
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-2">Payment Breakdown</p>
            <Row label="Subtotal" value={INR(deal.subtotal)} />
            <Row label={`GST (${deal.gstRate ?? 18}%)`} value={INR(deal.gstAmount)} />
            <Row label="Total Paid" value={INR(deal.totalPayable)} bold />
          </div>

          {/* Timeline */}
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-2">Timeline</p>
            <Row label="Deal Timeline" value={`${deal.timelineDays} days`} />
            <Row label="Started" value={new Date(deal.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} muted />
            {deal.productRequired && !deal.productReceivedAt ? (
              <Row label="Expires on" value="Starts after product confirmation" muted />
            ) : deal.deadlineAt ? (() => {
              const msLeft = new Date(deal.deadlineAt).getTime() - Date.now();
              const daysLeft = Math.ceil(msLeft / 86400000);
              const expired = msLeft <= 0;
              const urgent = !expired && daysLeft <= 2;
              const color = expired ? "#f87171" : urgent ? "#fb923c" : "rgba(255,255,255,0.90)";
              return (
                <>
                  <Row label="Expires on" value={new Date(deal.deadlineAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} />
                  <p style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color, fontFamily: "'Poppins', sans-serif" }}>
                    {expired ? "⚠ Deal has expired" : `⏱ ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`}
                  </p>
                </>
              );
            })() : null}
            {deal.productRequired && deal.productShippedAt && !deal.productReceivedAt && (
              <p style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.55)", fontFamily: "'Poppins', sans-serif", fontStyle: "italic", lineHeight: 1.5 }}>
                ⏳ Deal timeline hasn't started yet. It will begin once the creator confirms they've received the product in good condition.
              </p>
            )}
            <p style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.70)", fontFamily: "'Poppins', sans-serif", lineHeight: 1.5 }}>
              This deal will expire automatically on the deadline. The creator can request a time extension, which you can approve or reject.
            </p>
          </div>

          {/* Shipping */}
          {deal.productRequired && (
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-2">Product & Shipping</p>
              {deal.productShippedAt
                ? <Row label="Shipped" value={deal.shipDate ?? new Date(deal.productShippedAt).toLocaleDateString("en-IN")} />
                : <Row label="Status" value="Not yet shipped" muted />
              }
              {deal.courierName && <Row label="Courier" value={deal.courierName} />}
              {deal.awbNumber && <Row label="AWB / Tracking" value={deal.awbNumber} />}
              {deal.deliveryAddress && (
                <div className="mt-1.5">
                  <p className="text-white/70 text-[10px] mb-0.5">Delivery Address</p>
                  <p className="text-white/75 text-[11px] leading-snug">{deal.deliveryAddress}</p>
                  {deal.deliveryAddressPhone && (
                    <p className="text-white/60 text-[11px] mt-0.5">📞 {deal.deliveryAddressPhone}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PendingTab ──
function PendingTab({ requests, pendingPaymentDeals, paying, onSimulatePayment, onReviewRequest }: {
  requests: RequestRow[];
  pendingPaymentDeals: DealRow[];
  paying: string | null;
  onSimulatePayment: (id: string, amount: number) => void;
  onReviewRequest: (req: RequestRow) => void;
}) {
  if (requests.length === 0 && pendingPaymentDeals.length === 0) {
    return <Empty message="No pending requests or unpaid deals." />;
  }
  return (
    <div className="space-y-5">
      {pendingPaymentDeals.map(d => (
        <div key={d.id} id={`deal-card-${d.id}`} className="rounded-2xl p-4" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.30)" }}>
          <div className="flex items-center gap-3 mb-3">
            <Avatar url={d.creator?.profilePhotoUrl} name={d.creator?.fullName ?? "Creator"} />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>{d.creator?.fullName ?? "Creator"}</p>
              <p className="text-white/75 text-[11px] truncate" style={{ fontFamily: POPPINS }}>@{d.creator?.instagramHandle ?? "—"}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: PINK, fontFamily: POPPINS }}>AWAITING PAYMENT</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/90 mb-3" style={{ fontFamily: POPPINS }}>
            {d.reelCount > 0 && <span>{d.reelCount} Reels</span>}
            {d.storyCount > 0 && <span>{d.storyCount} Stories</span>}
            {d.postCount > 0 && <span>{d.postCount} Posts</span>}
          </div>
          <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(0,0,0,0.30)" }}>
            <Row label="Subtotal" value={`₹${d.subtotal.toLocaleString("en-IN")}`} />
            <Row label={`GST (${d.gstRate ?? 18}%)`} value={`₹${d.gstAmount.toLocaleString("en-IN")}`} />
            <Row label="Total Payable" value={`₹${d.totalPayable.toLocaleString("en-IN")}`} bold />
          </div>
          <button onClick={() => onSimulatePayment(d.id, d.totalPayable)} disabled={paying === d.id}
            className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: PINK, fontFamily: POPPINS }}>
            {paying === d.id ? "Processing..." : `Pay · ₹${d.totalPayable.toLocaleString("en-IN")}`}
          </button>
          <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.75)", fontFamily: POPPINS, marginTop: 8 }}>
            🔒 Your money is safe. If the deal is cancelled, you get a full refund — no questions asked.
          </p>
        </div>
      ))}

      {requests.map(r => <RequestCard key={r.id} r={r} onReview={onReviewRequest} />)}
    </div>
  );
}

// ── RequestCard (pending collab row) ──
function RequestCard({ r, onReview }: { r: RequestRow; onReview: (req: RequestRow) => void }) {
  const { serverNow } = useServerTime();
  const remaining = new Date(r.expiresAt).getTime() - serverNow;
  const expired = remaining <= 0;
  const hours = Math.floor(remaining / 3600_000);
  const mins = Math.floor((remaining % 3600_000) / 60_000);
  const fromCreator = r.proposedBy === "CREATOR";

  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${fromCreator ? "rgba(245,158,11,0.40)" : "rgba(255,255,255,0.08)"}` }}>
      <div className="flex items-center gap-3 mb-3">
        <Avatar url={r.creator.profilePhotoUrl} name={r.creator.fullName} />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>{r.creator.fullName}</p>
          <p className="text-white/75 text-[11px] truncate" style={{ fontFamily: POPPINS }}>@{r.creator.instagramHandle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
          style={{ background: fromCreator ? "#f59e0b" : "rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
          {fromCreator ? "RESPOND NOW" : `R${r.roundNumber} SENT`}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/75 mb-2" style={{ fontFamily: POPPINS }}>
        {r.reelCount > 0 && <span>{r.reelCount} Reels @ ₹{r.pricePerReel}</span>}
        {r.storyCount > 0 && <span>{r.storyCount} Stories @ ₹{r.pricePerStory}</span>}
        {r.postCount > 0 && <span>{r.postCount} Posts @ ₹{r.pricePerPost}</span>}
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-white text-sm font-bold" style={{ fontFamily: POPPINS }}>₹{r.totalValue.toLocaleString("en-IN")}</span>
        <span className="text-white/75 text-[10px] flex items-center gap-1" style={{ fontFamily: POPPINS }}>
          <Clock className="w-3 h-3" />
          {expired ? "Expired" : hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`}
        </span>
      </div>
      <button onClick={() => onReview(r)}
        className="w-full py-2 rounded-full text-white text-xs font-semibold flex items-center justify-center gap-1.5"
        style={{ background: fromCreator ? PINK : "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <Eye className="w-3.5 h-3.5" />
        See Offer
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── ReviewModal — shows counter details + brand action buttons ──
function ReviewModal({ req, chain, error, onClose, onAccept, onCounterBack, onStayOnOriginal, onReject }: {
  req: RequestRow; chain: RequestRow[]; error: string | null; onClose: () => void;
  onAccept: () => void; onCounterBack: () => void; onStayOnOriginal: () => void; onReject: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [staying, setStaying] = useState(false);
  const fromCreator = req.proposedBy === "CREATOR";
  const isFinal = req.roundNumber >= 3;

  const { serverNow } = useServerTime();
  const expired = new Date(req.expiresAt).getTime() < serverNow;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-lg flex flex-col rounded-2xl"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS, maxHeight: "90vh" }}>

        {/* Fixed header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h3 className="text-white font-bold text-base">{fromCreator ? "Creator Counter-Offer" : "Negotiation"} · Round {req.roundNumber}</h3>
            <p className="text-white/70 text-[11px]">{req.creator.fullName} (@{req.creator.instagramHandle})</p>
          </div>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>

        {/* Scrollable body — chain history + status only */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {chain.length > 0 && (
            <div className="space-y-2 mb-4">
              {chain.map(c => (
                <div key={c.id} className="rounded-xl p-3"
                  style={{ background: c.proposedBy === "BRAND" ? "rgba(240,24,122,0.08)" : "rgba(34,197,94,0.08)", border: `1px solid ${c.proposedBy === "BRAND" ? "rgba(240,24,122,0.25)" : "rgba(34,197,94,0.25)"}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold" style={{ color: c.proposedBy === "BRAND" ? PINK : "#22c55e" }}>
                      Round {c.roundNumber} · {c.proposedBy === "BRAND" ? "You" : req.creator.fullName}
                    </span>
                    <span className="text-white/70 text-[10px]">{new Date(c.createdAt).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/75 mb-1">
                    {c.reelCount > 0 && <span>{c.reelCount} Reels @ ₹{c.pricePerReel}</span>}
                    {c.storyCount > 0 && <span>{c.storyCount} Stories @ ₹{c.pricePerStory}</span>}
                    {c.postCount > 0 && <span>{c.postCount} Posts @ ₹{c.pricePerPost}</span>}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white font-bold">₹{c.totalValue.toLocaleString("en-IN")}</span>
                    <span className="text-white/75">{c.timelineDays} days</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!fromCreator && (
            <p className="text-center text-white/75 text-sm py-4">Waiting for creator to respond…</p>
          )}
          {expired && <p className="text-amber-300 text-xs text-center">⚠ This request has expired</p>}
        </div>

        {/* Fixed footer — action buttons always visible */}
        {fromCreator && !expired && (
          <div className="flex-shrink-0 px-5 pt-3 pb-5 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-white/80 text-[11px] mb-2">Choose how to respond to the creator's counter:</p>
            {error && <p className="text-red-400 text-xs mb-2 text-center">{error}</p>}

            <button disabled={accepting}
              onClick={async () => { setAccepting(true); await onAccept(); setAccepting(false); }}
              className="w-full py-2 rounded-full text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "#22c55e" }}>
              <Check className="w-4 h-4" />
              {accepting ? "Accepting..." : `Accept Counter · ₹${req.totalValue.toLocaleString("en-IN")}`}
            </button>

            {!isFinal && (
              <button onClick={onCounterBack}
                className="w-full py-2 rounded-full text-white text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: PINK }}>
                Counter-Back (Round {req.roundNumber + 1})
              </button>
            )}

            {!isFinal && (
              <button disabled={staying}
                onClick={async () => { setStaying(true); await onStayOnOriginal(); setStaying(false); }}
                className="w-full py-2 rounded-full text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                {staying ? "Sending..." : "Hold Original Offer (Final)"}
              </button>
            )}

            <button onClick={onReject}
              className="w-full py-2 rounded-full text-sm font-semibold flex items-center justify-center gap-2"
              style={{ color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <XIcon className="w-4 h-4" /> Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CounterBackModal — brand counter-back form ──
function CounterBackModal({ req, chain, error, onClose, onBack, onSubmit }: {
  req: RequestRow; chain: RequestRow[]; error: string | null;
  onClose: () => void; onBack: () => void; onSubmit: (body: any) => void;
}) {
  const round1 = chain.find(c => c.roundNumber === 1) ?? req;

  const [reelCount, setReelCount] = useState(req.reelCount);
  const [storyCount, setStoryCount] = useState(req.storyCount);
  const [postCount, setPostCount] = useState(req.postCount);
  const [pricePerReel, setPricePerReel] = useState(req.pricePerReel);
  const [pricePerStory, setPricePerStory] = useState(req.pricePerStory);
  const [pricePerPost, setPricePerPost] = useState(req.pricePerPost);
  const [timelineStr, setTimelineStr] = useState(String(req.timelineDays));
  const [submitting, setSubmitting] = useState(false);

  const timelineDays = parseInt(timelineStr) || 0;
  const slab = req.slab ?? { reelMin: 0, reelMax: 999999, storyMin: 0, storyMax: 999999, postMin: 0, postMax: 999999 };
  const total = reelCount * pricePerReel + storyCount * pricePerStory + postCount * pricePerPost;
  const someDeliverable = reelCount + storyCount + postCount > 0;
  const inRange = (v: number, mn: number, mx: number) => v >= mn && v <= mx;
  const validReel = reelCount === 0 || inRange(pricePerReel, slab.reelMin, slab.reelMax);
  const validStory = storyCount === 0 || inRange(pricePerStory, slab.storyMin, slab.storyMax);
  const validPost = postCount === 0 || inRange(pricePerPost, slab.postMin, slab.postMax);
  const withinOrig = reelCount <= round1.reelCount && storyCount <= round1.storyCount && postCount <= round1.postCount;
  // Brand can decrease timeline but not below Round 1 original
  const timelineEmpty = timelineStr.trim() === "";
  const validTimeline = !timelineEmpty && timelineDays >= round1.timelineDays && timelineDays <= req.timelineDays;
  const identical = reelCount === req.reelCount && storyCount === req.storyCount && postCount === req.postCount &&
    pricePerReel === req.pricePerReel && pricePerStory === req.pricePerStory && pricePerPost === req.pricePerPost && timelineDays === req.timelineDays;
  const canSend = someDeliverable && validReel && validStory && validPost && withinOrig && validTimeline && !identical;

  const handleSubmit = async () => {
    setSubmitting(true);
    try { await onSubmit({ reelCount, storyCount, postCount, pricePerReel, pricePerStory, pricePerPost, timelineDays }); }
    finally { setSubmitting(false); }
  };

  const INP = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>

        <div className="flex items-center justify-between mb-3 sticky top-0 -mx-5 px-5 pb-2" style={{ background: "#15151D" }}>
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="text-white/75 hover:text-white text-xs">← Back</button>
            <h3 className="text-white font-bold text-base">Counter-Back · Round {req.roundNumber + 1}</h3>
          </div>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>

        <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.20)" }}>
          <p className="text-white/90 text-[10px] uppercase font-semibold mb-1">Creator counter (Round {req.roundNumber})</p>
          <p className="text-white text-xs">₹{req.totalValue.toLocaleString("en-IN")} · {req.reelCount}R {req.storyCount}S {req.postCount}P · {req.timelineDays} days</p>
        </div>

        {(() => {
          const thisRound = req.roundNumber + 1;
          const isFinalRound = thisRound >= 3;
          const remainingForCreator = 3 - thisRound;
          return (
            <div className="rounded-lg p-2.5 mb-3" style={{
              background: isFinalRound ? "rgba(245,158,11,0.10)" : "rgba(59,130,246,0.08)",
              border: `1px solid ${isFinalRound ? "rgba(245,158,11,0.30)" : "rgba(59,130,246,0.20)"}`,
            }}>
              <p className="text-[11px] font-semibold" style={{ color: isFinalRound ? "#FFCB7A" : "#7DB7FF", fontFamily: POPPINS }}>
                {isFinalRound
                  ? "⚠️ This is the final round — creator can only accept or reject after this."
                  : `ℹ️ Round ${thisRound} of 3 — creator has ${remainingForCreator} more counter-offer${remainingForCreator !== 1 ? "s" : ""} available after this.`}
              </p>
            </div>
          );
        })()}

        <p className="text-white/75 text-[10.5px] mb-3 leading-relaxed">
          Rules: counts must be ≤ your original Round 1. Prices within slab. Timeline can be reduced (min: your original {round1.timelineDays} days). Cannot be identical.
        </p>

        {[{ label: "REELS", count: reelCount, setCount: setReelCount, maxCount: round1.reelCount, price: pricePerReel, setPrice: setPricePerReel, min: slab.reelMin, max: slab.reelMax, valid: validReel },
          { label: "STORIES", count: storyCount, setCount: setStoryCount, maxCount: round1.storyCount, price: pricePerStory, setPrice: setPricePerStory, min: slab.storyMin, max: slab.storyMax, valid: validStory },
          { label: "POSTS", count: postCount, setCount: setPostCount, maxCount: round1.postCount, price: pricePerPost, setPrice: setPricePerPost, min: slab.postMin, max: slab.postMax, valid: validPost },
        ].filter(row => row.maxCount > 0).map(row => (
          <div key={row.label} className="mb-3">
            <label className="text-white/85 text-[11px] font-semibold uppercase mb-1 block">{row.label} (max {row.maxCount})</label>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" min={0} max={row.maxCount}
                value={row.count === 0 ? "" : String(row.count)}
                onChange={e => { const n = parseInt(e.target.value.replace(/\D/g, "")) || 0; row.setCount(Math.max(0, Math.min(row.maxCount, n))); }}
                placeholder="0"
                className="w-1/3 px-3 py-2 rounded-lg text-white text-sm" style={INP} />
              <input type="text" inputMode="numeric"
                value={row.price === 0 ? "" : String(row.price)}
                onChange={e => { const n = parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0; row.setPrice(n); }}
                placeholder={`₹${row.min}–${row.max}`}
                className="w-2/3 px-3 py-2 rounded-lg text-white text-sm"
                style={{ ...INP, border: `1px solid ${row.valid ? "rgba(255,255,255,0.10)" : "rgba(239,68,68,0.40)"}` }} />
            </div>
            <p className="text-white/70 text-[10px] mt-0.5">₹{row.min}–₹{row.max}</p>
          </div>
        ))}

        <div className="mb-3">
          <label className="text-white/85 text-[11px] font-semibold uppercase mb-1 block">
            Timeline (days, {round1.timelineDays}–{req.timelineDays})
          </label>
          <input type="text" inputMode="numeric" value={timelineStr}
            onChange={e => setTimelineStr(e.target.value.replace(/\D/g, ""))}
            placeholder={`${round1.timelineDays}–${req.timelineDays}`}
            className="w-full px-3 py-2 rounded-lg text-white text-sm"
            style={{ ...INP, border: `1px solid ${timelineEmpty || !validTimeline ? "rgba(239,68,68,0.40)" : "rgba(255,255,255,0.10)"}` }} />
          {timelineEmpty && <p className="text-amber-400 text-[10px] mt-0.5">⚠ Please enter a timeline</p>}
          {!timelineEmpty && !validTimeline && <p className="text-amber-400 text-[10px] mt-0.5">⚠ Must be between {round1.timelineDays} and {req.timelineDays} days</p>}
          <p className="text-white/70 text-[10px] mt-0.5">Creator asked {req.timelineDays} days. You can reduce to your original {round1.timelineDays} days.</p>
        </div>

        <div className="flex items-center justify-center gap-1.5 mb-3">
          <span className="text-white text-base font-bold">₹{total.toLocaleString("en-IN")}</span>
          <span style={{ color: PINK, fontSize: 12, fontWeight: 600 }}>+ GST</span>
        </div>

        {!withinOrig && <p className="text-amber-300 text-[11px] mb-2 text-center">⚠ Counts cannot exceed your original Round 1 amounts</p>}
        {identical && <p className="text-amber-300 text-[11px] mb-2 text-center">⚠ Counter must differ from creator's offer</p>}
        {error && <p className="text-red-400 text-xs mb-3 text-center">{error}</p>}

        <button disabled={!canSend || submitting} onClick={handleSubmit}
          className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: PINK }}>
          {submitting ? "Sending..." : "Send Counter-Back"}
        </button>
      </div>
    </div>
  );
}

// ── RejectModal (brand) — always post-negotiation, no reason picker ──
function RejectModal({ req, error, onClose, onBack, onSubmit }: {
  req: RequestRow; error: string | null;
  onClose: () => void; onBack: () => void; onSubmit: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="text-white/75 hover:text-white text-xs">← Back</button>
            <h3 className="text-white font-bold text-base">Reject Counter-Offer</h3>
          </div>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>

        <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(240,24,122,0.07)", border: "1px solid rgba(240,24,122,0.20)" }}>
          <p className="text-white/80 text-sm font-medium mb-0.5">Reject Round {req.roundNumber} counter?</p>
          <p className="text-white/70 text-xs">The creator will be notified that you don't accept the negotiation terms. This action cannot be undone.</p>
        </div>

        {error && <p className="text-red-400 text-xs mb-3 text-center">{error}</p>}
        <button disabled={submitting}
          onClick={async () => { setSubmitting(true); try { await onSubmit(); } finally { setSubmitting(false); } }}
          className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: PINK }}>
          {submitting ? "Rejecting..." : "Reject Counter-Offer"}
        </button>
      </div>
    </div>
  );
}

// ── Brand Product Shipping ──
function BrandProductShipping({ deal, apiFetch, onRefresh }: {
  deal: DealRow;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [awb, setAwb] = useState("");
  const [courier, setCourier] = useState("");
  const [shipDate, setShipDate] = useState("");
  const [shipDateErr, setShipDateErr] = useState("");

  const todayStr = (() => { const d = new Date(); return d.toISOString().split("T")[0]; })();
  const minDateStr = (() => { const d = new Date(); d.setDate(d.getDate() - 15); return d.toISOString().split("T")[0]; })();
  const maxDateStr = (() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().split("T")[0]; })();
  const shipDateValid = shipDate.trim() !== "" && shipDate >= minDateStr && shipDate <= maxDateStr;

  if (!deal.productRequired) return null;

  // Gate: cannot ship until concept is approved
  if (!deal.productShippedAt && !deal.productReceivedAt && deal.status !== "CONCEPT_APPROVED") {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl mb-3"
        style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.22)" }}>
        <Package className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#fbbf24" }} />
        <p className="text-xs font-medium" style={{ color: "#fbbf24", fontFamily: POPPINS }}>
          Product shipping unlocks after creator's concept is approved.
        </p>
      </div>
    );
  }

  async function markShipped() {
    if (!courier.trim()) { setErr("Courier name is required."); return; }
    if (!awb.trim()) { setErr("AWB / tracking number is required."); return; }
    if (!shipDate.trim()) { setErr("Ship date is required."); return; }
    if (!shipDateValid) { setErr("Please enter a valid ship date (within 15 days of today)."); return; }
    setBusy(true);
    setErr("");
    try {
      const r = await apiFetch(`/api/brand/deals/${deal.id}/product-shipped`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awbNumber: awb.trim(), courierName: courier.trim(), shipDate: shipDate.trim() }),
      });
      if (r.ok) { setShowForm(false); onRefresh(); }
      else { const d = await r.json(); setErr(d.error ?? "Failed"); }
    } catch { setErr("Network error. Please try again."); }
    finally { setBusy(false); }
  }

  if (deal.productReceivedAt) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
        style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.22)" }}>
        <PackageCheck className="w-3.5 h-3.5" style={{ color: "#22c55e", flexShrink: 0 }} />
        <span className="text-xs font-semibold" style={{ color: "#22c55e", fontFamily: POPPINS }}>Creator confirmed product received · Timeline running</span>
      </div>
    );
  }

  // ── Non-delivery reported — admin reviewing
  if (deal.nonDeliveryReportedAt && deal.status === "NON_DELIVERY_REPORTED") {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-xl mb-3"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
        <span style={{ fontSize: 13 }}>🚨</span>
        <div>
          <p className="text-xs font-bold" style={{ color: "#f87171", margin: 0, fontFamily: POPPINS }}>Creator reports non-delivery</p>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.75)", margin: "2px 0 0", fontFamily: POPPINS }}>
            Admin is reviewing the AWB ({deal.awbNumber} via {deal.courierName}). You'll be notified when the case is resolved.
          </p>
        </div>
      </div>
    );
  }

  // ── Product issue raised — brand must respond
  if (deal.status === "PRODUCT_ISSUE_RAISED" && deal.productIssueRaised) {
    return (
      <div className="mb-3">
        <BrandIssueResponseModal deal={deal} apiFetch={apiFetch} onRefresh={onRefresh} />
      </div>
    );
  }

  // ── Brand asked creator to make-it-work, awaiting creator decision
  if (deal.status === "AWAITING_CREATOR_ISSUE_DECISION") {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-xl mb-3"
        style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
        <span style={{ fontSize: 13 }}>⏳</span>
        <p className="text-xs font-medium" style={{ color: "#fbbf24", margin: 0, fontFamily: POPPINS }}>
          Waiting for creator to confirm whether they can work with the product as is.
        </p>
      </div>
    );
  }

  if (deal.productShippedAt) {
    const awbWrongActive = !!deal.awbWrongDeadline && new Date(deal.awbWrongDeadline) > new Date() && !deal.awbLocked;
    return (
      <div className="mb-3">
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl mb-2"
          style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <Truck className="w-3.5 h-3.5 mt-0.5" style={{ color: "#fbbf24", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span className="text-xs font-semibold" style={{ color: "#fbbf24", fontFamily: POPPINS }}>
              Product shipped{(deal.reshipCount ?? 0) > 0 ? ` (reship ${deal.reshipCount})` : ""} · Awaiting creator confirmation
            </span>
            {(deal.awbNumber || deal.courierName) && (
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.70)", margin: "1px 0 0", fontFamily: POPPINS }}>
                {deal.courierName ?? ""}{deal.awbNumber ? ` · AWB: ${deal.awbNumber}` : ""}{deal.shipDate ? ` · Shipped ${deal.shipDate}` : ""}
                {deal.awbLocked ? "  ✓ confirmed" : ""}
              </p>
            )}
          </div>
        </div>
        {awbWrongActive && (
          <BrandAwbResponseModal deal={deal} apiFetch={apiFetch} onRefresh={onRefresh} />
        )}
      </div>
    );
  }

  const allFilled = courier.trim() && awb.trim() && shipDateValid;

  return (
    <div className="mb-3">
      {deal.deliveryAddress && !deal.productShippedAt && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl mb-2"
          style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.25)" }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>📍</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "#7DB7FF", fontFamily: POPPINS }}>Creator's delivery address</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>{deal.deliveryAddress}</p>
            {deal.deliveryAddressPhone && (
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>📞 {deal.deliveryAddressPhone}</p>
            )}
          </div>
        </div>
      )}
      {!deal.deliveryAddress && deal.status === "CONCEPT_APPROVED" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <span style={{ fontSize: 12, flexShrink: 0 }}>⏳</span>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.75)", fontFamily: POPPINS }}>Waiting for creator to share delivery address…</p>
        </div>
      )}
      {!showForm ? (
        <div>
          <button
            onClick={() => { if (deal.deliveryAddress) setShowForm(true); }}
            disabled={!deal.deliveryAddress}
            className="w-full py-2 rounded-full flex items-center justify-center gap-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: deal.deliveryAddress ? PINK : "rgba(255,255,255,0.15)", fontFamily: POPPINS }}>
            <Package className="w-3.5 h-3.5" />
            Mark Product as Shipped
          </button>
          {!deal.deliveryAddress && (
            <p className="text-center text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: POPPINS }}>
              🔒 Unlocks once creator shares their delivery address
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <p className="text-white text-xs font-semibold mb-2" style={{ fontFamily: POPPINS }}>📦 Ship Product Details</p>
          <input value={courier} onChange={e => setCourier(e.target.value)}
            placeholder="Courier name (required)"
            className="w-full px-3 py-2 rounded-lg text-white text-xs mb-2"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${!courier.trim() ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.10)"}`, fontFamily: POPPINS, outline: "none" }} />
          <input value={awb} onChange={e => setAwb(e.target.value)}
            placeholder="AWB / Tracking number (required)"
            className="w-full px-3 py-2 rounded-lg text-white text-xs mb-2"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${!awb.trim() ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.10)"}`, fontFamily: POPPINS, outline: "none" }} />
          <div className="mb-2">
            <label className="text-white/75 text-[10px] font-semibold mb-1 block" style={{ fontFamily: POPPINS }}>Ship Date (required)</label>
            <input type="date" value={shipDate}
              min={minDateStr} max={maxDateStr}
              onChange={e => { setShipDate(e.target.value); setShipDateErr(""); }}
              className="w-full px-3 py-2 rounded-lg text-white text-xs"
              style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${shipDate && !shipDateValid ? "rgba(240,24,122,0.6)" : (!shipDate.trim() ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.10)")}`, fontFamily: POPPINS, outline: "none", colorScheme: "dark" }} />
            {shipDate && !shipDateValid && (
              <p className="mt-1 text-[11px]" style={{ color: "#F0187A", fontFamily: POPPINS }}>
                Please enter a valid ship date (within 15 days of today)
              </p>
            )}
          </div>
          {err && <p className="text-red-400 text-[11px] mb-2" style={{ fontFamily: POPPINS }}>{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-full text-xs font-medium"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)", fontFamily: POPPINS }}>Cancel</button>
            <button onClick={markShipped} disabled={busy || !allFilled} className="flex-1 py-2 rounded-full text-white text-xs font-semibold disabled:opacity-50"
              style={{ background: "#22c55e", fontFamily: POPPINS }}>
              {busy ? "Marking…" : "Confirm Shipped"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Brand Issue Response Modal (3 options: Reship / Make-It / Cancel) ──
function BrandIssueResponseModal({ deal, apiFetch, onRefresh }: {
  deal: DealRow;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<"" | "RESHIP" | "MAKE_IT" | "CANCEL">("");
  const [awb, setAwb] = useState("");
  const [courier, setCourier] = useState("");
  const [shipDate, setShipDate] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showImage, setShowImage] = useState<string | null>(null);

  const reshipBlocked = (deal.reshipCount ?? 0) >= 1;
  // After a reship, always allow Make It (Fix 2). Pre-reship: block if makeItOptionAvailable=false or creator said CANNOT_PROCEED.
  const makeItBlocked = reshipBlocked ? false : (!(deal.makeItOptionAvailable ?? true) || deal.creatorIssueDecision === "CANNOT_PROCEED");

  async function submit() {
    setErr("");
    if (picked === "RESHIP") {
      if (!awb.trim() || !courier.trim() || !shipDate.trim()) { setErr("Courier, AWB and ship date are required to reship."); return; }
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const maxD = new Date(today); maxD.setDate(today.getDate() + 15);
      const chosen = new Date(shipDate);
      if (chosen < today || chosen > maxD) { setErr("Estimated delivery date must be within the next 15 days."); return; }
    }
    if (picked === "CANCEL" && !confirmCancel) {
      setConfirmCancel(true); return;
    }
    setBusy(true);
    try {
      const body: any = { action: picked };
      if (picked === "RESHIP") { body.awbNumber = awb.trim(); body.courierName = courier.trim(); body.shipDate = shipDate.trim(); }
      const r = await apiFetch(`/api/brand/deals/${deal.id}/product-issue/respond`, {
        method: "POST", body: JSON.stringify(body),
      });
      if (r.ok) { onRefresh(); }
      else { const d = await r.json(); setErr(d.error ?? "Failed"); }
    } catch { setErr("Network error."); }
    finally { setBusy(false); }
  }

  const INP: React.CSSProperties = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", width: "100%", padding: "8px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS, outline: "none" };

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.30)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-white text-xs font-bold" style={{ fontFamily: POPPINS }}>⚠️ Creator raised a product issue</p>
      </div>

      {deal.creatorIssueDecision === "CANNOT_PROCEED" && (
        <p className="text-[11px] mb-2" style={{ color: "#fbbf24", fontFamily: POPPINS }}>
          Creator cannot work with this product. You can ask them again or cancel the deal.
        </p>
      )}

      {deal.productIssueDescription && (
        <p className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.90)", fontFamily: POPPINS, whiteSpace: "pre-wrap" }}>
          "{deal.productIssueDescription}"
        </p>
      )}
      {deal.productIssueImages && deal.productIssueImages.length > 0 && (
        <div className="flex gap-1.5 mb-3">
          {deal.productIssueImages.map((src, i) => (
            <button key={i} onClick={() => setShowImage(src)}
              style={{ width: 56, height: 56, borderRadius: 8, overflow: "hidden", padding: 0, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", background: "transparent" }}>
              <img src={src} alt={`issue ${i}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 mb-2">
        <button onClick={() => setPicked("RESHIP")} disabled={busy || reshipBlocked}
          className="text-left px-3 py-2 rounded-lg text-xs"
          style={{ background: picked === "RESHIP" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${picked === "RESHIP" ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.10)"}`, color: reshipBlocked ? "rgba(255,255,255,0.70)" : "#fff", fontFamily: POPPINS, cursor: reshipBlocked ? "not-allowed" : "pointer" }}>
          📦 Reship the product {reshipBlocked ? "(reship limit reached)" : ""}
        </button>
        {!makeItBlocked && (
          <button onClick={() => setPicked("MAKE_IT")} disabled={busy}
            className="text-left px-3 py-2 rounded-lg text-xs"
            style={{ background: picked === "MAKE_IT" ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${picked === "MAKE_IT" ? "rgba(251,191,36,0.45)" : "rgba(255,255,255,0.10)"}`, color: "#fff", fontFamily: POPPINS, cursor: "pointer" }}>
            💬 Ask creator to work with this product
          </button>
        )}
        <button onClick={() => setPicked("CANCEL")} disabled={busy}
          className="text-left px-3 py-2 rounded-lg text-xs"
          style={{ background: picked === "CANCEL" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${picked === "CANCEL" ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.10)"}`, color: "#fff", fontFamily: POPPINS, cursor: "pointer" }}>
          ❌ Cancel deal · full refund issued
        </button>
      </div>

      {picked === "RESHIP" && (
        <div className="flex flex-col gap-2 mb-2">
          <input value={courier} onChange={e => setCourier(e.target.value)} placeholder="New courier name *" style={INP} />
          <input value={awb} onChange={e => setAwb(e.target.value)} placeholder="New AWB / tracking number *" style={INP} />
          {(() => {
            const td = new Date(); td.setHours(0,0,0,0);
            const mx = new Date(td); mx.setDate(td.getDate() + 15);
            const fmt = (d: Date) => d.toISOString().slice(0, 10);
            return (
              <input type="date" value={shipDate} onChange={e => setShipDate(e.target.value)}
                min={fmt(td)} max={fmt(mx)}
                style={{ ...INP, colorScheme: "dark" }} />
            );
          })()}
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>
            Only one reship is allowed per deal. If the creator raises another issue after reship, the deal will be cancelled automatically.
          </p>
        </div>
      )}

      {picked === "CANCEL" && confirmCancel && (
        <p className="text-[11px] mb-2" style={{ color: "#f87171", fontFamily: POPPINS }}>
          ⚠️ Confirm: cancel the deal and issue a full refund? This cannot be undone.
        </p>
      )}

      {err && <p className="text-red-400 text-[11px] mb-2" style={{ fontFamily: POPPINS }}>{err}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={busy || !picked}
          className="flex-1 py-2 rounded-full text-white text-xs font-semibold"
          style={{ background: PINK, fontFamily: POPPINS, opacity: busy || !picked ? 0.5 : 1, cursor: busy || !picked ? "not-allowed" : "pointer" }}>
          {busy ? "Submitting…" : picked === "CANCEL" && !confirmCancel ? "Confirm Cancel" : "Submit Response"}
        </button>
      </div>


      {showImage && (
        <div onClick={() => setShowImage(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <img src={showImage} alt="issue" style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

// ── Brand AWB Wrong Response Modal ──
function BrandAwbResponseModal({ deal, apiFetch, onRefresh }: {
  deal: DealRow;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<"" | "UPDATE" | "CONFIRM">("");
  const [awb, setAwb] = useState("");
  const [courier, setCourier] = useState("");
  const limit = deal.awbCorrectionLimit ?? 2;
  const used = deal.awbCorrectionCount ?? 0;
  const updateBlocked = used >= limit;
  const deadline = deal.awbWrongDeadline ? new Date(deal.awbWrongDeadline) : null;
  const INP: React.CSSProperties = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", width: "100%", padding: "8px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS, outline: "none" };

  async function submit() {
    setErr("");
    if (picked === "UPDATE" && (!awb.trim() || !courier.trim())) { setErr("AWB and courier name are required."); return; }
    setBusy(true);
    try {
      const body: any = { action: picked };
      if (picked === "UPDATE") { body.awbNumber = awb.trim(); body.courierName = courier.trim(); }
      const r = await apiFetch(`/api/brand/deals/${deal.id}/awb-wrong/respond`, {
        method: "POST", body: JSON.stringify(body),
      });
      if (r.ok) { onRefresh(); }
      else { const d = await r.json(); setErr(d.error ?? "Failed"); }
    } catch { setErr("Network error."); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.30)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-white text-xs font-bold" style={{ fontFamily: POPPINS }}>⚠️ Creator says the AWB is wrong</p>
      </div>
      <p className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.85)", fontFamily: POPPINS }}>
        Update the AWB or confirm it's correct (max {limit} updates per deal — {used} used).
      </p>

      <div className="flex flex-col gap-2 mb-2">
        <button onClick={() => setPicked("CONFIRM")} disabled={busy}
          className="text-left px-3 py-2 rounded-lg text-xs"
          style={{ background: picked === "CONFIRM" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${picked === "CONFIRM" ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.10)"}`, color: "#fff", fontFamily: POPPINS, cursor: "pointer" }}>
          ✓ Confirm the AWB is correct (locks AWB — no more wrong claims)
        </button>
        <button onClick={() => setPicked("UPDATE")} disabled={busy || updateBlocked}
          className="text-left px-3 py-2 rounded-lg text-xs"
          style={{ background: picked === "UPDATE" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${picked === "UPDATE" ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.10)"}`, color: updateBlocked ? "rgba(255,255,255,0.70)" : "#fff", fontFamily: POPPINS, cursor: updateBlocked ? "not-allowed" : "pointer" }}>
          🔄 Update AWB / courier {updateBlocked ? "(limit reached)" : ""}
        </button>
      </div>

      {picked === "UPDATE" && (
        <div className="flex flex-col gap-2 mb-2">
          <input value={courier} onChange={e => setCourier(e.target.value)} placeholder="Courier name *" style={INP} />
          <input value={awb} onChange={e => setAwb(e.target.value)} placeholder="New AWB / tracking number *" style={INP} />
        </div>
      )}

      {err && <p className="text-red-400 text-[11px] mb-2" style={{ fontFamily: POPPINS }}>{err}</p>}

      <button onClick={submit} disabled={busy || !picked}
        className="w-full py-2 rounded-full text-white text-xs font-semibold"
        style={{ background: PINK, fontFamily: POPPINS, opacity: busy || !picked ? 0.5 : 1, cursor: busy || !picked ? "not-allowed" : "pointer" }}>
        {busy ? "Submitting…" : "Submit Response"}
      </button>
    </div>
  );
}

// ── Extension types ──
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

// ── BrandExtensionPanel ──
function BrandExtensionPanel({ deal, apiFetch, onRefresh }: {
  deal: DealRow;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
}) {
  const [extensions, setExtensions] = useState<DealExtension[] | null>(null);
  const [responding, setResponding] = useState<"APPROVE" | "REJECT" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const { serverNow } = useServerTime();

  const fetchExt = useCallback(() => {
    apiFetch(`/api/brand/deals/${deal.id}/extensions`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setExtensions(Array.isArray(data) ? data : []))
      .catch(() => setExtensions([]));
  }, [deal.id, apiFetch]);

  useEffect(() => { fetchExt(); }, [fetchExt]);

  if (extensions === null) return null;

  const pending = extensions.find(e => e.status === "PENDING");
  const past = extensions.filter(e => e.status !== "PENDING");

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const statusColor = (s: DealExtension["status"]) =>
    s === "APPROVED" ? "#22c55e" : s === "REJECTED" ? "#f87171" : "#fbbf24";
  const statusLabel = (e: DealExtension) =>
    e.status === "APPROVED"
      ? `Approved${e.approvedBy === "AUTO" ? " (auto)" : " by you"}`
      : e.status === "REJECTED"
      ? "Declined"
      : "Pending";

  async function respond(decision: "APPROVE" | "REJECT") {
    if (!pending) return;
    setErr(null);
    setResponding(decision);
    try {
      const r = await apiFetch(`/api/brand/deals/${deal.id}/extensions/${pending.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Failed"); return; }
      fetchExt();
      onRefresh();
    } finally {
      setResponding(null);
    }
  }

  return (
    <div className="mb-3">
      {/* Pending extension banner */}
      {pending && (
        <div className="rounded-xl p-3 mb-2" style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.35)" }}>
          <div className="flex items-start gap-2 mb-2">
            <CalendarClock className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#fbbf24" }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold mb-0.5" style={{ color: "#fbbf24", fontFamily: POPPINS }}>
                Creator requests +{pending.extraDays} day{pending.extraDays > 1 ? "s" : ""} extension
              </p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.85)", fontFamily: POPPINS }}>
                "{pending.reason}"
              </p>
              <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>
                Auto-approves if no response within {fmtCountdown(pending.autoApproveDeadline, serverNow)}
              </p>
            </div>
          </div>
          {err && <p className="text-red-400 text-[11px] mb-2" style={{ fontFamily: POPPINS }}>{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => respond("REJECT")}
              disabled={!!responding}
              className="flex-1 py-2 rounded-full text-xs font-semibold disabled:opacity-50"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171", fontFamily: POPPINS, cursor: responding ? "not-allowed" : "pointer" }}
            >
              {responding === "REJECT" ? "Declining…" : "Decline"}
            </button>
            <button
              onClick={() => respond("APPROVE")}
              disabled={!!responding}
              className="flex-2 flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "#22c55e", fontFamily: POPPINS, cursor: responding ? "not-allowed" : "pointer", flexGrow: 2 }}
            >
              {responding === "APPROVE" ? "Approving…" : `Approve +${pending.extraDays} days`}
            </button>
          </div>
        </div>
      )}

      {/* History toggle */}
      {past.length > 0 && (
        <div>
          <button
            onClick={() => setHistOpen(o => !o)}
            className="flex items-center gap-2 text-[11px] font-semibold mb-1"
            style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS, background: "none", border: "none", cursor: "pointer" }}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Extension history ({past.length})
            {histOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {histOpen && (
            <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {past.map(e => (
                <div key={e.id} className="flex items-start justify-between py-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div>
                    <span className="text-white text-[12px] font-semibold" style={{ fontFamily: POPPINS }}>+{e.extraDays} day(s)</span>
                    <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}> · {e.reason}</span>
                    {e.newDeadline && (
                      <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>
                        New deadline: {fmtDate(e.newDeadline)}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-bold ml-3 flex-shrink-0" style={{ color: statusColor(e.status), fontFamily: POPPINS }}>
                    {statusLabel(e)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DealsList ──
function ReportCreatorModal({ deal, apiFetch, onClose }: {
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
    apiFetch("/api/brand/me/email").then(r => r.ok ? r.json() : null).then(d => { if (d?.email) setEmail(d.email); }).catch(() => {});
  }, [apiFetch]);
  async function submit() {
    if (!reason.trim() || !email.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch("/api/reports/deal-creator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: deal.id, creatorId: deal.creator?.id, reason, reporterEmail: email.trim() }) });
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
        <h3 style={{ color: "#fff", fontWeight: 700, fontSize: 17, margin: "0 0 5px" }}>Report Creator</h3>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontStyle: "italic", margin: "0 0 20px", lineHeight: 1.6 }}>We recommend resolving disputes directly — a quick call or message can solve most issues. If you still need to report, please provide details below.</p>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {INFO_ROW("Creator", `@${deal.creator?.instagramHandle ?? "—"}`)}
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

function DealsList({ deals, variant, apiFetch, onRefresh, cancelledRequests = [], chatDealId }: {
  deals: DealRow[];
  variant: "live" | "completed" | "cancelled";
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
  cancelledRequests?: any[];
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
  const [orderModal, setOrderModal] = useState<DealRow | null>(null);
  const { serverNow } = useServerTime();
  const supportEmail = useSupportEmail();
  const totalItems = deals.length + (variant === "cancelled" ? cancelledRequests.length : 0);
  if (totalItems === 0) {
    return <Empty message={variant === "live" ? "No active deals yet." : variant === "completed" ? "No completed deals yet." : "No cancelled deals."} />;
  }
  return (
    <>
      {orderModal && <ViewOrderModal deal={orderModal} onClose={() => setOrderModal(null)} />}
      {reportDeal && <ReportCreatorModal deal={reportDeal} apiFetch={apiFetch} onClose={() => setReportDeal(null)} />}
      {scriptDeal && (
        <DealScriptModal
          aboutProduct={scriptDeal.aboutProduct ?? null}
          reelScript={scriptDeal.reelScript ?? null}
          storyScript={scriptDeal.storyScript ?? null}
          postContent={scriptDeal.postContent ?? null}
          onClose={() => setScriptDeal(null)}
        />
      )}
      <div className="space-y-5">
        {variant === "cancelled" && cancelledRequests.map(r => (
          <CancelledRequestCardBrand key={r.id} req={r} />
        ))}
        {deals.map(d => (
          <div key={d.id} id={`deal-card-${d.id}`} className="rounded-2xl p-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${variant === "live" ? "rgba(34,197,94,0.30)" : variant === "completed" ? "rgba(59,130,246,0.30)" : "rgba(255,255,255,0.08)"}`,
            }}>
            {(d.source === "CAMPAIGN" || d.source === "BARTER") && d.campaignName && (
              <div className="mb-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "rgba(240,24,122,0.12)", color: PINK, fontFamily: POPPINS }}>
                From {d.source === "BARTER" ? "barter" : "campaign"}: {d.campaignName}
              </div>
            )}
            <div className="flex items-center gap-3 mb-3">
              <Avatar url={d.creator?.profilePhotoUrl} name={d.creator?.fullName ?? "Creator"} />
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>{d.creator?.fullName ?? "Creator"}</p>
                <p className="text-white/75 text-[11px] truncate" style={{ fontFamily: POPPINS }}>@{d.creator?.instagramHandle ?? "—"}</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                style={{ background: variant === "live" ? "#22c55e" : variant === "completed" ? "#3b82f6" : "rgba(255,255,255,0.15)", fontFamily: POPPINS }}>
                {humanizeStatus(d.status)}
              </span>
              <button onClick={() => setReportDeal(d)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: POPPINS, padding: 0, flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#F0187A")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                ⚑ Report
              </button>
            </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/90 mb-2" style={{ fontFamily: POPPINS }}>
            {d.reelCount > 0 && <span>{d.reelCount} Reels</span>}
            {d.storyCount > 0 && <span>{d.storyCount} Stories</span>}
            {d.postCount > 0 && <span>{d.postCount} Posts</span>}
          </div>
          {variant === "live" && (() => {
            const pendingProduct = d.productRequired && !d.productReceivedAt;
            if (pendingProduct) {
              return (
                <div className="flex flex-col gap-1 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.60)", fontFamily: POPPINS }}>
                    ⏱ Deal Timeline: {d.timelineDays} days &nbsp;·&nbsp; Starts after product confirmation
                  </span>
                  {d.productShippedAt && (
                    <p className="text-[11px] italic" style={{ color: "rgba(255,255,255,0.50)", fontFamily: POPPINS }}>
                      ⏳ Timeline begins once creator confirms product receipt.
                    </p>
                  )}
                </div>
              );
            }
            if (!d.deadlineAt) return null;
            const now = serverNow ?? Date.now();
            const msLeft = new Date(d.deadlineAt).getTime() - now;
            const daysLeft = Math.ceil(msLeft / 86400000);
            const expired = msLeft <= 0;
            const urgent = !expired && daysLeft <= 2;
            const color = expired ? "#f87171" : urgent ? "#fb923c" : "#a78bfa";
            const bg = expired ? "rgba(239,68,68,0.10)" : urgent ? "rgba(251,146,60,0.10)" : "rgba(167,139,250,0.10)";
            const border = expired ? "rgba(239,68,68,0.25)" : urgent ? "rgba(251,146,60,0.25)" : "rgba(167,139,250,0.22)";
            return (
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                  style={{ background: bg, border: `1px solid ${border}`, color, fontFamily: POPPINS }}>
                  ⏱ Deal Timeline: {d.timelineDays} days
                  &nbsp;·&nbsp;
                  {expired ? "Expired" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}
                  &nbsp;·&nbsp;
                  Expires {new Date(d.deadlineAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </div>
            );
          })()}
          <div className="flex items-center justify-between text-[12px] mb-3" style={{ fontFamily: POPPINS }}>
            <span className="text-white/85">Total ₹{d.totalPayable.toLocaleString("en-IN")}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOrderModal(d)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}
              >
                <FileText className="w-3 h-3" />
                View Order
              </button>
            </div>
          </div>
          {variant === "live" && (
            <div className="mb-3">
              <DealProgressBar
                status={d.status}
                productRequired={d.productRequired}
                postedBy={(d as any).postedBy ?? "CREATOR"}
                deliveryAddress={d.deliveryAddress}
                role="BRAND"
              />
            </div>
          )}
          {variant === "live" && <BrandExtensionPanel deal={d} apiFetch={apiFetch} onRefresh={onRefresh} />}
          {variant === "live" && <BrandProductShipping deal={d} apiFetch={apiFetch} onRefresh={onRefresh} />}
          {variant === "live" && (
            <div className="mt-2 mb-2">
              <DealDeliverablesPanel dealId={d.id} role="BRAND" apiFetch={apiFetch} onChange={onRefresh} />
            </div>
          )}
          {variant === "completed" && (
            d.status === "DISPUTE_WINDOW_OPEN" ||
            d.status === "DISPUTED" ||
            (d.disputeWindowEnd && !d.disputeRaised && new Date(d.disputeWindowEnd) > new Date())
          ) && (
            <div className="mt-2 mb-2">
              <DealDeliverablesPanel dealId={d.id} role="BRAND" apiFetch={apiFetch} onChange={onRefresh} />
            </div>
          )}
          {variant === "completed" && d.status === "DISPUTE_WINDOW_OPEN" && (d.postedBy === "CREATOR" || d.postedBy === "BOTH") && (
            <div className="mt-3 mb-2" style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,180,0,0.10)", border: "1px solid rgba(255,180,0,0.25)" }}>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: POPPINS, lineHeight: 1.55 }}>
                The dispute window is currently open. If the creator has deleted the posted content, you can raise a dispute below. For any other issues, please contact us at{" "}
                <span style={{ color: "#F0187A" }}>{supportEmail}</span>.
              </p>
            </div>
          )}
          {variant === "completed" && (
            <RatingPopup deal={d} apiFetch={apiFetch} />
          )}
          {/* Chat section */}
          <div className="mt-3">
            {variant === "live" && hasDealScript(d) && (
              <button
                onClick={() => setScriptDeal(d)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-2 transition-all"
                style={{
                  background: "rgba(240,24,122,0.15)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  fontFamily: POPPINS,
                }}
              >
                <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                  <FileText className="w-4 h-4" />
                  Script
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-white/70" />
              </button>
            )}
            <button
              onClick={() => setOpenChat(openChat === d.id ? null : d.id)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-1 transition-all"
              style={{
                background: "rgba(240,24,122,0.15)",
                border: `1px solid ${openChat === d.id ? "rgba(240,24,122,0.30)" : "rgba(255,255,255,0.09)"}`,
                fontFamily: POPPINS,
              }}
            >
              <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: openChat === d.id ? PINK : "rgba(255,255,255,0.85)" }}>
                <MessageCircle className="w-4 h-4" />
                Deal Chat
              </span>
              {openChat === d.id
                ? <ChevronUp className="w-3.5 h-3.5" style={{ color: PINK }} />
                : <ChevronDown className="w-3.5 h-3.5 text-white/70" />}
            </button>
            {openChat === d.id && (
              <div className="rounded-xl p-4 mt-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(240,24,122,0.15)", boxShadow: "0 0 16px rgba(240,24,122,0.05)" }}>
                <DealChat
                  dealId={d.id}
                  currentUserType="BRAND"
                  apiFetch={apiFetch}
                  dealStatus={d.status}
                />
              </div>
            )}
          </div>
        </div>
        ))}
      </div>
    </>
  );
}

function CancelledRequestCardBrand({ req }: { req: any }) {
  const partyName = req.creator?.fullName ?? "Creator";
  const handle = req.creator?.instagramHandle;
  const rejectedByLabel = req.rejectedBy === "BRAND" ? "You"
    : req.rejectedBy === "CREATOR" ? "Creator"
    : "Expired (no response in time)";
  const reasonText = req.rejectionReason ?? (req.rejectedBy === "SYSTEM" ? "The negotiation timed out." : "No reason provided.");
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", opacity: 0.85 }}>
      <div className="flex items-center gap-3 mb-3">
        <Avatar url={req.creator?.profilePhotoUrl} name={partyName} />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>{partyName}</p>
          <p className="text-white/75 text-[11px] truncate" style={{ fontFamily: POPPINS }}>
            {handle ? `@${handle}` : "—"} · Round {req.roundNumber}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
          style={{ background: "rgba(239,68,68,0.20)", color: "#fca5a5", fontFamily: POPPINS }}>
          {req.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/90 mb-2" style={{ fontFamily: POPPINS }}>
        {req.reelCount > 0 && <span>{req.reelCount} Reels</span>}
        {req.storyCount > 0 && <span>{req.storyCount} Stories</span>}
        {req.postCount > 0 && <span>{req.postCount} Posts</span>}
      </div>
      <p className="text-white/75 text-[11px] mb-3" style={{ fontFamily: POPPINS }}>
        Total ₹{(req.totalValue ?? 0).toLocaleString("en-IN")}
      </p>
      <div className="rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.20)" }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#fca5a5", fontFamily: POPPINS }}>
          Cancelled by {rejectedByLabel}
        </p>
        <p className="text-white/75 text-[12px] leading-snug" style={{ fontFamily: POPPINS }}>
          {reasonText}
        </p>
      </div>
    </div>
  );
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  return url ? (
    <img src={url} alt={name} className="w-10 h-10 rounded-full object-cover" />
  ) : (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
      style={{ background: PINK, fontFamily: POPPINS }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between text-[11.5px] py-0.5">
      <span style={{ color: muted ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.85)", fontFamily: POPPINS }}>{label}</span>
      <span style={{ color: muted ? "rgba(255,255,255,0.75)" : "white", fontWeight: bold ? 700 : 500, fontFamily: POPPINS }}>{value}</span>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <Handshake className="w-12 h-12 mx-auto mb-3 text-white/70" />
      <p className="text-white/85 text-sm" style={{ fontFamily: POPPINS }}>{message}</p>
    </div>
  );
}
