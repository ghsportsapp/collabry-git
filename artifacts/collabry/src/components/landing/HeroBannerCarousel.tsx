import { useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PINK = "#E14F69";
const BG = "#0A0A0F";
const POPPINS = "'Poppins', sans-serif";

export interface HeroBanner {
  imageUrl: string;
  altText: string;
  blurData?: string;
}

interface Props {
  banners: HeroBanner[];
  ctaLabel: string;
  ctaLink: string;
}

/** Drops anything unusable so a malformed stored value can't take the page
 *  down. Also tells the page whether to keep its own inline CTA. */
export function normalizeBanners(value: unknown): HeroBanner[] {
  return Array.isArray(value) ? (value as HeroBanner[]).filter((b) => b?.imageUrl) : [];
}

/* Mobile: a strict 1:1 square sized off viewport height, so it renders wider
   than the screen and pans sideways. Desktop: a full-width band cropped from
   the bottom (object-top), with the CTA overlaid on its lower area. */
const BOX = "w-[66vh] h-[66vh] lg:w-full lg:h-[clamp(480px,72vh,760px)]";
const ARROW =
  "absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition-colors hover:bg-black/70 cursor-pointer";

export default function HeroBannerCarousel({ banners, ctaLabel, ctaLink }: Props) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = normalizeBanners(banners);
  if (items.length === 0) return null;

  const multiple = items.length > 1;
  // Clamp rather than track in an effect — a banner deleted in admin arrives
  // via polling and can leave `active` past the end of the list.
  const current = Math.min(active, items.length - 1);

  const show = (index: number) => {
    setActive(index);
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  };
  const step = (delta: number) => show((current + delta + items.length) % items.length);

  return (
    <section className="relative" style={{ background: BG }}>
      <div className="relative">
        {/* Pans on mobile where the square overflows; nothing to pan on desktop. */}
        <div
          ref={scrollRef}
          className="overflow-x-auto lg:overflow-x-hidden"
          style={{ touchAction: "pan-x", overscrollBehaviorX: "contain" }}
        >
          <div className={`relative ${BOX}`}>
            {items.map((banner, i) => (
              <div
                key={i}
                className="absolute inset-0 transition-opacity duration-300"
                style={{
                  opacity: i === current ? 1 : 0,
                  pointerEvents: i === current ? "auto" : "none",
                  backgroundImage: banner.blurData ? `url(${banner.blurData})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "top center",
                  backgroundColor: BG,
                }}
              >
                <img
                  src={banner.imageUrl}
                  alt={banner.altText}
                  decoding="async"
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "auto"}
                  draggable={false}
                  className="w-full h-full object-cover object-top select-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Scrim keeps the overlaid CTA legible on desktop. */}
        <div
          className="hidden lg:block absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{ background: `linear-gradient(to bottom, transparent, ${BG})` }}
        />

        {multiple && (
          <>
            <button
              onClick={() => step(-1)}
              aria-label="Previous banner"
              className={`${ARROW} left-3`}
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => step(1)}
              aria-label="Next banner"
              className={`${ARROW} right-3`}
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </>
        )}
      </div>

      {/* One CTA node: stacked under the image on mobile, overlaid on it at lg+. */}
      <div className="flex flex-col items-center gap-3 px-5 pt-4 lg:gap-4 lg:pt-0 lg:absolute lg:bottom-8 lg:inset-x-0 lg:z-10">
        {multiple && (
          <div className="flex items-center justify-center gap-2">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => show(i)}
                aria-label={`Show banner ${i + 1} of ${items.length}`}
                aria-current={i === current}
                className="rounded-full transition-all cursor-pointer"
                style={{
                  width: i === current ? 20 : 7,
                  height: 7,
                  background: i === current ? PINK : "rgba(255,255,255,0.35)",
                }}
              />
            ))}
          </div>
        )}

        <Link href={ctaLink}>
          <button
            className="px-7 py-2.5 lg:px-10 lg:py-4 text-white font-semibold rounded-xl transition-opacity cursor-pointer hover:opacity-90"
            style={{ background: PINK, fontFamily: POPPINS, fontSize: "1rem" }}
          >
            {ctaLabel}
          </button>
        </Link>
      </div>
    </section>
  );
}
