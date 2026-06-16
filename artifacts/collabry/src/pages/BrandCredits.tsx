import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Coins, Clock, Gift } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { openRazorpayCheckout } from "@/lib/razorpay";

interface Tx { id: string; type: string; amount: number; balanceAfter: number; createdAt: string; adminReason: string | null; expiresAt: string | null; }

const DEFAULT_PRICE_PER_CREDIT: number | null = null;
const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  FREE_SIGNUP: { label: "Free Signup", color: "#22c55e" },
  PURCHASED: { label: "Purchased", color: "#3b82f6" },
  ADMIN_GIFT: { label: "Admin Gift", color: "#a855f7" },
  ADMIN_ADD: { label: "Admin Add", color: "#a855f7" },
  UNLOCK_SEARCH: { label: "Profile Unlock", color: "#ef4444" },
  EXPIRY: { label: "Expired", color: "#6b7280" },
};

export default function BrandCredits() {
  const { brandId, brandName, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const { credits, refetch: refetchCredits } = useBrandCredits();
  const [pricePerCredit, setPricePerCredit] = useState<number | null>(DEFAULT_PRICE_PER_CREDIT);
  const [gstRate, setGstRate] = useState<number>(18);
  const [qty, setQty] = useState(10);
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { if (!authLoading && !brandId) navigate("/login-brand"); }, [brandId, authLoading, navigate]);

  const loadBalance = useCallback(() => { refetchCredits(); }, [refetchCredits]);

  useEffect(() => {
    let cancelled = false;
    const fetchPrice = () => {
      apiFetch("/api/credits/price").then(async r => {
        if (cancelled || !r.ok) return;
        const d = await r.json();
        if (typeof d.pricePerCredit === "number" && d.pricePerCredit > 0) setPricePerCredit(d.pricePerCredit);
        if (typeof d.gstRate === "number" && d.gstRate >= 0) setGstRate(d.gstRate);
      }).catch(() => {});
    };
    fetchPrice();
    const id = window.setInterval(fetchPrice, 20_000);
    const onFocus = () => fetchPrice();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [apiFetch]);

  useEffect(() => {
    if (!brandId) return;
    apiFetch(`/api/brand/credits/transactions?page=${page}&limit=20`).then(async r => {
      if (r.ok) {
        const d = await r.json();
        setTxs(d.transactions);
        setTotalPages(d.totalPages);
      }
    });
  }, [brandId, page, apiFetch]);

  const handleBuy = async () => {
    if (qty < 1) return;
    setBuying(true);
    setMsg(null);
    try {
      // 1) Create the Razorpay order server-side (amount + GST computed there).
      const r = await apiFetch("/api/brand/credits/create-order", { method: "POST", body: JSON.stringify({ quantity: qty }) });
      const d = await r.json();
      if (!r.ok) {
        setMsg(d.message ?? d.error ?? "Failed to start payment");
        setBuying(false);
        return;
      }
      // 2) Open the hosted checkout modal.
      const opened = await openRazorpayCheckout({
        key: d.key,
        orderId: d.orderId,
        amount: d.amount,
        currency: d.currency,
        description: `${qty} credit${qty > 1 ? "s" : ""}`,
        prefill: brandName ? { name: brandName } : undefined,
        onSuccess: async (resp) => {
          // 3) Verify the signature server-side, which credits the account.
          try {
            const vr = await apiFetch("/api/brand/credits/verify-payment", {
              method: "POST",
              body: JSON.stringify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              }),
            });
            const vd = await vr.json();
            if (vr.ok && vd.ok) {
              const params = new URLSearchParams({
                status: "CHARGED",
                context: "credits",
                orderId: vd.orderId ?? d.orderId,
                amount: String(vd.amountInr ?? d.amountInr ?? ""),
              });
              navigate(`/payment-return?${params.toString()}`);
            } else {
              setMsg(vd.error ?? "Payment verification failed. If money was deducted it will reflect shortly.");
              setBuying(false);
            }
          } catch (err: any) {
            setMsg(err?.message ?? "Could not verify payment. If money was deducted it will reflect shortly.");
            setBuying(false);
          }
        },
        onDismiss: () => setBuying(false),
        onFailure: (message) => { setMsg(message); setBuying(false); },
      });
      if (!opened) {
        setMsg("Could not load the payment gateway. Check your connection and try again.");
        setBuying(false);
      }
    } catch (e: any) {
      setMsg(e.message ?? "Payment failed");
      setBuying(false);
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const daysUntil = (d: string | null) => d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)) : null;

  const lowestExpiry: string | null = (() => {
    const batches = (credits?.freeBatches ?? []).filter(b => b.expiresAt);
    if (!batches.length) return null;
    return batches.sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime())[0].expiresAt;
  })();
  const lowestDays = daysUntil(lowestExpiry);

  if (authLoading || !brandId) return null;

  return (
    <BrandLayout credits={credits?.total ?? null}>
      <div className="max-w-3xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-5 lg:pt-6 pb-2">
        <h1 className="text-white text-xl font-bold mb-4" style={{ fontFamily: POPPINS }}>Your Credits</h1>

        {/* Balance — two frames side-by-side: Free (left) + Purchased (right) */}
        <section className="rounded-2xl p-4 mb-5" style={{ background: "#4F0E30" }}>
          <div className="flex items-center gap-2 mb-3">
            <Coins className="w-4 h-4 text-white" />
            <h3 className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Balance</h3>
            <span className="ml-auto text-white/80 text-[11px]" style={{ fontFamily: POPPINS }}>Total: {credits?.total ?? "–"}</span>
          </div>
          {credits === null ? (
            <div className="h-32 rounded-xl animate-pulse" style={{ background: "rgba(0,0,0,0.06)" }} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* LEFT — Free credits */}
              <div className="rounded-xl p-4 flex flex-col" style={{ background: "rgba(255,255,255,0.80)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Gift className="w-3.5 h-3.5" style={{ color: PINK }} />
                  <p className="text-[11px] font-semibold text-black/70" style={{ fontFamily: POPPINS }}>Free Credits</p>
                </div>
                <p className="text-3xl font-bold text-black leading-none mt-0.5" style={{ fontFamily: POPPINS }}>{credits.free}</p>
                {lowestDays !== null ? (
                  <p className="text-[11px] mt-2 font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>
                    Expires in {lowestDays} day{lowestDays === 1 ? "" : "s"}
                  </p>
                ) : credits.free > 0 ? (
                  <p className="text-[11px] text-black/55 mt-2 font-medium" style={{ fontFamily: POPPINS }}>No expiry</p>
                ) : (
                  <p className="text-[11px] text-black/45 mt-2" style={{ fontFamily: POPPINS }}>No free credits</p>
                )}
              </div>

              {/* RIGHT — Purchased credits */}
              <div className="rounded-xl p-4 flex flex-col" style={{ background: "rgba(255,255,255,0.80)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Coins className="w-3.5 h-3.5" style={{ color: PINK }} />
                  <p className="text-[11px] font-semibold text-black/70" style={{ fontFamily: POPPINS }}>Purchased Credits</p>
                </div>
                <p className="text-3xl font-bold text-black leading-none mt-0.5" style={{ fontFamily: POPPINS }}>{credits.purchased}</p>
                <p className="text-[11px] mt-2 font-medium" style={{ color: "#888", fontFamily: POPPINS }}>
                  {credits.purchased > 0 ? "Never expire" : "Never expire · Buy below"}
                </p>
              </div>
            </div>
          )}

          {/* Per-batch breakdown (free credit batches) */}
          {credits && credits.free > 0 && (credits.freeBatches ?? []).length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-white/75 text-[11px] font-semibold" style={{ fontFamily: POPPINS }}>Free credit breakdown</p>
              {(credits.freeBatches ?? []).map((batch, i) => {
                const days = daysUntil(batch.expiresAt);
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.80)" }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(240,24,122,0.12)" }}>
                        {batch.expiresAt
                          ? <Clock className="w-3.5 h-3.5" style={{ color: PINK }} />
                          : <Gift className="w-3.5 h-3.5" style={{ color: PINK }} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-black font-semibold text-xs truncate" style={{ fontFamily: POPPINS }}>{batch.label}</p>
                        {batch.expiresAt ? (
                          <p className="text-[10px] font-medium" style={{ color: PINK, fontFamily: POPPINS }}>
                            {days} day{days === 1 ? "" : "s"} left · {fmtDate(batch.expiresAt)}
                          </p>
                        ) : (
                          <p className="text-black/55 text-[10px]" style={{ fontFamily: POPPINS }}>Never expire</p>
                        )}
                      </div>
                    </div>
                    <p className="text-black font-bold text-base flex-shrink-0" style={{ fontFamily: POPPINS }}>{batch.amount}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Buy */}
        <section className="rounded-xl p-4 mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <h3 className="text-white font-bold text-sm mb-1" style={{ fontFamily: POPPINS }}>Buy Credits</h3>
          <p className="text-white/75 text-xs" style={{ fontFamily: POPPINS, marginBottom: pricePerCredit !== null && pricePerCredit < 149 ? 6 : 12 }}>{pricePerCredit === null ? "Loading price…" : `₹${pricePerCredit} per credit`}</p>
          {pricePerCredit !== null && pricePerCredit < 149 && (
            <p className="mb-3" style={{ fontFamily: POPPINS, fontSize: 13, fontWeight: 400, color: PINK }}>
              🎉 Limited time offer! Original price <span style={{ textDecoration: "line-through" }}>₹149/credit</span> — you're getting it at ₹{pricePerCredit}/credit
            </p>
          )}
          <label className="text-white/85 text-[11px] font-semibold mb-1.5 block" style={{ fontFamily: POPPINS }}>How many credits?</label>
          <div className="flex items-center gap-2 mb-3">
            <input type="range" min={1} max={500} value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)}
              className="flex-1 accent-pink-500" />
            <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 px-2.5 py-1.5 rounded-lg text-white text-sm text-center"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }} />
          </div>
          {pricePerCredit !== null && (
            <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex justify-between mb-1.5">
                <span className="text-white/75 text-xs" style={{ fontFamily: POPPINS }}>{qty} Credit{qty > 1 ? "s" : ""} × ₹{pricePerCredit}</span>
                <span className="text-white text-xs font-semibold" style={{ fontFamily: POPPINS }}>₹{(qty * pricePerCredit).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-white/75 text-xs" style={{ fontFamily: POPPINS }}>GST ({gstRate}%)</span>
                <span className="text-white text-xs font-semibold" style={{ fontFamily: POPPINS }}>₹{(qty * pricePerCredit * gstRate / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="text-white text-xs font-bold" style={{ fontFamily: POPPINS }}>Total Payable</span>
                <span className="font-bold text-sm" style={{ color: PINK, fontFamily: POPPINS }}>₹{(qty * pricePerCredit * (1 + gstRate / 100)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
          {pricePerCredit === null && (
            <p className="text-white text-base font-bold mb-3 text-center" style={{ fontFamily: POPPINS }}>Total: —</p>
          )}
          <button onClick={handleBuy} disabled={buying || qty < 1 || pricePerCredit === null}
            className="w-full py-2.5 rounded-full text-white font-semibold text-sm disabled:opacity-50"
            style={{ background: PINK, fontFamily: POPPINS }}>
            {buying ? "Opening..." : pricePerCredit === null ? "Loading…" : `Buy ${qty} Credit${qty > 1 ? "s" : ""} – ₹${(qty * pricePerCredit * (1 + gstRate / 100)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
          </button>
          {msg && <p className="text-amber-300 text-[11px] text-center mt-2" style={{ fontFamily: POPPINS }}>{msg}</p>}
        </section>

        {/* History */}
        <section>
          <h3 className="text-white font-bold text-sm mb-3" style={{ fontFamily: POPPINS }}>Transaction History</h3>
          {txs.length === 0 ? (
            <p className="text-white/70 text-xs text-center py-6" style={{ fontFamily: POPPINS }}>No transactions yet</p>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {txs.map((tx, i) => {
                const meta = TYPE_LABEL[tx.type] ?? { label: tx.type, color: "#6b7280" };
                return (
                  <div key={tx.id} className="flex items-center justify-between p-3" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="min-w-0">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: meta.color, fontFamily: POPPINS }}>
                        {meta.label}
                      </span>
                      <p className="text-white/70 text-[11px] mt-1" style={{ fontFamily: POPPINS }}>{fmtDate(tx.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${tx.amount > 0 ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: POPPINS }}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </p>
                      <p className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>Balance: {tx.balanceAfter}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-3">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-full text-xs text-white/90 border border-white/15 disabled:opacity-40">Prev</button>
              <span className="text-white/75 text-xs self-center" style={{ fontFamily: POPPINS }}>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-full text-xs text-white/90 border border-white/15 disabled:opacity-40">Next</button>
            </div>
          )}
        </section>
      </div>
    </BrandLayout>
  );
}
