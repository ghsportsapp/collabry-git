import { useEffect, useRef, useState } from "react";
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
   than the screen and pans sideways. Desktop: a full-width band 600px tall in
   which the square is shown whole (object-contain) and centred, so the banner's
   lower content — faces, follower counts, rate badges — is never cropped. The
   leftover width either side reads as deliberate pillarboxing because the box
   is already painted BG. */
const BOX = "w-[66vh] h-[66vh] lg:w-full lg:h-[600px]";
const ARROW =
  "absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition-colors hover:bg-black/70 cursor-pointer";

export default function HeroBannerCarousel({ banners, ctaLabel, ctaLink }: Props) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = normalizeBanners(banners);

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

  if (items.length === 0) return null;

  const multiple = items.length > 1;
  // Clamp rather than track in an effect — a banner deleted in admin arrives
  // via polling and can leave `active` past the end of the list.
  const current = Math.min(active, items.length - 1);

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
          <div className={`relative ${BOX}`}>
            {items.map((banner, i) => (
              <div
                key={i}
                /* Size/position of the blur-up placeholder live in classes, not
                   inline style, so they can track the image's fit at each
                   breakpoint — on desktop it must be contained and centred too,
                   or the blur would bleed across the pillarbox bars. */
                className="absolute inset-0 overflow-hidden transition-opacity duration-300 bg-cover bg-top lg:bg-contain lg:bg-center lg:bg-no-repeat"
                style={{
                  opacity: i === current ? 1 : 0,
                  pointerEvents: i === current ? "auto" : "none",
                  backgroundImage: banner.blurData ? `url(${banner.blurData})` : undefined,
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
                  /* Mobile keeps the top-anchored crop and the 1.06 push-in that
                     clears the transparent header. Desktop shows the whole
                     square instead, so the zoom is dropped there — scaling a
                     contained image past its box would re-crop it. */
                  className="w-full h-full select-none object-cover object-[center_top] scale-[1.06] origin-top lg:object-contain lg:object-center lg:scale-100 lg:origin-center"
                />
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
      </div>

      {/* One CTA node, stacked under the image at every width. It used to be
          overlaid at lg+, which worked while the desktop image was cropped to a
          top strip and its lower half was empty gradient; against the full
          square it covered the banner's own content. */}
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
