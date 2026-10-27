import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PINK = "#E14F69";
const BG = "#0A0A0F";
const POPPINS = "'Poppins', sans-serif";

export interface HeroBanner {
  imageUrl: string;          // MOBILE image (base) — also the desktop image fallback
  altText: string;
  blurData?: string;
  desktopImageUrl?: string;  // optional DESKTOP image (16:9, full-bleed)
  desktopBlurData?: string;
  // Optional VIDEO per device. When present it plays in place of the image at
  // that breakpoint; the poster shows instantly while/if it loads. Everything
  // stays backward compatible — image-only banners render exactly as before.
  mobileVideoUrl?: string;   // MOBILE video (3:4)
  mobilePosterUrl?: string;
  desktopVideoUrl?: string;  // DESKTOP video (16:9)
  desktopPosterUrl?: string;
}

interface Props {
  banners: HeroBanner[];
  ctaLabel: string;
  ctaLink: string;
  /** Headline shown in the desktop overlay (over slides that have desktop media). */
  overlayHeading?: ReactNode;
  /** Tells the page whether the active slide uses the full-bleed desktop layout,
   *  so it can hide the duplicate headline that sits below on desktop. */
  onActiveDesktopChange?: (hasDesktop: boolean) => void;
}

/** Drops anything unusable so a malformed stored value can't take the page
 *  down. Every slide still needs a mobile image (the universal base/fallback);
 *  videos are additive. */
export function normalizeBanners(value: unknown): HeroBanner[] {
  return Array.isArray(value) ? (value as HeroBanner[]).filter((b) => b?.imageUrl) : [];
}

const hasDesktopMedia = (b?: HeroBanner) => !!(b?.desktopImageUrl || b?.desktopVideoUrl);

const ARROW =
  "absolute top-1/2 -translate-y-1/2 z-30 w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition-colors hover:bg-black/70 cursor-pointer";

// Black scrim, both breakpoints, over image AND video: a top band so the
// floating header stays legible and a stronger bottom band for the overlaid
// headline + CTA. Pure CSS layer — nothing is baked into the media.
const SCRIM =
  "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.72) 100%)";

/** Tracks the lg breakpoint so only the video for the *visible* device of the
 *  active slide ever plays. */
