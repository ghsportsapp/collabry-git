import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Check, Crown, BadgeCheck, CalendarClock } from "lucide-react";
import { WHITE_GLOVE_DEFAULT, gstInclusiveTotal, type WhiteGlove, type Plan } from "./whiteGloveContent";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { BrandLayout } from "@/components/BrandLayout";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const PINK = "#E14F69";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const perMonth = (p: Plan) => (p.months > 0 ? p.price / p.months : p.price);
const perMonthLabel = (p: Plan) => {
  const exact = p.months > 0 && p.price % p.months === 0;
  const unit = `${p.months} ${p.months === 1 ? "month" : "months"}`;
  return `${exact ? "" : "≈ "}${inr(perMonth(p))} / month · ${unit}`;
};
const savePct = (p: Plan) => (p.mrp > 0 && p.price <= p.mrp ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0);
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const resolveImg = (u: string) => (u ? (/^(https?:|data:)/.test(u) ? u : `${BASE_URL}${u}`) : "");

interface Membership { active: boolean; planName?: string; purchasedAt?: string; expiresAt?: string }

export default function WhiteGloveService() {
  // Start from built-in defaults so the page renders immediately — it never waits
  // on the network and can never hang on a spinner. The fetch only *upgrades* content.
  const [data, setData] = useState<WhiteGlove>(WHITE_GLOVE_DEFAULT);
  const [, navigate] = useLocation();
  const { brandId, brandName, apiFetch, loading: authLoading } = useBrandAuth();
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);

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

  // Brand-only page: send logged-out visitors to brand login (and bring them back).
  // This is an edge case — the page is normally reached from the brand header nav.
  useEffect(() => {
    if (!authLoading && !brandId) {
      navigate(`/login-brand?next=${encodeURIComponent("/white-glove-service")}`);
    }
  }, [authLoading, brandId, navigate]);

  // Returning-member check. Any failure or uncertainty leaves membership null →
  // the normal pricing cards render (never block a buyer).
  useEffect(() => {
    if (authLoading) return;
    if (!brandId) { setMembership({ active: false }); return; }
    let alive = true;
    apiFetch("/api/brand/white-glove/my-membership")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m: Membership) => { if (alive) setMembership(m && typeof m === "object" ? m : { active: false }); })
      .catch(() => { if (alive) setMembership({ active: false }); });
    return () => { alive = false; };
  }, [brandId, authLoading, apiFetch]);

  const selectPlan = async (plan: Plan) => {
    if (payingPlanId || authLoading) return;
    // Brand-only purchase — send logged-out visitors to login and bring them back here.
    if (!brandId) { navigate(`/login-brand?next=${encodeURIComponent("/white-glove-service")}`); return; }
    setPayingPlanId(plan.id);
    setMsg(null);
    try {
      // 1) Create the Razorpay order server-side (price comes from the saved plan config).
      const r = await apiFetch("/api/brand/white-glove/create-order", { method: "POST", body: JSON.stringify({ planId: plan.id }) });
      const d = await r.json();
      if (!r.ok) { setMsg(d.message ?? d.error ?? "Failed to start payment"); setPayingPlanId(null); return; }
      // 2) Open the hosted checkout modal.
      const opened = await openRazorpayCheckout({
        key: d.key,
        orderId: d.orderId,
        amount: d.amount,
        currency: d.currency,
        description: `White Glove · ${d.planName ?? plan.name}`,
        prefill: brandName ? { name: brandName } : undefined,
        onSuccess: async (resp) => {
          // 3) Verify the signature server-side, which records the purchase.
          try {
            const vr = await apiFetch("/api/brand/white-glove/verify-payment", {
              method: "POST",
              body: JSON.stringify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              }),
            });
            const vd = await vr.json();
            if (vr.ok && vd.ok) navigate("/white-glove-service/thank-you");
            else { setMsg(vd.error ?? "Payment verification failed. If money was deducted, our team will confirm shortly."); setPayingPlanId(null); }
          } catch (err: any) {
            setMsg(err?.message ?? "Could not verify payment. If money was deducted, our team will confirm shortly.");
            setPayingPlanId(null);
          }
        },
        onDismiss: () => setPayingPlanId(null),
        onFailure: (message) => { setMsg(message); setPayingPlanId(null); },
      });
      if (!opened) { setMsg("Could not load the payment gateway. Check your connection and try again."); setPayingPlanId(null); }
    } catch (e: any) {
      setMsg(e?.message ?? "Payment failed");
      setPayingPlanId(null);
    }
  };

  const isMember = !!brandId && !!membership?.active;

  // While auth resolves, or for a logged-out visitor mid-redirect, render nothing
  // rather than flashing the brand header with an empty credits pill.
  if (authLoading || !brandId) return null;

  return (
    <BrandLayout>
      {/* ── Hero ── */}
      <section className="px-6 pt-14 pb-14 text-center">
        <div className="max-w-[820px] mx-auto">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-7"
            style={{ background: "rgba(225,79,105,0.12)", border: "1px solid rgba(225,79,105,0.35)", color: PINK }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: PINK }} /> {data.heroTag}
          </span>
          {/* Sized to keep each sentence on a single line down to 360px (no wrapping). */}
          <h1 className="font-bold leading-tight mb-5" style={{ fontSize: "clamp(1.05rem, 4.6vw, 2.8rem)" }}>
            <span className="text-white block whitespace-nowrap">{data.heroLine1}</span>
            <span className="block whitespace-nowrap" style={{ color: PINK }}>{data.heroLine2}</span>
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

      {/* ── Member card (active members) OR Pricing (everyone else) ── */}
      {isMember ? (
        <section className="px-6 py-16">
          <div className="max-w-[680px] mx-auto rounded-3xl p-8 sm:p-10 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(225,79,105,0.22) 0%, rgba(140,30,60,0.16) 55%, rgba(40,10,25,0.20) 100%)",
              border: "1px solid rgba(225,79,105,0.45)",
              boxShadow: "0 0 60px rgba(225,79,105,0.14)",
            }}>
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(225,79,105,0.28) 0%, transparent 70%)" }} />
            <div className="relative">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold mb-5"
                style={{ background: "rgba(225,79,105,0.2)", border: "1px solid rgba(225,79,105,0.45)", color: PINK }}>
                <Crown className="w-3.5 h-3.5" /> White Glove membership
              </span>
              <div className="flex items-start gap-3 mb-2">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: PINK, boxShadow: "0 6px 20px rgba(225,79,105,0.45)" }}>
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-white font-bold leading-tight" style={{ fontSize: "clamp(1.4rem,3vw,2rem)" }}>
                  {data.memberHeading}
                </h2>
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-7 max-w-[520px]">{data.memberSubtext}</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <p className="text-white/50 text-[11px] mb-1">Plan</p>
                  <p className="text-white font-bold text-sm">{membership?.planName ?? "—"}</p>
                </div>
                <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <p className="text-white/50 text-[11px] mb-1">Purchased</p>
                  <p className="text-white font-bold text-sm">{fmtDate(membership?.purchasedAt)}</p>
                </div>
                <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <p className="text-white/50 text-[11px] mb-1 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Expires</p>
                  <p className="text-white font-bold text-sm">{fmtDate(membership?.expiresAt)}</p>
                </div>
              </div>

              <div className="mt-5 inline-flex items-center gap-2 px-3.5 py-2 rounded-full"
                style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.3)" }}>
                <BadgeCheck className="w-4 h-4" style={{ color: "#34d399" }} />
                <span className="text-[13px] font-semibold" style={{ color: "#34d399" }}>Status: Active</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
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
                const label = plan.buttonLabel?.trim() || (highlight ? `Choose ${plan.name}` : "Get started");
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
                      {data.gstRatePercent > 0 && <span className="text-white/50 text-xs mb-1.5">+ GST</span>}
                    </div>
                    <p className={`text-white/50 text-xs ${data.gstRatePercent > 0 ? "" : "mb-4"}`}>{perMonthLabel(plan)}</p>
                    {data.gstRatePercent > 0 && (
                      <p className="text-white/45 text-[11px] mt-1 mb-4">
                        {inr(gstInclusiveTotal(plan.price, data.gstRatePercent))} total incl. {data.gstRatePercent}% GST
                      </p>
                    )}

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

                    <button onClick={() => selectPlan(plan)} disabled={!!payingPlanId}
                      className="mt-auto w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={highlight
                        ? { background: PINK, color: "#fff", boxShadow: "0 6px 20px rgba(225,79,105,0.4)" }
                        : { background: "rgba(255,255,255,0.04)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                      {payingPlanId === plan.id ? "Processing…" : label}
                    </button>
                  </div>
                );
              })}
            </div>

            {msg && (
              <p className="text-center text-sm mt-8" style={{ color: "#f87171" }}>{msg}</p>
            )}

            {data.pricingNote && (
              <p className="text-center text-white/45 text-xs mt-10">{data.pricingNote}</p>
            )}
          </div>
        </section>
      )}

      {/* ── From Founder to Founder ── */}
      {data.founders.length > 0 && (
        <section className="px-6 py-16" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="max-w-[920px] mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-white font-bold leading-tight mb-2" style={{ fontSize: "clamp(1.5rem,3.2vw,2.2rem)" }}>
                {data.founderHeading}
              </h2>
              <p className="text-white/60 text-sm sm:text-base" style={{ color: PINK }}>{data.founderSubheading}</p>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:gap-8 max-w-[640px] mx-auto">
              {data.founders.map((f, i) => {
                const src = resolveImg(f.image);
                return (
                  <div key={i} className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden flex items-center justify-center mb-3"
                      style={{ background: "rgba(225,79,105,0.15)", border: "2px solid rgba(225,79,105,0.4)" }}>
                      {src ? (
                        <img src={src} alt={f.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-bold text-2xl sm:text-3xl" style={{ color: PINK }}>
                          {(f.name || "?").trim()[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-white font-semibold text-sm sm:text-base leading-tight">{f.name}</p>
                    <p className="text-white/55 text-[11px] sm:text-xs mt-0.5">{f.designation}</p>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-white/40 text-xs mt-12">{data.footerNote}</p>
          </div>
        </section>
      )}
    </BrandLayout>
  );
}
