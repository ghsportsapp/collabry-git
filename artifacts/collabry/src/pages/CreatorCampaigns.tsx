import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useServerTime } from "@/hooks/useServerTime";
import {
  Megaphone, Gift, Clock, Users, CheckCircle, XCircle,
  Sparkles, CalendarDays, ArrowRight, IndianRupee, Percent,
} from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { CreatorLayout, POPPINS, PINK } from "@/components/CreatorNavLayout";

const TABS = ["Paid", "Barter", "My Applications"];

const APP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:     { label: "Applied",          color: "#F59E0B", bg: "rgba(245,158,11,0.18)" },
  SHORTLISTED: { label: "Shortlisted 🎯",   color: "#60A5FA", bg: "rgba(59,130,246,0.18)" },
  SELECTED:    { label: "Action Needed 🎉", color: "#10B981", bg: "rgba(16,185,129,0.18)" },
  CONFIRMED:   { label: "Confirmed ✓",      color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  DECLINED:    { label: "Declined",         color: "#9CA3AF", bg: "rgba(107,114,128,0.12)" },
  WITHDRAWN:   { label: "Withdrawn",        color: "#9CA3AF", bg: "rgba(107,114,128,0.12)" },
  EXPIRED:     { label: "Expired",          color: "#9CA3AF", bg: "rgba(107,114,128,0.12)" },
  REJECTED:    { label: "Not Selected",     color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
};

function BrandAvatar({ logoUrl, brandName, size = 8 }: { logoUrl?: string; brandName?: string; size?: number }) {
  const dim = `w-${size} h-${size}`;
  if (logoUrl) return <img src={logoUrl} alt="" className={`${dim} rounded-full object-cover flex-shrink-0`} />;
  return (
    <div className={`${dim} rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs`}
      style={{ background: "rgba(240,24,122,0.18)", color: PINK }}>
      {brandName?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-52 rounded-2xl animate-pulse"
          style={{ background: "rgba(240,24,122,0.06)", border: "1px solid rgba(240,24,122,0.12)" }} />
      ))}
    </div>
  );
}

function StatPill({ icon, value, label, accent }: { icon: React.ReactNode; value: string; label: string; accent?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <div>
        <p className="font-semibold text-sm leading-none" style={{ color: accent ?? "#fff", fontFamily: POPPINS }}>{value}</p>
        <p className="text-white/70 text-[10px] mt-0.5" style={{ fontFamily: POPPINS }}>{label}</p>
      </div>
    </div>
  );
}

