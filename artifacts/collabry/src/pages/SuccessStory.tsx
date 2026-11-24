import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Volume2, VolumeX, Play, X } from "lucide-react";
import Footer from "@/components/landing/Footer";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const LOGO = `${import.meta.env.BASE_URL}collabry-logo.png`;

interface Detail { label: string; answer: string }
interface Story {
  id: string; videoUrl: string | null; posterUrl: string | null; details: Detail[];
  caseStudyBrand: string | null; caseStudyCreator: string | null; caseStudyText: string | null;
}
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

  useEffect(() => {
    if (next?.posterUrl) { const img = new Image(); img.src = next.posterUrl; }
  }, [next?.posterUrl]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      <SuccessHeader />

      <div className="relative overflow-hidden">
        {/* Ambient premium glow */}
        <div className="pointer-events-none absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(225,79,105,0.16) 0%, transparent 60%)" }} />

        <div className="relative max-w-6xl mx-auto px-5 pt-12 lg:pt-16 pb-10">
          {/* ── Hero ── */}
          <div className="text-center mb-10 lg:mb-16">
            <h1 className="text-white font-bold leading-[1.05]" style={{ fontSize: "clamp(30px, 5.5vw, 58px)" }}>
              Collabs That <span style={{ color: PINK }}>Delivered</span>
            </h1>
            <p className="text-white/60 text-sm lg:text-base mt-4 max-w-xl mx-auto">
              See how brands and creators collaborate on Collabry — straight from the people who made it happen.
            </p>
          </div>

          {stories === null ? (
            <div className="h-[55vh] flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-white/15 border-t-[#E14F69] animate-spin" />
            </div>
          ) : total === 0 ? (
            <div className="text-center py-8 text-white/50 text-sm">
              Our success stories are coming soon — check back shortly.
            </div>
          ) : current ? (
            <div className="grid lg:grid-cols-[1fr_auto] gap-10 lg:gap-14 items-center">
              {/* Info card (top on mobile, left on desktop) */}
              <div className="order-1 w-full">
                <DetailsCard key={current.id} story={current} />
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

                <div className="flex items-center gap-3 mt-7">
                  {multi && (
                    <button onClick={goPrev} aria-label="Previous story"
                      className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:border-white/30"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)" }}>
                      <ChevronLeft className="w-5 h-5 text-white" />
                    </button>
                  )}
                  <button onClick={() => setMuted(m => !m)} aria-label={muted ? "Unmute" : "Mute"}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110"
                    style={{ background: PINK, boxShadow: "0 6px 20px rgba(225,79,105,0.45)" }}>
                    {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                  </button>
                  {multi && (
                    <button onClick={goNext} aria-label="Next story"
                      className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:border-white/30"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)" }}>
                      <ChevronRight className="w-5 h-5 text-white" />
                    </button>
                  )}
                </div>
                {multi && <p className="text-white/40 text-xs mt-3 tracking-wide">{(index % total) + 1} / {total}</p>}

                {next?.videoUrl && (
                  <video key={`pre-${next.id}`} src={next.videoUrl} preload="metadata" muted playsInline
                    className="hidden" aria-hidden tabIndex={-1} />
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Case study band (reflects current story) ── */}
      {current && <CaseStudyBand key={`cs-${current.id}`} story={current} />}

      {/* ── Our Success Story + stats ── */}
      <section className="max-w-4xl mx-auto px-5 py-16 text-center">
        <h2 className="text-white font-bold" style={{ fontSize: "clamp(22px, 3.5vw, 36px)" }}>
          Our <span style={{ color: PINK }}>Success Story</span>
        </h2>
        <StatsSentence stats={stats} />
        <Link href="/signup-brand">
          <button className="mt-9 px-8 py-3.5 rounded-xl text-white font-semibold text-sm lg:text-base transition-all hover:scale-[1.03]"
            style={{ background: PINK, boxShadow: "0 8px 28px rgba(225,79,105,0.4)" }}>
            Start Your Success Story →
          </button>
        </Link>
      </section>

      <Footer />
    </div>
  );
}

