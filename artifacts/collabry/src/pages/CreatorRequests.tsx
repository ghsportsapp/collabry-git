import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Clock, Check, X as XIcon, MessageCircle, Inbox, ExternalLink, Globe, Instagram, Building2 } from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { CreatorLayout } from "@/components/CreatorNavLayout";
import { useServerTime } from "@/hooks/useServerTime";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

function splitScripts(text: string, count: number, prefix: string): string[] {
  if (count <= 1) return [text];
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    const header = `${prefix} ${i + 1}:\n`;
    const nextHeader = i + 1 < count ? `\n\n${prefix} ${i + 2}:` : null;
    const from = text.indexOf(header);
    if (from === -1) { results.push(text); break; }
    const contentStart = from + header.length;
    const to = nextHeader ? text.indexOf(nextHeader, contentStart) : text.length;
    results.push(text.slice(contentStart, to === -1 ? text.length : to).trim());
  }
  return results;
}

function CollapsibleText({ text, limit = 160 }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= limit) return <p className="text-white/80 text-xs leading-relaxed whitespace-pre-wrap">{text}</p>;
  return (
    <div>
      <p className="text-white/80 text-xs leading-relaxed whitespace-pre-wrap">
        {expanded ? text : text.slice(0, limit) + "…"}
      </p>
      <button onClick={() => setExpanded(e => !e)}
        className="text-[11px] font-semibold mt-1" style={{ color: PINK, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: POPPINS }}>
        {expanded ? "See less" : "See full brief"}
      </button>
    </div>
  );
}

interface RequestRow {
  id: string;
  brandId: string;
  status: string;
  reelCount: number; storyCount: number; postCount: number;
  pricePerReel: number; pricePerStory: number; pricePerPost: number;
  totalValue: number;
  timelineDays: number;
  productRequired: boolean;
  productDescription: string | null;
  productImageUrl: string | null;
  brief: string | null;
  aboutProduct: string | null;
  reelScript: string | null;
  storyScript: string | null;
  postContent: string | null;
  slab: { reelMin: number; reelMax: number; storyMin: number; storyMax: number; postMin: number; postMax: number };
  expiresAt: string;
  createdAt: string;
  roundNumber: number;
  proposedBy: string;
  parentRequestId: string | null;
  brandName: string | null;
  brandLogo: string | null;
  postedBy: string | null;
}

interface RejectionReason { id: string; reason: string; }

