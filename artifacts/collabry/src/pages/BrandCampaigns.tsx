import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Plus, Megaphone, Gift, Users, ArrowRight, CheckCircle, Clock } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";

const MERRIWEATHER = "'Merriweather', serif";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:            { label: "Draft",         color: "#9CA3AF", bg: "rgba(156,163,175,0.10)" },
  LIVE:             { label: "Active",         color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  HIDDEN:           { label: "Full",           color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  PAUSED:           { label: "Paused",         color: "#60A5FA", bg: "rgba(96,165,250,0.12)"  },
  EXPIRED:          { label: "Expired",        color: "#9CA3AF", bg: "rgba(156,163,175,0.10)" },
  CANCELLED:        { label: "Cancelled",      color: "#EF4444", bg: "rgba(239,68,68,0.10)"   },
  DELETED:          { label: "Deleted",        color: "#EF4444", bg: "rgba(239,68,68,0.10)"   },
  PENDING_APPROVAL: { label: "In Review",      color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  CREDIT_HOLD:      { label: "Credit Hold",    color: "#F97316", bg: "rgba(249,115,22,0.12)"  },
  REJECTED:         { label: "Rejected",       color: "#EF4444", bg: "rgba(239,68,68,0.10)"   },
};

function StatusNote({ c }: { c: any }) {
  if (c.status === "PENDING_APPROVAL")
    return <p className="text-amber-400 text-xs" style={{ fontFamily: POPPINS }}>⏳ Under review — credits only charged on approval</p>;
  if (c.status === "CREDIT_HOLD")
    return <p className="text-orange-400 text-xs" style={{ fontFamily: POPPINS }}>⚠ Approved! Top up your credits to go live</p>;
  if (c.status === "REJECTED")
    return <p className="text-red-400 text-xs" style={{ fontFamily: POPPINS }}>⚠ Your campaign was not approved</p>;
  if (["LIVE", "HIDDEN"].includes(c.status))
    return <p className="text-green-400 text-xs flex items-center gap-1" style={{ fontFamily: POPPINS }}><CheckCircle className="w-3 h-3" /> Approved and visible to creators</p>;
  if (c.status === "PAUSED")
    return <p className="text-blue-300 text-xs flex items-center gap-1" style={{ fontFamily: POPPINS }}><Clock className="w-3 h-3" /> Paused — not visible to creators</p>;
  return null;
}

function CampaignCard({ c, onClick, onCreateAnother }: { c: any; onClick: () => void; onCreateAnother?: () => void }) {
  const st = STATUS_MAP[c.status] ?? { label: c.status, color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
  const isActive = ["LIVE", "HIDDEN"].includes(c.status);
  const slotsUsed = c.slotsFilled ?? 0;
  const slotsTotal = c.slotCount ?? 0;
  const pendingApps = c.pendingApps ?? 0;

  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(255,255,255,0.18)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-white font-bold text-lg leading-tight" style={{ fontFamily: POPPINS }}>{c.name}</h2>
          <p className="text-white/70 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>
            {c.type === "REEL" ? "Instagram Reel" : c.type === "STORY" ? "Instagram Story" : "Instagram Post"}
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0"
          style={{ color: st.color, background: st.bg, fontFamily: POPPINS }}>{st.label}</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="font-bold text-base leading-none" style={{ fontFamily: POPPINS, color: PINK }}>
            ₹{parseFloat(c.pricePerCreator ?? 0).toLocaleString("en-IN")}
          </p>
          <p className="text-white/70 text-[10px] mt-1" style={{ fontFamily: POPPINS }}>per creator</p>
        </div>
        <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="font-bold text-base leading-none" style={{ fontFamily: POPPINS, color: pendingApps > 0 ? "#F59E0B" : "rgba(255,255,255,0.75)" }}>{pendingApps}</p>
          <p className="text-white/70 text-[10px] mt-1" style={{ fontFamily: POPPINS }}>applied</p>
        </div>
        <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(240,24,122,0.40)" }}>
          <p className="font-bold text-base leading-none" style={{ fontFamily: POPPINS, color: PINK }}>{slotsUsed}/{slotsTotal}</p>
          <p className="text-[10px] mt-1" style={{ fontFamily: POPPINS, color: "rgba(240,24,122,0.8)" }}>creator selected</p>
        </div>
      </div>

      <StatusNote c={c} />

      <div className="flex items-center gap-2 flex-wrap mt-3">
        {c.status === "REJECTED" && onCreateAnother && (
          <button onClick={onCreateAnother}
            className="text-xs text-white/70 underline underline-offset-2" style={{ fontFamily: POPPINS }}>
            Create another
          </button>
        )}
        <button onClick={onClick}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium ml-auto"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
          View Campaign Detail
        </button>
        {isActive && (
          <button onClick={onClick}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-semibold"
            style={{ background: PINK, fontFamily: POPPINS }}>
            View Applicants <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function BarterCard({ c, onClick }: { c: any; onClick: () => void }) {
  const st = STATUS_MAP[c.status] ?? { label: c.status, color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
  const isActive = ["LIVE", "HIDDEN", "PARTIALLY_FILLED"].includes(c.status);
  const slotsUsed = c.slotsFilled ?? 0;
  const slotsTotal = c.slotCount ?? 0;
  const pendingApps = c.pendingApps ?? 0;

  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(255,255,255,0.18)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-white font-bold text-lg leading-tight" style={{ fontFamily: POPPINS }}>{c.name}</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Gift className="w-3 h-3 text-white/70" />
            <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>{c.productName}</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0"
          style={{ color: st.color, background: st.bg, fontFamily: POPPINS }}>{st.label}</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="font-bold text-base leading-none" style={{ fontFamily: POPPINS, color: "#10B981" }}>
            ₹{parseFloat(c.productValueInr ?? 0).toLocaleString("en-IN")}
          </p>
          <p className="text-white/70 text-[10px] mt-1" style={{ fontFamily: POPPINS }}>product value</p>
        </div>
        <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="font-bold text-base leading-none" style={{ fontFamily: POPPINS, color: pendingApps > 0 ? "#F59E0B" : "rgba(255,255,255,0.75)" }}>{pendingApps}</p>
          <p className="text-white/70 text-[10px] mt-1" style={{ fontFamily: POPPINS }}>applied</p>
        </div>
        <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(240,24,122,0.40)" }}>
          <p className="font-bold text-base leading-none" style={{ fontFamily: POPPINS, color: PINK }}>{slotsUsed}/{slotsTotal}</p>
          <p className="text-[10px] mt-1" style={{ fontFamily: POPPINS, color: "rgba(240,24,122,0.8)" }}>creator selected</p>
        </div>
      </div>

      <StatusNote c={c} />

      <div className="flex items-center gap-2 flex-wrap mt-3">
        <button onClick={onClick}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium ml-auto"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
          View Campaign Detail
        </button>
        {isActive && (
          <button onClick={onClick}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-semibold"
            style={{ background: PINK, fontFamily: POPPINS }}>
            View Applicants <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function BrandCampaigns() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"paid" | "barter">("paid");
  const [campaigns, setCampaigns] = useState<any[] | null>(null);
  const [barters, setBarters] = useState<any[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading]);

  const load = useCallback(async () => {
    if (!brandId) return;
    setError("");
    try {
      const [cr, br] = await Promise.all([
        apiFetch("/api/brand/campaigns"),
        apiFetch("/api/brand/barter"),
      ]);
      if (cr.ok) setCampaigns((await cr.json()).filter((c: any) => c.status !== "DELETED"));
      if (br.ok) setBarters((await br.json()).filter((c: any) => c.status !== "DELETED"));
    } catch { setError("Failed to load campaigns."); }
  }, [brandId, apiFetch]);

  useEffect(() => { load(); }, [load]);

  if (authLoading || !brandId) return null;

  return (
    <BrandLayout>
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-28">

        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="font-bold text-white leading-tight mb-3" style={{ fontFamily: MERRIWEATHER, fontSize: "clamp(20px,5vw,42px)" }}>
            Launch High-Impact{" "}
            <span style={{ color: PINK }}>Campaigns</span>{" "}
            with the Right{" "}
            <span style={{ color: PINK }}>Creators</span>
          </h1>
          <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>
            Choose paid or barter, define your offer, and connect with creators who truly fit your brand.
          </p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1.5 mb-5">
          {(["paid", "barter"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="py-3 rounded-xl text-sm font-semibold text-center transition-all"
              style={{
                background: tab === t ? PINK : "rgba(255,255,255,0.06)",
                color: tab === t ? "#fff" : "rgba(255,255,255,0.7)",
                border: `1px solid ${tab === t ? PINK : "rgba(255,255,255,0.08)"}`,
                fontFamily: POPPINS,
              }}>
              {t === "paid" ? "Paid Campaigns" : "Barter Campaigns"}
            </button>
          ))}
        </div>

        {/* Create button */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => navigate(tab === "paid" ? "/home-brand/campaigns/create" : "/home-brand/campaigns/create-barter")}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white text-sm font-semibold"
            style={{ background: PINK, fontFamily: POPPINS }}>
            <Plus className="w-4 h-4" />
            {tab === "paid" ? "New Paid Campaign" : "New Barter Campaign"}
          </button>
        </div>

        {error && <p className="text-red-400 text-sm mb-4" style={{ fontFamily: POPPINS }}>{error}</p>}

        {/* Paid list */}
        {tab === "paid" && (
          campaigns === null ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-20">
              <Megaphone className="w-12 h-12 mx-auto mb-3 text-white/70" />
              <p className="text-white/75 text-sm font-semibold mb-1" style={{ fontFamily: POPPINS }}>No paid campaigns yet</p>
              <p className="text-white/70 text-xs mb-7" style={{ fontFamily: POPPINS }}>Set your budget, content type, and creator criteria to get started</p>
              <button onClick={() => navigate("/home-brand/campaigns/create")}
                className="px-6 py-2.5 rounded-full text-white text-sm font-semibold" style={{ background: PINK, fontFamily: POPPINS }}>
                Create Your First Campaign
              </button>
            </div>
          ) : campaigns.map(c => (
            <CampaignCard key={c.id} c={c}
              onClick={() => navigate(`/home-brand/campaigns/${c.id}`)}
              onCreateAnother={() => navigate("/home-brand/campaigns/create")} />
          ))
        )}

        {/* Barter list */}
        {tab === "barter" && (
          barters === null ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />)}
            </div>
          ) : barters.length === 0 ? (
            <div className="text-center py-20">
              <Gift className="w-12 h-12 mx-auto mb-3 text-white/70" />
              <p className="text-white/75 text-sm font-semibold mb-1" style={{ fontFamily: POPPINS }}>No barter campaigns yet</p>
              <p className="text-white/70 text-xs mb-7" style={{ fontFamily: POPPINS }}>Offer a product in exchange for creator content — no cash required</p>
              <button onClick={() => navigate("/home-brand/campaigns/create-barter")}
                className="px-6 py-2.5 rounded-full text-white text-sm font-semibold" style={{ background: PINK, fontFamily: POPPINS }}>
                Create Barter Campaign
              </button>
            </div>
          ) : barters.map(c => (
            <BarterCard key={c.id} c={c} onClick={() => navigate(`/home-brand/barter/${c.id}`)} />
          ))
        )}
      </div>
    </BrandLayout>
  );
}
