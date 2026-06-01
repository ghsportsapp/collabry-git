import { useState, useEffect } from "react";
import {
  fetchLandingContent,
  fetchLandingHeavy,
  fetchHeroMedia,
  bustAllCaches,
  getCachedLandingContent,
  getHeroCached,
} from "@/lib/landingContentFetcher";

export interface ContentMap {
  [key: string]: string;
}

const DEFAULTS: ContentMap = {
  "header.logo_text": "Collabry",
  "header.brand_cta": "Signup as a Brand",
  "header.creator_cta": "Signup as a Creator",
  "hero.heading_line1": "Collaborate",
  "hero.heading_highlight1": "Smarter.",
  "hero.heading_line2": "Grow",
  "hero.heading_highlight2": "Faster.",
  "hero.subheading": "India's most trusted influencer platform — verified profiles, secure escrow payments, and four powerful ways to collaborate.",
  "hero.bold_line": "Verified creators. Secure payments. Real results.",
  "hero.brand_btn": "I am a Brand →",
  "hero.creator_btn": "I am a Creator →",
  "hero.media_cards": JSON.stringify([
    { type: "photo", src: "" },
    { type: "photo", src: "" },
    { type: "photo", src: "" },
    { type: "photo", src: "" },
    { type: "photo", src: "" },
  ]),
  "how_it_works.title": "How it Works?",
  "how_it_works.subtitle": "Simple for Everyone. Powerful for Results.",
  "how_it_works.brand_steps": JSON.stringify([
    { title: "Sign Up Free", desc: "Create your brand account and get free credits to start exploring." },
    { title: "Choose Your Mode", desc: "Search manually, use AI Matchmaking, post a Campaign, or offer Barter." },
    { title: "Connect and Collaborate", desc: "Unlock creator profiles, review their portfolio, and send your brief directly." },
    { title: "Pay Only on Approval", desc: "Your payment stays in escrow until you approve the content. Zero risk." },
  ]),
  "how_it_works.creator_steps": JSON.stringify([
    { title: "Build Your Profile", desc: "Set your rates for reels, stories and posts. Upload your best work. Tell brands who you are." },
    { title: "Get Verified", desc: "Our team reviews every creator before they go live. Only real, genuine creators make it in." },
    { title: "Start Earning", desc: "Receive direct requests from brands, apply to open campaigns, or get discovered through AI-powered matching." },
    { title: "Get Paid Securely", desc: "Your payment is held in escrow and released the moment your content goes live. No delays. No chasing. Just earnings." },
  ]),
  "collab_modes.heading_line1": "4 Ways to",
  "collab_modes.heading_highlight1": "Collaborate",
  "collab_modes.subheading": "One Platform. Four Powerful Ways to Connect.",
  "collab_modes.modes": JSON.stringify([
    { num: "01", title: "Search", desc: "Browse verified creators manually. Filter by category, niche, audience, price range, and rating. Full control. Zero guesswork.", steps: ["Browse Creators", "Filter and Refine", "Unlock Profile", "Collaborate"] },
    { num: "02", title: "AI Matchmaking", desc: "Tell us your campaign goal and target audience. Our algorithm scores every creator out of 100 and ranks the best matches for you.", steps: ["Fill Campaign Brief", "AI Scores Creators", "View Ranked Results", "Collaborate"] },
    { num: "03", title: "Campaign", desc: "Post your campaign brief and fixed price. Creators apply to you. Review applicants, shortlist for free, and select the best fit.", steps: ["Post Your Brief", "Creators Apply", "Shortlist and Filter", "Collaborate"] },
    { num: "04", title: "Barter", desc: "No cash budget? No problem. Offer your product instead of payment. Creator gets the product. You get the content.", steps: ["Offer Your Product", "Creators Apply", "Select Your Match", "Collaborate"] },
  ]),
  "comparison.rows": JSON.stringify([
    { feature: "Finding Creators", old: "Random Instagram DMs", collabry: "Search + AI Matching" },
    { feature: "Verifying Identity", old: "No verification", collabry: "Admin verified profiles" },
    { feature: "Fake Followers", old: "No way to check", collabry: "Every creator reviewed" },
    { feature: "Pricing", old: "No standard rates", collabry: "Transparent slab pricing" },
    { feature: "Negotiation", old: "No standard rates", collabry: "Structured 4-round system" },
    { feature: "Communication", old: "Scattered across apps", collabry: "Everything in one place" },
    { feature: "Payment Safety", old: "Bank transfer risk", collabry: "Escrow — pay on approval" },
    { feature: "Disputes", old: "No resolution", collabry: "Admin mediation built in" },
    { feature: "Transparency", old: "Zero visibility", collabry: "Full deal audit trail" },
    { feature: "Time to Start", old: "Days of research", collabry: "Minutes" },
  ]),
  "footer.tagline": "India's trusted influencer marketplace.",
  "footer.copyright": "© 2025 Collabry. Made with ❤️ in India 🇮🇳 · Payments secured by Razorpay",
  "footer.instagram_url": "https://instagram.com/collabryofficial",
  "footer.linkedin_url": "https://linkedin.com/company/collabry",
  "landing.explore_brand_btn": "Explore Collabry as a Brand →",
  "landing.explore_creator_btn": "Explore Collabry as a Creator →",
};

