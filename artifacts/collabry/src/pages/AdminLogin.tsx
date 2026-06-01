import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import {
  ADMIN_EMAIL,
  verifyAdminPassword,
  verifyAdminOtp,
  checkLocked,
  recordFailedAttempt,
  clearAttempts,
  createAdminSession,
  isAdminLoggedIn,
} from "@/lib/adminAuth";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#F0187A";

const inputClass =
  "w-full bg-transparent border border-white/20 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-white/60 placeholder:text-white/40 transition-all";

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useLockCountdown(type: "pw" | "otp" | "change_otp") {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    const tick = () => {
      const { locked, remainingMs: ms } = checkLocked(type);
      setRemainingMs(locked ? ms : 0);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [type]);

  return remainingMs;
}

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"pw" | "otp">("pw");

  useEffect(() => {
    if (isAdminLoggedIn()) navigate("/admin-collabryangad");
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "#0A0A0F", fontFamily: POPPINS }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-3xl" style={{ fontFamily: "'Macondo Swash Caps', cursive", color: PINK }}>
            Collabry
          </span>
          <p className="text-white/50 text-xs mt-2 tracking-wide">Admin Panel</p>
        </div>

        <div
          className="rounded-2xl p-7"
          style={{
            background: "rgba(240,24,122,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 0 0 1px rgba(240,24,122,0.15), 0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {step === "pw" ? (
            <PasswordStep onSuccess={() => setStep("otp")} />
          ) : (
            <OtpStep onSuccess={() => { createAdminSession(); navigate("/admin-collabryangad"); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordStep({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const remainingMs = useLockCountdown("pw");
  const locked = remainingMs > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    if (!email.trim() || !password) { setError("Email and password are required."); return; }
    if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      recordFailedAttempt("pw");
      setError("Invalid email or password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const valid = await verifyAdminPassword(password);
      if (!valid) {
        const { locked: nowLocked } = recordFailedAttempt("pw");
        setError(nowLocked ? "" : "Invalid email or password.");
      } else {
        clearAttempts("pw");
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="text-white font-bold text-lg mb-6 text-center">Admin Login</h1>

      {locked ? (
        <div className="mb-4 p-4 rounded-xl text-center" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <p className="text-red-400 text-sm font-semibold">Too many attempts.</p>
          <p className="text-red-400/80 text-xs mt-1">Try again in {formatTime(remainingMs)}</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 rounded-lg text-red-400 text-xs" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.20)" }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/70 text-xs font-medium mb-1.5">Email</label>
              <input
                className={inputClass}
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-white/70 text-xs font-medium mb-1.5">Password</label>
              <div className="relative">
                <input
                  className={inputClass + " pr-10"}
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-full text-white font-semibold text-sm disabled:opacity-50 transition-opacity mt-2"
              style={{ background: PINK }}
            >
              {submitting ? "Verifying…" : "Continue"}
            </button>
          </form>
        </>
      )}
    </>
  );
}

function OtpStep({ onSuccess }: { onSuccess: () => void }) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const remainingMs = useLockCountdown("otp");
  const locked = remainingMs > 0;

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || !otp.trim()) return;
    if (verifyAdminOtp(otp)) {
      clearAttempts("otp");
      onSuccess();
    } else {
      const { locked: nowLocked } = recordFailedAttempt("otp");
      setError(nowLocked ? "" : "Invalid OTP. Please try again.");
      setOtp("");
    }
  };

  return (
    <>
      <h1 className="text-white font-bold text-lg mb-2 text-center">Verify OTP</h1>
      <p className="text-white/50 text-xs text-center mb-6">A verification code has been sent to your email.</p>

      {locked ? (
        <div className="p-4 rounded-xl text-center" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <p className="text-red-400 text-sm font-semibold">Too many attempts.</p>
          <p className="text-red-400/80 text-xs mt-1">Try again in {formatTime(remainingMs)}</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 rounded-lg text-red-400 text-xs" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.20)" }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/70 text-xs font-medium mb-1.5">Enter 4-digit OTP</label>
              <input
                ref={inputRef}
                className={inputClass + " text-center text-xl tracking-[0.4em] font-semibold"}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <button
              type="submit"
              disabled={otp.length < 4}
              className="w-full py-3 rounded-full text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
              style={{ background: PINK }}
            >
              Verify &amp; Sign In
            </button>
          </form>
        </>
      )}
    </>
  );
}