function CampaignCard({ c, onClick }: { c: any; onClick: () => void }) {
  const daysLeft = c.expiresAt
    ? Math.max(0, Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / 86400000))
    : null;
  const slotsLeft = c.slotsRemaining ?? Math.max(0, (c.slotCount ?? 0) - (c.slotsFilled ?? 0));
  const appStatus = c.hasApplied ? (APP_STATUS[c.applicationStatus] ?? APP_STATUS.PENDING) : null;
  const urgent = daysLeft !== null && daysLeft <= 3;

  const brandBudget = parseFloat(c.pricePerCreator ?? 0);
  const feeRate = parseFloat(c.commissionRateAtCreation ?? 5);
  const payout = Math.round(brandBudget * (1 - feeRate / 100));
  const feeAmt = Math.round(brandBudget * feeRate / 100);

  return (
    <div className="rounded-2xl mb-4 overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(240,24,122,0.11) 0%, rgba(255,255,255,0.04) 100%)",
        border: "1px solid rgba(240,24,122,0.22)",
      }}>
      <div className="p-4 pb-3.5">
        {/* Top row — brand + type badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <BrandAvatar logoUrl={c.logoUrl} brandName={c.brandName} />
            <span className="text-white/75 text-xs font-medium truncate" style={{ fontFamily: POPPINS }}>{c.brandName}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ background: "rgba(240,24,122,0.18)", color: PINK, border: "1px solid rgba(240,24,122,0.32)", fontFamily: POPPINS }}>
              PAID · {c.type}
            </span>
            {appStatus && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: appStatus.bg, color: appStatus.color, fontFamily: POPPINS }}>
                {appStatus.label}
              </span>
            )}
          </div>
        </div>

        {/* Campaign name */}
        <p className="text-white font-bold text-base leading-snug mb-3" style={{ fontFamily: POPPINS }}>{c.name}</p>

        {/* Payout highlight */}
        <div className="rounded-xl px-3 py-2.5 mb-3"
          style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.15)" }}>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-white/70 text-[10px] font-medium mb-0.5" style={{ fontFamily: POPPINS }}>Your Payout</p>
              <p className="font-extrabold text-xl leading-none" style={{ fontFamily: POPPINS, color: PINK }}>
                ₹{payout.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-[10px]" style={{ fontFamily: POPPINS }}>
                Brand Budget ₹{brandBudget.toLocaleString("en-IN")}
              </p>
              <p className="text-white/70 text-[10px]" style={{ fontFamily: POPPINS }}>
                Platform fee {feeRate}% (₹{feeAmt.toLocaleString("en-IN")})
              </p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4">
          <StatPill
            icon={<Users className="w-3.5 h-3.5 text-white/70" />}
            value={String(slotsLeft)}
            label="slots left" />
          {c.timelineDays && (
            <StatPill
              icon={<CalendarDays className="w-3.5 h-3.5 text-white/70" />}
              value={`${c.timelineDays}d`}
              label="deal timeline" />
          )}
          {daysLeft !== null && (
            <StatPill
              icon={<Clock className="w-3.5 h-3.5" style={{ color: urgent ? "#EF4444" : "rgba(255,255,255,0.70)" }} />}
              value={daysLeft === 0 ? "Today!" : `${daysLeft}d`}
              label="closes in"
              accent={urgent ? "#EF4444" : undefined} />
          )}
        </div>
      </div>

      <button onClick={onClick}
        className="w-full flex items-center justify-center gap-2 py-2.5 font-bold text-[13px] transition-opacity hover:opacity-80"
        style={{ background: PINK, color: "#fff", fontFamily: POPPINS }}>
        See Details <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function BarterCard({ c, onClick }: { c: any; onClick: () => void }) {
  const daysLeft = c.expiresAt
    ? Math.max(0, Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / 86400000))
    : null;
  const slotsLeft = c.slotsRemaining ?? Math.max(0, (c.slotCount ?? 0) - (c.slotsFilled ?? 0));
  const appStatus = c.hasApplied ? (APP_STATUS[c.applicationStatus] ?? APP_STATUS.PENDING) : null;
  const urgent = daysLeft !== null && daysLeft <= 3;
  const productVal = parseFloat(c.productValueInr ?? 0);

  return (
    <div className="rounded-2xl mb-4 overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(16,185,129,0.09) 0%, rgba(255,255,255,0.04) 100%)",
        border: "1px solid rgba(16,185,129,0.22)",
      }}>
      <div className="p-4 pb-3.5">
        {/* Top row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <BrandAvatar logoUrl={c.logoUrl} brandName={c.brandName} />
            <span className="text-white/75 text-xs font-medium truncate" style={{ fontFamily: POPPINS }}>{c.brandName}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ background: "rgba(16,185,129,0.16)", color: "#10B981", border: "1px solid rgba(16,185,129,0.32)", fontFamily: POPPINS }}>
              BARTER · {c.contentType}
            </span>
            {appStatus && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: appStatus.bg, color: appStatus.color, fontFamily: POPPINS }}>
                {appStatus.label}
              </span>
            )}
          </div>
        </div>

        {/* Name */}
        <p className="text-white font-bold text-base leading-snug mb-3" style={{ fontFamily: POPPINS }}>{c.name}</p>

        {/* Product highlight */}
        <div className="rounded-xl px-3 py-2.5 mb-3"
          style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white/70 text-[10px] font-medium mb-0.5" style={{ fontFamily: POPPINS }}>Product</p>
              <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>
                {c.productName ?? "—"}
              </p>
            </div>
            {productVal > 0 && (
              <div className="text-right flex-shrink-0">
                <p className="text-white/70 text-[10px]" style={{ fontFamily: POPPINS }}>value</p>
                <p className="font-bold text-base" style={{ color: "#10B981", fontFamily: POPPINS }}>
                  ₹{productVal.toLocaleString("en-IN")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4">
          <StatPill
            icon={<Users className="w-3.5 h-3.5 text-white/70" />}
            value={String(slotsLeft)}
            label="slots left" />
          {c.timelineDays && (
            <StatPill
              icon={<CalendarDays className="w-3.5 h-3.5 text-white/70" />}
              value={`${c.timelineDays}d`}
              label="content timeline" />
          )}
          {daysLeft !== null && (
            <StatPill
              icon={<Clock className="w-3.5 h-3.5" style={{ color: urgent ? "#EF4444" : "rgba(255,255,255,0.70)" }} />}
              value={daysLeft === 0 ? "Today!" : `${daysLeft}d`}
              label="closes in"
              accent={urgent ? "#EF4444" : undefined} />
          )}
        </div>
      </div>

      <button onClick={onClick}
        className="w-full flex items-center justify-center gap-2 py-2.5 font-bold text-[13px] transition-opacity hover:opacity-80"
        style={{ background: "#10B981", color: "#fff", fontFamily: POPPINS }}>
        See Details <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ApplicationCard({ app, onConfirm, onDecline, loading }: {
  app: any; onConfirm: () => void; onDecline: () => void; loading: boolean;
}) {
  const { serverNow } = useServerTime();
  const deadline = app.confirmationDeadline ? new Date(app.confirmationDeadline) : null;
  const hoursLeft = deadline ? Math.max(0, Math.round((deadline.getTime() - serverNow) / 3600000)) : null;
  const isExpiredDeadline = deadline && deadline.getTime() < serverNow;
  const isPaid = app.kind === "PAID";
  const isSelected = app.status === "SELECTED";
  const isDealLive = app.dealStatus === "IN_ESCROW";
  const status = APP_STATUS[app.status] ?? { label: app.status, color: "#6B7280", bg: "rgba(107,114,128,0.1)" };

  return (
    <div className="rounded-2xl p-5 mb-4 overflow-hidden"
      style={{
        background: isSelected ? "rgba(16,185,129,0.07)" : "linear-gradient(135deg, rgba(240,24,122,0.08) 0%, rgba(255,255,255,0.04) 100%)",
        border: `1px solid ${isSelected ? "rgba(16,185,129,0.25)" : "rgba(240,24,122,0.18)"}`,
      }}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandAvatar logoUrl={app.logoUrl} brandName={app.brandName} size={10} />
          <div className="min-w-0">
            <p className="text-white font-bold text-[15px] truncate" style={{ fontFamily: POPPINS }}>{app.name}</p>
            <p className="text-white/70 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>{app.brandName} · {isPaid ? "Paid" : "Barter"}</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0"
          style={{ background: status.bg, color: status.color, fontFamily: POPPINS }}>{status.label}</span>
      </div>

      <p className="text-white/70 text-xs mb-4 pl-[52px]" style={{ fontFamily: POPPINS }}>
        Applied {new Date(app.appliedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        {app.selectedAt && ` · Selected ${new Date(app.selectedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
      </p>

      {isPaid && isSelected && !isExpiredDeadline && (
        <div className="space-y-3">
          {hoursLeft !== null && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
                {hoursLeft > 0 ? `${hoursLeft}h left to respond` : "Expiring very soon"}
              </p>
            </div>
          )}
          <p className="text-white/75 text-xs leading-relaxed" style={{ fontFamily: POPPINS }}>
            You've been selected! Confirm to start the deal — the brand will then pay to activate it.
          </p>
          <div className="flex gap-2">
            <button onClick={onDecline} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontFamily: POPPINS }}>
              <XCircle className="w-3.5 h-3.5" /> Decline
            </button>
            <button onClick={onConfirm} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: "#10B981", color: "#fff", fontFamily: POPPINS }}>
              <CheckCircle className="w-3.5 h-3.5" /> {loading ? "…" : "Confirm Deal"}
            </button>
          </div>
        </div>
      )}

      {isPaid && isSelected && isExpiredDeadline && (
        <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>⚠️ Confirmation window expired</p>
      )}

      {isPaid && app.status === "CONFIRMED" && !isDealLive && (
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
          <p className="text-amber-300 text-xs" style={{ fontFamily: POPPINS }}>
            ⏳ Confirmed! Waiting for brand payment to activate the deal.
          </p>
        </div>
      )}
      {isPaid && app.status === "CONFIRMED" && isDealLive && (
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.25)" }}>
          <p className="text-emerald-300 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
            🎉 Deal is live! Head to your Deals tab to start the content workflow.
          </p>
        </div>
      )}

      {!isPaid && isSelected && !isExpiredDeadline && (
        <div className="space-y-3">
          <div className="rounded-xl px-3 py-2.5"
            style={{ background: "rgba(240,24,122,0.07)", border: "1px solid rgba(240,24,122,0.18)" }}>
            <p className="text-pink-300 text-xs font-semibold mb-0.5" style={{ fontFamily: POPPINS }}>Barter — No Cash Payment</p>
            {app.productName && (
              <p className="text-white/80 text-xs" style={{ fontFamily: POPPINS }}>
                You'll receive <strong style={{ color: "#fff" }}>{app.productName}</strong>
                {app.productValueInr ? ` (₹${parseFloat(app.productValueInr).toLocaleString("en-IN")})` : ""} in exchange for content.
              </p>
            )}
          </div>
          {hoursLeft !== null && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
                {hoursLeft > 0 ? `${hoursLeft}h left to respond` : "Expiring very soon"}
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onDecline} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontFamily: POPPINS }}>
              <XCircle className="w-3.5 h-3.5" /> Decline
            </button>
            <button onClick={onConfirm} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: "#10B981", color: "#fff", fontFamily: POPPINS }}>
              <CheckCircle className="w-3.5 h-3.5" /> {loading ? "…" : "I'm In!"}
            </button>
          </div>
        </div>
      )}

      {!isPaid && isSelected && isExpiredDeadline && (
        <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>⚠️ Confirmation window expired</p>
      )}

      {!isPaid && app.status === "CONFIRMED" && !isDealLive && (
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)" }}>
          <p className="text-green-400 text-xs" style={{ fontFamily: POPPINS }}>
            ✓ You're confirmed! The brand will ship the product to you.
          </p>
        </div>
      )}
      {!isPaid && app.status === "CONFIRMED" && isDealLive && (
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.25)" }}>
          <p className="text-emerald-300 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
            🎉 Deal is live! Head to your Deals tab to start the content workflow.
          </p>
        </div>
      )}
    </div>
  );
}

export default function CreatorCampaigns() {
  const { accessToken, creatorId, loading: authLoading } = useCreatorAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const TAB_MAP: Record<string, number> = { paid: 0, barter: 1, applications: 2 };
  const initialTab = (() => { const p = new URLSearchParams(search); return TAB_MAP[p.get("tab") ?? ""] ?? 0; })();
  const [tab, setTab] = useState(initialTab);
  const [paid, setPaid] = useState<any[] | null>(null);
  const [barter, setBarter] = useState<any[] | null>(null);
  const [myApps, setMyApps] = useState<any[] | null>(null);
  const [appLoading, setAppLoading] = useState<string | null>(null);
  const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  const apiFetch = useCallback((path: string, opts?: RequestInit) =>
    fetch(`${BASE_URL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    }), [accessToken, BASE_URL]);

  useEffect(() => { if (!authLoading && !creatorId) navigate("/login-creator"); }, [creatorId, authLoading]);

  useEffect(() => {
    const handler = (e: Event) => {
      const tabName = (e as CustomEvent<{ tab: string }>).detail?.tab;
      if (tabName && TAB_MAP[tabName] !== undefined) setTab(TAB_MAP[tabName]);
    };
    window.addEventListener("collabry:tab", handler);
    return () => window.removeEventListener("collabry:tab", handler);
  }, []);

  const loadTab = useCallback(() => {
    if (!creatorId) return;
    if (tab === 0) { setPaid(null); apiFetch("/api/creator/campaigns/available").then(r => r.ok ? r.json() : []).then(setPaid).catch(() => setPaid([])); }
    if (tab === 1) { setBarter(null); apiFetch("/api/creator/barter/available").then(r => r.ok ? r.json() : []).then(setBarter).catch(() => setBarter([])); }
    if (tab === 2) { setMyApps(null); apiFetch("/api/creator/applications").then(r => r.ok ? r.json() : []).then(setMyApps).catch(() => setMyApps([])); }
  }, [tab, creatorId, apiFetch]);

  useEffect(() => { loadTab(); }, [loadTab]);

  const handleConfirm = async (app: any) => {
    setAppLoading(app.id);
    try {
      const path = app.kind === "BARTER"
        ? `/api/creator/barter/${app.campaignId}/applications/${app.id}/confirm`
        : `/api/creator/campaigns/${app.campaignId}/applications/${app.id}/confirm`;
      const r = await apiFetch(path, { method: "POST" });
      if (r.ok) loadTab();
    } finally { setAppLoading(null); }
  };

  const handleDecline = async (app: any) => {
    if (!confirm("Are you sure you want to decline this selection?")) return;
    setAppLoading(app.id);
    try {
      const path = app.kind === "BARTER"
        ? `/api/creator/barter/${app.campaignId}/applications/${app.id}/decline`
        : `/api/creator/campaigns/${app.campaignId}/applications/${app.id}/decline`;
      const r = await apiFetch(path, { method: "POST" });
      if (r.ok) loadTab();
    } finally { setAppLoading(null); }
  };

  if (authLoading || !creatorId) return null;

  return (
    <CreatorLayout status="ACTIVE" onLocked={() => {}}>
      <div className="px-4 lg:px-0 pt-6 lg:pt-10 pb-10">

        <div className="text-center mb-7">
          <h1 className="text-white font-bold text-2xl lg:text-3xl mb-1.5" style={{ fontFamily: POPPINS }}>
            Explore <span style={{ color: PINK }}>Campaigns</span>
          </h1>
          <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>
            Discover paid and barter opportunities matched to your profile.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-6">
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className="py-2.5 rounded-xl text-[11px] sm:text-xs font-semibold text-center transition-all"
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

        {tab === 0 && (
          paid === null ? <Skeleton /> :
          paid.length === 0 ? (
            <div className="text-center py-20">
              <Megaphone className="w-12 h-12 mx-auto mb-3 text-white/70" />
              <p className="text-white/75 text-sm font-semibold mb-1" style={{ fontFamily: POPPINS }}>No paid campaigns right now</p>
              <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>Check back soon — new campaigns are added regularly</p>
            </div>
          ) : paid.map(c => <CampaignCard key={c.id} c={c} onClick={() => navigate(`/home-creator/campaigns/${c.id}`)} />)
        )}

        {tab === 1 && (
          barter === null ? <Skeleton /> :
          barter.length === 0 ? (
            <div className="text-center py-20">
              <Gift className="w-12 h-12 mx-auto mb-3 text-white/70" />
              <p className="text-white/75 text-sm font-semibold mb-1" style={{ fontFamily: POPPINS }}>No barter campaigns available</p>
              <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>Barter = receive a product in exchange for content</p>
            </div>
          ) : barter.map(c => <BarterCard key={c.id} c={c} onClick={() => navigate(`/home-creator/barter/${c.id}`)} />)
        )}

        {tab === 2 && (
          myApps === null ? <Skeleton /> :
          myApps.length === 0 ? (
            <div className="text-center py-20">
              <Sparkles className="w-12 h-12 mx-auto mb-3 text-white/70" />
              <p className="text-white/75 text-sm font-semibold mb-1" style={{ fontFamily: POPPINS }}>No applications yet</p>
              <p className="text-white/70 text-xs mb-7" style={{ fontFamily: POPPINS }}>Start applying to campaigns that fit your niche</p>
              <button onClick={() => setTab(0)}
                className="px-6 py-2.5 rounded-full text-white text-sm font-semibold" style={{ background: PINK, fontFamily: POPPINS }}>
                Browse Campaigns
              </button>
            </div>
          ) : myApps.map(app => (
            <ApplicationCard key={app.id} app={app} loading={appLoading === app.id}
              onConfirm={() => handleConfirm(app)} onDecline={() => handleDecline(app)} />
          ))
        )}
      </div>
    </CreatorLayout>
  );
}
