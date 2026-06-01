import { useState, useEffect } from "react";
import { fetchLandingContent, getCachedLandingContent } from "@/lib/landingContentFetcher";

export interface CreatorContentMap {
  [key: string]: string;
}

const CREATOR_DEFAULTS: CreatorContentMap = {
  "creator.header.logo_text": "Collabry",
  "creator.header.signup_btn_creator": "Sign Up as a Creator",
  "creator.header.signup_btn_brand": "Sign Up as a Brand",

  "creator.hero.heading_line1": "Stop Chasing",
  "creator.hero.heading_highlight1": "Brands.",
  "creator.hero.heading_line2": "Let Them Come to",
  "creator.hero.heading_highlight2": "You.",
  "creator.hero.subheading": "India's most trusted influencer marketplace — verified brand campaigns, secure escrow payments, and four powerful ways to get discovered. Built for creators who are serious about their craft.",
  "creator.hero.tagline": "Get discovered. Create content. Get paid on time.",
  "creator.hero.cta_btn": "Join as a Creator →",
  "creator.hero.cta_link": "/signup-creator",
  "creator.hero.badge1": "Escrow Protected",
  "creator.hero.badge2": "Verified Brands",
  "creator.hero.badge3": "4 Ways to Collab",

  "creator.earnings.heading_line1": "Earnings & Safety",
  "creator.earnings.heading_highlight1": "focused",
  "creator.earnings.subheading": "Why Creators Trust Collabry",
  "creator.earnings.cards": JSON.stringify([
    { value: "₹0 Chasing", label: "Your payment is secured in escrow before the deal starts. You create, we protect." },
    { value: "2 Rounds Max", label: "Brands can only ask for 2 revisions per deliverable. Your time is respected." },
    { value: "100% Verified", label: "Every brand on Collabry is registered and reviewed. No fake campaigns, ever." },
    { value: "4 Ways", label: "Get discovered through Search, AI Matchmaking, Campaigns, or Barter. More chances to collab." },
    { value: "The Problem", label: "Creators spend weeks chasing payments, dealing with vague briefs, and working with unverified brands." },
    { value: "The Fix", label: "Collabry puts you in control. Structured deals, secure payments, and real brands who mean business." },
  ]),
  "creator.earnings.closing_line": "The best creators don't just make content — they build businesses. Collabry is where that journey starts.",

  "creator.how_it_works.subheading": "Simple for Creators. Powerful for Results.",
  "creator.how_it_works.creator_steps": JSON.stringify([
    { title: "Create Your Profile", desc: "Set your rates for reels, stories and posts. Upload your best work. Tell brands who you are." },
    { title: "Get Verified", desc: "Our team reviews every creator before they go live. Only real, genuine creators make it in." },
    { title: "Connect and Collaborate", desc: "Receive direct requests from brands, apply to open campaigns, or get discovered through AI-powered matching." },
    { title: "Get Paid Securely", desc: "Your payment is held in escrow and released the moment your content goes live. No delays. No chasing. Just earnings." },
  ]),

  "creator.collab_modes.heading_line1": "4 Ways to",
  "creator.collab_modes.heading_highlight1": "Get Discovered",
  "creator.collab_modes.subheading": "One Platform. Four Powerful Ways to Connect.",
  "creator.collab_modes.modes": JSON.stringify([
    { num: "01", title: "Search", desc: "Browse verified creators manually. Filter by category, niche, audience, price range, and rating. Full control. Zero guesswork.", steps: ["Browse Creators", "Filter and Refine", "Unlock Profile", "Collaborate"] },
    { num: "02", title: "AI Matchmaking", desc: "Fill a short brief. AI scores every creator out of 100 and ranks the best fit for your campaign.", steps: ["Fill Campaign Brief", "AI Scores Creators", "View Ranked Results", "Collaborate"] },
    { num: "03", title: "Campaign", desc: "Post your campaign brief and fixed price. Creators apply. You review, shortlist, and select the best fit.", steps: ["Post Your Brief", "Creators Apply", "Shortlist and Filter", "Collaborate"] },
    { num: "04", title: "Barter", desc: "No cash budget? No problem. Offer your product instead of payment. Creator gets the product. You get the content.", steps: ["Offer Your Product", "Creators Apply", "Select Your Match", "Collaborate"] },
  ]),

  "creator.comparison.heading_line1": "The Old Way vs The",
  "creator.comparison.heading_highlight1": "Collabry Way",
  "creator.comparison.rows": JSON.stringify([
    { feature: "Finding Brands", old: "Cold DMs that get ignored", collabry: "Verified brands come to you" },
    { feature: "Brand Verification", old: "No way to spot fake brands", collabry: "Every brand reviewed by admin" },
    { feature: "Payment Safety", old: "Chase brands for weeks", collabry: "Escrow — paid the moment content goes live" },
    { feature: "Revisions", old: "Endless unpaid revisions", collabry: "Capped at 2 rounds per deliverable" },
    { feature: "Pricing", old: "Undervalue your work", collabry: "Set transparent rates upfront" },
    { feature: "Disputes", old: "No support, no recourse", collabry: "Admin mediation built in" },
    { feature: "Discovery", old: "Algorithm dependent", collabry: "Search + AI matching + campaigns" },
    { feature: "Workflow", old: "Scattered across DMs and email", collabry: "Everything in one place" },
  ]),
};

