import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout, Settings, Users, ArrowRight, CreditCard, Tag, LogOut, FileText, Star, Megaphone, Sliders, Info, Video, KeyRound, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { clearAdminSession, verifyAdminPassword, changeAdminPassword, verifyAdminOtp, checkLocked, recordFailedAttempt, clearAttempts, LOCK_DURATION_MS } from "@/lib/adminAuth";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#F0187A";

const pages = [
  { id: "landing", title: "Landing Page", desc: "Edit hero, how it works, collab modes, comparison, team, footer and design colors.", icon: Layout, href: "/admin-collabryangad/landing", status: "Live", statusColor: "bg-green-500" },
  { id: "brand-landing", title: "Brand Landing Page (/brand)", desc: "Edit every section of the /brand page — hero, stats, how it works, collab modes, comparison, CTA, team and footer.", icon: Layout, href: "/admin-collabryangad/brand-landing", status: "Live", statusColor: "bg-green-500" },
  { id: "creator-landing", title: "Creator Landing Page (/creator)", desc: "Edit every section of the /creator page — header, hero, earnings & safety, how it works, 4 ways to get discovered.", icon: Layout, href: "/admin-collabryangad/creator-landing", status: "Live", statusColor: "bg-green-500" },
  { id: "brand-onboarding", title: "Brand Onboarding", desc: "Manage brand signups, view registered brands, adjust credits, suspend accounts, and customize the brand signup form.", icon: Users, href: "/admin-collabryangad/brand-onboarding", status: "Live", statusColor: "bg-green-500" },
  { id: "credits", title: "Credits Management", desc: "Configure free credits on signup, set expiry days, and gift credits to one or multiple brands.", icon: CreditCard, href: "/admin-collabryangad/credits", status: "Live", statusColor: "bg-green-500" },
  { id: "categories", title: "Categories", desc: "Add, rename, and delete brand categories and subcategories. Brands are notified on deletion.", icon: Tag, href: "/admin-collabryangad/categories", status: "Live", statusColor: "bg-green-500" },
  { id: "about-us", title: "Contact Us Editor", desc: "Edit the public Contact Us / About Us page content, team members, mission, and contact email.", icon: Info, href: "/admin-collabryangad/contact-us", status: "Live", statusColor: "bg-green-500" },
  { id: "legal", title: "Legal Pages", desc: "Edit Terms & Conditions and Privacy Policy content shown to users during signup and on the site.", icon: FileText, href: "/admin-collabryangad/legal", status: "Live", statusColor: "bg-green-500" },
  { id: "creator-onboarding", title: "Creator Onboarding", desc: "Review creator applications, approve or reject profiles, view portfolio, and manage suspensions and bans.", icon: Star, href: "/admin-collabryangad/creator-onboarding", status: "Live", statusColor: "bg-green-500" },
  { id: "pricing", title: "Pricing & Slabs", desc: "Configure follower-based pricing slabs shown as recommendations to creators during signup.", icon: CreditCard, href: "/admin-collabryangad/pricing", status: "Live", statusColor: "bg-green-500" },
  { id: "campaign-management", title: "Campaign Management", desc: "All-in-one hub for paid campaigns, barter review queue, and campaign settings (rules for paid + barter).", icon: Megaphone, href: "/admin-collabryangad/campaign-management", status: "Live", statusColor: "bg-green-500" },
  { id: "deal-management", title: "Deal Management", desc: "Configure deal settings (timelines, helper text) and view every finalized deal across paid, barter and matchmaking.", icon: Settings, href: "/admin-collabryangad/deal-management", status: "Live", statusColor: "bg-green-500" },
  { id: "matchmaking", title: "Matchmaking Config", desc: "Configure scoring weights, parameter cards, adjacency rules, field options, result filters and creator profile visibility for the brand matchmaking engine.", icon: Sliders, href: "/admin-collabryangad/matchmaking", status: "Live", statusColor: "bg-green-500" },
  { id: "landing-videos", title: "Videos", desc: "Upload and manage videos and thumbnails for landing pages and other sections.", icon: Video, href: "/admin-collabryangad/landing-videos", status: "Live", statusColor: "bg-green-500" },
];

