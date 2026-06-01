import { type ReactNode, useState } from "react";
import type { LandingContentHook } from "@/hooks/useLandingContent";

const POPPINS = "'Poppins', sans-serif";

function IllustrationProfile() {
  return (
    <svg viewBox="0 0 120 90" className="w-full h-full" fill="none">
      <rect x="8" y="6" width="90" height="70" rx="10" fill="#1e1e2e" stroke="#2a2a3e" strokeWidth="1.5"/>
      <circle cx="32" cy="30" r="14" fill="#2a1a30"/>
      <circle cx="32" cy="25" r="7" fill="#E14F69"/>
      <ellipse cx="32" cy="38" rx="10" ry="6" fill="#E14F69" opacity="0.6"/>
      <rect x="52" y="20" width="36" height="4" rx="2" fill="#3a3a4e"/>
      <rect x="52" y="28" width="28" height="4" rx="2" fill="#2e2e3e"/>
      <rect x="52" y="36" width="32" height="4" rx="2" fill="#2e2e3e"/>
      <path d="M8 57h90v9a10 10 0 01-10 10H18a10 10 0 01-10-10V57z" fill="#E14F69"/>
      <circle cx="24" cy="66" r="5" fill="white" opacity="0.25"/>
      <rect x="34" y="63" width="46" height="4" rx="2" fill="white" opacity="0.8"/>
      <rect x="34" y="70" width="30" height="3" rx="1.5" fill="white" opacity="0.4"/>
    </svg>
  );
}

function IllustrationChooseMode() {
  return (
    <svg viewBox="0 0 110 90" className="w-full h-full" fill="none">
      <rect x="8" y="6" width="94" height="78" rx="10" fill="#1e1e2e" stroke="#2a2a3e" strokeWidth="1.5"/>
      <rect x="16" y="16" width="36" height="28" rx="7" fill="#E14F69"/>
      <text x="34" y="35" textAnchor="middle" fontSize="15" fill="white" fontWeight="bold">A</text>
      <rect x="58" y="16" width="36" height="28" rx="7" fill="#2a2a3e"/>
      <text x="76" y="35" textAnchor="middle" fontSize="15" fill="#666" fontWeight="bold">B</text>
      <rect x="16" y="50" width="36" height="28" rx="7" fill="#2a2a3e"/>
      <text x="34" y="69" textAnchor="middle" fontSize="15" fill="#666" fontWeight="bold">C</text>
      <rect x="58" y="50" width="36" height="28" rx="7" fill="#2a2a3e"/>
      <text x="76" y="69" textAnchor="middle" fontSize="15" fill="#666" fontWeight="bold">D</text>
    </svg>
  );
}

function IllustrationConnect() {
  return (
    <svg viewBox="0 0 130 90" className="w-full h-full" fill="none">
      <rect x="2" y="10" width="40" height="66" rx="8" fill="#1e1e2e" stroke="#2a2a3e" strokeWidth="1.5"/>
      <rect x="8" y="18" width="28" height="18" rx="5" fill="#E14F69" opacity="0.2"/>
      <circle cx="22" cy="27" r="7" fill="#E14F69"/>
      <circle cx="22" cy="24" r="3" fill="white"/>
      <ellipse cx="22" cy="33" rx="5" ry="3" fill="white" opacity="0.7"/>
      <rect x="8" y="42" width="28" height="3" rx="1.5" fill="#333"/>
      <rect x="8" y="49" width="20" height="3" rx="1.5" fill="#2a2a3e"/>
      <rect x="88" y="10" width="40" height="66" rx="8" fill="#1e1e2e" stroke="#2a2a3e" strokeWidth="1.5"/>
      <rect x="94" y="18" width="28" height="18" rx="5" fill="#E14F69" opacity="0.2"/>
      <circle cx="108" cy="27" r="7" fill="#E14F69"/>
      <circle cx="108" cy="24" r="3" fill="white"/>
      <ellipse cx="108" cy="33" rx="5" ry="3" fill="white" opacity="0.7"/>
      <rect x="94" y="42" width="28" height="3" rx="1.5" fill="#333"/>
      <path d="M44 43 Q65 25 86 43" stroke="#E14F69" strokeWidth="2" strokeDasharray="4 3" fill="none"/>
      <circle cx="65" cy="34" r="7" fill="#E14F69"/>
      <path d="M61 34l3.5 3.5 5.5-5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="52" cy="18" r="3" fill="#E14F69" opacity="0.5"/>
      <circle cx="78" cy="18" r="3" fill="#E14F69" opacity="0.5"/>
    </svg>
  );
}