const POLL_INTERVAL_MS = 30_000;
export const LANDING_UPDATE_CHANNEL = "collabry_landing_update";
export const LANDING_CACHE_KEY = "collabry_landing_v2";

function readLandingCache(): ContentMap {
  try {
    const raw = localStorage.getItem(LANDING_CACHE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function writeLandingCache(items: Array<{ key: string; value: string }>) {
  try {
    const MAX_VALUE = 50_000;
    const existing: Record<string, string> = {};
    items.forEach((item) => {
      if (item.value.length <= MAX_VALUE) existing[item.key] = item.value;
    });
    const prev = JSON.parse(localStorage.getItem(LANDING_CACHE_KEY) ?? "{}");
    localStorage.setItem(LANDING_CACHE_KEY, JSON.stringify({ ...prev, ...existing }));
  } catch { /* ignore */ }
}

export function useLandingContent() {
  const [content, setContent] = useState<ContentMap>(readLandingCache);
  const [loading, setLoading] = useState(true);
  // heroReady: true immediately if we already have in-memory hero data (e.g. SPA nav back)
  const [heroReady, setHeroReady] = useState<boolean>(() => getHeroCached() !== null);

  const applyItems = (items: Array<{ key: string; value: string }> | null, isFirstLoad: boolean) => {
    if (items) {
      // IMPORTANT: only patch the exact keys returned — never start from DEFAULTS.
      // Starting from DEFAULTS would write empty hero.media_cards / default step data
      // on top of real values that p2/p3 may have already written to state (race condition).
      const patch: ContentMap = {};
      items.forEach((item) => { patch[item.key] = item.value; });
      setContent((prev) => ({ ...prev, ...patch }));
      writeLandingCache(items);
    }
    if (isFirstLoad) setLoading(false);
  };

  const mergeExtra = (extra: Record<string, string>) => {
    setContent((prev) => ({ ...prev, ...extra }));
  };

  const loadAll = (force = false, resetHero = false) => {
    // When admin triggers a reload, drop heroReady so shimmer shows instead of stale media
    if (resetHero) setHeroReady(false);

    // Fire all 3 fetches in parallel — heavy and hero do NOT wait for light content
    const p1 = fetchLandingContent(force);
    const p2 = fetchLandingHeavy(force);
    const p3 = fetchHeroMedia(force);

    p1.then((items) => {
      applyItems(items, true);
    });

    p2.then((heavy) => {
      if (heavy) {
        mergeExtra(heavy);
        // Persist CDN URLs / text to localStorage so they survive refresh
        writeLandingCache(
          Object.entries(heavy).map(([key, value]) => ({ key, value }))
        );
      }
    });

    p3.then((heroMedia) => {
      if (heroMedia) {
        mergeExtra({ "hero.media_cards": JSON.stringify(heroMedia) });
      }
      // Always mark ready after fetch resolves — even if media is null/empty
      setHeroReady(true);
    });
  };

  useEffect(() => {
    // Seed from in-memory module cache synchronously (instant, no flash)
    const cached = getCachedLandingContent();
    if (cached) applyItems(cached, true);

    loadAll(false);

    const interval = setInterval(() => {
      fetchLandingContent(true).then((items) => applyItems(items, false));
    }, POLL_INTERVAL_MS);

    const channel = new BroadcastChannel(LANDING_UPDATE_CHANNEL);
    channel.onmessage = () => {
      bustAllCaches();
      // resetHero=true → shimmer until new media arrives, preventing stale flash
      loadAll(true, true);
    };

    return () => {
      clearInterval(interval);
      channel.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const get = (key: string): string => content[key] ?? DEFAULTS[key] ?? "";

  const getJson = <T,>(key: string): T => {
    try {
      return JSON.parse(get(key)) as T;
    } catch {
      return JSON.parse(DEFAULTS[key] ?? "[]") as T;
    }
  };

  return { get, getJson, loading, heroReady };
}

export type LandingContentHook = ReturnType<typeof useLandingContent>;
