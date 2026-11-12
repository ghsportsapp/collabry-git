import { useEffect, useState } from "react";
import { ArrowLeft, UserRound, MapPin } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { POPPINS, PINK } from "@/components/BrandLayout";

/* Read-only admin view of a single creator, opened on top of the admin
   applicants list (as an overlay) so the list underneath stays mounted — its
   filters, tab, page and scroll are preserved untouched while this is open.

   Backed by the same endpoint AdminCreatorOnboarding uses:
   GET /api/admin/creators/:id → { creator, categories, portfolio, ... }. */

const BG = "#0A0A0F";

const inr = (v: any) => (v === null || v === undefined || v === "" ? null : `₹${Number(v).toLocaleString("en-IN")}`);
const fmtRange = (min: any, max: any) => {
  const a = inr(min); const b = inr(max);
  return a && b ? `${a} – ${b}` : (a ?? b ?? "—");
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>{label}</p>
      <p className="text-white text-sm break-all" style={{ fontFamily: POPPINS }}>{value || "—"}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wide mt-4" style={{ fontFamily: POPPINS }}>{children}</h3>;
}

export default function AdminCreatorProfileModal({ creatorId, onBack }: { creatorId: string; onBack: () => void }) {
  const { adminFetch } = useAdminAuth();
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false);
    adminFetch(`/api/admin/creators/${creatorId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [adminFetch, creatorId]);

  // Esc closes just this overlay (returns to the applicants list, intact).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onBack(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onBack]);

  const c = detail?.creator;
  const images: string[] = Array.isArray(c?.images) ? c.images : [];
  const categories: any[] = Array.isArray(detail?.categories) ? detail.categories : [];
  const portfolio: any[] = Array.isArray(detail?.portfolio) ? detail.portfolio : [];

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 60, background: BG, fontFamily: POPPINS }}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button onClick={onBack} className="text-white/70 hover:text-white p-1 flex items-center gap-1.5" aria-label="Back to applicants">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-xs font-semibold">Back</span>
        </button>
        <h2 className="text-white font-bold text-base truncate">Creator Profile</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}
            </div>
          ) : error || !c ? (
            <p className="text-white/60 text-sm text-center py-16">Couldn't load this creator's profile.</p>
          ) : (
            <>
              {/* Identity header */}
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0" style={{ border: "1.5px solid rgba(240,24,122,0.35)", background: "rgba(240,24,122,0.15)" }}>
                  {c.profilePhotoUrl
                    ? <img src={c.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><UserRound className="w-7 h-7" style={{ color: PINK }} /></div>}
                </div>
                <div className="min-w-0">
                  <h2 className="text-white font-bold text-xl truncate">{c.fullName}</h2>
                  <p className="text-sm font-semibold" style={{ color: PINK }}>@{c.instagramHandle}</p>
                  <p className="text-white/70 text-xs mt-0.5">{c.followerCount?.toLocaleString("en-IN")} followers</p>
                  {(c.city || c.state) && (
                    <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: PINK }}>
                      <MapPin className="w-3.5 h-3.5" /> {[c.city, c.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {c.bio && <Field label="Bio" value={c.bio} />}

              <SectionTitle>Personal Information</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" value={c.email} />
                <Field label="Phone" value={c.phone} />
                <Field label="DOB" value={c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString("en-IN") : "—"} />
                <Field label="Gender" value={c.gender} />
                <Field label="State / UT" value={c.state} />
                <Field label="City / District" value={c.city} />
                {/* Admin-only — languages are never shown on the brand side. */}
                <div className="col-span-2">
                  <Field label="Languages" value={Array.isArray(c.languages) && c.languages.length ? c.languages.join(", ") : ""} />
                </div>
                <Field label="YouTube" value={c.youtubeHandle} />
                <Field label="Other Social" value={c.otherSocialHandle} />
                <Field label="KYC" value={c.kycStatus} />
                <Field label="Status" value={c.status} />
              </div>

              <SectionTitle>Content &amp; Audience</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categories" value={categories.map(x => x.categoryName).filter(Boolean).join(", ") || "—"} />
                <Field label="Audience" value={`${c.audienceGenderFemale ?? 0}% F · ${c.audienceGenderMale ?? 0}% M`} />
                <Field label="Age Group" value={c.audienceAge} />
                <Field label="Location" value={c.audienceLocation} />
                <Field label="Content Type" value={c.contentType} />
              </div>

              <SectionTitle>Pricing</SectionTitle>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Reel" value={fmtRange(c.reelPriceMin, c.reelPriceMax)} />
                <Field label="Story" value={fmtRange(c.storyPriceMin, c.storyPriceMax)} />
                <Field label="Post" value={fmtRange(c.postPriceMin, c.postPriceMax)} />
              </div>

              {images.length > 0 && (
                <>
                  <SectionTitle>Profile Photos</SectionTitle>
                  <div className="grid grid-cols-4 gap-2">
                    {images.map((img, i) => (
                      <div key={i} className="aspect-square rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                        <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {portfolio.length > 0 && (
                <>
                  <SectionTitle>Portfolio</SectionTitle>
                  <div className="space-y-2">
                    {portfolio.map((p: any) => (
                      <a key={p.id} href={p.videoUrl} target="_blank" rel="noreferrer"
                        className="block rounded-xl p-3 text-sm break-all hover:underline"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: PINK }}>
                        {p.videoUrl}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