function IllustrationPayment() {
  return (
    <svg viewBox="0 0 130 92" className="w-full h-full" fill="none">
      <rect x="20" y="8" width="68" height="76" rx="12" fill="#1e1e2e" stroke="#2a2a3e" strokeWidth="1.5"/>
      <rect x="26" y="18" width="56" height="3" rx="1.5" fill="#2a2a3e"/>
      <text x="54" y="36" textAnchor="middle" fontSize="7" fill="#6b7280">Amount Due</text>
      <text x="54" y="54" textAnchor="middle" fontSize="14" fill="white" fontWeight="bold">₹ 5,600</text>
      <rect x="28" y="67" width="52" height="12" rx="6" fill="#E14F69"/>
      <text x="54" y="76" textAnchor="middle" fontSize="7.5" fill="white" fontWeight="bold">Pay Now</text>
      <path d="M100 10 L112 16 L112 30 Q112 40 100 45 Q88 40 88 30 L88 16 Z" fill="#22c55e"/>
      <path d="M94 28l4.5 4.5 8-8" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IllustrationVerified() {
  return (
    <svg viewBox="0 0 100 90" className="w-full h-full" fill="none">
      <rect x="10" y="6" width="80" height="78" rx="16" fill="#E14F69"/>
      <path d="M50 18 L58 22 L66 20 L68 28 L75 33 L72 41 L75 49 L68 54 L66 62 L58 60 L50 64 L42 60 L34 62 L32 54 L25 49 L28 41 L25 33 L32 28 L34 20 L42 22 Z" fill="white" opacity="0.15"/>
      <path d="M50 20 L57 24 L64 22 L66 29 L72 33 L69.5 40 L72 47 L66 51 L64 58 L57 56 L50 60 L43 56 L36 58 L34 51 L28 47 L30.5 40 L28 33 L34 29 L36 22 L43 24 Z" fill="white" opacity="0.08"/>
      <path d="M36 42l9 9 18-18" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="78" cy="16" r="11" fill="#22c55e"/>
      <path d="M73 16l3.5 3.5 5.5-5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IllustrationMoneyBags() {
  return (
    <svg viewBox="0 0 130 90" className="w-full h-full" fill="none">
      <ellipse cx="42" cy="62" rx="26" ry="24" fill="#E14F69"/>
      <ellipse cx="88" cy="62" rx="26" ry="24" fill="#E14F69" opacity="0.85"/>
      <text x="42" y="68" textAnchor="middle" fontSize="18" fill="white" fontWeight="bold">₹</text>
      <text x="88" y="68" textAnchor="middle" fontSize="18" fill="white" fontWeight="bold">₹</text>
      <path d="M28 40 Q30 22 42 26 Q54 22 56 40" stroke="#c8106a" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M74 40 Q76 22 88 26 Q100 22 102 40" stroke="#c8106a" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <rect x="32" y="36" width="20" height="8" rx="4" fill="#a00d55"/>
      <rect x="78" y="36" width="20" height="8" rx="4" fill="#a00d55"/>
      <circle cx="42" cy="40" r="5" fill="#E14F69"/>
      <circle cx="88" cy="40" r="5" fill="#E14F69"/>
    </svg>
  );
}

const brandIllustrations: ReactNode[] = [
  <IllustrationProfile />,
  <IllustrationChooseMode />,
  <IllustrationConnect />,
  <IllustrationPayment />,
];

const creatorIllustrations: ReactNode[] = [
  <IllustrationProfile />,
  <IllustrationVerified />,
  <IllustrationConnect />,
  <IllustrationMoneyBags />,
];

function CurvedArrow() {
  return (
    <svg viewBox="0 0 80 28" className="w-14 h-5 flex-shrink-0" fill="none" preserveAspectRatio="xMidYMid meet">
      <path d="M4 14 Q20 4 40 14 Q60 24 76 14" stroke="#E14F69" strokeWidth="1.8" strokeDasharray="4 3" strokeLinecap="round" fill="none"/>
      <polygon points="73,10 80,14 73,18" fill="#E14F69"/>
    </svg>
  );
}

interface HowItWorksStepData {
  title: string;
  desc: string;
  image?: string;
}

interface StepRowProps {
  steps: HowItWorksStepData[];
  illustrations: ReactNode[];
}

function StepImage({ src, title, fallback }: { src: string; title: string; fallback: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) return <>{fallback}</>;

  return (
    <div className="relative w-full h-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          {fallback}
        </div>
      )}
      <img
        src={src}
        alt={title}
        className="w-full h-full object-contain rounded-xl"
        style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.3s ease" }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function StepIllustration({ step, fallback }: { step: HowItWorksStepData; fallback: ReactNode }) {
  if (step.image) {
    // key=step.image ensures state resets when src changes — prevents old image persisting
    return <StepImage key={step.image} src={step.image} title={step.title} fallback={fallback} />;
  }
  return <>{fallback}</>;
}

function StepRow({ steps, illustrations }: StepRowProps) {
  return (
    <>
      {/* Desktop: horizontal */}
      <div className="hidden lg:flex items-start">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start flex-1">
            <div className="flex flex-col items-center text-center flex-1 px-3">
              <div className="w-full max-w-[118px] h-[80px] mb-5 flex items-center justify-center">
                <StepIllustration step={step} fallback={illustrations[i]} />
              </div>
              <h4 className="text-white font-bold text-[14px] mb-2 leading-snug max-w-[110px]" style={{ fontFamily: POPPINS }}>{step.title}</h4>
              <p className="text-[#9CA3AF] text-[13px] leading-relaxed">{step.desc}</p>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-shrink-0 mt-10">
                <CurvedArrow />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile: vertical with pink dashed connector line on left */}
      <div className="flex flex-col lg:hidden">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-4 relative">
            <div className="flex flex-col items-center flex-shrink-0 w-14">
              <div className="w-14 h-14 flex items-center justify-center">
                <StepIllustration step={step} fallback={illustrations[i]} />
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 w-px my-1" style={{
                  background: "repeating-linear-gradient(to bottom, #E14F69 0px, #E14F69 5px, transparent 5px, transparent 10px)"
                }} />
              )}
            </div>
            <div className="flex-1 pt-1 pb-6">
              <h4 className="text-white font-bold text-sm mb-1 leading-snug max-w-[150px]" style={{ fontFamily: POPPINS }}>{step.title}</h4>
              <p className="text-[#9CA3AF] text-xs leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function renderMainHeading(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return <>{text}</>;
  const last = words[words.length - 1];
  const rest = words.slice(0, -1).join(" ");
  return <>{rest} <span className="text-[#E14F69]">{last}</span></>;
}

