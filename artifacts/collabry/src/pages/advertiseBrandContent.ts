// Shared types + built-in defaults for the /advertise-your-brand page.
// Mirrors whiteGloveContent.ts, minus GST / membership (display + thank-you only).
// Used as an immediate client-side fallback so the public page, thank-you page,
// and admin editor can ALWAYS render even when GET /api/advertise-brand fails.

export interface AdvPoint { title: string; desc: string }

export interface AdvPlan {
  id: string;
  name: string;
  desc: string;
  months: number;
  mrp: number;
  price: number;
  badge: string;        // e.g. "Most popular" — empty for no badge
  perks: string[];
  buttonLabel: string;  // CTA label on the plan card
}

export interface AdvFounder {
  name: string;
  designation: string;
  image: string;        // objectPath (/uploads-image/..) or full URL; "" => initial avatar
}

export interface AdvertiseBrand {
  heroTag: string;
  heroLine1: string; heroLine2: string; heroSub: string;
  includedLine1: string; includedLine2: string; includedSub: string;
  points: AdvPoint[];
  pricingLine1: string; pricingLine2: string;
  plans: AdvPlan[];
  pricingNote: string;
  thankYouMessage: string;
  founderHeading: string; founderSubheading: string;
  founders: AdvFounder[];
  footerNote: string;
}

export const ADVERTISE_BRAND_DEFAULT: AdvertiseBrand = {
  heroTag: "Advertise · reach creators who convert",
  heroLine1: "Advertise your brand.",
  heroLine2: "Reach creators who convert.",
  heroSub: "Feature your brand across Collabry — in creator feeds, on campaign pages and on a dedicated brand page. We place it where creators and their audiences actually look, so the right people discover you.",
  includedLine1: "One ad package.",
  includedLine2: "Everything your brand needs.",
  includedSub: "Every plan includes the same full-funnel brand placement across Collabry — only the duration and price change.",
  points: [
    { title: "Premium feed placement", desc: "Your brand shows in the creator ad scroller on Home and Campaigns, in display order." },
    { title: "Dedicated brand page", desc: "A full Explore-Brands card with your headline, image and story that creators can tap into." },
    { title: "Always-on visibility", desc: "Your placement runs for the whole term — seen by every creator who opens the app." },
    { title: "Creative help", desc: "We help size and polish your 16:9 banner so it looks sharp on every device." },
    { title: "Priority positioning", desc: "Longer plans get front-of-feed ordering, so your brand is seen first." },
    { title: "Audience relevance", desc: "Placed in front of the creators most relevant to your brand and category." },
    { title: "Live placement visibility", desc: "Know your placement is live and where it appears across the app." },
    { title: "Dedicated support", desc: "A point of contact to update your creative or swap your message any time during the term." },
  ],
  pricingLine1: "Choose how long you run.",
  pricingLine2: "The longer you go, the less you pay.",
  plans: [
    { id: "m1", name: "1 Month", desc: "A focused one-month brand push.", months: 1, mrp: 18000, price: 12000, badge: "", perks: [], buttonLabel: "Get started" },
    { id: "m3", name: "3 Months", desc: "Sustained visibility for steady growth.", months: 3, mrp: 54000, price: 30000, badge: "Most popular", perks: ["Lower per-month rate", "Priority feed positioning"], buttonLabel: "Choose 3 Months" },
    { id: "m6", name: "6 Months", desc: "Best value for always-on brand presence.", months: 6, mrp: 108000, price: 54000, badge: "", perks: ["Lowest per-month rate", "Front-of-feed priority"], buttonLabel: "Get started" },
  ],
  pricingNote: "Our team reaches out within 24 hours to set up your placement.",
  thankYouMessage: "Thank you for choosing to advertise with Collabry. Our team will set up your brand placement and reach out shortly to finalise the creative and go live. Welcome aboard.",
  founderHeading: "From Founder to Founder",
  founderSubheading: "We built the audience you want to reach.",
  founders: [
    { name: "Navneet", designation: "Founder", image: "" },
    { name: "Angad", designation: "Co-founder", image: "" },
    { name: "Nikhil Goel", designation: "Co-founder", image: "" },
  ],
  footerNote: "A Krida Ventures Company · Gurugram, Haryana",
};
