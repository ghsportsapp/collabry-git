import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ShieldCheck, BadgeCheck, LayoutGrid } from "lucide-react";
import { useCreatorLandingContent } from "@/hooks/useCreatorLandingContent";
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
function CreatorPageHeader({ c }: { c: ReturnType<typeof useCreatorLandingContent> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const logoText = c.get("creator.header.logo_text");
  const signupCreator = c.get("creator.header.signup_btn_creator");
  const signupBrand = c.get("creator.header.signup_btn_brand");

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/5">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
        <button
          onClick={() => { if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }}
          aria-label="Scroll to top"
          className="text-2xl cursor-pointer bg-transparent border-0 p-0"
          style={{ fontFamily: MACONDO, color: PINK }}
        >
          {logoText}
        </button>

        {/* Desktop buttons */}
        <div className="hidden lg:flex items-center gap-3">
          <Link href="/signup-creator">
            <button
              className="text-white text-sm font-medium px-6 py-2.5 transition-colors cursor-pointer hover:opacity-90"
              style={{ background: PINK, borderRadius: "20px 20px 20px 0px" }}
            >
              {signupCreator}
            </button>
          </Link>
          <Link href="/signup-brand">
            <button
              className="text-white text-sm font-medium px-6 py-2.5 border border-white hover:bg-white/10 transition-colors cursor-pointer"
              style={{ borderRadius: "20px 20px 20px 0px" }}
            >
              {signupBrand}
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
              <Link href="/signup-creator">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full text-white text-sm font-semibold py-2.5 rounded-full cursor-pointer"
                  style={{ background: PINK }}
                >
                  {signupCreator}
                </button>
              </Link>
              <Link href="/signup-brand">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full border border-white/30 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {signupBrand}
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
const trustBadgeIcons = [ShieldCheck, BadgeCheck, LayoutGrid];

function HeroSection({ c, showCta }: { c: ReturnType<typeof useCreatorLandingContent>; showCta: boolean }) {
  const line1 = c.get("creator.hero.heading_line1");
  const highlight1 = c.get("creator.hero.heading_highlight1");
  const line2 = c.get("creator.hero.heading_line2");
  const highlight2 = c.get("creator.hero.heading_highlight2");
  const sub = c.get("creator.hero.subheading");
  const tagline = c.get("creator.hero.tagline");
  const cta = c.get("creator.hero.cta_btn");
  const ctaLink = c.get("creator.hero.cta_link") || "/signup-creator";
  const badge1 = c.get("creator.hero.badge1");
  const badge2 = c.get("creator.hero.badge2");
  const badge3 = c.get("creator.hero.badge3");
  const badges = [badge1, badge2, badge3];

  return (
    <section className="pt-12 pb-8 lg:pt-20 lg:pb-10 text-center px-5">
      <div className="max-w-[1280px] mx-auto">
        <h1
          className="font-bold leading-tight mb-6 text-[1.6rem] lg:text-[3.25rem]"
          style={{ fontFamily: "'Merriweather', serif" }}
        >
          <span className="text-white">{line1} </span>
          <span style={{ color: PINK }}>{highlight1}</span>
          <br />
          <span className="text-white">{line2} </span>
          <span style={{ color: PINK }}>{highlight2}</span>
        </h1>

        <p
          className="text-[#9CA3AF] mb-4 max-w-2xl mx-auto leading-relaxed"
          style={{ fontFamily: POPPINS, fontSize: "clamp(0.9rem, 1.5vw, 1.125rem)" }}
        >
          {sub}
        </p>

        <p
          className="text-white font-bold mb-10"
          style={{ fontFamily: POPPINS, fontSize: "clamp(0.85rem, 1.2vw, 1rem)" }}
        >
          {tagline}
        </p>

        {showCta && (
          <Link href={ctaLink}>
            <button
              className="w-auto px-7 py-2.5 lg:w-full lg:max-w-sm lg:py-4 text-white font-semibold rounded-xl transition-colors cursor-pointer mb-8 hover:opacity-90"
              style={{ background: PINK, fontFamily: POPPINS, fontSize: "1rem" }}
            >
              {cta}
            </button>
          </Link>
        )}

        <div className="flex flex-nowrap items-center justify-center gap-2 lg:gap-6">
          {badges.map((label, i) => {
            const Icon = trustBadgeIcons[i];
            return (
              <div key={i} className="flex items-center gap-1 lg:gap-2">
                <div className="w-5 h-5 lg:w-8 lg:h-8 rounded-lg lg:rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                </div>
                <span className="text-[#9CA3AF] text-[10px] lg:text-sm whitespace-nowrap" style={{ fontFamily: POPPINS }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── EARNINGS & SAFETY ── */
function EarningsSection({ c }: { c: ReturnType<typeof useCreatorLandingContent> }) {
  const headingLine = c.get("creator.earnings.heading_line1");
  const headingHighlight = c.get("creator.earnings.heading_highlight1");
  const sub = c.get("creator.earnings.subheading");
  const closing = c.get("creator.earnings.closing_line");
  const cards = c.getJson<Array<{ value: string; label: string }>>("creator.earnings.cards");

  return (
    <section className="py-10 lg:py-14">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-6 lg:mb-10">
          <h2
            className="font-bold text-white text-center text-[1.35rem] sm:text-[2rem] lg:text-[3rem]"
            style={{ fontFamily: POPPINS }}
          >
            <span style={{ color: PINK }}>{headingLine}</span>{" "}
            {headingHighlight}
          </h2>
          <p
            className="text-[#9CA3AF] mt-3 max-w-2xl mx-auto"
            style={{ fontFamily: POPPINS, fontSize: "clamp(0.875rem, 1.3vw, 1.125rem)" }}
          >
            {sub}
          </p>
        </div>

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
export default function CreatorLandingPage() {
  const containerRef = useFadeIn();
  const c = useCreatorLandingContent();
  const landingContent = useLandingContent();

  const banners = normalizeBanners(c.getJson("creator.hero.banners"));
  const collabModes = c.getJson<Array<{ num: string; title: string; desc: string; steps: string[] }>>("creator.collab_modes.modes");
  const collabHeadingLine = c.get("creator.collab_modes.heading_line1");
  const collabHighlight = c.get("creator.collab_modes.heading_highlight1");
  const collabSubheading = c.get("creator.collab_modes.subheading");

  return (
    <div ref={containerRef} className="min-h-screen" style={{ background: BG }}>
      <CreatorPageHeader c={c} />
      <main>
        <HeroBannerCarousel
          banners={banners}
          ctaLabel={c.get("creator.hero.cta_btn")}
          ctaLink={c.get("creator.hero.cta_link") || "/signup-creator"}
        />

        <div className="fade-in-section">
          <HeroSection c={c} showCta={banners.length === 0} />
        </div>

        <div>
          <EarningsSection c={c} />
        </div>

        <div id="how-it-works" className="fade-in-section">
          <HowItWorks content={landingContent} creatorsOnly />
        </div>

        <div className="fade-in-section">
          <CollabModes
            headingLine={collabHeadingLine}
            headingHighlight={collabHighlight}
            subheading={collabSubheading}
            cardsOverride={collabModes}
          />
        </div>

        <div className="fade-in-section">
          <ComparisonTable rows={c.getJson("creator.comparison.rows")} />
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

        <LandingPageVideoSection page="creator" />

      </main>

      <Footer />
    </div>
  );
}
