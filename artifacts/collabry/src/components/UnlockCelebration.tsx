import { memo, useMemo } from "react";

const POPPINS = "'Poppins', sans-serif";
const CONFETTI_COLORS = ["#E14F69", "#ff6eb4", "#fff", "#ffd700", "#00e5ff", "#7c3aed", "#10b981"];

interface Props {
  show: boolean;
  username?: string | null;
  fullName?: string | null;
  subtitle?: string;
}

function UnlockCelebrationImpl({ show, username, fullName, subtitle }: Props) {
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        left: `${(i * 2.78) % 100}%`,
        delay: `${(i * 12) % 300}ms`,
        size: 6 + (i % 5) * 2,
        rotate: (i * 47) % 360,
      })),
    []
  );

  if (!show) return null;

  const handle = username ? `@${username.replace(/^@/, "")}` : fullName ?? "this creator";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none", overflow: "hidden" }}>
      <style>{`
        @keyframes uc_confettiFall {
          0% { transform: translate3d(0,-20px,0) rotate(0deg); opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translate3d(0,105vh,0) rotate(720deg); opacity: 0; }
        }
        @keyframes uc_unlockPop {
          0% { transform: scale(0.4) translateY(20px); opacity: 0; }
          25% { transform: scale(1.15) translateY(0); opacity: 1; }
          75% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 0; }
        }
      `}</style>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
      {confettiPieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            top: 0,
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.id % 3 === 0 ? "50%" : "2px",
            animation: `uc_confettiFall 1.6s ease-in ${p.delay} both`,
            transform: `rotate(${p.rotate}deg)`,
            willChange: "transform, opacity",
          }}
        />
      ))}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
        <div style={{ animation: "uc_unlockPop 2s ease-out both", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 12 }}>🔓</div>
          <p style={{ color: "white", fontFamily: POPPINS, fontWeight: 700, fontSize: 22, textShadow: "0 0 30px rgba(240,24,122,0.9)", margin: 0 }}>Profile Unlocked</p>
          <p style={{ color: "rgba(255,255,255,0.90)", fontFamily: POPPINS, fontWeight: 400, fontSize: 14, margin: "8px 0 0", lineHeight: 1.5 }}>
            You can now view{" "}
            <span style={{ color: "#E14F69", fontWeight: 600 }}>{handle}</span>
            {"'s"} full profile and contact details.
          </p>
          {subtitle && (
            <p style={{ color: "rgba(255,255,255,0.75)", fontFamily: POPPINS, fontSize: 13, marginTop: 8 }}>{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const UnlockCelebration = memo(UnlockCelebrationImpl);
export default UnlockCelebration;
