import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { MapPin } from "lucide-react";

const PINK = "#F0187A";
const POPPINS = "'Poppins', sans-serif";

// Shown ONCE per session to a logged-in creator whose city/district is still
// empty, nudging them to add it so brands searching by city can find them. It
// never blocks the app: "Later"/× just closes it (it returns next session until
// the city is set). Creators who already have a city never see it.
//
// Mounted inside CreatorLayout, which remounts on route changes — the
// sessionStorage guard makes the check run (and the popup appear) at most once
// per session, "not on every page".
const SESSION_KEY = "collabry_city_prompt_checked";
const CITY_FIELD_PATH = "/home-creator/profile?edit=true&section=city-district";

export default function CityPromptPopup() {
  const { accessToken, apiFetch } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    try { if (sessionStorage.getItem(SESSION_KEY)) return; } catch { /* private mode */ }
    // Consume this session's single check up-front so a mid-flight navigation
    // (which remounts the layout) can never fire a second fetch or popup.
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }

    let alive = true;
    apiFetch("/api/creator/profile")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { creator?: { city?: string | null } }) => {
        if (!alive) return;
        const city = (d?.creator?.city ?? "").trim();
        if (!city) setShow(true);
      })
      .catch(() => { /* never nag on a lookup failure */ });
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
    setTimeout(() => { setShow(false); cb?.(); }, 300);
  };

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
          background: "rgba(240,24,122,0.15)",
          border: "1px solid rgba(255,255,255,0.30)",
          boxShadow: "0px 0px 2px 2px rgba(240,24,122,0.40)",
          padding: 28,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.92) translateY(16px)",
          transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <MapPin className="w-9 h-9" style={{ color: PINK }} />
        </div>

        <h2 style={{ fontFamily: POPPINS, fontSize: 17, fontWeight: 700, color: "white", marginBottom: 10, lineHeight: 1.3 }}>
          Brands are searching by city
        </h2>

        <p style={{ fontFamily: POPPINS, fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, marginBottom: 24 }}>
          Brands are now searching creators by city — right now you're not showing up for your area. Add your city so brands can find you.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => close(() => navigate(CITY_FIELD_PATH))}
            style={{
              fontFamily: POPPINS, fontSize: 14, fontWeight: 600, color: "white", background: PINK,
              border: "none", borderRadius: 10, padding: "10px 24px", cursor: "pointer", width: "100%",
            }}
          >
            Add your city
          </button>
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
