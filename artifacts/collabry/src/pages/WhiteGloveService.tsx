import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Check } from "lucide-react";
import { WHITE_GLOVE_DEFAULT, type WhiteGlove, type Plan } from "./whiteGloveContent";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BG = "#0A0A0F";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const perMonth = (p: Plan) => (p.months > 0 ? p.price / p.months : p.price);
const perMonthLabel = (p: Plan) => {
  const exact = p.months > 0 && p.price % p.months === 0;
  const unit = `${p.months} ${p.months === 1 ? "month" : "months"}`;
  return `${exact ? "" : "≈ "}${inr(perMonth(p))} / month · ${unit}`;
};
const savePct = (p: Plan) => (p.mrp > 0 && p.price <= p.mrp ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0);

export default function WhiteGloveService() {
  // Start from built-in defaults so the page renders immediately — it never waits
  // on the network and can never hang on a spinner. The fetch only *upgrades* content.
  const [data, setData] = useState<WhiteGlove>(WHITE_GLOVE_DEFAULT);
  const [, navigate] = useLocation();

  useEffect(() => {
    let alive = true;
    fetch(`${BASE_URL}/api/white-glove`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Partial<WhiteGlove>) => {
        if (!alive || !d || typeof d !== "object") return;
        // Merge over defaults so a partial/short payload never blanks the page.
        setData({ ...WHITE_GLOVE_DEFAULT, ...d });
      })
      .catch(() => { /* keep defaults — never hang, never blank */ });
    return () => { alive = false; };
  }, []);

  // Razorpay will slot in here later — for now every plan goes to the thank-you page.
  const selectPlan = (_plan: Plan) => navigate("/white-glove-service/thank-you");

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: POPPINS }}>
      {/* Minimal top bar — logo only (site header intentionally untouched) */}
      <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="max-w-[1120px] mx-auto">
          <Link href="/">
            <span className="text-2xl cursor-pointer" style={{ fontFamily: "'Macondo Swash Caps', cursive", color: PINK }}>Collabry</span>
          </Link>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="px-6 pt-16 pb-14 text-center">
        <div className="max-w-[820px] mx-auto">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-7"
            style={{ background: "rgba(225,79,105,0.12)", border: "1px solid rgba(225,79,105,0.35)", color: PINK }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: PINK }} /> {data.heroTag}
          </span>
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: "clamp(2rem,5vw,3.25rem)" }}>
            <span className="text-white block">{data.heroLine1}</span>
            <span className="block" style={{ color: PINK }}>{data.heroLine2}</span>
          </h1>
          <p className="text-white/70 text-base sm:text-lg leading-relaxed max-w-[640px] mx-auto">{data.heroSub}</p>
        </div>
      </section>

      {/* ── Included ── */}
      <section className="px-6 py-14" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-bold leading-tight mb-3" style={{ fontSize: "clamp(1.6rem,3.5vw,2.4rem)" }}>
              <span className="text-white block">{data.includedLine1}</span>
              <span className="block" style={{ color: PINK }}>{data.includedLine2}</span>
            </h2>
            <p className="text-white/65 text-sm sm:text-base max-w-[600px] mx-auto">{data.includedSub}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-9 max-w-[920px] mx-auto">
            {data.points.map((pt, i) => (
              <div key={i} className="flex items-start gap-3.5">
                <span className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5"
                  style={{ background: "rgba(225,79,105,0.15)" }}>
                  <Check className="w-3.5 h-3.5" style={{ color: PINK }} strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className="text-white font-semibold text-[15px] mb-1">{pt.title}</p>
                  <p className="text-white/55 text-[13px] leading-relaxed">{pt.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="px-6 py-16">
        <div className="max-w-[1120px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-bold leading-tight" style={{ fontSize: "clamp(1.6rem,3.5vw,2.4rem)" }}>
              <span className="text-white block">{data.pricingLine1}</span>
              <span className="block" style={{ color: PINK }}>{data.pricingLine2}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[980px] mx-auto items-stretch">
            {data.plans.map((plan) => {
              const highlight = !!plan.badge;
              const pct = savePct(plan);
              return (
                <div key={plan.id} className="relative rounded-2xl p-6 flex flex-col"
                  style={{
                    background: highlight ? "rgba(225,79,105,0.06)" : "rgba(255,255,255,0.035)",
                    border: `1px solid ${highlight ? "rgba(225,79,105,0.55)" : "rgba(255,255,255,0.09)"}`,
                    boxShadow: highlight ? "0 0 32px rgba(225,79,105,0.18), 0 0 0 1px rgba(225,79,105,0.25)" : "none",
                  }}>
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-semibold text-white whitespace-nowrap"
                      style={{ background: PINK, boxShadow: "0 4px 14px rgba(225,79,105,0.5)" }}>
                      {plan.badge}
                    </span>
                  )}

                  <div className="mb-5">
                    <p className="text-white font-bold text-xl mb-2">{plan.name}</p>
                    <p className="text-white/55 text-[13px] leading-relaxed min-h-[40px]">{plan.desc}</p>
                  </div>

                  <div className="mb-1 flex items-end gap-2.5">
                    {plan.mrp > plan.price && (
                      <span className="text-white/35 line-through text-base mb-1">{inr(plan.mrp)}</span>
                    )}
                    <span className="text-white font-bold leading-none" style={{ fontSize: "2.25rem" }}>{inr(plan.price)}</span>
                  </div>
                  <p className="text-white/50 text-xs mb-4">{perMonthLabel(plan)}</p>

                  {pct > 0 && (
                    <div className="w-full rounded-lg px-3 py-2 mb-5"
                      style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
                      <span className="text-[13px] font-semibold" style={{ color: "#34d399" }}>Save {pct}%</span>
                    </div>
                  )}

                  {plan.perks.length > 0 && (
                    <div className="space-y-2.5 mb-6">
                      {plan.perks.map((perk, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: PINK }} strokeWidth={3} />
                          <span className="text-white/70 text-[13px] leading-relaxed">{perk}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => selectPlan(plan)}
                    className="mt-auto w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                    style={highlight
                      ? { background: PINK, color: "#fff", boxShadow: "0 6px 20px rgba(225,79,105,0.4)" }
                      : { background: "rgba(255,255,255,0.04)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                    {highlight ? `Choose ${plan.name}` : "Get started"}
                  </button>
                </div>
              );
            })}
          </div>

          {data.pricingNote && (
            <p className="text-center text-white/45 text-xs mt-10">{data.pricingNote}</p>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 py-10 border-t flex flex-col sm:flex-row items-center justify-between gap-3 max-w-[1120px] mx-auto"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <span className="text-2xl" style={{ fontFamily: "'Macondo Swash Caps', cursive", color: PINK }}>Collabry</span>
        <p className="text-white/50 text-xs">{data.footerNote}</p>
      </footer>
    </div>
  );
}