export default function CreatorRequests() {
  const { creatorId, apiFetch, loading: authLoading } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [selectedReq, setSelectedReq] = useState<RequestRow | null>(null);
  const [chain, setChain] = useState<RequestRow[]>([]);
  const [action, setAction] = useState<"counter" | "reject" | "view" | "details" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commissionRate, setCommissionRate] = useState(5);

  useEffect(() => {
    if (!authLoading && !creatorId) navigate("/login-creator");
  }, [creatorId, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);
    try {
      const [r, rj] = await Promise.all([
        apiFetch("/api/creator/requests"),
        apiFetch("/api/creator/rejection-reasons").catch(() => null),
      ]);
      if (r.ok) {
        const d = await r.json();
        setRequests(d.requests ?? []);
      }
      if (rj && rj.ok) {
        const d = await rj.json();
        setReasons(d.reasons ?? []);
      }
    } finally { setLoading(false); }
  }, [creatorId, apiFetch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/platform-config/deal").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.commission_rate) setCommissionRate(parseFloat(d.commission_rate) || 5);
    }).catch(() => {});
  }, []);

  const openDetail = async (req: RequestRow, mode: "counter" | "reject" | "view" | "details") => {
    setSelectedReq(req);
    setAction(mode);
    setError(null);
    // fetch chain
    const r = await apiFetch(`/api/creator/requests/${req.id}`);
    if (r.ok) {
      const d = await r.json();
      setChain(d.chain ?? []);
    }
  };

  const closeModal = () => { setSelectedReq(null); setAction(null); setChain([]); setError(null); };

  const handleAccept = async (req: RequestRow) => {
    setError(null);
    const endpoint = req.roundNumber >= 4 ? "final-accept" : "accept";
    const r = await apiFetch(`/api/creator/requests/${req.id}/${endpoint}`, { method: "POST" });
    if (r.ok) { closeModal(); await load(); }
    else { const d = await r.json(); setError(d.error ?? "Accept failed"); }
  };

  if (authLoading || !creatorId) return null;

  return (
    <CreatorLayout status="ACTIVE" onLocked={() => {}}>
      <div className="px-4 lg:px-0 py-5 lg:py-8" style={{ fontFamily: POPPINS }}>
        <div>
        <div className="flex items-center gap-3 mb-5 lg:hidden">
          <button onClick={() => navigate("/home-creator")} className="text-white/85 hover:text-white text-xs">← Home</button>
        </div>
        <h1 className="text-white text-xl lg:text-2xl font-bold mb-1">Brand Requests</h1>
        <p className="text-white/75 text-xs lg:text-sm mb-5 lg:mb-7">Review brand collaboration requests and respond.</p>

        {loading ? (
          <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="w-12 h-12 mx-auto mb-3 text-white/70" />
            <p className="text-white/85 text-sm">No pending requests right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(r => <RequestCard key={r.id} r={r}
              commissionRate={commissionRate}
              onView={() => openDetail(r, "view")}
              onDetails={() => openDetail(r, "details")}
            />)}
          </div>
        )}
        </div>

        {selectedReq && action === "counter" && (
        <CounterModal req={selectedReq} chain={chain} onClose={closeModal} onSubmit={async (body) => {
          setError(null);
          const r = await apiFetch(`/api/creator/requests/${selectedReq.id}/counter`, {
            method: "POST", body: JSON.stringify(body),
          });
          if (r.ok) { closeModal(); await load(); }
          else { const d = await r.json(); setError(d.error ?? "Counter failed"); }
        }} error={error} />
      )}

        {selectedReq && action === "reject" && (
        <RejectModal req={selectedReq} reasons={reasons} onClose={closeModal} onSubmit={async (reasonId) => {
          setError(null);
          const endpoint = selectedReq.roundNumber >= 4 ? "final-reject" : "reject";
          const body = reasonId ? { reasonId } : {};
          const r = await apiFetch(`/api/creator/requests/${selectedReq.id}/${endpoint}`, {
            method: "POST", body: JSON.stringify(body),
          });
          if (r.ok) { closeModal(); await load(); }
          else { const d = await r.json(); setError(d.error ?? "Reject failed"); }
        }} error={error} />
      )}

        {selectedReq && action === "view" && (
        <ChainViewModal req={selectedReq} chain={chain} onClose={closeModal} />
      )}

        {selectedReq && action === "details" && (
        <RequestDetailsModal req={selectedReq} chain={chain} onClose={closeModal}
          commissionRate={commissionRate}
          onAccept={() => handleAccept(selectedReq)}
          onCounter={() => { setAction("counter"); setError(null); }}
          onReject={() => { setAction("reject"); setError(null); }}
        />
      )}
      </div>
    </CreatorLayout>
  );
}

