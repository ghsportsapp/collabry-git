import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { CreatorLayout, POPPINS, PINK } from "@/components/CreatorNavLayout";
import { AdImage, useAds } from "@/components/AdBanner";

/* /explore-brands — creator-gated vertical list of ad detail cards, ordered by
   displayOrder (the API already returns them in order, so the lowest order is
   at the top). Each card: 16:9 image (with our "Ad" overlay) + headline + body. */

export default function ExploreBrands() {
  const { creatorId, loading } = useCreatorAuth();
  const [, navigate] = useLocation();
  const ads = useAds();
  const targetAdId = new URLSearchParams(useSearch()).get("ad");

  useEffect(() => {
    if (!loading && !creatorId) navigate("/login-creator");
  }, [loading, creatorId, navigate]);

  // After the list renders, jump (near-instant) to the clicked ad. Not found →
  // stay at the top, silently. "instant" overrides the global smooth scroll.
  useEffect(() => {
    if (!targetAdId || !ads || ads.length === 0) return;
    const el = document.getElementById(`ad-${targetAdId}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
  }, [ads, targetAdId]);

  if (loading || !creatorId) return null;

  return (
    <CreatorLayout status="ACTIVE" onLocked={() => {}}>
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-12" style={{ fontFamily: POPPINS }}>
        <div className="flex items-center gap-2 mb-5">
          <button onClick={() => navigate("/home-creator")} className="text-white/70 hover:text-white" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white font-bold text-xl">
            Explore <span style={{ color: PINK }}>Brands</span>
          </h1>
        </div>

        {ads === null ? (
          <div className="space-y-5">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl animate-pulse" style={{ aspectRatio: "16 / 9", background: "rgba(255,255,255,0.04)" }} />)}
          </div>
        ) : ads.length === 0 ? (
          <p className="text-white/50 text-sm text-center py-16">Nothing to explore right now — check back soon.</p>
        ) : (
          <div className="space-y-6">
            {ads.map((ad, i) => (
              <div key={ad.id} id={`ad-${ad.id}`} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", scrollMarginTop: 72 }}>
                <AdImage ad={ad} rounded="rounded-xl" priority={i === 0} />
                <div className="px-1 pt-3.5">
                  {ad.headline && <h2 className="text-white font-bold text-[15px] mb-1.5 leading-snug">{ad.headline}</h2>}
                  {ad.bodyText && <p className="text-white/60 text-[13px] leading-relaxed whitespace-pre-line">{ad.bodyText}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CreatorLayout>
  );
}
