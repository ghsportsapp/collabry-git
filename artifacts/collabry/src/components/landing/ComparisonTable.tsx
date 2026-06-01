import { useState } from "react";
import type { LandingContentHook } from "@/hooks/useLandingContent";

const POPPINS = "'Poppins', sans-serif";

export interface ComparisonRow {
  feature: string;
  old: string;
  collabry: string;
}

interface Props {
  /** Generic landing content hook — used for backward compat (reads "comparison.rows"). */
  content?: LandingContentHook;
  /** Explicit rows. When provided, takes precedence over `content`. */
  rows?: ComparisonRow[];
}

const defaultRows: ComparisonRow[] = [
  { feature: "Finding Creators", old: "Random Instagram DMs", collabry: "Search + AI Matching" },
  { feature: "Verifying Identity", old: "No verification", collabry: "Admin verified profiles" },
  { feature: "Fake Followers", old: "No way to check", collabry: "Every creator reviewed" },
  { feature: "Pricing", old: "No standard rates", collabry: "Transparent slab pricing" },
  { feature: "Negotiation", old: "WhatsApp back and forth", collabry: "Structured 4-round system" },
  { feature: "Payment Safety", old: "Bank transfer risk", collabry: "Escrow — pay on approval" },
  { feature: "Disputes", old: "No resolution", collabry: "Admin mediation built in" },
  { feature: "Transparency", old: "Zero visibility", collabry: "Full deal audit trail" },
  { feature: "Time to Start", old: "Days of research", collabry: "Minutes" },
  { feature: "Communication", old: "Scattered WhatsApp chats", collabry: "Everything in one place" },
];

export default function ComparisonTable({ content, rows: rowsProp }: Props) {
  const rows: ComparisonRow[] = rowsProp
    ?? (content ? content.getJson<ComparisonRow[]>("comparison.rows") : defaultRows);

  const [activeTab, setActiveTab] = useState<"old" | "collabry">("collabry");

  return (
    <section className="py-10 lg:py-14">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-8 lg:mb-12">
          <h2
            className="text-xl lg:text-[44px] font-bold text-white text-center"
            style={{ fontFamily: POPPINS }}
          >
            The Old Way vs{" "}
            <span className="text-[#E14F69]">The Collabry Way</span>
          </h2>
        </div>

        {/* ── Desktop 3-column table ── */}
        <div className="hidden lg:block relative">
          <div
            className="absolute rounded-xl bg-white/[0.07] pointer-events-none"
            style={{ top: "-8px", bottom: "-8px", left: "calc(100% / 3.3)", right: "calc(100% * 1.2 / 3.3)" }}
          />
          <div
            className="absolute rounded-xl bg-[#E14F69] pointer-events-none"
            style={{ top: "-16px", bottom: "-16px", left: "calc(100% * 2.1 / 3.3)", right: 0 }}
          />
          <div className="flex border-b border-white/50 relative z-10">
            <div className="flex-[1] px-4 py-4 flex items-center">
              <span className="text-white/70 text-[11px] font-semibold uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Feature</span>
            </div>
            <div className="flex-[1.1] px-4 py-4 flex items-center justify-center">
              <span className="text-white/80 font-semibold text-[15px]" style={{ fontFamily: POPPINS }}>Old Way</span>
            </div>
            <div className="flex-[1.2] px-4 py-4 flex items-center justify-center">
              <span className="font-bold text-[15px] text-white" style={{ fontFamily: POPPINS }}>Collabry Way</span>
            </div>
          </div>
          {rows.map((row, i) => (
            <div key={i} className={`flex relative z-10 ${i === rows.length - 1 ? "" : "border-b border-white/50"}`}>
              <div className="flex-[1] px-4 py-4 flex items-center">
                <span className="text-white text-[13px] font-bold" style={{ fontFamily: POPPINS }}>{row.feature ?? ""}</span>
              </div>
              <div className="flex-[1.1] px-4 py-4 flex items-center">
                <span className="text-white/80 text-[13px]" style={{ fontFamily: POPPINS }}>{row.old}</span>
              </div>
              <div className="flex-[1.2] px-4 py-4 flex items-center">
                <span className="text-white text-[13px] font-bold" style={{ fontFamily: POPPINS }}>{row.collabry}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Mobile toggle table ── */}
        <div className="lg:hidden">
          {/* Toggle tabs — fixed height, no layout shift */}
          <div
            className="flex rounded-full p-1 mb-5"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <button
              onClick={() => setActiveTab("old")}
              className="flex-1 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer"
              style={{
                fontFamily: POPPINS,
                height: "44px",
                background: activeTab === "old" ? "rgba(255,255,255,0.22)" : "transparent",
                color: "white",
              }}
            >
              The Old Way
            </button>
            {/* Collabry button: hint text always rendered via absolute, never shifts layout */}
            <button
              onClick={() => setActiveTab("collabry")}
              className="relative flex-1 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center"
              style={{
                fontFamily: POPPINS,
                height: "44px",
                background: activeTab === "collabry" ? "#E14F69" : "transparent",
                color: "white",
              }}
            >
              <span
                className="absolute inset-x-0 top-[2px] text-center text-[9px] font-normal text-white/70 transition-opacity duration-200 pointer-events-none"
                style={{ opacity: activeTab === "old" ? 1 : 0 }}
              >
                tap to see →
              </span>
              The Collabry Way
            </button>
          </div>

          {/* Two-column layout: fixed row heights throughout */}
          <div className="flex gap-3">
            {/* Left: feature name column */}
            <div className="flex flex-col flex-1 min-w-0">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="flex items-center"
                  style={{
                    height: "38px",
                    borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  <span className="text-white text-[11px] font-semibold truncate" style={{ fontFamily: POPPINS }}>
                    {row.feature ?? ""}
                  </span>
                </div>
              ))}
            </div>

            {/* Right: one rounded box — text fades in/out via opacity, no DOM swap */}
            <div
              className="rounded-xl flex flex-col overflow-hidden flex-shrink-0 transition-colors duration-300"
              style={{
                background: activeTab === "collabry" ? "#E14F69" : "rgba(255,255,255,0.12)",
                width: "58%",
                minWidth: "175px",
              }}
            >
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="relative flex items-center justify-end px-3"
                  style={{
                    height: "38px",
                    borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.12)" : "none",
                  }}
                >
                  {/* Old value — fades out when collabry active */}
                  <span
                    className="absolute right-3 text-white text-[11px] font-medium text-right whitespace-nowrap transition-opacity duration-200"
                    style={{ opacity: activeTab === "old" ? 1 : 0, fontFamily: POPPINS }}
                  >
                    {row.old}
                  </span>
                  {/* Collabry value — fades in when collabry active */}
                  <span
                    className="absolute right-3 text-white text-[11px] font-medium text-right whitespace-nowrap transition-opacity duration-200"
                    style={{ opacity: activeTab === "collabry" ? 1 : 0, fontFamily: POPPINS }}
                  >
                    {row.collabry}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
