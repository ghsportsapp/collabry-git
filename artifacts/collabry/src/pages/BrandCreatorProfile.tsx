import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ShieldCheck, X, Plus, Minus, Link as LinkIcon, Instagram } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";

interface FullProfile {
  creator: {
    id: string; fullName: string | null; instagramHandle: string;
    profilePhotoUrl: string | null; bio: string | null;
    gender: string | null; state: string | null;
    email: string | null; phone: string | null; contentType: string | null;
    followerCount: number;
    audienceGenderFemale: number | null; audienceGenderMale: number | null;
    audienceAge: string | null; audienceLocation: string | null; campaignGoal: string | null;
    creatorAge?: number | null;
    reelPriceMin: number; reelPriceMax: number;
    storyPriceMin: number; storyPriceMax: number;
    postPriceMin: number; postPriceMax: number;
    averageRating: number | null; ratingCount: number;
    kycStatus: string; status: string;
    categories: Array<{ id: string; name: string }>;
    portfolio: Array<{ id: string; videoUrl: string }>;
    images: string[];
    funQuestions: Array<{ id: string; questionText: string; selectedOptionText: string }>;
  };
  unlockedAt: string;
  pricingChanged: boolean;
  activeDealId: string | null;
}

const CONTACT_REGEX = /(\+?\d[\d\s\-]{8,}\d|[\w.-]+@[\w-]+\.[\w.-]+|https?:\/\/|www\.)/i;
const S = { background: "rgba(225,79,105,0.13)", border: "1px solid rgba(255,255,255,0.18)" } as const;
const fmtRupee = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

