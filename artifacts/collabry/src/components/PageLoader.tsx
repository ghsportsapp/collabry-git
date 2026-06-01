const PINK = "#E14F69";

interface Props {
  fullScreen?: boolean;
  size?: number;
  label?: string;
}

export default function PageLoader({ fullScreen = true, size = 44, label }: Props) {
  const wrapperStyle: React.CSSProperties = fullScreen
    ? { minHeight: "100vh", background: "#0A0A0F", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }
    : { padding: "32px 0", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 };

  return (
    <div style={wrapperStyle}>
      <style>{`
        @keyframes pl_spin { to { transform: rotate(360deg); } }
      `}</style>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `3px solid rgba(240,24,122,0.18)`,
          borderTopColor: PINK,
          animation: "pl_spin 0.8s linear infinite",
          willChange: "transform",
          boxShadow: "0 0 18px rgba(240,24,122,0.35)",
        }}
        role="status"
        aria-label={label ?? "Loading"}
      />
      {label && (
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "'Poppins', sans-serif", margin: 0 }}>
          {label}
        </p>
      )}
    </div>
  );
}
