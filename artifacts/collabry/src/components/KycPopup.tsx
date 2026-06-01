import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import type { PopupItem } from "./GlobalPopup";

const PINK = "#F0187A";
const POPPINS = "'Poppins', sans-serif";

const KYC_ICONS: Record<string, string> = {
  KYC_APPROVED: "✅",
  KYC_REJECTED: "❌",
  PAYOUT_PENDING_KYC: "⚠️",
  DEAL_COMPLETE_KYC_NEEDED: "📋",
};

interface Props {
  popup: PopupItem;
  onDismiss: () => void;
}

export default function KycPopup({ popup, onDismiss }: Props) {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const close = (cb?: () => void) => {
    setVisible(false);
    setTimeout(() => { onDismiss(); cb?.(); }, 300);
  };

  const handleCta = (rawPath: string | null | undefined) => {
    if (!rawPath) { close(); return; }
    const path = rawPath === "/home-creator/kyc" ? "/home-creator/profile#kyc" : rawPath;
    close(() => {
      if (path.includes("#")) {
        const [pagePath, hash] = path.split("#");
        navigate(`${BASE_URL}${pagePath}`);
        setTimeout(() => {
          window.location.hash = hash;
          const el = document.getElementById(hash);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 350);
      } else {
        navigate(`${BASE_URL}${path}`);
      }
      setTimeout(() => window.dispatchEvent(new CustomEvent("collabry:refresh")), 150);
    });
  };

  const icon = KYC_ICONS[popup.type ?? ""] ?? "📋";
  const isRejected = popup.type === "KYC_REJECTED";
  const isApproved = popup.type === "KYC_APPROVED";
  const dismissLabel = popup.secondCtaText ?? "Later";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 200,
        background: "rgba(0,0,0,0.65)",
        transition: "opacity 0.3s ease",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        className="w-full max-w-sm text-center"
        style={{
          borderRadius: 12,
          background: "rgba(240,24,122,0.15)",
          border: "1px solid rgba(255,255,255,0.30)",
          boxShadow: "0px 0px 2px 2px rgba(240,24,122,0.40)",
          padding: 28,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.92) translateY(16px)",
          transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12, lineHeight: 1 }}>{icon}</div>

        <h2
          style={{
            fontFamily: POPPINS,
            fontSize: 17,
            fontWeight: 700,
            color: "white",
            marginBottom: 10,
            lineHeight: 1.3,
          }}
        >
          {popup.title}
        </h2>

        <p
          style={{
            fontFamily: POPPINS,
            fontSize: 13,
            color: "rgba(255,255,255,0.8)",
            lineHeight: 1.6,
            marginBottom: isRejected && popup.externalNote ? 12 : 24,
          }}
        >
          {popup.body}
        </p>

        {isRejected && popup.externalNote && (
          <div
            style={{
              background: "rgba(240,24,122,0.15)",
              border: "1px solid #F0187A",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 20,
              textAlign: "left",
            }}
          >
            <p
              style={{
                fontFamily: POPPINS,
                fontSize: 13,
                fontStyle: "italic",
                color: "rgba(255,255,255,0.85)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {popup.externalNote}
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {popup.ctaText && (
            <button
              onClick={() => handleCta(popup.ctaPath)}
              style={{
                fontFamily: POPPINS,
                fontSize: 14,
                fontWeight: 600,
                color: "white",
                background: PINK,
                border: "none",
                borderRadius: 10,
                padding: "10px 24px",
                cursor: "pointer",
                width: "100%",
              }}
            >
              {popup.ctaText}
            </button>
          )}

          {!isApproved && (
            <button
              onClick={() => close()}
              style={{
                fontFamily: POPPINS,
                fontSize: 14,
                fontWeight: 500,
                color: "rgba(255,255,255,0.75)",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 10,
                padding: "10px 24px",
                cursor: "pointer",
                width: "100%",
              }}
            >
              {dismissLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