// ── Page header (this page only) ──
function SuccessHeader() {
  const [choose, setChoose] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link href="/" aria-label="Collabry home"
          className="flex items-center gap-2 text-2xl text-[#E14F69] no-underline" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>
          <img src={LOGO} alt="" className="h-7 w-auto" />
          Collabry
        </Link>

        {/* Desktop: two signup buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <Link href="/signup-brand">
            <button className="text-white text-sm font-medium px-5 py-2.5 transition-colors hover:bg-[#d4156b]" style={{ background: PINK, borderRadius: "20px 20px 20px 0px" }}>
              Sign up as a Brand
            </button>
          </Link>
          <Link href="/signup-creator">
            <button className="border border-white/80 text-white text-sm font-medium px-5 py-2.5 transition-colors hover:bg-white/10" style={{ borderRadius: "20px 20px 20px 0px" }}>
              Sign up as a Creator
            </button>
          </Link>
        </div>

        {/* Mobile: single Sign up → choice popup */}
        <button onClick={() => setChoose(true)} className="sm:hidden text-white text-sm font-semibold px-5 py-2 rounded-full" style={{ background: PINK }}>
          Sign up
        </button>
      </div>

      {choose && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget) setChoose(false); }}>
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5" style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-base">Join Collabry</h3>
              <button onClick={() => setChoose(false)} aria-label="Close"><X className="w-5 h-5 text-white/70" /></button>
            </div>
            <Link href="/signup-brand">
              <button className="w-full text-white text-sm font-semibold py-3 rounded-full mb-2.5" style={{ background: PINK }} onClick={() => setChoose(false)}>
                Sign up as a Brand
              </button>
            </Link>
            <Link href="/signup-creator">
              <button className="w-full border border-white/25 text-white text-sm font-semibold py-3 rounded-full" onClick={() => setChoose(false)}>
                Sign up as a Creator
              </button>
            </Link>
          </div>
        </div>
      )}
    </header>
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
      <div className="flex flex-wrap items-stretch justify-center gap-y-6 mt-9 divide-x divide-white/10">
        <Chip value={brands} label="Brands" />
        <Chip value={creators} label="Creators" />
        <Chip value={collabs} label="Collabs" />
        <Chip value={totalViews} label="Total Views" />
      </div>
    </>
  );
}

function CaseStudyBand({ story }: { story: Story }) {
  const brand = (story.caseStudyBrand ?? "").trim();
  const creator = (story.caseStudyCreator ?? "").trim();
  const text = (story.caseStudyText ?? "").trim();
  if (!brand && !creator && !text) return null;
  const headline = brand && creator ? `${brand} × ${creator}` : (brand || creator);
  return (
    <section className="max-w-5xl mx-auto px-5 ss-fade-slide">
      <div className="rounded-3xl p-7 lg:p-12 relative overflow-hidden text-center"
        style={{ background: "linear-gradient(135deg, rgba(225,79,105,0.14) 0%, rgba(120,20,60,0.10) 45%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(225,79,105,0.25)", boxShadow: "0 0 60px rgba(225,79,105,0.08)" }}>
        <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(225,79,105,0.22) 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(225,79,105,0.14) 0%, transparent 70%)" }} />
        <p className="relative text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: PINK }}>Case Study</p>
        {headline && (
          <h3 className="relative text-white font-bold leading-tight" style={{ fontSize: "clamp(22px, 3.2vw, 38px)" }}>{headline}</h3>
        )}
        {text && (
          <p className="relative text-white/70 text-sm lg:text-[15px] leading-relaxed mt-4 max-w-2xl mx-auto">{text}</p>
        )}
      </div>
    </section>
  );
}