export default function BrandCreatorProfile() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const [, paramsSearch] = useRoute("/home-brand/search/creator/:id");
  const [isMatchmaking, paramsMM] = useRoute("/home-brand/matchmaking/creator/:id");
  const [isUnlocked, paramsUnlocked] = useRoute("/home-brand/unlocked/creator/:id");
  const creatorId = (paramsSearch ?? paramsMM ?? paramsUnlocked)?.id;

  const { credits } = useBrandCredits();
  const [data, setData] = useState<FullProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [campaignCtx, setCampaignCtx] = useState<{ campaignId: string; appId: string; campaignType?: "barter" | "paid"; slotsFull?: boolean } | null>(null);
  const [selectLoading, setSelectLoading] = useState(false);
  const [selectDone, setSelectDone] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [showSelectCeleb, setShowSelectCeleb] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportToast, setReportToast] = useState(false);

  useEffect(() => { if (!authLoading && !brandId) navigate("/login-brand"); }, [brandId, authLoading, navigate]);

  useEffect(() => {
    const s = window.history.state as { campaignId?: string; appId?: string; campaignType?: "barter" | "paid"; slotsFull?: boolean } | null;
    if (s?.campaignId && s?.appId) setCampaignCtx({ campaignId: s.campaignId, appId: s.appId, campaignType: s.campaignType, slotsFull: s.slotsFull });
  }, []);

  useEffect(() => {
    if (!brandId || !creatorId) return;
    apiFetch(`/api/brand/creators/${creatorId}/profile`).then(async r => {
      if (r.ok) setData(await r.json());
      else setError((await r.json()).error ?? "Failed to load profile");
    });
  }, [brandId, creatorId, apiFetch]);

  const handleSelectForCampaign = async () => {
    if (!campaignCtx) return;
    setSelectLoading(true);
    setSelectError(null);
    const endpoint = campaignCtx.campaignType === "barter"
      ? `/api/brand/barter/${campaignCtx.campaignId}/applications/${campaignCtx.appId}/select`
      : `/api/brand/campaigns/${campaignCtx.campaignId}/applications/${campaignCtx.appId}/select`;
    const r = await apiFetch(endpoint, { method: "POST" });
    setSelectLoading(false);
    if (r.ok) {
      setSelectDone(true);
      setShowSelectCeleb(true);
    } else {
      const d = await r.json().catch(() => ({}));
      const msg = d.error ?? "Failed to select creator";
      setSelectError(msg.toLowerCase().includes("slot") ? "All slots for this campaign are filled. You cannot select more creators." : msg);
    }
  };

  if (authLoading || !brandId) return null;

  const c = data?.creator;

  return (
    <BrandLayout credits={credits?.total ?? null}>
      <div className="max-w-3xl lg:max-w-4xl mx-auto px-4 lg:px-6 pt-5 lg:pt-6 pb-28">

        {/* Back */}
        <button onClick={() => navigate(
            campaignCtx
              ? campaignCtx.campaignType === "barter"
                ? `/home-brand/barter/${campaignCtx.campaignId}`
                : `/home-brand/campaigns/${campaignCtx.campaignId}`
              : isMatchmaking ? "/home-brand/matchmaking/results"
              : isUnlocked ? "/home-brand/unlocked"
              : "/home-brand/search"
          )}
          className="flex items-center gap-1.5 text-white/75 text-xs mb-4" style={{ fontFamily: POPPINS }}>
          <ArrowLeft className="w-3.5 h-3.5" />
          {campaignCtx ? "Back to Campaign" : isMatchmaking ? "Back to Results" : isUnlocked ? "Back to Unlocked Profiles" : "Back to Search"}
        </button>

        {error && <p className="text-red-400 text-sm mb-4" style={{ fontFamily: POPPINS }}>{error}</p>}
        {!data && !error && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}
          </div>
        )}

        {data && c && (
          <div className="space-y-3">

            {/* Pricing changed banner */}
            {data.pricingChanged && (
              <div className="rounded-xl p-3 text-xs" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", color: "#fbbf24", fontFamily: POPPINS }}>
                ⚠️ This creator's pricing has changed since you unlocked them
              </div>
            )}

            {/* ── SECTION 1: HERO ── */}
            <div className="rounded-2xl p-4 relative" style={S}>
              {/* Report button */}
              <button
                onClick={() => setShowReport(true)}
                className="absolute top-4 right-4 transition-colors"
                style={{ fontFamily: POPPINS, fontSize: 12, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#F0187A")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
              >⚑ Report Creator</button>
              {/* Avatar + name */}
              <div className="flex items-center gap-3 sm:gap-4 mb-4">
                <div className="flex-shrink-0">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden" style={{ border: `2px solid ${PINK}99` }}>
                    {c.profilePhotoUrl
                      ? <img src={c.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center font-bold text-xl text-white" style={{ background: PINK }}>{c.fullName?.[0] ?? "C"}</div>}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <a
                      href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-90"
                      style={{ color: "rgba(255,255,255,0.72)", fontFamily: POPPINS }}
                    >
                      <Instagram className="w-3.5 h-3.5 text-white/75" />
                      @{c.instagramHandle.replace(/^@/, "")}
                    </a>
                    {c.kycStatus === "VERIFIED" && <ShieldCheck className="w-3.5 h-3.5 text-green-400" />}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-white font-bold text-xl sm:text-2xl leading-tight mb-0.5" style={{ fontFamily: POPPINS }}>{c.fullName ?? "—"}</h1>
                    <button
                      type="button"
                      onClick={() => window.open(`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`, "_blank", "noopener,noreferrer")}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-90"
                      style={{ background: "rgba(240,24,122,0.16)", border: "1px solid rgba(240,24,122,0.30)", color: "white", fontFamily: POPPINS }}
                    >
                      View Instagram Profile
                    </button>
                  </div>
                  <p className="text-[11px] font-semibold mt-1" style={{ color: PINK, fontFamily: POPPINS }}>Verified Collabry Creator</p>
                </div>
              </div>

              <p className="text-white text-[11px] sm:text-xs leading-relaxed mb-4" style={{ fontFamily: POPPINS }}>
                We recommend reviewing the creator’s Instagram profile and content before proceeding with collaborations.
              </p>

              {/* Bio */}
              {c.bio && (
                <p className="text-white/75 text-xs sm:text-sm leading-relaxed mb-4" style={{ fontFamily: POPPINS }}>{c.bio}</p>
              )}

              {/* Stat cards — 2 cards: Followers + Rating */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { val: (c.followerCount ?? 0).toLocaleString("en-IN"), label: "Followers" },
                  { val: c.averageRating ? c.averageRating.toFixed(1) : "—", label: "Rating" },
                ].map(({ val, label }) => (
                  <div key={label} className="rounded-xl py-4 px-2 flex flex-col items-center justify-center"
                    style={{ background: "rgba(225,79,105,0.10)", border: "1px solid rgba(225,79,105,0.30)" }}>
                    <p className="font-bold text-lg sm:text-xl leading-none mb-0.5" style={{ color: PINK, fontFamily: POPPINS }}>{val}</p>
                    <p className="text-white text-[10px] sm:text-xs font-medium" style={{ fontFamily: POPPINS }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── SECTION 2: CONTENT CATEGORIES ── */}
            {c.categories.length > 0 && (
              <div className="rounded-2xl p-4" style={S}>
                <p className="text-white/75 text-xs sm:text-sm font-semibold mb-3 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Content Categories</p>
                <div className="flex flex-wrap gap-2">
                  {c.categories.map(cat => (
                    <span key={cat.id} className="px-3 py-1.5 rounded-full text-xs sm:text-sm text-white font-semibold"
                      style={{ background: PINK, fontFamily: POPPINS }}>
                      {cat.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 3: PERSONAL DETAILS ── */}
            <div className="rounded-2xl p-4" style={S}>
              <p className="text-white/75 text-xs sm:text-sm font-semibold mb-4 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Creator's Personal Details</p>
              <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-4">
                {[
                  { label: "Gender", value: c.gender || "—" },
                  { label: "Age", value: c.creatorAge ? `${c.creatorAge} yrs` : "—" },
                  { label: "Location", value: c.state || "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] sm:text-xs mb-1" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>{label}</p>
                    <p className="text-sm sm:text-base font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 sm:gap-6">
                {[
                  { label: "Phone", value: c.phone || "—" },
                  { label: "E-mail", value: c.email || "—" },
                  { label: "Primary Content Style", value: c.contentType || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="min-w-0">
                    <p className="text-[10px] sm:text-xs mb-1" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>{label}</p>
                    <p className="text-sm sm:text-base font-semibold break-words leading-snug" style={{ color: PINK, fontFamily: POPPINS }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── SECTION 4: BEST VIDEOS ── */}
            {c.portfolio.length > 0 && (
              <div className="rounded-2xl p-4" style={S}>
                <p className="text-white/75 text-xs sm:text-sm font-semibold mb-3 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Creator's Best Videos</p>
                <div className="space-y-2">
                  {c.portfolio.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-xs sm:text-sm truncate"
                        style={{ background: "rgba(225,79,105,0.30)", border: "1px solid rgba(225,79,105,0.40)", color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>
                        {p.videoUrl}
                      </div>
                      <button onClick={() => window.open(/^https?:\/\//i.test(p.videoUrl) ? p.videoUrl : `https://${p.videoUrl}`, '_blank', 'noopener,noreferrer')}
                        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap"
                        style={{ background: PINK, color: "white", fontFamily: POPPINS }}>
                        <LinkIcon className="w-3.5 h-3.5" /> Visit Video
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 5: AUDIENCE DETAILS ── */}
            <div className="rounded-2xl p-4" style={S}>
              <p className="text-white/75 text-xs sm:text-sm font-semibold mb-4 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Creator's Audience Details</p>
              <div className="grid grid-cols-3 gap-3 sm:gap-6">
                {/* Gender split */}
                <div>
                  <p className="text-[10px] sm:text-xs mb-3" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Gender</p>
                  <div className="space-y-2.5">
                    {[
                      { label: "Female", pct: c.audienceGenderFemale ?? 0 },
                      { label: "Male", pct: c.audienceGenderMale ?? 0 },
                    ].map(({ label, pct }) => (
                      <div key={label}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] sm:text-xs text-white/75" style={{ fontFamily: POPPINS }}>{label}</span>
                          <span className="text-xs sm:text-sm font-bold" style={{ color: PINK, fontFamily: POPPINS }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.10)", maxWidth: "120px" }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PINK }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Age range */}
                <div>
                  <p className="text-[10px] sm:text-xs mb-3" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Age Range</p>
                  <p className="text-sm sm:text-base font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>{c.audienceAge || "—"}</p>
                </div>
                {/* Location */}
                <div>
                  <p className="text-[10px] sm:text-xs mb-3" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Location</p>
                  <p className="text-sm sm:text-base font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>{c.audienceLocation || "—"}</p>
                </div>
              </div>
            </div>

            {/* ── SECTION 6: PRICING ── */}
            <div className="rounded-2xl p-4" style={S}>
              <p className="text-white/75 text-xs sm:text-sm font-semibold mb-4 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Pricing</p>
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {[
                  { label: "Reel", min: c.reelPriceMin, max: c.reelPriceMax },
                  { label: "Story", min: c.storyPriceMin, max: c.storyPriceMax },
                  { label: "Photo", min: c.postPriceMin, max: c.postPriceMax },
                ].map(({ label, min, max }) => (
                  <div key={label} className="rounded-xl p-3 sm:p-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
                    <p className="text-white/70 text-[10px] sm:text-xs mb-1" style={{ fontFamily: POPPINS }}>{label}</p>
                    <p className="font-semibold text-sm sm:text-base leading-tight block sm:hidden" style={{ color: PINK, fontFamily: POPPINS }}>
                      {fmtRupee(Number(min))}
                    </p>
                    <p className="text-sm font-semibold leading-tight block sm:hidden" style={{ color: PINK, fontFamily: POPPINS }}>– {fmtRupee(Number(max))}</p>
                    <p className="font-semibold text-base leading-tight hidden sm:block whitespace-nowrap" style={{ color: PINK, fontFamily: POPPINS }}>
                      {fmtRupee(Number(min))} – {fmtRupee(Number(max))}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── SECTION 7: FUN QUESTIONS (read-only) ── */}
            {(c.funQuestions ?? []).length > 0 && (
              <div>
                <div className="flex items-center justify-center gap-3 mb-3 mt-2">
                  <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: POPPINS }}>
                    <span className="text-white">Fun </span>
                    <span style={{ color: PINK }}>Questions</span>
                  </h2>
                </div>
                <div className="rounded-2xl p-5 space-y-6" style={{ background: "rgba(225,79,105,0.13)", border: "1px solid rgba(255,255,255,0.18)" }}>
                  {c.funQuestions.map(q => (
                    <div key={q.id}>
                      <p className="text-white text-sm font-semibold mb-3 leading-snug" style={{ fontFamily: POPPINS }}>{q.questionText}</p>
                      <span className="inline-block px-4 py-2 rounded-xl text-sm font-semibold text-white"
                        style={{ background: PINK, fontFamily: POPPINS }}>
                        {q.selectedOptionText}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 8: CREATOR PHOTOS ── */}
            {Array.isArray(c.images) && c.images.length > 0 && (
              <div className="rounded-2xl p-4" style={S}>
                <p className="text-white/75 text-xs sm:text-sm font-semibold mb-3 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Creator Photos</p>
                <div className="grid grid-cols-4 gap-2">
                  {c.images.map((img, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                      <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 9: BRAND REVIEW ── */}
            <CreatorRatingsCard creatorId={c.id} apiFetch={apiFetch} averageRating={c.averageRating} />

            {/* Unlocked on */}
            <p className="text-white/70 text-[11px] text-center pb-2" style={{ fontFamily: POPPINS }}>
              Unlocked on {new Date(data.unlockedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        )}
      </div>

      {/* Sticky bottom CTA */}
      {data && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3" style={{ background: "rgba(10,10,15,0.96)", borderTop: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Campaign select row — shown only when arriving from a campaign */}
            {campaignCtx && (
              <div>
                {selectDone ? (
                  <div className="w-full py-2.5 rounded-full text-center text-sm font-semibold" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontFamily: POPPINS }}>
                    ✓ Selected for Campaign
                  </div>
                ) : campaignCtx.slotsFull ? (
                  <div className="w-full py-2.5 rounded-full text-center text-sm font-semibold" style={{ background: "rgba(239,68,68,0.10)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)", fontFamily: POPPINS }}>
                    All slots for this campaign are filled
                  </div>
                ) : (
                  <button
                    onClick={handleSelectForCampaign}
                    disabled={selectLoading}
                    className="w-full py-2.5 rounded-full text-white font-semibold text-sm transition-opacity"
                    style={{ background: "#10B981", fontFamily: POPPINS, opacity: selectLoading ? 0.6 : 1 }}>
                    {selectLoading ? "Selecting…" : "Select for Campaign"}
                  </button>
                )}
                {selectError && <p className="text-red-400 text-xs text-center mt-1" style={{ fontFamily: POPPINS }}>{selectError}</p>}
              </div>
            )}
            {/* Main CTA */}
            {data.creator.status === "PAUSED" ? (
              <button disabled className="w-full py-3 rounded-full text-white/75 font-semibold text-sm" style={{ background: "rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
                Creator not accepting requests
              </button>
            ) : data.activeDealId ? (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowRequest(true)} className="w-full py-3 rounded-full text-white font-semibold text-sm" style={{ background: PINK, fontFamily: POPPINS }}>
                  Send Request →
                </button>
                <button onClick={() => navigate("/home-brand/deals?tab=live")} className="w-full py-3 rounded-full text-white font-semibold text-sm" style={{ background: "#22c55e", fontFamily: POPPINS }}>
                  View Active Deal →
                </button>
              </div>
            ) : (
              <button onClick={() => setShowRequest(true)} className="w-full py-3 rounded-full text-white font-semibold text-sm" style={{ background: PINK, fontFamily: POPPINS }}>
                Send Request →
              </button>
            )}
          </div>
        </div>
      )}


      {showRequest && data && (
        <RequestModal creator={data.creator} onClose={() => setShowRequest(false)}
          apiFetch={apiFetch} source={isMatchmaking ? "MATCHMAKING" : "SEARCH"}
          onSuccess={() => { setShowRequest(false); navigate("/home-brand"); }} />
      )}

      {/* Report Modal */}
      {showReport && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={e => { if (e.target === e.currentTarget) { setShowReport(false); setReportReason(""); setReportError(null); } }}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-base">Report Creator</h3>
              <button onClick={() => { setShowReport(false); setReportReason(""); setReportError(null); }}>
                <X className="w-5 h-5 text-white/70" />
              </button>
            </div>
            <p className="text-white/60 text-xs mb-4 leading-relaxed">
              Help us keep Collabry safe. Describe the issue below.
            </p>
            <textarea
              rows={4}
              maxLength={500}
              value={reportReason}
              onChange={e => { setReportReason(e.target.value.slice(0, 500)); setReportError(null); }}
              placeholder="Describe your reason for reporting this creator..."
              className="w-full px-3.5 py-3 rounded-xl text-sm text-white resize-none outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${reportError ? "rgba(248,113,113,0.6)" : "rgba(255,255,255,0.12)"}`, minHeight: 100 }}
            />
            <p className="text-right text-[10px] mt-1 mb-3" style={{ color: "rgba(255,255,255,0.35)", fontFamily: POPPINS }}>{reportReason.length}/500</p>
            {reportError && <p className="text-red-400 text-xs mb-3">{reportError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowReport(false); setReportReason(""); setReportError(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.80)" }}>
                Cancel
              </button>
              <button
                disabled={reportSubmitting || !reportReason.trim()}
                onClick={async () => {
                  setReportSubmitting(true); setReportError(null);
                  try {
                    const r = await apiFetch(`/api/brand/creators/${creatorId}/report`, { method: "POST", body: JSON.stringify({ reason: reportReason.trim() }) });
                    if (r.ok) {
                      setShowReport(false); setReportReason("");
                      setReportToast(true); setTimeout(() => setReportToast(false), 3500);
                    } else {
                      const d = await r.json().catch(() => ({}));
                      setReportError(d.error ?? "Failed to submit report");
                    }
                  } catch { setReportError("Failed to submit report"); }
                  finally { setReportSubmitting(false); }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "#E14F69" }}>
                {reportSubmitting ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {reportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl text-sm font-semibold text-white shadow-xl whitespace-nowrap"
          style={{ background: "#16a34a", fontFamily: POPPINS }}>
          ✓ Report submitted. Our team will review it.
        </div>
      )}

      {/* Creator Selected popup */}
      {showSelectCeleb && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px", background: "rgba(0,0,0,0.6)" }}>
          <div style={{ background: "#16161E", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 20, padding: "32px 28px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 0 60px rgba(16,185,129,0.12)" }}>
            <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 14 }}>🎉</div>
            <p style={{ color: "white", fontFamily: POPPINS, fontWeight: 700, fontSize: 20, margin: 0 }}>Creator Selected!</p>
            <p style={{ color: "rgba(255,255,255,0.8)", fontFamily: POPPINS, fontSize: 14, margin: "10px 0 24px", lineHeight: 1.6 }}>
              You've selected this creator for the campaign.<br />Waiting for their confirmation (48h window).
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowSelectCeleb(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.90)", fontFamily: POPPINS, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                Stay on Profile
              </button>
              <button
                onClick={() => {
                  setShowSelectCeleb(false);
                  const dest = campaignCtx?.campaignType === "barter"
                    ? `/home-brand/barter/${campaignCtx.campaignId}`
                    : `/home-brand/campaigns/${campaignCtx?.campaignId}`;
                  navigate(dest);
                }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: "#10B981", color: "white", fontFamily: POPPINS, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Go to Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </BrandLayout>
  );
}

function CreatorRatingsCard({ creatorId, apiFetch, averageRating }: {
  creatorId: string;
  apiFetch: (p: string, o?: RequestInit) => Promise<Response>;
  averageRating: number | null;
}) {
  const [ratings, setRatings] = useState<Array<{ id: string; rating: number; reviewText: string | null; createdAt: string; brand: { companyName: string | null } }>>([]);
  const [ratingCount, setRatingCount] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    apiFetch(`/api/brand/creators/${creatorId}/ratings`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setRatings(Array.isArray(d.ratings) ? d.ratings : []);
          setRatingCount(d.ratingCount ?? 0);
        }
      })
      .catch(() => {});
  }, [creatorId, apiFetch]);

  if (ratings.length === 0) return null;

  const visible = showAll ? ratings : ratings.slice(0, 3);
  const avg = averageRating ?? 0;

  return (
    <div className="rounded-2xl p-4" style={S}>
      <p className="text-white/75 text-xs sm:text-sm font-semibold mb-1 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Brand Review</p>
      <div className="flex items-center gap-1.5 mb-4">
        {[1, 2, 3, 4, 5].map(n => (
          <svg key={n} width="15" height="15" viewBox="0 0 24 24" fill={avg >= n ? PINK : "rgba(255,255,255,0.18)"}>
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
        ))}
        <span className="text-white font-bold text-sm sm:text-base ml-1" style={{ fontFamily: POPPINS }}>{avg.toFixed(1)}/5</span>
        <span className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>({ratingCount} {ratingCount === 1 ? "Review" : "Reviews"})</span>
      </div>
      <div className="space-y-3">
        {visible.map(r => (
          <div key={r.id} className="rounded-2xl p-4" style={{ background: "rgba(225,79,105,0.18)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="flex items-center gap-3 mb-2.5">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-base sm:text-lg font-bold flex-shrink-0"
                style={{ background: PINK, color: "white", fontFamily: POPPINS }}>
                {r.brand?.companyName?.[0]?.toUpperCase() ?? "B"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-bold" style={{ color: PINK, fontFamily: POPPINS }}>{r.brand?.companyName ?? "Brand"}</p>
                <div className="flex items-center gap-0.5 mt-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <svg key={n} width="11" height="11" viewBox="0 0 24 24" fill={r.rating >= n ? PINK : "rgba(255,255,255,0.70)"}>
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                    </svg>
                  ))}
                </div>
              </div>
              <span className="text-white/70 text-[10px] flex-shrink-0" style={{ fontFamily: POPPINS }}>
                {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            {r.reviewText && (
              <p className="text-white/90 text-xs sm:text-sm leading-relaxed" style={{ fontFamily: POPPINS }}>{r.reviewText}</p>
            )}
          </div>
        ))}
      </div>
      {ratings.length > 3 && (
        <button onClick={() => setShowAll(s => !s)} className="text-xs mt-3" style={{ color: PINK, fontFamily: POPPINS }}>
          {showAll ? "Show less" : `Show all ${ratings.length} reviews`}
        </button>
      )}
    </div>
  );
}

function RequestModal({ creator, onClose, onSuccess, apiFetch, source = "SEARCH" }: {
  creator: FullProfile["creator"];
  onClose: () => void;
  onSuccess: () => void;
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>;
  source?: string;
}) {
  const [reelCount, setReelCount] = useState(0);
  const [storyCount, setStoryCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [pricePerReel, setPricePerReel] = useState(0);
  const [pricePerStory, setPricePerStory] = useState(0);
  const [pricePerPost, setPricePerPost] = useState(0);
  const [minTimelineDays, setMinTimelineDays] = useState(7);
  const [timelineDays, setTimelineDays] = useState(0);
  const [productRequired, setProductRequired] = useState(false);
  const [productDescription, setProductDescription] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [deliveryWindowDays, setDeliveryWindowDays] = useState(0);
  const [postedBy, setPostedBy] = useState<"CREATOR" | "BRAND" | "BOTH">("BOTH");
  const [pendingPostedBy, setPendingPostedBy] = useState<"CREATOR" | "BRAND" | "BOTH" | null>(null);
  const [aboutProduct, setAboutProduct] = useState("");
  const [reelScripts, setReelScripts] = useState<string[]>([]);
  const [storyScripts, setStoryScripts] = useState<string[]>([]);
  const [postScripts, setPostScripts] = useState<string[]>([]);
  const [maxScriptChars, setMaxScriptChars] = useState(2000);
  const [commissionRate, setCommissionRate] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/platform-config/deal").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.min_timeline_days) {
        const min = Math.max(parseInt(d.min_timeline_days) || 7, 7);
        setMinTimelineDays(min);
      }
      if (d?.max_script_brief_chars) setMaxScriptChars(parseInt(d.max_script_brief_chars) || 2000);
      if (d?.commission_rate) setCommissionRate(parseFloat(d.commission_rate) || 5);
    }).catch(() => {});
  }, [apiFetch]);

  useEffect(() => {
    setReelScripts(prev => Array.from({ length: reelCount }, (_, i) => prev[i] ?? ""));
  }, [reelCount]);

  useEffect(() => {
    setStoryScripts(prev => Array.from({ length: storyCount }, (_, i) => prev[i] ?? ""));
  }, [storyCount]);

  useEffect(() => {
    setPostScripts(prev => Array.from({ length: postCount }, (_, i) => prev[i] ?? ""));
  }, [postCount]);

  const total = reelCount * pricePerReel + storyCount * pricePerStory + postCount * pricePerPost;
  const minDeliverable = reelCount + storyCount + postCount > 0;
  const validReel = reelCount === 0 || (pricePerReel >= creator.reelPriceMin && pricePerReel <= creator.reelPriceMax);
  const validStory = storyCount === 0 || (pricePerStory >= creator.storyPriceMin && pricePerStory <= creator.storyPriceMax);
  const validPost = postCount === 0 || (pricePerPost >= creator.postPriceMin && pricePerPost <= creator.postPriceMax);
  const aboutHasContact = CONTACT_REGEX.test(aboutProduct);
  const validTimeline = timelineDays >= minTimelineDays && timelineDays <= 15;
  const validDelivery = !productRequired || (deliveryWindowDays >= 1 && deliveryWindowDays <= 15);
  const validProductImageUrl = !productRequired || (productImageUrl.trim().length > 0 && productImageUrl.includes("."));
  const canSend = minDeliverable && validReel && validStory && validPost
    && validTimeline && validDelivery && validProductImageUrl
    && aboutProduct.trim().length > 0 && !aboutHasContact
    && (reelCount === 0 || (reelScripts.length === reelCount && reelScripts.every(s => s.trim().length > 0)))
    && (storyCount === 0 || (storyScripts.length === storyCount && storyScripts.every(s => s.trim().length > 0)))
    && (postCount === 0 || (postScripts.length === postCount && postScripts.every(s => s.trim().length > 0)));

  const handleSubmit = async () => {
    if (!canSend) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/brand/requests", {
        method: "POST",
        body: JSON.stringify({
          creatorId: creator.id, reelCount, storyCount, postCount,
          pricePerReel, pricePerStory, pricePerPost,
          timelineDays, productRequired,
          productDescription: productRequired ? productDescription : null,
          productImageUrl: productRequired && productImageUrl.trim() ? productImageUrl.trim() : null,
          deliveryWindowDays: productRequired ? deliveryWindowDays : null,
          aboutProduct: aboutProduct.trim(),
          reelScript: reelCount > 0 ? reelScripts.map((s, i) => reelCount > 1 ? `Reel ${i + 1}:\n${s.trim()}` : s.trim()).join("\n\n") : null,
          storyScript: storyCount > 0 ? storyScripts.map((s, i) => storyCount > 1 ? `Story ${i + 1}:\n${s.trim()}` : s.trim()).join("\n\n") : null,
          postContent: postCount > 0 ? postScripts.map((s, i) => postCount > 1 ? `Photo ${i + 1}:\n${s.trim()}` : s.trim()).join("\n\n") : null,
          postedBy,
          source,
        }),
      });
      if (r.ok) onSuccess();
      else { const d = await r.json(); setErr(d.error ?? "Request failed"); }
    } catch (e: any) { setErr(e.message); }
    finally { setSubmitting(false); }
  };

  const TA_STYLE = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" } as const;
  const TA_ERR_STYLE = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(239,68,68,0.50)" } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="send-request-modal w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-3 sticky top-0 -mx-5 px-5 pb-2" style={{ background: "#15151D" }}>
          <h3 className="text-white font-bold text-base">Send Request to @{creator.instagramHandle}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-white/80" /></button>
        </div>

        <DeliverableRow label="REELS" count={reelCount} setCount={setReelCount}
          price={pricePerReel} setPrice={setPricePerReel}
          min={creator.reelPriceMin} max={creator.reelPriceMax}
          unitLabel="reel" valid={validReel} />
        <DeliverableRow label="STORIES" count={storyCount} setCount={setStoryCount}
          price={pricePerStory} setPrice={setPricePerStory}
          min={creator.storyPriceMin} max={creator.storyPriceMax}
          unitLabel="story" valid={validStory} />
        <DeliverableRow label="PHOTOS" count={postCount} setCount={setPostCount}
          price={pricePerPost} setPrice={setPricePerPost}
          min={creator.postPriceMin} max={creator.postPriceMax}
          unitLabel="photo" valid={validPost} />

        {!minDeliverable && <p className="text-amber-300 text-[11px] mb-3">⚠️ At least 1 deliverable required</p>}

        {/* Timeline */}
        <div className="mb-3">
          <div className="flex items-baseline gap-2 mb-1.5">
            <label className="text-white/85 text-[11px] font-semibold uppercase">Timeline (days)</label>
            <span className="text-white/45 text-[11px]">{minTimelineDays}–15 days</span>
          </div>
          <input type="number" min={minTimelineDays} max={15} value={timelineDays || ""}
            placeholder="Enter days"
            onChange={e => setTimelineDays(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg text-white text-sm"
            style={!timelineDays || validTimeline ? TA_STYLE : TA_ERR_STYLE} />
          {timelineDays > 0 && !validTimeline && (
            <p className="text-amber-400 text-[10px] mt-0.5">⚠ Timeline must be between {minTimelineDays} and 15 days</p>
          )}
          {!timelineDays && <p className="text-white/70 text-[10px] mt-0.5">Enter the number of days the creator has to complete the work ({minTimelineDays}–15 days)</p>}
          <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.45)", marginTop: 4, fontFamily: "Poppins, sans-serif" }}>
            💡 Deals can finish sooner — use the deal chat to coordinate early delivery. We recommend at least 7 days; good things take time.
          </p>
        </div>

        {/* Product Required */}
        <div className="mb-3">
          <label className="text-white/85 text-[11px] font-semibold uppercase mb-1.5 block">Do you need to send a product to the creator?</label>
          <div className="flex gap-2">
            <button onClick={() => setProductRequired(true)} className="flex-1 py-2 rounded-full text-xs font-semibold"
              style={{ background: productRequired ? PINK : "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.10)" }}>Yes</button>
            <button onClick={() => setProductRequired(false)} className="flex-1 py-2 rounded-full text-xs font-semibold"
              style={{ background: !productRequired ? PINK : "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.10)" }}>No</button>
          </div>
        </div>

        {productRequired && (
          <div className="mb-3 space-y-2">
            <div>
              <label className="text-white/85 text-[11px] font-semibold uppercase mb-1.5 block">Product Description</label>
              <textarea rows={2} value={productDescription} onChange={e => setProductDescription(e.target.value)}
                placeholder="What product will you send?"
                className="w-full px-3 py-2 rounded-lg text-white text-sm resize-none" style={TA_STYLE} />
            </div>
            <div>
              <label className="text-white/85 text-[11px] font-semibold uppercase mb-1.5 block">Product Image URL</label>
              <input type="url" value={productImageUrl} onChange={e => setProductImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg text-white text-sm"
                style={productRequired && productImageUrl && !productImageUrl.includes(".") ? TA_ERR_STYLE : TA_STYLE} />
              {productRequired && productImageUrl && !productImageUrl.includes(".") && <p className="text-amber-400 text-[10px] mt-0.5">⚠ Enter a valid URL</p>}
              {productRequired && !productImageUrl.trim() && <p className="text-white/40 text-[10px] mt-0.5">Required — share a photo or link showing what you're sending</p>}
            </div>
            <div>
              <label className="text-white/85 text-[11px] font-semibold uppercase mb-1.5 block">Delivery Window (days) <span className="text-white/40 normal-case font-normal">· max 15</span></label>
              <input type="number" min={1} max={15} value={deliveryWindowDays || ""} placeholder="e.g. 3"
                onChange={e => setDeliveryWindowDays(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg text-white text-sm"
                style={deliveryWindowDays > 15 || (deliveryWindowDays > 0 && deliveryWindowDays < 1) ? TA_ERR_STYLE : TA_STYLE} />
              {deliveryWindowDays > 15 && <p className="text-amber-400 text-[10px] mt-0.5">⚠ Maximum delivery window is 15 days</p>}
              {deliveryWindowDays > 0 && deliveryWindowDays < 1 && <p className="text-amber-400 text-[10px] mt-0.5">⚠ Minimum 1 day required</p>}
            </div>
          </div>
        )}

        {/* Who Posts? */}
        <div className="mb-3">
          <label className="text-white/85 text-[11px] font-semibold uppercase mb-1.5 block">Who will publish on Instagram?</label>
          <div className="flex gap-2">
            {(["CREATOR", "BRAND", "BOTH"] as const).map(opt => (
              <button key={opt}
                onClick={() => { if (opt !== postedBy) setPendingPostedBy(opt); }}
                className="flex-1 py-2 rounded-full text-[11px] font-semibold"
                style={{ background: postedBy === opt ? PINK : "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.10)" }}>
                {opt === "CREATOR" ? "Creator" : opt === "BRAND" ? "Brand" : "Both"}
              </button>
            ))}
          </div>
          <p className="text-white/70 text-[10px] mt-1">
            {postedBy === "BRAND" ? "Creator will hand off final files; brand will post."
              : postedBy === "BOTH" ? "Creator publishes their own + sends files to brand."
              : "Creator publishes on their Instagram."}
          </p>
        </div>

        {/* Confirm publish-change popup */}
        {pendingPostedBy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}
            onClick={e => { if (e.target === e.currentTarget) setPendingPostedBy(null); }}>
            <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: "'Poppins', sans-serif" }}>
              <h3 className="text-white font-bold text-sm mb-2">Change publisher?</h3>
              <p className="text-white/70 text-xs mb-4 leading-relaxed">
                You're switching from{" "}
                <span className="text-white font-semibold">{postedBy === "CREATOR" ? "Creator" : postedBy === "BRAND" ? "Brand" : "Both"}</span>
                {" "}to{" "}
                <span className="text-white font-semibold">{pendingPostedBy === "CREATOR" ? "Creator" : pendingPostedBy === "BRAND" ? "Brand" : "Both"}</span>.{" "}
                {pendingPostedBy === "BRAND"
                  ? "The creator will hand off files and your brand account will post."
                  : pendingPostedBy === "BOTH"
                  ? "Creator publishes their own + sends files to brand."
                  : "Only the creator's account will publish the content."}
                {" "}Are you sure?
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPendingPostedBy(null)}
                  className="flex-1 py-2.5 rounded-xl text-white/90 text-xs font-semibold"
                  style={{ border: "1px solid rgba(255,255,255,0.12)" }}>Cancel</button>
                <button onClick={() => { setPostedBy(pendingPostedBy); setPendingPostedBy(null); }}
                  className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold"
                  style={{ background: PINK }}>Yes, Change</button>
              </div>
            </div>
          </div>
        )}

        {/* About the Product */}
        <div className="mb-3">
          <label className="text-white/85 text-[11px] font-semibold uppercase mb-1.5 block">About the Product</label>
          <textarea rows={3} value={aboutProduct} onChange={e => setAboutProduct(e.target.value.slice(0, maxScriptChars))}
            maxLength={maxScriptChars}
            placeholder="Describe your product/brand and what you want to promote..."
            className="w-full px-3 py-2 rounded-lg text-white text-sm resize-none"
            style={aboutHasContact ? TA_ERR_STYLE : TA_STYLE} />
          <div className="flex justify-between mt-0.5">
            {aboutHasContact
              ? <p className="text-red-400 text-[11px]">⚠️ No contact info (phone/email/URL) allowed</p>
              : <p className="text-white/70 text-[10px]">No contact info allowed</p>}
            <p className="text-white/70 text-[10px]">{aboutProduct.length}/{maxScriptChars}</p>
          </div>
        </div>

        {/* Reel Scripts */}
        {reelCount > 0 && (
          <div className="mb-3">
            <label className="text-white/85 text-[11px] font-semibold uppercase mb-2 block">Reel Script{reelCount > 1 ? "s" : ""}</label>
            <div className="space-y-3">
              {Array.from({ length: reelCount }, (_, i) => (
                <div key={i}>
                  {reelCount > 1 && <p className="text-white/70 text-[11px] font-semibold mb-1">Reel Script {i + 1}</p>}
                  <textarea rows={4} value={reelScripts[i] ?? ""}
                    onChange={e => { const val = e.target.value.slice(0, maxScriptChars); setReelScripts(prev => { const next = [...prev]; next[i] = val; return next; }); }}
                    maxLength={maxScriptChars}
                    placeholder="Describe the reel — hook, storyline, message, call to action, tone, specific scenes..."
                    className="w-full px-3 py-2 rounded-lg text-white text-sm resize-none" style={TA_STYLE} />
                  <div className="flex justify-between mt-0.5">
                    {i === reelCount - 1 ? <p className="text-white/70 text-[10px]">Be detailed — creator will follow this script</p> : <span />}
                    <p className="text-white/70 text-[10px]">{(reelScripts[i] ?? "").length}/{maxScriptChars}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.5)", marginTop: 6, fontFamily: "Poppins, sans-serif" }}>
              Don't worry about getting every detail perfect. Once the deal starts, you'll have a dedicated deal chat with the creator to share updated scripts, references, or changes at any time.
            </p>
          </div>
        )}

        {/* Story Scripts */}
        {storyCount > 0 && (
          <div className="mb-3">
            <label className="text-white/85 text-[11px] font-semibold uppercase mb-2 block">Story Script{storyCount > 1 ? "s" : ""}</label>
            <div className="space-y-3">
              {Array.from({ length: storyCount }, (_, i) => (
                <div key={i}>
                  {storyCount > 1 && <p className="text-white/70 text-[11px] font-semibold mb-1">Story Script {i + 1}</p>}
                  <textarea rows={3} value={storyScripts[i] ?? ""}
                    onChange={e => { const val = e.target.value.slice(0, maxScriptChars); setStoryScripts(prev => { const next = [...prev]; next[i] = val; return next; }); }}
                    maxLength={maxScriptChars}
                    placeholder="Describe each story — message, swipe-up link context, tone, specific visuals..."
                    className="w-full px-3 py-2 rounded-lg text-white text-sm resize-none" style={TA_STYLE} />
                  <div className="flex justify-end mt-0.5">
                    <p className="text-white/70 text-[10px]">{(storyScripts[i] ?? "").length}/{maxScriptChars}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.5)", marginTop: 6, fontFamily: "Poppins, sans-serif" }}>
              Don't worry about getting every detail perfect. Once the deal starts, you'll have a dedicated deal chat with the creator to share updated scripts, references, or changes at any time.
            </p>
          </div>
        )}

        {/* Post Scripts */}
        {postCount > 0 && (
          <div className="mb-3">
            <label className="text-white/85 text-[11px] font-semibold uppercase mb-2 block">Post Content{postCount > 1 ? "s" : ""}</label>
            <div className="space-y-3">
              {Array.from({ length: postCount }, (_, i) => (
                <div key={i}>
                  {postCount > 1 && <p className="text-white/70 text-[11px] font-semibold mb-1">Post Content {i + 1}</p>}
                  <textarea rows={3} value={postScripts[i] ?? ""}
                    onChange={e => { const val = e.target.value.slice(0, maxScriptChars); setPostScripts(prev => { const next = [...prev]; next[i] = val; return next; }); }}
                    maxLength={maxScriptChars}
                    placeholder="Describe the post — visual style, caption direction, hashtags, product placement..."
                    className="w-full px-3 py-2 rounded-lg text-white text-sm resize-none" style={TA_STYLE} />
                  <div className="flex justify-end mt-0.5">
                    <p className="text-white/70 text-[10px]">{(postScripts[i] ?? "").length}/{maxScriptChars}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.5)", marginTop: 6, fontFamily: "Poppins, sans-serif" }}>
              Don't worry about getting every detail perfect. Once the deal starts, you'll have a dedicated deal chat with the creator to share updated scripts, references, or changes at any time.
            </p>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <span className="text-white text-base font-bold">₹{total.toLocaleString("en-IN")}</span>
          <span style={{ color: PINK, fontSize: 12, fontWeight: 600 }}>+ GST</span>
        </div>
        <div className="mb-3" />

        {err && <p className="text-red-400 text-xs mb-3 text-center">{err}</p>}

        <button onClick={handleSubmit} disabled={!canSend || submitting}
          className="w-full py-3 rounded-full text-white font-semibold text-sm disabled:opacity-40"
          style={{ background: PINK }}>
          {submitting ? "Sending..." : "Send Request"}
        </button>
      </div>
    </div>
  );
}

function DeliverableRow({ label, count, setCount, price, setPrice, min, max, unitLabel, valid }: {
  label: string; count: number; setCount: (n: number) => void;
  price: number; setPrice: (n: number) => void; min: number; max: number; unitLabel: string; valid: boolean;
}) {
  const [priceStr, setPriceStr] = useState(price > 0 ? String(price) : "");

  function handlePriceChange(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "");
    setPriceStr(cleaned);
    setPrice(cleaned === "" ? 0 : parseInt(cleaned, 10) || 0);
  }

  const outOfRange = count > 0 && priceStr !== "" && !valid;
  const isEmpty = count > 0 && priceStr === "";

  return (
    <div className="rounded-xl p-3 mb-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-white/85 text-[11px] font-semibold uppercase mb-1.5">{label}</p>
      <div className="flex items-center gap-2 mb-1.5">
        <button onClick={() => setCount(Math.max(0, count - 1))} className="w-7 h-7 rounded-full text-white flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}><Minus className="w-3.5 h-3.5" /></button>
        <span className="text-white text-base font-bold w-10 text-center">{count}</span>
        <button onClick={() => setCount(count + 1)} className="w-7 h-7 rounded-full text-white flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}><Plus className="w-3.5 h-3.5" /></button>
        {count > 0 && (
          <input type="text" inputMode="numeric" value={priceStr} onChange={e => handlePriceChange(e.target.value)}
            placeholder={`₹${min}–${max}`}
            className="flex-1 px-3 py-1.5 rounded-lg text-white text-sm"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${outOfRange ? "rgba(239,68,68,0.50)" : "rgba(255,255,255,0.10)"}` }} />
        )}
      </div>
      <p className="text-white/70 text-xs">Range: ₹{min}–₹{max} per {unitLabel}</p>
      {outOfRange && <p className="text-amber-400 text-xs mt-0.5">⚠ Price must be ₹{min}–₹{max} — please update</p>}
      {isEmpty && <p className="text-white/70 text-xs mt-0.5">Enter your price per {unitLabel}</p>}
    </div>
  );
}