function RequestCard({ r, onView, onDetails, commissionRate = 5 }: {
  r: RequestRow; onView: () => void; onDetails: () => void; commissionRate?: number;
}) {
  const { serverNow } = useServerTime();
  const remaining = new Date(r.expiresAt).getTime() - serverNow;
  const expired = remaining <= 0;
  const daysLeft = Math.floor(remaining / 86400_000);
  const hrs = Math.floor(remaining / 3600_000);
  const mins = Math.floor((remaining % 3600_000) / 60_000);
  const isFinal = r.roundNumber >= 4;
  const payout = Math.round(r.totalValue * (1 - commissionRate / 100));

  const timerText = expired ? "Expired"
    : daysLeft > 0 ? `${daysLeft}d ${hrs % 24}h left`
    : hrs > 0 ? `${hrs}h ${mins}m left`
    : `${mins}m left`;

  const deliverables = [
    r.reelCount > 0 && `${r.reelCount} Reel${r.reelCount > 1 ? "s" : ""} @ ₹${r.pricePerReel.toLocaleString("en-IN")}`,
    r.storyCount > 0 && `${r.storyCount} ${r.storyCount > 1 ? "Stories" : "Story"} @ ₹${r.pricePerStory.toLocaleString("en-IN")}`,
    r.postCount > 0 && `${r.postCount} Post${r.postCount > 1 ? "s" : ""} @ ₹${r.pricePerPost.toLocaleString("en-IN")}`,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-2xl p-4 sm:p-5"
      style={{ background: "rgba(240,24,122,0.18)", border: `1px solid ${isFinal ? "rgba(245,158,11,0.50)" : "rgba(240,24,122,0.35)"}` }}>

      {/* Header: brand + round + timer */}
      <div className="flex items-center gap-3 mb-4">
        {r.brandLogo
          ? <img src={r.brandLogo} alt={r.brandName ?? ""} className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover flex-shrink-0" />
          : <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-base" style={{ background: PINK }}>
              {r.brandName?.slice(0, 1) ?? "B"}
            </div>}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base sm:text-lg truncate" style={{ fontFamily: POPPINS }}>{r.brandName ?? "Brand"}</p>
          <p className="text-white/75 text-xs sm:text-sm" style={{ fontFamily: POPPINS }}>Round {r.roundNumber} of 4</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {isFinal && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: "#f59e0b" }}>FINAL</span>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
            style={{ background: expired ? "rgba(239,68,68,0.15)" : "rgba(0,0,0,0.30)", border: `1px solid ${expired ? "rgba(239,68,68,0.40)" : "rgba(255,255,255,0.18)"}` }}>
            <Clock className="w-3 h-3 flex-shrink-0" style={{ color: expired ? "#f87171" : "rgba(255,255,255,0.90)" }} />
            <span className="text-xs sm:text-sm font-semibold whitespace-nowrap" style={{ color: expired ? "#f87171" : "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>{timerText}</span>
          </div>
        </div>
      </div>

      {/* Deliverables — only non-zero */}
      {deliverables.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {deliverables.map((d, i) => (
            <span key={i} className="text-xs sm:text-sm px-3 py-1.5 rounded-full font-medium"
              style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.18)", fontFamily: POPPINS }}>
              {d}
            </span>
          ))}
        </div>
      )}

      {/* Amount + Payout + Timeline */}
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="text-white/75 text-xs sm:text-sm mb-0.5" style={{ fontFamily: POPPINS }}>Deal Amount</p>
          <p className="text-white font-bold text-2xl sm:text-3xl leading-none" style={{ fontFamily: POPPINS }}>
            ₹{r.totalValue.toLocaleString("en-IN")}
          </p>
          <p className="text-sm sm:text-base font-semibold mt-1.5" style={{ color: "#4ade80", fontFamily: POPPINS }}>
            Your Payout: ₹{payout.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-white/70 text-xs sm:text-sm mb-0.5" style={{ fontFamily: POPPINS }}>Timeline</p>
          <p className="text-white font-semibold text-sm sm:text-base" style={{ fontFamily: POPPINS }}>{r.timelineDays} days</p>
        </div>
      </div>

      {/* Brief snippet */}
      {(r.aboutProduct ?? r.brief) && (
        <p className="text-white/80 text-xs sm:text-sm line-clamp-2 mb-4 leading-relaxed" style={{ fontFamily: POPPINS }}>
          {r.aboutProduct ?? r.brief}
        </p>
      )}

      {/* CTA */}
      <button onClick={onDetails} disabled={expired}
        className="w-full py-3 rounded-xl text-white text-sm sm:text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity hover:opacity-90"
        style={{ background: expired ? "rgba(255,255,255,0.12)" : PINK, fontFamily: POPPINS }}>
        See Offer →
      </button>
      {r.parentRequestId && (
        <button onClick={onView} className="w-full mt-2 py-2.5 text-white/70 text-xs sm:text-sm rounded-xl text-center transition-opacity hover:opacity-80"
          style={{ border: "1px solid rgba(255,255,255,0.14)", fontFamily: POPPINS }}>
          Negotiation History
        </button>
      )}
    </div>
  );
}

