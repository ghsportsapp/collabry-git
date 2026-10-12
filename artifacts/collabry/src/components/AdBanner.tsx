import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";

/* Shared creator-facing ad scroller + ad-image helper (Advertisement Batch 2).
   Self-fetching so a placement is a one-liner: <AdBanner />. On empty/failed
   fetch it renders NOTHING — no row, no gap, no error. Every banner click lands
   on /explore-brands (our own page; no external links). The "Ad" overlay is
   drawn here by our UI — it is never baked into the uploaded image. */

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const resolveImg = (u: string) => (u ? (/^(https?:|data:)/.test(u) ? u : `${BASE_URL}${u}`) : "");

export interface Ad {
  id: string;
  imageUrl: string;
  headline: string;
  bodyText: string;
  order: number;
}

/* A 16:9 image with the "Ad" pill overlaid bottom-right. Reused by the scroller
   cards and the /explore-brands detail cards so the look can't drift. */
export function AdImage({ ad, rounded = "rounded-2xl", onClick }: {
  ad: Ad;
  rounded?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative w-full overflow-hidden ${rounded} ${onClick ? "cursor-pointer" : ""}`}
      style={{ aspectRatio: "16 / 9", background: "rgba(255,255,255,0.05)" }}
    >
      <img src={resolveImg(ad.imageUrl)} alt={ad.headline || ""} loading="lazy" className="w-full h-full object-cover" />
      <span
        className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-semibold text-white"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      >
        Ad
      </span>
    </div>
  );
}

export function useAds(): Ad[] | null {
  const { apiFetch, loading } = useCreatorAuth();

  // apiFetch's identity changes every time the auth token refreshes — its dep is
  // [accessToken] and it calls setAccessToken() itself on a 401. If the fetch
  // effect depended on apiFetch it would re-run right after the first successful
  // paint and wipe the banner. Keep apiFetch in a ref so the effect never
  // depends on it, and run the fetch exactly once (after auth init).
  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;

  const [ads, setAds] = useState<Ad[] | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (loading || fetchedRef.current) return; // wait for auth; then fetch once, ever
    fetchedRef.current = true;
    let alive = true;
    apiFetchRef.current("/api/ads")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return;
        // Only a valid array replaces state. Never reset already-loaded ads to
        // null/[] on a bad response — keep the last good list.
        if (Array.isArray(d)) setAds(d);
        else setAds(prev => (prev && prev.length ? prev : []));
      })
      .catch(() => { if (alive) setAds(prev => (prev && prev.length ? prev : [])); });
    return () => { alive = false; };
  }, [loading]); // loading flips true→false once; fetchedRef guards against any further run

  return ads;
}

/* Horizontal ad scroller. Cards are ~44% wide so ~2 full cards show with the
   3rd peeking (~20%), signalling that the row scrolls. Ads appear in API order
   (displayOrder). Any card click → /explore-brands. */
export default function AdBanner({ className = "" }: { className?: string }) {
  const ads = useAds();
  const [, navigate] = useLocation();

  if (!ads || ads.length === 0) return null; // empty / loading / failed → nothing

  return (
    <div
      className={`flex gap-2.5 overflow-x-auto px-4 lg:px-0 ad-scroll ${className}`}
      style={{ scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch" }}
    >
      {ads.map(ad => (
        <div key={ad.id} className="flex-shrink-0" style={{ width: "44%", maxWidth: 340, scrollSnapAlign: "start" }}>
          <AdImage ad={ad} onClick={() => navigate("/explore-brands")} />
        </div>
      ))}
    </div>
  );
}
