import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle, Info, X } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";

interface Slab { id: string; label: string; minFollowers: number; maxFollowers: number | null; }
interface Category { id: string; name: string; }

type ContentType = "REEL";
type Gender = "Female" | "Male" | "Mixed";
type Age = "14-24" | "25-35" | "35+" | "All";
interface FormState {
  name: string;
  type: ContentType;
  description: string;
  brief: string;
  script: string;
  keyMessage: string;
  dosAndDonts: string;
  contentUsageRights: string;
  productRequired: boolean;
  productName: string;
  productDescription: string;
  productDeliveryDays: string;
  productPhotos: string[];
  pricePerCreator: string;
  slotCount: string;
  timelineDays: string;
  expiryDays: string;
  targetGender: Gender;
  targetAge: Age;
  targetLocation: string;
  selectedCategories: Array<{ categoryId: string; name: string }>;
  selectedSlabs: string[];
}

const STEPS = ["Basics", "Audience", "Pricing", "Campaign Brief", "Review & Submit"];
const INPUT_BG = "#1B1B1F";
const BTN_BG = "#1B1B1F";

const CAMPAIGN_DRAFT_KEY = "collabry_campaign_draft";
const DRAFT_TTL = 2 * 24 * 60 * 60 * 1000;

const DEFAULT_FORM: FormState = {
  name: "", type: "REEL", description: "", brief: "", script: "", keyMessage: "", dosAndDonts: "", contentUsageRights: "",
  productRequired: false, productName: "", productDescription: "", productDeliveryDays: "", productPhotos: [],
  pricePerCreator: "", slotCount: "1", timelineDays: "14", expiryDays: "30",
  targetGender: "Mixed", targetAge: "14-24", targetLocation: "Pan India",
  selectedCategories: [], selectedSlabs: [],
};

function loadCampaignDraft(): { form: FormState; step: number } | null {
  try {
    const raw = localStorage.getItem(CAMPAIGN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > DRAFT_TTL) { localStorage.removeItem(CAMPAIGN_DRAFT_KEY); return null; }
    return { form: { ...DEFAULT_FORM, ...parsed.form }, step: parsed.step ?? 0 };
  } catch { return null; }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-white/90 text-xs mb-2" style={{ fontFamily: POPPINS }}>
      {children}
    </label>
  );
}

