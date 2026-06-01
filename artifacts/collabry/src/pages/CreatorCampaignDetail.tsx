import { useState, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { useServerTime } from "@/hooks/useServerTime";
import {
  ArrowLeft, Users, Clock, Package, CheckCircle, Gift,
  IndianRupee, CalendarDays, Tag, FileText, MessageSquare,
  ListChecks, Zap, ScrollText, Percent, ExternalLink,
  ChevronDown, ChevronUp, UserCheck, Sparkles,
} from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { CreatorLayout, POPPINS, PINK } from "@/components/CreatorNavLayout";

function InfoSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 mb-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function StatTile({ icon, value, label, sub, accent }: { icon: React.ReactNode; value: string; label: string; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center py-4 px-3 rounded-2xl flex-1 min-w-0"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
      <div className="mb-1.5">{icon}</div>
      <span className="font-bold text-sm sm:text-base truncate w-full text-center" style={{ fontFamily: POPPINS, color: accent ?? "#fff" }}>{value}</span>
      <span className="text-white/70 text-[10px] mt-0.5 text-center" style={{ fontFamily: POPPINS }}>{label}</span>
      {sub && <span className="text-white/70 text-[9px] mt-0.5 text-center" style={{ fontFamily: POPPINS }}>{sub}</span>}
    </div>
  );
}

function Chip({ label, matched }: { label: string; matched?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
      style={{
        background: matched ? "rgba(16,185,129,0.13)" : "rgba(255,255,255,0.07)",
        border: `1px solid ${matched ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.1)"}`,
        color: matched ? "#10B981" : "rgba(255,255,255,0.90)",
        fontFamily: POPPINS,
      }}>
      {matched && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
      {label}
    </span>
  );
}

function WhoShouldApply({ campaign }: { campaign: any }) {
  const [open, setOpen] = useState(false);

  const categories: { categoryId: string; name: string }[] = campaign.categories ?? [];
  const resolvedSlabs: { id: string; label: string; minFollowers: number; maxFollowers: number }[] = campaign.resolvedSlabs ?? [];
  const creatorCategoryIds: string[] = campaign.creatorCategoryIds ?? [];
  const creatorSelectedSlabId: string | null = campaign.creatorSelectedSlabId ?? null;
  const creatorGender: string | null = campaign.creatorGender ?? null;

  const targetGender: string = campaign.targetGender ?? "ANY";
  const targetAge: string | null = campaign.targetAge ?? null;
  const targetLocation: string | null = campaign.targetLocation ?? null;
  const contentType: string | null = campaign.type ?? campaign.contentType ?? null;

  const catMatch = categories.length > 0 && creatorCategoryIds.some(id => categories.some(c => c.categoryId === id));
  const genderMatch = !targetGender || targetGender === "ANY" || targetGender === creatorGender;
  const slabMatch = resolvedSlabs.length > 0 && creatorSelectedSlabId != null && resolvedSlabs.some(s => s.id === creatorSelectedSlabId);

  const matchPoints = [catMatch, genderMatch, slabMatch].filter(Boolean).length;
  const hasEnoughData = (catMatch || slabMatch) && categories.length > 0;
  const isGoodMatch = matchPoints >= 2 && hasEnoughData;
  const isPartialMatch = matchPoints === 1 && hasEnoughData;

  const genderLabel = (g: string | null) => {
    if (!g || g === "ANY") return "All genders welcome";
    if (g === "MALE") return "Male creators";
    if (g === "FEMALE") return "Female creators";
    return g;
  };

  const hasAnyCriteria = categories.length > 0 || resolvedSlabs.length > 0 || targetGender || targetAge || targetLocation || contentType;
  if (!hasAnyCriteria) return null;

  return (
    <div className="rounded-2xl mb-4 overflow-hidden"
      style={{ border: `1px solid ${open ? "rgba(240,24,122,0.28)" : "rgba(255,255,255,0.1)"}`, background: open ? "rgba(240,24,122,0.04)" : "rgba(255,255,255,0.03)" }}>

      {/* Header — always visible */}
      <button
        className="w-full flex items-center justify-between p-4 transition-all"
        onClick={() => setOpen(s => !s)}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(240,24,122,0.15)" }}>
            <UserCheck className="w-4 h-4" style={{ color: PINK }} />
          </div>
          <div className="text-left">
            <p className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Who Should Apply?</p>
            {!open && (
              <p className="text-white/70 text-[11px] mt-0.5" style={{ fontFamily: POPPINS }}>
                {categories.length > 0
                  ? categories.map(c => c.name).slice(0, 2).join(", ") + (categories.length > 2 ? ` +${categories.length - 2} more` : "")
                  : "Tap to see targeting criteria"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(isGoodMatch || isPartialMatch) && !open && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                background: isGoodMatch ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.12)",
                color: isGoodMatch ? "#10B981" : "#F59E0B",
                fontFamily: POPPINS,
              }}>
              {isGoodMatch ? "Good match" : "Partial match"}
            </span>
          )}
          {open
            ? <ChevronUp className="w-4 h-4 text-white/70" />
            : <ChevronDown className="w-4 h-4 text-white/70" />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-4 pb-4 space-y-4">

          {/* Match badge */}
          {(isGoodMatch || isPartialMatch) && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
              style={{
                background: isGoodMatch ? "rgba(16,185,129,0.09)" : "rgba(245,158,11,0.08)",
                border: `1px solid ${isGoodMatch ? "rgba(16,185,129,0.22)" : "rgba(245,158,11,0.2)"}`,
              }}>
              <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: isGoodMatch ? "#10B981" : "#F59E0B" }} />
              <p className="text-xs leading-relaxed" style={{ color: isGoodMatch ? "#10B981" : "#F59E0B", fontFamily: POPPINS }}>
                {isGoodMatch
                  ? "Your profile is a strong match for this campaign."
                  : "Your profile partially matches this campaign's criteria."}
                {catMatch && " Your niche/category aligns."}
                {slabMatch && " Your follower tier qualifies."}
                {genderMatch && targetGender !== "ANY" && " Your gender matches."}
              </p>
            </div>
          )}

          {/* Preferred Categories */}
          {categories.length > 0 && (
            <div>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: POPPINS }}>
                Preferred Creator Niche
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c: any) => (
                  <Chip key={c.categoryId} label={c.name} matched={creatorCategoryIds.includes(c.categoryId)} />
                ))}
              </div>
            </div>
          )}

          {/* Follower Tiers */}
          {resolvedSlabs.length > 0 && (
            <div>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: POPPINS }}>
                Preferred Follower Tier
              </p>
              <div className="flex flex-wrap gap-2">
                {resolvedSlabs.map((s: any) => (
                  <Chip key={s.id} label={s.label} matched={creatorSelectedSlabId === s.id} />
                ))}
              </div>
            </div>
          )}

          {/* Creator Gender */}
          {targetGender && (
            <div>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: POPPINS }}>
                Preferred Creator Gender
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip label={genderLabel(targetGender)} matched={genderMatch} />
              </div>
            </div>
          )}

          {/* Audience Age */}
          {targetAge && (
            <div>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: POPPINS }}>
                Preferred Audience Age
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip label={targetAge} />
              </div>
            </div>
          )}

          {/* Audience Location */}
          {targetLocation && (
            <div>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: POPPINS }}>
                Preferred Audience Location
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip label={targetLocation} />
              </div>
            </div>
          )}

          {/* Content Type / Platform */}
          {contentType && (
            <div>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: POPPINS }}>
                Content Format
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip label={contentType} />
              </div>
            </div>
          )}

          <p className="text-white/70 text-[10px] leading-relaxed pt-1" style={{ fontFamily: POPPINS }}>
            These are the exact targeting criteria set by the brand. Matching criteria are highlighted in green.
          </p>
        </div>
      )}
    </div>
  );
}

