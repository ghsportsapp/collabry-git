import { useEffect, useRef } from "react";
import { Link } from "wouter";
import Header from "@/components/landing/Header";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorks from "@/components/landing/HowItWorks";
import CollabModes from "@/components/landing/CollabModes";
import ComparisonTable from "@/components/landing/ComparisonTable";
import LandingPageVideoSection from "@/components/landing/LandingPageVideoSection";
import Footer from "@/components/landing/Footer";
import { useLandingContent } from "@/hooks/useLandingContent";

const PINK = "#E14F69";
const POPPINS = "'Poppins', sans-serif";

function useFadeInOnScroll() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const sections = container.querySelectorAll(".fade-in-section");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return ref;
}

function ExploreButtons({ content }: { content: ReturnType<typeof useLandingContent> }) {
  const brandBtn = content.get("landing.explore_brand_btn") || "Explore Collabry as a Brand →";
  const creatorBtn = content.get("landing.explore_creator_btn") || "Explore Collabry as a Creator →";

  return (
    <section className="pb-2">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <Link href="/brand" className="flex-1">
            <button
              className="w-full text-white font-medium text-sm lg:text-base py-2.5 lg:py-3 rounded-xl transition-colors cursor-pointer"
              style={{ background: PINK, fontFamily: POPPINS }}
            >
              {brandBtn}
            </button>
          </Link>
          <Link href="/creator" className="flex-1">
            <button
              className="w-full text-white font-medium text-sm lg:text-base py-2.5 lg:py-3 rounded-xl transition-colors cursor-pointer border border-white/20 hover:bg-white/5"
              style={{ fontFamily: POPPINS, background: "transparent" }}
            >
              {creatorBtn}
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const containerRef = useFadeInOnScroll();
  const content = useLandingContent();

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0A0A0F]">
      <Header />

      <main>
        <div className="fade-in-section">
          <HeroSection content={content} />
        </div>

        <div className="fade-in-section">
          <ExploreButtons content={content} />
        </div>

        <div id="how-it-works" className="fade-in-section">
          <HowItWorks content={content} />
        </div>

        <div className="fade-in-section">
          <CollabModes content={content} />
        </div>

        <div className="fade-in-section">
          <ComparisonTable content={content} />
        </div>

        <LandingPageVideoSection page="home" />

      </main>

      <Footer />
    </div>
  );
}
