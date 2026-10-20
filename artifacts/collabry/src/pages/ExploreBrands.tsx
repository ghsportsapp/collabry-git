import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, X } from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { CreatorLayout, POPPINS, PINK } from "@/components/CreatorNavLayout";
import { AdImage, useAds, type Ad } from "@/components/AdBanner";

/* /explore-brands — creator-gated vertical list of ad detail cards, ordered by
   displayOrder. Each card: 16:9 image + headline + body + a "Get more details"
   lead form that captures the creator's contact for the brand. */

interface Prefill { name: string; email: string; contact: string }

export default function ExploreBrands() {
  const { creatorId, loading, apiFetch } = useCreatorAuth();
  const [, navigate] = useLocation();
  const ads = useAds();
  const targetAdId = new URLSearchParams(useSearch()).get("ad");
  const [prefill, setPrefill] = useState<Prefill>({ name: "", email: "", contact: "" });
  const [leadAd, setLeadAd] = useState<Ad | null>(null);

  useEffect(() => {
    if (!loading && !creatorId) navigate("/login-creator");
  }, [loading, creatorId, navigate]);

  // Prefill the lead form from the creator's profile (kept editable in the modal).
  useEffect(() => {
    if (!creatorId) return;
    let alive = true;
    apiFetch("/api/creator/profile")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return;
        setPrefill({ name: d.fullName ?? "", email: d.email ?? "", contact: d.phone ?? "" });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [creatorId, apiFetch]);

  // After the list renders, jump (near-instant) to the clicked ad. Not found →
  // stay at the top, silently. "instant" overrides the global smooth scroll.
  useEffect(() => {
    if (!targetAdId || !ads || ads.length === 0) return;
    const el = document.getElementById(`ad-${targetAdId}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
  }, [ads, targetAdId]);

  if (loading || !creatorId) return null;

  return (
    <CreatorLayout status="ACTIVE" onLocked={() => {}}>
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-12" style={{ fontFamily: POPPINS }}>
        <div className="flex items-center gap-2 mb-5">
          <button onClick={() => navigate("/home-creator")} className="text-white/70 hover:text-white" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white font-bold text-xl">
            Explore <span style={{ color: PINK }}>Brands</span>
          </h1>
        </div>

        {ads === null ? (
          <div className="space-y-5">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl animate-pulse" style={{ aspectRatio: "16 / 9", background: "rgba(255,255,255,0.04)" }} />)}
          </div>
        ) : ads.length === 0 ? (
          <p className="text-white/50 text-sm text-center py-16">Nothing to explore right now — check back soon.</p>
        ) : (
          <div className="space-y-6">
            {ads.map((ad, i) => (
              <div key={ad.id} id={`ad-${ad.id}`} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", scrollMarginTop: 72 }}>
                <AdImage ad={ad} rounded="rounded-xl" priority={i === 0} />
                <div className="px-1 pt-3.5">
                  {ad.headline && <h2 className="text-white font-bold text-[15px] mb-1.5 leading-snug">{ad.headline}</h2>}
                  {ad.bodyText && <p className="text-white/60 text-[13px] leading-relaxed whitespace-pre-line">{ad.bodyText}</p>}
                </div>
                <button onClick={() => setLeadAd(ad)}
                  className="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: PINK }}>
                  Get more details
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {leadAd && (
        <LeadModal ad={leadAd} prefill={prefill} apiFetch={apiFetch} onClose={() => setLeadAd(null)} />
      )}
    </CreatorLayout>
  );
}

function LeadModal({ ad, prefill, apiFetch, onClose }: {
  ad: Ad;
  prefill: Prefill;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
}) {
  const brand = (ad.brandName && ad.brandName.trim()) || ad.headline || "this brand";
  const [name, setName] = useState(prefill.name);
  const [contact, setContact] = useState(prefill.contact);
  const [email, setEmail] = useState(prefill.email);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!contact.trim()) { setErr("Please enter your contact number."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr("Please enter a valid email."); return; }
    setSubmitting(true);
    try {
      const r = await apiFetch(`/api/ads/${ad.id}/lead`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), contact: contact.trim(), email: email.trim() }),
      });
      if (r.ok) setDone(true);
      else { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Could not submit — please try again."); }
    } catch { setErr("Network error — please try again."); }
    finally { setSubmitting(false); }
  };

  const inputClass = "w-full bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E14F69] placeholder:text-white/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.8)", fontFamily: POPPINS }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#0A0A0F", border: "1px solid rgba(225,79,105,0.35)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">{done ? "Thank you!" : "Get more details"}</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-white/70" /></button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <p className="text-white/80 text-sm leading-relaxed mb-6">Thanks! Team {brand} will reach out to you soon.</p>
            <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-semibold text-white" style={{ background: PINK }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-white/70 text-xs mb-1.5">Name</label>
                <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <label className="block text-white/70 text-xs mb-1.5">Contact number</label>
                <input className={inputClass} value={contact} onChange={e => setContact(e.target.value)} placeholder="Your phone number" inputMode="tel" />
              </div>
              <div>
                <label className="block text-white/70 text-xs mb-1.5">Email</label>
                <input className={inputClass} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" inputMode="email" />
              </div>
            </div>

            <p className="text-white/45 text-[11px] leading-relaxed mt-3">
              By submitting, you agree that Team {brand} will reach out to you.
            </p>

            {err && <p className="text-xs mt-2" style={{ color: "#f87171" }}>{err}</p>}

            <button onClick={submit} disabled={submitting}
              className="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: PINK }}>
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