const POLL_MS = 30_000;
export const CREATOR_LANDING_UPDATE_CHANNEL = "collabry_creator_landing_update";
export const CREATOR_LANDING_CACHE_KEY = "collabry_creator_landing_v1";

function readCache(): CreatorContentMap {
  try {
    const raw = localStorage.getItem(CREATOR_LANDING_CACHE_KEY);
    if (raw) return { ...CREATOR_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...CREATOR_DEFAULTS };
}

export function writeCreatorLandingCache(items: Array<{ key: string; value: string }>) {
  try {
    const existing: Record<string, string> = {};
    items.forEach((item) => { existing[item.key] = item.value; });
    const prev = JSON.parse(localStorage.getItem(CREATOR_LANDING_CACHE_KEY) ?? "{}");
    localStorage.setItem(CREATOR_LANDING_CACHE_KEY, JSON.stringify({ ...prev, ...existing }));
  } catch { /* ignore */ }
}

export function useCreatorLandingContent() {
  const [content, setContent] = useState<CreatorContentMap>(readCache);

  const apply = (items: Array<{ key: string; value: string }> | null) => {
    if (!items) return;
    const creatorItems = items.filter((i) => i.key.startsWith("creator."));
    const merged = { ...CREATOR_DEFAULTS };
    creatorItems.forEach((item) => { merged[item.key] = item.value; });
    setContent(merged);
    writeCreatorLandingCache(creatorItems);
  };

  useEffect(() => {
    const cached = getCachedLandingContent();
    if (cached) apply(cached);
    fetchLandingContent().then(apply);
    const interval = setInterval(() => fetchLandingContent(true).then(apply), POLL_MS);
    const channel = new BroadcastChannel(CREATOR_LANDING_UPDATE_CHANNEL);
    channel.onmessage = () => fetchLandingContent(true).then(apply);
    return () => { clearInterval(interval); channel.close(); };
  }, []);

  const get = (key: string): string => content[key] ?? CREATOR_DEFAULTS[key] ?? "";
  const getJson = <T,>(key: string): T => {
    try { return JSON.parse(get(key)) as T; } catch { return JSON.parse(CREATOR_DEFAULTS[key] ?? "[]") as T; }
  };

  return { get, getJson };
}

export type CreatorLandingContentHook = ReturnType<typeof useCreatorLandingContent>;
export { CREATOR_DEFAULTS };
