import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Play } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface VideoData {
  page: string;
  videoId: string;
  youtubeUrl: string | null;
  thumbnailPath: string | null;
}

interface Props {
  page: "home" | "brand" | "creator";
}

function ytThumb(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function ytThumbFallback(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

function ytEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

export default function LandingPageVideoSection({ page }: Props) {
  const [data, setData] = useState<VideoData | null>(null);
  const [fetched, setFetched] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [location] = useLocation();
  const locationRef = useRef(location);

  useEffect(() => {
    fetch(`${BASE_URL}/api/landing-videos/${page}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VideoData | null) => { setData(d); setFetched(true); })
      .catch(() => setFetched(true));
  }, [page]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetched]);

  const stopVideo = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = "";
    }
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (location !== locationRef.current) {
      locationRef.current = location;
      stopVideo();
    }
  }, [location, stopVideo]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stopVideo(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopVideo]);

  useEffect(() => {
    if (!playing || !containerRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting) stopVideo(); },
      { threshold: 0.2 }
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [playing, stopVideo]);

  if (!fetched) return null;
  if (!data?.videoId) return null;

  const customThumb = data.thumbnailPath ?? null;
  const autoThumb = thumbError ? ytThumbFallback(data.videoId) : ytThumb(data.videoId);
  const thumbSrc = customThumb ?? autoThumb;

  return (
    <section ref={sectionRef} className="fade-in-section py-12 lg:py-16" aria-label="Product video">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl mx-auto"
          style={{
            maxWidth: "960px",
            background: "#000",
            border: "1px solid rgba(225,79,105,0.18)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 8px 48px rgba(225,79,105,0.12)",
          }}
        >
          {!playing ? (
            <button
              type="button"
              className="group relative w-full block focus:outline-none"
              aria-label="Play video"
              onClick={() => setPlaying(true)}
              style={{ cursor: "pointer" }}
            >
              <div className="w-full relative" style={{ aspectRatio: "16/9", background: "#0d0d14", overflow: "hidden" }}>
                <img
                  src={thumbSrc}
                  alt="Video preview"
                  loading="eager"
                  fetchPriority="low"
                  decoding="async"
                  onError={() => !customThumb && !thumbError && setThumbError(true)}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  draggable={false}
                  style={{ display: "block" }}
                />
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.1) 40%, transparent 70%)" }}
                />
              </div>

              <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <div
                  className="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                  style={{ width: 72, height: 72 }}
                >
                  <div
                    className="absolute inset-0 rounded-full animate-pulse"
                    style={{ background: "rgba(225,79,105,0.3)", animationDuration: "2s" }}
                  />
                  <div
                    className="relative w-full h-full rounded-full flex items-center justify-center"
                    style={{ background: "rgba(225,79,105,0.88)", backdropFilter: "blur(6px)" }}
                  >
                    <Play className="text-white" style={{ width: 28, height: 28, marginLeft: 4, fill: "white" }} />
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <div style={{ aspectRatio: "16/9", background: "#000" }}>
              <iframe
                ref={iframeRef}
                src={ytEmbedUrl(data.videoId)}
                title="Collabry product video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className="w-full h-full"
                style={{ display: "block", border: "none" }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
