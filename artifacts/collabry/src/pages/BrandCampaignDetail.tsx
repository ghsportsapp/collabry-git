import { useState, useEffect, useCallback } from "react";
import { useServerTime } from "@/hooks/useServerTime";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Star, Clock, Sparkles, AlertTriangle,
  X as XIcon, Pause, Play, Trash2, ChevronDown, ChevronUp,
  Lock, Users, UserCircle2,
  CreditCard, Eye, IndianRupee, BadgeCheck, Hourglass, MapPin,
} from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";
import UnlockCelebration from "@/components/UnlockCelebration";

const TABS = ["Applications", "Shortlisted", "Selected"];
const CARD_BG = "#100810";
const CARD_BORDER = "rgba(255,255,255,0.08)";

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  LIVE:             { color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  HIDDEN:           { color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  PAUSED:           { color: "#60A5FA", bg: "rgba(96,165,250,0.15)" },
  PENDING_APPROVAL: { color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  CREDIT_HOLD:      { color: "#F97316", bg: "rgba(249,115,22,0.15)" },
  REJECTED:         { color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  EXPIRED:          { color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" },
  DELETED:          { color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
};


function fmtK(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
       : n >= 1_000     ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
       : String(n ?? 0);
}

function fmtPrice(min: number, max: number) {
  const f = (v: number) => v >= 1000 ? `${Math.round(v / 100) * 100 >= 1000 ? `${(v / 1000).toFixed(0)}K` : Math.round(v)}` : String(Math.round(v));
  return `₹${f(+min)}-${f(+max)}`;
}

function StatTile({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center py-3.5 px-2 rounded-2xl flex-1"
      style={{ background: "rgba(240,24,122,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
      <span className="font-bold text-base" style={{ fontFamily: POPPINS, color: color ?? "#fff" }}>{value}</span>
      <span className="text-white/70 text-[10px] mt-0.5 text-center" style={{ fontFamily: POPPINS }}>{label}</span>
    </div>
  );
}

// ── Portfolio images strip ────────────────────────────────────────────────────

function PortfolioStrip({ images, locked }: { images: string[] | null; locked?: boolean }) {
  const imgs = (images ?? []).slice(0, 4);
  if (imgs.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-1.5 mt-3">
      {imgs.map((src, i) => (
        <div key={i} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
          <img src={src} alt="" className="w-full h-full object-cover"
            style={{ filter: locked ? "blur(10px) brightness(0.5)" : "none" }} />
          {locked && i === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Lock className="w-4 h-4 text-white/70" />
            </div>
          )}
        </div>
      ))}
      {/* Fill remaining slots with placeholder boxes */}
      {Array.from({ length: Math.max(0, 4 - imgs.length) }).map((_, i) => (
        <div key={`ph-${i}`} className="rounded-xl" style={{ aspectRatio: "1/1", background: "rgba(255,255,255,0.04)" }} />
      ))}
    </div>
  );
}

// ── Shared card meta row (pricing + follower) ─────────────────────────────────

function CreatorMetaRow({ app, showIdentity }: { app: any; showIdentity: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2.5">
      <div className="flex items-center gap-1">
        {showIdentity && app.profilePhotoUrl ? (
          <img src={app.profilePhotoUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ background: showIdentity ? `${PINK}30` : "rgba(255,255,255,0.08)" }}>
            {showIdentity
              ? <span className="text-[9px] font-bold" style={{ color: PINK }}>{app.fullName?.[0] ?? "?"}</span>
              : <UserCircle2 className="w-3.5 h-3.5 text-white/70" />}
          </div>
        )}
        <span className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
          {fmtK(app.followerCount ?? 0)} followers
        </span>
      </div>
      {app.averageRating > 0 && (
        <span className="flex items-center gap-0.5 text-[11px]" style={{ color: "#F59E0B", fontFamily: POPPINS }}>
          <Star className="w-3 h-3 fill-current" />{parseFloat(app.averageRating).toFixed(1)}
        </span>
      )}
    </div>
  );
}

function CreatorTagsRow({ app }: { app: any }) {
  return (
    <>
      {app.categories?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {app.categories.map((c: any, i: number) => (
            <span key={i} className="px-2.5 py-0.5 rounded-full text-[11px]"
              style={{ background: `${PINK}18`, color: PINK, fontFamily: POPPINS }}>{c.name}</span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1">
        {app.creatorGender && (
          <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>
            {app.audienceGenderFemale != null && app.audienceGenderMale != null
              ? `${app.audienceGenderFemale}% Female ${app.audienceGenderMale}% Male`
              : app.creatorGender}
          </span>
        )}
        {app.creatorAge != null && (
          <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>Age {app.creatorAge}</span>
        )}
        {app.audienceAge && (
          <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>Audience {app.audienceAge}</span>
        )}
      </div>
      {app.creatorState && (
        <div className="flex items-center gap-1 mt-0.5 mb-1">
          <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: "rgba(255,255,255,0.70)" }} />
          <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>{app.creatorState}, India</span>
        </div>
      )}
    </>
  );
}

// ── Applicant cards ──────────────────────────────────────────────────────────

function AnonymousCard({ app, onShortlist }: { app: any; onShortlist: (id: string) => Promise<boolean> }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
      <CreatorMetaRow app={app} showIdentity={false} />
      <CreatorTagsRow app={app} />
      <PortfolioStrip images={app.portfolioImages} locked={false} />
      <button
        onClick={async () => { setLoading(true); const ok = await onShortlist(app.id); setLoading(false); if (ok) setDone(true); }}
        disabled={loading || done}
        className="w-full mt-3 py-2.5 rounded-xl text-white font-semibold text-sm transition-all"
        style={{ background: done ? "#10B981" : loading ? `${PINK}80` : PINK, fontFamily: POPPINS }}>
        {done ? "Shortlisted ✓" : loading ? "Shortlisting…" : "Shortlist (Free)"}
      </button>
    </div>
  );
}

function ShortlistedCard({ app, onRequestUnlock, onSelectClick, onViewProfile }: {
  app: any;
  onRequestUnlock: (app: any) => void;
  onSelectClick: (app: any) => void;
  onViewProfile: (creatorId: string, appId: string) => void;
}) {
  const isLocked = !app.isUnlocked;

  return (
    <div className="rounded-2xl p-4 mb-3 transition-all"
      style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>

      {/* Identity row when unlocked */}
      {!isLocked && (
        <div className="flex items-center gap-2.5 mb-3">
          {app.profilePhotoUrl
            ? <img src={app.profilePhotoUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            : <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm"
                style={{ background: `${PINK}25`, color: PINK }}>{app.fullName?.[0] ?? "?"}</div>}
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>{app.fullName}</p>
            <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>@{app.instagramHandle}</p>
          </div>
        </div>
      )}

      <CreatorMetaRow app={app} showIdentity={!isLocked} />
      <CreatorTagsRow app={app} />
      <PortfolioStrip images={app.portfolioImages} locked={false} />

      {/* CTA */}
      <div className="flex gap-2 mt-3">
        {isLocked ? (
          <button onClick={() => onRequestUnlock(app)}
            className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
            style={{ background: PINK, fontFamily: POPPINS }}>
            <Sparkles className="w-3.5 h-3.5" />
            Unlock Full Profile – 1 Credit
          </button>
        ) : (
          <>
            <button onClick={() => onViewProfile(app.creatorId, app.id)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "transparent", border: `1px solid ${PINK}`, color: PINK, fontFamily: POPPINS }}>
              Profile Unlocked — View Full Profile
            </button>
            <button onClick={() => onSelectClick(app)}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold flex-shrink-0"
              style={{ background: "#10B981", fontFamily: POPPINS }}>
              Select
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Deal-status helpers ───────────────────────────────────────────────────────

const DEAL_STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDING_PAYMENT: { label: "Payment Due",   color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)" },
  IN_ESCROW:       { label: "Deal Live",      color: "#10B981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.30)" },
  COMPLETED:       { label: "Completed",      color: "#60A5FA", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.30)" },
  DISPUTED:        { label: "Disputed",       color: "#F87171", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.30)"  },
  CANCELLED:       { label: "Cancelled",      color: "#9CA3AF", bg: "rgba(156,163,175,0.12)",border: "rgba(156,163,175,0.30)"},
};

// ── Selected creator card ─────────────────────────────────────────────────────

function SelectedCreatorCard({
  app, campaignType, onViewProfile, onPay,
}: {
  app: any; campaignType?: string;
  onViewProfile: (creatorId: string) => void;
  onPay: (app: any) => void;
}) {
  const { serverNow } = useServerTime();
  const isPendingConfirm = app.status === "SELECTED" && !app.dealId;
  const dealStatusKey = app.dealStatus as string | null;
  const meta = dealStatusKey ? DEAL_STATUS_META[dealStatusKey] : null;
  const isPendingPayment = dealStatusKey === "PENDING_PAYMENT";
  const isDealLive = dealStatusKey === "IN_ESCROW";

  const deadline = app.confirmationDeadline ? new Date(app.confirmationDeadline).getTime() : 0;
  const remaining = deadline - serverNow;
  const hours = Math.max(0, Math.floor(remaining / 3600000));
  const mins = Math.max(0, Math.floor((remaining % 3600000) / 60000));

  const followers = fmtK(app.followerCount ?? 0);
  const dealValue = app.totalAgreedValue ? `₹${parseFloat(app.totalAgreedValue).toLocaleString("en-IN")}` : null;
  const rating = app.averageRating && parseFloat(app.averageRating) > 0 ? parseFloat(app.averageRating).toFixed(1) : null;

  const cardGlow = isPendingPayment
    ? { border: "1px solid rgba(245,158,11,0.45)", boxShadow: "0 0 20px rgba(245,158,11,0.10)" }
    : isDealLive
    ? { border: "1px solid rgba(16,185,129,0.35)", boxShadow: "0 0 20px rgba(16,185,129,0.08)" }
    : { border: `1px solid ${CARD_BORDER}` };

  return (
    <div className="rounded-2xl mb-4 overflow-hidden" style={{ background: CARD_BG, ...cardGlow }}>

      {/* Payment-due banner */}
      {isPendingPayment && (
        <div className="px-4 py-2.5 flex items-center gap-2"
          style={{ background: "rgba(245,158,11,0.10)", borderBottom: "1px solid rgba(245,158,11,0.18)" }}>
          <CreditCard className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
          <p className="text-amber-300 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
            Action required — pay to activate this deal
          </p>
        </div>
      )}
      {isDealLive && (
        <div className="px-4 py-2.5 flex items-center gap-2"
          style={{ background: "rgba(16,185,129,0.08)", borderBottom: "1px solid rgba(16,185,129,0.15)" }}>
          <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#10B981" }} />
          <p className="text-emerald-300 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
            Deal is live — content workflow has started
          </p>
        </div>
      )}

      <div className="p-4">
        {/* Profile header */}
        <div className="flex items-start gap-3 mb-4">
          {app.profilePhotoUrl
            ? <img src={app.profilePhotoUrl} alt="" className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
                style={{ border: `2px solid ${isPendingPayment ? "rgba(245,158,11,0.5)" : isDealLive ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.10)"}` }} />
            : <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-bold"
                style={{ background: `linear-gradient(135deg,${PINK}40,${PINK}15)`, color: PINK, border: `2px solid ${PINK}35` }}>
                {app.fullName?.[0] ?? "?"}
              </div>}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <p className="text-white font-bold text-base leading-tight" style={{ fontFamily: POPPINS }}>{app.fullName}</p>
              {meta && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                  style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, fontFamily: POPPINS }}>
                  {meta.label}
                </span>
              )}
              {isPendingConfirm && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                  style={{ color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", fontFamily: POPPINS }}>
                  Awaiting
                </span>
              )}
            </div>
            <p className="text-white/70 text-xs mb-2" style={{ fontFamily: POPPINS }}>@{app.instagramHandle}</p>

            {/* Stats chips */}
            <div className="flex flex-wrap gap-1.5">
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
                <Users className="w-3 h-3" style={{ color: PINK }} />{followers}
              </span>
              {rating && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "rgba(245,158,11,0.10)", color: "#F59E0B", fontFamily: POPPINS }}>
                  <Star className="w-3 h-3 fill-current" />{rating}
                </span>
              )}
              {dealValue && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "rgba(240,24,122,0.12)", color: PINK, fontFamily: POPPINS }}>
                  <IndianRupee className="w-3 h-3" />{dealValue.replace("₹", "")}
                </span>
              )}
              {app.contentType && (
                <span className="px-2 py-1 rounded-full text-[11px]"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", fontFamily: POPPINS }}>
                  {app.contentType}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Categories */}
        {(app.categories ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(app.categories as any[]).map((c: any, i: number) => (
              <span key={i} className="px-2.5 py-0.5 rounded-full text-[11px]"
                style={{ background: `${PINK}15`, color: PINK, border: `1px solid ${PINK}25`, fontFamily: POPPINS }}>
                {c.name}
              </span>
            ))}
          </div>
        )}

        {/* Awaiting countdown */}
        {isPendingConfirm && remaining > 0 && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-xl"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <Hourglass className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
            <p className="text-amber-300/90 text-xs" style={{ fontFamily: POPPINS }}>
              Creator has <span className="font-bold">{hours}h {mins}m</span> left to confirm
            </p>
          </div>
        )}
        {isPendingConfirm && remaining <= 0 && deadline > 0 && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-xl"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <Clock className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
            <p className="text-red-300 text-xs" style={{ fontFamily: POPPINS }}>Confirmation window expired — slot will reopen shortly</p>
          </div>
        )}

        {/* Payment due info */}
        {isPendingPayment && dealValue && (() => {
          const base = parseFloat(app.totalAgreedValue ?? "0");
          const gstRate = parseFloat(app.gstRateLocked ?? "18") || 18;
          const gstAmt = +(base * gstRate / 100).toFixed(2);
          const total = +(base + gstAmt).toFixed(2);
          const fmt = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
          return (
            <div className="mb-4 p-3 rounded-xl space-y-2"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
              <div className="flex items-center justify-between">
                <p className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>Base amount</p>
                <p className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>{fmt(base)}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>GST ({gstRate}%)</p>
                <p className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>+ {fmt(gstAmt)}</p>
              </div>
              <div className="flex items-center justify-between pt-1.5" style={{ borderTop: "1px solid rgba(245,158,11,0.20)" }}>
                <p className="text-white/90 text-xs font-semibold" style={{ fontFamily: POPPINS }}>Total due</p>
                <p className="text-amber-300 font-bold text-base leading-tight" style={{ fontFamily: POPPINS }}>{fmt(total)}</p>
              </div>
              <p className="text-white/70 text-[10px] text-right" style={{ fontFamily: POPPINS }}>Held in Escrow</p>
            </div>
          );
        })()}

        {/* CTA buttons */}
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => onViewProfile(app.creatorId)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
            style={{ background: "transparent", border: `1px solid ${PINK}60`, color: PINK, fontFamily: POPPINS }}>
            <Eye className="w-3.5 h-3.5" />
            View Profile
          </button>
          {isPendingPayment && (
            <button
              onClick={() => onPay(app)}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
              style={{ background: `linear-gradient(135deg, ${PINK}, #c0106a)`, boxShadow: `0 4px 16px ${PINK}50`, fontFamily: POPPINS }}>
              <CreditCard className="w-3.5 h-3.5" />
              Make Payment
            </button>
          )}
          {isDealLive && (
            <button
              onClick={() => {}}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 opacity-60 cursor-default"
              style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.25)", fontFamily: POPPINS }}>
              <BadgeCheck className="w-3.5 h-3.5" style={{ color: "#10B981" }} />
              <span style={{ color: "#10B981" }}>Active</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Payment modal ─────────────────────────────────────────────────────────────

function PaymentModal({
  app, onClose, onConfirm,
}: {
  app: any; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const dealValue = app.totalAgreedValue ? parseFloat(app.totalAgreedValue) : 0;
  const gstRate = parseFloat(app.gstRateLocked ?? "18") || 18;
  const gstAmt = +(dealValue * gstRate / 100).toFixed(2);
  const totalPayable = +(dealValue + gstAmt).toFixed(2);
  const fmtINR = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.88)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md rounded-2xl overflow-hidden"
        style={{ background: "#12101A", border: `1px solid ${PINK}40`, boxShadow: `0 0 40px ${PINK}20`, fontFamily: POPPINS }}>

        {/* Modal header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-white font-bold text-base">Confirm Payment</h3>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <XIcon className="w-5 h-5 text-white/70" />
            </button>
          </div>
          <p className="text-white/70 text-xs">Funds will be held securely in escrow until the deal is completed</p>
        </div>

        {/* Creator summary */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            {app.profilePhotoUrl
              ? <img src={app.profilePhotoUrl} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
              : <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                  style={{ background: `${PINK}25`, color: PINK }}>{app.fullName?.[0] ?? "?"}</div>}
            <div>
              <p className="text-white font-semibold text-sm">{app.fullName}</p>
              <p className="text-white/70 text-xs">@{app.instagramHandle} · {fmtK(app.followerCount ?? 0)} followers</p>
            </div>
          </div>
        </div>

        {/* Amount breakdown */}
        <div className="px-5 py-4">
          <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(240,24,122,0.08)", border: `1px solid ${PINK}25` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/75 text-sm">Campaign payment</span>
              <span className="text-white font-bold text-sm">{fmtINR(dealValue)}</span>
            </div>
            <div className="flex items-center justify-between mb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
              <span className="text-white/75 text-sm">GST ({gstRate}%)</span>
              <span className="text-white/90 font-semibold text-sm">+ {fmtINR(gstAmt)}</span>
            </div>
            <div className="flex items-center justify-between mb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
              <span className="text-white/75 text-sm">Held in escrow</span>
              <span className="text-emerald-400 font-semibold text-sm">{fmtINR(totalPayable)}</span>
            </div>
            <div className="flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
              <span className="text-white font-bold text-sm">Total due now</span>
              <span className="font-bold text-lg" style={{ color: PINK }}>{fmtINR(totalPayable)}</span>
            </div>
          </div>

          <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)" }}>
            <div className="flex items-start gap-2">
              <BadgeCheck className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#10B981" }} />
              <p className="text-emerald-300/80 text-xs leading-relaxed">
                Your money is protected. Funds are released to the creator only after you approve their content deliverables.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-white/80 text-sm font-semibold"
              style={{ border: "1px solid rgba(255,255,255,0.10)" }}>
              Cancel
            </button>
            <button
              disabled={submitting}
              onClick={async () => { setSubmitting(true); try { await onConfirm(); } finally { setSubmitting(false); } }}
              className="flex-1 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all"
              style={{ background: submitting ? `${PINK}70` : `linear-gradient(135deg,${PINK},#c0106a)`, boxShadow: submitting ? "none" : `0 4px 16px ${PINK}40` }}>
              <CreditCard className="w-4 h-4" />
              {submitting ? "Processing…" : `Pay ${fmtINR(totalPayable)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────

function SelectConfirmModal({ app, onClose, onConfirm, slotsFull }: { app: any; onClose: () => void; onConfirm: () => Promise<void>; slotsFull?: boolean }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-sm">Select @{app.instagramHandle}?</h3>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>
        {slotsFull && (
          <div className="rounded-xl p-3.5 mb-4" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)" }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
              <p className="text-red-300 text-xs leading-relaxed font-semibold">
                All slots for this campaign are filled. You cannot select more creators.
              </p>
            </div>
          </div>
        )}
        <div className="rounded-xl p-3.5 mb-5" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
            <div>
              <p className="text-amber-300 text-xs font-semibold mb-1">48-hour confirmation rule</p>
              <p className="text-white/90 text-xs leading-relaxed">
                The creator has 48 hours to start the deal or reject it. If they don't respond, the selection auto-expires and the slot reopens.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-white/90 text-xs font-semibold"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}>Cancel</button>
          <button disabled={submitting || slotsFull}
            onClick={async () => { setSubmitting(true); try { await onConfirm(); } finally { setSubmitting(false); } }}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold"
            style={{ background: submitting || slotsFull ? "rgba(16,185,129,0.35)" : "#10B981", cursor: slotsFull ? "not-allowed" : undefined }}>
            {submitting ? "Selecting…" : "Confirm Select"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ campaignName, onClose, onConfirm }: { campaignName: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-sm">Delete Campaign?</h3>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>
        <div className="rounded-xl p-3.5 mb-5" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
            <div>
              <p className="text-red-300 text-xs font-semibold mb-1">This action cannot be undone</p>
              <p className="text-white/80 text-xs leading-relaxed">
                "{campaignName}" will be permanently removed from creator discovery. No refunds on credits already charged.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-white/90 text-xs font-semibold"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}>Cancel</button>
          <button disabled={submitting}
            onClick={async () => { setSubmitting(true); try { await onConfirm(); } finally { setSubmitting(false); } }}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold"
            style={{ background: submitting ? "rgba(239,68,68,0.5)" : "#EF4444" }}>
            {submitting ? "Deleting…" : "Delete Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BrandCampaignDetail() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState(0);
  const [campaign, setCampaign] = useState<any>(null);
  const [apps, setApps] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" }>({ text: "", type: "success" });
  const [celeb, setCeleb] = useState<{ show: boolean; username: string | null; fullName: string | null }>({ show: false, username: null, fullName: null });
  const [selectCeleb, setSelectCeleb] = useState(false);
  const [confirmApp, setConfirmApp] = useState<any | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<"pause" | "resume" | null>(null);
  const [unlockPendingApp, setUnlockPendingApp] = useState<any | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [payingDeal, setPayingDeal] = useState<any | null>(null);
  const { total: creditTotal } = useBrandCredits();

  useEffect(() => { if (!authLoading && !brandId) navigate("/login-brand"); }, [brandId, authLoading]);

  const loadCampaign = useCallback(async () => {
    const r = await apiFetch(`/api/brand/campaigns/${id}`);
    if (r.ok) setCampaign(await r.json());
    else setError("Campaign not found");
  }, [id, apiFetch]);

  const loadApps = useCallback(async () => {
    const statuses = ["PENDING", "SHORTLISTED", "SELECTED"];
    const r = await apiFetch(`/api/brand/campaigns/${id}/applications?status=${statuses[tab]}`);
    if (r.ok) setApps(await r.json());
    else setApps([]);
  }, [id, tab, apiFetch]);

  useEffect(() => { if (brandId) loadCampaign(); }, [loadCampaign, brandId]);
  useEffect(() => {
    if (brandId) { setApps(null); loadApps(); }
  }, [loadApps, brandId, tab]);

  const flash = (text: string, type: "success" | "error" = "success") => {
    setMsg({ text, type }); setTimeout(() => setMsg({ text: "", type: "success" }), 3500);
  };

  const handleShortlist = async (appId: string): Promise<boolean> => {
    const r = await apiFetch(`/api/brand/campaigns/${id}/applications/${appId}/shortlist`, { method: "POST" });
    if (r.ok) { loadCampaign(); setTimeout(() => setTab(1), 800); return true; }
    const d = await r.json(); flash(d.error ?? "Failed to shortlist", "error"); return false;
  };

  const handleUnlock = async () => {
    if (!unlockPendingApp) return;
    setUnlocking(true);
    setUnlockError(null);
    const r = await apiFetch(`/api/brand/campaigns/${id}/applications/${unlockPendingApp.id}/unlock`, { method: "POST" });
    setUnlocking(false);
    if (r.ok) {
      const d = await r.json();
      setUnlockPendingApp(null);
      setCeleb({ show: true, username: d.instagramHandle ?? null, fullName: d.fullName ?? null });
      setTimeout(() => setCeleb(s => ({ ...s, show: false })), 1800);
      loadApps();
    } else {
      const d = await r.json().catch(() => ({}));
      setUnlockError(d.message ?? d.error ?? "Failed to unlock");
    }
  };

  const handleSelect = async (appId: string) => {
    const r = await apiFetch(`/api/brand/campaigns/${id}/applications/${appId}/select`, { method: "POST" });
    if (r.ok) {
      setConfirmApp(null);
      setSelectCeleb(true);
      loadApps(); loadCampaign();
    } else {
      const d = await r.json(); flash(d.error ?? "Failed to select", "error");
    }
  };

  const handlePause = async () => {
    setActionLoading("pause");
    const r = await apiFetch(`/api/brand/campaigns/${id}/pause`, { method: "PATCH" });
    setActionLoading(null);
    if (r.ok) { flash("Campaign paused. Creators can no longer see or apply."); loadCampaign(); }
    else { const d = await r.json().catch(() => ({})); flash(d.error ?? "Failed to pause", "error"); }
  };

  const handleResume = async () => {
    setActionLoading("resume");
    const r = await apiFetch(`/api/brand/campaigns/${id}/resume`, { method: "PATCH" });
    setActionLoading(null);
    if (r.ok) { flash("Campaign resumed! Creators can now see and apply."); loadCampaign(); }
    else { const d = await r.json().catch(() => ({})); flash(d.error ?? "Failed to resume", "error"); }
  };

  const handleDelete = async () => {
    const r = await apiFetch(`/api/brand/campaigns/${id}`, { method: "DELETE" });
    if (r.ok) { navigate("/home-brand/campaigns"); }
    else { const d = await r.json().catch(() => ({})); flash(d.error ?? "Failed to delete", "error"); setShowDelete(false); }
  };

  const handlePay = async () => {
    if (!payingDeal?.dealId) return;
    const r = await apiFetch(`/api/brand/campaigns/deals/${payingDeal.dealId}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      setPayingDeal(null);
      const params = new URLSearchParams({
        status: "CHARGED",
        context: "deal",
        dealId: d.dealId ?? payingDeal.dealId,
        amount: String(d.amount ?? ""),
        orderId: d.orderId ?? "",
      });
      navigate(`/payment-return?${params.toString()}`);
    } else {
      const d = await r.json().catch(() => ({}));
      flash(d.error ?? "Payment failed", "error");
      setPayingDeal(null);
    }
  };

  if (authLoading || !brandId) return null;

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const daysLeft = campaign?.expiresAt ? Math.max(0, Math.ceil((new Date(campaign.expiresAt).getTime() - Date.now()) / 86400000)) : null;
  const isExpired = campaign?.expiresAt ? new Date(campaign.expiresAt) <= new Date() : false;
  const statusInfo = STATUS_COLORS[campaign?.status] ?? { color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" };
  const canPause = ["LIVE", "HIDDEN"].includes(campaign?.status) && !isExpired;
  const canResume = campaign?.status === "PAUSED" && !isExpired;
  const canDelete = campaign?.status !== "DELETED";
  const showTabs = ["LIVE", "HIDDEN", "PAUSED"].includes(campaign?.status);

  return (
    <BrandLayout>
      <UnlockCelebration show={celeb.show} username={celeb.username} fullName={celeb.fullName} />

      {/* Creator Selected popup */}
      {selectCeleb && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px", background: "rgba(0,0,0,0.6)" }}>
          <div style={{ background: "#16161E", border: "1px solid rgba(240,24,122,0.25)", borderRadius: 20, padding: "32px 28px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 0 60px rgba(240,24,122,0.15)" }}>
            <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 14 }}>🎉</div>
            <p style={{ color: "white", fontFamily: POPPINS, fontWeight: 700, fontSize: 20, margin: 0 }}>Creator Selected!</p>
            <p style={{ color: "rgba(255,255,255,0.8)", fontFamily: POPPINS, fontSize: 14, margin: "10px 0 24px", lineHeight: 1.6 }}>
              You've selected this creator for the campaign.<br />Waiting for their confirmation (48h window).
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setSelectCeleb(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.90)", fontFamily: POPPINS, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                View Campaign
              </button>
              <button
                onClick={() => { setSelectCeleb(false); setTab(2); }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: PINK, color: "white", fontFamily: POPPINS, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Go to Selected
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 pt-5 pb-28">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate("/home-brand/campaigns")}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.07)" }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>Paid Campaign</p>
            <h1 className="text-white font-bold text-lg leading-snug truncate" style={{ fontFamily: POPPINS }}>
              {campaign?.name ?? "Loading…"}
            </h1>
          </div>
          {campaign && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
              style={{ color: statusInfo.color, background: statusInfo.bg, fontFamily: POPPINS }}>
              {campaign.status === "LIVE" ? "Active" : campaign.status === "HIDDEN" ? "Full" : campaign.status === "PAUSED" ? "Paused" : campaign.status.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {/* Flash */}
        {msg.text && (
          <div className="rounded-xl p-3 mb-4"
            style={{ background: msg.type === "error" ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${msg.type === "error" ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}` }}>
            <p className="text-xs" style={{ color: msg.type === "error" ? "#F87171" : "#34D399", fontFamily: POPPINS }}>{msg.text}</p>
          </div>
        )}
        {error && <p className="text-red-400 text-xs mb-4" style={{ fontFamily: POPPINS }}>{error}</p>}

        {campaign && (
          <>
            {/* Stat row */}
            <div className="flex gap-2.5 mb-4">
              <StatTile label="Creator Selected" value={`${campaign.slotsFilled ?? 0}/${campaign.slotCount}`} />
              <StatTile label="Price / Creator" value={`₹${parseFloat(campaign.pricePerCreator ?? 0).toLocaleString("en-IN")}`} color={PINK} />
              <StatTile label={daysLeft !== null && daysLeft <= 3 ? "Expires Soon!" : "Expires In"} value={daysLeft !== null ? `${daysLeft}d` : "—"} color={daysLeft !== null && daysLeft <= 3 ? "#F59E0B" : undefined} />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {canPause && (
                <button onClick={handlePause} disabled={actionLoading === "pause"}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(96,165,250,0.15)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.3)", fontFamily: POPPINS }}>
                  <Pause className="w-3 h-3" />
                  {actionLoading === "pause" ? "Pausing…" : "Pause Campaign"}
                </button>
              )}
              {canResume && (
                <button onClick={handleResume} disabled={actionLoading === "resume"}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)", fontFamily: POPPINS }}>
                  <Play className="w-3 h-3" />
                  {actionLoading === "resume" ? "Resuming…" : "Resume Campaign"}
                </button>
              )}
              {campaign?.status === "PAUSED" && isExpired && (
                <p className="text-xs text-white/70 self-center" style={{ fontFamily: POPPINS }}>Campaign expired — cannot be resumed</p>
              )}
              {canDelete && (
                <button onClick={() => setShowDelete(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold ml-auto"
                  style={{ background: "rgba(239,68,68,0.10)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)", fontFamily: POPPINS }}>
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </div>

            {/* Status banners */}
            {campaign.status === "PENDING_APPROVAL" && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <p className="text-amber-400 text-xs" style={{ fontFamily: POPPINS }}>⏳ Your campaign is under review. Credits are only charged on approval.</p>
              </div>
            )}
            {campaign.status === "CREDIT_HOLD" && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <p className="text-orange-400 text-xs" style={{ fontFamily: POPPINS }}>⚠ Approved! Top up your credits to go live.</p>
              </div>
            )}
            {campaign.status === "REJECTED" && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p className="text-red-400 text-xs font-semibold mb-0.5" style={{ fontFamily: POPPINS }}>Not Approved</p>
                {campaign.adminRejectionReason && <p className="text-red-300 text-xs" style={{ fontFamily: POPPINS }}>{campaign.adminRejectionReason}</p>}
              </div>
            )}
            {campaign.status === "PAUSED" && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                <p className="text-blue-300 text-xs" style={{ fontFamily: POPPINS }}>
                  ⏸ Campaign is paused — not visible to creators. {isExpired ? "This campaign has expired and cannot be resumed." : "Resume anytime before expiry."}
                </p>
              </div>
            )}

            {/* Campaign details collapsible */}
            <div className="rounded-2xl mb-5 overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
              <button onClick={() => setDetailsOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{ fontFamily: POPPINS, background: detailsOpen ? `${PINK}18` : "rgba(255,255,255,0.04)", border: detailsOpen ? `1px solid ${PINK}60` : "none" }}>
                <span className="font-semibold text-xs" style={{ color: detailsOpen ? PINK : "rgba(255,255,255,0.9)" }}>Campaign Details</span>
                {detailsOpen ? <ChevronUp className="w-4 h-4" style={{ color: PINK }} /> : <ChevronDown className="w-4 h-4 text-white/70" />}
              </button>
              {detailsOpen && (
                <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="pt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>Content Type</p>
                      <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>
                        {campaign.type === "REEL" ? "Instagram Reel" : campaign.type === "STORY" ? "Instagram Story" : "Instagram Post"}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>Target Gender</p>
                      <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{campaign.targetGender ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>Content Timeline</p>
                      <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{campaign.timelineDays ? `${campaign.timelineDays} days` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>Expires On</p>
                      <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{fmtDate(campaign.expiresAt)}</p>
                    </div>
                  </div>
                  {campaign.categories?.length > 0 && (
                    <div>
                      <p className="text-white/70 text-xs mb-1.5" style={{ fontFamily: POPPINS }}>Categories</p>
                      <div className="flex flex-wrap gap-1.5">
                        {campaign.categories.map((c: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs"
                            style={{ background: `${PINK}20`, color: PINK, fontFamily: POPPINS }}>{c.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {campaign.slabs?.length > 0 && (
                    <div>
                      <p className="text-white/70 text-xs mb-1.5" style={{ fontFamily: POPPINS }}>Follower Tiers</p>
                      <div className="flex flex-wrap gap-1.5">
                        {campaign.slabs.map((s: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs"
                            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)", fontFamily: POPPINS }}>{s.label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {campaign.brief && (
                    <div>
                      <p className="text-white/70 text-xs mb-1" style={{ fontFamily: POPPINS }}>Brief</p>
                      <p className="text-white/80 text-xs leading-relaxed break-all" style={{ fontFamily: POPPINS }}>{campaign.brief}</p>
                    </div>
                  )}
                  {campaign.keyMessage && (
                    <div>
                      <p className="text-white/70 text-xs mb-1" style={{ fontFamily: POPPINS }}>Key Message</p>
                      <p className="text-white/80 text-xs leading-relaxed break-all" style={{ fontFamily: POPPINS }}>{campaign.keyMessage}</p>
                    </div>
                  )}
                  {campaign.productPhotos?.length > 0 && (
                    <div>
                      <p className="text-white/70 text-xs mb-2" style={{ fontFamily: POPPINS }}>Product Photos</p>
                      <div className="flex gap-2 flex-wrap">
                        {campaign.productPhotos.map((url: string, i: number) => (
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
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Applications section */}
        {showTabs && (
          <>
            {/* Tabs */}
            <div className="grid grid-cols-3 gap-1.5 mb-5">
              {TABS.map((t, i) => (
                <button key={t} onClick={() => setTab(i)}
                  className="py-2.5 rounded-xl text-xs font-semibold text-center transition-all"
                  style={{
                    background: tab === i ? PINK : "rgba(255,255,255,0.06)",
                    color: tab === i ? "#fff" : "rgba(255,255,255,0.7)",
                    border: `1px solid ${tab === i ? PINK : "rgba(255,255,255,0.08)"}`,
                    fontFamily: POPPINS,
                  }}>
                  {t}
                </button>
              ))}
            </div>

            {apps === null ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />)}
              </div>
            ) : tab === 2 ? (
              apps.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-10 h-10 mx-auto mb-3 text-white/70" />
                  <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>No selected creators yet</p>
                  <p className="text-white/70 text-xs mt-1" style={{ fontFamily: POPPINS }}>Shortlist applicants and unlock their profiles to select</p>
                </div>
              ) : (
                <>
                  {apps.some((a: any) => a.dealStatus === "PENDING_PAYMENT") && (
                    <div className="rounded-xl p-3 mb-4 flex items-center gap-2"
                      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.20)" }}>
                      <CreditCard className="w-4 h-4 flex-shrink-0" style={{ color: "#F59E0B" }} />
                      <p className="text-amber-300 text-xs" style={{ fontFamily: POPPINS }}>
                        You have pending payments — pay to activate your collaborations
                      </p>
                    </div>
                  )}
                  {apps.map((app: any) => (
                    <SelectedCreatorCard
                      key={app.id}
                      app={app}
                      campaignType={campaign?.type}
                      onViewProfile={creatorId => navigate(`/home-brand/unlocked/creator/${creatorId}`, { state: { campaignId: id, appId: app.id, slotsFull: (campaign.slotsFilled ?? 0) >= (campaign.slotCount ?? Infinity) } })}
                      onPay={setPayingDeal}
                    />
                  ))}
                </>
              )
            ) : (
              <div>
                {apps.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-10 h-10 mx-auto mb-3 text-white/70" />
                    <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>
                      {tab === 0 ? "No pending applications yet" : "No shortlisted creators yet"}
                    </p>
                  </div>
                ) : tab === 0 ? (
                  apps.map((app: any) => <AnonymousCard key={app.id} app={app} onShortlist={handleShortlist} />)
                ) : (
                  apps.map((app: any) => (
                    <ShortlistedCard
                      key={app.id}
                      app={app}
                      onRequestUnlock={a => { setUnlockPendingApp(a); setUnlockError(null); }}
                      onSelectClick={setConfirmApp}
                      onViewProfile={(creatorId, appId) => navigate(`/home-brand/unlocked/creator/${creatorId}`, { state: { campaignId: id, appId, slotsFull: (campaign.slotsFilled ?? 0) >= (campaign.slotCount ?? Infinity) } })}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}

        {campaign && !showTabs && !["PENDING_APPROVAL", "CREDIT_HOLD"].includes(campaign.status) && (
          <div className="text-center py-12">
            <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>
              {campaign.status === "EXPIRED" ? "This campaign has expired." : campaign.status === "REJECTED" ? "This campaign was not approved." : campaign.status === "DELETED" ? "This campaign has been deleted." : ""}
            </p>
          </div>
        )}
      </div>

      {confirmApp && (
        <SelectConfirmModal app={confirmApp} onClose={() => setConfirmApp(null)} onConfirm={() => handleSelect(confirmApp.id)} slotsFull={(campaign?.slotsFilled ?? 0) >= (campaign?.slotCount ?? Infinity)} />
      )}
      {payingDeal && (
        <PaymentModal app={payingDeal} onClose={() => setPayingDeal(null)} onConfirm={handlePay} />
      )}
      {showDelete && (
        <DeleteConfirmModal campaignName={campaign?.name ?? ""} onClose={() => setShowDelete(false)} onConfirm={handleDelete} />
      )}

      {/* Unlock confirmation modal */}
      {unlockPendingApp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.82)" }}
          onClick={e => { if (e.target === e.currentTarget) { setUnlockPendingApp(null); setUnlockError(null); } }}
        >
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#15151E", border: "1px solid rgba(240,24,122,0.25)" }}>
            <div className="flex items-center gap-3 mb-4">
              {unlockPendingApp.profilePhotoUrl
                ? <img src={unlockPendingApp.profilePhotoUrl} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                : <div className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm" style={{ background: `${PINK}25`, color: PINK }}>{unlockPendingApp.fullName?.[0] ?? "?"}</div>}
              <div>
                <p className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Unlock Full Profile</p>
                <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>{fmtK(unlockPendingApp.followerCount ?? 0)} followers</p>
              </div>
            </div>
            <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.18)" }}>
              <div className="flex justify-between mb-1.5">
                <span className="text-white/75 text-xs" style={{ fontFamily: POPPINS }}>Profile Unlock Cost</span>
                <span className="text-white font-bold text-xs" style={{ fontFamily: POPPINS }}>1 Credit</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/75 text-xs" style={{ fontFamily: POPPINS }}>Your balance</span>
                <span className="text-white font-bold text-xs" style={{ fontFamily: POPPINS }}>{creditTotal ?? 0} Credits</span>
              </div>
            </div>
            <p className="text-amber-400 text-[11px] mb-3" style={{ fontFamily: POPPINS }}>⚠ Credits are non-refundable once spent</p>
            {unlockError && <p className="text-red-400 text-xs mb-3" style={{ fontFamily: POPPINS }}>{unlockError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setUnlockPendingApp(null); setUnlockError(null); }}
                className="flex-1 py-2.5 rounded-full border border-white/20 text-white/80 text-xs"
                style={{ fontFamily: POPPINS }}
              >
                Cancel
              </button>
              {(creditTotal ?? 0) < 1 ? (
                <button
                  onClick={() => navigate("/home-brand/credits")}
                  className="flex-1 py-2.5 rounded-full text-white text-xs font-bold"
                  style={{ background: PINK, fontFamily: POPPINS }}
                >
                  Buy Credits
                </button>
              ) : (
                <button
                  onClick={handleUnlock}
                  disabled={unlocking}
                  className="flex-1 py-2.5 rounded-full text-white text-xs font-bold disabled:opacity-50"
                  style={{ background: PINK, fontFamily: POPPINS }}
                >
                  {unlocking ? "Unlocking..." : "Unlock · 1 Credit"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </BrandLayout>
  );
}