function renderSectionHeading(text: string) {
  return text.split(/(Collabry)/).map((part, i) =>
    part === "Collabry" ? <span key={i} className="text-[#E14F69]">{part}</span> : part
  );
}

interface Props {
  content?: LandingContentHook;
  brandsOnly?: boolean;
  creatorsOnly?: boolean;
  subtitleOverride?: string;
  brandStepsOverride?: HowItWorksStepData[];
  creatorStepsOverride?: HowItWorksStepData[];
}

export default function HowItWorks({ content, brandsOnly, creatorsOnly, subtitleOverride, brandStepsOverride, creatorStepsOverride }: Props) {
  const mainHeading = content?.get("how_it_works.title") ?? "How it Works?";
  const subtitle = subtitleOverride ?? content?.get("how_it_works.subtitle") ?? "Simple for Everyone. Powerful for Results.";
  const brandSectionHeading = content?.get("how_it_works.brand_section_heading") ?? "How Collabry works for Brands?";
  const creatorSectionHeading = content?.get("how_it_works.creator_section_heading") ?? "How Collabry works for Creators?";

  const brandSteps: HowItWorksStepData[] = brandStepsOverride ?? (content
    ? content.getJson<HowItWorksStepData[]>("how_it_works.brand_steps")
    : [
        { title: "Sign Up Free", desc: "Create your brand account and get free credits to start exploring." },
        { title: "Choose Your Mode", desc: "Search manually, use AI Matchmaking, post a Campaign, or offer Barter." },
        { title: "Connect and Collaborate", desc: "Unlock creator profiles, review their portfolio, and send your brief directly." },
        { title: "Pay Only on Approval", desc: "Your payment stays in escrow until you approve the content. Zero risk." },
      ]) ?? [];

  const creatorSteps: HowItWorksStepData[] = creatorStepsOverride ?? (content
    ? content.getJson<HowItWorksStepData[]>("how_it_works.creator_steps")
    : [
        { title: "Create Your Profile", desc: "Set your rates for reels, stories and posts. Upload your portfolio. Connect your Instagram." },
        { title: "Get Verified", desc: "Our team reviews every creator before they go live. Only real, genuine creators make it in." },
        { title: "Connect and Collaborate", desc: "Receive direct requests from brands, apply to open campaigns, or get discovered through AI-powered matching." },
        { title: "Get Paid Securely", desc: "Your payment is held in escrow and released the moment your content goes live. No delays. Just earnings." },
      ]) ?? [];

  return (
    <section className="py-10 lg:py-14">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-10 lg:mb-14">
          <h2 className="text-3xl lg:text-[46px] font-bold text-white" style={{ fontFamily: POPPINS }}>
            {renderMainHeading(mainHeading)}
          </h2>
          <p className="text-[#9CA3AF] mt-3 text-sm lg:text-base">{subtitle}</p>
        </div>

        <div className="flex flex-col gap-6">
          {!creatorsOnly && (
            <div className="rounded-2xl p-6 lg:p-10 bg-[#111118] border border-white/10 shadow-[0px_8px_80px_rgba(240,24,122,0.12)]">
              <div className="text-center mb-6 lg:mb-10">
                <h3 className="text-white font-semibold text-base lg:text-[22px]" style={{ fontFamily: POPPINS }}>
                  {renderSectionHeading(brandSectionHeading)}
                </h3>
              </div>
              <StepRow steps={brandSteps} illustrations={brandIllustrations} />
            </div>
          )}

          {!brandsOnly && (
            <div className="rounded-2xl p-6 lg:p-10 bg-[#111118] border border-white/10 shadow-[0px_8px_80px_rgba(240,24,122,0.12)]">
              <div className="text-center mb-6 lg:mb-10">
                <h3 className="text-white font-semibold text-base lg:text-[22px]" style={{ fontFamily: POPPINS }}>
                  {renderSectionHeading(creatorSectionHeading)}
                </h3>
              </div>
              <StepRow steps={creatorSteps} illustrations={creatorIllustrations} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
