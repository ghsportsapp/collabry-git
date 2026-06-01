import { Lock } from "lucide-react";

const PINK = "#F0187A";
const POPPINS = "'Poppins', sans-serif";

export default function LockedFeatureModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xs p-6 text-center"
        style={{
          background: "linear-gradient(145deg, #100B1E 0%, #1A0830 50%, #0E0E1A 100%)",
          border: "1px solid rgba(255,255,255,0.30)",
          boxShadow: "0px 0px 2px 2px rgba(240,24,122,0.40)",
          borderRadius: 12,
        }}
      >
        <Lock className="w-8 h-8 mx-auto mb-3" style={{ color: PINK }} />
        <h3 className="font-bold text-white mb-2" style={{ fontFamily: POPPINS, fontSize: 16 }}>
          Feature Locked
        </h3>
        <p className="mb-5 leading-relaxed" style={{ fontFamily: POPPINS, color: "rgba(255,255,255,0.8)", fontSize: 13 }}>
          You'll get access to campaigns once your profile is verified by our team. This usually takes 24–72 hours.
        </p>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl text-white font-semibold text-sm"
          style={{ background: PINK, fontFamily: POPPINS }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
