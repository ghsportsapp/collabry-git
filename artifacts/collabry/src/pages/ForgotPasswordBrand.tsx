import { useState } from "react";
import { Link } from "wouter";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BG = "#0A0A0F";

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export default function ForgotPasswordBrand() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Please enter your email address"); return; }
    if (!isValidEmail(email)) { setError("Please enter a valid email address"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/brand/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG, fontFamily: POPPINS }}>
      <header className="px-6 py-4">
        <span className="text-2xl" style={{ color: PINK, fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-[460px] rounded-2xl p-8"
          style={{ background: "rgba(240,24,122,0.10)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0px 0px 24px 8px rgba(240,24,122,0.12)" }}>

          {sent ? (
            <div className="text-center">
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)" }}>
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
              </div>
              <h1 className="text-white font-bold text-xl mb-3">Password Reset Link Sent</h1>
              <p className="text-white/80 text-sm leading-relaxed mb-7">
                A password reset link has been sent to your email address.<br className="hidden sm:block" />
                Please open your email and click the link to create a new password.
              </p>
              <Link href="/login-brand">
                <button className="w-full py-3.5 rounded-full text-white font-semibold text-sm"
                  style={{ background: PINK }}>
                  Back to Login
                </button>
              </Link>
              <p className="text-white/70 text-xs mt-5">Didn't receive the email? Check your spam folder.</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(240,24,122,0.12)", border: "1px solid rgba(240,24,122,0.28)" }}>
                  <Mail className="w-6 h-6" style={{ color: PINK }} />
                </div>
              </div>

              <h1 className="text-white font-bold text-xl text-center mb-2">Forgot Your Password?</h1>
              <p className="text-white/70 text-sm text-center mb-7 leading-relaxed">
                Enter your registered email address and we'll send you a password reset link.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(""); }}
                    placeholder="Enter your email address"
                    className="w-full bg-transparent rounded-lg px-4 py-3 text-white text-sm outline-none placeholder:text-white/70 transition-all"
                    style={{ border: `1px solid ${error ? "rgba(239,68,68,0.60)" : "rgba(255,255,255,0.22)"}` }}
                    autoComplete="email"
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-full text-white font-semibold text-sm disabled:opacity-60"
                  style={{ background: PINK }}>
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>

              <div className="flex items-center justify-center gap-1.5 mt-6">
                <ArrowLeft className="w-3 h-3 text-white/70" />
                <Link href="/login-brand" className="text-white/70 text-xs hover:text-white transition-colors">
                  Back to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
