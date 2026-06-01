import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, X, Check, Package, Info } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";

interface Slab { id: string; label: string; minFollowers: number; maxFollowers: number | null; }
interface Category { id: string; name: string; }

const STEPS = ["Basics", "Product Details", "Brief", "Creator Requirements", "Review & Submit"];

const CONTACT_RE = /(\+91|\b91[-\s]?)?\d{10}\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(wa\.me|t\.me|bit\.ly|linktree)/i;

const BARTER_DRAFT_KEY = "collabry_barter_draft";
const DRAFT_TTL = 2 * 24 * 60 * 60 * 1000;

const DEFAULT_BARTER_FORM: FormState = {
  name: "", contentType: "REEL", slotCount: "1", durationDays: "30",
  productName: "", productDescription: "", productValueInr: "", productPhotos: [],
  campaignDescription: "", script: "", keyMessage: "", dosAndDonts: "",
  selectedCategories: [], selectedSlabs: [],
  targetGender: "All", targetAge: "14-24", targetLocation: "Pan India",
  timelineDays: "7", deliveryWindowDays: "7",
};

function loadBarterDraft(): { form: FormState; step: number } | null {
  try {
    const raw = localStorage.getItem(BARTER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > DRAFT_TTL) { localStorage.removeItem(BARTER_DRAFT_KEY); return null; }
    return { form: { ...DEFAULT_BARTER_FORM, ...parsed.form }, step: parsed.step ?? 0 };
  } catch { return null; }
}

interface FormState {
  name: string;
  contentType: "REEL";
  slotCount: string;
  durationDays: string;
  productName: string;
  productDescription: string;
  productValueInr: string;
  productPhotos: string[];
  campaignDescription: string;
  script: string;
  keyMessage: string;
  dosAndDonts: string;
  selectedCategories: Array<{ categoryId: string; name: string }>;
  selectedSlabs: string[];
  targetGender: string;
  targetAge: string;
  targetLocation: string;
  timelineDays: string;
  deliveryWindowDays: string;
}

function Field({ label, hint, error, children, dataField }: { label: string; hint?: string; error?: string; children: React.ReactNode; dataField?: string }) {
  return (
    <div className="mb-4" data-field={dataField}>
      <label className="block text-white/90 text-xs mb-1.5" style={{ fontFamily: POPPINS }}>{label}</label>
      {children}
      {hint && !error && <p className="text-white/70 text-xs mt-1" style={{ fontFamily: POPPINS }}>{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1" style={{ fontFamily: POPPINS }}>{error}</p>}
    </div>
  );
}

function Input({ value, onChange, onBlur, placeholder, type = "text", min, max }: any) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} min={min} max={max}
      className="w-full px-3.5 py-2.5 rounded-xl text-white text-sm outline-none"
      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: POPPINS }} />
  );
}

function Textarea({ value, onChange, onBlur, placeholder, rows = 3, maxLength }: any) {
  return (
    <div className="relative">
      <textarea value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} rows={rows} maxLength={maxLength}
        className="w-full px-3.5 py-2.5 rounded-xl text-white text-sm outline-none resize-none"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: POPPINS }} />
      {maxLength && <p className="text-white/70 text-xs mt-0.5 text-right" style={{ fontFamily: POPPINS }}>{value.length}/{maxLength}</p>}
    </div>
  );
}

function Pill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="px-3 py-1.5 rounded-full text-xs font-medium"
      style={{ background: selected ? PINK : "rgba(255,255,255,0.08)", color: selected ? "#fff" : "rgba(255,255,255,0.8)", fontFamily: POPPINS }}>
      {children}
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