function CounterModal({ req, chain, onClose, onSubmit, error }: {
  req: RequestRow; chain: RequestRow[]; onClose: () => void;
  onSubmit: (body: any) => void; error: string | null;
}) {
  const [reelCount, setReelCount] = useState(req.reelCount);
  const [storyCount, setStoryCount] = useState(req.storyCount);
  const [postCount, setPostCount] = useState(req.postCount);
  const [pricePerReel, setPricePerReel] = useState(req.pricePerReel);
  const [pricePerStory, setPricePerStory] = useState(req.pricePerStory);
  const [pricePerPost, setPricePerPost] = useState(req.pricePerPost);
  const [timelineInput, setTimelineInput] = useState(String(req.timelineDays));
  const [submitting, setSubmitting] = useState(false);

  const timelineParsed = parseInt(timelineInput, 10);
  const timelineValid = timelineInput !== "" && !isNaN(timelineParsed) && timelineParsed >= req.timelineDays && timelineParsed <= 14;
  const timelineDays = timelineValid ? timelineParsed : req.timelineDays;

  const total = reelCount * pricePerReel + storyCount * pricePerStory + postCount * pricePerPost;
  const identical =
    reelCount === req.reelCount && storyCount === req.storyCount && postCount === req.postCount &&
    pricePerReel === req.pricePerReel && pricePerStory === req.pricePerStory && pricePerPost === req.pricePerPost &&
    timelineParsed === req.timelineDays;

  const validReel = reelCount === 0 || (pricePerReel >= req.slab.reelMin && pricePerReel <= req.slab.reelMax && pricePerReel >= req.pricePerReel && reelCount <= req.reelCount);
  const validStory = storyCount === 0 || (pricePerStory >= req.slab.storyMin && pricePerStory <= req.slab.storyMax && pricePerStory >= req.pricePerStory && storyCount <= req.storyCount);
  const validPost = postCount === 0 || (pricePerPost >= req.slab.postMin && pricePerPost <= req.slab.postMax && pricePerPost >= req.pricePerPost && postCount <= req.postCount);
  const someDeliverable = reelCount + storyCount + postCount > 0;
  const canSend = !identical && someDeliverable && validReel && validStory && validPost && timelineValid;

  const handleSubmit = async () => {
    if (!canSend) return;
    setSubmitting(true);
    try {
      await onSubmit({ reelCount, storyCount, postCount, pricePerReel, pricePerStory, pricePerPost, timelineDays });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-3 sticky top-0 -mx-5 px-5 pb-2" style={{ background: "#15151D" }}>
          <h3 className="text-white font-bold text-base">Counter-Offer · Round {req.roundNumber + 1}</h3>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>

        <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.20)" }}>
          <p className="text-white/90 text-[10px] uppercase font-semibold mb-1">Brand offered</p>
          <p className="text-white text-xs">₹{req.totalValue.toLocaleString("en-IN")} · {req.reelCount} reels, {req.storyCount} stories, {req.postCount} posts · {req.timelineDays} days</p>
        </div>

        <p className="text-white/75 text-[10.5px] mb-3 leading-relaxed">
          Rules: counts can only go down, prices can only go up, timeline can only go up, and your counter cannot be identical to the brand's offer.
        </p>

        <div className="rounded-lg px-3 py-2 mb-3" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)" }}>
          <p className="text-amber-300 text-[11px] font-semibold">⚠ This is your only counter offer. Once submitted, you will only be able to accept or reject the brand's response — no further countering.</p>
        </div>

        {req.reelCount > 0 && (
          <CounterRow label="REELS" count={reelCount} setCount={setReelCount} maxCount={req.reelCount}
            price={pricePerReel} setPrice={setPricePerReel}
            minPrice={Math.max(req.pricePerReel, req.slab.reelMin)} maxPrice={req.slab.reelMax}
            unit="reel" valid={validReel} />
        )}
        {req.storyCount > 0 && (
          <CounterRow label="STORIES" count={storyCount} setCount={setStoryCount} maxCount={req.storyCount}
            price={pricePerStory} setPrice={setPricePerStory}
            minPrice={Math.max(req.pricePerStory, req.slab.storyMin)} maxPrice={req.slab.storyMax}
            unit="story" valid={validStory} />
        )}
        {req.postCount > 0 && (
          <CounterRow label="PHOTOS" count={postCount} setCount={setPostCount} maxCount={req.postCount}
            price={pricePerPost} setPrice={setPricePerPost}
            minPrice={Math.max(req.pricePerPost, req.slab.postMin)} maxPrice={req.slab.postMax}
            unit="photo" valid={validPost} />
        )}

        <div className="mb-3">
          <label className="text-white/85 text-[11px] font-semibold uppercase mb-1 block">Timeline (days, min {req.timelineDays}, max 14)</label>
          <input type="number" min={req.timelineDays} max={14} value={timelineInput}
            onChange={e => setTimelineInput(e.target.value)}
            placeholder={`${req.timelineDays}–14`}
            className="w-full px-3 py-2 rounded-lg text-white text-sm"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${timelineValid ? "rgba(255,255,255,0.10)" : "rgba(239,68,68,0.40)"}` }} />
        </div>

        <p className="text-white text-base font-bold text-center mb-3">Your counter: ₹{total.toLocaleString("en-IN")}</p>

        {identical && <p className="text-amber-300 text-[11px] mb-2 text-center">⚠ Counter must differ from brand's offer</p>}
        {error && <p className="text-red-400 text-xs mb-3 text-center">{error}</p>}

        <button disabled={!canSend || submitting} onClick={handleSubmit}
          className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: PINK }}>
          {submitting ? "Sending..." : "Send Counter-Offer"}
        </button>
      </div>
    </div>
  );
}

function CounterRow({ label, count, setCount, maxCount, price, setPrice, minPrice, maxPrice, unit, valid }: {
  label: string; count: number; setCount: (n: number) => void; maxCount: number;
  price: number; setPrice: (n: number) => void; minPrice: number; maxPrice: number;
  unit: string; valid: boolean;
}) {
  const [priceStr, setPriceStr] = useState(price === 0 ? "" : String(price));

  function handlePriceChange(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "");
    setPriceStr(cleaned);
    const n = parseInt(cleaned, 10);
    setPrice(isNaN(n) ? 0 : n);
  }

  useEffect(() => {
    setPriceStr(price === 0 ? "" : String(price));
  }, [price]);

  return (
    <div className="mb-3">
      <label className="text-white/85 text-[11px] font-semibold uppercase mb-1 block">{label} (max {maxCount})</label>
      <div className="flex gap-2">
        <input type="number" min={0} max={maxCount} value={count} onChange={e => setCount(Math.max(0, Math.min(maxCount, parseInt(e.target.value) || 0)))}
          placeholder="Count"
          className="w-1/3 px-3 py-2 rounded-lg text-white text-sm"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }} />
        <input type="text" inputMode="numeric" value={priceStr} onChange={e => handlePriceChange(e.target.value)}
          placeholder={`₹${minPrice}–${maxPrice}`}
          className="w-2/3 px-3 py-2 rounded-lg text-white text-sm"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${valid ? "rgba(255,255,255,0.10)" : "rgba(239,68,68,0.40)"}` }} />
      </div>
      <p className="text-white/70 text-[10px] mt-0.5">₹{minPrice}–₹{maxPrice} per {unit}</p>
    </div>
  );
}

