import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";

interface Section { heading: string; body: string }

function formatMonthYear(iso: string | null): string {
  if (!iso) return "April 2025";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function TermsAndConditions() {
  const [sections, setSections] = useState<Section[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/api/legal/terms`)
      .then(r => r.json())
      .then(d => { setSections(d.sections); setUpdatedAt(d.updatedAt); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      <header className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/8 bg-[#0A0A0F]/95 backdrop-blur-md">
        <Link href="/">
          <span className="text-2xl text-[#E14F69] cursor-pointer" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
        </Link>
        <button onClick={() => window.history.back()} className="flex items-center gap-2 border border-white/30 text-white text-sm px-4 py-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-white text-3xl font-bold mb-3">Terms &amp; Conditions</h1>
          <p className="text-white/70 text-sm">Last updated: {formatMonthYear(updatedAt)} · Collabry India</p>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-5 bg-white/10 rounded w-48 mb-3" />
                <div className="space-y-2">
                  <div className="h-3 bg-white/6 rounded w-full" />
                  <div className="h-3 bg-white/6 rounded w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map((s, i) => (
              <div key={i} className="border-b border-white/8 pb-8 last:border-0">
                <h2 className="text-white font-semibold text-lg mb-3 break-words">
                  <span className="text-[#E14F69] mr-2">{String(i + 1).padStart(2, "0")}.</span>
                  {s.heading}
                </h2>
                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap break-words">{s.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-white/8 flex flex-col sm:flex-row gap-3">
          <Link href="/privacy-policies">
            <button className="text-[#E14F69] text-sm hover:underline">Privacy Policy →</button>
          </Link>
          <Link href="/">
            <button className="text-white/70 text-sm hover:text-white transition-colors">Back to Home</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
