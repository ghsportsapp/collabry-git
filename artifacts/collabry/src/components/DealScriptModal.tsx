import { FileText, X } from "lucide-react";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

/**
 * Read-only view of the brief the brand submitted with the original deal request.
 * Shared by the creator and brand Deals views — neither side can edit here.
 */
export default function DealScriptModal({ aboutProduct, reelScript, onClose }: {
  aboutProduct: string | null;
  reelScript: string | null;
  onClose: () => void;
}) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.80)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: "0 16px" }}
    >
      <div style={{ background: "#13151D", border: "1px solid rgba(240,24,122,0.25)", borderRadius: 18, padding: 24, maxWidth: 480, width: "100%", maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(240,24,122,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileText size={18} color={PINK} />
          </div>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: 0, fontFamily: POPPINS, flex: 1 }}>Deal Script</p>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
          >
            <X size={18} color="rgba(255,255,255,0.60)" />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          <Section label="About the Product" value={aboutProduct} />
          <Section label="Reel Script" value={reelScript} />
          {!aboutProduct?.trim() && !reelScript?.trim() && (
            <p style={{ color: "rgba(255,255,255,0.60)", fontSize: 13, fontFamily: POPPINS, margin: 0, lineHeight: 1.6 }}>
              No script details were submitted with this deal.
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          style={{ width: "100%", marginTop: 18, padding: "12px 0", borderRadius: 22, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: POPPINS, flexShrink: 0 }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Section({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, fontFamily: POPPINS }}>
        {label}
      </p>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px" }}>
        <p style={{ color: "rgba(255,255,255,0.90)", fontSize: 13, lineHeight: 1.65, margin: 0, fontFamily: POPPINS, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {value.trim()}
        </p>
      </div>
    </div>
  );
}
