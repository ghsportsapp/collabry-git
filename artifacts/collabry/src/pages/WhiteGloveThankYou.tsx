import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronDown, Heart } from "lucide-react";
import { WHITE_GLOVE_DEFAULT } from "./whiteGloveContent";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BG = "#0A0A0F";

export default function WhiteGloveThankYou() {
  const [, navigate] = useLocation();
  // Built-in default renders instantly; the fetch only upgrades the message (never hangs).
  const [message, setMessage] = useState(WHITE_GLOVE_DEFAULT.thankYouMessage);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${BASE_URL}/api/white-glove`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { thankYouMessage?: string }) => {
        if (alive && d && typeof d.thankYouMessage === "string" && d.thankYouMessage.trim()) setMessage(d.thankYouMessage);
      })
      .catch(() => { /* keep default — never hang */ });
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: BG, fontFamily: POPPINS }}>
      <div className="max-w-[460px] w-full text-center">
        <img src={`${BASE_URL}/white-glove-thankyou.svg`} alt="" className="w-full max-w-[320px] mx-auto mb-6" />

        <h1 className="text-white font-bold mb-3 whitespace-nowrap" style={{ fontSize: "clamp(1.9rem,6vw,2.6rem)" }}>Thank you!</h1>
        <p className="text-white/70 text-base leading-relaxed mb-8">
          Our team will reach out to you soon.
        </p>

        <div className="flex flex-col gap-3">
          <button onClick={() => navigate("/contact-us")}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: PINK }}>
            Connect with us
          </button>

          {/* "Our message to you" dropdown */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.14)" }}>
            <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white"
              style={{ background: "rgba(255,255,255,0.04)" }}
              aria-expanded={open}>
              <Heart className="w-4 h-4" style={{ color: PINK }} />
              Our message to you
              <ChevronDown className="w-4 h-4 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
            </button>
            <div style={{
              display: "grid",
              gridTemplateRows: open ? "1fr" : "0fr",
              transition: "grid-template-rows 0.3s ease",
            }}>
              <div style={{ overflow: "hidden" }}>
                <p className="text-white/70 text-[13px] leading-relaxed text-left px-4 py-4"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  {message}
                </p>
              </div>
            </div>
          </div>

          <button onClick={() => navigate("/home-brand")}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)" }}>
            Back to Homepage
          </button>
        </div>
      </div>
    </div>
  );
}
