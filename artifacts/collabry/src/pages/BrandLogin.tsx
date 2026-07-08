import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useSupportEmail } from "@/hooks/useSupportEmail";
import { trackEvent, identifyUser } from "@/lib/analytics";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";

const inputClass = "w-full bg-transparent border border-white/30 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-white/80 placeholder:text-white/70 transition-all";
const labelClass = "block text-white text-sm font-medium mb-1.5";
const CARD_STYLE = {
  background: "rgba(240,24,122,0.15)",
  border: "1px solid rgba(255,255,255,0.15)",
  boxShadow: "0px 0px 24px 8px rgba(240,24,122,0.18)",
};

export default function BrandLogin() {
  const { setAuth } = useBrandAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [isBanned, setIsBanned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const supportEmail = useSupportEmail();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("collabry.brand.rememberedEmail");
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Email and password are required"); return; }
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch(`${BASE_URL}/api/auth/brand/login`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.banned) { setIsBanned(true); return; }
        setError(data.error ?? "Login failed"); return;
      }
      try {
        if (rememberMe) localStorage.setItem("collabry.brand.rememberedEmail", email.trim());
        else localStorage.removeItem("collabry.brand.rememberedEmail");
      } catch {}
      setAuth(data.accessToken, data.brandId, data.brandName);
      identifyUser(data.brandId, "BRAND");
      trackEvent("login_success", { user_type: "BRAND", method: "email" });
      navigate("/home-brand");
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      <header className="px-6 py-4 flex items-center justify-between">
        <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
        <Link href="/signup-creator">
          <button className="border border-white text-white text-[11px] px-4 py-2 rounded-full hover:bg-white/10 transition-colors">Signup / Login as Creator</button>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-[480px] rounded-2xl p-6 lg:p-8" style={CARD_STYLE}>
          <h1 className="text-white font-bold text-xl text-center mb-5">Welcome to Collabry..!</h1>

          <div className="flex rounded-full mb-6 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <Link href="/signup-brand" className="flex-1">
              <div className="py-2.5 text-center text-sm font-medium text-white/90 cursor-pointer hover:text-white transition-colors">Signup</div>
            </Link>
            <div className="flex-1 py-2.5 rounded-full text-center text-sm font-semibold text-white" style={{ background: "#E14F69" }}>Login</div>
          </div>

          <p className="text-white/80 text-xs mb-6 leading-relaxed">India's trusted influencer marketplace. Verified creators. Secure payments. Real results.</p>

          {isBanned && (
            <div className="mb-4 p-4 rounded-xl text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <p className="text-sm font-semibold text-red-400 mb-1" style={{ fontFamily: POPPINS }}>Your brand account is banned.</p>
              <p className="text-xs text-white/60 mb-3" style={{ fontFamily: POPPINS }}>If you think this is a mistake,{" "}
                <a href={`${BASE_URL}/about-us`} className="text-[#E14F69] underline underline-offset-2 hover:text-[#c4134e] transition-colors">contact us</a>.
              </p>
              <p className="text-xs text-white/35" style={{ fontFamily: POPPINS }}>{supportEmail}</p>
            </div>
          )}
          {!isBanned && error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>E-mail</label>
              <input className={inputClass} type="email" name="email" placeholder="Enter your E-mail" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </div>

            <div>
              <label className={labelClass}>Password</label>
              <div className="relative">
                <input className={inputClass + " pr-10"} type={showPass ? "text" : "password"} name="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => setRememberMe(!rememberMe)} className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all cursor-pointer" style={{ background: rememberMe ? "#E14F69" : "transparent", borderColor: rememberMe ? "#E14F69" : "rgba(255,255,255,0.20)" }}>
                  {rememberMe && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>}
                </div>
                <span className="text-white/80 text-xs">Remember me</span>
              </label>
              <Link href="/forgot-password-brand">
                <span className="text-white/80 text-xs hover:text-white cursor-pointer transition-colors">Forgot Password ?</span>
              </Link>
            </div>

            <button type="submit" disabled={submitting} className="w-full py-3.5 rounded-full text-white font-semibold text-sm transition-all disabled:opacity-60 mt-2" style={{ background: "#E14F69" }}>
              {submitting ? "Logging in..." : "Login"}
            </button>
          </form>

          <p className="text-center text-white/70 text-xs mt-5">
            Don't have an account?{" "}
            <Link href="/signup-brand"><span className="text-[#E14F69] cursor-pointer hover:underline">Sign up</span></Link>
          </p>
        </div>
      </div>
    </div>
  );
}
