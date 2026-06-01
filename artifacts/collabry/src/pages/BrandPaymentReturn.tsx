import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useBrandAuth } from "@/contexts/BrandAuthContext";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#F0187A";
const BG = "#0A0A0F";

function fmtInr(amount: string | null) {
  if (!amount) return null;
  const n = parseFloat(amount);
  if (isNaN(n)) return null;
  return "₹" + n.toLocaleString("en-IN");
}

type Status = "CHARGED" | "FAILED" | "PENDING";
type Context = "credits" | "deal";

interface PageState {
  status: Status;
  context: Context;
  dealId: string | null;
  orderId: string | null;
  amount: string | null;
}

function parseParams(search: string): PageState {
  const p = new URLSearchParams(search);
  const rawStatus = (p.get("status") ?? "").toUpperCase();
  const status: Status = rawStatus === "CHARGED" || rawStatus === "FAILED" || rawStatus === "PENDING"
    ? (rawStatus as Status)
    : "FAILED";
  const rawCtx = p.get("context") ?? "";
  const context: Context = rawCtx === "credits" || rawCtx === "deal" ? rawCtx : "credits";
  return {
    status,
    context,
    dealId: p.get("dealId"),
    orderId: p.get("orderId"),
    amount: p.get("amount"),
  };
}

const CSS = `
@keyframes pop-in {
  0%   { transform: scale(0.4); opacity: 0; }
  70%  { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes draw-check {
  0%   { stroke-dashoffset: 60; }
  100% { stroke-dashoffset: 0; }
}
@keyframes draw-x {
  0%   { stroke-dashoffset: 40; }
  100% { stroke-dashoffset: 0; }
}
@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.5); }
  50%       { box-shadow: 0 0 0 10px rgba(251,191,36,0); }
}
`;

function SuccessIcon() {
  return (
    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(34,197,94,0.15)", border: "2.5px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop-in 0.5s cubic-bezier(.175,.885,.32,1.275) forwards" }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <polyline points="8,21 17,30 33,12" stroke="#22c55e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset="60" style={{ animation: "draw-check 0.45s ease 0.35s forwards" }} />
      </svg>
    </div>
  );
}

function FailIcon() {
  return (
    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "2.5px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop-in 0.5s cubic-bezier(.175,.885,.32,1.275) forwards" }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <line x1="12" y1="12" x2="28" y2="28" stroke="#ef4444" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="40" style={{ animation: "draw-x 0.35s ease 0.35s forwards" }} />
        <line x1="28" y1="12" x2="12" y2="28" stroke="#ef4444" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="40" style={{ animation: "draw-x 0.35s ease 0.5s forwards" }} />
      </svg>
    </div>
  );
}