const comingSoon = [
  { id: "settings", title: "Site Settings", desc: "Manage logo, favicon, SEO, social links.", icon: Settings },
];

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useLockCountdown(type: "pw" | "otp" | "change_otp", active: boolean) {
  const [remainingMs, setRemainingMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const { locked, remainingMs: ms } = checkLocked(type);
      setRemainingMs(locked ? ms : 0);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [type, active]);
  return remainingMs;
}

type ChangePwStep = "form" | "otp" | "done";

function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ChangePwStep>("form");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const pwLockMs = useLockCountdown("pw", open && step === "form");
  const otpLockMs = useLockCountdown("change_otp", open && step === "otp");

  const inputClass = "w-full bg-white/5 border border-white/15 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-white/40 placeholder:text-white/30 transition-all";

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwLockMs > 0) return;
    setError("");
    if (!currentPw || !newPw || !confirmPw) { setError("All fields are required."); return; }
    if (newPw !== confirmPw) { setError("New passwords do not match."); return; }
    if (newPw.length < 8) { setError("New password must be at least 8 characters."); return; }
    setSubmitting(true);
    try {
      const valid = await verifyAdminPassword(currentPw);
      if (!valid) {
        const { locked } = recordFailedAttempt("pw");
        setError(locked ? "" : "Current password is incorrect.");
      } else {
        clearAttempts("pw");
        setStep("otp");
      }
    } finally { setSubmitting(false); }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpLockMs > 0) return;
    setError("");
    if (verifyAdminOtp(otp)) {
      clearAttempts("change_otp");
      await changeAdminPassword(newPw);
      setStep("done");
    } else {
      const { locked } = recordFailedAttempt("change_otp");
      setError(locked ? "" : "Invalid OTP. Please try again.");
      setOtp("");
    }
  };

  const reset = () => { setStep("form"); setCurrentPw(""); setNewPw(""); setConfirmPw(""); setOtp(""); setError(""); };

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) reset(); }}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(240,24,122,0.12)", border: "1px solid rgba(240,24,122,0.20)" }}>
            <KeyRound className="w-4 h-4" style={{ color: PINK }} />
          </div>
          <div className="text-left">
            <p className="text-white text-sm font-semibold">Change Password</p>
            <p className="text-white/50 text-xs">Update your admin panel password</p>
          </div>
        </div>
        <span className="text-white/40 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-white/8 px-6 py-5">
          {step === "done" ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="w-10 h-10 text-green-400" />
              <p className="text-white font-semibold">Password updated successfully</p>
              <button onClick={() => { reset(); setOpen(false); }} className="text-white/60 text-xs hover:text-white mt-1">Close</button>
            </div>
          ) : step === "otp" ? (
            <>
              <p className="text-white/60 text-xs mb-4">Enter the OTP sent to your email to confirm the password change.</p>
              {otpLockMs > 0 ? (
                <div className="p-3 rounded-xl text-center mb-3" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)" }}>
                  <p className="text-red-400 text-sm font-semibold">Too many attempts.</p>
                  <p className="text-red-400/70 text-xs mt-0.5">Try again in {formatTime(otpLockMs)}</p>
                </div>
              ) : (
                <form onSubmit={handleOtpSubmit} className="space-y-3">
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <div>
                    <label className="block text-white/60 text-xs mb-1">OTP</label>
                    <input
                      className={inputClass + " text-center text-lg tracking-[0.3em] font-semibold"}
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => { setStep("form"); setError(""); setOtp(""); }} className="flex-1 py-2 rounded-full border border-white/20 text-white/70 text-xs hover:bg-white/5 transition-colors">Back</button>
                    <button type="submit" disabled={otp.length < 4} className="flex-1 py-2 rounded-full text-white text-xs font-semibold disabled:opacity-40 transition-opacity" style={{ background: PINK }}>Verify & Update</button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <>
              {pwLockMs > 0 ? (
                <div className="p-3 rounded-xl text-center" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)" }}>
                  <p className="text-red-400 text-sm font-semibold">Too many attempts.</p>
                  <p className="text-red-400/70 text-xs mt-0.5">Try again in {formatTime(pwLockMs)}</p>
                </div>
              ) : (
                <form onSubmit={handlePasswordSubmit} className="space-y-3" style={{ fontFamily: POPPINS }}>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  {[
                    { label: "Current Password", val: currentPw, set: setCurrentPw, show: showCurrent, setShow: setShowCurrent },
                    { label: "New Password", val: newPw, set: setNewPw, show: showNew, setShow: setShowNew },
                    { label: "Confirm New Password", val: confirmPw, set: setConfirmPw, show: showConfirm, setShow: setShowConfirm },
                  ].map(({ label, val, set, show, setShow }) => (
                    <div key={label}>
                      <label className="block text-white/60 text-xs mb-1">{label}</label>
                      <div className="relative">
                        <input
                          className={inputClass + " pr-9"}
                          type={show ? "text" : "password"}
                          placeholder="••••••••"
                          value={val}
                          onChange={(e) => set(e.target.value)}
                        />
                        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="pt-1">
                    <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50 transition-opacity" style={{ background: PINK }}>
                      {submitting ? "Verifying…" : "Continue"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { username } = useAdminAuth();
  const [, navigate] = useLocation();

  const handleLogout = () => {
    clearAdminSession();
    navigate("/admin-collabryangad/login");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/8">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
            <span className="text-white/70 text-lg">|</span>
            <span className="text-[#9CA3AF] text-sm font-medium">Admin Panel</span>
          </div>
          <div className="flex items-center gap-4">
            {username && <span className="text-white/70 text-xs hidden sm:block">@{username}</span>}
            <a href="/" target="_blank" rel="noopener noreferrer" className="text-[#9CA3AF] hover:text-white text-sm transition-colors">View Site →</a>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white">Pages</h1>
          <p className="text-[#9CA3AF] mt-2 text-sm">Select a page to edit its content.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <Link key={page.id} href={page.href}>
                <div className="group bg-[#111118] border border-white/10 rounded-2xl p-6 hover:border-[#E14F69]/50 hover:bg-[#E14F69]/5 transition-all cursor-pointer relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#E14F69]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-[#E14F69]/15 border border-[#E14F69]/20 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-[#E14F69]" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${page.statusColor}`} />
                        <span className="text-xs text-[#9CA3AF]">{page.status}</span>
                      </div>
                    </div>
                    <h3 className="text-white font-semibold text-base mb-2">{page.title}</h3>
                    <p className="text-[#9CA3AF] text-xs leading-relaxed mb-5">{page.desc}</p>
                    <div className="flex items-center gap-1 text-[#E14F69] text-xs font-medium group-hover:gap-2 transition-all">
                      <span>Open</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {comingSoon.map((page) => {
            const Icon = page.icon;
            return (
              <div key={page.id} className="bg-[#0d0d14] border border-white/5 rounded-2xl p-6 opacity-50 cursor-not-allowed">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#9CA3AF]" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                    <span className="text-xs text-[#9CA3AF]">Soon</span>
                  </div>
                </div>
                <h3 className="text-white font-semibold text-base mb-2">{page.title}</h3>
                <p className="text-[#9CA3AF] text-xs leading-relaxed mb-5">{page.desc}</p>
                <span className="text-xs text-[#9CA3AF]">Coming soon</span>
              </div>
            );
          })}
        </div>

        {/* Security Settings */}
        <div className="mb-12">
          <h2 className="text-white font-semibold text-lg mb-4">Security</h2>
          <ChangePasswordSection />
        </div>
      </main>
    </div>
  );
}
