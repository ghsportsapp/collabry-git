import { useState, useEffect } from "react";
import { fetchLandingContent, getCachedLandingContent } from "@/lib/landingContentFetcher";

export interface BrandContentMap {
  [key: string]: string;
}

const BRAND_DEFAULTS: BrandContentMap = {
  "brand.header.logo_text": "Collabry",
  "brand.header.signup_btn": "Sign Up as a Brand",
  "brand.header.login_btn": "Login as a Brand",
  "brand.hero.heading_line1": "Find Creators Who",
  "brand.hero.heading_highlight1": "Actually Convert.",
  "brand.hero.heading_line2": "Real Influence.",
  "brand.hero.heading_highlight2": "Real Results.",
  "brand.hero.subheading": "India's most trusted influencer marketplace — verified creators, secure escrow payments, and four powerful ways to collaborate.",
  "brand.hero.cta_btn": "Start Finding Creators →",
  "brand.hero.badge1": "Escrow Protected",
  "brand.hero.badge2": "Verified Creators",
  "brand.hero.badge3": "4 Ways to Collab",
  "brand.hero.banners": JSON.stringify([]),
  "brand.stats.heading_line1": "Why Most Campaigns",
  "brand.stats.heading_highlight1": "Waste Money",
  "brand.stats.subheading": "The data is clear. Most brands are doing it wrong.",
  "brand.stats.closing_line": "It's not the channel that's broken. It's the brief. It's the selection. It's the measurement.",
  "brand.stats.cards": JSON.stringify([
    { value: "₹3,600 Cr", label: "Spent on influencer marketing in India last year. A significant chunk wasted." },
    { value: "4–8%", label: "Engagement delivered by micro-influencers (10k–100k followers)" },
    { value: "Below 1%", label: "Average engagement from mega influencers and celebrities" },
    { value: "2.8x Higher ROI", label: "Micro-influencer campaigns vs mega-influencer campaigns on Instagram" },
    { value: "The Problem", label: "Brands keep chasing big names because big numbers feel safer" },
    { value: "The Fix", label: "Long-term collaborations with creators who genuinely use your product and have the right audience. Not the biggest audience. The right one." },
  ]),
  "brand.how_it_works.heading_line1": "How it",
  "brand.how_it_works.heading_highlight1": "Works?",
  "brand.how_it_works.subheading": "Simple for Brands. Powerful for Results.",
  "brand.how_it_works.steps": JSON.stringify([
    { title: "Sign Up Free", desc: "Create your brand account and get free credits to start exploring." },
    { title: "Choose Your Mode", desc: "Search manually, use AI Matchmaking, post a Campaign, or offer Barter. Four ways to find your perfect creator." },
    { title: "Connect and Collaborate", desc: "Unlock creator profiles, review their portfolio, and send your brief directly." },
    { title: "Pay Only on Approval", desc: "Your payment stays in escrow until you approve the content. Zero risk." },
  ]),
  "brand.collab_modes.heading_line1": "4 Ways to",
  "brand.collab_modes.heading_highlight1": "Collaborate",
  "brand.collab_modes.subheading": "One Platform. Four Powerful Ways to Connect.",
  "brand.collab_modes.modes": JSON.stringify([
    { num: "01", title: "Search", desc: "Browse verified creators manually. Filter by category, niche, audience, price range, and rating. Full control. Zero guesswork.", steps: ["Browse Creators", "Filter & Refine", "Unlock Profile", "Collaborate"] },
    { num: "02", title: "AI Matchmaking", desc: "Fill a short brief. AI scores every creator out of 100 and ranks the best fit for your campaign.", steps: ["Fill Campaign Brief", "AI Scores Creators", "View Ranked Results", "Collaborate"] },
    { num: "03", title: "Campaign", desc: "Post your campaign brief and fixed price. Creators apply. You review, shortlist, and select the best fit.", steps: ["Post Your Brief", "Creators Apply", "Shortlist", "Collaborate"] },
    { num: "04", title: "Barter", desc: "No cash budget? No problem. Offer your product instead of payment. Creators get the product. You get the content.", steps: ["Offer Your Product", "Creators Apply", "Select Your Match", "Collaborate"] },
  ]),
  "brand.comparison.heading_line1": "The Old Way vs The",
  "brand.comparison.heading_highlight1": "Collabry Way",
  "brand.comparison.rows": JSON.stringify([
    { feature: "Finding Creators", old: "Random Instagram DMs", collabry: "Verified creator profiles" },
    { feature: "Verifying Identity", old: "No identity verification", collabry: "Every creator reviewed by admin" },
    { feature: "Pricing", old: "No standard rates", collabry: "Transparent pricing slabs" },
    { feature: "Negotiation", old: "WhatsApp back and forth", collabry: "Built-in negotiation system" },
    { feature: "Payment Safety", old: "Bank transfer risk", collabry: "Secure escrow payments" },
    { feature: "Disputes", old: "No dispute resolution", collabry: "Structured dispute process" },
    { feature: "Transparency", old: "Zero visibility", collabry: "Full deal tracking dashboard" },
    { feature: "Time to Start", old: "Days of research", collabry: "AI Matchmaking in minutes" },
    { feature: "Communication", old: "Scattered across apps", collabry: "Everything in one platform" },
  ]),
  "brand.cta.btn_text": "Start as a Brand — Sign Up Free",
  "brand.cta.btn_link": "/signup-brand",
  "brand.team.heading_line1": "Meet the",
  "brand.team.heading_highlight1": "Collabry Team",
  "brand.team.members": JSON.stringify([
    { name: "Nikhil Goyal", role: "Founder & CEO", emoji: "🧑‍💻", color: "#4CAF82" },
    { name: "Angad Sehgal", role: "CTO", emoji: "👩‍💼", color: "#E8A0B4" },
    { name: "Navneet Singh", role: "Head of Design", emoji: "🧑‍🎨", color: "#A8D8EA" },
  ]),
  "brand.footer.tagline": "India's trusted influencer marketplace.",
  "brand.footer.copyright": "© 2025 Collabry. Made with ❤️ in India 🇮🇳 · Payments secured by Razorpay",
};

