// Shared types for the scripted chatbot (admin editor + public widget).

export interface ChatNode {
  id: string;
  question: string;   // the option button label
  answer: string;     // the bot's reply text
  children: ChatNode[];
}

export interface ChatbotConfig {
  enabled: boolean;
  botName: string;
  welcomeMessage: string;
  tree: ChatNode[];
}

export const DEFAULT_CHATBOT_CONFIG: ChatbotConfig = {
  enabled: false,
  botName: "Radhika from Collabry",
  welcomeMessage: "Hi! 👋 I'm Radhika from Collabry. What can I help you with today?",
  tree: [],
};

export type ChatAudience = "brand" | "creator";

/**
 * Which chatbot (if any) a route should show. Brand bot on brand-related pages,
 * creator bot on creator-related pages; nothing on the root landing ("/") or
 * admin pages (and neutral public pages like legal/about). `path` is wouter's
 * location (no base, no query).
 */
export function chatAudienceForPath(path: string): ChatAudience | null {
  const p = path || "/";
  if (p === "/" || p.startsWith("/admin-collabryangad")) return null;

  // Creator-related
  if (
    p === "/creator" ||
    p === "/explore-brands" ||
    p === "/signup-creator" ||
    p === "/login-creator" ||
    p === "/forgot-password-creator" ||
    p === "/home-creator" || p.startsWith("/home-creator/")
  ) return "creator";

  // Brand-related (note: "/creator/:username" is the brand-only creator profile)
  if (
    p === "/brand" ||
    p === "/signup-brand" ||
    p === "/login-brand" ||
    p === "/forgot-password-brand" ||
    p === "/payment-return" ||
    p === "/home-brand" || p.startsWith("/home-brand/") ||
    p.startsWith("/white-glove-service") ||
    p.startsWith("/advertise-your-brand") ||
    p.startsWith("/creator/")
  ) return "brand";

  // Neutral/shared pages (/, legal, about, reset-password, …) → no bot.
  return null;
}
