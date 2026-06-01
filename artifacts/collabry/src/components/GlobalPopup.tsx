import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import { jsPDF } from "jspdf";
import LockedFeatureModal from "@/components/LockedFeatureModal";

const PINK = "#F0187A";
const POPPINS = "'Poppins', sans-serif";
const CONFETTI_COLORS = ["#F0187A", "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#C77DFF", "#FFB347", "#FF8FA3"];

export interface PopupItem {
  id: string;
  type?: string | null;
  title: string;
  body: string;
  ctaText?: string | null;
  ctaPath?: string | null;
  secondCtaText?: string | null;
  secondCtaPath?: string | null;
  isCelebration: boolean;
  externalNote?: string | null;
}

interface Props {
  popup: PopupItem;
  onDismiss: () => void;
  creatorStatus?: string;
  onLogout?: () => void;
}

function isCampaignPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path.includes("/campaigns/") || path.includes("/barter/");
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
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 199 }}
    />
  );
}

function downloadInvoicePdf(imageUrl: string, filename: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;
  img.onload = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    (pdf as any).addImage(img, "JPEG", 0, 0, 210, 297);
    pdf.save(filename || "Collabry-Invoice.pdf");
  };
}

export default function GlobalPopup({ popup, onDismiss, creatorStatus, onLogout }: Props) {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const isInvoice = popup.type === "INVOICE_READY";
  const isBanPopup = popup.type === "ACCOUNT_BANNED";

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const close = (cb?: () => void) => {
    setVisible(false);
    setTimeout(() => {
      onDismiss();
      cb?.();
      if (isBanPopup) onLogout?.();
    }, 320);
  };

  const handleCta = (path: string) => {
    if (creatorStatus && creatorStatus !== "ACTIVE" && isCampaignPath(path)) {
      setShowLocked(true);
      return;
    }
    close(() => {
      navigate(`${BASE_URL}${path}`);
      try {
        const u = new URL(path, window.location.href);
        const tab = u.searchParams.get("tab");
        if (tab) window.dispatchEvent(new CustomEvent("collabry:tab", { detail: { tab } }));
        if (u.searchParams.get("tutorial") === "1") {
          setTimeout(() => window.dispatchEvent(new CustomEvent("collabry:tutorial")), 80);
        }
      } catch { /* ignore */ }
      setTimeout(() => window.dispatchEvent(new CustomEvent("collabry:refresh")), 150);
    });
  };

  return (
    <>
    {showLocked && <LockedFeatureModal onClose={() => setShowLocked(false)} />}
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 200,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(10px)",
        transition: "opacity 0.32s ease",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {popup.isCelebration && <Confetti active={visible} />}

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
        <div
          className="absolute left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(240,24,122,0.18) 0%, transparent 70%)", top: -20 }}
        />

        <button
          onClick={() => close()}
          className="absolute top-4 right-4 transition-opacity hover:opacity-100"
          style={{ opacity: 0.4, color: "white" }}
        >
          <X className="w-5 h-5" />
        </button>

        {popup.isCelebration && (
          <div className="text-4xl mb-3 mt-2 leading-none select-none">🎉</div>
        )}
        {isInvoice && (
          <div className="text-4xl mb-3 mt-2 leading-none select-none">📄</div>
        )}

        <h2
          className="font-bold text-xl leading-snug mb-2"
          style={{ fontFamily: POPPINS, color: "white", marginTop: popup.isCelebration ? 0 : "0.5rem" }}
        >
          {popup.title}
        </h2>

        {/* Body text — trim recommendation lines for revision popups since we render a dedicated box */}
        {(() => {
          const isRevision =
            popup.type?.includes("REVISION_REQUESTED") ||
            popup.title?.toLowerCase().includes("revision");
          const bodyText = isBanPopup
            ? "Your Collabry account is banned. If you think this is a mistake, contact us."
            : isRevision ? popup.body.split(/\n\n/)[0] : popup.body;
          return (
            <>
              <p className="text-sm" style={{ fontFamily: POPPINS, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, marginBottom: isRevision ? "12px" : "24px" }}>
                {bodyText}
              </p>

              {/* Permanently-mounted recommendation box — driven by type/title, never body text */}
              {isRevision && (
                <div style={{
                  marginBottom: 20,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(125,183,255,0.25)",
                  background: "linear-gradient(135deg, rgba(30,20,60,0.95) 0%, rgba(20,10,40,0.95) 100%)",
                  boxShadow: "0 4px 24px rgba(125,183,255,0.08)",
                  textAlign: "left",
                }}>
                  <div style={{ padding: "7px 14px", background: "rgba(125,183,255,0.10)", borderBottom: "1px solid rgba(125,183,255,0.15)", display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7DB7FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: "#7DB7FF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: POPPINS }}>
                      For smoother collaboration
                    </span>
                  </div>
                  <div style={{ padding: "12px 14px 10px" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: "0 0 8px", lineHeight: 1.55, fontFamily: POPPINS }}>
                      For better clarity and faster approvals, we recommend discussing feedback in the deal chat or over a quick Google Meet call.
                    </p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", margin: "0 0 0", lineHeight: 1.4, fontFamily: POPPINS }}>
                      All revisions and approvals must still be submitted through Collabry.
                    </p>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        <div className="flex flex-col gap-2.5">
          {(isBanPopup || popup.ctaText) && (
            <button
              onClick={() => {
                if (isBanPopup) {
                  handleCta("/about-us");
                } else if (isInvoice && popup.ctaPath) {
                  downloadInvoicePdf(popup.ctaPath, popup.externalNote || "Collabry-Invoice.pdf");
                  close();
                } else if (popup.ctaPath) {
                  handleCta(popup.ctaPath);
                } else {
                  close();
                }
              }}
              className="w-full py-3 rounded-2xl text-white font-bold text-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ background: PINK, fontFamily: POPPINS }}
            >
              {isBanPopup ? "Contact Us" : popup.ctaText}
            </button>
          )}
          {popup.secondCtaText && (
            <button
              onClick={() => popup.secondCtaPath ? handleCta(popup.secondCtaPath) : close()}
              className="w-full py-3 rounded-2xl text-white font-semibold text-sm transition-opacity hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.18)",
                fontFamily: POPPINS,
              }}
            >
              {!isInvoice && (
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              )}
              {popup.secondCtaText}
            </button>
          )}
          <button
            onClick={() => close()}
            className="w-full py-2.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)",
              fontFamily: POPPINS,
            }}
          >
            {popup.ctaText ? "Dismiss" : "Close"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
