import { Link } from "wouter";
import { useLandingContent } from "@/hooks/useLandingContent";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

function toExternalUrl(url: string, fallback: string): string {
  const u = url.trim() || fallback;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

export default function Footer() {
  const { get } = useLandingContent();
  const tagline = get("footer.tagline") || "India's trusted influencer marketplace.";
  const copyright = get("footer.copyright") || "© 2025 Collabry. All rights reserved.";
  const instagramUrl = toExternalUrl(get("footer.instagram_url"), "https://instagram.com/collabryofficial");
  const linkedinUrl = toExternalUrl(get("footer.linkedin_url"), "https://linkedin.com/company/collabry");

  return (
    <footer
      className="border-t"
      style={{ borderColor: "rgba(255,255,255,0.07)", background: "#050508" }}
    >
      <div className="max-w-[1280px] mx-auto px-6 py-10">
        {/* Logo + tagline */}
        <div className="mb-4">
          <span
            className="text-2xl"
            style={{ fontFamily: "'Macondo Swash Caps', cursive", color: PINK }}
          >
            Collabry
          </span>
          <p className="text-white/70 text-xs mt-1" style={{ fontFamily: POPPINS }}>
            {tagline}
          </p>
        </div>

        {/* Social icons */}
        <div className="flex items-center gap-4 mb-6">
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Instagram"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </a>
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-white transition-colors"
            aria-label="LinkedIn"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </div>

        {/* Nav links */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
          <Link href="/contact-us" onClick={() => window.scrollTo(0, 0)}
            className="text-white/75 text-xs hover:text-white transition-colors" style={{ fontFamily: POPPINS }}>
            Contact Us
          </Link>
          <a href="/contact-us#about-us"
            className="text-white/75 text-xs hover:text-white transition-colors" style={{ fontFamily: POPPINS }}>
            About Us
          </a>
          <Link href="/privacy-policies"
            className="text-white/75 text-xs hover:text-white transition-colors" style={{ fontFamily: POPPINS }}>
            Privacy Policy
          </Link>
          <Link href="/terms-conditions"
            className="text-white/75 text-xs hover:text-white transition-colors" style={{ fontFamily: POPPINS }}>
            Terms &amp; Conditions
          </Link>
        </div>

        {/* Copyright */}
        <p className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>
          {copyright}
        </p>
      </div>
    </footer>
  );
}
