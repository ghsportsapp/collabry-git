import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { X } from "lucide-react";

const PINK = "#F0187A";
const POPPINS = "'Poppins', sans-serif";
const CONFETTI_COLORS = ["#F0187A", "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#C77DFF", "#FFB347", "#FF8FA3"];

interface Props {
  brandName: string;
  credits: number;
  onDismiss: () => void;
}

function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    type Particle = {
      x: number; y: number; vx: number; vy: number;
      rotation: number; rotationSpeed: number;
      w: number; h: number; color: string; opacity: number;
      shape: "rect" | "circle";
    };

    const particles: Particle[] = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 3,
      vy: 1.5 + Math.random() * 3.5,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      w: 5 + Math.random() * 9,
      h: 3 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      opacity: 0.9 + Math.random() * 0.1,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    }));

    let animId: number;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.vy += 0.03;
        if (p.y > canvas.height - 80) p.opacity -= 0.015;
        if (p.opacity <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      if (alive) animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

export default function BrandWelcomePopup({ brandName, credits, onDismiss }: Props) {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const close = (cb?: () => void) => {
    setVisible(false);
    setTimeout(() => { onDismiss(); cb?.(); }, 320);
  };

  const USE_CASES = [
    "Unlock creator profiles",
    "Post paid & barter campaigns",
    "Start collaborations faster",
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 200,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(10px)",
        transition: "opacity 0.32s ease",
        opacity: visible ? 1 : 0,
      }}
    >
      <Confetti active={visible} />

      <div
        className="relative w-full max-w-sm px-6 py-7 text-center overflow-hidden"
        style={{
          zIndex: 1,
          borderRadius: "2rem",
          background: "linear-gradient(145deg, #100B1E 0%, #1A0830 50%, #0E0E1A 100%)",
          border: "1px solid rgba(240,24,122,0.4)",
          boxShadow: "0 0 100px rgba(240,24,122,0.22), 0 32px 80px rgba(0,0,0,0.85)",
          transform: visible ? "scale(1) translateY(0)" : "scale(0.88) translateY(24px)",
          transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Glow ring at top */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(240,24,122,0.18) 0%, transparent 70%)", top: -20 }}
        />

        {/* Close */}
        <button
          onClick={() => close()}
          className="absolute top-4 right-4 transition-opacity hover:opacity-100"
          style={{ opacity: 0.4, color: "white" }}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Heading */}
        <h2 className="font-bold text-2xl leading-tight mb-1 mt-2" style={{ fontFamily: POPPINS, color: "white" }}>
          Welcome to{" "}
          <span style={{ color: PINK }}>Collabry</span>!
        </h2>
        <p className="text-white/75 text-sm mb-5" style={{ fontFamily: POPPINS }}>
          Hi {brandName}, you're all set 🎉
        </p>

        {/* Credits badge */}
        <div
          className="rounded-2xl py-3.5 px-6 mb-5 inline-block"
          style={{
            background: "linear-gradient(135deg, rgba(240,24,122,0.18) 0%, rgba(240,24,122,0.06) 100%)",
            border: "1px solid rgba(240,24,122,0.38)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <p className="text-white/75 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>You received</p>
          <p className="font-black text-4xl leading-none" style={{ color: PINK, fontFamily: POPPINS }}>
            {credits}
          </p>
          <p className="text-white/90 text-sm font-semibold mt-0.5" style={{ fontFamily: POPPINS }}>
            Free Credit{credits === 1 ? "" : "s"}
          </p>
          <p className="text-white/70 text-xs mt-1" style={{ fontFamily: POPPINS }}>to start collaborating</p>
        </div>

        {/* Use cases */}
        <div
          className="text-left rounded-2xl px-4 py-3.5 mb-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="text-white/70 text-xs font-semibold mb-2.5 uppercase tracking-wider" style={{ fontFamily: POPPINS }}>
            Use these credits to
          </p>
          {USE_CASES.map(item => (
            <div key={item} className="flex items-center gap-2.5 mb-2 last:mb-0">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PINK }} />
              <p className="text-white/80 text-sm" style={{ fontFamily: POPPINS }}>{item}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => close(() => navigate(`${BASE_URL}/home-brand`))}
          className="w-full py-3 rounded-2xl text-white font-bold text-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: PINK, fontFamily: POPPINS }}
        >
          Go to Home Page
        </button>
      </div>
    </div>
  );
}
