import { Link } from "wouter";
import { CheckCircle } from "lucide-react";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BG = "#0A0A0F";

export default function WhiteGloveThankYou() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: BG, fontFamily: POPPINS }}>
      <div className="max-w-[480px] w-full text-center">
        <span className="inline-flex w-16 h-16 rounded-full items-center justify-center mb-6"
          style={{ background: "rgba(225,79,105,0.14)", border: "1px solid rgba(225,79,105,0.35)" }}>
          <CheckCircle className="w-9 h-9" style={{ color: PINK }} />
        </span>
        <h1 className="text-white font-bold mb-3" style={{ fontSize: "clamp(1.8rem,4vw,2.5rem)" }}>Thank you!</h1>
        <p className="text-white/70 text-base leading-relaxed mb-8">
          Our team will reach out to you soon.
        </p>
        <Link href="/">
          <button className="px-7 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: PINK }}>
            Back to Homepage
          </button>
        </Link>
      </div>
    </div>
  );
}