const POLL_MS = 30_000;
export const BRAND_LANDING_UPDATE_CHANNEL = "collabry_brand_landing_update";
export const BRAND_LANDING_CACHE_KEY = "collabry_brand_landing_v1";

function readCache(): BrandContentMap {
  try {
    const raw = localStorage.getItem(BRAND_LANDING_CACHE_KEY);
    if (raw) return { ...BRAND_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...BRAND_DEFAULTS };
}

export function writeBrandLandingCache(items: Array<{ key: string; value: string }>) {
  try {
    const existing: Record<string, string> = {};
    items.forEach((item) => { existing[item.key] = item.value; });
    const prev = JSON.parse(localStorage.getItem(BRAND_LANDING_CACHE_KEY) ?? "{}");
    localStorage.setItem(BRAND_LANDING_CACHE_KEY, JSON.stringify({ ...prev, ...existing }));
  } catch { /* ignore */ }
}

export function useBrandLandingContent() {
  const [content, setContent] = useState<BrandContentMap>(readCache);

  const apply = (items: Array<{ key: string; value: string }> | null) => {
    if (!items) return;
    const brandItems = items.filter((i) => i.key.startsWith("brand."));
    const merged = { ...BRAND_DEFAULTS };
    brandItems.forEach((item) => { merged[item.key] = item.value; });
    setContent(merged);
    writeBrandLandingCache(brandItems);
  };

  useEffect(() => {
    const cached = getCachedLandingContent();
    if (cached) apply(cached);
    fetchLandingContent().then(apply);
    const interval = setInterval(() => fetchLandingContent(true).then(apply), POLL_MS);
    const channel = new BroadcastChannel(BRAND_LANDING_UPDATE_CHANNEL);
    channel.onmessage = () => fetchLandingContent(true).then(apply);
    return () => { clearInterval(interval); channel.close(); };
  }, []);

  const get = (key: string): string => content[key] ?? BRAND_DEFAULTS[key] ?? "";
  const getJson = <T,>(key: string): T => {
    try { return JSON.parse(get(key)) as T; } catch { return JSON.parse(BRAND_DEFAULTS[key] ?? "[]") as T; }
  };

  return { get, getJson };
}

export type BrandLandingContentHook = ReturnType<typeof useBrandLandingContent>;
export { BRAND_DEFAULTS };
