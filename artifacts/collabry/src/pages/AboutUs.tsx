import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, User, Copy, Check } from "lucide-react";
import Footer from "@/components/landing/Footer";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const MERRIWEATHER = "'Merriweather', serif";
const PINK = "#E14F69";
const BG = "#0A0A0F";

interface TeamMember { name: string; image: string; occupation?: string }
interface AboutUs {
  heading: string;
  content: string;
  mission: string;
  missionImage: string;
  contactEmail: string;
  contactDesc: string;
  teamDesc: string;
  team: TeamMember[];
}

const DEFAULT: AboutUs = {
  heading: "About Us",
  content: "",
  mission: "",
  missionImage: "",
  contactEmail: "support@collabry.in",
  contactDesc: "If you have any questions, partnership inquiries, or support requests, feel free to reach out to us at the email address below. Please mention whether you are contacting us as a Creator or a Brand in the subject line for faster assistance.",
  teamDesc: "A passionate team focused on redefining how modern brand collaborations work.",
  team: [],
};

export default function AboutUsPage() {
  const [data, setData] = useState<AboutUs | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${BASE_URL}/api/about-us`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: Partial<AboutUs>) => setData({ ...DEFAULT, ...d }))
      .catch(() => setData(DEFAULT));
  }, []);

  const copyEmail = useCallback(() => {
    const email = data?.contactEmail || DEFAULT.contactEmail;
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data]);

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: POPPINS }}>
      <header className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/8 bg-[#0A0A0F]/95 backdrop-blur-md">
        <div className="max-w-[1280px] mx-auto w-full flex items-center justify-between">
          <Link href="/">
            <span className="text-2xl cursor-pointer" style={{ fontFamily: "'Macondo Swash Caps', cursive", color: PINK }}>Collabry</span>
          </Link>
          <button onClick={() => window.history.back()} className="flex items-center gap-2 border border-white/30 text-white text-sm px-4 py-2 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      </header>

      {!data ? (
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16 space-y-6 animate-pulse">
          <div className="h-10 bg-white/10 rounded w-64 mx-auto" />
          <div className="space-y-2">
            <div className="h-3 bg-white/6 rounded w-full" />
            <div className="h-3 bg-white/6 rounded w-5/6" />
            <div className="h-3 bg-white/6 rounded w-4/6" />
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6">

            {/* ── SECTION 1: CONTACT US ── */}
            <section id="contact" className="pt-14 pb-10">
              <div className="max-w-6xl mx-auto">
                <h1 className="text-center font-bold mb-7 leading-tight"
                  style={{ fontFamily: MERRIWEATHER, fontSize: "clamp(1.75rem, 4vw, 2.75rem)", color: "white" }}>
                  <span style={{ color: PINK }}>Contact</span> Us
                </h1>
                <p className="text-white/85 text-sm sm:text-base leading-relaxed mb-8 text-center"
                  style={{ fontFamily: POPPINS }}>
                  {data.contactDesc || DEFAULT.contactDesc}
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-4xl mx-auto">
                  <div className="flex-1 px-5 py-3.5 rounded-xl text-sm sm:text-base font-medium"
                    style={{ background: "rgba(225,79,105,0.15)", border: `1px solid ${PINK}55`, color: "rgba(255,255,255,0.85)", fontFamily: POPPINS }}>
                    {data.contactEmail || DEFAULT.contactEmail}
                  </div>
                  <button onClick={copyEmail}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all"
                    style={{ background: PINK, color: "white", fontFamily: POPPINS }}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Copy Email"}
                  </button>
                </div>
              </div>
            </section>

            {/* ── SECTION 2: ABOUT COLLABRY ── */}
            <section id="about-us" className="py-10">
              <div className="max-w-6xl mx-auto">
                <h2 className="text-center font-bold mb-7 leading-tight"
                  style={{ fontFamily: MERRIWEATHER, fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)", color: "white" }}>
                  About <span style={{ color: PINK }}>Collabry</span>
                </h2>
                <p className="text-white/90 leading-relaxed text-sm sm:text-base"
                  style={{ fontFamily: POPPINS }}>
                  {data.content || DEFAULT.content}
                </p>
              </div>
            </section>

            {/* ── SECTION 3: OUR MISSION ── */}
            <section className="py-10">
              <div className="max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row items-start gap-8 sm:gap-12">
                  <div className="flex-shrink-0 w-full sm:w-72 lg:w-80">
                    <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${PINK}55`, minHeight: "280px" }}>
                      {data.missionImage ? (
                        <img src={data.missionImage} alt="Our Mission" className="w-full h-64 sm:h-80 object-cover" />
                      ) : (
                        <div className="w-full h-64 sm:h-80 flex flex-col items-center justify-center gap-2"
                          style={{ background: "rgba(225,79,105,0.08)" }}>
                          <span className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>Mission image</span>
                          <span className="text-white/70 text-[10px]" style={{ fontFamily: POPPINS }}>Upload from admin panel</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold mb-4 leading-tight"
                      style={{ fontFamily: MERRIWEATHER, fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)", color: "white" }}>
                      Our <span style={{ color: PINK }}>Mission</span>
                    </h2>
                    <p className="text-white/85 leading-relaxed text-sm sm:text-base"
                      style={{ fontFamily: POPPINS }}>
                      {data.mission || DEFAULT.mission}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── SECTION 4: THE COLLABRY TEAM ── */}
            {data.team.length > 0 && (
              <section className="py-10">
                <div className="max-w-5xl mx-auto">
                  <h2 className="text-center font-bold mb-3 leading-tight"
                    style={{ fontFamily: MERRIWEATHER, fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)", color: "white" }}>
                    The <span style={{ color: PINK }}>Collabry</span> Team
                  </h2>
                  {data.teamDesc && (
                    <p className="text-center text-white/70 text-sm mb-10" style={{ fontFamily: POPPINS }}>
                      {data.teamDesc}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-8 lg:gap-12 justify-items-center">
                    {data.team.map((m, i) => (
                      <div key={i} className="flex flex-col items-center text-center">
                        <div className="w-20 h-20 lg:w-36 lg:h-36 rounded-full overflow-hidden mb-3 flex-shrink-0"
                          style={{ background: "rgba(255,255,255,0.06)", border: `2px solid ${PINK}55` }}>
                          {m.image ? (
                            <img src={m.image} alt={m.name} loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <User className="w-8 h-8 lg:w-14 lg:h-14 text-white/70" />
                            </div>
                          )}
                        </div>
                        <p className="text-white text-xs sm:text-sm lg:text-base font-semibold leading-snug" style={{ fontFamily: POPPINS }}>{m.name}</p>
                        {m.occupation && (
                          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: POPPINS, fontStyle: "italic", marginTop: 2 }}>{m.occupation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <div className="h-10" />
          </div>
        </>
      )}
      <Footer />
    </div>
  );
}
