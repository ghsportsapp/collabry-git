import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Search, Heart, Megaphone, RefreshCcw,
  ChevronDown, ChevronUp, CheckCircle, X, ArrowRight, Sparkles,
  PenLine, HelpCircle, Video,
} from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import TeamSection from "@/components/landing/TeamSection";
import HowItWorks from "@/components/landing/HowItWorks";
import ComparisonTable from "@/components/landing/ComparisonTable";
import { useLandingContent } from "@/hooks/useLandingContent";
import { useCreatorLandingContent } from "@/hooks/useCreatorLandingContent";
import { useSupportEmail } from "@/hooks/useSupportEmail";
import { CreatorLayout, PINK, BG, POPPINS } from "@/components/CreatorNavLayout";
import PaymentCelebrationPopup from "@/components/PaymentCelebrationPopup";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
function apiFetch(token: string, path: string, opts?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
}

/* ─── Toast ─── */
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }, []);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-white text-sm max-w-xs text-center shadow-lg"
      style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", fontFamily: POPPINS }}>
      {message}
    </div>
  );
}

/* ─── Greeting ─── */
function Greeting({ home, subtitle }: { home: any; subtitle: string }) {
  return (
    <div className="px-4 flex items-center gap-3">
      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2" style={{ borderColor: `${PINK}55` }}>
        {home.profilePhotoUrl
          ? <img src={home.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg" style={{ background: PINK }}>{home.fullName?.[0] ?? "C"}</div>}
      </div>
      <div>
        <p className="text-white text-sm font-bold" style={{ fontFamily: POPPINS }}>
          Hi, <span style={{ color: PINK }}>@{home.instagramHandle}!</span>
        </p>
        <p className="text-white/75 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>{subtitle}</p>
      </div>
    </div>
  );
}

/* ─── Complete Profile Section (shared) ─── */
const PROFILE_ITEM_META: Record<string, { icon: React.ElementType; label: string; action: string; href?: string; scrollId?: string }> = {
  bio:           { icon: PenLine,     label: "Tell brands about yourself",    action: "Add Bio →",      href: "/home-creator/profile?edit=true&section=bio" },
  fun_questions: { icon: HelpCircle,  label: "Answer some fun questions",     action: "Answer Now →",   scrollId: "fun-questions-section" },
  portfolio:     { icon: Video,       label: "Showcase your best content",    action: "Add Videos →",   href: "/home-creator/profile?edit=true&section=videos" },
};

function CompleteProfileSection({ incomplete, onNavigate }: { incomplete: string[]; onNavigate: (p: string) => void }) {
  const items = incomplete.filter(k => k !== "kyc").map(k => PROFILE_ITEM_META[k]).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="mx-4 lg:mx-0 rounded-2xl p-4 lg:p-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h3 className="text-white font-semibold text-sm lg:text-base mb-3 lg:mb-4" style={{ fontFamily: POPPINS }}>Complete Your Profile — Increase your chances of getting a collab by 80%</h3>
      <div className="space-y-3">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${PINK}1A`, border: `1px solid ${PINK}55` }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: PINK }} />
              </div>
              <p className="text-white/75 text-xs lg:text-sm" style={{ fontFamily: POPPINS }}>{item.label}</p>
              <button
                onClick={() => item.scrollId
                  ? document.getElementById(item.scrollId)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  : item.href && onNavigate(item.href)}
                className="text-xs lg:text-sm font-semibold ml-2 flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                style={{ color: PINK, fontFamily: POPPINS }}
              >
                {item.action}
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => onNavigate("/home-creator/profile?edit=true")}
        className="w-full lg:w-auto lg:px-8 mt-4 lg:mt-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
        style={{ border: `1px solid ${PINK}`, color: PINK, fontFamily: POPPINS }}
      >
        Edit Profile
      </button>
    </div>
  );
}

/* ─── How Brands Find You ─── */
interface AccordionItem { icon: React.ReactNode; title: string; body: string; steps: string[]; }

function AccordionCard({ item, isOpen, onToggle }: { item: AccordionItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: isOpen ? PINK : "rgba(255,255,255,0.05)", border: `1px solid ${isOpen ? "transparent" : "rgba(255,255,255,0.08)"}`, transition: "background 0.25s ease" }}>
      <button className="w-full flex items-center gap-3 px-4 py-3.5" onClick={onToggle}>
        <span className="text-white">{item.icon}</span>
        <span className="text-white font-semibold text-sm flex-1 text-left" style={{ fontFamily: POPPINS }}>{item.title}</span>
        <span className="text-white text-[11px] border border-white/40 rounded-full px-3 py-1 flex items-center gap-1" style={{ fontFamily: POPPINS }}>
          Learn more {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>
      <div style={{ maxHeight: isOpen ? "280px" : "0", overflow: "hidden", transition: "max-height 0.35s ease, opacity 0.3s ease", opacity: isOpen ? 1 : 0 }}>
        <div className="px-4 pb-4">
          <div className="bg-white rounded-xl p-3">
            <p className="text-black/80 text-xs leading-relaxed mb-3" style={{ fontFamily: POPPINS }}>{item.body}</p>
            <div className="overflow-x-auto">
              <div className="flex items-center" style={{ flexWrap: "nowrap", minWidth: "max-content" }}>
                {item.steps.map((step, i) => (
                  <div key={i} className="flex items-center">
                    <p className="text-black/70 text-[10px] text-center font-medium whitespace-nowrap px-1" style={{ fontFamily: POPPINS }}>{step}</p>
                    {i < item.steps.length - 1 && (
                      <div className="flex items-center">
                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: PINK }} />
                        <div className="w-5 border-t border-dashed flex-shrink-0" style={{ borderColor: PINK }} />
                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: PINK }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ACCORDION_ITEMS: AccordionItem[] = [
  { icon: <Search className="w-4 h-4" />, title: "Search", body: "Browse verified creators manually. Filter by category, niche, audience, price range, and rating. Full control. Zero guesswork.", steps: ["Browse Creators", "Filter and Refine", "Unlock Profile", "Collaborate"] },
  { icon: <Heart className="w-4 h-4" />, title: "Matchmaking", body: "Tell us your campaign goal and target audience. Our algorithm scores every creator out of 100 and ranks the best matches for you.", steps: ["Fill Brief", "AI Scores", "View Ranked", "Collaborate"] },
  { icon: <Megaphone className="w-4 h-4" />, title: "Campaign", body: "Post your campaign brief and fixed price. Creators apply to you. Review applicants, shortlist for free, and select the best fit.", steps: ["Post Your Brief", "Creators Apply", "Shortlist & Filter", "Collaborate"] },
  { icon: <RefreshCcw className="w-4 h-4" />, title: "Barter", body: "No cash budget? No problem. Offer your product instead of payment. Creator gets the product. You get the content.", steps: ["Offer Product", "Creators Apply", "Select Match", "Collaborate"] },
];

function BrandsSection({ open, setOpen }: { open: number | null; setOpen: (v: number | null) => void }) {
  return (
    <div className="px-4 lg:px-0 space-y-3">
      {/* Mobile heading (unchanged) */}
      <h2 className="lg:hidden text-white font-bold text-base text-center" style={{ fontFamily: POPPINS }}>Did you know how brands find you?</h2>
      <p className="lg:hidden text-white/80 text-xs text-center mb-3" style={{ fontFamily: POPPINS }}>Brands can find you 4 ways</p>
      {/* Desktop heading (matches "How it Works?" style) */}
      <div className="hidden lg:block text-center mb-6 lg:mb-10">
        <h2 className="text-3xl lg:text-[46px] font-bold text-white leading-tight" style={{ fontFamily: POPPINS }}>
          Did you know how <span style={{ color: PINK }}>brands</span> find you?
        </h2>
        <p className="text-white/80 text-sm mt-3" style={{ fontFamily: POPPINS }}>Brands can find you 4 ways</p>
      </div>
      {ACCORDION_ITEMS.map((item, i) => (
        <AccordionCard key={i} item={item} isOpen={open === i} onToggle={() => setOpen(open === i ? null : i)} />
      ))}
    </div>
  );
}

/* ─── Fun Questions shared component ─── */
function FunQuestionsSection({ token, onToast }: { token: string; onToast: (msg: string) => void }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [savedAnswers, setSavedAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(token, "/api/creator/fun-questions").then(r => r.json()).then(d => {
      const qs = d.questions ?? [];
      setQuestions(qs);
      const answers: Record<string, string> = {};
      qs.forEach((q: any) => { if (q.selectedOptionId) answers[q.id] = q.selectedOptionId; });
      setLocalAnswers(answers);
      setSavedAnswers(answers);
    }).finally(() => setLoading(false));
  }, []);

  const hasChanges = Object.keys(localAnswers).some(id => localAnswers[id] !== savedAnswers[id]) ||
    Object.keys(questions.reduce((acc: any, q: any) => { acc[q.id] = true; return acc; }, {}))
      .some(id => localAnswers[id] && !savedAnswers[id]);

  const selectOption = (questionId: string, optionId: string) => {
    setLocalAnswers(prev => ({ ...prev, [questionId]: optionId }));
  };

  const saveFunQs = async () => {
    setSaving(true);
    const changed = Object.entries(localAnswers).filter(([id, optId]) => savedAnswers[id] !== optId);
    for (const [questionId, optionId] of changed) {
      await apiFetch(token, "/api/creator/fun-answers", { method: "PATCH", body: JSON.stringify({ questionId, optionId }) });
    }
    setSavedAnswers({ ...localAnswers });
    setSaving(false);
    onToast("Fun answers saved!");
  };

  if (loading) return null;
  if (questions.length === 0) return null;

  const unanswered = questions.filter(q => !localAnswers[q.id]).length;

  return (
    <div className="space-y-3 lg:space-y-6">
      {/* Desktop heading + subheading */}
      <div className="hidden lg:block text-center">
        <h2 className="text-3xl lg:text-[46px] font-bold text-white leading-tight" style={{ fontFamily: POPPINS }}>
          Fun <span style={{ color: PINK }}>Questions</span>
        </h2>
        <p className="text-white/80 text-sm mt-3" style={{ fontFamily: POPPINS }}>
          Help brands match you with the perfect campaigns
        </p>
      </div>
    <div className="mx-4 lg:mx-0 rounded-2xl p-5 lg:p-7" style={{ background: unanswered > 0 ? "rgba(240,24,122,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${unanswered > 0 ? "rgba(240,24,122,0.30)" : "rgba(255,255,255,0.07)"}` }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2 text-sm" style={{ fontFamily: POPPINS }}>
          <Sparkles className="w-4 h-4" style={{ color: PINK }} /> Fun Questions
        </h3>
        {unanswered > 0
          ? <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: PINK, fontFamily: POPPINS }}>{unanswered} pending</span>
          : <span className="text-xs px-2 py-0.5 rounded-full text-green-300" style={{ background: "rgba(34,197,94,0.15)", fontFamily: POPPINS }}><CheckCircle className="w-3 h-3 inline mr-0.5" />All done</span>
        }
      </div>
      <div className="space-y-5">
        {questions.map((q: any) => (
          <div key={q.id}>
            <p className="text-white text-sm font-medium mb-2.5" style={{ fontFamily: POPPINS }}>{q.questionText}</p>
            <div className="grid grid-cols-2 gap-2">
              {q.options.map((opt: any) => {
                const sel = localAnswers[q.id] === opt.id;
                const wasSaved = savedAnswers[q.id] === opt.id;
                return (
                  <button key={opt.id} onClick={() => selectOption(q.id, opt.id)}
                    className="text-left px-3 py-2.5 rounded-xl text-xs transition-all"
                    style={{
                      background: sel ? PINK : "rgba(255,255,255,0.04)",
                      color: sel ? "white" : "rgba(255,255,255,0.90)",
                      border: `1px solid ${sel ? PINK : (wasSaved && !sel ? "rgba(240,24,122,0.30)" : "rgba(255,255,255,0.10)")}`,
                      fontWeight: sel ? 600 : 400,
                      fontFamily: POPPINS,
                    }}>
                    {opt.optionText}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={saveFunQs}
        disabled={!hasChanges || saving}
        className="w-full mt-5 py-3 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: hasChanges ? PINK : "rgba(255,255,255,0.06)",
          color: hasChanges ? "white" : "rgba(255,255,255,0.70)",
          fontFamily: POPPINS,
          cursor: hasChanges ? "pointer" : "not-allowed",
        }}>
        {saving ? "Saving..." : "Save Answers"}
      </button>
    </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ACTIVE HOME
══════════════════════════════════════════════════════════════════ */
function ActiveHome({ home, token, onNavigate, onLocked, content }: { home: any; token: string; onNavigate: (p: string) => void; onLocked: (m: string) => void; content: any }) {
  const [bannerVisible, setBannerVisible] = useState(!home.approvalBannerDismissed);
  const [open, setOpen] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const dismiss = async () => {
    setBannerVisible(false);
    try { await apiFetch(token, "/api/creator/dismiss-approval-banner", { method: "PATCH" }); } catch {}
  };

  const incomplete = (home.pendingProfileSections ?? []) as string[];

  return (
    <div className="space-y-4 lg:space-y-7 pt-1 lg:pt-6 pb-6">
      {bannerVisible && (
        <div className="mx-4 lg:mx-0 flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
          style={{ background: "rgba(22,163,74,0.12)", border: "1px solid rgba(22,163,74,0.40)" }}>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-green-300 text-sm font-semibold" style={{ fontFamily: POPPINS }}>Profile Approved!</span>
          </div>
          <button onClick={dismiss}><X className="w-4 h-4 text-green-400/60 hover:text-green-300" /></button>
        </div>
      )}

      {/* Creator header */}
      <Greeting home={home} subtitle="Welcome back! Here's your dashboard." />

      {/* My Earnings + History toggle */}
      <div className="mx-4 lg:mx-0 flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2.5 lg:py-3 rounded-xl"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-white text-sm lg:text-base truncate" style={{ fontFamily: POPPINS }}>
            My Earnings : <span className="font-bold">₹{(home.totalEarned ?? 0).toLocaleString("en-IN")}</span>
          </span>
        </div>
        <button onClick={() => onNavigate("/home-creator/earnings")}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
          History <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Stats */}
      <div className="mx-4 lg:mx-0 grid grid-cols-4 gap-2 lg:gap-4">
        {[
          { val: String(home.totalDeals ?? 0).padStart(2, "0"), label: "Total Deals" },
          { val: String(home.activeDeals ?? 0).padStart(2, "0"), label: "Active Deals" },
          { val: String(home.pendingRequests ?? 0).padStart(2, "0"), label: "Pending Requests" },
          { val: String(home.averageRating ?? 0), label: "Rating/5" },
        ].map((s, i) => (
          <div key={i} className="rounded-xl py-3 lg:py-5 px-1 flex flex-col items-center justify-center"
            style={{ background: PINK }}>
            <p className="text-white font-bold text-xl lg:text-3xl leading-none mb-1" style={{ fontFamily: POPPINS }}>{s.val}</p>
            <p className="text-white/90 text-[9px] lg:text-xs text-center leading-tight font-medium px-0.5" style={{ fontFamily: POPPINS }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Complete Profile */}
      <CompleteProfileSection incomplete={incomplete} onNavigate={onNavigate} />

      {/* Did you know how brands find you */}
      <BrandsSection open={open} setOpen={setOpen} />

      {/* Fun Questions */}
      <div id="fun-questions-section"><FunQuestionsSection token={token} onToast={msg => setToast(msg)} /></div>

      {/* How It Works (creator only) */}
      <div className="overflow-hidden">
        <HowItWorks content={content} creatorsOnly />
      </div>

      {/* Old Way vs Collabry Way */}
      <CreatorComparisonSection />

      <TeamSection />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function CreatorComparisonSection() {
  const c = useCreatorLandingContent();
  return <ComparisonTable rows={c.getJson("creator.comparison.rows")} />;
}

/* ══════════════════════════════════════════════════════════════════
   PENDING HOME
══════════════════════════════════════════════════════════════════ */
function PendingHome({ home, token, onNavigate, onLocked, content }: { home: any; token: string; onNavigate: (p: string) => void; onLocked: (m: string) => void; content: any }) {
  const [open, setOpen] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const incomplete = (home.pendingProfileSections ?? []) as string[];

  return (
    <div className="space-y-4 pt-1 pb-6">
      {/* Amber banner */}
      <div className="mx-4 flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: "rgba(180,100,0,0.18)", border: "1px solid rgba(245,158,11,0.45)" }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f59e0b" }} />
        <span className="text-amber-300 text-sm font-semibold" style={{ fontFamily: POPPINS }}>
          Profile Under Review. 24–72 hours to review
        </span>
      </div>

      <Greeting home={home} subtitle="Complete profile while you wait." />

      {/* What Happens Next – card */}
      <div className="mx-4 rounded-2xl p-5 overflow-hidden" style={{ background: "rgba(240,24,122,0.15)" }}>
        <h3 className="font-bold text-sm mb-5" style={{ fontFamily: POPPINS, color: "#fff" }}>What Happens Next</h3>
        <div className="flex items-start">
          {[
            {
              num: "01", label: "Review",
              svg: (
                <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
                  <rect x="8" y="18" width="46" height="36" rx="5" fill="#E14F69" fillOpacity="0.15" stroke="#E14F69" strokeWidth="1.5"/>
                  <rect x="15" y="25" width="32" height="22" rx="2" fill="#E14F69" fillOpacity="0.1"/>
                  <rect x="19" y="30" width="12" height="9" rx="2" fill="#E14F69" fillOpacity="0.4"/>
                  <circle cx="25" cy="33" r="3" fill="#E14F69" fillOpacity="0.7"/>
                  <rect x="35" y="30" width="10" height="1.5" rx="0.75" fill="#1a1a2e" fillOpacity="0.4"/>
                  <rect x="35" y="34" width="8" height="1.5" rx="0.75" fill="#1a1a2e" fillOpacity="0.3"/>
                  <rect x="35" y="38" width="9" height="1.5" rx="0.75" fill="#1a1a2e" fillOpacity="0.3"/>
                  <rect x="22" y="54" width="18" height="4" rx="1" fill="#E14F69" fillOpacity="0.3"/>
                  <rect x="10" y="58" width="42" height="3" rx="1.5" fill="#E14F69" fillOpacity="0.2"/>
                  <circle cx="59" cy="52" r="11" fill="none" stroke="#E14F69" strokeWidth="2.5"/>
                  <circle cx="59" cy="52" r="7" fill="#E14F69" fillOpacity="0.1"/>
                  <line x1="67" y1="60" x2="74" y2="67" stroke="#E14F69" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              )
            },
            {
              num: "02", label: "Approve",
              svg: (
                <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
                  <rect x="18" y="8" width="36" height="50" rx="5" fill="#E14F69" fillOpacity="0.12" stroke="#E14F69" strokeWidth="1.5" strokeOpacity="0.6"/>
                  <rect x="30" y="4" width="12" height="8" rx="3" fill="#E14F69" fillOpacity="0.7"/>
                  <rect x="25" y="20" width="22" height="2" rx="1" fill="#1a1a2e" fillOpacity="0.4"/>
                  <rect x="25" y="26" width="17" height="2" rx="1" fill="#1a1a2e" fillOpacity="0.3"/>
                  <rect x="25" y="32" width="20" height="2" rx="1" fill="#1a1a2e" fillOpacity="0.3"/>
                  <circle cx="48" cy="52" r="16" fill="#E14F69" fillOpacity="0.15"/>
                  <circle cx="48" cy="52" r="16" stroke="#E14F69" strokeWidth="2.5" fill="none"/>
                  <path d="M40 52 L46 58 L57 44" stroke="#E14F69" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )
            },
            {
              num: "03", label: "Earn",
              svg: (
                <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
                  <ellipse cx="15" cy="56" rx="10" ry="12" fill="#E14F69" fillOpacity="0.25"/>
                  <rect x="10" y="37" width="10" height="9" rx="3" fill="#E14F69" fillOpacity="0.35"/>
                  <ellipse cx="15" cy="37" rx="5" ry="2.5" fill="#E14F69" fillOpacity="0.45"/>
                  <text x="15" y="60" textAnchor="middle" fontSize="8" fill="white" fillOpacity="0.5">₹</text>
                  <ellipse cx="40" cy="58" rx="15" ry="18" fill="#E14F69"/>
                  <rect x="31" y="30" width="18" height="13" rx="4" fill="#E14F69"/>
                  <ellipse cx="40" cy="30" rx="9" ry="4" fill="#E14F69" fillOpacity="0.7"/>
                  <text x="40" y="63" textAnchor="middle" fontSize="14" fill="white" fontWeight="bold">₹</text>
                  <ellipse cx="65" cy="56" rx="10" ry="12" fill="#E14F69" fillOpacity="0.25"/>
                  <rect x="60" y="37" width="10" height="9" rx="3" fill="#E14F69" fillOpacity="0.35"/>
                  <ellipse cx="65" cy="37" rx="5" ry="2.5" fill="#E14F69" fillOpacity="0.45"/>
                  <text x="65" y="60" textAnchor="middle" fontSize="8" fill="white" fillOpacity="0.5">₹</text>
                  <circle cx="6" cy="22" r="2.5" fill="#E14F69" fillOpacity="0.4"/>
                  <circle cx="74" cy="18" r="2" fill="#E14F69" fillOpacity="0.3"/>
                </svg>
              )
            },
          ].map((s, i, arr) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex-1 flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl mb-2 p-1 bg-white shadow-sm overflow-hidden"
                  style={{ border: `2px solid ${i === 0 ? PINK : "#FFDBE9"}` }}>
                  {s.svg}
                </div>
                <p className="font-semibold text-[11px]" style={{ fontFamily: POPPINS, color: "#fff" }}>{s.num}</p>
                <p className="text-[10px]" style={{ fontFamily: POPPINS, color: "#fff" }}>{s.label}</p>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-shrink-0 w-8 border-t-2 border-dashed mb-8" style={{ borderColor: `${PINK}66` }} />
              )}
            </div>
          ))}
        </div>
        <p className="text-xs mt-4 text-center" style={{ fontFamily: POPPINS, color: "#fff" }}>
          Step 1: Our team reviews your profile within 24–72 hours
        </p>
      </div>

      {/* Complete Profile checklist */}
      <CompleteProfileSection incomplete={incomplete} onNavigate={onNavigate} />

      <BrandsSection open={open} setOpen={setOpen} />
      <div id="fun-questions-section"><FunQuestionsSection token={token} onToast={msg => setToast(msg)} /></div>
      <div className="overflow-hidden"><HowItWorks content={content} creatorsOnly /></div>
      <CreatorComparisonSection />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   REJECTED HOME
══════════════════════════════════════════════════════════════════ */
function RejectedHome({ home, token, onNavigate, onLocked, refresh, content }: { home: any; token: string; onNavigate: (p: string) => void; onLocked: (m: string) => void; refresh: () => void; content: any }) {
  const supportEmail = useSupportEmail();
  const [open, setOpen] = useState<number | null>(null);
  const [reapplyConfirm, setReapplyConfirm] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reapply = async () => {
    setReapplying(true);
    try {
      const r = await apiFetch(token, "/api/creator/reapply", { method: "POST" });
      if (r.ok) { setToast("Resubmitted! We'll review within 48 hours."); setReapplyConfirm(false); setTimeout(refresh, 1500); }
      else { const d = await r.json(); setToast(d.error ?? "Failed to reapply"); }
    } finally { setReapplying(false); }
  };

  return (
    <div className="space-y-4 pt-1 pb-6">
      <div className="mx-4 flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.45)" }}>
        <X className="w-4 h-4 text-red-400 flex-shrink-0" />
        <span className="text-red-300 text-sm font-semibold" style={{ fontFamily: POPPINS }}>Profile Not Approved!</span>
      </div>

      <Greeting home={home} subtitle="Your profile is not approved" />

      {/* Reason */}
      <div className="mx-4 px-4 py-3 rounded-xl"
        style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.20)" }}>
        <p className="text-xs leading-relaxed" style={{ fontFamily: POPPINS, color: "rgba(239,68,68,0.85)" }}>
          <span className="font-semibold">Reason: </span>
          {home.rejectionReason ?? `Please contact ${supportEmail} for more details.`}
        </p>
      </div>

      {/* Here is What to Fix – light pink card */}
      <div className="mx-4 rounded-2xl p-5 overflow-hidden" style={{ background: "#FFEFF6" }}>
        <h3 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ fontFamily: POPPINS, color: "#1a1a1a" }}>
          Here is What to Fix <ArrowRight className="w-4 h-4" style={{ color: PINK }} />
        </h3>
        <p className="text-xs leading-relaxed mb-4" style={{ fontFamily: POPPINS, color: "#666" }}>
          {home.rejectionSolution ?? "Review your profile carefully, update the flagged sections, and reapply for verification."}
        </p>
        <button onClick={() => onNavigate("/home-creator/profile?edit=true")}
          className="w-full py-3 rounded-xl text-white text-sm font-semibold"
          style={{ background: PINK, fontFamily: POPPINS }}>
          Edit Profile
        </button>
        <button onClick={() => setReapplyConfirm(true)}
          className="w-full mt-2.5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ border: `1px solid ${PINK}`, color: PINK, fontFamily: POPPINS }}>
          Reapply for Verification
        </button>
      </div>

      <BrandsSection open={open} setOpen={setOpen} />
      <div id="fun-questions-section"><FunQuestionsSection token={token} onToast={msg => setToast(msg)} /></div>
      <div className="overflow-hidden"><HowItWorks content={content} creatorsOnly /></div>
      <CreatorComparisonSection />
      <TeamSection />

      {reapplyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <h3 className="text-white font-semibold mb-2" style={{ fontFamily: POPPINS }}>Reapply for Verification?</h3>
            <p className="text-white/80 text-sm mb-5" style={{ fontFamily: POPPINS }}>Your profile will go back under review. This will take up to 48 hours.</p>
            <div className="flex gap-3">
              <button onClick={() => setReapplyConfirm(false)} disabled={reapplying}
                className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm" style={{ fontFamily: POPPINS }}>Cancel</button>
              <button onClick={reapply} disabled={reapplying}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: PINK, fontFamily: POPPINS }}>{reapplying ? "Reapplying..." : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════════ */
interface CelebrationPayment {
  id: string;
  amount: number;
  originalAmount: number;
  dealName: string;
  brandName: string | null;
  adjustmentReason: string | null;
}

export default function HomeCreator() {
  const { apiFetch: authFetch, accessToken, loading } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [home, setHome] = useState<any>(null);
  const [loadingHome, setLoadingHome] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [lockedModal, setLockedModal] = useState(false);
  const [celebrationPayment, setCelebrationPayment] = useState<CelebrationPayment | null>(null);
  const content = useLandingContent();
  const supportEmail = useSupportEmail();

  const checkNewPayments = (token: string) => {
    fetch(`${BASE_URL}/api/creator/earnings/history`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then((d: { transactions: any[] }) => {
      const txns: any[] = d.transactions ?? [];
      const celebratedRaw = localStorage.getItem("celebratedPayouts");
      const celebrated: string[] = celebratedRaw ? JSON.parse(celebratedRaw) : [];
      const newPaid = txns.find(t => t.payoutStatus === "RELEASED" && !celebrated.includes(t.id));
      if (newPaid) {
        setCelebrationPayment({
          id: newPaid.id,
          amount: newPaid.amount,
          originalAmount: newPaid.originalAmount ?? newPaid.amount,
          dealName: newPaid.dealName,
          brandName: newPaid.brandName ?? null,
          adjustmentReason: newPaid.adjustmentReason ?? null,
        });
      }
    }).catch(() => {});
  };

  const reload = () => {
    if (!accessToken) return;
    authFetch("/api/creator/home").then(r => r.json()).then(d => {
      if (d.status) setHome(d);
    }).finally(() => setLoadingHome(false));
  };

  useEffect(() => {
    if (!loading && !accessToken) { navigate("/login-creator"); return; }
    if (!loading && accessToken) {
      reload();
      checkNewPayments(accessToken);
    }
  }, [loading, accessToken]);

  if (loading || loadingHome) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: PINK, borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!home) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <p className="text-white/80">Could not load profile.</p>
      </div>
    );
  }

  const locked = () => setLockedModal(true);

  return (
    <CreatorLayout status={home.status} onLocked={locked}>
      {home.status === "ACTIVE" && <ActiveHome home={home} token={accessToken!} onNavigate={navigate} onLocked={() => {}} content={content} />}
      {home.status === "PENDING" && <PendingHome home={home} token={accessToken!} onNavigate={navigate} onLocked={() => {}} content={content} />}
      {home.status === "REJECTED" && <RejectedHome home={home} token={accessToken!} onNavigate={navigate} onLocked={() => {}} refresh={reload} content={content} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      {celebrationPayment && (
        <PaymentCelebrationPopup
          amount={celebrationPayment.amount}
          originalAmount={celebrationPayment.originalAmount}
          dealName={celebrationPayment.dealName}
          brandName={celebrationPayment.brandName}
          adjustmentReason={celebrationPayment.adjustmentReason}
          onDismiss={() => {
            const celebratedRaw = localStorage.getItem("celebratedPayouts");
            const celebrated: string[] = celebratedRaw ? JSON.parse(celebratedRaw) : [];
            celebrated.push(celebrationPayment.id);
            localStorage.setItem("celebratedPayouts", JSON.stringify(celebrated));
            setCelebrationPayment(null);
          }}
        />
      )}
      {lockedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.78)" }}
          onClick={e => { if (e.target === e.currentTarget) setLockedModal(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#15151D", border: "1px solid rgba(240,24,122,0.30)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(240,24,122,0.12)", border: "1px solid rgba(240,24,122,0.25)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E14F69" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 className="text-white font-bold text-base text-center mb-2" style={{ fontFamily: POPPINS }}>
              Feature Locked
            </h3>
            <p className="text-white/80 text-sm text-center mb-5 leading-relaxed" style={{ fontFamily: POPPINS }}>
              This feature will be unlocked after your profile is verified by our team. Verification usually takes up to 48 hours.
            </p>
            <button
              onClick={() => setLockedModal(false)}
              className="w-full py-3 rounded-full font-semibold text-white text-sm"
              style={{ background: PINK, fontFamily: POPPINS }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </CreatorLayout>
  );
}
