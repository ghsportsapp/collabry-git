import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Users, MapPin } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";

interface UnlockedCreator {
  unlockId: string;
  unlockedAt: string;
  id: string;
  fullName: string | null;
  instagramHandle: string;
  profilePhotoUrl: string | null;
  followerCount: number;
  status: string;
  categories: Array<{ id: string; name: string }>;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function BrandUnlockedProfiles() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const { credits } = useBrandCredits();

  const [creators, setCreators] = useState<UnlockedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading, navigate]);

  useEffect(() => {
    if (!brandId) return;
    setLoading(true);
    apiFetch("/api/brand/unlocked-creators")
      .then(async r => {
        if (r.ok) {
          const d = await r.json();
          setCreators(d.creators ?? []);
        } else {
          setError("Failed to load unlocked profiles");
        }
      })
      .catch(() => setError("Failed to load unlocked profiles"))
      .finally(() => setLoading(false));
  }, [brandId, apiFetch]);

  if (authLoading || !brandId) return null;

  return (
    <BrandLayout credits={credits?.total ?? null}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 lg:pt-8 pb-24">

        {/* Back */}
        <button
          onClick={() => navigate("/home-brand")}
          className="flex items-center gap-1.5 mb-6 text-white/70 hover:text-white/80 transition-colors text-sm"
          style={{ fontFamily: POPPINS }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </button>

        {/* Page header */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="text-white font-bold text-2xl sm:text-3xl mb-1" style={{ fontFamily: POPPINS }}>
              Unlocked Profiles
            </h1>
            <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>
              Creators whose full profiles you have unlocked
            </p>
          </div>
          {!loading && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: "rgba(240,24,122,0.15)", color: PINK, fontFamily: POPPINS }}>
              {creators.length} {creators.length === 1 ? "creator" : "creators"}
            </span>
          )}
        </div>

        {error && (
          <p className="text-red-400 text-sm" style={{ fontFamily: POPPINS }}>{error}</p>
        )}

        {/* Skeletons */}
        {loading && (
          <div className="space-y-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-28 sm:h-24 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && creators.length === 0 && (
          <div className="rounded-2xl p-12 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Users className="w-10 h-10 mx-auto mb-4 text-white/70" />
            <p className="text-white/80 text-base font-semibold mb-1" style={{ fontFamily: POPPINS }}>No unlocked profiles yet</p>
            <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>
              Browse creators and spend a credit to unlock their full profile and contact details.
            </p>
            <button
              onClick={() => navigate("/home-brand/search")}
              className="mt-5 px-6 py-2.5 rounded-full text-white text-sm font-semibold"
              style={{ background: PINK, fontFamily: POPPINS }}
            >
              Find Creators →
            </button>
          </div>
        )}

        {/* Creator list */}
        {!loading && creators.length > 0 && (
          <div className="space-y-4">
            {creators.map(c => (
              <CreatorCard
                key={c.unlockId}
                creator={c}
                onView={() => navigate(`/home-brand/unlocked/creator/${c.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </BrandLayout>
  );
}

function CreatorCard({ creator, onView }: { creator: UnlockedCreator; onView: () => void }) {
  const initials = (creator.fullName ?? creator.instagramHandle)[0]?.toUpperCase() ?? "?";
  const unlockDate = new Date(creator.unlockedAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
  const MAX_CATS = 3;
  const visibleCats = creator.categories.slice(0, MAX_CATS);
  const extraCats = creator.categories.length - MAX_CATS;

  const avatar = (size: string) => (
    <div
      className={`${size} rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-xl`}
      style={{ background: "rgba(240,24,122,0.18)", color: PINK, border: `2px solid ${PINK}40` }}
    >
      {creator.profilePhotoUrl
        ? <img src={creator.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
        : initials}
    </div>
  );

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
    >
      {/* ── DESKTOP LAYOUT (sm and up) ── */}
      <div className="hidden sm:flex items-center gap-5 px-6 py-5">
        {avatar("w-16 h-16")}

        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-white font-bold text-lg leading-tight truncate" style={{ fontFamily: POPPINS }}>
              {creator.fullName ?? `@${creator.instagramHandle}`}
            </p>
            {creator.status === "PAUSED" && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", fontFamily: POPPINS }}>
                Paused
              </span>
            )}
          </div>

          {/* Handle + followers row */}
          <div className="flex items-center gap-4 mb-2.5">
            <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>@{creator.instagramHandle}</p>
            <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
              <Users className="w-3.5 h-3.5" style={{ color: PINK }} />
              {fmt(creator.followerCount)}
            </span>
          </div>

          {/* Categories */}
          <div className="flex items-center gap-2 flex-wrap">
            {visibleCats.map(cat => (
              <span
                key={cat.id}
                className="text-xs px-3 py-1 rounded-full font-semibold"
                style={{ background: "rgba(240,24,122,0.13)", color: PINK, fontFamily: POPPINS, border: "1px solid rgba(240,24,122,0.20)" }}
              >
                {cat.name}
              </span>
            ))}
            {extraCats > 0 && (
              <span className="text-xs text-white/70 font-medium" style={{ fontFamily: POPPINS }}>
                +{extraCats} more
              </span>
            )}
          </div>

          <p className="text-white/70 text-xs mt-2" style={{ fontFamily: POPPINS }}>
            Unlocked {unlockDate}
          </p>
        </div>

        <button
          onClick={onView}
          className="flex-shrink-0 px-6 py-2.5 rounded-full text-white text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: PINK, fontFamily: POPPINS }}
        >
          View Profile
        </button>
      </div>

      {/* ── MOBILE LAYOUT (below sm) ── */}
      <div className="flex flex-col sm:hidden px-5 pt-5 pb-4 gap-3">
        {/* Avatar + name + handle stacked */}
        <div className="flex items-center gap-3">
          {avatar("w-14 h-14")}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <p className="text-white font-bold text-base leading-tight" style={{ fontFamily: POPPINS }}>
                {creator.fullName ?? `@${creator.instagramHandle}`}
              </p>
              {creator.status === "PAUSED" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", fontFamily: POPPINS }}>
                  Paused
                </span>
              )}
            </div>
            <p className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>@{creator.instagramHandle}</p>
          </div>
        </div>

        {/* Follower count */}
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: PINK }} />
          <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
            {fmt(creator.followerCount)} Followers
          </span>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2">
          {visibleCats.map(cat => (
            <span
              key={cat.id}
              className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: "rgba(240,24,122,0.13)", color: PINK, fontFamily: POPPINS, border: "1px solid rgba(240,24,122,0.20)" }}
            >
              {cat.name}
            </span>
          ))}
          {extraCats > 0 && (
            <span className="text-xs text-white/70 font-medium" style={{ fontFamily: POPPINS }}>
              +{extraCats} more
            </span>
          )}
        </div>

        {/* Unlock date */}
        <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>
          Unlocked {unlockDate}
        </p>

        {/* Full-width CTA */}
        <button
          onClick={onView}
          className="w-full py-3 rounded-xl text-white text-sm font-semibold mt-1 transition-opacity hover:opacity-90"
          style={{ background: PINK, fontFamily: POPPINS }}
        >
          View Profile
        </button>
      </div>
    </div>
  );
}