function RejectModal({ req, reasons, onClose, onSubmit, error }: {
  req: RequestRow; reasons: RejectionReason[]; onClose: () => void;
  onSubmit: (reasonId?: string) => void; error: string | null;
}) {
  const [reasonId, setReasonId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const isFirstRound = req.roundNumber === 1;

  const handleSubmit = async () => {
    if (isFirstRound && !reasonId) return;
    setSubmitting(true);
    try { await onSubmit(isFirstRound ? reasonId : undefined); } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-base">
            {isFirstRound ? `Decline Request from ${req.brandName}` : "Reject Negotiation"}
          </h3>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>

        {isFirstRound ? (
          <>
            <p className="text-white/75 text-xs mb-3">Please choose a reason — the brand will see this.</p>
            <div className="space-y-1 mb-4">
              {reasons.map(r => (
                <button key={r.id} onClick={() => setReasonId(r.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs"
                  style={{ background: reasonId === r.id ? "rgba(240,24,122,0.18)" : "rgba(255,255,255,0.04)", color: "white", border: `1px solid ${reasonId === r.id ? PINK : "rgba(255,255,255,0.08)"}` }}>
                  {r.reason}
                </button>
              ))}
              {reasons.length === 0 && <p className="text-white/70 text-xs">No rejection reasons available. Ask admin to add some.</p>}
            </div>
          </>
        ) : (
          <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(240,24,122,0.07)", border: "1px solid rgba(240,24,122,0.20)" }}>
            <p className="text-white/80 text-sm font-medium mb-0.5">Reject Round {req.roundNumber} offer?</p>
            <p className="text-white/70 text-xs">The brand will be notified that you don't accept the negotiation terms. This action cannot be undone.</p>
          </div>
        )}

        {error && <p className="text-red-400 text-xs mb-3 text-center">{error}</p>}
        <button disabled={(isFirstRound && !reasonId) || submitting} onClick={handleSubmit}
          className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: PINK }}>
          {submitting ? "Sending..." : isFirstRound ? "Decline Request" : "Reject Offer"}
        </button>
      </div>
    </div>
  );
}

function RequestDetailsModal({ req, chain, onClose, onAccept, onCounter, onReject, commissionRate = 5 }: {
  req: RequestRow; chain: RequestRow[]; onClose: () => void;
  onAccept?: () => void; onCounter?: () => void; onReject?: () => void;
  commissionRate?: number;
}) {
  const [accepting, setAccepting] = useState(false);
  const [showBrandProfile, setShowBrandProfile] = useState(false);
  const { serverNow } = useServerTime();
  const expired = new Date(req.expiresAt).getTime() < serverNow;
  const isFinal = req.roundNumber >= 3;
  const hasHistory = chain.length > 1;

  if (showBrandProfile) {
    return <BrandProfileModal brandId={req.brandId} brandName={req.brandName} brandLogo={req.brandLogo} onClose={() => setShowBrandProfile(false)} onBack={() => setShowBrandProfile(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.82)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {req.brandLogo
              ? <img src={req.brandLogo} alt={req.brandName ?? ""} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              : <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold" style={{ background: PINK }}>{req.brandName?.slice(0, 1) ?? "B"}</div>}
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{req.brandName ?? "Brand"}</p>
              <p className="text-white/70 text-[11px]">Round {req.roundNumber} · {req.proposedBy === "BRAND" ? "Brand offer" : "Your counter"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <button
              onClick={() => setShowBrandProfile(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={{ background: "rgba(240,24,122,0.12)", color: PINK, border: "1px solid rgba(240,24,122,0.25)" }}
            >
              <Building2 className="w-3 h-3" />
              Brand Profile
            </button>
            <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
          </div>
        </div>

        <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-white/75 text-[10px] uppercase font-semibold mb-2">Deliverables & Pricing</p>
          <div className="space-y-1">
            {req.reelCount > 0 && <div className="flex justify-between text-xs"><span className="text-white/85">{req.reelCount} × Reel</span><span className="text-white">₹{req.pricePerReel.toLocaleString("en-IN")} /reel</span></div>}
            {req.storyCount > 0 && <div className="flex justify-between text-xs"><span className="text-white/85">{req.storyCount} × Story</span><span className="text-white">₹{req.pricePerStory.toLocaleString("en-IN")} /story</span></div>}
            {req.postCount > 0 && <div className="flex justify-between text-xs"><span className="text-white/85">{req.postCount} × Post</span><span className="text-white">₹{req.pricePerPost.toLocaleString("en-IN")} /post</span></div>}
            <div className="pt-1.5 border-t border-white/8 flex justify-between text-sm font-bold"><span className="text-white/85">Total</span><span className="text-white">₹{req.totalValue.toLocaleString("en-IN")}</span></div>
            <div className="pt-1.5 mt-0.5 flex justify-between text-xs">
              <span style={{ color: "rgba(255,255,255,0.70)" }}>Your payout (after {commissionRate}% platform fee)</span>
              <span style={{ color: "#22c55e", fontWeight: 600 }}>₹{(req.totalValue * (1 - commissionRate / 100)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/70 text-[10px] mb-0.5">Timeline</p>
            <p className="text-white text-sm font-semibold">{req.timelineDays} days</p>
          </div>
          <div className="flex-1 rounded-xl p-3" style={{ background: `rgba(240,24,122,0.06)`, border: "1px solid rgba(240,24,122,0.18)" }}>
            <p className="text-white/70 text-[10px] mb-0.5">Product Required</p>
            <p className="text-sm font-semibold" style={{ color: req.productRequired ? PINK : "rgba(255,255,255,0.75)" }}>{req.productRequired ? "Yes" : "No"}</p>
          </div>
        </div>
        {req.postedBy && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/75 text-[10px] uppercase font-semibold mb-1">Who Will Post</p>
            <p className="text-white/80 text-xs">
              {req.postedBy === "CREATOR" ? "You (Creator) will post on your Instagram" : req.postedBy === "BRAND" ? "Brand will post — you deliver content only" : "Both you and the brand will post"}
            </p>
          </div>
        )}
        {req.postedBy && (req.postedBy === "CREATOR" || req.postedBy === "BOTH") && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.30)" }}>
            <p className="text-[10px] font-bold mb-1" style={{ color: "#fb923c" }}>⚠️ Important — Content Deletion Policy</p>
            <p className="text-white/80 text-xs leading-relaxed">
              Do <strong>not</strong> delete the posted content for at least <strong>7 days after posting</strong>. Removing it within this period may result in your payment being withheld and your account being suspended.
            </p>
          </div>
        )}

        {req.productRequired && req.productDescription && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/75 text-[10px] uppercase font-semibold mb-1">Product Info</p>
            <CollapsibleText text={req.productDescription} />
            {req.productImageUrl && (
              <div className="mt-2">
                <a href={/^https?:\/\//i.test(req.productImageUrl!) ? req.productImageUrl! : `https://${req.productImageUrl}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium underline underline-offset-2"
                  style={{ color: "#F0187A" }}>View Product Image ↗</a>
              </div>
            )}
          </div>
        )}
        {req.productRequired && !req.productDescription && req.productImageUrl && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/75 text-[10px] uppercase font-semibold mb-1">Product Image</p>
            <a href={/^https?:\/\//i.test(req.productImageUrl) ? req.productImageUrl : `https://${req.productImageUrl}`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium underline underline-offset-2"
              style={{ color: "#F0187A" }}>View Product Image ↗</a>
          </div>
        )}

        {req.aboutProduct && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/75 text-[10px] uppercase font-semibold mb-1">About Product / Brief</p>
            <CollapsibleText text={req.aboutProduct} />
          </div>
        )}

        {req.reelCount > 0 && req.reelScript && splitScripts(req.reelScript, req.reelCount, "Reel").map((script, i) => (
          <div key={`reel-${i}`} className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/75 text-[10px] uppercase font-semibold mb-1">
              {req.reelCount > 1 ? `Reel Script ${i + 1}` : "Reel Script"}
            </p>
            <CollapsibleText text={script} />
          </div>
        ))}
        {req.storyCount > 0 && req.storyScript && splitScripts(req.storyScript, req.storyCount, "Story").map((script, i) => (
          <div key={`story-${i}`} className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/75 text-[10px] uppercase font-semibold mb-1">
              {req.storyCount > 1 ? `Story Script ${i + 1}` : "Story Script"}
            </p>
            <CollapsibleText text={script} />
          </div>
        ))}
        {req.postCount > 0 && req.postContent && splitScripts(req.postContent, req.postCount, "Photo").map((script, i) => (
          <div key={`post-${i}`} className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/75 text-[10px] uppercase font-semibold mb-1">
              {req.postCount > 1 ? `Photo Content ${i + 1}` : "Photo Content"}
            </p>
            <CollapsibleText text={script} />
          </div>
        ))}

        {hasHistory && (
          <div className="mt-2 pt-3 border-t border-white/8">
            <p className="text-white/70 text-[10px] uppercase font-semibold mb-2">Negotiation History ({chain.length} rounds)</p>
            <div className="space-y-1.5">
              {chain.map(c => (
                <div key={c.id} className="rounded-lg px-3 py-2 flex justify-between text-xs"
                  style={{ background: c.proposedBy === "BRAND" ? "rgba(240,24,122,0.07)" : "rgba(34,197,94,0.07)" }}>
                  <span style={{ color: c.proposedBy === "BRAND" ? PINK : "#22c55e" }}>Round {c.roundNumber} · {c.proposedBy}</span>
                  <span className="text-white font-semibold">₹{c.totalValue.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {(onAccept || onCounter || onReject) && (
          <div className="mt-4 pt-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            {expired && <p className="text-amber-300 text-xs text-center mb-2">⚠ This offer has expired</p>}
            {!expired && onAccept && (
              <button disabled={accepting}
                onClick={async () => { setAccepting(true); await onAccept(); setAccepting(false); }}
                className="w-full py-2.5 rounded-full text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "#22c55e" }}>
                <Check className="w-4 h-4" />{accepting ? "Accepting..." : `Accept · ₹${req.totalValue.toLocaleString("en-IN")}`}
              </button>
            )}
            {!expired && !isFinal && onCounter && (
              <button onClick={onCounter}
                className="w-full py-2.5 rounded-full text-white text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: PINK }}>
                <MessageCircle className="w-4 h-4" />Negotiate (Counter-Offer)
              </button>
            )}
            {!expired && onReject && (
              <button onClick={onReject}
                className="w-full py-2 rounded-full text-sm font-semibold flex items-center justify-center gap-2"
                style={{ color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <XIcon className="w-4 h-4" />Reject
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BrandProfileModal({ brandId, brandName, brandLogo, onClose, onBack }: {
  brandId: string; brandName: string | null; brandLogo: string | null; onClose: () => void; onBack: () => void;
}) {
  const { apiFetch } = useCreatorAuth();
  const [brand, setBrand] = useState<any>(null);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brandId) return;
    apiFetch(`/api/creator/brands/${brandId}/profile`)
      .then(r => r.json())
      .then(d => {
        if (d.brand) setBrand(d.brand);
        if (d.customFields) setCustomFields(d.customFields);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [brandId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>

        <div className="flex items-center justify-between mb-4 sticky top-0 -mx-5 px-5 pb-3" style={{ background: "#15151D", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={onBack} className="flex items-center gap-1 text-white/75 text-xs hover:text-white transition-colors">
            ← Back to offer
          </button>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: PINK, borderTopColor: "transparent" }} />
          </div>
        ) : !brand ? (
          <p className="text-white/70 text-sm text-center py-10">Brand profile not available.</p>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-5">
              {brand.logoUrl
                ? <img src={brand.logoUrl} alt={brand.brandName} className="w-16 h-16 rounded-2xl object-cover" />
                : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0" style={{ background: PINK }}>{brand.brandName?.slice(0, 1)}</div>}
              <div className="min-w-0">
                <p className="text-white font-bold text-base">{brand.brandName}</p>
                {(brand.categoryName || brand.subcategoryName) && (
                  <p className="text-white/70 text-xs mt-0.5">{[brand.categoryName, brand.subcategoryName].filter(Boolean).join(" · ")}</p>
                )}
              </div>
            </div>

            {brand.bio && (
              <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-white/75 text-[10px] uppercase font-semibold mb-1.5">About</p>
                <p className="text-white/80 text-xs leading-relaxed">{brand.bio}</p>
              </div>
            )}

            {(brand.websiteUrl || brand.instagramHandle) && (
              <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-white/75 text-[10px] uppercase font-semibold mb-1">Links</p>
                {brand.websiteUrl && (
                  <a href={brand.websiteUrl.startsWith("http") ? brand.websiteUrl : `https://${brand.websiteUrl}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs hover:opacity-80 transition-opacity"
                    style={{ color: PINK }}>
                    <Globe className="w-3.5 h-3.5" />
                    <span className="truncate">{brand.websiteUrl}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                )}
                {brand.instagramHandle && (
                  <a href={`https://instagram.com/${brand.instagramHandle.replace(/^@/, "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs hover:opacity-80 transition-opacity"
                    style={{ color: PINK }}>
                    <Instagram className="w-3.5 h-3.5" />
                    <span>@{brand.instagramHandle.replace(/^@/, "")}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                )}
              </div>
            )}

            {customFields.length > 0 && (
              <div className="rounded-xl p-3 mb-3 space-y-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-white/75 text-[10px] uppercase font-semibold mb-1.5">Brand Details</p>
                {customFields.map((f, i) => (
                  <div key={i}>
                    <p className="text-white/70 text-[10px] uppercase mb-0.5">{f.label}</p>
                    <p className="text-white/80 text-xs">{f.value}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChainViewModal({ req, chain, onClose }: { req: RequestRow; chain: RequestRow[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-base">Negotiation History · {req.brandName}</h3>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>
        <div className="space-y-3">
          {chain.map(c => (
            <div key={c.id} className="rounded-xl p-3"
              style={{ background: c.proposedBy === "BRAND" ? "rgba(240,24,122,0.08)" : "rgba(34,197,94,0.08)", border: `1px solid ${c.proposedBy === "BRAND" ? "rgba(240,24,122,0.25)" : "rgba(34,197,94,0.25)"}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/85 text-[11px] font-semibold">Round {c.roundNumber} · {c.proposedBy}</span>
                <span className="text-white/70 text-[10px]">{new Date(c.createdAt).toLocaleString("en-IN")}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-white/75 mb-2">
                <span>{c.reelCount} R @ ₹{c.pricePerReel}</span>
                <span>{c.storyCount} S @ ₹{c.pricePerStory}</span>
                <span>{c.postCount} P @ ₹{c.pricePerPost}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white font-bold">₹{c.totalValue.toLocaleString("en-IN")}</span>
                <span className="text-white/75">{c.timelineDays} days</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
