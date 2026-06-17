import { Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import type { LandingContentHook } from "@/hooks/useLandingContent";
import { InstallAppButton } from "@/components/InstallAppButton";

function scrollToTop() {
  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
}

interface Props {
  content?: LandingContentHook;
}

export default function Header({ content }: Props) {
  const logoText = content?.get("header.logo_text") ?? "Collabry";
  const brandCta = content?.get("header.brand_cta") ?? "Signup as Brand";
  const creatorCta = content?.get("header.creator_cta") ?? "Signup as Creator";

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  return (
    <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/5">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          onClick={scrollToTop}
          aria-label="Go to home"
          className="flex items-center gap-2 text-2xl text-[#E14F69] cursor-pointer bg-transparent border-0 p-0 no-underline"
          style={{ fontFamily: "'Macondo Swash Caps', cursive" }}
        >
          <img src={`${import.meta.env.BASE_URL}logo-mark.svg`} alt="" className="h-7 w-auto" />
          {logoText}
        </Link>

        <div className="hidden lg:flex items-center gap-3">
          <InstallAppButton variant="header" />
          <Link href="/signup-brand">
            <button
              className="bg-[#E14F69] text-white text-sm font-medium px-6 py-2.5 hover:bg-[#d4156b] transition-colors cursor-pointer"
              style={{ borderRadius: "20px 20px 20px 0px" }}
            >
              {brandCta}
            </button>
          </Link>
          <Link href="/signup-creator">
            <button
              className="border border-white text-white text-sm font-medium px-6 py-2.5 hover:bg-white/10 transition-colors cursor-pointer"
              style={{ borderRadius: "20px 20px 20px 0px" }}
            >
              {creatorCta}
            </button>
          </Link>
        </div>

        <div className="relative lg:hidden" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="border border-white text-white font-medium px-4 py-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer text-[11px]"
          >
            Signup / Login
          </button>

          {dropdownOpen && (
            <div
              className="absolute right-0 top-[calc(100%+8px)] w-52 flex flex-col gap-2 p-2 z-50"
              style={{
                background: "#0A0A0F",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
              }}
            >
              <Link href="/signup-brand">
                <button
                  className="w-full bg-[#E14F69] text-white text-sm font-semibold py-2.5 rounded-full hover:bg-[#d4156b] transition-colors cursor-pointer"
                  onClick={() => setDropdownOpen(false)}
                >
                  Signup as a Brand
                </button>
              </Link>
              <Link href="/signup-creator">
                <button
                  className="w-full bg-[#E14F69] text-white text-sm font-semibold py-2.5 rounded-full hover:bg-[#d4156b] transition-colors cursor-pointer"
                  onClick={() => setDropdownOpen(false)}
                >
                  Signup as a Creator
                </button>
              </Link>
              <Link href="/login-brand">
                <button
                  className="w-full border border-white/30 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => setDropdownOpen(false)}
                >
                  Login as a Brand
                </button>
              </Link>
              <Link href="/login-creator">
                <button
                  className="w-full border border-white/30 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => setDropdownOpen(false)}
                >
                  Login as a Creator
                </button>
              </Link>
              <InstallAppButton variant="inline" onClick={() => setDropdownOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
