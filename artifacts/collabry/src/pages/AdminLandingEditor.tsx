import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Save, Eye, Upload, ArrowLeft, Plus, Trash2, AlertCircle, Image, Video, X } from "lucide-react";
import { LANDING_UPDATE_CHANNEL, writeLandingCache } from "@/hooks/useLandingContent";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function notifyLandingPage() {
  try {
    new BroadcastChannel(LANDING_UPDATE_CHANNEL).postMessage("update");
  } catch { /* ignore */ }
}

interface ContentItem {
  key: string;
  value: string;
  type: "text" | "image" | "color" | "json";
  section: string;
}

interface TeamMember {
  name: string;
  role: string;
  color: string;
  image?: string;
  emoji?: string;
}

interface ComparisonRow {
  feature: string;
  old: string;
  collabry: string;
}

interface CollabMode {
  num: string;
  title: string;
  desc: string;
  steps: string[];
}

interface HowItWorksStep {
  title: string;
  desc: string;
  image?: string;
}

interface HeroMedia {
  type: "photo" | "video";
  src?: string;
}

const DEFAULT_CONTENT: Record<string, ContentItem> = {
  "header.brand_cta": { key: "header.brand_cta", value: "Signup as a Brand", type: "text", section: "header" },
  "header.creator_cta": { key: "header.creator_cta", value: "Signup as a Creator", type: "text", section: "header" },
  "header.logo_text": { key: "header.logo_text", value: "Collabry", type: "text", section: "header" },
  "hero.heading_line1": { key: "hero.heading_line1", value: "Collaborator", type: "text", section: "hero" },
  "hero.heading_highlight1": { key: "hero.heading_highlight1", value: "Smarter", type: "text", section: "hero" },
  "hero.heading_line2": { key: "hero.heading_line2", value: "Growing", type: "text", section: "hero" },
  "hero.heading_highlight2": { key: "hero.heading_highlight2", value: "Faster", type: "text", section: "hero" },
  "hero.subheading": { key: "hero.subheading", value: "India's most trusted influencer platform — verified profiles, secure escrow payments, and four powerful ways to collaborate.", type: "text", section: "hero" },
  "hero.bold_line": { key: "hero.bold_line", value: "Verified creators. Secure payments. Real results.", type: "text", section: "hero" },
  "hero.brand_btn": { key: "hero.brand_btn", value: "I am a Brand →", type: "text", section: "hero" },
  "hero.creator_btn": { key: "hero.creator_btn", value: "I am a Creator →", type: "text", section: "hero" },
  "hero.media_cards": { key: "hero.media_cards", value: JSON.stringify([
    { type: "photo", src: "" },
    { type: "photo", src: "" },
    { type: "photo", src: "" },
    { type: "photo", src: "" },
    { type: "photo", src: "" },
  ]), type: "json", section: "hero" },
  "how_it_works.title": { key: "how_it_works.title", value: "How it Works?", type: "text", section: "how_it_works" },
  "how_it_works.subtitle": { key: "how_it_works.subtitle", value: "Simple for Everyone. Powerful for Results.", type: "text", section: "how_it_works" },
  "how_it_works.brand_section_heading": { key: "how_it_works.brand_section_heading", value: "How Collabry works for Brands?", type: "text", section: "how_it_works" },
  "how_it_works.creator_section_heading": { key: "how_it_works.creator_section_heading", value: "How Collabry works for Creators?", type: "text", section: "how_it_works" },
  "how_it_works.brand_steps": { key: "how_it_works.brand_steps", value: JSON.stringify([
    { title: "Sign Up Free", desc: "Create your brand account and get free credits to start exploring.", image: "" },
    { title: "Choose Your Mode", desc: "Search manually, use AI Matchmaking, post a Campaign, or offer Barter.", image: "" },
    { title: "Connect and Collaborate", desc: "Unlock creator profiles, review their portfolio, and send your brief directly.", image: "" },
    { title: "Pay Only on Approval", desc: "Your payment stays in escrow until you approve the content. Zero risk.", image: "" },
  ]), type: "json", section: "how_it_works" },
  "how_it_works.creator_steps": { key: "how_it_works.creator_steps", value: JSON.stringify([
    { title: "Create Your Profile", desc: "Set your rates for reels, stories and posts. Upload your portfolio. Connect your Instagram.", image: "" },
    { title: "Get Verified", desc: "Our team reviews every creator before they go live. Only real, genuine creators make it in.", image: "" },
    { title: "Connect and Collaborate", desc: "Receive direct requests from brands, apply to open campaigns, or get discovered through AI-powered matching.", image: "" },
    { title: "Get Paid Securely", desc: "Your payment is held in escrow and released the moment your content goes live.", image: "" },
  ]), type: "json", section: "how_it_works" },
  "collab_modes.heading_line1": { key: "collab_modes.heading_line1", value: "4 Ways to", type: "text", section: "collab_modes" },
  "collab_modes.heading_highlight1": { key: "collab_modes.heading_highlight1", value: "Collaborate", type: "text", section: "collab_modes" },
  "collab_modes.subheading": { key: "collab_modes.subheading", value: "One Platform. Four Powerful Ways to Connect.", type: "text", section: "collab_modes" },
  "collab_modes.modes": { key: "collab_modes.modes", value: JSON.stringify([
    { num: "01", title: "Search", desc: "Browse verified creators manually. Filter by category, niche, audience, price range, and rating. Full control. Zero guesswork.", steps: ["Browse Creators", "Filter and Refine", "Unlock Profile", "Collaborate"] },
    { num: "02", title: "AI Matchmaking", desc: "Tell us your campaign goal and target audience. Our algorithm scores every creator out of 100 and ranks the best matches for you.", steps: ["Fill Campaign Brief", "AI Scores Creators", "View Ranked Results", "Collaborate"] },
    { num: "03", title: "Campaign", desc: "Post your campaign brief and fixed price. Creators apply to you. Review applicants, shortlist for free, and select the best fit.", steps: ["Post Your Brief", "Creators Apply", "Shortlist and Filter", "Collaborate"] },
    { num: "04", title: "Barter", desc: "No cash budget? No problem. Offer your product instead of payment. Creator gets the product. You get the content.", steps: ["Offer Your Product", "Creators Apply", "Select Your Match", "Collaborate"] },
  ]), type: "json", section: "collab_modes" },
  "comparison.rows": { key: "comparison.rows", value: JSON.stringify([
    { feature: "Finding Creators", old: "Random Instagram DMs", collabry: "Search + AI Matching" },
    { feature: "Verifying Identity", old: "No verification", collabry: "Admin verified profiles" },
    { feature: "Fake Followers", old: "No way to check", collabry: "Every creator reviewed" },
    { feature: "Pricing", old: "No standard rates", collabry: "Transparent slab pricing" },
    { feature: "Negotiation", old: "WhatsApp back and forth", collabry: "Structured 4-round system" },
    { feature: "Payment Safety", old: "Bank transfer risk", collabry: "Escrow — pay on approval" },
    { feature: "Disputes", old: "No resolution", collabry: "Admin mediation built in" },
    { feature: "Transparency", old: "Zero visibility", collabry: "Full deal audit trail" },
    { feature: "Time to Start", old: "Days of research", collabry: "Minutes" },
    { feature: "Communication", old: "Communication", collabry: "Everything in one place" },
  ]), type: "json", section: "comparison" },
  "team.members": { key: "team.members", value: JSON.stringify([
    { name: "Nikki Goyal", role: "Founder & CEO", color: "#4CAF82", emoji: "🧑‍💻" },
    { name: "Angad Sehgal", role: "CTO", color: "#E8A0B4", emoji: "👩‍💼" },
    { name: "Navneet Singh", role: "Head of Design", color: "#A8D8EA", emoji: "🧑‍🎨" },
  ]), type: "json", section: "team" },
  "footer.tagline": { key: "footer.tagline", value: "India's trusted influencer marketplace.", type: "text", section: "footer" },
  "footer.copyright": { key: "footer.copyright", value: "© 2025 Collabry. Made with ❤️ in India 🇮🇳 · Payments secured by Razorpay", type: "text", section: "footer" },
  "footer.instagram_url": { key: "footer.instagram_url", value: "https://instagram.com/collabryofficial", type: "text", section: "footer" },
  "footer.linkedin_url": { key: "footer.linkedin_url", value: "https://linkedin.com/company/collabry", type: "text", section: "footer" },
  "landing.explore_brand_btn": { key: "landing.explore_brand_btn", value: "Explore Collabry as a Brand →", type: "text", section: "landing" },
  "landing.explore_creator_btn": { key: "landing.explore_creator_btn", value: "Explore Collabry as a Creator →", type: "text", section: "landing" },
  "colors.primary": { key: "colors.primary", value: "#E14F69", type: "color", section: "colors" },
  "colors.background": { key: "colors.background", value: "#0A0A0F", type: "color", section: "colors" },
  "colors.secondary_text": { key: "colors.secondary_text", value: "#9CA3AF", type: "color", section: "colors" },
};

