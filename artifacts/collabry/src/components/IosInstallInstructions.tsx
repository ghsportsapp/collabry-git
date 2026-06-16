/**
 * iOS "Add to Home Screen" instructions modal. iOS Safari does not expose the
 * `beforeinstallprompt` API, so installation must be done manually — this modal
 * walks the user through it. Shared by the auto InstallPrompt banner and the
 * persistent InstallAppButton.
 */
export function IosInstallInstructions({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 360,
          background: "#15151c",
          color: "#fff",
          padding: 20,
          borderRadius: 14,
          fontFamily: "Poppins, sans-serif",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Install on iPhone / iPad
        </div>
        <ol
          style={{
            fontSize: 14,
            color: "#cfcfd6",
            paddingLeft: 18,
            lineHeight: 1.5,
          }}
        >
          <li>
            Tap the <strong>Share</strong> button in Safari's toolbar.
          </li>
          <li>
            Scroll down and choose <strong>"Add to Home Screen"</strong>.
          </li>
          <li>
            Tap <strong>Add</strong> in the top right.
          </li>
        </ol>
        <button
          onClick={onClose}
          style={{
            marginTop: 14,
            width: "100%",
            background: "#F0187A",
            color: "#fff",
            border: 0,
            padding: "10px 14px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
