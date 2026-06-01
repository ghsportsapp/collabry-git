import type { LandingContentHook } from "@/hooks/useLandingContent";

interface TeamMember {
  name: string;
  role?: string;
  color?: string;
  photoUrl?: string;
  imageUrl?: string;
  image?: string;
  emoji?: string;
}

interface Props {
  content?: LandingContentHook;
}

export default function TeamSection({ content }: Props) {
  const members: TeamMember[] = (() => {
    try {
      const raw = content?.getJson<TeamMember[]>("team.members");
      return Array.isArray(raw) ? raw.filter((m) => m?.name?.trim()) : [];
    } catch {
      return [];
    }
  })();

  // Only show skeleton when truly no data yet (first load with no cache)
  const showSkeleton = content?.loading === true && members.length === 0;

  if (!showSkeleton && members.length === 0) return null;

  return (
    <section className="py-14 lg:py-20">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-10 lg:mb-14">
          <h2 className="text-2xl lg:text-[44px] font-bold text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Meet the <span className="text-[#E14F69]">Collabry</span> Team
          </h2>
        </div>

        {showSkeleton ? (
          <div className="flex flex-nowrap justify-between gap-3 lg:justify-center lg:gap-8">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex flex-col items-center animate-pulse flex-1 min-w-0 lg:flex-none">
                <div className="w-20 h-20 lg:w-36 lg:h-36 rounded-full bg-white/5" />
                <div className="text-center mt-3 lg:mt-5 space-y-2 w-full">
                  <div className="h-3 w-16 bg-white/5 rounded mx-auto" />
                  <div className="h-2 w-12 bg-white/5 rounded mx-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-nowrap justify-between gap-3 lg:justify-center lg:gap-8">
            {members.map((member, i) => {
              const photo = member.photoUrl ?? member.imageUrl ?? member.image;
              return (
                <div key={i} className="flex flex-col items-center flex-1 min-w-0 lg:flex-none">
                  <div
                    className="w-20 h-20 lg:w-36 lg:h-36 rounded-full overflow-hidden flex items-center justify-center shadow-2xl border-2 border-white/10 flex-shrink-0"
                    style={{ backgroundColor: member.color ?? "#1a1a25" }}
                  >
                    {photo ? (
                      <img src={photo} alt={member.name} className="w-full h-full object-cover" loading="eager" decoding="async" />
                    ) : (
                      <span className="text-2xl lg:text-4xl font-bold text-white/80 select-none leading-none">
                        {member.name.trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-center mt-3 lg:mt-5 w-full">
                    <h4 className="text-white font-bold text-[11px] sm:text-sm lg:text-base leading-tight break-words" style={{ fontFamily: "'Poppins', sans-serif" }}>{member.name}</h4>
                    {member.role && <p className="text-[#9CA3AF] text-[10px] lg:text-[13px] mt-1 leading-tight break-words" style={{ fontFamily: "'Poppins', sans-serif" }}>{member.role}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