function useIsDesktop(): boolean {
  const [is, setIs] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIs(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return is;
}

export default function HeroBannerCarousel({ banners, ctaLabel, ctaLink, overlayHeading, onActiveDesktopChange }: Props) {
  const [active, setActive] = useState(0);
  const isDesktop = useIsDesktop();
  const mobileVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const desktopVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const items = normalizeBanners(banners);
  // Clamp rather than track in an effect — a banner deleted in admin arrives
  // via polling and can leave `active` past the end of the list.
  const current = items.length > 0 ? Math.min(active, items.length - 1) : 0;
  const currentHasDesktop = items.length > 0 && hasDesktopMedia(items[current]);

  // Let the page hide its below-the-fold headline on desktop for overlay slides.
  useEffect(() => { onActiveDesktopChange?.(currentHasDesktop); }, [currentHasDesktop, onActiveDesktopChange]);

  // Kept in a ref so the interaction listeners below always target whatever
  // slide/breakpoint is active right now, without re-subscribing.
  const stateRef = useRef({ current, isDesktop });
  stateRef.current = { current, isDesktop };

  // Start the active slide's video. Set `muted` as a PROPERTY (not just the
  // attribute) before play() so autoplay is allowed, and swallow a rejected
  // promise — if playback is blocked the crisp poster simply stays (no spinner,
  // no blur). Returns nothing; safe to call repeatedly.
  const playActiveVideo = useCallback(() => {
    const { current: cur, isDesktop: desk } = stateRef.current;
    const el = desk ? desktopVideoRefs.current[cur] : mobileVideoRefs.current[cur];
    if (!el) return;
    el.muted = true;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => { /* blocked — poster stays */ });
  }, []);

  // Play only the active slide's video for the current breakpoint; pause and
  // rewind everything else. Non-active videos keep preload="none", so nothing
  // downloads until a slide is actually shown.
  useEffect(() => {
    items.forEach((_, i) => {
      const mv = mobileVideoRefs.current[i];
      const dv = desktopVideoRefs.current[i];
      const offBreakpoint = isDesktop ? mv : dv;
      if (offBreakpoint) { try { offBreakpoint.pause(); offBreakpoint.currentTime = 0; } catch { /* ignore */ } }
      if (i !== current) {
        const el = isDesktop ? dv : mv;
        if (el) { try { el.pause(); el.currentTime = 0; } catch { /* ignore */ } }
      }
    });
    playActiveVideo();
  }, [current, isDesktop, items.length, playActiveVideo]);

  // Autoplay retry: if the browser blocked muted autoplay, the first user
  // gesture (tap/scroll) kicks the active video into playing. No-op once it is
  // already playing, so leaving these registered is harmless.
  useEffect(() => {
    const retry = () => playActiveVideo();
    window.addEventListener("pointerdown", retry, { passive: true });
    window.addEventListener("touchstart", retry, { passive: true });
    window.addEventListener("scroll", retry, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("touchstart", retry);
      window.removeEventListener("scroll", retry);
    };
  }, [playActiveVideo]);

  if (items.length === 0) return null;

  const multiple = items.length > 1;
  // Mobile is a full-width 3:4 portrait. Desktop: a slide WITH desktop media
  // fills a 16:9 band; one without keeps the old contained 600px band so legacy
  // image-only banners never shift.
  const box = `relative w-full aspect-[3/4] ${currentHasDesktop ? "lg:aspect-[16/9]" : "lg:aspect-auto lg:h-[600px]"}`;

  const show = (index: number) => setActive(index);
  const step = (delta: number) => show((current + delta + items.length) % items.length);

  return (
    <section className="relative" style={{ background: BG }}>
      <div className="relative">
        {/* Slides cross-fade by opacity at every width — no horizontal scroll,
            so there is no swipe/pan gesture on mobile. */}
        <div
          className={box}
          onClick={() => { if (!isDesktop && multiple) step(1); }}
        >
          {items.map((banner, i) => {
            const mobileVideo = banner.mobileVideoUrl;
            const desktopVideo = banner.desktopVideoUrl;
            const desktopImg = banner.desktopImageUrl || banner.imageUrl;
            const desktopImgIsOwn = !!banner.desktopImageUrl;
            return (
              <div
                key={i}
                /* Solid backdrop only — NO blur-up placeholder. The real media
                   (sharp image, or crisp poster + video) renders directly, so
                   nothing is ever gated on a load event or shows as a blur. */
                className="absolute inset-0 overflow-hidden transition-opacity duration-300"
                style={{
                  opacity: i === current ? 1 : 0,
                  pointerEvents: i === current ? "auto" : "none",
                  backgroundColor: BG,
                }}
              >
                {/* MOBILE (hidden on desktop): the 3:4 image is ALWAYS the base
                    layer, so a real on-brand frame is visible no matter what. A
                    video, if any, sits on top and covers it once playing; if it
                    can't autoplay/load, the image underneath stays — never black. */}
                <img
                  src={banner.imageUrl}
                  alt={banner.altText}
                  decoding="async"
                  loading={i === 0 ? "eager" : "lazy"}
                  draggable={false}
                  className="lg:hidden absolute inset-0 w-full h-full select-none object-cover object-center"
                />
                {mobileVideo && (
                  <video
                    ref={(el) => { mobileVideoRefs.current[i] = el; }}
                    className="lg:hidden absolute inset-0 w-full h-full object-cover"
                    poster={banner.mobilePosterUrl || banner.imageUrl}
                    muted
                    loop
                    playsInline
                    preload="none"
                    aria-label={banner.altText}
                  />
                )}

                {/* DESKTOP (hidden on mobile): same pattern. The base image fills
                    (object-cover) whenever the slide has its own desktop image or
                    a desktop video; a legacy slide with neither keeps the old
                    contained look. The video, if any, overlays and covers it. */}
                <img
                  src={desktopImg}
                  alt={banner.altText}
                  decoding="async"
                  loading={i === 0 ? "eager" : "lazy"}
                  draggable={false}
                  className={`hidden lg:block absolute inset-0 w-full h-full select-none object-center ${desktopImgIsOwn || desktopVideo ? "object-cover" : "object-contain"}`}
                />
                {desktopVideo && (
                  <video
                    ref={(el) => { desktopVideoRefs.current[i] = el; }}
                    className="hidden lg:block absolute inset-0 w-full h-full object-cover"
                    poster={banner.desktopPosterUrl || desktopImg}
                    muted
                    loop
                    playsInline
                    preload="none"
                    aria-label={banner.altText}
                  />
                )}
              </div>
            );
          })}

          {/* CSS scrim over the media, both breakpoints. */}
          <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: SCRIM }} />
        </div>

        {multiple && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); step(-1); }}
              aria-label="Previous banner"
              className={`${ARROW} left-3`}
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); step(1); }}
              aria-label="Next banner"
              className={`${ARROW} right-3`}
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </>
        )}

        {/* Desktop overlay — only for slides with desktop media. Headline + CTA
            centred in the lower third, above the shared scrim. pointer-events-none
            so the arrows underneath stay clickable; the button opts back in.
            Hidden on mobile (the headline + CTA live below there). */}
        {currentHasDesktop && (
          <div className="hidden lg:flex absolute inset-0 z-20 flex-col items-center justify-end text-center px-6 pb-14 pointer-events-none">
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

      {/* Below-media controls. Dots stay at every width; the CTA button is the
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