function DetailsCard({ story }: { story: Story }) {
  const pairs = (story.details ?? []).filter(d => (d.label ?? "").trim() || (d.answer ?? "").trim());
  return (
    <div className="ss-fade-slide rounded-3xl p-7 lg:p-10 relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, rgba(225,79,105,0.12) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 70px rgba(0,0,0,0.4), 0 0 60px rgba(225,79,105,0.06)" }}>
      <div className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(225,79,105,0.2) 0%, transparent 70%)" }} />
      <p className="text-[11px] uppercase tracking-[0.2em] mb-1.5" style={{ color: PINK }}>The Collaboration</p>
      <h3 className="text-white font-bold text-xl lg:text-2xl mb-6 relative">Inside the deal</h3>
      {pairs.length === 0 ? (
        <p className="text-white/50 text-sm">Details coming soon.</p>
      ) : (
        <dl className="relative divide-y divide-white/8">
          {pairs.map((d, i) => (
            <div key={i} className="py-3.5 first:pt-0">
              <dt className="text-[11px] uppercase tracking-wide mb-1" style={{ color: PINK }}>{d.label}</dt>
              <dd className="text-white font-semibold text-base lg:text-lg leading-snug">{d.answer}</dd>
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
      if (autoAdvance && isFinite(v.duration) && v.duration > 0) {
        watchdogRef.current = window.setTimeout(() => onAdvanceRef.current(), (v.duration + 2) * 1000);
      }
    };
    const onEnded = () => {
      clearWatch();
      if (autoAdvance) onAdvanceRef.current();
      else { try { v.currentTime = 0; void v.play(); } catch { /* ignore */ } }
    };
    const onError = () => { clearWatch(); if (autoAdvance) onAdvanceRef.current(); };

    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);

    v.muted = muted;
    if (saveData) setShowPlay(true);
    else v.play().catch(() => setShowPlay(true));

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearWatch();
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id, autoAdvance, saveData]);

  const manualPlay = () => { const v = videoRef.current; if (v) v.play().then(() => setShowPlay(false)).catch(() => {}); };

  // Ring geometry in viewBox units (0..100).
  const R = 46;
  const C = 2 * Math.PI * R;
  const ballAngle = (k: number) => -Math.PI / 2 + (progress - k) * 2 * Math.PI;
  const ptx = (k: number) => 50 + R * Math.cos(ballAngle(k));
  const pty = (k: number) => 50 + R * Math.sin(ballAngle(k));

  return (
    <div className="relative mx-auto aspect-square ss-pop-in" style={{ width: "min(88vw, 520px)" }}>
      {/* Orbiting progress ring + glowing ball with soft trail */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <linearGradient id="ssRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E14F69" />
            <stop offset="55%" stopColor="#ff7d97" />
            <stop offset="100%" stopColor="#ffd0da" />
          </linearGradient>
          <filter id="ssArcGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="ssBallGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        {/* Progress arc */}
        <circle cx="50" cy="50" r={R} fill="none" stroke="url(#ssRing)" strokeWidth="1.7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 50 50)" filter="url(#ssArcGlow)" />
        {/* Soft trail — ghost balls just behind the leading ball */}
        <circle cx={ptx(0.03)} cy={pty(0.03)} r="2.0" fill="#ffb3c2" opacity="0.28" />
        <circle cx={ptx(0.015)} cy={pty(0.015)} r="2.3" fill="#ff93a8" opacity="0.5" />
        {/* Leading glowing ball */}
        <circle cx={ptx(0)} cy={pty(0)} r="2.9" fill="#fff" filter="url(#ssBallGlow)"
          className={reducedMotion ? "" : "ss-ball-pulse"} />
      </svg>

      {/* Premium 9:16 frame — gradient border + soft glow */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[26px] p-[1.5px]"
        style={{ height: "90%", aspectRatio: "9 / 16", background: "linear-gradient(150deg, rgba(225,79,105,0.8), rgba(255,255,255,0.12) 40%, rgba(225,79,105,0.35))", boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 60px rgba(225,79,105,0.18)" }}>
        <div className="w-full h-full overflow-hidden rounded-[25px]" style={{ background: "#0d0d12" }}>
          <video ref={videoRef} src={story.videoUrl ?? undefined} poster={story.posterUrl ?? undefined}
            muted={muted} playsInline preload="auto" autoPlay={!saveData}
            className="w-full h-full object-cover" />
          {showPlay && (
            <button onClick={manualPlay} aria-label="Play"
              className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
              <span className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: PINK, boxShadow: "0 6px 24px rgba(225,79,105,0.5)" }}>
                <Play className="w-7 h-7 text-white" style={{ marginLeft: 3 }} />
              </span>
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ssBallPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }
        .ss-ball-pulse { animation: ssBallPulse 1.6s ease-in-out infinite; }
        @keyframes ssFadeSlide { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        .ss-fade-slide { animation: ssFadeSlide 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes ssPopIn { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
        .ss-pop-in { animation: ssPopIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .ss-fade-slide, .ss-pop-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
