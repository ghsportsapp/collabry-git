import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PINK = "#E14F69";
const BG = "#0A0A0F";
const POPPINS = "'Poppins', sans-serif";

export interface HeroBanner {
  imageUrl: string;        // MOBILE image (1:1) — also the desktop fallback
  altText: string;
  blurData?: string;
  desktopImageUrl?: string;  // optional DESKTOP image (16:9, full-bleed)
  desktopBlurData?: string;
}

interface Props {
  banners: HeroBanner[];
  ctaLabel: string;
  ctaLink: string;
  /** Headline shown in the desktop overlay (over slides that have a desktop image). */
  overlayHeading?: ReactNode;
  /** Tells the page whether the active slide uses the full-bleed desktop layout,
   *  so it can hide the duplicate headline that sits below on desktop. */
  onActiveDesktopChange?: (hasDesktop: boolean) => void;
}

/** Drops anything unusable so a malformed stored value can't take the page
 *  down. Also tells the page whether to keep its own inline CTA. */
export function normalizeBanners(value: unknown): HeroBanner[] {
  return Array.isArray(value) ? (value as HeroBanner[]).filter((b) => b?.imageUrl) : [];
}

/* Mobile: a strict 1:1 square sized off viewport height, so it renders wider
   than the screen and pans sideways (UNCHANGED). Desktop: a slide WITH a desktop
   image shows it full-width at 16:9 (object-cover, no pillarbox) with the
   headline+CTA overlaid; a slide WITHOUT one keeps the old contained-square
   600px band so existing banners never shift or crop. */
const MOBILE_BOX = "w-[66vh] h-[66vh]";
const ARROW =
  "absolute top-1/2 -translate-y-1/2 z-20 w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition-colors hover:bg-black/70 cursor-pointer";

export default function HeroBannerCarousel({ banners, ctaLabel, ctaLink, overlayHeading, onActiveDesktopChange }: Props) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = normalizeBanners(banners);
  // Clamp rather than track in an effect — a banner deleted in admin arrives
  // via polling and can leave `active` past the end of the list.
  const current = items.length > 0 ? Math.min(active, items.length - 1) : 0;
  const currentHasDesktop = items.length > 0 && !!items[current]?.desktopImageUrl;

  /* The mobile square is deliberately wider than the viewport, and a scroll
     container starts parked at its left edge — which is what made the image
     read as left-cropped. Park it mid-track instead. No-op on desktop, where
     the track doesn't overflow and the distance is 0. */
  const centerScroll = (behavior: ScrollBehavior) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: (el.scrollWidth - el.clientWidth) / 2, behavior });
  };

  useEffect(() => { centerScroll("auto"); }, [items.length]);
  // Let the page hide its below-the-fold headline on desktop for overlay slides.
  useEffect(() => { onActiveDesktopChange?.(currentHasDesktop); }, [currentHasDesktop, onActiveDesktopChange]);

  if (items.length === 0) return null;

  const multiple = items.length > 1;
  const desktopBox = currentHasDesktop ? "lg:w-full lg:h-auto lg:aspect-[16/9]" : "lg:w-full lg:h-[600px]";

  const show = (index: number) => {
    setActive(index);
    centerScroll("smooth");
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
          <div className={`relative ${MOBILE_BOX} ${desktopBox}`}>
            {items.map((banner, i) => (
              <div
                key={i}
                /* Blur-up placeholder. Fit tracks the image's fit at each
                   breakpoint so it can't bleed across pillarbox bars. Desktop
                   slides with their own 16:9 image cover the band. */
                className={`absolute inset-0 overflow-hidden transition-opacity duration-300 bg-cover bg-top ${banner.desktopImageUrl ? "lg:bg-cover lg:bg-center lg:bg-no-repeat" : "lg:bg-contain lg:bg-center lg:bg-no-repeat"}`}
                style={{
                  opacity: i === current ? 1 : 0,
                  pointerEvents: i === current ? "auto" : "none",
                  backgroundImage: banner.blurData ? `url(${banner.blurData})` : undefined,
                  backgroundColor: BG,
                }}
              >
                <picture>
                  {banner.desktopImageUrl && (
                    <source media="(min-width: 1024px)" srcSet={banner.desktopImageUrl} />
                  )}
                  <img
                    src={banner.imageUrl}
                    alt={banner.altText}
                    decoding="async"
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    draggable={false}
                    /* Mobile keeps the top-anchored crop + 1.06 push-in (clears
                       the transparent header). Desktop: a desktop image covers
                       the 16:9 band; without one, the square is contained as
                       before. */
                    className={`w-full h-full select-none object-cover object-[center_top] scale-[1.06] origin-top lg:object-center lg:scale-100 lg:origin-center ${banner.desktopImageUrl ? "lg:object-cover" : "lg:object-contain"}`}
                  />
                </picture>
              </div>
            ))}
          </div>
        </div>

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

        {/* Desktop overlay — only for slides with a 16:9 desktop image. Headline
            + CTA centred in the lower third over a subtle bottom scrim (no box).
            pointer-events-none so the arrows underneath stay clickable; the
            button opts back in. Hidden on mobile (layout unchanged there). */}
        {currentHasDesktop && (
          <div
            className="hidden lg:flex absolute inset-0 z-10 flex-col items-center justify-end text-center px-6 pb-14 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.55) 100%)" }}
          >
            {overlayHeading && <div className="max-w-[900px] mb-5" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>{overlayHeading}</div>}
            <Link href={ctaLink}>
              <button
                className="pointer-events-auto px-10 py-4 text-white font-semibold rounded-xl transition-opacity cursor-pointer hover:opacity-90"
                style={{ background: PINK, fontFamily: POPPINS, fontSize: "1rem", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
              >
                {ctaLabel}
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* Below-image controls. Dots stay at every width; the CTA button is the
          mobile/fallback one — hidden on desktop when the overlay already shows it. */}
      <div className="flex flex-col items-center gap-3 px-5 pt-4 lg:gap-4">
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

        <div className={currentHasDesktop ? "lg:hidden" : undefined}>
          <Link href={ctaLink}>
            <button
              className="px-7 py-2.5 lg:px-10 lg:py-4 text-white font-semibold rounded-xl transition-opacity cursor-pointer hover:opacity-90"
              style={{ background: PINK, fontFamily: POPPINS, fontSize: "1rem" }}
            >
              {ctaLabel}
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}
