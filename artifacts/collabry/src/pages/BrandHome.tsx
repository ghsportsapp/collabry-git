import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Search as SearchIcon, Sparkles, Megaphone, Gift,
  Coins, ArrowRight, X, Clock, ShieldCheck, BadgeCheck, LayoutGrid,
  IndianRupee, ChevronDown, ChevronUp,
} from "lucide-react";
import { jsPDF } from "jspdf";

function downloadInvoicePdf(imageUrl: string, filename: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;
  img.onload = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    (pdf as any).addImage(img, "JPEG", 0, 0, 210, 297);
    pdf.save(filename);
  };
}
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";
import { useBrandLandingContent } from "@/hooks/useBrandLandingContent";
import HowItWorks from "@/components/landing/HowItWorks";
import ComparisonTable from "@/components/landing/ComparisonTable";
import BrandWelcomePopup from "@/components/BrandWelcomePopup";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

interface FreeBatch { amount: number; expiresAt: string | null; label: string; }
interface CreditBalance { total: number; free: number; purchased: number; freeExpiry: string | null; freeBatches?: FreeBatch[]; }
interface Stats { activeDeals: number; totalDeals: number; liveCampaigns: number; creatorsUnlocked: number; totalSpent: number; }

interface BrandPayment {
  paymentId: string;
  dealId: string;
  amount: string;
  gstAmount: string;
  creatorPayout: string;
  commissionRateLocked: string;
  confirmedAt: string;
  status: string;
  escrowStatus: string;
  totalAgreedValue: string;
  reelCount: number;
  storyCount: number;
  postCount: number;
  instagramHandle: string;
  brandName: string;
  brandEmail: string;
  orderId?: string | null;
  invoiceUrl?: string | null;
}

interface CreditPurchase {
  id: string;
  orderId: string | null;
  credits: number | null;
  amountInr: number | null;
  gstAmountInr: number | null;
  createdAt: string;
  invoiceUrl: string | null;
}

function fmtINR(val: number | string): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? "₹0" : "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function contentTypeLabel(r: number, s: number, p: number): string {
  const parts: string[] = [];
  if (r > 0) parts.push(`${r} Reel${r > 1 ? "s" : ""}`);
  if (s > 0) parts.push(`${s} Stor${s > 1 ? "ies" : "y"}`);
  if (p > 0) parts.push(`${p} Post${p > 1 ? "s" : ""}`);
  return parts.join(", ") || "—";
}

function statusDisplay(dealStatus: string): { label: string; color: string; bg: string } {
  switch (dealStatus) {
    case "COMPLETED": return { label: "Completed", color: "#16a34a", bg: "rgba(22,163,74,0.12)" };
    case "IN_ESCROW":
    case "CONCEPT_SUBMITTED":
    case "REVISION_REQUESTED":
    case "CONCEPT_APPROVED":
    case "IN_PROGRESS":
    case "OVERDUE":
    case "CONTENT_UPLOADED":
    case "POST_LIVE_PENDING":
    case "FINAL_POST_PENDING":
    case "DISPUTE_WINDOW_OPEN":
    case "URL_FLAGGED":
      return { label: "In Escrow", color: "#d97706", bg: "rgba(217,119,6,0.12)" };
    case "CANCELLED":
      return { label: "Cancelled", color: "#ef4444", bg: "rgba(239,68,68,0.10)" };
    default:
      return { label: dealStatus, color: "#9ca3af", bg: "rgba(156,163,175,0.10)" };
  }
}


const STATS_CACHE_PREFIX = "bh_stats_v2:";
const BRAND_CACHE_PREFIX = "bh_brand_v2:";
const ZERO_STATS: Stats = { activeDeals: 0, totalDeals: 0, liveCampaigns: 0, creatorsUnlocked: 0, totalSpent: 0 };

function readCache<T>(key: string | null): T | null {
  if (!key) return null;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
function writeCache(key: string | null, val: unknown) {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}

const THREE_STEPS = [
  { title: "Choose Your Mode", desc: "Search manually, use AI Matchmaking, post a Campaign, or offer Barter. Four ways to find your perfect creator." },
  { title: "Connect and Collaborate", desc: "Unlock creator profiles, review their portfolio, and send your brief directly." },
  { title: "Pay Only on Approval", desc: "Your payment stays in escrow until you approve the content. Zero risk." },
];

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "Escrow Protected" },
  { icon: BadgeCheck, label: "Real Brands" },
  { icon: LayoutGrid, label: "4 Ways to Collab" },
];

