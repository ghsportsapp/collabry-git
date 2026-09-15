import { useState } from "react";
import { Users, UserRound, UserCheck, MapPin, CalendarRange, Globe } from "lucide-react";
import { POPPINS, PINK } from "@/components/BrandLayout";

/* One applicant card, shared by the Paid and Barter campaign detail pages so
   the two can't drift. Laid out like the search creator card, with two
   deliberate differences:
     • no pricing at all — campaigns don't negotiate off the rate card;
     • no unlock/credit gate on the card itself. These creators applied to the
       brand, so the details are open. Identity still follows search: the photo
       shows, the name and @handle do not, and those are revealed by the
       existing 1-credit unlock on the full profile. */

const CARD_BG = "#2D0D1F";
const CARD_BOTTOM_BG = "#430B26";

export interface ApplicantCategory { id?: string; name: string }

export interface Applicant {
  id: string;
  creatorId?: string;
  followerCount: number | null;
  profilePhotoUrl?: string | null;
  audienceGenderFemale?: number | null;
  audienceGenderMale?: number | null;
  audienceAge?: string | null;
  audienceLocation?: string | null;
  creatorAge?: number | null;
  creatorState?: string | null;
  portfolioImages?: string[] | null;
  categories?: ApplicantCategory[] | null;
}

function formatFollowers(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** Name is masked on the card, so the fallback initial would leak a letter of
 *  it. Show a neutral glyph instead when there's no photo. */
function ApplicantAvatar({ photo, size = 48 }: { photo?: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  if (photo && !err) {
    return (
      <img
        src={photo} alt="Creator" loading="lazy" onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid rgba(240,24,122,0.30)" }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "rgba(240,24,122,0.15)", border: "1.5px solid rgba(240,24,122,0.30)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <UserRound style={{ width: size * 0.5, height: size * 0.5, color: PINK }} />
    </div>
  );
}

function MetaRow({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: PINK }} />
      <span className="text-[11.5px] leading-tight" style={{ color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>{text}</span>
    </div>
  );
}

export default function ApplicantCard({ app, footer }: {
  app: Applicant;
  /** Tab-specific actions (Shortlist, Unlock, Select…). Omitted = no action bar. */
  footer?: React.ReactNode;
}) {
  const cats = app.categories ?? [];
  const totalAud = (app.audienceGenderFemale ?? 0) + (app.audienceGenderMale ?? 0);
  const femPct = totalAud > 0 ? Math.round(((app.audienceGenderFemale ?? 0) / totalAud) * 100) : null;
  const genderText = femPct !== null ? `${femPct}% Female ${100 - femPct}% Male` : null;
  const images = (app.portfolioImages ?? []).slice(0, 4);

  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: CARD_BG, border: "1px solid rgba(255,255,255,0.15)" }}>
      <div className="p-4">
        {/* Row 1: avatar + followers. No name/handle — masked until unlock. */}
        <div className="flex items-center gap-3 mb-3">
          <ApplicantAvatar photo={app.profilePhotoUrl} size={48} />
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 flex-shrink-0" style={{ color: PINK }} />
            <span className="font-bold text-xl" style={{ color: "white", fontFamily: POPPINS }}>
              {formatFollowers(app.followerCount)}{" "}
              <span className="text-base font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>followers</span>
            </span>
          </div>
        </div>

        {/* Row 2: content categories */}
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {cats.map((cat, i) => (
              <span
                key={cat.id ?? `${cat.name}-${i}`}
                className="px-3 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: "rgba(240,24,122,0.22)", color: "white", border: "1px solid rgba(240,24,122,0.35)", fontFamily: POPPINS }}
              >
                {cat.name}
              </span>
            ))}
          </div>
        )}

        {/* Row 3: creator + audience meta, two columns (no pricing) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex flex-col gap-2">
            {app.creatorAge != null && <MetaRow icon={UserRound} text={`Creator Age- ${app.creatorAge} years`} />}
            {app.creatorState && <MetaRow icon={MapPin} text={`Creator Location- ${app.creatorState}, India`} />}
          </div>
          <div className="flex flex-col gap-2">
            {genderText && <MetaRow icon={UserCheck} text={`Audience- ${genderText}`} />}
            {app.audienceAge && <MetaRow icon={CalendarRange} text={`Audience Age- ${app.audienceAge}`} />}
            {app.audienceLocation && <MetaRow icon={Globe} text={`Audience Location- ${app.audienceLocation}`} />}
          </div>
        </div>
      </div>

      {/* 4-image content strip — always four slots so rows stay aligned. */}
      <div className="px-3 pb-3">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => {
            const src = images[i];
            return src ? (
              <div key={i} className="rounded-xl overflow-hidden aspect-square">
                <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div key={i} className="rounded-xl aspect-square" style={{ background: "rgba(255,255,255,0.06)" }} />
            );
          })}
        </div>
      </div>

      {footer && (
        <div className="px-4 py-3" style={{ background: CARD_BOTTOM_BG }}>
          {footer}
        </div>
      )}
    </div>
  );
}
