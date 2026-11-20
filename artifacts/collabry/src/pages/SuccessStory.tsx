import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Volume2, VolumeX, Play, Sparkles } from "lucide-react";
import Footer from "@/components/landing/Footer";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

interface Detail { label: string; answer: string }
interface Story { id: string; videoUrl: string | null; posterUrl: string | null; details: Detail[] }
interface Stats { brands: string; creators: string; collabs: string; totalViews: string }

function prefersReducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
function saveDataOn(): boolean {
  try { return !!(navigator as any).connection?.saveData; } catch { return false; }
}

export default function SuccessStory() {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [stats, setStats] = useState<Stats>({ brands: "", creators: "", collabs: "", totalViews: "" });
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);

  const reducedMotion = useRef(prefersReducedMotion()).current;
  const saveData = useRef(saveDataOn()).current;

  useEffect(() => {
    let alive = true;
    fetch(`${BASE_URL}/api/success-stories`).then(r => r.ok ? r.json() : { stories: [] })
      .then(d => { if (alive) setStories((d.stories ?? []).filter((s: Story) => !!s.videoUrl)); })
      .catch(() => { if (alive) setStories([]); });
    fetch(`${BASE_URL}/api/success-stats`).then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d) setStats(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const total = stories?.length ?? 0;
  const multi = total > 1;
  const current = stories && total > 0 ? stories[Math.min(index, total - 1)] : null;
  const next = multi && stories ? stories[(index + 1) % total] : null;

  const goNext = useCallback(() => { setIndex(i => total > 0 ? (i + 1) % total : 0); }, [total]);
  const goPrev = useCallback(() => { setIndex(i => total > 0 ? (i - 1 + total) % total : 0); }, [total]);

  // Warm the next story's poster so the swap paints instantly.
  useEffect(() => {
    if (next?.posterUrl) { const img = new Image(); img.src = next.posterUrl; }
  }, [next?.posterUrl]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      {/* Ambient premium glow */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(225,79,105,0.14) 0%, transparent 60%)" }} />

        <div className="relative max-w-6xl mx-auto px-5 pt-14 pb-10">
          <div className="text-center mb-10 lg:mb-14">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full mb-4"
              style={{ background: "rgba(225,79,105,0.12)", border: "1px solid rgba(225,79,105,0.3)", color: PINK }}>
              <Sparkles className="w-3.5 h-3.5" /> Real Collaborations
            </span>
            <h1 className="text-white font-bold leading-tight" style={{ fontSize: "clamp(28px, 5vw, 52px)" }}>
              Success <span style={{ color: PINK }}>Stories</span>
            </h1>
            <p className="text-white/60 text-sm lg:text-base mt-3 max-w-xl mx-auto">
              See how brands and creators collaborate on Collabry — straight from the people who made it happen.
            </p>
          </div>

          {stories === null ? (
            <div className="h-[60vh] flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-white/15 border-t-[#E14F69] animate-spin" />
            </div>
          ) : total === 0 ? (
            <div className="text-center py-10 text-white/50 text-sm">
              Our success stories are coming soon — check back shortly.
            </div>
          ) : current ? (
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              {/* Details (top on mobile, left on desktop) */}
              <div className="order-1">
                <DetailsCard story={current} />
              </div>

              {/* Video + orbiting progress ring (below on mobile, right on desktop) */}
              <div className="order-2 flex flex-col items-center">
                <StoryVideo
                  key={current.id}
                  story={current}
                  muted={muted}
                  autoAdvance={multi}
                  saveData={saveData}
                  reducedMotion={reducedMotion}
                  onAdvance={goNext}
                />

                {/* Controls */}
                <div className="flex items-center gap-3 mt-6">
                  {multi && (
                    <button onClick={goPrev} aria-label="Previous story"
                      className="w-11 h-11 rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
                      <ChevronLeft className="w-5 h-5 text-white" />
                    </button>
                  )}
                  <button onClick={() => setMuted(m => !m)} aria-label={muted ? "Unmute" : "Mute"}
                    className="w-11 h-11 rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                    style={{ background: PINK }}>
                    {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                  </button>
                  {multi && (
                    <button onClick={goNext} aria-label="Next story"
                      className="w-11 h-11 rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
                      <ChevronRight className="w-5 h-5 text-white" />
                    </button>
                  )}
                </div>
                {multi && (
                  <p className="text-white/40 text-xs mt-3">{(index % total) + 1} / {total}</p>
                )}

                {/* Preload ONLY the next story's metadata — never all videos at once. */}
                {next?.videoUrl && (
                  <video key={`pre-${next.id}`} src={next.videoUrl} preload="metadata" muted playsInline
                    className="hidden" aria-hidden tabIndex={-1} />
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Our Success Story + stats ── */}
      <section className="max-w-4xl mx-auto px-5 py-14 text-center">
        <h2 className="text-white font-bold" style={{ fontSize: "clamp(22px, 3.5vw, 36px)" }}>
          Our <span style={{ color: PINK }}>Success Story</span>
        </h2>
        <StatsSentence stats={stats} />
        <Link href="/signup-brand">
          <button className="mt-8 px-8 py-3.5 rounded-xl text-white font-semibold text-sm lg:text-base transition-opacity hover:opacity-90"
            style={{ background: PINK, boxShadow: "0 8px 28px rgba(225,79,105,0.4)" }}>
            Start Your Success Story →
          </button>
        </Link>
      </section>

      <Footer />
    </div>
  );
}

function StatsSentence({ stats }: { stats: Stats }) {
  const { brands, creators, collabs, totalViews } = stats;
  const any = [brands, creators, collabs, totalViews].some(v => (v ?? "").trim().length > 0);
  if (!any) return null;
  const Chip = ({ value, label }: { value: string; label: string }) => (
    <div className="flex flex-col items-center px-4">
      <span className="font-bold" style={{ color: PINK, fontSize: "clamp(24px, 4vw, 40px)" }}>{value || "—"}</span>
      <span className="text-white/60 text-xs mt-1">{label}</span>
    </div>
  );
  return (
    <>
      <p className="text-white/70 text-sm lg:text-base mt-3 max-w-2xl mx-auto leading-relaxed">
        Till today, we've powered <span className="text-white font-semibold">{brands || "—"}</span> brands,{" "}
        <span className="text-white font-semibold">{creators || "—"}</span> creators and{" "}
        <span className="text-white font-semibold">{collabs || "—"}</span> collaborations — with{" "}
        <span className="text-white font-semibold">{totalViews || "—"}</span> total views on our collab videos.
      </p>
      <div className="flex flex-wrap items-stretch justify-center gap-y-6 mt-8 divide-x divide-white/10">
        <Chip value={brands} label="Brands" />
        <Chip value={creators} label="Creators" />
        <Chip value={collabs} label="Collabs" />
        <Chip value={totalViews} label="Total Views" />
      </div>
    </>
  );
}

function DetailsCard({ story }: { story: Story }) {
  const pairs = (story.details ?? []).filter(d => (d.label ?? "").trim() || (d.answer ?? "").trim());
  return (
    <div className="rounded-3xl p-7 lg:p-9 relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, rgba(225,79,105,0.10) 0%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 0 50px rgba(225,79,105,0.06)" }}>
      <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(225,79,105,0.18) 0%, transparent 70%)" }} />
      <h3 className="text-white font-bold text-lg lg:text-xl mb-5 relative">The Collaboration</h3>
      {pairs.length === 0 ? (
        <p className="text-white/50 text-sm">Details coming soon.</p>
      ) : (
        <dl className="space-y-4 relative">
          {pairs.map((d, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-wide" style={{ color: PINK }}>{d.label}</dt>
              <dd className="text-white/90 text-sm lg:text-base leading-relaxed">{d.answer}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function StoryVideo({ story, muted, autoAdvance, saveData, reducedMotion, onAdvance }: {
  story: Story;
  muted: boolean;
  autoAdvance: boolean;
  saveData: boolean;
  reducedMotion: boolean;
  onAdvance: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [showPlay, setShowPlay] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);
  const watchdogRef = useRef<number | undefined>(undefined);
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => { onAdvanceRef.current = onAdvance; });

  // Apply mute without remounting the element (so toggling doesn't restart playback).
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setProgress(0);
    setShowPlay(false);
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (v.duration && isFinite(v.duration)) setProgress(Math.min(1, v.currentTime / v.duration));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const clearWatch = () => { if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = undefined; } };
    const onMeta = () => {
      clearWatch();
      // Fallback: if 'ended' never fires (stall/buffer), advance after duration + buffer.
      if (autoAdvance && isFinite(v.duration) && v.duration > 0) {
        watchdogRef.current = window.setTimeout(() => onAdvanceRef.current(), (v.duration + 2) * 1000);
      }
    };
    const onEnded = () => {
      clearWatch();
      if (autoAdvance) onAdvanceRef.current();
      else { try { v.currentTime = 0; void v.play(); } catch { /* ignore */ } } // single story loops
    };
    const onError = () => { clearWatch(); if (autoAdvance) onAdvanceRef.current(); };

    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);

    v.muted = muted;
    if (saveData) {
      setShowPlay(true); // respect data-saver: don't autoplay
    } else {
      v.play().catch(() => setShowPlay(true)); // blocked autoplay → tap to play
    }

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearWatch();
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
    // Re-arm only when the story changes or the mode flips — NOT on progress/mute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id, autoAdvance, saveData]);

  const manualPlay = () => { const v = videoRef.current; if (v) { v.play().then(() => setShowPlay(false)).catch(() => {}); } };

  // Ring geometry in viewBox units (0..100).
  const R = 46;
  const C = 2 * Math.PI * R;
  const angle = -Math.PI / 2 + progress * 2 * Math.PI;
  const ballX = 50 + R * Math.cos(angle);
  const ballY = 50 + R * Math.sin(angle);

  return (
    <div className="relative mx-auto aspect-square" style={{ width: "min(84vw, 440px)" }}>
      {/* Orbiting progress ring + ball */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <linearGradient id="ssRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E14F69" />
            <stop offset="100%" stopColor="#ff9db0" />
          </linearGradient>
          <filter id="ssGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.1" />
        <circle cx="50" cy="50" r={R} fill="none" stroke="url(#ssRing)" strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 50 50)" />
        <circle cx={ballX} cy={ballY} r="2.6" fill="#fff" filter="url(#ssGlow)"
          className={reducedMotion ? "" : "ss-ball-pulse"} />
      </svg>

      {/* Premium 9:16 frame */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[22px]"
        style={{ height: "88%", aspectRatio: "9 / 16", background: "#111", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(225,79,105,0.12)" }}>
        <video ref={videoRef} src={story.videoUrl ?? undefined} poster={story.posterUrl ?? undefined}
          muted={muted} playsInline preload="auto" autoPlay={!saveData}
          className="w-full h-full object-cover" />
        {showPlay && (
          <button onClick={manualPlay} aria-label="Play"
            className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
            <span className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: PINK }}>
              <Play className="w-7 h-7 text-white" style={{ marginLeft: 3 }} />
            </span>
          </button>
        )}
      </div>

      <style>{`
        @keyframes ssBallPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }
        .ss-ball-pulse { animation: ssBallPulse 1.6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
