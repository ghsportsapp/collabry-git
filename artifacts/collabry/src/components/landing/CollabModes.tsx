import type { LandingContentHook } from "@/hooks/useLandingContent";

const POPPINS = "'Poppins', sans-serif";

interface CollabCard {
  num: string;
  title: string;
  desc: string;
  steps: string[];
}

const defaultCards: CollabCard[] = [
  {
    num: "01",
    title: "Search",
    desc: "Browse verified creators manually. Filter by category, niche, audience, price range, and rating. Full control. Zero guesswork.",
    steps: ["Browse Creators", "Filter and Refine", "Unlock Profile", "Collaborate"],
  },
  {
    num: "02",
    title: "AI Matchmaking",
    desc: "Tell us your campaign goal and target audience. Our algorithm scores every creator out of 100 and ranks the best matches for you.",
    steps: ["Fill Campaign Brief", "AI Scores Creators", "View Ranked Results", "Collaborate"],
  },
  {
    num: "03",
    title: "Campaign",
    desc: "Post your campaign brief and fixed price. Creators apply to you. Review applicants, shortlist for free, and select the best fit.",
    steps: ["Post Your Brief", "Creators Apply", "Shortlist and Filter", "Collaborate"],
  },
  {
    num: "04",
    title: "Barter",
    desc: "No cash budget? No problem. Offer your product instead of payment. Creator gets the product. You get the content.",
    steps: ["Offer Your Product", "Creators Apply", "Select Your Match", "Collaborate"],
  },
];

interface Props {
  content?: LandingContentHook;
  headingLine?: string;
  headingHighlight?: string;
  subheading?: string;
  cardsOverride?: CollabCard[];
}

export default function CollabModes({ content, headingLine, headingHighlight, subheading, cardsOverride }: Props) {
  const cards = cardsOverride ?? (content
    ? content.getJson<CollabCard[]>("collab_modes.modes")
    : defaultCards);

  const displayHeadingLine = headingLine ?? content?.get("collab_modes.heading_line1") ?? "4 Ways to";
  const displayHighlight = headingHighlight ?? content?.get("collab_modes.heading_highlight1") ?? "Collaborate";
  const displaySubheading = subheading ?? content?.get("collab_modes.subheading") ?? "One Platform. Four Powerful Ways to Connect.";

  return (
    <section className="py-10 lg:py-14" style={{ background: "#252525" }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-8 lg:mb-12">
          <h2 className="text-2xl lg:text-[46px] font-bold text-white" style={{ fontFamily: POPPINS }}>
            {displayHeadingLine} <span className="text-[#E14F69]">{displayHighlight}</span>
          </h2>
          <p className="text-[#9CA3AF] mt-3 text-sm lg:text-base">
            {displaySubheading}
          </p>
        </div>

        <div className="flex flex-col gap-5 lg:gap-6">
          {cards.map((card) => (
            <div
              key={card.num}
              className="rounded-xl border border-white/20 bg-black shadow-[0_2px_24px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              {/* ── Desktop layout ── */}
              <div className="hidden lg:flex flex-col px-10 py-10 gap-6">
                <h3
                  className="text-white font-bold text-[26px] leading-tight"
                  style={{ fontFamily: POPPINS }}
                >
                  {card.num}. {card.title}
                </h3>

                <p className="text-[#9CA3AF] text-[15px] leading-relaxed max-w-3xl">
                  {card.desc}
                </p>

                {/* Step flow — single line, no wrapping */}
                <div className="flex items-center w-full mt-2 gap-0">
                  {card.steps.map((step, i) => (
                    <div key={i} className="flex items-center flex-1 min-w-0">
                      <span
                        className="text-white/80 text-[14px] whitespace-nowrap"
                        style={{ fontFamily: POPPINS }}
                      >
                        {step}
                      </span>
                      {i < card.steps.length - 1 && (
                        <div className="flex-1 mx-4 flex items-center min-w-[40px]">
                          <svg
                            viewBox="0 0 200 16"
                            className="w-full h-4"
                            fill="none"
                            preserveAspectRatio="none"
                          >
                            <path
                              d="M4 8 Q60 2 100 8 Q140 14 196 8"
                              stroke="#555"
                              strokeWidth="1.5"
                              strokeDasharray="2 5"
                              strokeLinecap="round"
                              fill="none"
                            />
                            <polygon points="190,4 200,8 190,12" fill="#555" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Mobile layout — vertical steps with dot connectors ── */}
              <div className="lg:hidden px-5 pt-6 pb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[#E14F69] font-bold text-xl" style={{ fontFamily: POPPINS }}>{card.num}.</span>
                  <h3 className="text-white font-bold text-xl tracking-wide" style={{ fontFamily: POPPINS }}>
                    {card.title.toUpperCase()}
                  </h3>
                </div>
                <p className="text-[#9CA3AF] text-sm leading-relaxed mb-5">
                  {card.desc}
                </p>
                <div className="flex flex-col">
                  {card.steps.map((step, i) => (
                    <div key={i} className="flex flex-col items-start">
                      <span className="text-white/85 text-[15px] font-medium" style={{ fontFamily: POPPINS }}>{step}</span>
                      {i < card.steps.length - 1 && (
                        <span className="text-white/70 text-xs pl-0.5 my-1 leading-none select-none">·</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
