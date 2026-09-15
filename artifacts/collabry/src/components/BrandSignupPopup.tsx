import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Confetti from "@/components/Confetti";
import { POPPINS, PINK } from "@/components/BrandLayout";

/* Shown once, on the signup page, the moment a brand's account is created —
   then it hands off to the home page. Living here rather than on BrandHome is
   what makes "signup only" true by construction: there is no flag to leak into
   a later visit, and login never renders it. */

/** How long the image holds the screen alone, with no way out. */
const LOCK_MS = 2000;

export interface PopupImage {
  imageUrl: string;
  /** Tiny inline preview, painted underneath while the real image decodes. */
  blurData?: string;
}

/** Parses the admin-stored value. Anything unusable means "no popup". */
export function parsePopupImage(raw: string | null | undefined): PopupImage | null {
  if (!raw || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw) as PopupImage;
    return v?.imageUrl ? v : null;
  } catch {
    return null;
  }
}

/** Warms the browser cache so the popup paints instantly when it opens. */
export function preloadPopupImage(img: PopupImage | null): void {
  if (!img?.imageUrl) return;
  const el = new Image();
  el.decoding = "async";
  el.src = img.imageUrl;
}

export default function BrandSignupPopup({ image, onClose }: {
  image: PopupImage;
  /** Closing always continues to the brand home page. */
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  /** Gates the cross, the button, and backdrop dismissal together. */
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const t = setTimeout(() => setUnlocked(true), LOCK_MS);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, []);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-5"
      style={{
        zIndex: 300,
        // ~50% dim, per spec — lighter than the old welcome modal's 88%.
        background: "rgba(0,0,0,0.5)",
        transition: "opacity 0.3s ease",
        opacity: shown ? 1 : 0,
      }}
      // Inert for the first LOCK_MS: the brand cannot dismiss by clicking out.
      onClick={() => { if (unlocked) onClose(); }}
    >
      <Confetti active={shown} />

      <div
        className="relative w-full"
        // Capped so it never fills a wide desktop screen; the horizontal
        // padding on the backdrop keeps it clear of the edges on mobile.
        style={{ maxWidth: 420, zIndex: 1 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cross — appears with the button, never before. */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.75)",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "#fff",
            cursor: "pointer",
            zIndex: 2,
            opacity: unlocked ? 1 : 0,
            transform: unlocked ? "scale(1)" : "scale(0.7)",
            transition: "opacity 0.35s ease, transform 0.35s ease",
            pointerEvents: unlocked ? "auto" : "none",
          }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Square image. The blur-up sits behind it so there is colour on
            screen even in the frame before the real bytes decode. */}
        <div
          className="w-full overflow-hidden rounded-2xl"
          style={{
            aspectRatio: "1 / 1",
            backgroundImage: image.blurData ? `url(${image.blurData})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: "#15151D",
          }}
        >
          <img
            src={image.imageUrl}
            alt=""
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Continue — appears with the cross. */}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-xl text-white font-semibold text-sm"
          style={{
            background: PINK,
            fontFamily: POPPINS,
            border: "none",
            cursor: "pointer",
            opacity: unlocked ? 1 : 0,
            transform: unlocked ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.35s ease, transform 0.35s ease",
            pointerEvents: unlocked ? "auto" : "none",
          }}
        >
          Continue to Home Page
        </button>
      </div>
    </div>
  );
}
