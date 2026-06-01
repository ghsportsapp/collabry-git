import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BG = "#0A0A0F";

function getParams(): { token: string; type: "brand" | "creator" | "" } {
  try {
    const sp = new URLSearchParams(window.location.search);
    const token = sp.get("token") ?? "";
    const type = sp.get("type");
    return { token, type: type === "brand" || type === "creator" ? type : "" };
  } catch {
    return { token: "", type: "" };
  }
}

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [params, setParams] = useState<{ token: string; type: "brand" | "creator" | "" }>({ token: "", type: "" });

  useEffect(() => { setParams(getParams()); }, []);

  const invalidLink = !params.token || !params.type;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError("Please enter a new password"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setError("");
    setLoading(true);
    try {
      const endpoint = params.type === "brand"
        ? `${BASE_URL}/api/auth/brand/reset-password`
        : `${BASE_URL}/api/auth/creator/reset-password`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, password }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Failed to reset password"); return; }
      setDone(true);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  };

  const loginPath = params.type === "brand" ? "/login-brand" : "/login-creator";

  const inputStyle = (hasError: boolean) => ({
    border: `1px solid ${hasError ? "rgba(239,68,68,0.60)" : "rgba(255,255,255,0.22)"}`,
  } as React.CSSProperties);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG, fontFamily: POPPINS }}>
      <header className="px-6 py-4">
        <span className="text-2xl" style={{ color: PINK, fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-[460px] rounded-2xl p-8"
          style={{ background: "rgba(240,24,122,0.10)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0px 0px 24px 8px rgba(240,24,122,0.12)" }}>

          {invalidLink ? (
            <div className="text-center">
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <XCircle className="w-8 h-8 text-red-400" />
                </div>
              </div>
              <h1 className="text-white font-bold text-xl mb-3">Invalid Reset Link</h1>
              <p className="text-white/75 text-sm leading-relaxed mb-7">
                This password reset link is invalid or has expired.<br />
                Please request a new reset link.
              </p>
              <Link href="/login-brand">
                <button className="w-full py-3.5 rounded-full text-white font-semibold text-sm"
                  style={{ background: PINK }}>
                  Go to Login
                </button>
              </Link>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)" }}>
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
              </div>
              <h1 className="text-white font-bold text-xl mb-3">Password Updated Successfully</h1>
              <p className="text-white/80 text-sm leading-relaxed mb-7">
                Your password has been changed successfully.<br />
                Please login again with your new password.
              </p>
              <Link href={loginPath}>
                <button className="w-full py-3.5 rounded-full text-white font-semibold text-sm"
                  style={{ background: PINK }}>
                  Go to Login
                </button>
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-white font-bold text-xl text-center mb-2">Create New Password</h1>
              <p className="text-white/70 text-sm text-center mb-7 leading-relaxed">
                Choose a strong password for your{" "}
                {params.type === "brand" ? "brand" : "creator"} account.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg text-xs"
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(""); }}
                      placeholder="At least 8 characters"
                      className="w-full bg-transparent rounded-lg px-4 py-3 pr-10 text-white text-sm outline-none placeholder:text-white/70 transition-all"
                      style={inputStyle(!!error && !password)}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && password.length < 8 && (
                    <p className="text-xs mt-1" style={{ color: "#fbbf24" }}>Minimum 8 characters required</p>
                  )}
                </div>

                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); setError(""); }}
                      placeholder="Re-enter your new password"
                      className="w-full bg-transparent rounded-lg px-4 py-3 pr-10 text-white text-sm outline-none placeholder:text-white/70 transition-all"
                      style={inputStyle(!!error && confirm !== password)}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirm && password && confirm !== password && (
                    <p className="text-xs mt-1" style={{ color: "#f87171" }}>Passwords do not match</p>
                  )}
                  {confirm && password && confirm === password && password.length >= 8 && (
                    <p className="text-xs mt-1 text-green-400">Passwords match ✓</p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-full text-white font-semibold text-sm disabled:opacity-60 mt-2"
                  style={{ background: PINK }}>
                  {loading ? "Updating…" : "Update Password"}
                </button>
              </form>

              <div className="text-center mt-5">
                <Link href={loginPath} className="text-white/70 text-xs hover:text-white transition-colors">
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
