import { useState } from "react";
import { Download } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { IosInstallInstructions } from "@/components/IosInstallInstructions";

function isIosSafari(): boolean {
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(
    navigator.userAgent,
  );
}

/**
 * A clear, persistent "Install App" button (unlike the auto-dismissing
 * InstallPrompt banner). Renders only when installation is actually possible:
 *  - hidden once the app is already installed (standalone);
 *  - Android/desktop: shown only after the browser fires `beforeinstallprompt`
 *    (i.e. `canInstall`), clicking triggers the native prompt;
 *  - iOS Safari: always shown, clicking opens manual "Add to Home Screen" steps;
 *  - other/unsupported browsers: hidden.
 *
 * `variant="header"` is a compact pill for nav bars; `variant="inline"` is a
 * full-width button for menus/footers.
 */
export function InstallAppButton({
  variant = "header",
  className,
  onClick,
}: {
  variant?: "header" | "inline";
  className?: string;
  /** Fired when the button is tapped (e.g. to close a containing menu). */
  onClick?: () => void;
}) {
  const { canInstall, isInstalled, platform, promptInstall } = useInstallPrompt();
  const [showIos, setShowIos] = useState(false);

  if (isInstalled) return null;
  if (platform === "ios") {
    if (!isIosSafari()) return null;
  } else if (platform === "unsupported" || !canInstall) {
    return null;
  }

  const handleClick = async () => {
    onClick?.();
    if (platform === "ios") {
      setShowIos(true);
      return;
    }
    await promptInstall();
  };

  const base: React.CSSProperties =
    variant === "header"
      ? {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          borderRadius: 9999,
          fontWeight: 600,
          fontSize: 13,
          fontFamily: "Poppins, sans-serif",
          background: "#F0187A",
          color: "#fff",
          border: 0,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }
      : {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          padding: "10px 16px",
          borderRadius: 12,
          fontWeight: 600,
          fontSize: 14,
          fontFamily: "Poppins, sans-serif",
          background: "#F0187A",
          color: "#fff",
          border: 0,
          cursor: "pointer",
        };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={className}
        style={base}
        aria-label="Install Collabry app"
      >
        <Download style={{ width: 15, height: 15 }} aria-hidden />
        Install App
      </button>
      <IosInstallInstructions open={showIos} onClose={() => setShowIos(false)} />
    </>
  );
}
