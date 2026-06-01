import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#F0187A";

interface Props {
  deal: { id: string; status: string; creator?: { fullName?: string | null } | null };
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  autoOpen?: boolean;
  onClose?: () => void;
}

export default function RatingPopup({ deal, apiFetch, autoOpen, onClose }: Props) {
  const isRateable = ["COMPLETED", "DISPUTE_WINDOW_OPEN"].includes(deal.status);
  const [open, setOpen] = useState(false);
  const [hasRated, setHasRated] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dismissedKey = `collabry_rate_dismissed_${deal.id}`;

  useEffect(() => {
    if (!isRateable) { setHasRated(false); return; }
    let cancelled = false;
    apiFetch(`/api/brand/deals/${deal.id}/my-rating`)
      .then(r => r.ok ? r.json() : { rating: null })
      .then(d => {
        if (cancelled) return;
        setHasRated(!!d.rating);
        if (!d.rating) {
          if (autoOpen) {
            setOpen(true);
          } else {
            const dismissed = (() => { try { return !!localStorage.getItem(dismissedKey); } catch { return false; } })();
            if (!dismissed) setOpen(true);
          }
        }
      })
      .catch(() => { if (!cancelled) setHasRated(false); });
    return () => { cancelled = true; };
  }, [deal.id, isRateable]);

  function dismiss() {
    setOpen(false);
    if (!autoOpen) {
      try { localStorage.setItem(dismissedKey, "1"); } catch {}
    }
    onClose?.();
  }

  async function submit() {
    if (rating < 1) return setErr("Pick a star rating");
    if (reviewText.length > 250) return setErr("Review must be 250 characters or less");
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch(`/api/brand/deals/${deal.id}/rate`, {
        method: "POST",
        body: JSON.stringify({ rating, reviewText: reviewText.trim() || undefined }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error ?? "Failed to submit rating");
      } else {
        setHasRated(true);
        setOpen(false);
        // Persist so the popup never auto-reopens even after component remount
        try { localStorage.setItem(dismissedKey, "rated"); } catch {}
        onClose?.();
      }
    } catch (e: any) { setErr(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  if (!isRateable) return null;

  return (
    <>
      {hasRated === false && !open && !autoOpen && (
        <button onClick={() => setOpen(true)}
          style={{ background: "rgba(240,24,122,0.15)", border: `1px solid ${PINK}`, color: PINK, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: POPPINS, marginBottom: 8 }}>
          ⭐ Rate this collaboration
        </button>
      )}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) dismiss(); }}>
          <div style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: 24, maxWidth: 400, width: "100%", fontFamily: POPPINS, boxShadow: "0 24px 60px rgba(0,0,0,0.60)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <p style={{ color: "white", fontSize: 17, fontWeight: 700, margin: 0 }}>Rate your experience</p>
                <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                  with <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{deal.creator?.fullName ?? "the creator"}</span>
                </p>
              </div>
              <button onClick={dismiss} style={{ background: "none", border: 0, color: "rgba(255,255,255,0.70)", cursor: "pointer", padding: 2, marginTop: 2 }}><X size={18} /></button>
            </div>

            <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 11, marginBottom: 20, marginTop: 6 }}>
              Your honest feedback helps other brands find great creators. You can only rate once.
            </p>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n}
                  onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  style={{ background: "none", border: 0, cursor: "pointer", padding: 4 }}>
                  <Star
                    size={36}
                    fill={(hover || rating) >= n ? PINK : "transparent"}
                    color={(hover || rating) >= n ? PINK : "rgba(255,255,255,0.18)"}
                    strokeWidth={1.5}
                  />
                </button>
              ))}
            </div>

            <p style={{ color: PINK, fontSize: 12, fontWeight: 700, textAlign: "center", marginBottom: 18, minHeight: 18 }}>
              {rating > 0 ? ["", "Poor", "Fair", "Good", "Great", "Excellent!"][rating] : ""}
            </p>

            <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Write a review <span style={{ color: "rgba(255,255,255,0.70)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <textarea
              rows={3} maxLength={250} value={reviewText}
              onChange={e => setReviewText(e.target.value)}
              placeholder="How was the content quality, communication, and delivery?"
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "9px 12px", color: "white", fontSize: 12, fontFamily: POPPINS, resize: "none", outline: "none", marginBottom: 4, boxSizing: "border-box" }}
            />
            <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 10, textAlign: "right", margin: "0 0 14px" }}>{reviewText.length}/250</p>

            {err && <p style={{ color: "#F87171", fontSize: 11, marginBottom: 10 }}>{err}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={dismiss} style={{ flex: 1, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.80)", border: "1px solid rgba(255,255,255,0.10)", padding: "11px 0", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: POPPINS }}>
                {autoOpen ? "Skip for now" : "Maybe later"}
              </button>
              <button disabled={busy || rating < 1} onClick={submit}
                style={{ flex: 1, background: rating > 0 ? PINK : "rgba(240,24,122,0.30)", color: "white", border: 0, padding: "11px 0", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: rating > 0 ? "pointer" : "default", opacity: busy ? 0.6 : 1, fontFamily: POPPINS }}>
                {busy ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
