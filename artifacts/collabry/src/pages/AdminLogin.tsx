import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

// Phase 2: real backend login (email + password + per-account OTP). The old
// hardcoded client-side verifiers still live in lib/adminAuth.ts (Phase 5
// removes them) but are no longer the active login path.

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#F0187A";

const inputClass =
  "w-full bg-transparent border border-white/20 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-white/60 placeholder:text-white/40 transition-all";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { setAuth } = useAdminAuth();
  const [step, setStep] = useState<"creds" | "otp">("creds");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdminLoggedIn()) navigate("/admin-collabryangad");
  }, []);

  useEffect(() => { if (step === "otp") otpRef.current?.focus(); }, [step]);

  const toOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Email and password are required."); return; }
    setStep("otp");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${BASE_URL}/api/auth/admin/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, otp: otp.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        setAuth({
          token: d.accessToken,
          adminId: d.adminId,
          username: d.username,
          name: d.name ?? null,
          isSuperAdmin: !!d.isSuperAdmin,
          allowedSections: Array.isArray(d.allowedSections) ? d.allowedSections : [],
        });
        navigate("/admin-collabryangad");
        return;
      }
      if (res.status === 429) {
        setError("Too many attempts. Please try again in a few minutes.");
      } else {
        setError("Invalid credentials.");
        setOtp("");
        setStep("creds");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-3xl" style={{ fontFamily: "'Macondo Swash Caps', cursive", color: PINK }}>Collabry</span>
          <p className="text-white/50 text-xs mt-2 tracking-wide">Admin Panel</p>
        </div>

        <div className="rounded-2xl p-7" style={{ background: "rgba(240,24,122,0.06)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 0 0 1px rgba(240,24,122,0.15), 0 8px 32px rgba(0,0,0,0.4)" }}>
          {error && (
            <div className="mb-4 p-3 rounded-lg text-red-400 text-xs" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.20)" }}>
              {error}
            </div>
          )}

          {step === "creds" ? (
            <>
              <h1 className="text-white font-bold text-lg mb-6 text-center">Admin Login</h1>
              <form onSubmit={toOtp} className="space-y-4">
                <div>
                  <label className="block text-white/70 text-xs font-medium mb-1.5">Email</label>
                  <input className={inputClass} type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div>
                  <label className="block text-white/70 text-xs font-medium mb-1.5">Password</label>
                  <div className="relative">
                    <input className={inputClass + " pr-10"} type={showPass ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                    <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="w-full py-3 rounded-full text-white font-semibold text-sm transition-opacity mt-2" style={{ background: PINK }}>Continue</button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-white font-bold text-lg mb-2 text-center">Verify OTP</h1>
              <p className="text-white/50 text-xs text-center mb-6">Enter your account's OTP code to sign in.</p>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-white/70 text-xs font-medium mb-1.5">OTP</label>
                  <input ref={otpRef} className={inputClass + " text-center text-xl tracking-[0.4em] font-semibold"} type="text" inputMode="numeric" maxLength={6}
                    placeholder="••••" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setStep("creds"); setError(""); setOtp(""); }} className="flex-1 py-3 rounded-full border border-white/20 text-white/70 text-sm">Back</button>
                  <button type="submit" disabled={submitting || otp.length < 4} className="flex-1 py-3 rounded-full text-white font-semibold text-sm disabled:opacity-40 transition-opacity" style={{ background: PINK }}>
                    {submitting ? "Signing in…" : "Verify & Sign In"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
