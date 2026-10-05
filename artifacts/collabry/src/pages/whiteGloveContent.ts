// Shared types + built-in defaults for the White Glove Service page.
// These defaults mirror the server's WHITE_GLOVE_DEFAULT (adminConfig.ts) and are
// used as an immediate client-side fallback so the public page, thank-you page, and
// admin editor can ALWAYS render even when GET /api/white-glove fails or is down.

export interface ServicePoint { title: string; desc: string }

export interface Plan {
  id: string;
  name: string;
  desc: string;
  months: number;
  mrp: number;
  price: number;
  badge: string;        // e.g. "Most popular" — empty for no badge
  perks: string[];      // extra perk lines (Growth/Scale); Starter can be []
  buttonLabel: string;  // CTA label on the plan card
}

export interface Founder {
  name: string;
  designation: string;
  image: string;        // objectPath (/uploads-image/..) or full URL; "" => initial avatar
}

export interface WhiteGlove {
  heroTag: string;
  heroLine1: string; heroLine2: string; heroSub: string;
  includedLine1: string; includedLine2: string; includedSub: string;
  points: ServicePoint[];
  pricingLine1: string; pricingLine2: string;
  plans: Plan[];
  pricingNote: string;
  // Returning-member card (shown to active members instead of pricing)
  memberHeading: string; memberSubtext: string;
  // Thank-you page "Our message to you" dropdown
  thankYouMessage: string;
  // Founder-to-Founder section
  founderHeading: string; founderSubheading: string;
  founders: Founder[];
  footerNote: string;
}

export const WHITE_GLOVE_DEFAULT: WhiteGlove = {
  heroTag: "White Glove · fully managed for you",
  heroLine1: "Hand us your creator marketing.",
  heroLine2: "We'll run every bit of it.",
  heroSub: "No searching for creators, no chasing deliverables, no juggling payments. A dedicated Collabry team takes the entire process off your plate — you simply approve and watch it work.",
  includedLine1: "One complete service.",
  includedLine2: "Included in every plan.",
  includedSub: "The same end-to-end concierge service across all three plans — only the duration and price change.",
  points: [
    { title: "Dedicated account management", desc: "A single point of contact from our team for your whole subscription — no more juggling multiple creator chats yourself." },
    { title: "Curated creator shortlisting", desc: "We source and shortlist creators matched to your niche, audience and budget — refreshed each cycle as new creators join." },
    { title: "End-to-end outreach & negotiation", desc: "We make first contact, pitch the collaboration, and negotiate terms — barter value or payout, deliverables and timeline — on your behalf." },
    { title: "Deal setup & documentation", desc: "Deal creation, contracting and platform setup handled by us. You get a ready summary per deal, with no manual entry." },
    { title: "Campaign briefing & creative guidance", desc: "We brief every creator on your brand guidelines, do's and don'ts, so the content always stays on-brand." },
    { title: "Timeline & deliverable tracking", desc: "Active monitoring of every deal's status and deadline, so nothing slips through the cracks." },
    { title: "Payment & escrow handling", desc: "We manage payout releases, refunds and escrow — you get one consolidated monthly invoice instead of per-deal billing." },
    { title: "Priority support", desc: "Faster response times, a priority queue, and a direct escalation path for any disputes or creator no-shows." },
  ],
  pricingLine1: "Choose how long you want us.",
  pricingLine2: "The longer you go, the less you pay.",
  plans: [
    { id: "starter", name: "Starter", desc: "Perfect for a one-off push or a first taste of the service.", months: 1, mrp: 10000, price: 1200, badge: "", perks: [], buttonLabel: "Get started" },
    { id: "growth", name: "Growth", desc: "For brands running steady, ongoing creator campaigns.", months: 3, mrp: 25000, price: 3200, badge: "Most popular", perks: ["Lower per-month rate", "Same account manager all term"], buttonLabel: "Choose Growth" },
    { id: "scale", name: "Scale", desc: "Best value for always-on, long-term creator marketing.", months: 6, mrp: 45000, price: 5800, badge: "", perks: ["Lowest per-month rate", "Same account manager all term"], buttonLabel: "Get started" },
  ],
  pricingNote: "Secure payment via Razorpay · Our team reaches out within 24 hours of purchase",
  memberHeading: "You're a Collabry White Glove member",
  memberSubtext: "Your dedicated team is running your creator marketing end to end. Sit back — we've got this.",
  thankYouMessage: "Thank you for trusting Collabry with your creator marketing. Our team is already on it — we'll personally handle every step and make sure your collaborations run smoothly, start to finish. You're in good hands.",
  founderHeading: "From Founder to Founder",
  founderSubheading: "We made it because we need it.",
  founders: [
    { name: "Navneet", designation: "Founder", image: "" },
    { name: "Angad", designation: "Co-founder", image: "" },
    { name: "Nikhil Goel", designation: "Co-founder", image: "" },
  ],
  footerNote: "A Krida Ventures Company · Gurugram, Haryana",
};
