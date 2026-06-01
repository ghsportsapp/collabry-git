import { Link } from "wouter";
import { useCallback, useState } from "react";
import { ShieldCheck, BadgeCheck, LayoutGrid } from "lucide-react";
import type { LandingContentHook } from "@/hooks/useLandingContent";
import type { HeroMedia } from "@/lib/landingContentFetcher";

const cardBgs = ["bg-yellow-500", "bg-teal-400", "bg-pink-600", "bg-orange-400", "bg-amber-300"];

const trustBadges = [
  { icon: ShieldCheck, label: "Escrow\nProtected" },
  { icon: BadgeCheck, label: "Verified\nCreators" },
  { icon: LayoutGrid, label: "4 Ways\nto Collab" },
];

function CardShimmer() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
          animation: "shimmer 1.6s infinite",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}

function MediaCard({
  media,
  bg,
  className,
  priority = false,
  heroReady,
}: {
  media?: HeroMedia;
  bg: string;
  className: string;
  priority?: boolean;
  heroReady: boolean;
}) {
  const [mediaLoaded, setMediaLoaded] = useState(false);

  const hasCustomSrc = !!media?.src;
  const isVideo = media?.type === "video" && hasCustomSrc;

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    el.muted = true;
    el.play().catch(() => {});
  }, []);

  // Show shimmer overlay: while hero data is still fetching, OR while media src is loading
  const showShimmer = !heroReady || (heroReady && hasCustomSrc && !mediaLoaded);

  return (
    <div className={`relative rounded-[2rem] overflow-hidden ${bg} ${className}`}>
      {/* Shimmer overlay — shown until both heroReady AND media has decoded */}
      {showShimmer && <CardShimmer />}

      {/* Only render actual media once heroReady — prevents Unsplash ever appearing */}
      {heroReady && (
        <>
          {isVideo ? (
            <video
              ref={videoRef}
              src={media!.src!}
              className="w-full h-full object-cover object-top"
              style={{ opacity: mediaLoaded ? 1 : 0, transition: "opacity 0.4s ease" }}
              autoPlay
              muted
              loop
              playsInline
              onCanPlay={() => setMediaLoaded(true)}
            />
          ) : hasCustomSrc ? (
            <img
              src={media!.src!}
              alt="Creator"
              className="w-full h-full object-cover object-top"
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              style={{ opacity: mediaLoaded ? 1 : 0, transition: "opacity 0.4s ease" }}
              onLoad={() => setMediaLoaded(true)}
              onError={() => setMediaLoaded(true)}
            />
          ) : null /* no custom src and heroReady → just show the colored bg card */}
        </>
      )}
    </div>
  );
}

interface Props {
  content?: LandingContentHook;
}

