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

// Black scrims, both breakpoints, over image AND video. Two separate eased
// bands — nothing is baked into the media:
//  - TOP: keeps the floating header logo/icons legible. Strong at the very top,
//    ~0.55 by 40% of the band, fading to transparent. Fixed height so it covers
//    the whole header zone (~140px mobile, ~160px desktop, set on the element).
//  - BOTTOM: makes the overlaid headline + CTA readable. ~0.9 at the bottom
//    fading up, taller band (~45% mobile, ~40% desktop, set on the element).
// Each uses 5 eased stops so the fade is smooth with no visible banding/hard
// edge.
const SCRIM_TOP =
  "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.72) 20%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0) 100%)";
const SCRIM_BOTTOM =
  "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.78) 18%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.25) 68%, rgba(0,0,0,0) 100%)";

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

  // The carousel root — watched by an IntersectionObserver so the video pauses
  // when the hero scrolls out of view.
  const carouselRef = useRef<HTMLDivElement | null>(null);

  // Whether the active slide's video (for the current breakpoint) has crossfaded
  // in. Drives the video's opacity; reset to false on every slide/breakpoint
  // change so each slide starts on its image. Once true it stays true for the
  // life of that activation, so a loop restart never flips back to the image.
  const [videoRevealed, setVideoRevealed] = useState(false);

  // play() gating. The active video is held paused on its first frame until the
  // 2s minimum-image phase elapses (wantPlay), and is never played while the
  // hero is scrolled away (inView) or the tab is hidden (pageVisible). Refs, not
  // state, so the listeners read the latest values without re-subscribing.
  const wantPlayRef = useRef(false);
  const inViewRef = useRef(true);
  const pageVisibleRef = useRef(typeof document !== "undefined" ? !document.hidden : true);

  // The <video> for the active slide at the current breakpoint, or null when the
  // active slide is image-only here.
  const activeVideoEl = useCallback((): HTMLVideoElement | null => {
    const { current: cur, isDesktop: desk } = stateRef.current;
    return (desk ? desktopVideoRefs.current[cur] : mobileVideoRefs.current[cur]) ?? null;
  }, []);

  // Start the active slide's video — but only once we actually want it playing
  // (past the 2s image phase) and the hero is both on-screen and in a visible
  // tab. Set `muted` as a PROPERTY (not just the attribute) before play() so
  // autoplay is allowed, and swallow a rejected promise — if playback is blocked
  // the image simply stays until the next interaction retry. Safe to call
  // repeatedly; a no-op before the 2s mark.
  const playActiveVideo = useCallback(() => {
    if (!wantPlayRef.current || !inViewRef.current || !pageVisibleRef.current) return;
    const el = activeVideoEl();
    if (!el) return;
    el.muted = true;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => { /* blocked — image stays */ });
  }, [activeVideoEl]);

  // Pause the active video without disturbing its position or the reveal — used
  // when the hero leaves the viewport or the tab is hidden.
  const pauseActiveVideo = useCallback(() => {
    const el = activeVideoEl();
    if (el) { try { el.pause(); } catch { /* ignore */ } }
  }, [activeVideoEl]);

  // Per-activation orchestration. Runs on every slide/breakpoint change:
  //  - reset the new slide to image-visible (video opacity 0, currentTime 0);
  //  - pause/rewind every other and off-breakpoint video;
  //  - hold the active video on its first frame for a 2s minimum, then play();
  //  - crossfade the video in only once it is genuinely playing.
  useEffect(() => {
    setVideoRevealed(false);
    wantPlayRef.current = false;

    // Pause the off-breakpoint and non-active videos; rewind them so a later
    // visit starts clean.
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

    const el = activeVideoEl();
    if (!el) return; // image-only slide at this breakpoint — nothing to reveal.

    // Start from the first frame, held paused, while the image shows.
    try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }

    let revealed = false;
    let minElapsed = false;
    let playing = el.readyState >= 3 && !el.paused;
    const tryReveal = () => {
      if (!revealed && minElapsed && playing) { revealed = true; setVideoRevealed(true); }
    };
    // `playing` fires on real playback start (first frame on screen) and on each
    // loop restart — the guard above makes the later ones no-ops.
    const onPlaying = () => { playing = true; tryReveal(); };
    el.addEventListener("playing", onPlaying);

    const timer = window.setTimeout(() => {
      minElapsed = true;
      wantPlayRef.current = true;
      playActiveVideo();     // play from frame 0 (or wait for in-view/visible).
      tryReveal();           // in case it was already playing.
    }, 2000);

    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("playing", onPlaying);
    };
  }, [current, isDesktop, items.length, activeVideoEl, playActiveVideo]);

  // Autoplay retry: if the browser blocked muted autoplay at the 2s mark, the
  // first user gesture (tap/scroll) kicks the active video into playing. No-op
  // before the 2s mark or once already playing, so leaving these registered is
  // harmless.
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

  // Pause when the hero scrolls out of view; resume (without re-showing the
  // image) when it returns.
  useEffect(() => {
    const node = carouselRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
        inViewRef.current = visible;
        if (visible) playActiveVideo(); else pauseActiveVideo();
      },
      { threshold: 0.25 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [playActiveVideo, pauseActiveVideo]);

  // Pause on tab hide, resume on return — mirrors the in-view behaviour.
  useEffect(() => {
    const onVis = () => {
      pageVisibleRef.current = !document.hidden;
      if (document.hidden) pauseActiveVideo(); else playActiveVideo();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [playActiveVideo, pauseActiveVideo]);

  if (items.length === 0) return null;

  const multiple = items.length > 1;
  // Mobile is a full-width 3:4 portrait. Desktop: a slide WITH desktop media
  // fills a 16:9 band; one without keeps the old contained 600px band so legacy
  // image-only banners never shift.
  const box = `relative w-full aspect-[3/4] ${currentHasDesktop ? "lg:aspect-[16/9]" : "lg:aspect-auto lg:h-[600px]"}`;

  const show = (index: number) => setActive(index);
  const step = (delta: number) => show((current + delta + items.length) % items.length);

  // The active slide buffers eagerly; the next one grabs metadata so switching
  // is snappy; the rest stay idle. Combined with play()-on-active, only the
  // shown video actually downloads — but every <video> still gets a real src.
  const nextIndex = (current + 1) % items.length;
  const preloadFor = (i: number): "auto" | "metadata" | "none" =>
    i === current ? "auto" : i === nextIndex ? "metadata" : "none";

  return (
    <section className="relative" style={{ background: BG }}>
      <div className="relative">
        {/* Slides cross-fade by opacity at every width — no horizontal scroll,
            so there is no swipe/pan gesture on mobile. */}
        <div
          ref={carouselRef}
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
                    style={{ opacity: i === current && videoRevealed ? 1 : 0, transition: "opacity 400ms ease" }}
                    src={mobileVideo}
                    poster={banner.mobilePosterUrl || banner.imageUrl}
                    muted
                    loop
                    playsInline
                    preload={preloadFor(i)}
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
                    style={{ opacity: i === current && videoRevealed ? 1 : 0, transition: "opacity 400ms ease" }}
                    src={desktopVideo}
                    poster={banner.desktopPosterUrl || desktopImg}
                    muted
                    loop
                    playsInline
                    preload={preloadFor(i)}
                    aria-label={banner.altText}
                  />
                )}
              </div>
            );
          })}

          {/* CSS scrims over the media (image AND video), both breakpoints.
              Above the media at z-10 but below the header (floating, higher z)
              and the headline overlay (z-20); non-interactive so taps pass
              through to the slide/arrows. */}
          <div
            className="absolute top-0 left-0 right-0 z-10 pointer-events-none h-[140px] lg:h-[160px]"
            style={{ background: SCRIM_TOP }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none h-[45%] lg:h-[40%]"
            style={{ background: SCRIM_BOTTOM }}
          />
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
