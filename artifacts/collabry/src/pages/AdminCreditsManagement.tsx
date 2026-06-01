import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Gift, Settings, Search, CheckSquare, Square, RefreshCw, ShoppingCart, Upload, ExternalLink, X } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
const inputClass = "w-full bg-transparent border border-white/20 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-white/50 placeholder:text-white/70 transition-all";

interface CreditConfig { freeCreditsOnSignup: number; creditExpiryDays: number; pricePerCredit: number }
interface Brand { id: string; brandName: string; email: string; logoUrl: string | null; creditBalance: number; status: string }
interface CreditPurchase {
  id: string;
  orderId: string | null;
  credits: number | null;
  amountInr: number | null;
  gstAmountInr: number | null;
  createdAt: string;
  brandId: string;
  brandName: string | null;
  brandEmail: string | null;
  invoiceUrl: string | null;
}

const PINK = "#E14F69";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export default function AdminCreditsManagement() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();

  const [config, setConfig] = useState<CreditConfig>({ freeCreditsOnSignup: 5, creditExpiryDays: 30, pricePerCredit: 99 });
  const [configDraft, setConfigDraft] = useState<CreditConfig>({ freeCreditsOnSignup: 5, creditExpiryDays: 30, pricePerCredit: 99 });
  const [savingConfig, setSavingConfig] = useState(false);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [giftAmount, setGiftAmount] = useState("");
  const [giftExpiryDays, setGiftExpiryDays] = useState("30");
  const [giftReason, setGiftReason] = useState("");
  const [gifting, setGifting] = useState(false);
  const [giftResult, setGiftResult] = useState<string | null>(null);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Credit purchases section
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [invoicePurchase, setInvoicePurchase] = useState<CreditPurchase | null>(null);
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const invoiceFileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const loadConfig = useCallback(async () => {
    const r = await adminFetch("/api/admin/config/credits");
    if (r.ok) { const d = await r.json(); setConfig(d); setConfigDraft(d); }
  }, [adminFetch]);

  const loadBrands = useCallback(async () => {
    setLoadingBrands(true);
    const r = await adminFetch("/api/admin/brands/list-all");
    if (r.ok) setBrands(await r.json());
    setLoadingBrands(false);
  }, [adminFetch]);

  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    const params = new URLSearchParams();
    if (purchaseSearch.trim()) params.set("search", purchaseSearch.trim());
    const r = await adminFetch(`${BASE_URL}/api/admin/credit-purchases?${params}`);
    if (r.ok) setPurchases(await r.json());
    setLoadingPurchases(false);
  }, [adminFetch, purchaseSearch]);

  useEffect(() => { loadConfig(); loadBrands(); loadPurchases(); }, [loadConfig, loadBrands, loadPurchases]);

  function handleInvoiceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setInvoiceMsg("File too large (max 8MB)"); return; }
    const reader = new FileReader();
    reader.onload = ev => setInvoiceImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function confirmInvoiceUpload() {
    if (!invoicePurchase || !invoiceImage) return;
    setInvoiceLoading(true); setInvoiceMsg("");
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/invoices/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceId: invoicePurchase.id,
          recipientType: "BRAND",
          recipientId: invoicePurchase.brandId,
          image: invoiceImage,
          type: "CREDIT_PURCHASE",
        }),
      });
      const d = await r.json();
      if (!r.ok) { setInvoiceMsg(d.error ?? "Upload failed"); return; }
      setInvoiceMsg("✅ Invoice uploaded");
      setTimeout(() => { setInvoicePurchase(null); setInvoiceImage(null); loadPurchases(); }, 1400);
    } catch { setInvoiceMsg("Network error"); }
    finally { setInvoiceLoading(false); }
  }

  const filteredBrands = brands.filter(b =>
    b.brandName.toLowerCase().includes(search.toLowerCase()) ||
    b.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const toggleAll = () => {
    if (selectedIds.size === filteredBrands.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredBrands.map(b => b.id)));
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    const r = await adminFetch("/api/admin/config/credits", {
      method: "PATCH",
      body: JSON.stringify(configDraft),
    });
    if (r.ok) { setConfig(configDraft); showToast("Credit settings updated"); }
    else { try { const d = await r.json(); showToast(d.error ?? "Failed to save", false); } catch { showToast("Failed to save", false); } }
    setSavingConfig(false);
  };

  const giftCredits = async () => {
    const amount = parseInt(giftAmount);
    const expiryDays = parseInt(giftExpiryDays);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", false); return; }
    if (!expiryDays || expiryDays <= 0) { showToast("Enter valid expiry days", false); return; }
    if (selectedIds.size === 0) { showToast("Select at least one brand", false); return; }
    setGifting(true);
    setGiftResult(null);
    const r = await adminFetch("/api/admin/credits/gift", {
      method: "POST",
      body: JSON.stringify({ brandIds: Array.from(selectedIds), amount, expiryDays, reason: giftReason.trim() || undefined }),
    });
    try {
      const d = await r.json();
      if (r.ok) {
        setGiftResult(`✓ Gifted ${amount} credits (expire in ${expiryDays} day${expiryDays === 1 ? "" : "s"}) to ${d.successCount} brand(s)${d.failures?.length > 0 ? ` (${d.failures.length} failed)` : ""}`);
        showToast(`Gifted ${amount} credits to ${d.successCount} brand(s)`);
        setSelectedIds(new Set());
        setGiftAmount("");
        setGiftReason("");
        loadBrands();
      } else { showToast(d.error ?? "Failed to gift credits", false); }
    } catch { showToast("Failed to gift credits", false); }
    setGifting(false);
  };

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm text-white shadow-lg ${toast.ok ? "bg-green-700/90" : "bg-red-700/90"}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Invoice Upload Modal ── */}
      <input ref={invoiceFileRef} type="file" accept="image/jpeg,image/png,image/jpg,application/pdf" className="hidden" onChange={handleInvoiceFile} />
      {invoicePurchase && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={e => { if (e.target === e.currentTarget) setInvoicePurchase(null); }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: "#0F0F18", border: "1px solid rgba(255,255,255,0.12)", fontFamily: POPPINS }}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-white font-bold text-sm">Upload Invoice</h3>
                <p className="text-white/60 text-[11px] mt-0.5">
                  {invoicePurchase.orderId ?? invoicePurchase.id.slice(0, 8).toUpperCase()} · {invoicePurchase.brandName ?? "Brand"}
                </p>
              </div>
              <button onClick={() => setInvoicePurchase(null)}><X className="w-5 h-5 text-white/70" /></button>
            </div>
            {invoiceImage ? (
              <div className="rounded-xl overflow-hidden border border-white/10 relative">
                <img src={invoiceImage} alt="Invoice preview" className="w-full max-h-40 object-contain bg-black/30" />
                <button onClick={() => setInvoiceImage(null)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(239,68,68,0.80)" }}>
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <button onClick={() => invoiceFileRef.current?.click()}
                className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors hover:border-white/30"
                style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                <Upload className="w-6 h-6 text-white/50" />
                <span className="text-white/60 text-xs">Click to select image or PDF</span>
              </button>
            )}
            {invoiceMsg && (
              <p className={`text-sm text-center ${invoiceMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{invoiceMsg}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setInvoicePurchase(null)}
                className="flex-1 py-2.5 rounded-full text-white/80 text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                Cancel
              </button>
              <button disabled={!invoiceImage || invoiceLoading} onClick={confirmInvoiceUpload}
                className="flex-1 py-2.5 rounded-full text-white text-sm font-bold disabled:opacity-40"
                style={{ background: PINK }}>
                {invoiceLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate("/admin-collabryangad")} className="text-white/80 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white text-xl font-bold">Credits Management</h1>
      </div>

      <div className="grid gap-6 mb-8">
        <div className="rounded-2xl p-6" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <div className="flex items-center gap-2 mb-5">
            <Settings className="w-5 h-5 text-[#E14F69]" />
            <h2 className="text-white font-semibold text-base">Credit Settings</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-white/80 text-xs font-medium mb-1.5">Price of 1 Credit (₹)</label>
              <input type="number" min="1" step="0.01" className={inputClass} value={configDraft.pricePerCredit}
                onChange={e => setConfigDraft(p => ({ ...p, pricePerCredit: parseFloat(e.target.value) || 0 }))} />
              <p className="text-white/70 text-xs mt-1">Currently: ₹{config.pricePerCredit} per credit · shown on the brand Buy Credits page</p>
            </div>
            <div>
              <label className="block text-white/80 text-xs font-medium mb-1.5">Free Credits on Signup</label>
              <input type="number" min="0" className={inputClass} value={configDraft.freeCreditsOnSignup}
                onChange={e => setConfigDraft(p => ({ ...p, freeCreditsOnSignup: parseInt(e.target.value) || 0 }))} />
              <p className="text-white/70 text-xs mt-1">Currently: {config.freeCreditsOnSignup}</p>
            </div>
            <div>
              <label className="block text-white/80 text-xs font-medium mb-1.5">Credit Expiry (days)</label>
              <input type="number" min="1" className={inputClass} value={configDraft.creditExpiryDays}
                onChange={e => setConfigDraft(p => ({ ...p, creditExpiryDays: parseInt(e.target.value) || 30 }))} />
              <p className="text-white/70 text-xs mt-1">Currently: {config.creditExpiryDays} days</p>
            </div>
          </div>
          <button onClick={saveConfig} disabled={savingConfig} className="px-5 py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50 transition-all" style={{ background: "#E14F69" }}>
            {savingConfig ? "Saving..." : "Save Settings"}
          </button>
        </div>

        <div className="rounded-2xl p-6" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <div className="flex items-center gap-2 mb-5">
            <Gift className="w-5 h-5 text-[#E14F69]" />
            <h2 className="text-white font-semibold text-base">Gift Credits to Brands</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-white/80 text-xs font-medium mb-1.5">Amount to Gift</label>
              <input type="number" min="1" className={inputClass} placeholder="e.g. 10" value={giftAmount}
                onChange={e => setGiftAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-white/80 text-xs font-medium mb-1.5">Expires after (days)</label>
              <input type="number" min="1" className={inputClass} placeholder="e.g. 30" value={giftExpiryDays}
                onChange={e => setGiftExpiryDays(e.target.value)} />
            </div>
            <div>
              <label className="block text-white/80 text-xs font-medium mb-1.5">Reason (optional)</label>
              <input className={inputClass} placeholder="e.g. Campaign reward" value={giftReason} onChange={e => setGiftReason(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
              <input className={inputClass + " pl-9"} placeholder="Search brands..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button onClick={loadBrands} className="text-white/70 hover:text-white transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loadingBrands ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="rounded-xl overflow-hidden border border-white/10 mb-4">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white/5 border-b border-white/10">
              <button onClick={toggleAll} className="text-white/80 hover:text-white">
                {selectedIds.size === filteredBrands.length && filteredBrands.length > 0
                  ? <CheckSquare className="w-4 h-4 text-[#E14F69]" />
                  : <Square className="w-4 h-4" />}
              </button>
              <span className="text-white/70 text-xs">{selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select brands"}</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filteredBrands.length === 0 ? (
                <div className="px-4 py-8 text-center text-white/70 text-sm">
                  {loadingBrands ? "Loading..." : "No brands found"}
                </div>
              ) : filteredBrands.map(b => (
                <div key={b.id} onClick={() => toggleSelect(b.id)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0">
                  <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center`} style={{ background: selectedIds.has(b.id) ? "#E14F69" : "transparent", border: selectedIds.has(b.id) ? "none" : "1px solid rgba(255,255,255,0.7)" }}>
                    {selectedIds.has(b.id) && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>}
                  </div>
                  {b.logoUrl ? <img src={b.logoUrl} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt="" /> : <div className="w-8 h-8 rounded-lg bg-white/10 flex-shrink-0 flex items-center justify-center text-white/70 text-xs">{b.brandName[0]}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{b.brandName}</p>
                    <p className="text-white/70 text-xs truncate">{b.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#E14F69] text-sm font-bold">{b.creditBalance}</p>
                    <p className="text-white/70 text-xs">credits</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {giftResult && <p className="text-green-400 text-sm mb-4">{giftResult}</p>}

          <button onClick={giftCredits} disabled={gifting || selectedIds.size === 0 || !giftAmount}
            className="w-full py-3 rounded-full text-white text-sm font-semibold disabled:opacity-40 transition-all"
            style={{ background: "#E14F69" }}>
            {gifting ? "Gifting..." : `Gift Credits to ${selectedIds.size || "Selected"} Brand(s)`}
          </button>
        </div>

        {/* ── Credit Purchases ── */}
        <div className="rounded-2xl p-5 lg:p-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[#E14F69]" />
              <h2 className="text-white font-bold text-sm lg:text-base">Credit Purchases</h2>
            </div>
            <button onClick={loadPurchases} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
              <RefreshCw className={`w-4 h-4 text-white/70 ${loadingPurchases ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input
                value={purchaseSearch}
                onChange={e => setPurchaseSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadPurchases()}
                placeholder="Search by brand name or order ID…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-white text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: POPPINS }}
              />
            </div>
            <button onClick={loadPurchases} className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: PINK }}>
              Search
            </button>
          </div>

          {loadingPurchases ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}
            </div>
          ) : purchases.length === 0 ? (
            <div className="py-10 text-center text-white/60 text-sm" style={{ fontFamily: POPPINS }}>No credit purchases found</div>
          ) : (
            <div className="space-y-2">
              {purchases.map(p => (
                <div key={p.id} className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-white text-sm font-semibold" style={{ fontFamily: POPPINS }}>{p.brandName ?? "—"}</span>
                      {p.orderId && <span className="font-mono text-[11px] text-white/50">{p.orderId}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0 text-[11px] text-white/60" style={{ fontFamily: POPPINS }}>
                      {p.credits != null && <span>{p.credits} credits</span>}
                      {p.amountInr != null && <span>₹{p.amountInr.toLocaleString("en-IN")}</span>}
                      {p.gstAmountInr != null && p.gstAmountInr > 0 && <span>+₹{p.gstAmountInr.toLocaleString("en-IN")} GST</span>}
                      <span>{new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                  {p.invoiceUrl ? (
                    <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0"
                      style={{ background: "rgba(240,24,122,0.12)", color: PINK, border: "1px solid rgba(240,24,122,0.25)" }}>
                      <ExternalLink className="w-3 h-3" />
                      Invoice
                    </a>
                  ) : (
                    <button onClick={() => { setInvoicePurchase(p); setInvoiceImage(null); setInvoiceMsg(""); setTimeout(() => invoiceFileRef.current?.click(), 50); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/70 hover:text-white transition-colors flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <Upload className="w-3 h-3" />
                      Upload
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