interface WelcomeState { credits: number; popupSeen: boolean; bannerDismissed: boolean; }
function readWelcome(brandId: string): WelcomeState | null {
  try { const v = localStorage.getItem(`collabry_welcome_${brandId}`); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeWelcome(brandId: string, state: WelcomeState) {
  try { localStorage.setItem(`collabry_welcome_${brandId}`, JSON.stringify(state)); } catch {}
}

export default function BrandHome() {
  const { brandId, brandName, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();

  const brandCacheKey = brandId ? `${BRAND_CACHE_PREFIX}${brandId}` : null;
  const statsCacheKey = brandId ? `${STATS_CACHE_PREFIX}${brandId}` : null;

  const [brand, setBrand]     = useState<any>(() => readCache(brandCacheKey));
  const { credits, setCredits } = useBrandCredits();
  // For new brands (no cached stats), default to zeros instead of "–" so they don't
  // see stale data from a previously logged-in brand on the same browser.
  const [stats, setStats]     = useState<Stats | null>(() => readCache<Stats>(statsCacheKey) ?? ZERO_STATS);
  const [imgError, setImgError] = useState(false);
  const [showCreditDetail, setShowCreditDetail] = useState(false);

  const [welcomeState, setWelcomeState] = useState<WelcomeState | null>(null);

  useEffect(() => {
    if (!brandId) return;
    const ws = readWelcome(brandId);
    if (ws) setWelcomeState(ws);
  }, [brandId]);

  const c = useBrandLandingContent();

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading, navigate]);

  // When the brand changes (e.g. another brand logs in on the same browser),
  // reset to that brand's cached state — never display the previous brand's data.
  useEffect(() => {
    if (!brandId) return;
    setBrand(readCache(brandCacheKey));
    setStats(readCache<Stats>(statsCacheKey) ?? ZERO_STATS);
  }, [brandId, brandCacheKey, statsCacheKey]);

  useEffect(() => {
    if (!brandId) return;
    apiFetch("/api/brand/profile").then(async r => {
      if (r.ok) {
        const d = await r.json();
        const b = d?.brand ?? d;
        setBrand(b); writeCache(brandCacheKey, b);
      }
    });
    apiFetch("/api/brand/stats").then(async r => {
      if (r.ok) { const d = await r.json(); setStats(d); writeCache(statsCacheKey, d); }
    });
    // Intentionally exclude credits/setCredits — the seeding effect below handles them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, apiFetch, brandCacheKey, statsCacheKey]);

  // Seed the credits card immediately from the brand profile (creditBalance +
  // freeCreditsExpiry). This avoids the empty-skeleton flash for new brands and
  // shows their signup credits with the expiry instantly. The detailed
  // `/credits/balance` call will refine the freeBatches breakdown a moment later.
  useEffect(() => {
    if (credits) return;
    if (typeof brand?.creditBalance !== "number") return;
    const total = brand.creditBalance as number;
    const expiry = brand.freeCreditsExpiry ? new Date(brand.freeCreditsExpiry).toISOString() : null;
    setCredits({
      total,
      free: total,
      purchased: 0,
      freeExpiry: expiry,
      freeBatches: total > 0
        ? [{ amount: total, expiresAt: expiry, label: "Signup credits" }]
        : [],
    });
  }, [brand, credits, setCredits]);

  const handlePopupDismiss = () => {
    if (!brandId || !welcomeState) return;
    const next = { ...welcomeState, popupSeen: true };
    writeWelcome(brandId, next);
    setWelcomeState(next);
  };

  const handleBannerDismiss = () => {
    if (!brandId || !welcomeState) return;
    const next = { ...welcomeState, bannerDismissed: true };
    writeWelcome(brandId, next);
    setWelcomeState(next);
  };

  if (authLoading || !brandId) return null;

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

  const daysUntil = (d: string | null | undefined) => {
    if (!d) return null;
    return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));
  };

  /* Closest expiry among free batches */
  const closestExpiry: string | null = (() => {
    const batches = credits?.freeBatches ?? [];
    const withExpiry = batches.filter(b => b.expiresAt);
    if (!withExpiry.length) return null;
    return withExpiry.sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime())[0].expiresAt;
  })();

  const quickStats = [
    { value: stats?.activeDeals   ?? "–", label: "Active Deals",    onClick: () => navigate("/home-brand/deals?tab=live")  },
    { value: stats?.totalDeals    ?? "–", label: "Total Deals",      onClick: () => navigate("/home-brand/deals")     },
    { value: stats?.liveCampaigns ?? "–", label: "Live Campaigns",   onClick: () => navigate("/home-brand/campaigns") },
    { value: stats?.creatorsUnlocked ?? "–", label: "Unlocked Profile", onClick: () => navigate("/home-brand/unlocked") },
  ];

  const campaignCards = c.getJson<Array<{ value: string; label: string }>>("brand.stats.cards");
  const campaignSub   = c.get("brand.stats.subheading");

  const logoSrc = brand?.logoUrl
    ? (/^(https?:|data:)/.test(brand.logoUrl) ? brand.logoUrl : `${BASE_URL}${brand.logoUrl}`)
    : null;

  return (
    <BrandLayout credits={credits?.total ?? null}>
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-4">

        {/* ── Profile row (always full width) ── */}
        <div className="flex items-center gap-3 mb-8 lg:mb-10 pt-1 lg:pt-6">
          <div
            className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2"
            style={{ background: "rgba(240,24,122,0.15)", borderColor: "rgba(240,24,122,0.35)" }}
          >
            {logoSrc && !imgError ? (
              <img
                src={logoSrc}
                alt="logo"
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-base font-bold" style={{ color: PINK }}>
                {(brand?.brandName ?? brandName ?? "?")[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>Welcome back,</p>
            <p className="font-bold text-xl lg:text-2xl leading-tight truncate" style={{ fontFamily: POPPINS, color: PINK }}>
              {brand?.brandName ?? brandName ?? "Brand"}
            </p>
            <p className="text-white/70 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>Let's find perfect creator for you.</p>
          </div>
        </div>

        {/* ── Total Spent ── */}
        <TotalSpentWidget apiFetch={apiFetch} />

        {/* ── Welcome banner (new signups only, dismissible) ── */}
        {welcomeState && !welcomeState.bannerDismissed && (
          <div
            className="relative rounded-2xl px-4 py-4 mb-5 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(240,24,122,0.22) 0%, rgba(180,0,100,0.14) 50%, rgba(60,0,80,0.18) 100%)",
              border: "1px solid rgba(240,24,122,0.38)",
              boxShadow: "0 0 40px rgba(240,24,122,0.08)",
            }}
          >
            {/* Subtle glow blob */}
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(240,24,122,0.2) 0%, transparent 70%)" }} />

            <button
              onClick={handleBannerDismiss}
              className="absolute top-3 right-3 text-white/70 hover:text-white/90 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3 pr-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "rgba(240,24,122,0.2)", border: "1px solid rgba(240,24,122,0.4)" }}>
                <Sparkles className="w-4 h-4" style={{ color: PINK }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-snug" style={{ fontFamily: POPPINS }}>
                  You've got{" "}
                  <span style={{ color: PINK }}>{welcomeState.credits} free credit{welcomeState.credits === 1 ? "" : "s"}</span>{" "}
                  waiting.
                </p>
                <p className="text-white/80 text-xs mt-0.5 leading-relaxed" style={{ fontFamily: POPPINS }}>
                  Unlock creators and launch your first campaign today.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => navigate("/home-brand/search")}
                    className="px-3.5 py-1.5 rounded-full text-white text-xs font-semibold flex items-center gap-1 transition-opacity hover:opacity-90"
                    style={{ background: PINK, fontFamily: POPPINS }}
                  >
                    <SearchIcon className="w-3 h-3" /> Explore Creators
                  </button>
                  <button
                    onClick={() => navigate("/home-brand/campaigns")}
                    className="px-3.5 py-1.5 rounded-full text-white text-xs font-semibold flex items-center gap-1 transition-opacity hover:opacity-80"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", fontFamily: POPPINS }}
                  >
                    <Megaphone className="w-3 h-3" /> Post Campaign
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Mobile quick stats (4 in a row, no card bg) ── */}
        <div className="grid grid-cols-4 gap-1 mb-5 lg:hidden items-start">
          {quickStats.map((s, i) => {
            const [w1, ...rest] = s.label.split(" ");
            const w2 = rest.join(" ");
            return (
              <button key={i} onClick={s.onClick}
                className="px-1 py-1.5 text-center transition-opacity hover:opacity-80 active:scale-95 cursor-pointer bg-transparent border-0 self-start">
                <p className="font-bold text-2xl leading-tight" style={{ fontFamily: POPPINS, color: PINK }}>
                  {s.value}
                </p>
                <p className="text-white/85 text-[11px] mt-1 leading-tight" style={{ fontFamily: POPPINS, minHeight: "2.4em" }}>
                  <span className="block">{w1}</span>
                  {w2 && <span className="block">{w2}</span>}
                </p>
              </button>
            );
          })}
        </div>

        {/* ── Desktop: Credits (left) + Stats (right) aligned side by side ── */}
        <div className="hidden lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-6 mb-8">
          {/* LEFT: Credits card */}
          <CreditsCard
            credits={credits}
            closestExpiry={closestExpiry}
            daysUntil={daysUntil}
            onDetailClick={() => setShowCreditDetail(true)}
            onBuyClick={() => navigate("/home-brand/credits")}
          />

          {/* RIGHT: Quick stats 2×2 */}
          <div className="grid grid-cols-2 gap-3 self-start">
            {quickStats.map((s, i) => (
              <button key={i} onClick={s.onClick}
                className="rounded-2xl p-5 text-center group transition-all hover:scale-[1.02] cursor-pointer"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="font-bold text-3xl leading-tight mb-1 transition-opacity group-hover:opacity-80"
                  style={{ fontFamily: POPPINS, color: PINK }}>
                  {s.value}
                </p>
                <p className="text-white/75 text-sm" style={{ fontFamily: POPPINS }}>{s.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Mobile: Credits card (below stats) ── */}
        <div className="lg:hidden mb-6">
          <CreditsCard
            credits={credits}
            closestExpiry={closestExpiry}
            daysUntil={daysUntil}
            onDetailClick={() => setShowCreditDetail(true)}
            onBuyClick={() => navigate("/home-brand/credits")}
          />
        </div>

        {/* ── Find Your Perfect Creator ── */}
        <section className="mb-8 mt-10 lg:mt-14 lg:py-10">
          <div className="text-center mb-6 lg:mb-14">
            <h2 className="text-white text-xl lg:text-[46px] font-bold leading-tight" style={{ fontFamily: POPPINS }}>
              Find Your <span style={{ color: PINK }}>Perfect Creator</span>
            </h2>
            <p className="text-white/70 text-xs lg:text-base mt-2 lg:mt-3" style={{ fontFamily: POPPINS }}>
              Four powerful ways to connect
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <ModeCard icon={<SearchIcon className="w-5 h-5" style={{ color: PINK }} />}
              title="Search"
              desc="Browse creators manually. Filter by category, niche, audience, price range, and rating."
              cta="Find Creators" onClick={() => navigate("/home-brand/search")} />
            <ModeCard icon={<Sparkles className="w-5 h-5" style={{ color: PINK }} />}
              title="AI Matchmaking"
              desc="Set your campaign goal and target audience. Our algorithm scores every creator out of 100 and gives you the best fit."
              cta="Find Match" onClick={() => navigate("/home-brand/matchmaking")} />
            <ModeCard icon={<Megaphone className="w-5 h-5" style={{ color: PINK }} />}
              title="Paid Campaign"
              desc="Post your campaign brief and price. Creators apply. You review, shortlist, and select the best fit, then pay 50."
              cta="Start Campaign" onClick={() => navigate("/home-brand/campaigns")} />
            <ModeCard icon={<Gift className="w-5 h-5" style={{ color: PINK }} />}
              title="Barter"
              desc="No cash budget? No problem. Offer your product instead of payment. Creator applies for free, and gets the product."
              cta="Offer a product" onClick={() => navigate("/home-brand/campaigns")} />
          </div>

          <div className="flex flex-nowrap items-center justify-center gap-2 lg:gap-8">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 lg:gap-2 min-w-0">
                <div className="w-5 h-5 lg:w-7 lg:h-7 rounded-md lg:rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <Icon className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-white" />
                </div>
                <span className="text-white/75 text-[10px] lg:text-xs whitespace-nowrap" style={{ fontFamily: POPPINS }}>{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── How It Works (3 steps) ── */}
        <section className="mb-8">
          <HowItWorks brandsOnly subtitleOverride="Simple for Brands. Powerful for Results." brandStepsOverride={THREE_STEPS} />
        </section>

        {/* ── Why Most Campaigns Waste Money (no card bg) ── */}
        <section className="mb-8 px-3 lg:px-0">
          <div className="text-center mb-6">
            <h2 className="font-bold text-white text-xl lg:text-3xl" style={{ fontFamily: POPPINS }}>
              Why Most Campaigns <span style={{ color: PINK }}>Waste Money?</span>
            </h2>
            <p className="text-white/70 text-xs lg:text-sm mt-2" style={{ fontFamily: POPPINS }}>
              {campaignSub || "The data is clear. Most brands are doing it wrong."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
            {campaignCards.map((card, i) => (
              <div key={i} className="py-1">
                <p className="font-bold mb-1.5"
                  style={{ color: PINK, fontFamily: POPPINS, fontSize: "clamp(1rem, 1.5vw, 1.25rem)" }}>
                  {card.value}
                </p>
                <p className="text-white/75 text-sm leading-relaxed" style={{ fontFamily: POPPINS }}>{card.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Old Way vs Collabry Way ── */}
        <section className="mb-4">
          <ComparisonTable rows={c.getJson("brand.comparison.rows")} />
        </section>
      </div>

      {/* ── Welcome popup (shown once after signup) ── */}
      {welcomeState && !welcomeState.popupSeen && (
        <BrandWelcomePopup
          brandName={brand?.brandName ?? brandName ?? ""}
          credits={welcomeState.credits}
          onDismiss={handlePopupDismiss}
        />
      )}

      {/* ── Credit Detail Modal ── */}
      {showCreditDetail && credits && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => setShowCreditDetail(false)}>
          <div className="w-full max-w-sm rounded-2xl p-5"
            style={{ background: "#1a1a2e" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4" style={{ color: PINK }} />
                <span className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Credit Breakdown</span>
              </div>
              <button onClick={() => setShowCreditDetail(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="space-y-2.5">
              {(credits.freeBatches ?? []).map((batch, i) => {
                const days = daysUntil(batch.expiresAt);
                return (
                  <div key={i} className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(240,24,122,0.15)" }}>
                        {batch.expiresAt
                          ? <Clock className="w-4 h-4" style={{ color: PINK }} />
                          : <Gift className="w-4 h-4" style={{ color: PINK }} />}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-xs" style={{ fontFamily: POPPINS }}>{batch.label}</p>
                        {batch.expiresAt ? (
                          <p className="text-[11px] font-medium mt-0.5" style={{ color: PINK, fontFamily: POPPINS }}>
                            Expires {fmtDate(batch.expiresAt)} · {days} days left
                          </p>
                        ) : (
                          <p className="text-white/70 text-[11px] mt-0.5" style={{ fontFamily: POPPINS }}>Never expire</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold text-lg leading-tight" style={{ fontFamily: POPPINS }}>{batch.amount}</p>
                      <p className="text-white/70 text-[10px]" style={{ fontFamily: POPPINS }}>credits</p>
                    </div>
                  </div>
                );
              })}

              {credits.purchased > 0 && (
                <div className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(240,24,122,0.15)" }}>
                      <Coins className="w-4 h-4" style={{ color: PINK }} />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-xs" style={{ fontFamily: POPPINS }}>Purchased Credits</p>
                      <p className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>Never expire</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold text-lg leading-tight" style={{ fontFamily: POPPINS }}>{credits.purchased}</p>
                    <p className="text-white/70 text-[10px]" style={{ fontFamily: POPPINS }}>credits</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3.5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-white/90 font-semibold text-sm" style={{ fontFamily: POPPINS }}>Total Balance</p>
              <p className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>{credits.total} credits</p>
            </div>

            <button onClick={() => { setShowCreditDetail(false); navigate("/home-brand/credits"); }}
              className="w-full mt-4 py-2.5 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-1.5"
              style={{ background: PINK, fontFamily: POPPINS }}>
              Buy More Credits <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </BrandLayout>
  );
}

/* ── Credits Card (shared between mobile and desktop) ── */
function CreditsCard({
  credits, closestExpiry, daysUntil, onDetailClick, onBuyClick,
}: {
  credits: CreditBalance | null;
  closestExpiry: string | null;
  daysUntil: (d: string | null | undefined) => number | null;
  onDetailClick: () => void;
  onBuyClick: () => void;
}) {
  const lowestDays = closestExpiry ? daysUntil(closestExpiry) : null;
  return (
    <div className="rounded-2xl p-4" style={{ background: "#4F0E30" }}>
      <div className="flex items-center gap-2 mb-3">
        <Coins className="w-4 h-4 text-white" />
        <h3 className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Your Credits</h3>
      </div>

      {credits === null ? (
        <div className="space-y-2 mb-3">
          <div className="h-14 rounded-xl animate-pulse" style={{ background: "rgba(0,0,0,0.06)" }} />
          <div className="h-4 w-28 mx-auto rounded animate-pulse" style={{ background: "rgba(0,0,0,0.06)" }} />
        </div>
      ) : credits.total === 0 ? (
        <div className="text-center py-3">
          <p className="text-white font-bold text-base mb-3" style={{ fontFamily: POPPINS }}>You have 0 credits</p>
          <button onClick={onBuyClick}
            className="w-full py-2.5 rounded-full text-white font-semibold text-sm"
            style={{ background: PINK, fontFamily: POPPINS }}>
            Buy Credits →
          </button>
        </div>
      ) : (
        <>
          <button onClick={onDetailClick}
            className="w-full rounded-xl p-4 mb-2 text-center"
            style={{ background: "rgba(255,255,255,0.80)" }}>
            <p className="text-4xl font-bold text-black leading-none" style={{ fontFamily: POPPINS }}>{credits.total}</p>
            <p className="text-[11px] font-semibold text-black/75 mt-1" style={{ fontFamily: POPPINS }}>Total Credits</p>
            {lowestDays !== null ? (
              <>
                <p className="text-[11px] mt-1.5 font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>
                  Free credits expire in {lowestDays} day{lowestDays === 1 ? "" : "s"}
                </p>
                <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#888", fontFamily: POPPINS }}>
                  Purchased credits never expire
                </p>
              </>
            ) : (
              <p className="text-[11px] mt-1.5 font-medium" style={{ color: "#888", fontFamily: POPPINS }}>Purchased credits never expire</p>
            )}
          </button>

          <button onClick={onDetailClick}
            className="block w-full text-[10px] text-center text-white/80 mb-3 underline-offset-2 hover:text-white/85 hover:underline transition-colors bg-transparent border-0 cursor-pointer"
            style={{ fontFamily: POPPINS }}>
            Tap to see free credit expiry details
          </button>

          <button onClick={onBuyClick}
            className="w-full py-2.5 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-1.5"
            style={{ background: PINK, fontFamily: POPPINS }}>
            Buy More Credits <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

/* ── Total Spent Widget ── */
function TotalSpentWidget({ apiFetch }: { apiFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  const [totalSpent, setTotalSpent] = useState<number | null>(null);
  const [payments, setPayments] = useState<BrandPayment[]>([]);
  const [creditPurchases, setCreditPurchases] = useState<CreditPurchase[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"deals" | "credits">("deals");
  useEffect(() => {
    apiFetch("/api/brand/payments")
      .then(r => r.ok ? r.json() : null)
      .then((d: { totalSpent: number; payments: BrandPayment[] } | null) => {
        if (!d) return;
        setTotalSpent(d.totalSpent);
        setPayments(d.payments);
      })
      .catch(() => {});
    apiFetch("/api/brand/credit-purchases")
      .then(r => r.ok ? r.json() : null)
      .then((d: CreditPurchase[] | null) => { if (d) setCreditPurchases(d); })
      .catch(() => {});
  }, [apiFetch]);

  const creditTotal = creditPurchases.reduce((s, p) => s + (p.amountInr ?? 0), 0);
  const combinedTotal = totalSpent === null ? null : totalSpent + creditTotal;
  const hasContent = payments.length > 0 || creditPurchases.length > 0;

  return (
    <div
      className="rounded-2xl mb-5"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-4 text-left"
        onClick={() => hasContent && setExpanded(v => !v)}
        style={{ cursor: hasContent ? "pointer" : "default", background: "transparent", border: "none" }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(240,24,122,0.14)", border: "1px solid rgba(240,24,122,0.25)" }}
        >
          <IndianRupee className="w-4 h-4" style={{ color: PINK }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white/70 text-xs font-medium" style={{ fontFamily: POPPINS }}>Total Spent</p>
          <p className="font-bold text-xl leading-tight" style={{ fontFamily: POPPINS, color: PINK }}>
            {combinedTotal === null ? "—" : fmtINR(combinedTotal)}
          </p>
        </div>
        {hasContent && (
          expanded
            ? <ChevronUp className="w-4 h-4 flex-shrink-0 text-white/50" />
            : <ChevronDown className="w-4 h-4 flex-shrink-0 text-white/50" />
        )}
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {(["deals", "credits"] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2.5 text-xs font-semibold capitalize transition-all"
                style={{
                  color: activeTab === tab ? PINK : "rgba(255,255,255,0.50)",
                  borderBottom: activeTab === tab ? `2px solid ${PINK}` : "2px solid transparent",
                  background: "transparent",
                }}
              >
                {tab === "deals" ? `Deals (${payments.length})` : `Credits (${creditPurchases.length})`}
              </button>
            ))}
          </div>

          {/* Deals Tab */}
          {activeTab === "deals" && (
            payments.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-white/50 text-sm font-medium" style={{ fontFamily: POPPINS }}>No deal payments yet.</p>
                <p className="text-white/30 text-xs mt-1" style={{ fontFamily: POPPINS }}>Your escrow payments will appear here.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", fontFamily: POPPINS }}>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide">Order ID</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide">Creator</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide text-right">Amount</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide text-center">Status</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide">Date</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide text-center">Document</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => {
                        const sd = statusDisplay(p.status);
                        const date = p.confirmedAt
                          ? new Date(p.confirmedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—";
                        const orderId = p.orderId ?? p.dealId.slice(0, 8).toUpperCase();
                        return (
                          <tr key={p.paymentId} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)", fontFamily: POPPINS }}>
                            <td className="px-5 py-4">
                              <span className="text-white/50 text-xs font-mono">{orderId}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-white text-sm font-medium">@{p.instagramHandle}</span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <span className="text-white text-sm font-bold">{fmtINR(p.amount)}</span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className="inline-block rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: sd.bg, color: sd.color }}>
                                {sd.label}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-white/60 text-xs whitespace-nowrap">{date}</span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              {p.invoiceUrl ? (
                                <button type="button"
                                  onClick={() => downloadInvoicePdf(p.invoiceUrl!, `Collabry-Deal-${p.orderId ?? p.dealId.slice(0, 8).toUpperCase()}.pdf`)}
                                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
                                  style={{ background: "rgba(240,24,122,0.15)", color: PINK, border: "1px solid rgba(240,24,122,0.28)" }}>
                                  ⬇ Download PDF
                                </button>
                              ) : (
                                <span title="Invoice processing — you will be notified once it's ready"
                                  className="inline-block rounded-full px-3 py-1 text-[11px] font-semibold"
                                  style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.22)" }}>
                                  Processing
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-2 p-3">
                  {payments.map(p => {
                    const sd = statusDisplay(p.status);
                    const date = p.confirmedAt
                      ? new Date(p.confirmedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                      : "—";
                    const orderId = p.orderId ?? p.dealId.slice(0, 8).toUpperCase();
                    return (
                      <div key={p.paymentId} className="rounded-xl p-3.5"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>@{p.instagramHandle}</p>
                            <p className="text-white/40 font-mono text-[10px] mt-0.5">{orderId} · {date}</p>
                          </div>
                          <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold flex-shrink-0" style={{ background: sd.bg, color: sd.color }}>
                            {sd.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>{fmtINR(p.amount)}</span>
                          {p.invoiceUrl ? (
                            <button type="button"
                              onClick={() => downloadInvoicePdf(p.invoiceUrl!, `Collabry-Deal-${p.orderId ?? p.dealId.slice(0, 8).toUpperCase()}.pdf`)}
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ background: "rgba(240,24,122,0.15)", color: PINK, border: "1px solid rgba(240,24,122,0.28)" }}>
                              ⬇ PDF
                            </button>
                          ) : (
                            <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold"
                              style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.22)" }}>
                              Processing
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )
          )}

          {/* Credits Tab */}
          {activeTab === "credits" && (
            creditPurchases.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-white/50 text-sm font-medium" style={{ fontFamily: POPPINS }}>No credit purchases yet.</p>
                <p className="text-white/30 text-xs mt-1" style={{ fontFamily: POPPINS }}>Credits you buy will appear here.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", fontFamily: POPPINS }}>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide">Order ID</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide text-center">Credits</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide text-right">Amount Paid</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide">Date</th>
                        <th className="px-5 py-3 text-[11px] font-semibold text-white/40 tracking-wide text-center">Document</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditPurchases.map((cp, i) => {
                        const date = new Date(cp.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                        return (
                          <tr key={cp.id} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)", fontFamily: POPPINS }}>
                            <td className="px-5 py-4">
                              <span className="text-white/50 text-xs font-mono">{cp.orderId ?? "—"}</span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className="inline-block rounded-full px-3 py-1 text-[11px] font-semibold"
                                style={{ background: "rgba(240,24,122,0.12)", color: PINK, border: "1px solid rgba(240,24,122,0.22)" }}>
                                +{cp.credits ?? "—"} cr
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <span className="text-white text-sm font-bold">{cp.amountInr != null ? fmtINR(cp.amountInr) : "—"}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-white/60 text-xs whitespace-nowrap">{date}</span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              {cp.invoiceUrl ? (
                                <button type="button"
                                  onClick={() => downloadInvoicePdf(cp.invoiceUrl!, `Collabry-Credits-${cp.orderId ?? cp.id.slice(0, 8).toUpperCase()}.pdf`)}
                                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
                                  style={{ background: "rgba(240,24,122,0.15)", color: PINK, border: "1px solid rgba(240,24,122,0.28)" }}>
                                  ⬇ Download PDF
                                </button>
                              ) : (
                                <span className="text-white/30 text-xs">Pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-2 p-3">
                  {creditPurchases.map(cp => {
                    const date = new Date(cp.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                    return (
                      <div key={cp.id} className="rounded-xl p-3.5"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>
                              {cp.credits ?? "—"} credits purchased
                            </p>
                            <p className="text-white/40 font-mono text-[10px] mt-0.5">{cp.orderId ?? "—"} · {date}</p>
                          </div>
                          <span className="text-white font-bold text-sm flex-shrink-0" style={{ fontFamily: POPPINS, color: PINK }}>
                            {cp.amountInr != null ? fmtINR(cp.amountInr) : "—"}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          {cp.invoiceUrl ? (
                            <button type="button"
                              onClick={() => downloadInvoicePdf(cp.invoiceUrl!, `Collabry-Credits-${cp.orderId ?? cp.id.slice(0, 8).toUpperCase()}.pdf`)}
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ background: "rgba(240,24,122,0.15)", color: PINK, border: "1px solid rgba(240,24,122,0.28)" }}>
                              ⬇ PDF
                            </button>
                          ) : (
                            <span className="text-white/30 text-[10px]" style={{ fontFamily: POPPINS }}>Invoice pending</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ── Mode Card ── */
function ModeCard({ icon, title, desc, cta, onClick }: {
  icon: React.ReactNode; title: string; desc: string; cta: string; onClick: () => void;
}) {
  return (
    <div className="rounded-2xl p-4 flex flex-col"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(240,24,122,0.12)", border: "1px solid rgba(240,24,122,0.2)" }}>
          {icon}
        </div>
        <p className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>{title}</p>
      </div>
      <p className="text-white/70 text-xs leading-relaxed mb-4 flex-1" style={{ fontFamily: POPPINS }}>{desc}</p>
      <button onClick={onClick}
        className="w-full py-2 rounded-full text-white text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer hover:opacity-90 transition-opacity"
        style={{ background: PINK, fontFamily: POPPINS }}>
        {cta} <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}