export default function CreatorCampaignDetail() {
  const { accessToken, creatorId, loading: authLoading } = useCreatorAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [loc] = useLocation();
  const isBarter = loc.includes("/barter/");
  const [campaign, setCampaign] = useState<any>(null);
  const [applying, setApplying] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [responding, setResponding] = useState<"start" | "reject" | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showBrand, setShowBrand] = useState(false);
  const { serverNow } = useServerTime();
  const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  const apiFetch = useCallback((path: string, opts?: RequestInit) =>
    fetch(`${BASE_URL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    }), [accessToken, BASE_URL]);

  useEffect(() => { if (!authLoading && !creatorId) navigate("/login-creator"); }, [creatorId, authLoading]);

  useEffect(() => {
    if (!creatorId) return;
    const endpoint = isBarter ? `/api/creator/barter/${id}` : `/api/creator/campaigns/${id}`;
    apiFetch(endpoint).then(r => r.ok ? r.json() : null).then(d => { if (d) setCampaign(d); }).catch(() => {});
  }, [id, creatorId, isBarter]);

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  const handleApply = async () => {
    setApplying(true);
    const endpoint = isBarter ? `/api/creator/barter/${id}/apply` : `/api/creator/campaigns/${id}/apply`;
    try {
      const r = await apiFetch(endpoint, { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        flash("Application submitted successfully!", true);
        setCampaign((prev: any) => prev ? { ...prev, hasApplied: true, applicationStatus: "PENDING" } : prev);
      } else {
        flash(d.error ?? "Failed to apply", false);
      }
    } catch { flash("Something went wrong", false); }
    setApplying(false);
  };

  const handleConfirmDeal = async (decision: "start" | "reject") => {
    if (decision === "reject" && !confirm("Reject this selection? The slot will reopen.")) return;
    const appId = campaign?.applicationId;
    if (!appId) { flash("Application not found", false); return; }
    setResponding(decision);
    const action = decision === "start" ? "confirm" : "decline";
    const path = isBarter
      ? `/api/creator/barter/${id}/applications/${appId}/${action}`
      : `/api/creator/campaigns/${id}/applications/${appId}/${action}`;
    try {
      const r = await apiFetch(path, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        flash(decision === "start" ? "Deal started! Check your Deals tab." : "Selection rejected.", true);
        if (decision === "start") setTimeout(() => navigate("/home-creator/deals?tab=pending"), 1200);
        else setCampaign((p: any) => p ? { ...p, applicationStatus: "WITHDRAWN" } : p);
      } else {
        flash(d.error ?? "Action failed", false);
      }
    } catch { flash("Something went wrong", false); }
    setResponding(null);
  };

  const handleWithdraw = async () => {
    if (!confirm("Withdraw your application?")) return;
    setWithdrawing(true);
    const endpoint = isBarter ? `/api/creator/barter/${id}/withdraw` : `/api/creator/campaigns/${id}/withdraw`;
    try {
      const r = await apiFetch(endpoint, { method: "POST" });
      if (r.ok) {
        flash("Application withdrawn.", true);
        setCampaign((prev: any) => prev ? { ...prev, applicationStatus: "WITHDRAWN" } : prev);
      } else {
        const d = await r.json();
        flash(d.error ?? "Failed to withdraw", false);
      }
    } catch { flash("Something went wrong", false); }
    setWithdrawing(false);
  };

  if (authLoading || !creatorId) return null;

  const appStatus = campaign?.applicationStatus;
  const hasApplied = appStatus != null;
  const canApply = !hasApplied && ["LIVE", "PARTIALLY_FILLED"].includes(campaign?.status) && (campaign?.slotsRemaining ?? 1) > 0;
  const canWithdraw = hasApplied && ["PENDING", "SHORTLISTED"].includes(appStatus);
  const isSelected = appStatus === "SELECTED" && !campaign?.dealId;

  const deadline = campaign?.confirmationDeadline ? new Date(campaign.confirmationDeadline).getTime() : 0;
  const rem = Math.max(0, deadline - serverNow);
  const hrs = Math.floor(rem / 3600000);
  const mins = Math.floor((rem % 3600000) / 60000);
  const selectionExpired = deadline > 0 && rem === 0;

  const daysLeft = campaign?.expiresAt
    ? Math.max(0, Math.ceil((new Date(campaign.expiresAt).getTime() - serverNow) / 86400000))
    : null;
  const slotsLeft = campaign?.slotsRemaining ?? (campaign ? campaign.slotCount - campaign.slotsFilled : 0);

  const brandBudget = parseFloat(campaign?.pricePerCreator ?? 0);
  const feeRate = parseFloat(campaign?.commissionRateAtCreation ?? 5);
  const creatorPayout = Math.round(brandBudget * (1 - feeRate / 100));
  const feeAmt = Math.round(brandBudget * feeRate / 100);

  const dealTimeline = campaign?.timelineDays ?? campaign?.durationDays ?? null;

  const BADGE: Record<string, { label: string; color: string; bg: string }> = {
    PENDING:     { label: "Applied — Pending Review", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
    SHORTLISTED: { label: "Shortlisted 🎯",           color: "#60A5FA", bg: "rgba(59,130,246,0.15)" },
    SELECTED:    { label: "Selected 🎉",              color: "#10B981", bg: "rgba(16,185,129,0.15)" },
    CONFIRMED:   { label: "Confirmed ✓",              color: "#10B981", bg: "rgba(16,185,129,0.15)" },
    WITHDRAWN:   { label: "Withdrawn",                color: "#9CA3AF", bg: "rgba(107,114,128,0.12)" },
    REJECTED:    { label: "Not Selected",             color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  };
  const statusBadge = appStatus ? BADGE[appStatus] : null;

  return (
    <CreatorLayout status="ACTIVE" onLocked={() => {}}>
      <div className="px-4 lg:px-0 pt-5 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate("/home-creator/campaigns")}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="min-w-0">
            <p className="text-white/70 text-[11px] font-medium" style={{ fontFamily: POPPINS }}>
              {isBarter ? "Barter Campaign" : "Paid Campaign"}
            </p>
            <h1 className="text-white font-bold text-lg leading-snug truncate" style={{ fontFamily: POPPINS }}>
              {campaign?.name ?? "Loading…"}
            </h1>
          </div>
        </div>

        {msg && (
          <div className="rounded-xl px-4 py-3 mb-4"
            style={{ background: msg.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${msg.ok ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}` }}>
            <p className="text-sm" style={{ color: msg.ok ? "#10B981" : "#EF4444", fontFamily: POPPINS }}>{msg.text}</p>
          </div>
        )}

        {campaign ? (
          <>
            {/* Brand block */}
            <div className="flex items-center gap-3.5 mb-4 p-4 rounded-2xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {campaign.logoUrl
                ? <img src={campaign.logoUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                : <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-lg"
                    style={{ background: "rgba(240,24,122,0.18)", color: PINK }}>
                    {campaign.brandName?.[0]?.toUpperCase() ?? "?"}
                  </div>}
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>{campaign.brandName}</p>
                {campaign.brandAbout && (
                  <p className="text-white/70 text-xs mt-0.5 line-clamp-2 leading-relaxed" style={{ fontFamily: POPPINS }}>{campaign.brandAbout}</p>
                )}
                {campaign.brandWebsite && (
                  <a href={/^https?:\/\//i.test(campaign.brandWebsite) ? campaign.brandWebsite : `https://${campaign.brandWebsite}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-white/70 text-[11px] mt-1 hover:text-white/80 transition-colors"
                    style={{ fontFamily: POPPINS }}>
                    <ExternalLink className="w-3 h-3" /> {campaign.brandWebsite}
                  </a>
                )}
              </div>
            </div>

            {/* Type + status badges */}
            <div className="flex items-center gap-2 flex-wrap mb-5">
              <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
                style={{ background: isBarter ? "rgba(16,185,129,0.15)" : "rgba(240,24,122,0.15)", color: isBarter ? "#10B981" : PINK, border: `1px solid ${isBarter ? "rgba(16,185,129,0.3)" : "rgba(240,24,122,0.3)"}`, fontFamily: POPPINS }}>
                {isBarter ? `BARTER · ${campaign.contentType}` : `PAID · ${campaign.type}`}
              </span>
              {statusBadge && (
                <span className="px-3 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: statusBadge.bg, color: statusBadge.color, fontFamily: POPPINS }}>
                  {statusBadge.label}
                </span>
              )}
            </div>

            {/* ── PAYOUT / VALUE BREAKDOWN ── */}
            {!isBarter && brandBudget > 0 && (
              <div className="rounded-2xl p-4 mb-4"
                style={{ background: "rgba(240,24,122,0.07)", border: "1px solid rgba(240,24,122,0.18)" }}>
                <p className="text-white/70 text-[11px] font-bold uppercase tracking-widest mb-3" style={{ fontFamily: POPPINS }}>Payout Breakdown</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white/75 text-sm flex items-center gap-1.5" style={{ fontFamily: POPPINS }}>
                      <IndianRupee className="w-3.5 h-3.5 text-white/70" /> Brand Budget
                    </span>
                    <span className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>
                      ₹{brandBudget.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/75 text-sm flex items-center gap-1.5" style={{ fontFamily: POPPINS }}>
                      <Percent className="w-3.5 h-3.5 text-white/70" /> Platform Fee ({feeRate}%)
                    </span>
                    <span className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>
                      − ₹{feeAmt.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm" style={{ color: PINK, fontFamily: POPPINS }}>Your Payout</span>
                    <span className="font-extrabold text-lg" style={{ color: PINK, fontFamily: POPPINS }}>
                      ₹{creatorPayout.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Barter product value */}
            {isBarter && campaign.productValueInr && (
              <div className="rounded-2xl p-4 mb-4"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)" }}>
                <p className="text-white/70 text-[11px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: POPPINS }}>Product Value</p>
                <p className="font-extrabold text-2xl" style={{ color: "#10B981", fontFamily: POPPINS }}>
                  ₹{parseFloat(campaign.productValueInr).toLocaleString("en-IN")}
                </p>
                <p className="text-white/70 text-xs mt-1" style={{ fontFamily: POPPINS }}>You receive this product in exchange for creating content</p>
              </div>
            )}

            {/* ── TIMELINE STATS ── */}
            <div className="flex gap-2.5 mb-5">
              {dealTimeline && (
                <StatTile
                  icon={<CalendarDays className="w-4 h-4 text-white/70" />}
                  value={`${dealTimeline} days`}
                  label="Deal Timeline"
                  sub="after selection"
                />
              )}
              <StatTile
                icon={<Users className="w-4 h-4 text-white/70" />}
                value={String(slotsLeft)}
                label="Slots Left"
              />
              {daysLeft !== null && (
                <StatTile
                  icon={<Clock className="w-4 h-4" style={{ color: daysLeft <= 3 ? "#EF4444" : "rgba(255,255,255,0.70)" }} />}
                  value={daysLeft === 0 ? "Today!" : `${daysLeft}d`}
                  label="Campaign Closes"
                  sub="applications close"
                  accent={daysLeft <= 3 ? "#EF4444" : undefined}
                />
              )}
            </div>

            {/* ── WHO SHOULD APPLY ── */}
            <WhoShouldApply campaign={campaign} />

            {/* Barter product details */}
            {isBarter && campaign.productName && (
              <InfoSection icon={<Gift className="w-4 h-4 text-emerald-400" />} title={`Product: ${campaign.productName}`}>
                {campaign.productDescription && (
                  <p className="text-white/85 text-sm leading-relaxed mb-3 break-words" style={{ fontFamily: POPPINS }}>{campaign.productDescription}</p>
                )}
                {campaign.productPhotos?.length > 0 && (
                  <div className="space-y-2 mt-1">
                    <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wide" style={{ fontFamily: POPPINS }}>Product Photos</p>
                    {campaign.productPhotos.map((url: string, i: number) => (
                      <a key={i} href={/^https?:\/\//i.test(url) ? url : `https://${url}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:opacity-80 transition-opacity"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-white/70" />
                        <span className="text-white/85 text-xs truncate" style={{ fontFamily: POPPINS }}>{url}</span>
                      </a>
                    ))}
                  </div>
                )}
                {campaign.deliveryWindowDays && (
                  <div className="mt-3 flex items-center gap-2 text-xs" style={{ fontFamily: POPPINS }}>
                    <Package className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
                    <span className="text-white/75">Shipped within <span className="text-white font-semibold">{campaign.deliveryWindowDays} days</span> of your confirmation</span>
                  </div>
                )}
              </InfoSection>
            )}

            {/* Product shipped (paid) */}
            {!isBarter && campaign.productRequired && campaign.productName && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl mb-4"
                style={{ background: "rgba(240,24,122,0.07)", border: "1px solid rgba(240,24,122,0.18)" }}>
                <Package className="w-4 h-4 flex-shrink-0" style={{ color: PINK }} />
                <div>
                  <p className="text-white text-xs font-semibold" style={{ fontFamily: POPPINS }}>Product will be sent to you</p>
                  <p className="text-white/75 text-xs mt-0.5 break-words" style={{ fontFamily: POPPINS }}>{campaign.productName}</p>
                  {campaign.productDescription && (
                    <p className="text-white/70 text-xs mt-0.5 break-words" style={{ fontFamily: POPPINS }}>{campaign.productDescription}</p>
                  )}
                </div>
              </div>
            )}

            {/* Campaign Brief */}
            {(campaign.brief || campaign.contentRequirements) && (
              <InfoSection icon={<FileText className="w-4 h-4 text-white/70" />}
                title={isBarter ? "Content Requirements" : "Campaign Brief"}>
                <p className="text-white/90 text-sm leading-relaxed whitespace-pre-line break-words" style={{ fontFamily: POPPINS }}>
                  {isBarter ? campaign.contentRequirements : campaign.brief}
                </p>
              </InfoSection>
            )}

            {/* Reel Script */}
            {(campaign.reelScript || campaign.script) && (
              <InfoSection icon={<ScrollText className="w-4 h-4 text-pink-400" />} title="Reel Script">
                <p className="text-white/90 text-sm leading-relaxed whitespace-pre-line break-words" style={{ fontFamily: POPPINS }}>{campaign.reelScript ?? campaign.script}</p>
              </InfoSection>
            )}

            {/* Key Message */}
            {campaign.keyMessage && (
              <InfoSection icon={<Zap className="w-4 h-4 text-amber-400" />} title="Key Message">
                <p className="text-white/90 text-sm leading-relaxed break-words" style={{ fontFamily: POPPINS }}>{campaign.keyMessage}</p>
              </InfoSection>
            )}

            {/* Dos & Don'ts */}
            {campaign.dosAndDonts && (
              <InfoSection icon={<ListChecks className="w-4 h-4 text-white/70" />} title="Dos & Don'ts">
                <p className="text-white/90 text-sm leading-relaxed whitespace-pre-line break-words" style={{ fontFamily: POPPINS }}>{campaign.dosAndDonts}</p>
              </InfoSection>
            )}

            {/* Target Audience */}
            {campaign.targetAudienceType && (
              <InfoSection icon={<MessageSquare className="w-4 h-4 text-white/70" />} title="Target Audience">
                <p className="text-white/90 text-sm" style={{ fontFamily: POPPINS }}>{campaign.targetAudienceType}</p>
              </InfoSection>
            )}

            {/* Selected banner */}
            {isSelected && (
              <div className="rounded-2xl p-4 mb-5"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <p className="text-green-400 font-bold text-sm" style={{ fontFamily: POPPINS }}>You've been selected!</p>
                </div>
                {!selectionExpired && deadline > 0 && (
                  <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2"
                    style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
                    <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <p className="text-amber-300 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
                      {hrs}h {mins}m left to respond
                    </p>
                  </div>
                )}
                {selectionExpired ? (
                  <p className="text-red-400 text-xs" style={{ fontFamily: POPPINS }}>This selection has expired.</p>
                ) : (
                  <>
                    <button onClick={() => setShowBrand(s => !s)}
                      className="text-xs underline" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>
                      {showBrand ? "Hide" : "See"} brand details
                    </button>
                    {showBrand && (
                      <div className="rounded-xl p-3 mt-2 space-y-1 text-xs" style={{ background: "rgba(255,255,255,0.04)", fontFamily: POPPINS }}>
                        <p className="text-white"><span className="text-white/70">Brand:</span> {campaign.brandName ?? "—"}</p>
                        {campaign.brandAbout && <p className="text-white/85 leading-relaxed">{campaign.brandAbout}</p>}
                        {campaign.brandWebsite && <p className="text-white/85 break-all"><span className="text-white/70">Website:</span> {campaign.brandWebsite}</p>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {appStatus === "SELECTED" && campaign?.dealId && (
              <div className="rounded-2xl p-4 mb-5"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <p className="text-green-400 font-semibold text-sm" style={{ fontFamily: POPPINS }}>Deal is active!</p>
                </div>
                <button onClick={() => navigate("/home-creator/deals?tab=pending")}
                  className="text-green-400 text-sm underline" style={{ fontFamily: POPPINS }}>
                  View in Deals →
                </button>
              </div>
            )}

            {/* ── CTA BUTTONS ── */}
            <div className="mt-6 space-y-3">
              {canApply && (
                <button onClick={handleApply} disabled={applying}
                  className="w-full py-4 rounded-2xl text-white font-bold text-base transition-opacity"
                  style={{ background: applying ? "rgba(240,24,122,0.5)" : PINK, fontFamily: POPPINS }}>
                  {applying ? "Submitting…" : "Apply Now"}
                </button>
              )}

              {isSelected && !selectionExpired && (
                <div className="flex gap-2.5">
                  <button onClick={() => handleConfirmDeal("reject")} disabled={responding !== null}
                    className="flex-1 py-3.5 rounded-2xl font-semibold text-sm transition-opacity"
                    style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)", fontFamily: POPPINS }}>
                    {responding === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                  <button onClick={() => handleConfirmDeal("start")} disabled={responding !== null}
                    className="flex-[2] py-3.5 rounded-2xl text-white font-bold text-sm transition-opacity"
                    style={{ background: responding === "start" ? "rgba(16,185,129,0.5)" : "#10B981", fontFamily: POPPINS }}>
                    {responding === "start" ? "Starting…" : "Start Deal"}
                  </button>
                </div>
              )}

              {canWithdraw && (
                <button onClick={handleWithdraw} disabled={withdrawing}
                  className="w-full py-3 rounded-2xl font-medium text-sm transition-opacity"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>
                  {withdrawing ? "Withdrawing…" : "Withdraw Application"}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-2xl animate-pulse"
                style={{ height: i === 1 ? 80 : 64, background: "rgba(255,255,255,0.05)" }} />
            ))}
          </div>
        )}
      </div>
    </CreatorLayout>
  );
}