const CMS_CACHE_KEY = "collabry_cms_v1";

function loadCached(): Record<string, ContentItem> {
  try {
    const raw = localStorage.getItem(CMS_CACHE_KEY);
    if (raw) return { ...DEFAULT_CONTENT, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_CONTENT };
}

function saveCache(c: Record<string, ContentItem>) {
  try {
    const stripped: Record<string, ContentItem> = {};
    for (const [k, v] of Object.entries(c)) {
      if (k !== "hero.media_cards") stripped[k] = v;
    }
    localStorage.setItem(CMS_CACHE_KEY, JSON.stringify(stripped));
  } catch { /* ignore */ }
}

export default function AdminLandingEditor() {
  const [content, setContent] = useState<Record<string, ContentItem>>(loadCached);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const loadContent = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/landing-content`);
      if (!res.ok) return;
      const items = (await res.json()) as ContentItem[];
      const merged = { ...DEFAULT_CONTENT };
      items.forEach((item) => { merged[item.key] = item; });
      setContent(merged);
      saveCache(merged);
    } catch {
      // Fall back to cached/defaults
    }
  }, []);

  useEffect(() => { loadContent(); }, [loadContent]);

  const updateField = (key: string, value: string) => {
    setContent((prev) => {
      const next = { ...prev, [key]: { ...prev[key], value } };
      saveCache(next);
      return next;
    });
    setHasUnsaved(true);
  };

  const saveAll = async (): Promise<boolean> => {
    setSaving(true);
    const items = Object.values(content).filter((item) => item.key !== "hero.media_cards");
    writeLandingCache(items);
    saveCache(content);
    try {
      const res = await fetch(`${BASE_URL}/api/landing-content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (!res.ok) throw new Error("Save failed");
      setHasUnsaved(false);
      setPreviewKey((k) => k + 1);
      notifyLandingPage();
      setStatus({ type: "success", message: "Draft saved" });
      setTimeout(() => setStatus(null), 3000);
      return true;
    } catch {
      setStatus({ type: "error", message: "Failed to save" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    const ok = await saveAll();
    setPublishing(false);
    if (ok) {
      setStatus({ type: "success", message: "Published! Changes are now live." });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const teamMembers: TeamMember[] = (() => { try { return JSON.parse(content["team.members"]?.value ?? "[]"); } catch { return []; } })();
  const comparisonRows: ComparisonRow[] = (() => { try { return JSON.parse(content["comparison.rows"]?.value ?? "[]"); } catch { return []; } })();
  const collabModes: CollabMode[] = (() => { try { return JSON.parse(content["collab_modes.modes"]?.value ?? "[]"); } catch { return []; } })();
  const brandSteps: HowItWorksStep[] = (() => { try { return JSON.parse(content["how_it_works.brand_steps"]?.value ?? "[]"); } catch { return []; } })();
  const creatorSteps: HowItWorksStep[] = (() => { try { return JSON.parse(content["how_it_works.creator_steps"]?.value ?? "[]"); } catch { return []; } })();
  const heroMediaCards: HeroMedia[] = (() => { try { return JSON.parse(content["hero.media_cards"]?.value ?? "[]"); } catch { return []; } })();

  const updateJsonArray = (key: string, arr: unknown[]) => updateField(key, JSON.stringify(arr));

  const handleHeroMediaUpload = async (slotIndex: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const r = await fetch(`${BASE_URL}/api/uploads/media`, { method: "POST", body: formData });
    if (!r.ok) return;
    const { objectPath } = (await r.json()) as { objectPath: string };
    const isVideo = file.type.startsWith("video/");
    setContent((prev) => {
      const currentCards: HeroMedia[] = (() => { try { return JSON.parse(prev["hero.media_cards"]?.value ?? "[]"); } catch { return []; } })();
      const updated = [...currentCards];
      while (updated.length <= slotIndex) updated.push({ type: "photo", src: "" });
      updated[slotIndex] = { type: isVideo ? "video" : "photo", src: objectPath };
      const newValue = JSON.stringify(updated);
      const newItem: ContentItem = { key: "hero.media_cards", value: newValue, type: "json", section: "hero" };
      const capturedNewItem = newItem;
      saveItems([newItem]).then((ok) => {
        setHasUnsaved(false);
        writeLandingCache([capturedNewItem]);
        setPreviewKey((k) => k + 1);
        if (ok) notifyLandingPage();
      });
      return { ...prev, "hero.media_cards": { ...prev["hero.media_cards"], value: newValue } };
    });
  };

  const clearHeroMedia = (slotIndex: number) => {
    setContent((prev) => {
      const currentCards: HeroMedia[] = (() => { try { return JSON.parse(prev["hero.media_cards"]?.value ?? "[]"); } catch { return []; } })();
      const updated = [...currentCards];
      while (updated.length <= slotIndex) updated.push({ type: "photo", src: "" });
      updated[slotIndex] = { type: "photo", src: "" };
      const newValue = JSON.stringify(updated);
      const newItem: ContentItem = { key: "hero.media_cards", value: newValue, type: "json", section: "hero" };
      const capturedNewItem = newItem;
      saveItems([newItem]).then((ok) => {
        setHasUnsaved(false);
        writeLandingCache([capturedNewItem]);
        setPreviewKey((k) => k + 1);
        if (ok) notifyLandingPage();
      });
      return { ...prev, "hero.media_cards": { ...prev["hero.media_cards"], value: newValue } };
    });
  };

  const saveItems = async (items: ContentItem[]): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE_URL}/api/landing-content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const uploadPublicImage = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);
    const r = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: formData });
    if (!r.ok) return null;
    const data = (await r.json()) as { objectPath?: string };
    return data.objectPath ?? null;
  };

  const handleImageUpload = async (index: number, file: File) => {
    const objectPath = await uploadPublicImage(file);
    if (!objectPath) return;
    const m = [...teamMembers];
    m[index] = { ...m[index], image: objectPath };
    const newValue = JSON.stringify(m);
    updateField("team.members", newValue);
    const newItem: ContentItem = {
      key: "team.members",
      value: newValue,
      type: "json",
      section: "team",
    };
    const allItems = Object.values(content).map((item) =>
      item.key === "team.members" ? newItem : item
    );
    await saveItems(allItems);
    setHasUnsaved(false);
  };

  const handleStepImageUpload = async (type: "brand" | "creator", index: number, file: File) => {
    const objectPath = await uploadPublicImage(file);
    if (!objectPath) return;
    const key = type === "brand" ? "how_it_works.brand_steps" : "how_it_works.creator_steps";
    const steps = type === "brand" ? [...brandSteps] : [...creatorSteps];
    steps[index] = { ...steps[index], image: objectPath };
    const newValue = JSON.stringify(steps);
    updateField(key, newValue);
    const newItem: ContentItem = { key, value: newValue, type: "json", section: "how_it_works" };
    await saveItems([newItem]);
    setHasUnsaved(false);
    writeLandingCache([newItem]);
    notifyLandingPage();
  };

  const clearStepImage = async (type: "brand" | "creator", index: number) => {
    const key = type === "brand" ? "how_it_works.brand_steps" : "how_it_works.creator_steps";
    const steps = type === "brand" ? [...brandSteps] : [...creatorSteps];
    steps[index] = { ...steps[index], image: "" };
    const newValue = JSON.stringify(steps);
    updateField(key, newValue);
    const newItem: ContentItem = { key, value: newValue, type: "json", section: "how_it_works" };
    await saveItems([newItem]);
    setHasUnsaved(false);
    writeLandingCache([newItem]);
    notifyLandingPage();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin-collabryangad" className="text-[#9CA3AF] hover:text-white transition-colors flex items-center gap-1.5 text-sm">
              <ArrowLeft className="w-4 h-4" />
              Admin Panel
            </Link>
            <span className="text-white/70">|</span>
            <h1 className="text-white font-semibold text-sm">Landing Page Editor</h1>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsaved && (
              <span className="text-yellow-400 text-xs flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Unpublished changes
              </span>
            )}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-[#9CA3AF] hover:text-white text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
            >
              <Eye className="w-4 h-4" />
              {showPreview ? "Edit" : "Preview"}
            </button>
            <button
              onClick={saveAll}
              disabled={saving || !hasUnsaved}
              className="text-white text-sm flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-40"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button
              onClick={publish}
              disabled={publishing}
              className="text-white text-sm flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#E14F69] hover:bg-[#d4156b] transition-colors disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              {publishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
      </header>

      {status && (
        <div className="mx-auto max-w-7xl px-4 mt-4">
          <div className={`rounded-lg px-4 py-2.5 text-sm ${status.type === "success" ? "bg-green-900/50 text-green-300 border border-green-800" : "bg-red-900/50 text-red-300 border border-red-800"}`}>
            {status.message}
          </div>
        </div>
      )}

      {showPreview ? (
        <div className="border-2 border-[#E14F69]/30 rounded-xl m-4 overflow-hidden">
          <iframe key={previewKey} src={`${BASE_URL}/`} className="w-full h-[85vh]" />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">

          <SectionBlock title="Header">
            <FieldRow label="Logo Text" value={content["header.logo_text"]?.value ?? ""} onChange={(v) => updateField("header.logo_text", v)} />
            <FieldRow label="Brand CTA Button" value={content["header.brand_cta"]?.value ?? ""} onChange={(v) => updateField("header.brand_cta", v)} />
            <FieldRow label="Creator CTA Button" value={content["header.creator_cta"]?.value ?? ""} onChange={(v) => updateField("header.creator_cta", v)} />
          </SectionBlock>

          <SectionBlock title="Hero Section">
            <FieldRow label="Heading Line 1 (white)" value={content["hero.heading_line1"]?.value ?? ""} onChange={(v) => updateField("hero.heading_line1", v)} />
            <FieldRow label="Heading Highlight 1 (pink)" value={content["hero.heading_highlight1"]?.value ?? ""} onChange={(v) => updateField("hero.heading_highlight1", v)} />
            <FieldRow label="Heading Line 2 (white)" value={content["hero.heading_line2"]?.value ?? ""} onChange={(v) => updateField("hero.heading_line2", v)} />
            <FieldRow label="Heading Highlight 2 (pink)" value={content["hero.heading_highlight2"]?.value ?? ""} onChange={(v) => updateField("hero.heading_highlight2", v)} />
            <FieldRow label="Subheading" value={content["hero.subheading"]?.value ?? ""} onChange={(v) => updateField("hero.subheading", v)} multiline />
            <FieldRow label="Bold Line" value={content["hero.bold_line"]?.value ?? ""} onChange={(v) => updateField("hero.bold_line", v)} />
            <FieldRow label="Brand Button" value={content["hero.brand_btn"]?.value ?? ""} onChange={(v) => updateField("hero.brand_btn", v)} />
            <FieldRow label="Creator Button" value={content["hero.creator_btn"]?.value ?? ""} onChange={(v) => updateField("hero.creator_btn", v)} />
          </SectionBlock>

          <SectionBlock title="Hero Grid Media (5 Cards)">
            <p className="text-white/70 text-xs mb-4">Upload a photo or short video for each grid card. Changes save automatically. Leave empty to use the default Unsplash images.</p>
            <div className="grid grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4].map((i) => {
                const card = heroMediaCards[i];
                const hasSrc = !!(card?.src);
                const inputId = `hero-card-input-${i}`;
                return (
                  <div key={i} className="relative">
                    <input
                      id={inputId}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleHeroMediaUpload(i, file);
                        e.target.value = "";
                      }}
                    />
                    <label
                      htmlFor={inputId}
                      className="block w-full aspect-[3/4] rounded-xl border-2 border-dashed border-white/20 hover:border-[#E14F69]/50 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer overflow-hidden relative"
                    >
                      {hasSrc ? (
                        card?.type === "video" ? (
                          <video src={card.src} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
                        ) : (
                          <img src={card!.src} alt={`Card ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                          <div className="flex gap-2 text-white/70">
                            <Image className="w-4 h-4" />
                            <Video className="w-4 h-4" />
                          </div>
                          <span className="text-white/70 text-[10px]">Card {i + 1}</span>
                        </div>
                      )}
                    </label>
                    {hasSrc && (
                      <button
                        onClick={(e) => { e.stopPropagation(); clearHeroMedia(i); }}
                        className="absolute top-1.5 right-1.5 bg-black/80 rounded-full p-0.5 text-white/90 hover:text-red-400 z-10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <div className="text-center mt-1">
                      <span className="text-white/70 text-[10px]">{hasSrc ? (card?.type === "video" ? "Video" : "Photo") : `Slot ${i + 1}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionBlock>

          <SectionBlock title="How It Works">
            <FieldRow label="Main Heading (last word turns pink)" value={content["how_it_works.title"]?.value ?? ""} onChange={(v) => updateField("how_it_works.title", v)} />
            <FieldRow label="Subtitle" value={content["how_it_works.subtitle"]?.value ?? ""} onChange={(v) => updateField("how_it_works.subtitle", v)} />

            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-wider mt-6 mb-3">Brand Section</h4>
            <FieldRow label={'Brand Section Heading ("Collabry" turns pink)'} value={content["how_it_works.brand_section_heading"]?.value ?? ""} onChange={(v) => updateField("how_it_works.brand_section_heading", v)} />
            <p className="text-white/70 text-xs mb-3">Upload a JPG/PNG illustration per step. Illustrations auto-save — uploading a new one replaces the old one in the database immediately.</p>
            {brandSteps.map((step, i) => {
              const inputId = `brand-step-img-${i}`;
              return (
                <div key={i} className="bg-white/[0.03] rounded-xl p-3 mb-3 space-y-2 border border-white/5">
                  <div className="grid grid-cols-[1fr_2fr] gap-2">
                    <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none" placeholder="Step title" value={step.title} onChange={(e) => { const s = [...brandSteps]; s[i] = { ...s[i], title: e.target.value }; updateJsonArray("how_it_works.brand_steps", s); }} />
                    <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none" placeholder="Description" value={step.desc} onChange={(e) => { const s = [...brandSteps]; s[i] = { ...s[i], desc: e.target.value }; updateJsonArray("how_it_works.brand_steps", s); }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input id={inputId} type="file" accept="image/jpeg,image/jpg,image/png" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleStepImageUpload("brand", i, file); e.target.value = ""; }} />
                    <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer group">
                      <div className="w-16 h-12 rounded-lg border border-dashed border-white/20 group-hover:border-[#E14F69]/50 overflow-hidden bg-white/[0.03] flex items-center justify-center flex-shrink-0 transition-colors">
                        {step.image ? (
                          <img src={step.image} alt={step.title} className="w-full h-full object-cover" />
                        ) : (
                          <Image className="w-4 h-4 text-white/70" />
                        )}
                      </div>
                      <span className="text-xs text-white/70 group-hover:text-white/90 transition-colors">{step.image ? "Change illustration" : "Upload illustration"}</span>
                    </label>
                    {step.image && (
                      <button type="button" onClick={() => clearStepImage("brand", i)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    )}
                  </div>
                </div>
              );
            })}

            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-wider mt-6 mb-3">Creator Section</h4>
            <FieldRow label={'Creator Section Heading ("Collabry" turns pink)'} value={content["how_it_works.creator_section_heading"]?.value ?? ""} onChange={(v) => updateField("how_it_works.creator_section_heading", v)} />
            <p className="text-white/70 text-xs mb-3">Upload a JPG/PNG illustration per step. Illustrations auto-save — uploading a new one replaces the old one in the database immediately.</p>
            {creatorSteps.map((step, i) => {
              const inputId = `creator-step-img-${i}`;
              return (
                <div key={i} className="bg-white/[0.03] rounded-xl p-3 mb-3 space-y-2 border border-white/5">
                  <div className="grid grid-cols-[1fr_2fr] gap-2">
                    <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none" placeholder="Step title" value={step.title} onChange={(e) => { const s = [...creatorSteps]; s[i] = { ...s[i], title: e.target.value }; updateJsonArray("how_it_works.creator_steps", s); }} />
                    <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/70 focus:border-[#E14F69]/50 focus:outline-none" placeholder="Description" value={step.desc} onChange={(e) => { const s = [...creatorSteps]; s[i] = { ...s[i], desc: e.target.value }; updateJsonArray("how_it_works.creator_steps", s); }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input id={inputId} type="file" accept="image/jpeg,image/jpg,image/png" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleStepImageUpload("creator", i, file); e.target.value = ""; }} />
                    <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer group">
                      <div className="w-16 h-12 rounded-lg border border-dashed border-white/20 group-hover:border-[#E14F69]/50 overflow-hidden bg-white/[0.03] flex items-center justify-center flex-shrink-0 transition-colors">
                        {step.image ? (
                          <img src={step.image} alt={step.title} className="w-full h-full object-cover" />
                        ) : (
                          <Image className="w-4 h-4 text-white/70" />
                        )}
                      </div>
                      <span className="text-xs text-white/70 group-hover:text-white/90 transition-colors">{step.image ? "Change illustration" : "Upload illustration"}</span>
                    </label>
                    {step.image && (
                      <button type="button" onClick={() => clearStepImage("creator", i)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    )}
                  </div>
                </div>
              );
            })}
          </SectionBlock>

          <SectionBlock title="4 Ways to Collaborate">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <FieldRow label="Section Heading (white)" value={content["collab_modes.heading_line1"]?.value ?? "4 Ways to"} onChange={(v) => updateField("collab_modes.heading_line1", v)} />
              <FieldRow label="Section Highlight (pink)" value={content["collab_modes.heading_highlight1"]?.value ?? "Collaborate"} onChange={(v) => updateField("collab_modes.heading_highlight1", v)} />
            </div>
            <FieldRow label="Subheading" value={content["collab_modes.subheading"]?.value ?? "One Platform. Four Powerful Ways to Connect."} onChange={(v) => updateField("collab_modes.subheading", v)} />
            <div className="my-4 border-t border-white/10" />
            {collabModes.map((mode, i) => (
              <div key={i} className="bg-white/[0.03] rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-[60px_1fr] gap-3">
                  <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#E14F69] font-bold text-center focus:border-[#E14F69]/50 focus:outline-none" value={mode.num} onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], num: e.target.value }; updateJsonArray("collab_modes.modes", m); }} />
                  <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-semibold focus:border-[#E14F69]/50 focus:outline-none" value={mode.title} onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], title: e.target.value }; updateJsonArray("collab_modes.modes", m); }} />
                </div>
                <textarea className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#9CA3AF] resize-none focus:border-[#E14F69]/50 focus:outline-none" rows={2} value={mode.desc} onChange={(e) => { const m = [...collabModes]; m[i] = { ...m[i], desc: e.target.value }; updateJsonArray("collab_modes.modes", m); }} />
                <div className="flex gap-2 flex-wrap">
                  {mode.steps.map((step, si) => (
                    <input key={si} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#9CA3AF] w-36 focus:border-[#E14F69]/50 focus:outline-none" value={step} onChange={(e) => { const m = [...collabModes]; const steps = [...m[i].steps]; steps[si] = e.target.value; m[i] = { ...m[i], steps }; updateJsonArray("collab_modes.modes", m); }} />
                  ))}
                </div>
              </div>
            ))}
          </SectionBlock>

          <SectionBlock title="Comparison Table">
            <div className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 mb-2 text-xs text-white/70 font-semibold uppercase tracking-wider">
              <span>Feature</span><span>Old Way</span><span>Collabry Way</span><span />
            </div>
            {comparisonRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 mb-2">
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#E14F69]/50 focus:outline-none" value={row.feature} onChange={(e) => { const r = [...comparisonRows]; r[i] = { ...r[i], feature: e.target.value }; updateJsonArray("comparison.rows", r); }} />
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#9CA3AF] focus:border-[#E14F69]/50 focus:outline-none" value={row.old} onChange={(e) => { const r = [...comparisonRows]; r[i] = { ...r[i], old: e.target.value }; updateJsonArray("comparison.rows", r); }} />
                <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#E14F69]/50 focus:outline-none" value={row.collabry} onChange={(e) => { const r = [...comparisonRows]; r[i] = { ...r[i], collabry: e.target.value }; updateJsonArray("comparison.rows", r); }} />
                <button onClick={() => { updateJsonArray("comparison.rows", comparisonRows.filter((_, j) => j !== i)); }} className="text-red-400 hover:text-red-300 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={() => { updateJsonArray("comparison.rows", [...comparisonRows, { feature: "", old: "", collabry: "" }]); }} className="text-[#E14F69] text-sm flex items-center gap-1.5 mt-2 hover:text-[#d4156b]">
              <Plus className="w-4 h-4" /> Add Row
            </button>
          </SectionBlock>

          <SectionBlock title="Explore Buttons (above How It Works)">
            <p className="text-white/70 text-xs mb-4">These two full-width buttons appear on the main landing page above the "How It Works" section, linking to /brand and /creator.</p>
            <FieldRow label="Brand Explore Button Text" value={content["landing.explore_brand_btn"]?.value ?? ""} onChange={(v) => updateField("landing.explore_brand_btn", v)} />
            <FieldRow label="Creator Explore Button Text" value={content["landing.explore_creator_btn"]?.value ?? ""} onChange={(v) => updateField("landing.explore_creator_btn", v)} />
          </SectionBlock>

          <SectionBlock title="Footer">
            <FieldRow label="Tagline" value={content["footer.tagline"]?.value ?? ""} onChange={(v) => updateField("footer.tagline", v)} />
            <FieldRow label="Copyright" value={content["footer.copyright"]?.value ?? ""} onChange={(v) => updateField("footer.copyright", v)} />
            <FieldRow label="Instagram URL" value={content["footer.instagram_url"]?.value ?? ""} onChange={(v) => updateField("footer.instagram_url", v)} />
            <FieldRow label="LinkedIn URL" value={content["footer.linkedin_url"]?.value ?? ""} onChange={(v) => updateField("footer.linkedin_url", v)} />
          </SectionBlock>

          <SectionBlock title="Colors">
            <div className="grid grid-cols-3 gap-4">
              <ColorField label="Primary / Brand" value={content["colors.primary"]?.value ?? "#E14F69"} onChange={(v) => updateField("colors.primary", v)} />
              <ColorField label="Background" value={content["colors.background"]?.value ?? "#0A0A0F"} onChange={(v) => updateField("colors.background", v)} />
              <ColorField label="Secondary Text" value={content["colors.secondary_text"]?.value ?? "#9CA3AF"} onChange={(v) => updateField("colors.secondary_text", v)} />
            </div>
          </SectionBlock>
        </div>
      )}
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 p-6">
      <h3 className="text-white font-semibold text-lg mb-5 pb-3 border-b border-white/10">{title}</h3>
      {children}
    </div>
  );
}

function FieldRow({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div className="mb-4">
      <label className="block text-white/70 text-xs font-medium mb-1.5">{label}</label>
      {multiline ? (
        <textarea className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-[#E14F69]/50 focus:outline-none transition-colors" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#E14F69]/50 focus:outline-none transition-colors" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-white/70 text-xs font-medium mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent" />
        <input className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-[#E14F69]/50 focus:outline-none transition-colors" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
