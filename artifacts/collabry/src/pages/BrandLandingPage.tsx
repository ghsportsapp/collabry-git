import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ShieldCheck, BadgeCheck, LayoutGrid } from "lucide-react";
import { useBrandLandingContent } from "@/hooks/useBrandLandingContent";
import { useLandingContent } from "@/hooks/useLandingContent";
import HeroBannerCarousel, { normalizeBanners } from "@/components/landing/HeroBannerCarousel";
import HowItWorks from "@/components/landing/HowItWorks";
import CollabModes from "@/components/landing/CollabModes";
import ComparisonTable from "@/components/landing/ComparisonTable";
import LandingPageVideoSection from "@/components/landing/LandingPageVideoSection";
import Footer from "@/components/landing/Footer";

const PINK = "#E14F69";
const BG = "#0A0A0F";
const POPPINS = "'Poppins', sans-serif";
const MACONDO = "'Macondo Swash Caps', cursive";

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sections = el.querySelectorAll(".fade-in-section");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);
  return ref;
}

/* ── HEADER ── */
/** Scroll depth at which the header stops floating over the hero image and
 *  becomes a solid bar. Roughly the point where the image has left the top. */
const HEADER_SOLID_AT = 80;
const HEADER_SCRIM =
  "linear-gradient(to bottom, rgba(10,10,15,0.72) 0%, rgba(10,10,15,0.38) 55%, rgba(10,10,15,0) 100%)";

