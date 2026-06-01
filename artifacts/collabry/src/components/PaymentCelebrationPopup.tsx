import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { X, IndianRupee, ArrowRight } from "lucide-react";

const PINK = "#F0187A";
const POPPINS = "'Poppins', sans-serif";
const CONFETTI_COLORS = ["#F0187A", "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#C77DFF", "#FFB347", "#FF8FA3"];

interface Props {
  amount: number;
  originalAmount?: number;
  dealName: string;
  brandName: string | null;
  adjustmentReason: string | null;
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

    const particles: Particle[] = Array.from({ length: 100 }, () => ({
      x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 400),
      y: -10 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 3.5,
      vy: 1.5 + Math.random() * 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      w: 5 + Math.random() * 10,
      h: 3 + Math.random() * 6,
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
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

export default function PaymentCelebrationPopup({
  amount, originalAmount, dealName, brandName, adjustmentReason, onDismiss,
}: Props) {
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

  const hasDeduction = originalAmount !== undefined && originalAmount > 0 && Math.abs(amount - originalAmount) > 0.5;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 200,
        background: "rgba(0,0,0,0.90)",
        backdropFilter: "blur(12px)",
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
          background: "linear-gradient(145deg, #0B1A0F 0%, #0F2014 50%, #0A0A0F 100%)",
          border: "1px solid rgba(34,197,94,0.35)",
          boxShadow: "0 0 100px rgba(34,197,94,0.18), 0 32px 80px rgba(0,0,0,0.85)",
          transform: visible ? "scale(1) translateY(0)" : "scale(0.88) translateY(24px)",
          transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(34,197,94,0.16) 0%, transparent 70%)", top: -24 }}
        />

        {/* Close */}
        <button
          onClick={() => close()}
          className="absolute top-4 right-4 transition-opacity hover:opacity-100"
          style={{ opacity: 0.4, color: "white" }}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(34,197,94,0.15)", border: "1.5px solid rgba(34,197,94,0.35)" }}>
          <IndianRupee className="w-8 h-8" style={{ color: "#4ade80" }} />
        </div>

        {/* Heading */}
        <h2 className="font-bold text-2xl leading-tight mb-1" style={{ fontFamily: POPPINS, color: "white" }}>
          Payment Received!
        </h2>
        <p className="text-white/75 text-sm mb-5" style={{ fontFamily: POPPINS }}>
          {brandName ? `From ${brandName}` : "Your deal payout is here"}
        </p>

        {/* Amount badge */}
        <div
          className="rounded-2xl py-4 px-6 mb-4 inline-block w-full"
          style={{
            background: "linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.06) 100%)",
            border: "1px solid rgba(34,197,94,0.35)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <p className="text-white/70 text-xs mb-1" style={{ fontFamily: POPPINS }}>Amount credited</p>
          <p className="font-black text-4xl leading-none" style={{ color: "#4ade80", fontFamily: POPPINS }}>
            ₹{amount.toLocaleString("en-IN")}
          </p>
          {hasDeduction && (
            <p className="text-white/70 text-xs mt-1.5 line-through" style={{ fontFamily: POPPINS }}>
              Original: ₹{originalAmount!.toLocaleString("en-IN")}
            </p>
          )}
        </div>

        {/* Deal name */}
        <div className="rounded-xl px-4 py-3 mb-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>For</p>
          <p className="text-white text-sm font-semibold truncate" style={{ fontFamily: POPPINS }}>{dealName}</p>
          {adjustmentReason && (
            <p className="text-white/70 text-xs mt-1.5 italic leading-relaxed" style={{ fontFamily: POPPINS }}>
              Note: {adjustmentReason}
            </p>
          )}
        </div>

        {/* CTAs */}
        <div className="flex gap-2.5">
          <button
            onClick={() => close(() => navigate(`${BASE_URL}/home-creator/earnings`))}
            className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#22c55e", fontFamily: POPPINS }}
          >
            View Earnings
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p
          className="text-white/70 text-[11px] mt-3 cursor-pointer hover:text-white/70 transition-colors"
          style={{ fontFamily: POPPINS }}
          onClick={() => close()}
        >
          Dismiss
        </p>
      </div>
    </div>
  );
}
