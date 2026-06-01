import { useEffect, useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const STORAGE_KEY = "collabry.installPromptDismissedAt";
const SUPPRESS_FOR_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function InstallPrompt() {
  const { canInstall, isInstalled, platform, promptInstall } =
    useInstallPrompt();
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < SUPPRESS_FOR_MS;
  });
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  // Reset hidden if the user clears storage in the same tab.
  useEffect(() => {
    if (isInstalled) setHidden(true);
  }, [isInstalled]);

  if (hidden || isInstalled) return null;
  // On Android/desktop, only render once the browser allows us to install.
  if (platform !== "ios" && !canInstall) return null;
  // iOS: only Safari supports install; skip everything else.
  if (platform === "ios") {
    const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(
      navigator.userAgent
    );
    if (!isSafari) return null;
  }

  const dismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setHidden(true);
  };

  const handleInstall = async () => {
    if (platform === "ios") {
      setShowIosInstructions(true);
      return;
    }
    await promptInstall();
  };

  return (
    <>
      <div
        role="region"
        aria-label="Install Collabry"
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          right: 16,
          maxWidth: 420,
          margin: "0 auto",
          padding: "14px 16px",
          borderRadius: 14,
          background: "#15151c",
          color: "#fff",
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: "Poppins, sans-serif",
          zIndex: 60,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Install Collabry</div>
          <div style={{ fontSize: 12, color: "#cfcfd6", marginTop: 2 }}>
            Add it to your home screen for a faster, app-like experience.
          </div>
        </div>
        <button
          onClick={handleInstall}
          style={{
            background: "#F0187A",
            color: "#fff",
            border: 0,
            padding: "8px 14px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Install
        </button>
        <button
          aria-label="Dismiss"
          onClick={dismiss}
          style={{
            background: "transparent",
            color: "#7d7d87",
            border: 0,
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {showIosInstructions && (
        <div
          onClick={() => setShowIosInstructions(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 360,
              background: "#15151c",
              color: "#fff",
              padding: 20,
              borderRadius: 14,
              fontFamily: "Poppins, sans-serif",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
              Install on iPhone / iPad
            </div>
            <ol
              style={{
                fontSize: 14,
                color: "#cfcfd6",
                paddingLeft: 18,
                lineHeight: 1.5,
              }}
            >
              <li>
                Tap the <strong>Share</strong> button in Safari's toolbar.
              </li>
              <li>
                Scroll down and choose{" "}
                <strong>"Add to Home Screen"</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top right.
              </li>
            </ol>
            <button
              onClick={() => setShowIosInstructions(false)}
              style={{
                marginTop: 14,
                width: "100%",
                background: "#F0187A",
                color: "#fff",
                border: 0,
                padding: "10px 14px",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
