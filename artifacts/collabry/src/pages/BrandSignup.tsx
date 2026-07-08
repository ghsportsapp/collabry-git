import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, Upload, X, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { pixelTrack } from "@/lib/pixel";
import { trackEvent, identifyUser } from "@/lib/analytics";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const IG_HANDLE_RE = /^[a-zA-Z0-9_.]+$/;

const inputClass = "w-full bg-transparent border border-white/30 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-white/80 placeholder:text-white/70 transition-all";
const labelClass = "block text-white text-sm font-medium mb-1.5";
const CARD_STYLE = {
  background: "rgba(240,24,122,0.15)",
  border: "1px solid rgba(255,255,255,0.15)",
  boxShadow: "0px 0px 24px 8px rgba(240,24,122,0.18)",
};

type FieldStatus = "mandatory" | "optional" | "hidden";
interface UnifiedField {
  type: "default" | "custom";
  key?: string;
  id?: string;
  label: string;
  fieldType?: string;
  status: FieldStatus;
}
interface Category { id: string; name: string; subcategories: { id: string; name: string }[] }

async function compressImageToBlob(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const MAX_DIM = 1200;
  let w = img.width, h = img.height;
  if (w > MAX_DIM || h > MAX_DIM) {
    if (w > h) { h = Math.round((h / w) * MAX_DIM); w = MAX_DIM; }
    else { w = Math.round((w / h) * MAX_DIM); h = MAX_DIM; }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/jpeg", 0.85)
  );
}

async function uploadBrandLogo(file: File): Promise<string> {
  const blob = await compressImageToBlob(file);
  const formData = new FormData();
  formData.append("file", new File([blob], "logo.jpg", { type: "image/jpeg" }));
  const r = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: formData });
  if (!r.ok) throw new Error("Logo upload failed");
  const { objectPath } = (await r.json()) as { objectPath: string };
  return objectPath;
}

