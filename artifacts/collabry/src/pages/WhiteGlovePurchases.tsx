import { useState, useEffect, useCallback } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const PINK = "#E14F69";
// Same passphrase (and storage key) as the brands/creators CSV export.
const EXPORT_SECRET_KEY = "collabry_admin_export_secret";

interface Purchase {
  id: string;
  orderRef: string;
  brandId: string;
  brandName: string | null;
  contactName: string | null;
  email: string | null;
  planName: string;
  months: number;
  amountInr: number;
  baseAmountInr: number | null;
  gstRatePercent: number | null;
  gstAmountInr: number | null;
  totalAmountInr: number | null;
  razorpayPaymentId: string;
  contactedAt: string | null;
  createdAt: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtDate = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Paid White Glove plans — the team's to-contact list. Gated on ADMIN_API_SECRET. */
export default function WhiteGlovePurchases() {
  const { adminFetch } = useAdminAuth();
  const [secret, setSecret] = useState(() => { try { return sessionStorage.getItem(EXPORT_SECRET_KEY) ?? ""; } catch { return ""; } });
  const [unlocked, setUnlocked] = useState(false);
  const [rows, setRows] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pass: string) => {
    if (!pass) return;
    setLoading(true);
    setError(null);
    try {
      const r = await adminFetch("/api/admin/white-glove/purchases", { headers: { "x-admin-secret": pass } });
      if (r.status === 401) { try { sessionStorage.removeItem(EXPORT_SECRET_KEY); } catch {} setUnlocked(false); setError("Incorrect passphrase."); return; }
      if (!r.ok) {
        setError(r.status === 503 ? "Not configured on the server (ADMIN_API_SECRET is unset)." : "Failed to load purchases.");
        return;
      }
      try { sessionStorage.setItem(EXPORT_SECRET_KEY, pass); } catch {}
      setRows(await r.json());
      setUnlocked(true);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [adminFetch]);

  // Auto-unlock if the passphrase was already entered this session.
  useEffect(() => { if (secret) load(secret); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleContacted = async (p: Purchase) => {
    const r = await adminFetch(`/api/admin/white-glove/purchases/${p.id}/contacted`, {
      method: "PATCH",
      headers: { "x-admin-secret": secret },
      body: JSON.stringify({ contacted: !p.contactedAt }),
    });
    if (r.ok) {
      const d = await r.json();
      setRows(prev => prev.map(x => x.id === p.id ? { ...x, contactedAt: d.contactedAt } : x));
    } else setError("Failed to update");
  };

  const pending = rows.filter(r => !r.contactedAt).length;

  return (
    <div className="rounded-2xl p-5 mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-sm">Purchases</h2>
        {unlocked && <span className="text-xs text-white/50">{rows.length} total · {pending} to contact</span>}
      </div>

      {!unlocked ? (
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={e => { e.preventDefault(); load(secret); }}>
          <input type="password" placeholder="Admin passphrase" value={secret} onChange={e => setSecret(e.target.value)}
            className="flex-1 bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E14F69] placeholder:text-white/40" />
          <button type="submit" disabled={loading || !secret}
            className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ background: PINK }}>
            {loading ? "Loading…" : "View purchases"}
          </button>
        </form>
      ) : rows.length === 0 ? (
        <p className="text-white/50 text-sm">No purchases yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map(p => (
            <div key={p.id} className="rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${p.contactedAt ? "rgba(255,255,255,0.07)" : "rgba(225,79,105,0.35)"}` }}>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {p.brandName ?? "Unknown brand"} <span className="text-white/40 font-normal">· {p.planName} ({p.months} mo) · {inr(p.totalAmountInr ?? p.amountInr)}</span>
                </p>
                {p.baseAmountInr != null && p.gstAmountInr != null && (
                  <p className="text-white/45 text-[11px]">
                    {inr(p.baseAmountInr)} + {inr(p.gstAmountInr)} GST{p.gstRatePercent != null ? ` (${p.gstRatePercent}%)` : ""} = {inr(p.totalAmountInr ?? p.amountInr)}
                  </p>
                )}
                <p className="text-white/60 text-xs truncate">{[p.contactName, p.email].filter(Boolean).join(" · ") || "—"}</p>
                <p className="text-white/35 text-[11px] truncate">{p.orderRef} · {p.razorpayPaymentId} · {fmtDate(p.createdAt)}</p>
              </div>
              <button onClick={() => toggleContacted(p)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
                style={p.contactedAt
                  ? { background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(16,185,129,0.25)" }
                  : { background: PINK, color: "#fff" }}>
                {p.contactedAt ? "✓ Contacted" : "Mark contacted"}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs mt-3" style={{ color: "#f87171" }}>{error}</p>}
    </div>
  );
}