function FormInput({ label, value, onChange, onBlur, placeholder, type = "text", min, max, hint, error, dataField }: any) {
  return (
    <div className="mb-5" data-field={dataField}>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder} min={min} max={max}
        className="w-full px-4 py-2.5 rounded-xl text-white text-xs outline-none placeholder:text-white/70"
        style={{ background: INPUT_BG, border: "1px solid rgba(255,255,255,0.07)", fontFamily: POPPINS }}
      />
      {hint && !error && <p className="text-white/70 text-xs mt-1.5" style={{ fontFamily: POPPINS }}>{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1.5" style={{ fontFamily: POPPINS }}>{error}</p>}
    </div>
  );
}

function FormTextarea({ label, value, onChange, onBlur, placeholder, rows = 3, hint, error, maxLength, showCount, dataField }: any) {
  return (
    <div className="mb-5" data-field={dataField}>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value} onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder} rows={rows} maxLength={maxLength}
        className="w-full px-4 py-2.5 rounded-xl text-white text-xs outline-none resize-none placeholder:text-white/70"
        style={{ background: INPUT_BG, border: "1px solid rgba(255,255,255,0.07)", fontFamily: POPPINS }}
      />
      <div className="flex justify-between mt-1">
        {hint && !error && <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>{hint}</p>}
        {error && <p className="text-red-400 text-xs" style={{ fontFamily: POPPINS }}>{error}</p>}
        {(showCount || maxLength) && (
          <p className="text-white/70 text-xs ml-auto" style={{ fontFamily: POPPINS }}>
            {value.length}{maxLength ? `/${maxLength}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function PillBtn({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="py-2 px-3 rounded-full text-xs font-semibold transition-all"
      style={{
        background: selected ? PINK : BTN_BG,
        color: selected ? "#fff" : "rgba(255,255,255,0.8)",
        border: selected ? "none" : "1px solid rgba(255,255,255,0.08)",
        fontFamily: POPPINS,
      }}>
      {label}
    </button>
  );
}

function isValidUrl(str: string): boolean {
  try {
    const withProtocol = /^https?:\/\//i.test(str) ? str : "https://" + str;
    const u = new URL(withProtocol);
    return u.hostname.includes(".");
  } catch { return false; }
}

export default function BrandCreateCampaign() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(() => loadCampaignDraft()?.step ?? 0);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (k: string) => setTouched(prev => { const n = new Set(prev); n.add(k); return n; });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [postingCost, setPostingCost] = useState<number | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [gstRate, setGstRate] = useState<number>(18);
  const [minPrice, setMinPrice] = useState(100);
  const [maxCampaignDays, setMaxCampaignDays] = useState(30);
  const [productPhotoInput, setProductPhotoInput] = useState("");
  const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToFirstError = (errs: Record<string, string>) => {
    const firstKey = Object.keys(errs)[0];
    if (!firstKey || !formRef.current) return;
    setTimeout(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const [form, setForm] = useState<FormState>(() => {
    const draft = loadCampaignDraft()?.form ?? DEFAULT_FORM;
    if ((draft.targetAge as string) === "Mixed") (draft as any).targetAge = "All";
    return draft;
  });

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading]);

  useEffect(() => {
    try { localStorage.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify({ form, step, savedAt: Date.now() })); } catch {}
  }, [form, step]);

  useEffect(() => {
    fetch(`${BASE_URL}/api/slabs/all`).then(r => r.json()).then(setSlabs).catch(() => {});
    fetch(`${BASE_URL}/api/categories`).then(r => r.json()).then(setCategories).catch(() => {});
    fetch(`${BASE_URL}/api/platform-config/deal`).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.gst_rate) setGstRate(parseFloat(d.gst_rate) || 18);
    }).catch(() => {});
    fetch(`${BASE_URL}/api/platform-config/campaigns`).then(r => r.ok ? r.json() : {}).then((cfg: any) => {
      if (cfg.min_campaign_price) setMinPrice(parseFloat(cfg.min_campaign_price) || 100);
      if (cfg.max_campaign_days) setMaxCampaignDays(parseInt(cfg.max_campaign_days) || 30);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 4) {
      if (postingCost === null) {
        apiFetch("/api/brand/campaigns/posting-cost").then(r => r.ok ? r.json() : null).then(d => {
          if (d) setPostingCost(d.cost);
        }).catch(() => {});
      }
      if (creditBalance === null) {
        apiFetch("/api/brand/credits/balance").then(r => r.ok ? r.json() : null).then(d => {
          if (d != null) setCreditBalance(typeof d.total === "number" ? d.total : d.balance ?? 0);
        }).catch(() => {});
      }
    }
  }, [step, postingCost, creditBalance, apiFetch]);

  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));

  const validate = (skipScroll = false): boolean => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.name.trim()) e["name"] = "Campaign name required";
    }
    if (step === 1) {
      if (form.selectedCategories.length === 0) e["categories"] = "Select at least one category";
      if (form.selectedSlabs.length === 0) e["slabs"] = "Select at least one follower tier";
    }
    if (step === 2) {
      const price = parseFloat(form.pricePerCreator);
      if (!form.pricePerCreator || isNaN(price) || price < minPrice) e["price"] = `Minimum price is ₹${minPrice}`;
      if (!form.slotCount || parseInt(form.slotCount) < 1) e["slots"] = "At least 1 slot required";
      if (parseInt(form.slotCount) > 50) e["slots"] = "Maximum 50 slots";
      const tl = parseInt(form.timelineDays);
      if (!form.timelineDays || isNaN(tl) || tl < 7 || tl > 15) e["timeline"] = "Content delivery timeline must be between 7 and 15 days";
      if (!form.expiryDays || parseInt(form.expiryDays) < 1) e["expiry"] = "Campaign expiry days required";
      if (parseInt(form.expiryDays) > maxCampaignDays) e["expiry"] = `Maximum ${maxCampaignDays} days`;
    }
    if (step === 3) {
      if (!form.brief.trim() || form.brief.length < 20) e["brief"] = "Brief must be at least 20 characters";
      if (form.brief.length > 500) e["brief"] = "Brief must be 500 characters or less";
      const CONTACT = /(\+?\d[\d\s\-]{8,}\d|[\w.-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.)/i;
      if (CONTACT.test(form.brief)) e["brief"] = "Brief must not contain contact info or links";
      if (form.productRequired && !form.productName.trim()) e["productName"] = "Product name required";
      if (form.productRequired && (!form.productDeliveryDays || parseInt(form.productDeliveryDays) < 1)) e["productDeliveryDays"] = "Estimated delivery days required";
      if (form.productRequired && parseInt(form.productDeliveryDays) > 14) e["productDeliveryDays"] = "Estimated delivery days cannot exceed 14";
      if (!form.script.trim() || form.script.length < 50) e["script"] = "Script must be at least 50 characters";
      if (form.script.length > 2000) e["script"] = "Script must be 2000 characters or less";
      if (form.productRequired && form.productPhotos.length === 0) e["productPhotos"] = "Add at least 1 product photo URL";
    }
    setErrors(e);
    if (!skipScroll && Object.keys(e).length > 0) scrollToFirstError(e);
    return Object.keys(e).length === 0;
  };

  const validateField = (key: string) => {
    const CONTACT = /(\+?\d[\d\s\-]{8,}\d|[\w.-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.)/i;
    let msg = "";
    switch (key) {
      case "name": if (!form.name.trim()) msg = "Campaign name required"; break;
      case "price": { const v = parseFloat(form.pricePerCreator); if (!form.pricePerCreator || isNaN(v) || v < minPrice) msg = `Minimum price is ₹${minPrice}`; break; }
      case "slots": { const v = parseInt(form.slotCount); if (!form.slotCount || v < 1) msg = "At least 1 slot required"; else if (v > 50) msg = "Maximum 50 slots"; break; }
      case "timeline": { const v = parseInt(form.timelineDays); if (!form.timelineDays || isNaN(v) || v < 7 || v > 15) msg = "Content delivery timeline must be between 7 and 15 days"; break; }
      case "expiry": { const v = parseInt(form.expiryDays); if (!form.expiryDays || v < 1) msg = "Campaign expiry days required"; else if (v > maxCampaignDays) msg = `Maximum ${maxCampaignDays} days`; break; }
      case "brief":
        if (!form.brief.trim() || form.brief.length < 20) msg = "Brief must be at least 20 characters";
        else if (form.brief.length > 500) msg = "Brief must be 500 characters or less";
        else if (CONTACT.test(form.brief)) msg = "Brief must not contain contact info or links";
        break;
      case "script":
        if (!form.script.trim() || form.script.length < 50) msg = "Script must be at least 50 characters";
        else if (form.script.length > 2000) msg = "Script must be 2000 characters or less";
        break;
      case "productName": if (form.productRequired && !form.productName.trim()) msg = "Product name required"; break;
      case "productDeliveryDays": { const v = parseInt(form.productDeliveryDays); if (form.productRequired && (!form.productDeliveryDays || v < 1)) msg = "Estimated delivery days required"; else if (form.productRequired && v > 14) msg = "Estimated delivery days cannot exceed 14"; break; }
    }
    setErrors(prev => { const n = { ...prev }; if (msg) n[key] = msg; else delete n[key]; return n; });
  };

  const STEP_FIELDS: Record<number, string[]> = {
    0: ["name"],
    1: ["categories", "slabs"],
    2: ["price", "slots", "timeline", "expiry"],
    3: ["brief", "productName", "productDeliveryDays", "script", "productPhotos"],
  };
  const next = () => {
    if (validate()) {
      setTouched(new Set());
      setErrors({});
      setStep(s => s + 1);
    } else {
      const fields = STEP_FIELDS[step] ?? [];
      setTouched(prev => { const n = new Set(prev); fields.forEach(k => n.add(k)); return n; });
    }
  };
  const back = () => { setErrors({}); setTouched(new Set()); setStep(s => s - 1); };

  const handleSubmit = async () => {
    setTouched(new Set(["name", "categories", "slabs", "price", "slots", "timeline", "expiry", "brief", "productName", "productDeliveryDays", "script", "productPhotos"]));
    if (!validate()) return;
    setSubmitting(true);
    try {
      const r = await apiFetch("/api/brand/campaigns/create", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          categories: form.selectedCategories,
          description: form.description || undefined,
          brief: form.brief.trim(),
          script: form.script.trim(),
          keyMessage: form.keyMessage || undefined,
          dosAndDonts: form.dosAndDonts || undefined,
          contentUsageRights: form.contentUsageRights || undefined,
          followerSlabs: form.selectedSlabs,
          targetGender: form.targetGender,
          targetAge: form.targetAge,
          targetLocation: form.targetLocation,
          pricePerCreator: parseFloat(form.pricePerCreator),
          slotCount: parseInt(form.slotCount),
          timelineDays: parseInt(form.timelineDays),
          deliveryWindowDays: parseInt(form.expiryDays),
          productRequired: form.productRequired,
          productName: form.productName || undefined,
          productDescription: form.productDescription || undefined,
          productDeliveryDays: form.productRequired && form.productDeliveryDays ? parseInt(form.productDeliveryDays) : undefined,
          productPhotos: form.productRequired && form.productPhotos.length > 0 ? form.productPhotos : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setErrors({ submit: data.error ?? "Failed to create campaign" }); setSubmitting(false); return; }
      try { localStorage.removeItem(CAMPAIGN_DRAFT_KEY); } catch {}
      setSubmitted(true);
    } catch { setErrors({ submit: "Something went wrong. Please try again." }); setSubmitting(false); }
  };

  const price = parseFloat(form.pricePerCreator) || 0;
  const slots = parseInt(form.slotCount) || 0;

  if (authLoading || !brandId) return null;

  if (submitted) {
    return (
      <BrandLayout>
        <div className="max-w-lg mx-auto px-4 pt-16 pb-28 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: "rgba(16,185,129,0.12)", border: "2px solid rgba(16,185,129,0.3)" }}>
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-white font-bold text-2xl mb-3" style={{ fontFamily: POPPINS }}>Campaign Submitted!</h2>
          <p className="text-white/80 text-sm leading-relaxed mb-8" style={{ fontFamily: POPPINS }}>
            Your campaign is now under review. Our team will approve it shortly — usually within 24 hours. Credits will be deducted only upon approval.
          </p>
          <button onClick={() => navigate("/home-brand/campaigns")}
            className="px-8 py-3 rounded-full text-white font-bold text-base" style={{ background: PINK, fontFamily: POPPINS }}>
            View My Campaigns
          </button>
        </div>
      </BrandLayout>
    );
  }

  const fmtFollowers = (n: number) =>
    n >= 1000000 ? `${(n / 1000000).toFixed(1)}m` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);

  return (
    <BrandLayout>
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-28" ref={formRef}>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => step === 0 ? navigate("/home-brand/campaigns") : back()}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.10)" }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <p className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>Create Campaign</p>
            <p className="text-xs font-medium" style={{ color: PINK, fontFamily: POPPINS }}>
              Step {step + 1}/{STEPS.length}: {STEPS[step]}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-7 mt-4">
          {STEPS.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full transition-all"
              style={{ background: i <= step ? PINK : "rgba(255,255,255,0.14)" }} />
          ))}
        </div>

        {/* ── STEP 0: Basics ── */}
        {step === 0 && (
          <div>
            <FormInput
              label="Campaign Name *"
              value={form.name}
              onChange={(v: string) => set("name", v)}
              onBlur={() => { touch("name"); validateField("name"); }}
              placeholder="e.g. Summer Collection Launch"
              error={touched.has("name") ? errors["name"] : undefined}
              dataField="name"
            />

            <div className="mb-5">
              <FieldLabel>Campaign Type</FieldLabel>
              <div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: PINK, color: "#fff", fontFamily: POPPINS, display: "inline-block" }}>
                Instagram Reel
              </div>
            </div>

            <FormTextarea
              label="Campaign Description"
              value={form.description}
              onChange={(v: string) => set("description", v)}
              placeholder="Additional context about your brand or campaign..."
              rows={3}
            />
          </div>
        )}

        {/* ── STEP 1: Audience ── */}
        {step === 1 && (
          <div>
            <div className="mb-5" data-field="categories">
              <FieldLabel>Categories *</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                  const selected = form.selectedCategories.some(s => s.categoryId === cat.id);
                  return (
                    <button key={cat.id}
                      onClick={() => {
                        if (selected) set("selectedCategories", form.selectedCategories.filter(s => s.categoryId !== cat.id));
                        else set("selectedCategories", [...form.selectedCategories, { categoryId: cat.id, name: cat.name }]);
                      }}
                      className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
                      style={{
                        background: selected ? PINK : BTN_BG,
                        color: selected ? "#fff" : "rgba(255,255,255,0.85)",
                        border: selected ? "none" : "1px solid rgba(255,255,255,0.10)",
                        fontFamily: POPPINS,
                      }}>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              {touched.has("categories") && errors["categories"] && <p className="text-red-400 text-xs mt-1.5" style={{ fontFamily: POPPINS }}>{errors["categories"]}</p>}
            </div>

            <div className="mb-5" data-field="slabs">
              <FieldLabel>Creator tier (Number of followers) *</FieldLabel>
              <div className="space-y-2">
                {slabs.filter((s: any) => s.isActive !== false).map(slab => {
                  const selected = form.selectedSlabs.includes(slab.id);
                  return (
                    <button key={slab.id}
                      onClick={() => {
                        if (selected) set("selectedSlabs", form.selectedSlabs.filter(id => id !== slab.id));
                        else set("selectedSlabs", [...form.selectedSlabs, slab.id]);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all"
                      style={{
                        background: selected ? `${PINK}22` : INPUT_BG,
                        border: `1px solid ${selected ? PINK : "rgba(255,255,255,0.08)"}`,
                        color: "#fff",
                        fontFamily: POPPINS,
                      }}>
                      <span>{slab.label}</span>
                      <span className="text-white/70 text-xs">
                        {fmtFollowers(slab.minFollowers)}{slab.maxFollowers ? `–${fmtFollowers(slab.maxFollowers)}` : "+"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {touched.has("slabs") && errors["slabs"] && <p className="text-red-400 text-xs mt-1.5" style={{ fontFamily: POPPINS }}>{errors["slabs"]}</p>}
            </div>

            <div className="mb-5">
              <FieldLabel>Target Creator Gender</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {(["Any", "Female", "Male"] as const).map(g => {
                  const val = g === "Any" ? "Mixed" : g as Gender;
                  return (
                    <PillBtn key={g} label={g} selected={form.targetGender === val} onClick={() => set("targetGender", val)} />
                  );
                })}
              </div>
            </div>

            <div className="mb-5">
              <FieldLabel>Target Age Group</FieldLabel>
              <div className="grid grid-cols-4 gap-2">
                {(["14-24", "25-35", "35+", "All"] as const).map(a => (
                  <PillBtn key={a} label={a} selected={form.targetAge === a} onClick={() => set("targetAge", a)} />
                ))}
              </div>
            </div>

            <div className="mb-5">
              <FieldLabel>Target Location</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {["Pan India", "Metro Cities", "Tier 2 & 3 Cities"].map(loc => (
                  <PillBtn key={loc} label={loc} selected={form.targetLocation === loc} onClick={() => set("targetLocation", loc)} />
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ── STEP 2: Pricing ── */}
        {step === 2 && (
          <div>
            <FormInput
              label="Budget Per Creator (₹) *"
              value={form.pricePerCreator}
              onChange={(v: string) => set("pricePerCreator", v)}
              onBlur={() => { touch("price"); validateField("price"); }}
              placeholder="e.g. 5000"
              type="number" min={minPrice}
              hint={`Minimum ₹${minPrice} per creator`}
              error={touched.has("price") ? errors["price"] : undefined}
              dataField="price"
            />
            <FormInput
              label="Number of Creators Needed *"
              value={form.slotCount}
              onChange={(v: string) => set("slotCount", v)}
              onBlur={() => { touch("slots"); validateField("slots"); }}
              placeholder="e.g. 5"
              type="number" min="1" max="50"
              hint="How many creators you want for this campaign (1–50)"
              error={touched.has("slots") ? errors["slots"] : undefined}
              dataField="slots"
            />
            <FormInput
              label="Content Delivery Timeline (days) *"
              value={form.timelineDays}
              onChange={(v: string) => set("timelineDays", v)}
              onBlur={() => { touch("timeline"); validateField("timeline"); }}
              placeholder="e.g. 14"
              type="number" min="7" max="15"
              hint="Must be between 7 and 15 days. Countdown starts once the deal is confirmed — or after the product reaches the creator, if product delivery is required."
              error={touched.has("timeline") ? errors["timeline"] : undefined}
              dataField="timeline"
            />
            <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.45)", marginTop: -8, marginBottom: 4, fontFamily: "Poppins, sans-serif" }}>
              💡 Deals can finish sooner — use the deal chat to coordinate early delivery. We recommend at least 7 days; good things take time.
            </p>
            <FormInput
              label="Campaign Open For (days) *"
              value={form.expiryDays}
              onChange={(v: string) => set("expiryDays", v)}
              onBlur={() => { touch("expiry"); validateField("expiry"); }}
              placeholder="30"
              type="number" min="1" max={maxCampaignDays}
              hint={`How many days creators can discover and apply to your campaign once it goes live (max ${maxCampaignDays})`}
              error={touched.has("expiry") ? errors["expiry"] : undefined}
              dataField="expiry"
            />

            {price > 0 && slots > 0 && (() => {
              const base = price * slots;
              const gst = Math.round(base * gstRate / 100);
              const total = base + gst;
              return (
                <div className="rounded-xl p-4 mb-3" style={{ background: `${PINK}14`, border: `1px solid ${PINK}33` }}>
                  <p className="text-white/75 text-xs mb-2" style={{ fontFamily: POPPINS }}>Estimated Campaign Budget</p>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>Base (₹{price.toLocaleString("en-IN")} × {slots} creators)</span>
                    <span className="text-white text-sm font-semibold" style={{ fontFamily: POPPINS }}>₹{base.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>GST ({gstRate}%)</span>
                    <span className="text-white/90 text-sm" style={{ fontFamily: POPPINS }}>₹{gst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                    <span className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Total (incl. GST)</span>
                    <span className="font-bold text-xl" style={{ color: PINK, fontFamily: POPPINS }}>₹{total.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              );
            })()}

            <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-white/75 text-xs leading-relaxed" style={{ fontFamily: POPPINS }}>
                💡 <span className="text-white/80 font-medium">No payment needed right now.</span> You only pay when a creator is selected and confirms the deal — one creator at a time. Your money is never blocked upfront for the full campaign.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 3: Brief ── */}
        {step === 3 && (
          <div>
            <FormTextarea
                label="Campaign Brief *"
                value={form.brief}
                onChange={(v: string) => set("brief", v)}
                onBlur={() => { touch("brief"); validateField("brief"); }}
                placeholder="Describe what you need from creators. Be specific about tone, messaging, and key points."
                rows={4}
                hint="20-500 characters. No contact info or links."
                error={touched.has("brief") ? errors["brief"] : undefined}
                maxLength={500}
                showCount
                dataField="brief"
              />
            <FormTextarea
              label="Reel Script *"
              value={form.script}
              onChange={(v: string) => set("script", v)}
              onBlur={() => { touch("script"); validateField("script"); }}
              placeholder="Write the full script for the reel — scene-by-scene, dialogue, visuals, voiceover, etc."
              rows={6}
              hint="50–2000 characters"
              error={touched.has("script") ? errors["script"] : undefined}
              maxLength={2000}
              showCount
              dataField="script"
            />
            <p className="text-white/50 text-xs -mt-3 mb-5 leading-relaxed" style={{ fontFamily: POPPINS }}>
              Don't worry about getting every detail perfect. Once the deal starts, you'll have a dedicated deal chat with the creator to share updated scripts, references, or changes at any time.
            </p>
            <FormInput
              label="Key Message (optional)"
              value={form.keyMessage}
              onChange={(v: string) => set("keyMessage", v)}
              placeholder="The one thing creators Must communicate"
              hint="The core takeaway for the audience"
            />
            <FormTextarea
              label="Dos & Don'ts (optional)"
              value={form.dosAndDonts}
              onChange={(v: string) => set("dosAndDonts", v)}
              placeholder="List specific requirements, restrictions, or guidelines..."
              rows={3}
            />
            <div className="mb-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => set("productRequired", !form.productRequired)}
                  className="w-11 h-6 rounded-full transition-all flex-shrink-0"
                  style={{ background: form.productRequired ? PINK : "rgba(255,255,255,0.18)" }}>
                  <div className="w-5 h-5 m-0.5 rounded-full bg-white transition-all"
                    style={{ transform: form.productRequired ? "translateX(20px)" : "translateX(0)" }} />
                </div>
                <span className="text-white/90 text-sm" style={{ fontFamily: POPPINS }}>Product delivery required</span>
              </label>
            </div>

            {form.productRequired && (
              <>
                <FormInput label="Product Name *" value={form.productName} onChange={(v: string) => set("productName", v)}
                  onBlur={() => { touch("productName"); validateField("productName"); }}
                  placeholder="e.g. Summer Skincare Kit" error={touched.has("productName") ? errors["productName"] : undefined} dataField="productName" />
                <FormTextarea label="Product Description" value={form.productDescription} onChange={(v: string) => set("productDescription", v)}
                  placeholder="Describe the product being sent to creators..." rows={2} />
                <FormInput label="Estimated Product Delivery (days) *" value={form.productDeliveryDays} onChange={(v: string) => set("productDeliveryDays", v)}
                  onBlur={() => { touch("productDeliveryDays"); validateField("productDeliveryDays"); }}
                  placeholder="e.g. 5" type="number" min="1" max="14"
                  hint="Estimated days for the product to reach the creator after selection (max 14 days)"
                  error={touched.has("productDeliveryDays") ? errors["productDeliveryDays"] : undefined} dataField="productDeliveryDays" />

                <div className="mb-5" data-field="productPhotos">
                  <FieldLabel>Product Photo URL * (min 1, max 3)</FieldLabel>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={productPhotoInput}
                      onChange={e => setProductPhotoInput(e.target.value)}
                      placeholder="Paste any image URL (product page, Drive, Cloudinary…)"
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const url = productPhotoInput.trim();
                          if (!url) return;
                          if (!isValidUrl(url)) {
                            setErrors(err => ({ ...err, productPhotos: "Please enter a valid URL (must contain a dot, e.g. example.com)" }));
                            return;
                          }
                          if (form.productPhotos.length >= 3) return;
                          set("productPhotos", [...form.productPhotos, url]);
                          setProductPhotoInput("");
                          setErrors(err => { const n = { ...err }; delete n.productPhotos; return n; });
                        }
                      }}
                      className="flex-1 px-4 py-2.5 rounded-xl text-white text-xs outline-none placeholder:text-white/70"
                      style={{ background: INPUT_BG, border: "1px solid rgba(255,255,255,0.07)", fontFamily: POPPINS }}
                    />
                    <button
                      onClick={() => {
                        const url = productPhotoInput.trim();
                        if (!url || form.productPhotos.length >= 3) return;
                        if (!isValidUrl(url)) {
                          setErrors(err => ({ ...err, productPhotos: "Please enter a valid URL (must contain a dot, e.g. example.com)" }));
                          return;
                        }
                        set("productPhotos", [...form.productPhotos, url]);
                        setProductPhotoInput("");
                        setErrors(err => { const n = { ...err }; delete n.productPhotos; return n; });
                      }}
                      disabled={form.productPhotos.length >= 3}
                      className="px-4 py-2 rounded-xl text-white text-xs font-semibold flex-shrink-0"
                      style={{ background: form.productPhotos.length >= 3 ? "rgba(255,255,255,0.08)" : PINK, fontFamily: POPPINS }}>
                      Add
                    </button>
                  </div>
                  {touched.has("productPhotos") && errors["productPhotos"] && <p className="text-red-400 text-xs mb-2" style={{ fontFamily: POPPINS }}>{errors["productPhotos"]}</p>}
                  {form.productPhotos.length > 0 && (
                    <div className="space-y-1.5">
                      {form.productPhotos.map((url, i) => (
                        <div key={i} className="flex items-center gap-2.5 p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                          <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23333'/%3E%3C/svg%3E"; }} />
                          <p className="text-white/75 text-xs truncate flex-1" style={{ fontFamily: POPPINS }}>{url}</p>
                          <button onClick={() => set("productPhotos", form.productPhotos.filter((_, j) => j !== i))}>
                            <X className="w-3.5 h-3.5 text-white/70 hover:text-white/90" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-white/70 text-xs mt-1.5" style={{ fontFamily: POPPINS }}>{form.productPhotos.length}/3 images added</p>
                </div>
              </>
            )}

            <div className="mt-2 px-4 py-3.5 rounded-xl" style={{ background: `${PINK}0F`, border: `1px solid ${PINK}2A` }}>
              <p className="text-white/70 text-xs leading-relaxed" style={{ fontFamily: POPPINS }}>
                🔒 Your Brief will only be shared with creators selected for this campaign. Do not include personal contact details, external payment links, or off-platform communication requests.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 4: Review & Submit ── */}
        {step === 4 && (
          <div>
            {(() => {
              const cost = postingCost ?? 5;
              const hasEnough = creditBalance !== null && creditBalance >= cost;
              const loadingBalance = creditBalance === null;
              return (
                <div className="rounded-xl px-4 py-4 mb-5" style={{ background: `${PINK}10`, border: `1px solid ${PINK}30` }}>
                  <div className="flex items-start gap-2.5">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: PINK }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold mb-2" style={{ color: PINK, fontFamily: POPPINS }}>How Approval Works</p>
                      <p className="text-white/90 text-xs leading-relaxed mb-1" style={{ fontFamily: POPPINS }}>
                        <span className="font-semibold text-white">{cost} credit{cost === 1 ? "" : "s"}</span> will be required to post this campaign.
                      </p>
                      <p className="text-white/75 text-xs leading-relaxed mb-1" style={{ fontFamily: POPPINS }}>
                        Credits are charged only if the campaign is approved by our team. If you don't have enough credits at approval time, the campaign cannot go live.
                      </p>
                      {!loadingBalance && (
                        <p className="text-xs mt-1.5" style={{ fontFamily: POPPINS, color: hasEnough ? "#4ade80" : "#f87171" }}>
                          {hasEnough
                            ? `Your balance: ${creditBalance} credit${creditBalance === 1 ? "" : "s"} — you're all set.`
                            : `Your balance: ${creditBalance} credit${(creditBalance ?? 0) === 1 ? "" : "s"} — you need ${cost - (creditBalance ?? 0)} more.`}
                        </p>
                      )}
                      {!loadingBalance && !hasEnough && (
                        <button
                          onClick={() => navigate(`${BASE_URL}/home-brand/credits`)}
                          className="mt-2.5 px-4 py-1.5 rounded-full text-xs font-semibold text-white"
                          style={{ background: PINK, fontFamily: POPPINS }}>
                          Buy Credits
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="rounded-2xl px-5 py-4 mb-5 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {([
                ["Campaign Name", form.name],
                ["Content Type", form.type],
                ["Creators Needed", `${form.slotCount} creators`],
                ["Budget / Creator", `₹${(parseFloat(form.pricePerCreator || "0")).toLocaleString("en-IN")}`],
                ["Categories", form.selectedCategories.map(c => c.name).join(", ") || "—"],
                ["Creator Tiers", `${form.selectedSlabs.length} selected`],
                ["Target", `${form.targetGender} · ${form.targetAge} · ${form.targetLocation}`],
                ["Content Timeline", `${form.timelineDays} days`],
                ["Campaign Open For", `${form.expiryDays} days`],
                ["Reel Script", `${form.script.length} chars`],
                form.keyMessage ? ["Key Message", form.keyMessage] : null,
                form.productRequired ? ["Product", form.productName] : null,
                form.productRequired && form.productDeliveryDays ? ["Product Delivery", `${form.productDeliveryDays} days`] : null,
                form.productRequired && form.productPhotos.length > 0 ? ["Product Photo URLs", `${form.productPhotos.length} image${form.productPhotos.length > 1 ? "s" : ""}`] : null,
              ] as Array<[string, string] | null>).filter((x): x is [string, string] => Array.isArray(x)).map(([k, v]) => (
                <div key={k} className="flex justify-between items-start gap-3">
                  <span className="text-white/70 text-xs sm:text-sm" style={{ fontFamily: POPPINS }}>{k}</span>
                  <span className="text-white text-xs sm:text-sm font-medium text-right" style={{ fontFamily: POPPINS }}>{v}</span>
                </div>
              ))}

              <div className="border-t border-white/10 pt-3 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>Base Total</span>
                  <span className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>₹{(price * slots).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>GST ({gstRate}%)</span>
                  <span className="text-white/90 text-sm" style={{ fontFamily: POPPINS }}>₹{Math.round(price * slots * gstRate / 100).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between items-center border-t border-white/10 pt-2">
                  <span className="text-white font-bold text-sm" style={{ fontFamily: POPPINS }}>Total (incl. GST)</span>
                  <span className="font-bold text-lg" style={{ color: PINK, fontFamily: POPPINS }}>
                    ₹{Math.round(price * slots * (1 + gstRate / 100)).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between items-start border-t border-white/5 pt-2.5">
                  <div>
                    <span className="text-white/90 text-sm" style={{ fontFamily: POPPINS }}>Posting cost (credits)</span>
                    <p className="text-white/70 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>Deducted from your balance only after admin approval.</p>
                  </div>
                  <span className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>
                    {postingCost === null ? "…" : `${postingCost} credit${postingCost === 1 ? "" : "s"}`}
                  </span>
                </div>
              </div>
            </div>

            {errors["submit"] && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p className="text-red-400 text-sm" style={{ fontFamily: POPPINS }}>{errors["submit"]}</p>
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-3 rounded-full text-white font-bold text-sm transition-opacity"
              style={{ background: submitting ? `${PINK}80` : PINK, fontFamily: POPPINS }}>
              {submitting ? "Submitting…" : "Submit for Review"}
            </button>
          </div>
        )}

        {/* Continue button */}
        {step < 4 && (
          <button onClick={next}
            className="w-full mt-4 mb-6 py-3 rounded-full text-white font-bold text-sm flex items-center justify-center gap-2"
            style={{ background: PINK, fontFamily: POPPINS }}>
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </BrandLayout>
  );
}
