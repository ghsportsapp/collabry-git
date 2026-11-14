import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { Sparkles, MapPin, Languages as LanguagesIcon } from "lucide-react";

const PINK = "#F0187A";
const POPPINS = "'Poppins', sans-serif";
// Solid, fully-opaque card matching the Collabry dark theme — no see-through.
const CARD_BG = "#141019";

// Shown ONCE per session to a logged-in creator who is still missing their city
// AND/OR their languages, nudging them to add whichever is empty so brands
// searching by city / language can find them. It never blocks the app:
// "Later"/× just closes it (it returns next session until BOTH are filled).
// Creators who already have BOTH a city and ≥1 language never see it.
//
// Mounted inside CreatorLayout, which remounts on route changes — the
// sessionStorage guard makes the check run (and the popup appear) at most once
// per session, "not on every page".
//
// It also takes PRIORITY over the queued login popups (campaign/deal/KYC):
// `onBlockingChange` tells the layout to hold those back while this is
// deciding or on screen, so the nudge always shows first and alone.
const SESSION_KEY = "collabry_city_prompt_checked";
const CITY_FIELD_PATH = "/home-creator/profile?edit=true&section=city-district";
const LANGUAGES_FIELD_PATH = "/home-creator/profile?edit=true&section=languages";

export default function CityPromptPopup({ onBlockingChange }: { onBlockingChange?: (blocking: boolean) => void }) {
  const { accessToken, apiFetch } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);
  // Which fields are still empty — drives both the copy and which buttons show.
  const [missingCity, setMissingCity] = useState(false);
  const [missingLanguages, setMissingLanguages] = useState(false);
  // True while this popup must suppress the other login popups: from the moment
  // the check starts until the creator resolves it (or it decides not to show).
  const [blocking, setBlocking] = useState(false);

  // Mirror `blocking` up to the layout, and always release on unmount so a
  // navigation while the popup is open can never leave the queue stuck.
  useEffect(() => { onBlockingChange?.(blocking); }, [blocking, onBlockingChange]);
  useEffect(() => () => { onBlockingChange?.(false); }, [onBlockingChange]);

  useEffect(() => {
    if (!accessToken) return;
    try { if (sessionStorage.getItem(SESSION_KEY)) return; } catch { /* private mode */ }
    // Consume this session's single check up-front so a mid-flight navigation
    // (which remounts the layout) can never fire a second fetch or popup.
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }

    // Hold back the other popups until we know whether to show the nudge.
    setBlocking(true);
    let alive = true;
    apiFetch("/api/creator/profile")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { creator?: { city?: string | null; languages?: string[] | null } }) => {
        if (!alive) return;
        const noCity = !(d?.creator?.city ?? "").trim();
        const langs = d?.creator?.languages;
        const noLanguages = !Array.isArray(langs) || langs.length === 0;
        if (!noCity && !noLanguages) {
          setBlocking(false);   // already has BOTH → straight to normal popups
          return;
        }
        setMissingCity(noCity);
        setMissingLanguages(noLanguages);
        setShow(true);          // at least one missing → show the nudge (keep blocking)
      })
      .catch(() => { if (alive) setBlocking(false); }); // never nag on a lookup failure
    return () => { alive = false; };
  }, [accessToken, apiFetch]);

  useEffect(() => {
    if (!show) return;
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, [show]);

  if (!show) return null;

  const close = (cb?: () => void) => {
    setVisible(false);
    setTimeout(() => {
      setShow(false);
      // Resolved — let the queued campaign/deal/KYC popups through.
      setBlocking(false);
      cb?.();
    }, 300);
  };

  // Body adapts to which fields are missing — "city and language", or just one.
  const both = missingCity && missingLanguages;
  const searchPhrase = both ? "city and language" : missingCity ? "city" : "language";
  const body = `Brands are searching creators by ${searchPhrase}. Add your${both ? "s" : missingCity ? " city" : " languages"} so the right brands can find you and reach out — right now you're invisible for those searches.`;

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
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-full max-w-sm text-center"
        style={{
          borderRadius: 12,
          background: CARD_BG,
          border: "1px solid rgba(240,24,122,0.45)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(240,24,122,0.25)",
          padding: 28,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.92) translateY(16px)",
          transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <Sparkles className="w-9 h-9" style={{ color: PINK }} />
        </div>

        <h2 style={{ fontFamily: POPPINS, fontSize: 17, fontWeight: 700, color: "white", marginBottom: 10, lineHeight: 1.3 }}>
          Get discovered by more brands ✨
        </h2>

        <p style={{ fontFamily: POPPINS, fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, marginBottom: 24 }}>
          {body}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {missingCity && (
            <button
              onClick={() => close(() => navigate(CITY_FIELD_PATH))}
              style={{
                fontFamily: POPPINS, fontSize: 14, fontWeight: 600, color: "white", background: PINK,
                border: "none", borderRadius: 10, padding: "10px 24px", cursor: "pointer", width: "100%",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <MapPin className="w-4 h-4" /> Add your city
            </button>
          )}
          {missingLanguages && (
            <button
              onClick={() => close(() => navigate(LANGUAGES_FIELD_PATH))}
              style={{
                fontFamily: POPPINS, fontSize: 14, fontWeight: 600, color: "white",
                // Primary pink when it's the only action; secondary (outlined) when
                // it sits under the "Add your city" primary button.
                background: missingCity ? "rgba(240,24,122,0.18)" : PINK,
                border: missingCity ? "1px solid rgba(240,24,122,0.45)" : "none",
                borderRadius: 10, padding: "10px 24px", cursor: "pointer", width: "100%",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <LanguagesIcon className="w-4 h-4" /> Add languages
            </button>
          )}
          <button
            onClick={() => close()}
            style={{
              fontFamily: POPPINS, fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.75)",
              background: "transparent", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10,
              padding: "10px 24px", cursor: "pointer", width: "100%",
            }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