export default function BrandCreateBarter() {
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(() => loadBarterDraft()?.step ?? 0);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (k: string) => setTouched(prev => { const n = new Set(prev); n.add(k); return n; });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [photoInput, setPhotoInput] = useState("");
  const [minDays, setMinDays] = useState(7);
  const [maxDays, setMaxDays] = useState(60);
  const [maxSlots, setMaxSlots] = useState(20);
  const [minProductValue, setMinProductValue] = useState(0);
  const [barterCost, setBarterCost] = useState<number | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToFirstError = (errs: Record<string, string>) => {
    const firstKey = Object.keys(errs)[0];
    if (!firstKey || !formRef.current) return;
    setTimeout(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  const [form, setForm] = useState<FormState>(() => {
    const draft = loadBarterDraft()?.form ?? DEFAULT_BARTER_FORM;
    if (draft.targetGender === "Mixed") draft.targetGender = "All";
    if (draft.targetAge === "Mixed") draft.targetAge = "All";
    if (!["14-24", "25-45", "45+", "All"].includes(draft.targetAge)) draft.targetAge = "14-24";
    if (draft.targetLocation === "Tier-2 Cities" || draft.targetLocation === "Tier 2 Cities") draft.targetLocation = "Tier 2 & 3 Cities";
    if (draft.targetLocation === "Tier-3 Cities" || draft.targetLocation === "Tier 3 Cities") draft.targetLocation = "Tier 2 & 3 Cities";
    return draft;
  });

  useEffect(() => { if (!authLoading && !brandId) navigate("/login-brand"); }, [brandId, authLoading]);

  useEffect(() => {
    try { localStorage.setItem(BARTER_DRAFT_KEY, JSON.stringify({ form, step, savedAt: Date.now() })); } catch {}
  }, [form, step]);

  useEffect(() => {
    fetch(`${BASE_URL}/api/slabs/all`).then(r => r.json()).then(setSlabs).catch(() => {});
    fetch(`${BASE_URL}/api/categories`).then(r => r.json()).then(setCategories).catch(() => {});
    fetch(`${BASE_URL}/api/platform-config/campaigns`).then(r => r.ok ? r.json() : {}).then((cfg: any) => {
      if (cfg.min_barter_days) setMinDays(parseInt(cfg.min_barter_days));
      if (cfg.max_barter_days) setMaxDays(parseInt(cfg.max_barter_days));
      if (cfg.max_barter_slots) setMaxSlots(parseInt(cfg.max_barter_slots));
      if (cfg.min_barter_product_value != null) setMinProductValue(parseFloat(cfg.min_barter_product_value) || 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 4) {
      if (barterCost === null) {
        apiFetch("/api/brand/barter/posting-cost").then(r => r.ok ? r.json() : null).then(d => {
          if (d) setBarterCost(d.cost);
        }).catch(() => {});
      }
      if (creditBalance === null) {
        apiFetch("/api/brand/credits/balance").then(r => r.ok ? r.json() : null).then(d => {
          if (d != null) setCreditBalance(typeof d.total === "number" ? d.total : d.balance ?? 0);
        }).catch(() => {});
      }
    }
  }, [step, barterCost, creditBalance, apiFetch]);

  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));
  const clearErrors = () => setErrors({});

  const addPhoto = () => {
    const url = photoInput.trim();
    if (!url) return;
    if (!isValidUrl(url)) {
      setErrors(e => ({ ...e, photoInput: "Please enter a valid URL (must contain a dot, e.g. example.com)" }));
      return;
    }
    if (form.productPhotos.length >= 5) { setErrors(e => ({ ...e, photoInput: "Maximum 5 photos allowed" })); return; }
    set("productPhotos", [...form.productPhotos, url]);
    setPhotoInput("");
    setErrors(e => { const n = { ...e }; delete n.photoInput; return n; });
  };

  const validate = (skipScroll = false): boolean => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.name.trim()) e.name = "Campaign name required";
      const dur = parseInt(form.durationDays);
      if (!form.durationDays || isNaN(dur) || dur < minDays || dur > maxDays) e.durationDays = `Duration must be ${minDays}–${maxDays} days`;
      const slots = parseInt(form.slotCount);
      if (!form.slotCount || isNaN(slots) || slots < 1 || slots > maxSlots) e.slotCount = `1–${maxSlots} creators allowed`;
    }
    if (step === 1) {
      if (!form.productName.trim()) e.productName = "Product name required";
      if (!form.productDescription.trim()) e.productDescription = "Product description required";
      const pv = parseFloat(form.productValueInr);
      const effectiveMinValue = Math.max(1, minProductValue);
      if (!form.productValueInr || isNaN(pv) || pv < effectiveMinValue) e.productValueInr = effectiveMinValue > 1 ? `Minimum product value is ₹${effectiveMinValue}` : "Product value required";
      if (form.productPhotos.length === 0) e.productPhotos = "At least 1 product photo required";
    }
    if (step === 2) {
      const combined = `${form.campaignDescription} ${form.script} ${form.keyMessage} ${form.dosAndDonts}`;
      if (!form.campaignDescription.trim() || form.campaignDescription.length < 20) e.campaignDescription = "Campaign description must be at least 20 characters";
      else if (form.campaignDescription.length > 500) e.campaignDescription = "Campaign description must be 500 characters or less";
      else if (CONTACT_RE.test(form.campaignDescription)) e.campaignDescription = "Description cannot contain phone numbers, emails, or external links";
      if (!form.script.trim() || form.script.length < 50) e.script = "Script must be at least 50 characters";
      else if (form.script.length > 2000) e.script = "Script must be 2000 characters or less";
      else if (CONTACT_RE.test(combined)) e.script = "Brief cannot contain phone numbers, emails, or external links";
    }
    if (step === 3) {
      if (form.selectedCategories.length === 0) e.categories = "Select at least one category";
      if (form.selectedSlabs.length === 0) e.slabs = "Select at least one follower tier";
      const tl = parseInt(form.timelineDays);
      if (!form.timelineDays || isNaN(tl) || tl < 7 || tl > 14) e.timelineDays = "Content timeline must be 7–14 days";
      const dw = parseInt(form.deliveryWindowDays);
      if (!form.deliveryWindowDays || isNaN(dw) || dw < 1) e.deliveryWindowDays = "Delivery window required";
      else if (dw > 14) e.deliveryWindowDays = "Delivery window must be 1–14 days";
    }
    setErrors(e);
    if (!skipScroll && Object.keys(e).length > 0) scrollToFirstError(e);
    return Object.keys(e).length === 0;
  };

  const validateField = (key: string) => {
    let msg = "";
    switch (key) {
      case "name": if (!form.name.trim()) msg = "Campaign name required"; break;
      case "slotCount": { const v = parseInt(form.slotCount); if (!form.slotCount || isNaN(v) || v < 1 || v > maxSlots) msg = `1–${maxSlots} creators allowed`; break; }
      case "durationDays": { const v = parseInt(form.durationDays); if (!form.durationDays || isNaN(v) || v < minDays || v > maxDays) msg = `Duration must be ${minDays}–${maxDays} days`; break; }
      case "productName": if (!form.productName.trim()) msg = "Product name required"; break;
      case "productDescription": if (!form.productDescription.trim()) msg = "Product description required"; break;
      case "productValueInr": { const v = parseFloat(form.productValueInr); const effMin = Math.max(1, minProductValue); if (!form.productValueInr || isNaN(v) || v < effMin) msg = effMin > 1 ? `Minimum product value is ₹${effMin}` : "Product value required"; break; }
      case "campaignDescription":
        if (!form.campaignDescription.trim() || form.campaignDescription.length < 20) msg = "Campaign description must be at least 20 characters";
        else if (form.campaignDescription.length > 500) msg = "Campaign description must be 500 characters or less";
        else if (CONTACT_RE.test(form.campaignDescription)) msg = "Description cannot contain phone numbers, emails, or external links";
        break;
      case "script":
        if (!form.script.trim() || form.script.length < 50) msg = "Script must be at least 50 characters";
        else if (form.script.length > 2000) msg = "Script must be 2000 characters or less";
        break;
      case "timelineDays": { const v = parseInt(form.timelineDays); if (!form.timelineDays || isNaN(v) || v < 7 || v > 14) msg = "Content timeline must be 7–14 days"; break; }
      case "deliveryWindowDays": { const v = parseInt(form.deliveryWindowDays); if (!form.deliveryWindowDays || isNaN(v) || v < 1) msg = "Delivery window required"; else if (v > 14) msg = "Delivery window must be 1–14 days"; break; }
    }
    setErrors(prev => { const n = { ...prev }; if (msg) n[key] = msg; else delete n[key]; return n; });
  };

  const STEP_FIELDS: Record<number, string[]> = {
    0: ["name", "slotCount", "durationDays"],
    1: ["productName", "productDescription", "productValueInr", "productPhotos"],
    2: ["campaignDescription", "script"],
    3: ["categories", "slabs", "timelineDays", "deliveryWindowDays"],
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
  const back = () => { clearErrors(); setTouched(new Set()); setStep(s => s - 1); };

  const handleSubmit = async () => {
    setTouched(new Set(["name", "slotCount", "durationDays", "productName", "productDescription", "productValueInr", "productPhotos", "campaignDescription", "script", "categories", "slabs", "timelineDays", "deliveryWindowDays"]));
    const preFlightErrors: Record<string, string> = {};
    const dur = parseInt(form.durationDays);
    if (!form.durationDays || isNaN(dur) || dur < minDays || dur > maxDays)
      preFlightErrors.durationDays = `Duration must be ${minDays}–${maxDays} days`;
    const slots = parseInt(form.slotCount);
    if (!form.slotCount || isNaN(slots) || slots < 1 || slots > maxSlots)
      preFlightErrors.slotCount = `1–${maxSlots} creators allowed`;
    if (preFlightErrors.durationDays || preFlightErrors.slotCount) {
      setErrors(preFlightErrors);
      setStep(0);
      setTimeout(() => scrollToFirstError(preFlightErrors), 50);
      return;
    }
    const tl = parseInt(form.timelineDays);
    if (!form.timelineDays || isNaN(tl) || tl < 7 || tl > 14)
      preFlightErrors.timelineDays = "Content timeline must be 7–14 days";
    const dw = parseInt(form.deliveryWindowDays);
    if (!form.deliveryWindowDays || isNaN(dw) || dw < 1 || dw > 14)
      preFlightErrors.deliveryWindowDays = dw > 14 ? "Delivery window must be 1–14 days" : "Delivery window required";
    if (preFlightErrors.timelineDays || preFlightErrors.deliveryWindowDays) {
      setErrors(preFlightErrors);
      setStep(3);
      setTimeout(() => scrollToFirstError(preFlightErrors), 50);
      return;
    }
    if (!validate()) return;
    setSubmitting(true);
    try {
      const r = await apiFetch("/api/brand/barter/create", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          contentType: form.contentType,
          slotCount: parseInt(form.slotCount),
          durationDays: parseInt(form.durationDays),
          productName: form.productName.trim(),
          productDescription: form.productDescription.trim(),
          productValueInr: parseFloat(form.productValueInr),
          productPhotos: form.productPhotos,
          contentRequirements: form.campaignDescription.trim(),
          script: form.script.trim(),
          keyMessage: form.keyMessage.trim() || undefined,
          dosAndDonts: form.dosAndDonts.trim() || undefined,
          categories: form.selectedCategories,
          followerSlabs: form.selectedSlabs,
          targetGender: form.targetGender,
          targetAge: form.targetAge,
          targetLocation: form.targetLocation,
          timelineDays: parseInt(form.timelineDays),
          deliveryWindowDays: parseInt(form.deliveryWindowDays),
        }),
      });
      const data = await r.json();
      if (!r.ok) { setErrors({ submit: data.error ?? "Failed to submit" }); setSubmitting(false); return; }
      try { localStorage.removeItem(BARTER_DRAFT_KEY); } catch {}
      setSubmitted(true);
    } catch { setErrors({ submit: "Something went wrong. Please try again." }); }
    setSubmitting(false);
  };

  if (authLoading || !brandId) return null;

  const fmtInr = (v: string) => { const n = parseFloat(v); return isNaN(n) ? "—" : `₹${n.toLocaleString("en-IN")}`; };

  if (submitted) {
    return (
      <BrandLayout>
        <div className="max-w-lg lg:max-w-6xl mx-auto px-4 lg:px-6 pt-20 pb-28 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(16,185,129,0.15)", border: "2px solid #10B981" }}>
            <Check className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-white font-bold text-2xl mb-2" style={{ fontFamily: POPPINS }}>Campaign Submitted!</h2>
          <p className="text-white/75 text-sm leading-relaxed mb-2" style={{ fontFamily: POPPINS }}>
            Your barter campaign <strong style={{ color: "#fff" }}>{form.name}</strong> is under review.
          </p>
          <p className="text-white/70 text-xs leading-relaxed mb-8" style={{ fontFamily: POPPINS }}>
            Our team reviews within 24–72 hours. Credits are deducted only on approval.
          </p>
          <div className="rounded-2xl p-4 mb-6 text-left space-y-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {[
              ["Product", `${form.productName} · ${fmtInr(form.productValueInr)}`],
              ["Creators Needed", `${form.slotCount} creators`],
              ["Campaign Open For", `${form.durationDays} days`],
              ["Product Delivery Window", `${form.deliveryWindowDays} days to ship`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>{k}</span>
                <span className="text-white text-xs font-semibold" style={{ fontFamily: POPPINS }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/home-brand/campaigns")}
            className="w-full py-3.5 rounded-2xl text-white font-bold"
            style={{ background: PINK, fontFamily: POPPINS }}>
            View My Campaigns
          </button>
        </div>
      </BrandLayout>
    );
  }

  return (
    <BrandLayout>
      <div className="max-w-6xl mx-auto px-4 pt-5 pb-28" ref={formRef}>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => step === 0 ? navigate("/home-brand/campaigns") : back()}
            className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.07)" }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <p className="text-white font-bold text-lg" style={{ fontFamily: POPPINS }}>Create Barter Campaign</p>
            <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          </div>
        </div>

        <div className="flex gap-1 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full" style={{ background: i <= step ? PINK : "rgba(255,255,255,0.12)" }} />
          ))}
        </div>

        {/* STEP 0: Basics */}
        {step === 0 && (
          <div>
            <Field label="Campaign Name *" error={touched.has("name") ? errors.name : undefined} dataField="name">
              <Input value={form.name} onChange={(v: string) => set("name", v)} onBlur={() => { touch("name"); validateField("name"); }} placeholder="e.g. Share Your Skincare Routine" />
            </Field>

            <Field label="Content Type">
              <div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: PINK, color: "#fff", fontFamily: POPPINS, display: "inline-block" }}>
                📹 Instagram Reel
              </div>
            </Field>

            <Field label={`Number of Creators Needed * (max ${maxSlots})`} error={touched.has("slotCount") ? errors.slotCount : undefined} dataField="slotCount">
              <Input value={form.slotCount} onChange={(v: string) => set("slotCount", v)} onBlur={() => { touch("slotCount"); validateField("slotCount"); }} placeholder="e.g. 5" type="number" min="1" max={maxSlots} />
            </Field>

            <Field label={`Campaign Duration (days) * (${minDays}–${maxDays})`} hint="How long the campaign stays live for creators to apply" error={touched.has("durationDays") ? errors.durationDays : undefined} dataField="durationDays">
              <Input value={form.durationDays} onChange={(v: string) => set("durationDays", v)} onBlur={() => { touch("durationDays"); validateField("durationDays"); }} placeholder={`e.g. 30`} type="number" min={minDays} max={maxDays} />
            </Field>
          </div>
        )}

        {/* STEP 1: Product Details */}
        {step === 1 && (
          <div>
            <Field label="Product Name *" error={touched.has("productName") ? errors.productName : undefined} dataField="productName">
              <Input value={form.productName} onChange={(v: string) => set("productName", v)} onBlur={() => { touch("productName"); validateField("productName"); }} placeholder="e.g. Vitamin C Serum" />
            </Field>

            <Field label="Product Description *" error={touched.has("productDescription") ? errors.productDescription : undefined} dataField="productDescription">
              <Textarea value={form.productDescription} onChange={(v: string) => set("productDescription", v)} onBlur={() => { touch("productDescription"); validateField("productDescription"); }}
                placeholder="Describe the product — ingredients, usage, benefits, what makes it special..." rows={4} />
            </Field>

            <Field label={`Product Value in ₹ *${minProductValue > 1 ? ` (min ₹${minProductValue})` : ""}`} hint="Shown to creators for transparency — must be accurate" error={touched.has("productValueInr") ? errors.productValueInr : undefined} dataField="productValueInr">
              <Input value={form.productValueInr} onChange={(v: string) => set("productValueInr", v)} onBlur={() => { touch("productValueInr"); validateField("productValueInr"); }} placeholder="e.g. 1500" type="number" min={Math.max(1, minProductValue)} />
            </Field>

            <Field label="Product Photo URL * (min 1, max 5)" error={touched.has("productPhotos") ? errors.productPhotos : undefined} dataField="productPhotos">
              <div className="flex gap-2 mb-2">
                <input value={photoInput} onChange={e => setPhotoInput(e.target.value)} placeholder="Paste image URL — product page, Instagram, Cloudinary, etc."
                  className="flex-1 px-3 py-2.5 rounded-xl text-white text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: POPPINS }}
                  onKeyDown={e => e.key === "Enter" && addPhoto()} />
                <button onClick={addPhoto} disabled={form.productPhotos.length >= 5}
                  className="px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0"
                  style={{ background: form.productPhotos.length >= 5 ? "rgba(255,255,255,0.1)" : PINK, fontFamily: POPPINS }}>
                  Add
                </button>
              </div>
              {errors.photoInput && <p className="text-red-400 text-xs mb-1" style={{ fontFamily: POPPINS }}>{errors.photoInput}</p>}
              {form.productPhotos.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {form.productPhotos.map((url, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23333'/%3E%3C/svg%3E"; }} />
                      <p className="text-white/75 text-xs truncate flex-1" style={{ fontFamily: POPPINS }}>{url}</p>
                      <button onClick={() => set("productPhotos", form.productPhotos.filter((_, j) => j !== i))}>
                        <X className="w-3.5 h-3.5 text-white/70" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-white/70 text-xs mt-1" style={{ fontFamily: POPPINS }}>Supports product listing URLs, Instagram image links, Google Drive public links, Cloudinary, etc. · {form.productPhotos.length}/5 photos</p>
            </Field>
          </div>
        )}

        {/* STEP 2: Brief */}
        {step === 2 && (
          <div>
            <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(240,24,122,0.06)", border: "1px solid rgba(240,24,122,0.15)" }}>
              <p className="text-white/70 text-xs leading-relaxed" style={{ fontFamily: POPPINS }}>
                🔒 Do not include phone numbers, emails, or external links in your brief — your submission will be blocked. These instructions are shared only with selected creators.
              </p>
            </div>

            <Field label="Campaign Description * (max 500 chars)" hint="What does your brand want? Goals, tone, style, key scenes — give creators full context." error={touched.has("campaignDescription") ? errors.campaignDescription : undefined} dataField="campaignDescription">
              <Textarea value={form.campaignDescription} onChange={(v: string) => set("campaignDescription", v)} onBlur={() => { touch("campaignDescription"); validateField("campaignDescription"); }}
                placeholder="e.g. We want an authentic unboxing experience showcasing the product's packaging and key features. Tone should be warm and relatable..." rows={4} maxLength={500} />
            </Field>

            <Field label="Reel Script * (50–2000 chars)" hint="50–2000 characters" error={touched.has("script") ? errors.script : undefined} dataField="script">
              <Textarea value={form.script} onChange={(v: string) => set("script", v)} onBlur={() => { touch("script"); validateField("script"); }}
                placeholder="Write the full script for the reel — scene-by-scene, dialogue, visuals, voiceover, etc."
                rows={6} maxLength={2000} />
            </Field>
            <p className="text-white/50 text-xs -mt-3 mb-5 leading-relaxed" style={{ fontFamily: POPPINS }}>
              Don't worry about getting every detail perfect. Once the deal starts, you'll have a dedicated deal chat with the creator to share updated scripts, references, or changes at any time.
            </p>

            <Field label="Key Message (optional)">
              <Input value={form.keyMessage} onChange={(v: string) => set("keyMessage", v)}
                placeholder="The one message creators must convey..." />
            </Field>

            <Field label="Dos & Don'ts (optional)">
              <Textarea value={form.dosAndDonts} onChange={(v: string) => set("dosAndDonts", v)}
                placeholder="Things to do or avoid..." rows={3} />
            </Field>
          </div>
        )}

        {/* STEP 3: Creator Requirements */}
        {step === 3 && (
          <div>
            <Field label="Categories *" error={touched.has("categories") ? errors.categories : undefined} dataField="categories">
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                  const selected = form.selectedCategories.some(s => s.categoryId === cat.id);
                  return (
                    <Pill key={cat.id} selected={selected} onClick={() => {
                      if (selected) set("selectedCategories", form.selectedCategories.filter(s => s.categoryId !== cat.id));
                      else set("selectedCategories", [...form.selectedCategories, { categoryId: cat.id, name: cat.name }]);
                    }}>
                      {cat.name}
                    </Pill>
                  );
                })}
              </div>
            </Field>

            <Field label="Follower Tier * (multi-select)" error={touched.has("slabs") ? errors.slabs : undefined} dataField="slabs">
              <div className="space-y-2">
                {slabs.filter((s: any) => s.isActive !== false).map(slab => {
                  const selected = form.selectedSlabs.includes(slab.id);
                  const fmt = (n: number) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n);
                  return (
                    <button key={slab.id} onClick={() => {
                      if (selected) set("selectedSlabs", form.selectedSlabs.filter(id => id !== slab.id));
                      else set("selectedSlabs", [...form.selectedSlabs, slab.id]);
                    }}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm"
                      style={{ background: selected ? "rgba(240,24,122,0.12)" : "rgba(255,255,255,0.05)", border: `1px solid ${selected ? PINK : "rgba(255,255,255,0.08)"}`, color: "#fff", fontFamily: POPPINS }}>
                      <span>{slab.label}</span>
                      <span className="text-white/70 text-xs">{fmt(slab.minFollowers)}{slab.maxFollowers ? `–${fmt(slab.maxFollowers)}` : "+"}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Target Creator Gender">
              <div className="grid grid-cols-3 gap-2">
                {["Female", "Male", "All"].map(g => (
                  <Pill key={g} selected={form.targetGender === g} onClick={() => set("targetGender", g)}>{g}</Pill>
                ))}
              </div>
            </Field>

            <Field label="Target Age">
              <div className="grid grid-cols-4 gap-2 flex-wrap">
                {["14-24", "25-45", "45+", "All"].map(a => (
                  <Pill key={a} selected={form.targetAge === a} onClick={() => set("targetAge", a)}>{a}</Pill>
                ))}
              </div>
            </Field>

            <Field label="Target Location">
              <div className="grid grid-cols-2 gap-2">
                {["Pan India", "Metro Cities", "Tier 2 & 3 Cities"].map(loc => (
                  <Pill key={loc} selected={form.targetLocation === loc} onClick={() => set("targetLocation", loc)}>{loc}</Pill>
                ))}
              </div>
            </Field>

            <Field label="Content Delivery Timeline (days) *" hint="Days creator has to produce & post content (7–14 days). Timeline starts after product is received." error={touched.has("timelineDays") ? errors.timelineDays : undefined} dataField="timelineDays">
              <Input value={form.timelineDays} onChange={(v: string) => set("timelineDays", v)} onBlur={() => { touch("timelineDays"); validateField("timelineDays"); }} placeholder="e.g. 7" type="number" min="7" max="14" />
            </Field>
            <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.45)", marginTop: -8, marginBottom: 4, fontFamily: "Poppins, sans-serif" }}>
              💡 Deals can finish sooner — use the deal chat to coordinate early delivery. We recommend at least 7 days; good things take time.
            </p>

            <Field label="Product Delivery Window (days) *" hint="Days you need to ship the product after creator confirms (1–14 days)" error={touched.has("deliveryWindowDays") ? errors.deliveryWindowDays : undefined} dataField="deliveryWindowDays">
              <Input value={form.deliveryWindowDays} onChange={(v: string) => set("deliveryWindowDays", v)} onBlur={() => { touch("deliveryWindowDays"); validateField("deliveryWindowDays"); }} placeholder="e.g. 7" type="number" min="1" max="14" />
            </Field>
          </div>
        )}

        {/* STEP 4: Review & Submit */}
        {step === 4 && (
          <div>
            {/* Credits info box */}
            {(() => {
              const cost = barterCost ?? 5;
              const hasEnough = creditBalance !== null && creditBalance >= cost;
              const loadingBalance = creditBalance === null;
              return (
                <div className="rounded-xl px-4 py-4 mb-5" style={{ background: `${PINK}10`, border: `1px solid ${PINK}30` }}>
                  <div className="flex items-start gap-2.5">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: PINK }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold mb-2" style={{ color: PINK, fontFamily: POPPINS }}>How Approval Works</p>
                      <p className="text-white/90 text-xs leading-relaxed mb-1" style={{ fontFamily: POPPINS }}>
                        <span className="font-semibold text-white">{barterCost === null ? "…" : `${cost} credit${cost === 1 ? "" : "s"}`}</span> will be required to post this barter campaign.
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

            {/* Product photos preview */}
            {form.productPhotos.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {form.productPhotos.map((url, i) => (
                  <img key={i} src={url} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ))}
              </div>
            )}

            {/* Summary */}
            <div className="rounded-2xl p-4 mb-4 space-y-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-pink-400" />
                <p className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>{form.name}</p>
              </div>
              {[
                ["Creators Needed", `${form.slotCount} creators`],
                ["Campaign Open For", `${form.durationDays} days live`],
                ["Product", form.productName],
                ["Product Value", fmtInr(form.productValueInr)],
                ["Product Photos Added", `${form.productPhotos.length} photo(s)`],
                ["Product Description", `${form.campaignDescription.length} chars`],
                ["Content Brief", `${form.script.length} chars`],
                ["Categories", form.selectedCategories.map(c => c.name).join(", ") || "—"],
                ["Target Creator Tiers", `${form.selectedSlabs.length} selected`],
                ["Target Creator Gender", form.targetGender],
                ["Target Age", form.targetAge],
                ["Target Location", form.targetLocation],
                ["Content Delivery Timeline", `${form.timelineDays} days`],
                ["Product Delivery Window", `${form.deliveryWindowDays} days to ship`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-start gap-2">
                  <span className="text-white/70 text-xs flex-shrink-0" style={{ fontFamily: POPPINS }}>{k}</span>
                  <span className="text-white text-xs font-semibold text-right" style={{ fontFamily: POPPINS }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(240,24,122,0.06)", border: "1px solid rgba(240,24,122,0.18)" }}>
              <p className="text-white/90 text-xs font-semibold mb-1" style={{ fontFamily: POPPINS }}>How it works</p>
              <ul className="space-y-1 text-white/70 text-xs" style={{ fontFamily: POPPINS }}>
                <li>1. Your campaign goes to our team for review</li>
                <li>2. We approve within 24–72 hours — credits deducted on approval</li>
                <li>3. Campaign goes live — creators apply</li>
                <li>4. You select creators — they confirm within 48 hours</li>
                <li>5. Ship the product to confirmed creators</li>
              </ul>
              <p className="text-amber-400 text-xs mt-2 font-semibold" style={{ fontFamily: POPPINS }}>Credits deducted on approval only.</p>
            </div>

            {errors.submit && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(239,68,68,0.1)" }}>
                <p className="text-red-400 text-sm" style={{ fontFamily: POPPINS }}>{errors.submit}</p>
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base"
              style={{ background: submitting ? "rgba(240,24,122,0.5)" : PINK, fontFamily: POPPINS }}>
              {submitting ? "Submitting…" : "Submit for Review"}
            </button>
          </div>
        )}

        {step < 4 && (
          <button onClick={next}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base mt-6 flex items-center justify-center gap-2"
            style={{ background: PINK, fontFamily: POPPINS }}>
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </BrandLayout>
  );
}