export default function BrandSignup() {
  const { setAuth } = useBrandAuth();
  const [, navigate] = useLocation();

  const [form, setForm] = useState({ brandName: "", contactName: "", email: "", websiteUrl: "", categoryId: "", subcategoryId: "", instagramHandle: "", password: "", confirmPassword: "" });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoName, setLogoName] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [unifiedFields, setUnifiedFields] = useState<UnifiedField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [nameStatus, setNameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [phoneStatus, setPhoneStatus] = useState<Record<string, "idle" | "checking" | "available" | "taken">>({});
  const [igStatus, setIgStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [submitting, setSubmitting] = useState(false);
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const igTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const EMAIL_RE = /^[^\s@,]+@[^\s@,.]+\.[a-zA-Z]{2,}$/;

  const scrollToFirstError = (errs: Record<string, string>) => {
    const firstKey = Object.keys(errs)[0];
    if (!firstKey || !formRef.current) return;
    setTimeout(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = el.querySelector<HTMLElement>("input,textarea,select");
        focusable?.focus({ preventScroll: true });
      }
    }, 60);
  };

  const cleanPhoneInput = (s: string) => {
    const d = s.replace(/\D/g, "");
    let v = d;
    if (d.length === 12 && d.startsWith("91")) v = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) v = d.slice(1);
    return v.slice(0, 10);
  };

  const handlePhoneChange = (fieldId: string, raw: string) => {
    const v = cleanPhoneInput(raw);
    setCustomValues(prev => ({ ...prev, [fieldId]: v }));
    setPhoneStatus(prev => ({ ...prev, [fieldId]: "idle" }));
    setErrors(prev => { const e = { ...prev }; delete e[`custom_${fieldId}`]; return e; });

    if (v.length > 0 && v.length < 10) {
      setErrors(prev => ({ ...prev, [`custom_${fieldId}`]: "Please enter a valid 10-digit phone number" }));
      return;
    }
    if (v.length === 10) {
      setPhoneStatus(prev => ({ ...prev, [fieldId]: "checking" }));
      if (phoneTimers.current[fieldId]) clearTimeout(phoneTimers.current[fieldId]);
      phoneTimers.current[fieldId] = setTimeout(async () => {
        try {
          const r = await fetch(`${BASE_URL}/api/brands/check-phone?phone=${encodeURIComponent(v)}`);
          const data = await r.json();
          setPhoneStatus(prev => ({ ...prev, [fieldId]: data.available ? "available" : "taken" }));
          if (!data.available) {
            setErrors(prev => ({ ...prev, [`custom_${fieldId}`]: "This phone number is already registered" }));
          }
        } catch { setPhoneStatus(prev => ({ ...prev, [fieldId]: "idle" })); }
      }, 400);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_URL}/api/categories`).then(r => r.json()).catch(() => []),
      fetch(`${BASE_URL}/api/unified-field-order`).then(r => r.json()).catch(() => []),
    ]).then(([cats, fields]) => {
      setCategories(cats ?? []);
      setUnifiedFields(fields ?? []);
    });
  }, []);

  const subcategories = categories.find(c => c.id === form.categoryId)?.subcategories ?? [];

  const setField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  };

  const handleIgBlur = useCallback(() => {
    const handle = form.instagramHandle.trim();
    if (!handle || !IG_HANDLE_RE.test(handle)) return;
    setIgStatus("checking");
    if (igTimer.current) clearTimeout(igTimer.current);
    igTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/creators/check-handle?handle=${encodeURIComponent(handle)}`);
        const data = await r.json();
        setIgStatus(data.available ? "available" : "taken");
        if (!data.available) setErrors(prev => ({ ...prev, instagramHandle: "This Instagram username is already linked to a Collabry account" }));
      } catch { setIgStatus("idle"); }
    }, 400);
  }, [form.instagramHandle]);

  const handleNameChange = useCallback((value: string) => {
    setForm(prev => ({ ...prev, brandName: value }));
    setErrors(prev => { const e = { ...prev }; delete e.brandName; return e; });
    setNameStatus("idle");
    if (!value.trim()) return;
    setNameStatus("checking");
    if (nameTimer.current) clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/brands/check-name?name=${encodeURIComponent(value.trim())}`);
        const data = await r.json();
        setNameStatus(data.available ? "available" : "taken");
        if (!data.available) setErrors(prev => ({ ...prev, brandName: "This brand name is already taken" }));
      } catch { setNameStatus("idle"); }
    }, 400);
  }, []);

  const handleEmailBlur = useCallback(() => {
    const email = form.email.trim();
    if (!email || !/^[^\s@,]+@[^\s@,.]+\.[a-zA-Z]{2,}$/.test(email)) return;
    setEmailStatus("checking");
    if (emailTimer.current) clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/brands/check-email?email=${encodeURIComponent(email)}`);
        const data = await r.json();
        setEmailStatus(data.available ? "available" : "taken");
        if (!data.available) setErrors(prev => ({ ...prev, email: "This email is already registered" }));
      } catch { setEmailStatus("idle"); }
    }, 400);
  }, [form.email]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      setErrors(prev => ({ ...prev, logo: "Only JPG/JPEG/PNG allowed" })); return;
    }
    setLogoFile(file);
    setLogoName(file.name);
    setLogoPreview(URL.createObjectURL(file));
    if (errors.logo) setErrors(p => { const e = { ...p }; delete e.logo; return e; });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.brandName.trim()) e.brandName = "Required";
    if (nameStatus === "taken") e.brandName = "This brand name is already taken";
    if (!form.email.trim() || !/^[^\s@,]+@[^\s@,.]+\.[a-zA-Z]{2,}$/.test(form.email)) e.email = "Valid email required";
    if (emailStatus === "taken") e.email = "This email is already registered";
    if (!form.password || form.password.length < 8) e.password = "Min 8 characters";
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    if (!termsAccepted) e.terms = "Please agree to the Terms & Conditions and Privacy Policy to continue.";

    // Only validate fields that are mandatory in the unified list
    for (const f of unifiedFields) {
      if (f.status !== "mandatory") continue;
      if (f.type === "default") {
        if (f.key === "contactName" && !form.contactName.trim()) e.contactName = "Required";
        if (f.key === "categoryId" && !form.categoryId) e.categoryId = "Required";
        if (f.key === "logoUrl" && !logoFile) e.logo = "Brand logo is required";
        if (f.key === "websiteUrl") {
          const w = form.websiteUrl.trim();
          if (!w) e.websiteUrl = "Required";
          else if (!w.includes(".")) e.websiteUrl = "Please enter a valid website URL (e.g. brand.com)";
        }
        if (f.key === "instagramHandle") {
          if (!form.instagramHandle.trim()) e.instagramHandle = "Required";
          else if (!IG_HANDLE_RE.test(form.instagramHandle)) e.instagramHandle = "Only letters, numbers, underscores, and periods are allowed";
        }
      } else if (f.type === "custom" && f.id) {
        if (!customValues[f.id]?.trim()) e[`custom_${f.id}`] = "Required";
      }
    }
    // Tel custom fields (any status≠hidden): if a value was entered, it must be 10 digits and not taken
    for (const f of unifiedFields) {
      if (f.type !== "custom" || !f.id || f.fieldType !== "tel" || f.status === "hidden") continue;
      const v = (customValues[f.id] ?? "").trim();
      if (!v) continue;
      if (!/^\d{10}$/.test(v)) e[`custom_${f.id}`] = "Please enter a valid 10-digit phone number";
      else if (phoneStatus[f.id] === "taken") e[`custom_${f.id}`] = "This phone number is already registered";
    }
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); scrollToFirstError(errs); return; }
    setSubmitting(true);
    try {
      let logoUrl: string | null = null;
      if (logoFile) {
        try {
          logoUrl = await uploadBrandLogo(logoFile);
        } catch {
          setErrors({ logo: "Logo upload failed. Please try again." });
          return;
        }
      }
      const r = await fetch(`${BASE_URL}/api/auth/brand/signup`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, logoUrl, customFields: customValues }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg: string = data.error ?? "Signup failed";
        let serverErrs: Record<string, string>;
        if (/brand name.*taken|taken.*brand name/i.test(msg)) serverErrs = { brandName: msg };
        else if (/email.*already|already.*email/i.test(msg)) serverErrs = { email: msg };
        else if (/instagram.*already|already.*linked|instagram.*linked|instagram.*taken/i.test(msg)) serverErrs = { instagramHandle: msg };
        else serverErrs = { _form: msg };
        setErrors(serverErrs);
        scrollToFirstError(serverErrs);
        return;
      }
      setAuth(data.accessToken, data.brandId, data.brandName);
      pixelTrack("Lead", { content_name: "brand_signup" });
      identifyUser(data.brandId, "BRAND");
      trackEvent("signup_completed", {
        user_type: "BRAND",
        method: "email",
        free_credits: data.freeCredits ?? null,
      });
      try {
        localStorage.setItem(
          `collabry_welcome_${data.brandId}`,
          JSON.stringify({ credits: data.freeCredits ?? 5, popupSeen: false, bannerDismissed: false }),
        );
      } catch {}
      navigate("/home-brand");
    } catch { const e = { _form: "Network error. Please try again." }; setErrors(e); scrollToFirstError(e); }
    finally { setSubmitting(false); }
  };

  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }));
  const subcategoryOptions = subcategories.map(s => ({ value: s.id, label: s.name }));
  const inputTypeMap: Record<string, string> = { text: "text", number: "number", tel: "tel", email: "email", url: "url", date: "date" };

  // Render a single unified field entry
  const renderField = (f: UnifiedField, i: number) => {
    if (f.status === "hidden") return null;
    const mandatory = f.status === "mandatory";

    if (f.type === "custom" && f.id) {
      const fid = f.id;
      const isTel = f.fieldType === "tel";
      const status = isTel ? phoneStatus[fid] : undefined;
      const value = customValues[fid] ?? "";
      return (
        <div key={fid} data-field={`custom_${fid}`}>
          <label className={labelClass}>{f.label}{mandatory && <span className="text-[#E14F69]"> *</span>}</label>
          <div className="relative">
            <input
              className={inputClass + (isTel ? " pr-9" : "")}
              type={inputTypeMap[f.fieldType ?? "text"] ?? "text"}
              placeholder={isTel ? "10-digit mobile number" : `Enter ${f.label}`}
              value={value}
              inputMode={isTel ? "numeric" : undefined}
              maxLength={isTel ? 10 : undefined}
              onChange={e => {
                if (isTel) handlePhoneChange(fid, e.target.value);
                else {
                  setCustomValues(prev => ({ ...prev, [fid]: e.target.value }));
                  if (errors[`custom_${fid}`]) setErrors(prev => { const x = { ...prev }; delete x[`custom_${fid}`]; return x; });
                }
              }}
              onBlur={() => {
                if (!isTel) return;
                if (value.length > 0 && value.length !== 10) {
                  setErrors(prev => ({ ...prev, [`custom_${fid}`]: "Please enter a valid 10-digit phone number" }));
                }
              }}
            />
            {isTel && status === "available" && value.length === 10 && (
              <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
            )}
            {isTel && status === "taken" && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
            )}
          </div>
          {errors[`custom_${fid}`] && <p className="text-red-400 text-xs mt-1">{errors[`custom_${fid}`]}</p>}
        </div>
      );
    }

    // Default field by key
    switch (f.key) {
      case "contactName": return (
        <div key="contactName" data-field="contactName">
          <label className={labelClass}>Contact Person Name{mandatory && <span className="text-[#E14F69]"> *</span>}</label>
          <input className={inputClass} placeholder="Enter contact name" value={form.contactName} onChange={e => setField("contactName", e.target.value)} />
          {errors.contactName && <p className="text-red-400 text-xs mt-1">{errors.contactName}</p>}
        </div>
      );
      case "websiteUrl": return (
        <div key="websiteUrl" data-field="websiteUrl">
          <label className={labelClass}>Website URL{mandatory && <span className="text-[#E14F69]"> *</span>}{ !mandatory && <span className="text-white/70 text-xs ml-1">(optional)</span>}</label>
          <input className={inputClass} type="text" placeholder="e.g. brand.com" value={form.websiteUrl}
            onChange={e => setField("websiteUrl", e.target.value)}
            onBlur={() => {
              const v = form.websiteUrl.trim();
              if (!v) { setErrors(p => { const e = { ...p }; delete e.websiteUrl; return e; }); return; }
              if (!v.includes(".")) setErrors(p => ({ ...p, websiteUrl: "Please enter a valid website URL (e.g. brand.com)" }));
              else setErrors(p => { const e = { ...p }; delete e.websiteUrl; return e; });
            }} />
          {errors.websiteUrl && <p className="text-red-400 text-xs mt-1">{errors.websiteUrl}</p>}
        </div>
      );
      case "categoryId": return (
        <div key="categoryId" data-field="categoryId">
          <label className={labelClass}>Brand Category{mandatory && <span className="text-[#E14F69]"> *</span>}</label>
          <CustomSelect options={categoryOptions} value={form.categoryId}
            onChange={v => { setField("categoryId", v); setField("subcategoryId", ""); }}
            placeholder="Select Brand Category" />
          {errors.categoryId && <p className="text-red-400 text-xs mt-1">{errors.categoryId}</p>}
        </div>
      );
      case "subcategoryId": {
        if (subcategoryOptions.length === 0) return null;
        return (
          <div key="subcategoryId" data-field="subcategoryId">
            <label className={labelClass}>Brand Sub-category{mandatory && <span className="text-[#E14F69]"> *</span>}</label>
            <CustomSelect options={subcategoryOptions} value={form.subcategoryId}
              onChange={v => setField("subcategoryId", v)}
              placeholder="Select Sub-category" />
            {errors.subcategoryId && <p className="text-red-400 text-xs mt-1">{errors.subcategoryId}</p>}
          </div>
        );
      }
      case "instagramHandle": return (
        <div key="instagramHandle" data-field="instagramHandle">
          <label className={labelClass}>Instagram Handle{mandatory && <span className="text-[#E14F69]"> *</span>}</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 text-sm select-none">@</span>
            <input
              className={inputClass + " pl-8 pr-8"}
              placeholder="yourhandle"
              value={form.instagramHandle}
              onChange={e => {
                const val = e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_.]/g, "");
                setField("instagramHandle", val);
                setIgStatus("idle");
              }}
              onBlur={handleIgBlur}
            />
            {igStatus === "available" && IG_HANDLE_RE.test(form.instagramHandle) && (
              <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
            )}
            {igStatus === "taken" && (
              <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
            )}
            {igStatus === "checking" && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
            )}
          </div>
          {form.instagramHandle.length > 0 && !IG_HANDLE_RE.test(form.instagramHandle) && !errors.instagramHandle && (
            <p className="text-amber-400 text-xs mt-1">Only letters, numbers, underscores ( _ ) and periods ( . ) allowed</p>
          )}
          {igStatus === "available" && IG_HANDLE_RE.test(form.instagramHandle) && !errors.instagramHandle && (
            <p className="text-green-400 text-xs mt-1">✓ Username is available</p>
          )}
          {errors.instagramHandle && <p className="text-red-400 text-xs mt-1">{errors.instagramHandle}</p>}
        </div>
      );
      case "logoUrl": return (
        <div key="logoUrl" data-field="logo">
          <label className={labelClass}>Brand Logo{mandatory && <span className="text-[#E14F69]"> *</span>}</label>
          <label className="flex items-center gap-2 cursor-pointer w-full bg-transparent border border-white/30 rounded-lg px-4 py-3 text-sm transition-all"
            style={{ borderColor: errors.logo ? "rgb(239,68,68)" : "" }}>
            <Upload className="w-4 h-4 text-white/70 flex-shrink-0" />
            <span className="text-white/70 text-sm truncate flex-1">{logoName || "Select media (jpg, jpeg, png)"}</span>
            {logoFile && <X className="w-4 h-4 text-white/80 flex-shrink-0" onClick={ev => { ev.preventDefault(); setLogoFile(null); setLogoPreview(null); setLogoName(""); }} />}
            <input type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={handleLogoUpload} />
          </label>
          {logoPreview && (
            <div className="mt-2 w-16 h-16 rounded-xl overflow-hidden border border-white/20">
              <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
            </div>
          )}
          {errors.logo && <p className="text-red-400 text-xs mt-1">{errors.logo}</p>}
        </div>
      );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      <header className="px-6 py-4 flex items-center justify-between">
        <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
        <Link href="/signup-creator">
          <button className="border border-white text-white text-[11px] px-4 py-2 rounded-full hover:bg-white/10 transition-colors">Signup / Login as Creator</button>
        </Link>
      </header>

      <div className="flex justify-center px-6 py-8 pb-16">
        <div ref={formRef} className="w-full max-w-[480px] rounded-2xl p-6 lg:p-8" style={CARD_STYLE}>
          <h1 className="text-white font-bold text-xl text-center mb-5">Welcome to Collabry..!</h1>

          <div className="flex rounded-full mb-6 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="flex-1 py-2.5 rounded-full text-center text-sm font-semibold text-white" style={{ background: "#E14F69" }}>Signup</div>
            <Link href="/login-brand" className="flex-1">
              <div className="py-2.5 text-center text-sm font-medium text-white/90 cursor-pointer hover:text-white transition-colors">Login</div>
            </Link>
          </div>

          <p className="text-white/80 text-xs mb-6 leading-relaxed">India's trusted influencer marketplace. Verified creators. Secure payments. Real results.</p>

          {errors._form && (
            <div data-field="_form" className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs">{errors._form}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. Brand Name — always first */}
            <div data-field="brandName">
              <label className={labelClass}>Brand Name <span className="text-[#E14F69]">*</span></label>
              <div className="relative">
                <input className={inputClass + " pr-10"} placeholder="Enter Brand name" value={form.brandName} onChange={e => handleNameChange(e.target.value)} />
                {nameStatus === "checking" && (
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white/50" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                {nameStatus === "available" && form.brandName.trim() && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />}
                {nameStatus === "taken" && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />}
              </div>
              {nameStatus === "available" && form.brandName.trim() && !errors.brandName && (
                <p className="text-green-400 text-xs mt-1">Brand name is available</p>
              )}
              {errors.brandName && <p className="text-red-400 text-xs mt-1">{errors.brandName}</p>}
            </div>

            {/* 2. Email — always second */}
            <div data-field="email">
              <label className={labelClass}>E-mail <span className="text-[#E14F69]">*</span></label>
              <div className="relative">
                <input className={inputClass} type="email" placeholder="Enter E-mail" value={form.email}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(prev => ({ ...prev, email: v }));
                    setEmailStatus("idle");
                    if (v && !EMAIL_RE.test(v.trim())) {
                      setErrors(prev => ({ ...prev, email: "Please enter a valid email address" }));
                    } else {
                      setErrors(prev => { const x = { ...prev }; delete x.email; return x; });
                    }
                  }}
                  onBlur={handleEmailBlur} />
                {emailStatus === "available" && EMAIL_RE.test(form.email.trim()) && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />}
                {emailStatus === "taken" && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />}
              </div>
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* 3. Admin-ordered configurable fields (hidden ones skipped automatically) */}
            {unifiedFields.map((f, i) => renderField(f, i))}

            {/* 4. Password — always last */}
            <div data-field="password">
              <label className={labelClass}>Password <span className="text-[#E14F69]">*</span></label>
              <div className="relative">
                <input className={inputClass + " pr-10"} type={showPass ? "text" : "password"} placeholder="Enter your password" value={form.password} onChange={e => setField("password", e.target.value)} autoComplete="new-password" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
            </div>

            <div data-field="confirmPassword">
              <label className={labelClass}>Confirm Password <span className="text-[#E14F69]">*</span></label>
              <div className="relative">
                <input className={inputClass + " pr-10"} type={showConfirm ? "text" : "password"} placeholder="Re-enter your password" value={form.confirmPassword} onChange={e => setField("confirmPassword", e.target.value)} autoComplete="new-password" />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
            </div>

            <div data-field="terms" className="pt-1">
              <label className="flex items-start gap-3 cursor-pointer" onClick={() => { setTermsAccepted(p => !p); if (errors.terms) setErrors(p => { const e = { ...p }; delete e.terms; return e; }); }}>
                <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all"
                  style={{ background: termsAccepted ? "#E14F69" : "transparent", borderColor: errors.terms ? "rgb(239,68,68)" : termsAccepted ? "#E14F69" : "rgba(255,255,255,0.20)" }}>
                  {termsAccepted && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>}
                </div>
                <span className="text-white/80 text-xs leading-relaxed">
                  By signing up, I agree to Collabry's{" "}
                  <a href="/terms-conditions" target="_blank" rel="noopener noreferrer" className="text-[#E14F69] hover:underline" onClick={e => e.stopPropagation()}>Terms &amp; Conditions</a>
                  {" "}and{" "}
                  <a href="/privacy-policies" target="_blank" rel="noopener noreferrer" className="text-[#E14F69] hover:underline" onClick={e => e.stopPropagation()}>Privacy Policy</a>
                  .
                </span>
              </label>
              {errors.terms && <p className="text-red-400 text-xs mt-1.5 ml-7">{errors.terms}</p>}
            </div>

            <button type="submit" disabled={submitting}
              className="w-full py-3.5 rounded-full text-white font-semibold text-sm transition-all disabled:opacity-60 mt-2"
              style={{ background: "#E14F69" }}>
              {submitting ? "Creating Account..." : "Signup"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