function BrandPageHeader() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > HEADER_SOLID_AT);
    onScroll(); // a reload can restore a mid-page scroll position
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    /* Over the hero image the bar is transparent and carries only a fading
       legibility scrim; past HEADER_SOLID_AT it turns solid. The scrim is a
       separate layer rather than a background swap so both states can
       cross-fade (a gradient background-image cannot transition to a colour). */
    <header
      className="sticky top-0 z-50 transition-colors duration-300"
      style={{
        backgroundColor: solid ? BG : "transparent",
        borderBottom: `1px solid ${solid ? "rgba(255,255,255,0.05)" : "transparent"}`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{ opacity: solid ? 0 : 1, background: HEADER_SCRIM }}
      />
      <div className="relative max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
        <button
          onClick={() => { if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }}
          aria-label="Scroll to top"
          className="text-2xl cursor-pointer bg-transparent border-0 p-0"
          style={{ fontFamily: MACONDO, color: PINK }}
        >
          Collabry
        </button>

        {/* Desktop buttons */}
        <div className="hidden lg:flex items-center gap-3">
          <Link href="/signup-brand">
            <button
              className="text-white text-sm font-medium px-6 py-2.5 transition-colors cursor-pointer hover:opacity-90"
              style={{ background: PINK, borderRadius: "20px 20px 20px 0px" }}
            >
              Sign Up as a Brand
            </button>
          </Link>
          <Link href="/signup-creator">
            <button
              className="text-white text-sm font-medium px-6 py-2.5 border border-white hover:bg-white/10 transition-colors cursor-pointer"
              style={{ borderRadius: "20px 20px 20px 0px" }}
            >
              Sign Up as a Creator
            </button>
          </Link>
        </div>

        {/* Mobile: Signup dropdown */}
        <div className="relative lg:hidden" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="border border-white text-white text-sm font-medium px-5 py-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            Signup
          </button>
          {open && (
            <div
              className="absolute right-0 top-[calc(100%+8px)] w-52 flex flex-col gap-2 p-2 z-50 rounded-xl"
              style={{ background: BG, border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <Link href="/signup-brand">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full text-white text-sm font-semibold py-2.5 rounded-full cursor-pointer"
                  style={{ background: PINK }}
                >
                  Sign Up as a Brand
                </button>
              </Link>
              <Link href="/signup-creator">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full border border-white/30 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Sign Up as a Creator
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ── HERO ── */
const trustBadges = [
  { icon: ShieldCheck, label: "Escrow Protected" },
  { icon: BadgeCheck, label: "Verified Creators" },
  { icon: LayoutGrid, label: "4 Ways to Collab" },
];

function HeroSection({ c, showCta }: { c: ReturnType<typeof useBrandLandingContent>; showCta: boolean }) {
  const sub = c.get("brand.hero.subheading");
  const tagline = "Verified creators. Secure payments. Real results.";
  const cta = c.get("brand.hero.cta_btn");

  return (
    <section className="pt-8 pb-8 lg:pt-32 lg:pb-10 text-center px-5">
      <div className="max-w-[1280px] mx-auto">
        {/* Heading */}
        <h1
          className="font-bold leading-tight mb-6 text-[1.6rem] lg:text-[3.25rem]"
          style={{ fontFamily: "'Merriweather', serif" }}
        >
          <span className="text-white">Find Creators Who </span>
          <span style={{ color: PINK }}>Actually Convert.</span>
          <br />
          <span className="text-white">Real Influence. </span>
          <span style={{ color: PINK }}>Real Results.</span>
        </h1>

        {/* Subheading */}
        <p
          className="text-[#9CA3AF] mb-4 max-w-2xl mx-auto leading-relaxed"
          style={{ fontFamily: POPPINS, fontSize: "clamp(0.9rem, 1.5vw, 1.125rem)" }}
        >
          {sub}
        </p>

        {/* Tagline */}
        <p
          className="text-white font-bold mb-10"
          style={{ fontFamily: POPPINS, fontSize: "clamp(0.85rem, 1.2vw, 1rem)" }}
        >
          {tagline}
        </p>

        {/* CTA Button */}
        {showCta && (
          <Link href="/signup-brand">
            <button
              className="w-auto px-7 py-2.5 lg:w-full lg:max-w-sm lg:py-4 text-white font-semibold rounded-xl transition-colors cursor-pointer mb-8 hover:opacity-90"
              style={{ background: PINK, fontFamily: POPPINS, fontSize: "1rem" }}
            >
              {cta}
            </button>
          </Link>
        )}

        {/* Trust badges */}
        <div className="flex flex-nowrap items-center justify-center gap-2 lg:gap-6">
          {trustBadges.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1 lg:gap-2">
              <div className="w-5 h-5 lg:w-8 lg:h-8 rounded-lg lg:rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
              </div>
              <span className="text-[#9CA3AF] text-[10px] lg:text-sm whitespace-nowrap" style={{ fontFamily: POPPINS }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── WHY MOST CAMPAIGNS WASTE MONEY ── */
function StatsSection({ c }: { c: ReturnType<typeof useBrandLandingContent> }) {
  const sub = c.get("brand.stats.subheading");
  const closing = c.get("brand.stats.closing_line");
  const cards = c.getJson<Array<{ value: string; label: string }>>("brand.stats.cards");

  return (
    <section className="py-10 lg:py-14">
      <div className="max-w-[1280px] mx-auto px-6">
        {/* Heading */}
        <div className="text-center mb-6 lg:mb-10 px-2 lg:px-0">
          <h2
            className="font-bold text-white text-center text-[1.35rem] sm:text-[2rem] lg:text-[3rem] leading-tight"
            style={{ fontFamily: POPPINS }}
          >
            Why Most Campaigns{" "}
            <span style={{ color: PINK }}>Waste Money?</span>
          </h2>
          <p
            className="text-[#9CA3AF] mt-3 max-w-2xl mx-auto"
            style={{ fontFamily: POPPINS, fontSize: "clamp(0.875rem, 1.3vw, 1.125rem)" }}
          >
            {sub}
          </p>
        </div>

        {/* 3×2 stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {cards.map((card, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 border border-white/10 bg-[#111118]"
            >
              <p
                className="font-bold mb-2"
                style={{ color: PINK, fontFamily: POPPINS, fontSize: "clamp(1.1rem, 1.8vw, 1.5rem)" }}
              >
                {card.value}
              </p>
              <p className="text-[#9CA3AF] text-sm leading-relaxed" style={{ fontFamily: POPPINS }}>
                {card.label}
              </p>
            </div>
          ))}
        </div>

        {/* Closing quote */}
        <p
          className="text-center text-white font-semibold leading-relaxed max-w-3xl mx-auto"
          style={{ fontFamily: POPPINS, fontSize: "clamp(1rem, 1.5vw, 1.5rem)" }}
        >
          "{closing}"
        </p>
      </div>
    </section>
  );
}

/* ── PAGE ── */
export default function BrandLandingPage() {
  const containerRef = useFadeIn();
  const c = useBrandLandingContent();
  const landingContent = useLandingContent();

  const banners = normalizeBanners(c.getJson("brand.hero.banners"));

  return (
    <div ref={containerRef} className="min-h-screen" style={{ background: BG }}>
      <BrandPageHeader />
      {/* A sticky header still occupies its 4rem of flow, which would sit as a
          band above the image. Cancel it so the banner bleeds to the top edge
          and the header floats over it — but only when there IS a banner,
          otherwise the hero copy would slide up underneath the header. */}
      <main className={banners.length > 0 ? "-mt-16" : undefined}>
        <HeroBannerCarousel
          banners={banners}
          ctaLabel={c.get("brand.hero.cta_btn")}
          ctaLink="/signup-brand"
        />

        <div className="fade-in-section">
          <HeroSection c={c} showCta={banners.length === 0} />
        </div>

        <div className="fade-in-section">
          <StatsSection c={c} />
        </div>

        <div id="how-it-works" className="fade-in-section">
          <HowItWorks content={landingContent} brandsOnly />
        </div>

        <div className="fade-in-section">
          <CollabModes
            headingLine={c.get("brand.collab_modes.heading_line1")}
            headingHighlight={c.get("brand.collab_modes.heading_highlight1")}
            subheading={c.get("brand.collab_modes.subheading")}
            cardsOverride={c.getJson("brand.collab_modes.modes")}
          />
        </div>

        <div className="fade-in-section">
          <ComparisonTable rows={c.getJson("brand.comparison.rows")} />
          <div className="max-w-[1280px] mx-auto px-6 py-8">
            <a
              href="/"
              className="block w-full text-center py-4 rounded-xl text-white font-semibold text-lg transition-opacity hover:opacity-90"
              style={{ background: "#E14F69", fontFamily: "'Poppins', sans-serif" }}
            >
              Visit Collabry
            </a>
          </div>
        </div>

        <LandingPageVideoSection page="brand" />

      </main>

      <Footer />
    </div>
  );
}
