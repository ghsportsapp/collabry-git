import { Gift, X, Sparkles } from "lucide-react";
import { POPPINS, PINK } from "@/components/BrandLayout";
import { useFirstDealOffer } from "@/hooks/useFirstDealOffer";

function fmtINR(n: number): string {
  return "₹" + (isNaN(n) ? 0 : n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const GRADIENT = "linear-gradient(135deg, rgba(240,24,122,0.22) 0%, rgba(180,0,100,0.14) 50%, rgba(60,0,80,0.18) 100%)";

/**
 * On-page offer surface for the first-deal discount. Renders NOTHING unless the
 * live-derived endpoint says the brand is eligible, so it disappears once a direct
 * deal is live/accepted and reappears automatically on rejection/expiry. The % is
 * always read from the endpoint.
 *
 *   variant="notification" → compact alert row (brand home, the "in-app notification")
 *   variant="banner"       → full gradient section (brand home)
 *   variant="strip"        → slim full-width strip (search page / creator profile top)
 */
export function FirstDealOfferBanner({ variant = "strip", className = "" }: {
  variant?: "notification" | "banner" | "strip";
  className?: string;
}) {
  const { eligible, percent } = useFirstDealOffer();
  if (!eligible || percent <= 0) return null;

  const headline = `Get ${percent}% off on your first deal`;

  if (variant === "strip") {
    return (
      <div className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 ${className}`}
        style={{ background: GRADIENT, border: "1px solid rgba(240,24,122,0.38)", fontFamily: POPPINS }}>
        <Gift className="w-4 h-4 flex-shrink-0" style={{ color: PINK }} />
        <p className="text-white text-xs sm:text-sm font-semibold leading-snug">
          {headline} <span className="text-white/75 font-normal">— we reduce our fee, your creator is still paid in full.</span>
        </p>
      </div>
    );
  }

  if (variant === "notification") {
    return (
      <div className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 ${className}`}
        style={{ background: GRADIENT, border: "1px solid rgba(240,24,122,0.38)", fontFamily: POPPINS }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "rgba(240,24,122,0.2)", border: "1px solid rgba(240,24,122,0.4)" }}>
          <Gift className="w-4 h-4" style={{ color: PINK }} />
        </div>
        <div className="min-w-0">
          <p className="text-white font-bold text-sm leading-snug">
            {headline} <span aria-hidden>🎉</span>
          </p>
          <p className="text-white/80 text-xs mt-0.5 leading-relaxed">
            Your first direct deal gets an automatic {percent}% off. The creator still receives their full payment — we simply take less for ourselves.
          </p>
        </div>
      </div>
    );
  }

  // variant === "banner"
  return (
    <div className={`relative rounded-2xl px-4 py-4 overflow-hidden ${className}`}
      style={{ background: GRADIENT, border: "1px solid rgba(240,24,122,0.38)", boxShadow: "0 0 40px rgba(240,24,122,0.08)", fontFamily: POPPINS }}>
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(240,24,122,0.2) 0%, transparent 70%)" }} />
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "rgba(240,24,122,0.2)", border: "1px solid rgba(240,24,122,0.4)" }}>
          <Gift className="w-4 h-4" style={{ color: PINK }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-snug">
            {headline} <span style={{ color: PINK }}>({percent}% off)</span>
          </p>
          <p className="text-white/80 text-xs mt-0.5 leading-relaxed">
            Send your first direct deal and we'll apply {percent}% off automatically. Your creator is paid in full — Collabry absorbs the discount.
          </p>
        </div>
      </div>
    </div>
  );
}

export interface FirstDealDiscountInfo {
  percent: number;
  subtotal: number;
  discountAmount: number;
  discountedBase: number;
  estGst: number;
  estTotal: number;
}

/**
 * Fired ONLY when the send response carried firstDealDiscount != null. All figures
 * come straight from that response — nothing is recomputed here. GST (and therefore
 * the final total) is labelled "estimated" because the authoritative GST is locked
 * at payment.
 */
export function FirstDealDiscountPopup({ info, onClose }: {
  info: FirstDealDiscountInfo;
  onClose: () => void;
}) {
  const row = (label: string, value: string, opts?: { strong?: boolean; accent?: boolean; muted?: boolean }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-xs ${opts?.muted ? "text-white/55" : "text-white/80"}`} style={{ fontFamily: POPPINS }}>{label}</span>
      <span className={`${opts?.strong ? "text-base font-bold" : "text-sm font-semibold"}`}
        style={{ fontFamily: POPPINS, color: opts?.accent ? PINK : "#fff" }}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl p-5"
        style={{ background: "#15151D", border: "1px solid rgba(240,24,122,0.35)", boxShadow: "0 0 50px rgba(240,24,122,0.12)", fontFamily: POPPINS }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(240,24,122,0.18)", border: "1px solid rgba(240,24,122,0.4)" }}>
              <Sparkles className="w-5 h-5" style={{ color: PINK }} />
            </div>
            <h3 className="text-white font-bold text-base leading-tight">
              This was your first deal —<br />you get {info.percent}% off <span aria-hidden>🎉</span>
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-white/70" /></button>
        </div>

        <p className="text-white/70 text-xs mb-3 leading-relaxed">
          We've applied your first-order discount to this deal. Your creator still receives their full payment — Collabry takes less for itself.
        </p>

        <div className="rounded-xl px-3.5 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {row("Original (pre-GST)", fmtINR(info.subtotal))}
          {row(`First-order discount (${info.percent}%)`, `−${fmtINR(info.discountAmount)}`, { accent: true })}
          {row("Subtotal after discount", fmtINR(info.discountedBase))}
          {row("GST (estimated)", `+${fmtINR(info.estGst)}`, { muted: true })}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }} className="mt-1 pt-1">
            {row("Final (estimated)", fmtINR(info.estTotal), { strong: true, accent: true })}
          </div>
        </div>

        <p className="text-white/45 text-[10px] mt-2 leading-relaxed">
          GST and the final total are estimated — the exact GST is locked when you pay. The creator's payout is unaffected.
        </p>

        <button onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-full text-white font-semibold text-sm"
          style={{ background: PINK, fontFamily: POPPINS }}>
          Got it
        </button>
      </div>
    </div>
  );
}
