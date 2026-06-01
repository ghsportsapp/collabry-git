import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { jsPDF } from "jspdf";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { CreatorLayout, PINK, POPPINS } from "@/components/CreatorNavLayout";

function downloadInvoicePdf(imageUrl: string, filename: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;
  img.onload = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    (pdf as any).addImage(img, "JPEG", 0, 0, 210, 297);
    pdf.save(filename);
  };
}

interface Txn {
  id: string;
  orderId: string | null;
  dealName: string;
  source: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  amount: number;
  originalAmount: number;
  date: string;
  status: string;
  payoutStatus: string;
  adjustmentReason: string | null;
  invoiceUrl: string | null;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sourceLabel(source: string) {
  if (source === "CAMPAIGN") return "Campaign";
  if (source === "BARTER") return "Barter";
  return "Direct";
}

export default function CreatorEarningsHistory() {
  const { apiFetch, accessToken, loading } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [totals, setTotals] = useState<{ paid: number; pending: number }>({ paid: 0, pending: 0 });
  const [loadingTxns, setLoadingTxns] = useState(true);

  useEffect(() => {
    if (!loading && !accessToken) { navigate("/login-creator"); return; }
    if (!loading && accessToken) {
      apiFetch("/api/creator/earnings/history")
        .then(r => r.json())
        .then((d: { transactions: Txn[]; totalPaid: number; totalPending: number }) => {
          setTxns(d.transactions ?? []);
          setTotals({ paid: d.totalPaid ?? 0, pending: d.totalPending ?? 0 });
        })
        .finally(() => setLoadingTxns(false));
    }
  }, [loading, accessToken]);

  return (
    <CreatorLayout status="ACTIVE" onLocked={() => {}}>
      <div className="space-y-4 lg:space-y-6 pt-4 lg:pt-8 pb-8">
        {/* Header */}
        <div className="mx-4 lg:mx-0 flex items-center gap-3">
          <button onClick={() => navigate("/home-creator")}
            className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            aria-label="Back">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <h1 className="text-white text-xl lg:text-2xl font-bold leading-tight" style={{ fontFamily: POPPINS }}>Earnings History</h1>
            <p className="text-white/70 text-xs lg:text-sm" style={{ fontFamily: POPPINS }}>All your deal payouts in one place</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="mx-4 lg:mx-0 grid grid-cols-2 gap-3 lg:gap-5">
          <div className="rounded-2xl p-4 lg:p-5" style={{ background: PINK }}>
            <p className="text-white/85 text-xs lg:text-sm mb-1" style={{ fontFamily: POPPINS }}>Total Paid</p>
            <p className="text-white text-xl lg:text-3xl font-bold" style={{ fontFamily: POPPINS }}>
              ₹{totals.paid.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="rounded-2xl p-4 lg:p-5"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/75 text-xs lg:text-sm mb-1" style={{ fontFamily: POPPINS }}>In Escrow</p>
            <p className="text-white text-xl lg:text-3xl font-bold" style={{ fontFamily: POPPINS }}>
              ₹{totals.pending.toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        {/* Transactions */}
        <div className="mx-4 lg:mx-0">
          <h2 className="text-white font-semibold text-sm lg:text-base mb-3 lg:mb-4" style={{ fontFamily: POPPINS }}>Transactions</h2>

          {loadingTxns ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-16 lg:h-20 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
              ))}
            </div>
          ) : txns.length === 0 ? (
            <div className="rounded-2xl p-8 lg:p-12 text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-white font-semibold text-sm lg:text-base mb-1" style={{ fontFamily: POPPINS }}>No transactions yet</p>
              <p className="text-white/70 text-xs lg:text-sm" style={{ fontFamily: POPPINS }}>
                Your deal payouts will appear here once a deal is active.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block rounded-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-white/70 text-xs uppercase tracking-wider"
                      style={{ background: "rgba(255,255,255,0.03)", fontFamily: POPPINS }}>
                      <th className="px-5 py-3 font-medium">Deal</th>
                      <th className="px-5 py-3 font-medium">Brand</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium text-right">Amount</th>
                      <th className="px-5 py-3 font-medium text-center">Status</th>
                      <th className="px-5 py-3 font-medium text-center">Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t, i) => {
                      const hasDeduction = t.status === "Paid" && t.originalAmount > 0 && Math.abs(t.amount - t.originalAmount) > 0.5;
                      return (
                        <>
                          <tr key={t.id} className="text-sm" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)", fontFamily: POPPINS }}>
                            <td className="px-5 py-4 max-w-[200px]">
                              <p className="text-white truncate">{t.dealName}</p>
                              {t.orderId && <p className="text-white/40 font-mono text-[10px]">{t.orderId}</p>}
                            </td>
                            <td className="px-5 py-4 text-white/75">
                              <div className="flex items-center gap-2">
                                {t.brandLogoUrl
                                  ? <img src={t.brandLogoUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                                  : <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                      style={{ background: PINK }}>{t.brandName?.[0] ?? "B"}</div>}
                                {t.brandName ?? "—"}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <TypeBadge source={t.source} />
                            </td>
                            <td className="px-5 py-4 text-white/85">{formatDate(t.date)}</td>
                            <td className="px-5 py-4 text-right">
                              <span className="text-white font-semibold">₹{t.amount.toLocaleString("en-IN")}</span>
                              {hasDeduction && (
                                <p className="text-white/70 text-[10px] line-through">₹{t.originalAmount.toLocaleString("en-IN")}</p>
                              )}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <StatusPill status={t.status} />
                            </td>
                            <td className="px-5 py-4 text-center">
                              {t.invoiceUrl ? (
                                <button type="button"
                                  onClick={() => downloadInvoicePdf(t.invoiceUrl!, `Collabry-Payout-${t.orderId ?? t.id.slice(0, 8).toUpperCase()}.pdf`)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                                  style={{ background: "rgba(240,24,122,0.12)", color: PINK, border: "1px solid rgba(240,24,122,0.25)" }}>
                                  ⬇ Download PDF
                                </button>
                              ) : (
                                <span className="text-white/30 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                          {hasDeduction && t.adjustmentReason && (
                            <tr key={`${t.id}-note`} style={{ borderTop: "none", background: "rgba(245,158,11,0.04)", fontFamily: POPPINS }}>
                              <td colSpan={7} className="px-5 pb-3 pt-0">
                                <p className="text-amber-400/70 text-[11px] italic">
                                  Adjustment note: {t.adjustmentReason}
                                </p>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden space-y-2">
                {txns.map(t => {
                  const hasDeduction = t.status === "Paid" && t.originalAmount > 0 && Math.abs(t.amount - t.originalAmount) > 0.5;
                  return (
                    <div key={t.id} className="rounded-xl p-3.5"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <TypeBadge source={t.source} />
                          </div>
                          <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>
                            {t.dealName}
                          </p>
                          <p className="text-white/75 text-xs mt-0.5 truncate" style={{ fontFamily: POPPINS }}>
                            {t.brandName ?? "—"} • {formatDate(t.date)}
                          </p>
                          {t.orderId && (
                            <p className="text-white/35 font-mono text-[10px] mt-0.5">{t.orderId}</p>
                          )}
                        </div>
                        <StatusPill status={t.status} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>
                            ₹{t.amount.toLocaleString("en-IN")}
                          </span>
                          {hasDeduction && (
                            <span className="text-white/70 text-xs line-through" style={{ fontFamily: POPPINS }}>
                              ₹{t.originalAmount.toLocaleString("en-IN")}
                            </span>
                          )}
                        </div>
                        {t.invoiceUrl && (
                          <button type="button"
                            onClick={() => downloadInvoicePdf(t.invoiceUrl!, `Collabry-Payout-${t.orderId ?? t.id.slice(0, 8).toUpperCase()}.pdf`)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ background: "rgba(240,24,122,0.12)", color: PINK, border: "1px solid rgba(240,24,122,0.25)" }}>
                            ⬇ PDF
                          </button>
                        )}
                      </div>
                      {hasDeduction && t.adjustmentReason && (
                        <p className="text-amber-400/65 text-[11px] italic mt-1.5" style={{ fontFamily: POPPINS }}>
                          {t.adjustmentReason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </CreatorLayout>
  );
}

function TypeBadge({ source }: { source: string }) {
  const label = sourceLabel(source);
  const colors: Record<string, { bg: string; color: string }> = {
    Campaign: { bg: "rgba(99,102,241,0.18)", color: "#a5b4fc" },
    Barter:   { bg: "rgba(234,179,8,0.15)",  color: "#fde68a" },
    Direct:   { bg: "rgba(20,184,166,0.15)", color: "#5eead4" },
  };
  const c = colors[label] ?? colors.Direct;
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: c.bg, color: c.color, fontFamily: POPPINS }}>
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    "Paid":        { bg: "rgba(34,197,94,0.15)",   color: "#86efac" },
    "In Escrow":   { bg: "rgba(59,130,246,0.18)",  color: "#93c5fd" },
    "KYC Pending": { bg: "rgba(249,115,22,0.18)",  color: "#fdba74" },
    "Pending":     { bg: "rgba(245,158,11,0.18)",  color: "#fcd34d" },
  };
  const s = map[status] ?? map["Pending"];
  return (
    <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: s.bg, color: s.color, fontFamily: POPPINS }}>
      {status}
    </span>
  );
}