export default function HeroSection({ content }: Props) {
  const mediaCards = content?.getJson<HeroMedia[]>("hero.media_cards") ?? [];
  const heroReady = content?.heroReady ?? false;

  const line1 = content?.get("hero.heading_line1") ?? "Collaborate";
  const highlight1 = content?.get("hero.heading_highlight1") ?? "Smarter.";
  const line2 = content?.get("hero.heading_line2") ?? "Grow";
  const highlight2 = content?.get("hero.heading_highlight2") ?? "Faster.";
  const subheading = content?.get("hero.subheading") ?? "India's most trusted influencer platform — verified profiles, secure escrow payments, and four powerful ways to collaborate.";
  const boldLine = content?.get("hero.bold_line") ?? "Verified creators. Secure payments. Real results.";
  const brandBtn = content?.get("hero.brand_btn") ?? "I am a Brand →";
  const creatorBtn = content?.get("hero.creator_btn") ?? "I am a Creator →";

  return (
    <section className="relative overflow-hidden">
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      <div className="absolute inset-0 bg-gradient-to-br from-[#E14F69]/10 via-transparent to-purple-900/5 pointer-events-none" />
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: "radial-gradient(ellipse 60% 50% at 70% 50%, rgba(240,24,122,0.15) 0%, transparent 70%)"
      }} />

      {/* ── MOBILE LAYOUT ── */}
      <div className="lg:hidden px-5 pt-8 pb-10 space-y-5">
        <div className="flex gap-3 items-start">
          <div className="flex-1 min-w-0">
            <h1 className="text-[2rem] leading-[1.15] font-black" style={{ fontFamily: "'Merriweather', serif" }}>
              {line1} <span className="text-[#E14F69]">{highlight1}</span>
              <br />
              {line2} <span className="text-[#E14F69]">{highlight2}</span>
            </h1>
          </div>
          <div className="flex-shrink-0 w-[140px]">
            <div className="grid grid-cols-2 gap-1.5 h-[145px]">
              <MediaCard media={mediaCards[0]} bg={cardBgs[0]} className="h-full rounded-2xl" priority heroReady={heroReady} />
              <MediaCard media={mediaCards[1]} bg={cardBgs[1]} className="h-full rounded-2xl" priority heroReady={heroReady} />
              <MediaCard media={mediaCards[2]} bg={cardBgs[2]} className="h-full rounded-2xl" heroReady={heroReady} />
              <MediaCard media={mediaCards[3]} bg={cardBgs[3]} className="h-full rounded-2xl" heroReady={heroReady} />
            </div>
          </div>
        </div>

        <p className="text-[#9CA3AF] text-sm leading-relaxed">{subheading}</p>
        <p className="text-white font-bold text-sm">{boldLine}</p>

        <div className="flex gap-3">
          <Link href="/login-brand" className="flex-1">
            <button className="w-full bg-[#E14F69] text-white font-semibold py-3 hover:bg-[#d4156b] transition-colors text-sm cursor-pointer" style={{ borderRadius: "20px 20px 20px 0px" }}>
              {brandBtn}
            </button>
          </Link>
          <Link href="/login-creator" className="flex-1">
            <button className="w-full border border-white/60 text-white font-semibold py-3 hover:bg-white/10 transition-colors text-sm cursor-pointer" style={{ borderRadius: "20px 20px 20px 0px" }}>
              {creatorBtn}
            </button>
          </Link>
        </div>

        <div className="flex items-center justify-between">
          {trustBadges.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-[#9CA3AF] text-[10px] leading-tight whitespace-pre-line">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden lg:flex max-w-[1280px] mx-auto px-6 pt-16 pb-20 items-center gap-16">
        <div className="flex-1 min-w-0 space-y-6 text-left">
          <h1 className="text-[3.875rem] leading-[1.1] font-black" style={{ fontFamily: "'Merriweather', serif" }}>
            {line1} <span className="text-[#E14F69]">{highlight1}</span>
            <br />
            {line2} <span className="text-[#E14F69]">{highlight2}</span>
          </h1>
          <p className="text-[#9CA3AF] text-base leading-relaxed max-w-md">{subheading}</p>
          <p className="text-white font-bold text-sm">{boldLine}</p>
          <div className="flex gap-4">
            <Link href="/login-brand">
              <button className="bg-[#E14F69] text-white font-semibold px-7 py-3 hover:bg-[#d4156b] transition-colors text-sm cursor-pointer" style={{ borderRadius: "20px 20px 20px 0px" }}>
                {brandBtn}
              </button>
            </Link>
            <Link href="/login-creator">
              <button className="border border-white/60 text-white font-semibold px-7 py-3 hover:bg-white/10 transition-colors text-sm cursor-pointer" style={{ borderRadius: "20px 20px 20px 0px" }}>
                {creatorBtn}
              </button>
            </Link>
          </div>
          <div className="flex gap-8 pt-1">
            {trustBadges.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[#9CA3AF] text-[12px] leading-tight whitespace-pre-line">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 flex gap-3 h-[460px] w-[400px] xl:w-[460px]">
          <div className="w-[48%] h-full">
            <MediaCard media={mediaCards[0]} bg={cardBgs[0]} className="w-full h-full" priority heroReady={heroReady} />
          </div>
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 h-full">
            <MediaCard media={mediaCards[1]} bg={cardBgs[1]} className="w-full h-full" priority heroReady={heroReady} />
            <MediaCard media={mediaCards[2]} bg={cardBgs[2]} className="w-full h-full" heroReady={heroReady} />
            <MediaCard media={mediaCards[3]} bg={cardBgs[3]} className="w-full h-full" heroReady={heroReady} />
            <MediaCard media={mediaCards[4]} bg={cardBgs[4]} className="w-full h-full" heroReady={heroReady} />
          </div>
        </div>
      </div>
    </section>
  );
}