function PendingIcon() {
  return (
    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(251,191,36,0.12)", border: "2.5px solid #fbbf24", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop-in 0.5s cubic-bezier(.175,.885,.32,1.275) forwards, pulse-ring 2s ease 0.8s infinite" }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="14" stroke="#fbbf24" strokeWidth="2.5" strokeOpacity="0.3" />
        <line x1="20" y1="10" x2="20" y2="20" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
        <line x1="20" y1="20" x2="27" y2="25" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function DetailCard({ orderId, amount, context, status }: { orderId: string | null; amount: string | null; context: Context; status: Status }) {
  const rows: Array<[string, React.ReactNode]> = [];
  const fmt = fmtInr(amount);
  if (status === "CHARGED") {
    if (orderId) rows.push(["Order ID", <span style={{ color: "rgba(255,255,255,0.9)" }}>{orderId}</span>]);
    if (fmt) rows.push(["Amount Paid", <span style={{ color: "rgba(255,255,255,0.9)" }}>{fmt}</span>]);
  } else {
    if (fmt) rows.push(["Amount Due", <span style={{ color: "rgba(255,255,255,0.9)" }}>{fmt}</span>]);
  }
  rows.push(["Payment For", <span style={{ color: "rgba(255,255,255,0.9)" }}>{context === "credits" ? "Credit Purchase" : "Deal Payment"}</span>]);
  const statusEl =
    status === "CHARGED" ? <span style={{ color: "#22c55e", fontWeight: 600 }}>Confirmed ✓</span> :
    status === "FAILED"  ? <span style={{ color: "#ef4444", fontWeight: 600 }}>Failed ✗</span> :
                           <span style={{ color: "#fbbf24", fontWeight: 600 }}>Pending ⏳</span>;
  rows.push(["Status", statusEl]);

  if (rows.length === 0) return null;
  return (
    <div style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(255,255,255,0.30)", boxShadow: "0 0 2px 2px rgba(240,24,122,0.40)", borderRadius: 14, padding: "18px 22px", width: "100%", maxWidth: 380 }}>
      {rows.map(([label, value], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: i === 0 ? 0 : 10, paddingBottom: i === rows.length - 1 ? 0 : 10, borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
          <span style={{ fontFamily: POPPINS, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{label}</span>
          <span style={{ fontFamily: POPPINS, fontSize: 13 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

const BTN_BASE: React.CSSProperties = { fontFamily: POPPINS, fontSize: 14, borderRadius: 10, padding: "11px 28px", cursor: "pointer", border: "none", fontWeight: 600 };
const BTN_PINK: React.CSSProperties = { ...BTN_BASE, background: PINK, color: "#fff" };
const BTN_GHOST: React.CSSProperties = { ...BTN_BASE, background: "transparent", border: `1.5px solid ${PINK}`, color: PINK };

export default function BrandPaymentReturn() {
  const { brandId, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();

  // Read URL params once on mount — never mutated after that.
  const [urlState] = useState<PageState>(() => parseParams(window.location.search));

  // Only the visual status changes when test strip buttons are clicked.
  const [displayStatus, setDisplayStatus] = useState<Status>(() => urlState.status);

  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading, navigate]);

  if (authLoading || !brandId) return null;

  // URL-sourced values — never overwritten by test strip.
  const { context, dealId, orderId, amount } = urlState;

  const primaryAction = () => {
    if (displayStatus === "FAILED") { window.history.back(); return; }
    if (context === "credits") navigate("/home-brand/credits");
    else if (dealId) navigate(`/home-brand/deals`);
    else navigate("/home-brand");
  };

  const primaryLabel =
    displayStatus === "FAILED" ? "Try Again" :
    displayStatus === "PENDING" ? "Go to Home" :
    context === "credits" ? "Go to Credits" : "View Deal";

  return (
    <>
      <style>{CSS}</style>
      <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center" }}>

        {isDev && (
          <div style={{ width: "100%", background: "rgba(255,255,255,0.04)", padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: POPPINS, fontSize: 11, color: "rgba(255,255,255,0.35)", marginRight: 4 }}>DEV</span>
            <button onClick={() => setDisplayStatus("CHARGED")}
              style={{ fontFamily: POPPINS, fontSize: 12, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
              ✓ Test Success
            </button>
            <button onClick={() => setDisplayStatus("FAILED")}
              style={{ fontFamily: POPPINS, fontSize: 12, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
              ✗ Test Failed
            </button>
            <button onClick={() => setDisplayStatus("PENDING")}
              style={{ fontFamily: POPPINS, fontSize: 12, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
              ⏳ Test Pending
            </button>
          </div>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "40px 20px", width: "100%", maxWidth: 440 }}>

          {displayStatus === "CHARGED" ? <SuccessIcon /> : displayStatus === "FAILED" ? <FailIcon /> : <PendingIcon />}

          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: POPPINS, fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>
              {displayStatus === "CHARGED" ? "Payment Successful!" : displayStatus === "FAILED" ? "Payment Failed" : "Payment Processing"}
            </h1>
            <p style={{ fontFamily: POPPINS, fontSize: 14, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.6 }}>
              {displayStatus === "CHARGED"
                ? context === "credits"
                  ? "Your credits have been added to your account and are ready to use."
                  : "Payment is secured in escrow. The creator will be notified to begin work."
                : displayStatus === "FAILED"
                ? "Your payment could not be processed. You have not been charged."
                : "Your payment is being verified. This usually takes a few minutes. We'll notify you once it's confirmed — you don't need to do anything."}
            </p>
          </div>

          <DetailCard orderId={orderId} amount={amount} context={context} status={displayStatus} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 380 }}>
            <button
              onClick={primaryAction}
              style={BTN_PINK}
              onMouseEnter={e => (e.currentTarget.style.background = "#d4106a")}
              onMouseLeave={e => (e.currentTarget.style.background = PINK)}
            >
              {primaryLabel}
            </button>
            {displayStatus !== "PENDING" && (
              <button
                onClick={() => navigate("/home-brand")}
                style={BTN_GHOST}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(240,24,122,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                Go to Home
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
