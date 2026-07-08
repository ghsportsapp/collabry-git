import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, Upload, X, Plus, AlertCircle, ChevronRight, ChevronLeft, Check, Info, Instagram } from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import MultiImageUpload from "@/components/MultiImageUpload";
import { pixelTrack } from "@/lib/pixel";
import { trackEvent, identifyUser } from "@/lib/analytics";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const IG_HANDLE_RE = /^[a-zA-Z0-9_.]+$/;
const inputClass = "w-full bg-transparent border border-white/25 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#E14F69] placeholder:text-white/70 transition-all";
const CARD_STYLE = { background: "rgba(240,24,122,0.10)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 0 32px 4px rgba(240,24,122,0.12)" };
const STORAGE_KEY = "collabry_creator_signup_draft";
const DRAFT_TTL = 24 * 60 * 60 * 1000;

interface OptionItem { label: string; isActive: boolean; }
interface PersonalField { key: string; label: string; visibility: "required" | "optional" | "hidden"; options?: string[]; }
interface CustomField { id: string; label: string; fieldType: string; isRequired: boolean; displayOrder: number; }

interface SignupConfig {
  creator_personal_fields?: PersonalField[];
  creator_audience_age_groups?: OptionItem[];
  creator_audience_locations?: OptionItem[];
  creator_campaign_goals?: OptionItem[];
  creator_purchase_behaviours?: OptionItem[];
  instagram_oauth_enabled?: boolean;
  [key: string]: any;
}

const INDIA_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal",
  "Andaman & Nicobar Islands","Chandigarh","Dadra & Nagar Haveli and Daman & Diu",
  "Delhi","Jammu & Kashmir","Ladakh","Lakshadweep","Puducherry",
];

interface FormState {
  instagramHandle: string;
  profilePhotoUrl: string;
  followerCount: string;
  fullName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  gender: string;
  state: string;
  bio: string;
  youtubeHandle: string;
  otherSocialHandle: string;
  categories: { categoryId: string; categoryName: string; subcategoryId?: string }[];
  audienceGenderFemale: string;
  audienceGenderMale: string;
  audienceAge: string;
  audienceLocation: string;
  contentType: string;
  selectedSlabId: string;
  selectedSlabLabel: string;
  higherSlabNote: string;
  portfolio: { videoUrl: string }[];
  termsAccepted: boolean;
  images: string[];
}

const EMPTY_FORM: FormState = {
  instagramHandle: "", profilePhotoUrl: "", followerCount: "",
  fullName: "", dateOfBirth: "", phone: "", email: "", password: "", confirmPassword: "",
  gender: "", state: "", bio: "", youtubeHandle: "", otherSocialHandle: "",
  categories: [],
  audienceGenderFemale: "50", audienceGenderMale: "50", audienceAge: "", audienceLocation: "",
  contentType: "",
  selectedSlabId: "", selectedSlabLabel: "", higherSlabNote: "",
  portfolio: [{ videoUrl: "" }, { videoUrl: "" }, { videoUrl: "" }],
  termsAccepted: true,
  images: [],
};

async function compressAndUpload(file: File): Promise<string> {
  // Compress to a reasonable size client-side, then upload to the public bucket.
  const blob = await new Promise<Blob>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1200;
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = Math.round((h / w) * MAX_DIM); w = MAX_DIM; }
          else { w = Math.round((w / h) * MAX_DIM); h = MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Could not encode image")), "image/jpeg", 0.85);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const formData = new FormData();
  formData.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
  const r = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: formData });
  if (!r.ok) throw new Error("Upload failed");
  const { objectPath } = (await r.json()) as { objectPath: string };
  return objectPath;
}

function StateDropdown({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  const filtered = INDIA_STATES.filter(s => s.toLowerCase().includes(search.toLowerCase()));
  return (
    <div data-field="state" ref={ref} className="relative">
      <label className="block text-white text-sm font-medium mb-2">Where are you from? <span className="text-[#E14F69]">*</span></label>
      {value ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-white cursor-pointer"
          style={{ background: "rgba(240,24,122,0.12)", border: "1px solid rgba(240,24,122,0.40)" }}
          onClick={() => { setOpen(o => !o); setSearch(""); }}>
          <span className="flex-1">{value}</span>
          <button type="button" className="text-white/70 hover:text-white transition-colors" onClick={e => { e.stopPropagation(); onChange(""); setOpen(false); }}>✕</button>
        </div>
      ) : (
        <div className="flex items-center px-4 py-3 rounded-xl text-sm cursor-pointer"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${error ? "#f87171" : "rgba(255,255,255,0.14)"}`, color: "rgba(255,255,255,0.70)" }}
          onClick={() => { setOpen(true); setSearch(""); }}>
          Select your state or UT…
        </div>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden shadow-2xl" style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="p-2">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search state or UT…"
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none placeholder:text-white/70"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }} />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-white/70">No match</p>
            ) : filtered.map(s => (
              <button key={s} type="button"
                className="w-full text-left px-4 py-2.5 text-sm transition-all"
                style={{ color: s === value ? "#F0187A" : "rgba(255,255,255,0.90)", background: s === value ? "rgba(240,24,122,0.12)" : "transparent" }}
                onMouseEnter={e => { if (s !== value) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = s === value ? "rgba(240,24,122,0.12)" : "transparent"; }}
                onClick={() => { onChange(s); setOpen(false); setSearch(""); }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

export default function CreatorSignup() {
  const { setAuth } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allSlabs, setAllSlabs] = useState<any[]>([]);
  const [detectedSlab, setDetectedSlab] = useState<any | null>(null);
  const [loadingSlabs, setLoadingSlabs] = useState(false);
  const [signupConfig, setSignupConfig] = useState<SignupConfig>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showHigherSlabModal, setShowHigherSlabModal] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<null | boolean>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<null | boolean>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [phoneAvailable, setPhoneAvailable] = useState<null | boolean>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [guardianAccepted, setGuardianAccepted] = useState(false);
  const [slabMessage, setSlabMessage] = useState<string>("");
  const [randomCategoryMessage, setRandomCategoryMessage] = useState<string>("");
  const handleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const [imagesUploading, setImagesUploading] = useState(false);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const scrollToFirstError = (errs: Record<string, string>) => {
    const firstKey = Object.keys(errs)[0];
    if (!firstKey || !formCardRef.current) return;
    setTimeout(() => {
      const el = formCardRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = el.querySelector<HTMLElement>("input,textarea,select");
        focusable?.focus({ preventScroll: true });
      }
    }, 60);
  };

  // Instagram OAuth state
  const [igConnected, setIgConnected] = useState(false);
  const [igUsername, setIgUsername] = useState("");
  const [igError, setIgError] = useState("");
  const [igErrorCode, setIgErrorCode] = useState("");
  const [igLoading, setIgLoading] = useState(false);

  // Handle Instagram OAuth redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("ig_session");
    const error = params.get("ig_error");

    if (error) {
      const msgs: Record<string, string> = {
        cancelled: "Instagram connection was cancelled.",
        invalid_state: "Security check failed. Please try again.",
        no_facebook_pages: "No Facebook Pages found on this account. Make sure you're logging in with the Facebook account that manages your Instagram Page.",
        no_pages: "Could not fetch your Facebook Pages. Please try again.",
        no_instagram_business: "Your Instagram professional account is not linked correctly yet.",
        already_registered: "This Instagram account is already registered on Collabry.",
        token_failed: "Authentication failed. Please try again.",
        profile_failed: "Could not fetch your Instagram profile. Please try again.",
        server_error: "Something went wrong. Please try again.",
      };
      setIgError(msgs[error] ?? "Instagram connection failed. Please try again.");
      setIgErrorCode(error);
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (sessionId) {
      setIgLoading(true);
      fetch(`${BASE_URL}/api/auth/instagram/session?id=${sessionId}`)
        .then(r => r.json())
        .then(data => {
          if (data.instagramHandle) {
            setIgConnected(true);
            setIgUsername(data.instagramHandle);
            setField("instagramHandle", data.instagramHandle);
            checkHandle(data.instagramHandle);
            if (data.followerCount) setField("followerCount", String(data.followerCount));
            if (data.profilePictureUrl) setField("profilePhotoUrl", data.profilePictureUrl);
          } else {
            setIgError("Could not load Instagram data. Please try again.");
          }
        })
        .catch(() => setIgError("Failed to load Instagram data. Please try again."))
        .finally(() => setIgLoading(false));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleIgDisconnect = () => {
    setIgConnected(false);
    setIgUsername("");
    setIgError("");
    setIgErrorCode("");
    setField("instagramHandle", "");
    setField("followerCount", "");
    setField("profilePhotoUrl", "");
    setHandleAvailable(null);
  };

  // Load draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const { data, ts } = JSON.parse(raw); if (Date.now() - ts < DRAFT_TTL) setForm({ ...EMPTY_FORM, ...data, termsAccepted: true }); else localStorage.removeItem(STORAGE_KEY); }
    } catch {}
  }, []);

  // Save draft
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: form, ts: Date.now() })); } catch {} }, 500);
    return () => clearTimeout(t);
  }, [form]);

  // Load data
  useEffect(() => {
    fetch(`${BASE_URL}/api/categories`).then(r => r.json()).then(setAllCategories).catch(() => {});
    fetch(`${BASE_URL}/api/creator-signup-config`).then(r => r.json()).then(setSignupConfig).catch(() => {});
    fetch(`${BASE_URL}/api/creator-signup-fields`).then(r => r.json()).then(setCustomFields).catch(() => {});
    setLoadingSlabs(true);
    fetch(`${BASE_URL}/api/slabs/all`).then(r => r.json()).then(d => { setAllSlabs(d.filter((s: any) => s.isActive)); }).catch(() => {}).finally(() => setLoadingSlabs(false));
  }, []);

  // Fetch slab motivational message based on follower count
  useEffect(() => {
    const f = parseInt(form.followerCount || "0");
    if (!f) { setSlabMessage(""); return; }
    fetch(`${BASE_URL}/api/creator/slab-message?followers=${f}`).then(r => r.json()).then(d => setSlabMessage(d.message ?? "")).catch(() => {});
  }, [form.followerCount]);

  // Fetch random category message once on mount
  useEffect(() => {
    fetch(`${BASE_URL}/api/creator/category-messages`).then(r => r.json()).then((arr: any[]) => {
      if (Array.isArray(arr) && arr.length > 0) {
        const pick = arr[Math.floor(Math.random() * arr.length)];
        setRandomCategoryMessage(pick.message ?? "");
      }
    }).catch(() => {});
  }, []);

  // Detect slab
  useEffect(() => {
    if (!form.followerCount || allSlabs.length === 0) return;
    const cnt = parseInt(form.followerCount);
    if (isNaN(cnt)) return;
    const found = allSlabs.find(s => s.minFollowers <= cnt && (s.maxFollowers === null || s.maxFollowers >= cnt));
    setDetectedSlab(found ?? null);
    if (found) setForm(f => ({ ...f, selectedSlabId: found.id, selectedSlabLabel: found.label }));
  }, [form.followerCount, allSlabs]);

  const checkHandle = useCallback((h: string) => {
    if (!h.trim() || !IG_HANDLE_RE.test(h)) { setHandleAvailable(null); setCheckingHandle(false); return; }
    setCheckingHandle(true); setHandleAvailable(null);
    if (handleTimer.current) clearTimeout(handleTimer.current);
    handleTimer.current = setTimeout(async () => {
      try { const r = await fetch(`${BASE_URL}/api/creators/check-handle?handle=${encodeURIComponent(h)}`); const d = await r.json(); setHandleAvailable(d.available); }
      catch { setHandleAvailable(null); }
      setCheckingHandle(false);
    }, 600);
  }, []);

  const checkEmail = useCallback((e: string) => {
    if (emailTimer.current) clearTimeout(emailTimer.current);
    if (!e.trim()) { setEmailAvailable(null); setCheckingEmail(false); return; }
    // Do NOT run API check for invalid email format
    if (!EMAIL_RE.test(e.trim())) { setEmailAvailable(null); setCheckingEmail(false); return; }
    setCheckingEmail(true); setEmailAvailable(null);
    emailTimer.current = setTimeout(async () => {
      try { const r = await fetch(`${BASE_URL}/api/creators/check-email?email=${encodeURIComponent(e)}`); const d = await r.json(); setEmailAvailable(d.available); }
      catch { setEmailAvailable(null); }
      setCheckingEmail(false);
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkPhone = useCallback((p: string) => {
    if (p.length !== 10) { setPhoneAvailable(null); return; }
    setCheckingPhone(true); setPhoneAvailable(null);
    if (phoneTimer.current) clearTimeout(phoneTimer.current);
    phoneTimer.current = setTimeout(async () => {
      try { const r = await fetch(`${BASE_URL}/api/creators/check-phone?phone=${encodeURIComponent(p)}`); const d = await r.json(); setPhoneAvailable(d.available); }
      catch { setPhoneAvailable(null); }
      setCheckingPhone(false);
    }, 600);
  }, []);

  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const url = await compressAndUpload(file);
      setField("profilePhotoUrl", url);
    } catch {
      setErrors((er) => ({ ...er, profilePhotoUrl: "Upload failed. Please try again." }));
    }
  };

  const personalFields = signupConfig.creator_personal_fields ?? [
    { key: "gender", label: "Gender", visibility: "required" as const, options: ["Male", "Female", "Other"] },
    { key: "bio", label: "Bio", visibility: "optional" as const },
  ];
  const ageGroups = (signupConfig.creator_audience_age_groups ?? []).filter((o: OptionItem) => o.isActive);
  const locations = (signupConfig.creator_audience_locations ?? []).filter((o: OptionItem) => o.isActive);
  const contentTypes = (signupConfig.creator_content_types ?? []).filter((o: OptionItem) => o.isActive);

  const isFieldVisible = (key: string) => { const f = personalFields.find(f => f.key === key); return !f || f.visibility !== "hidden"; };
  const isFieldRequired = (key: string) => { const f = personalFields.find(f => f.key === key); return f?.visibility === "required"; };
  const getFieldOptions = (key: string) => personalFields.find(f => f.key === key)?.options ?? [];

  // Step structure (Portfolio removed — added from home page; Audience+Goals merged)
  const hasCustomFields = customFields.length > 0;
  const totalSteps = hasCustomFields ? 7 : 6;
  const reviewStep = totalSteps;
  const customFieldsStep = hasCustomFields ? 6 : null;
  const stepLabels = hasCustomFields
    ? ["Instagram", "Personal", "Categories", "Audience", "Pricing", "Fields", "Review"]
    : ["Instagram", "Personal", "Categories", "Audience", "Pricing", "Review"];

  const infoContent = signupConfig[`creator_signup_info_${step}`] ?? "";

  // All active slabs sorted — user may freely pick any tier
  const eligibleSlabs = [...allSlabs].sort((a, b) => a.minFollowers - b.minFollowers);

  // Under-18 check
  const dobMs = form.dateOfBirth ? Date.now() - new Date(form.dateOfBirth).getTime() : 0;
  const ageYears = dobMs / (365.25 * 24 * 60 * 60 * 1000);
  const isUnder18 = form.dateOfBirth ? ageYears < 18 && ageYears >= 14 : false;
  const ageDisplay = form.dateOfBirth ? Math.floor(ageYears) : 0;

  // Phone helper: strip to 10 digits
  const cleanPhoneDisplay = (v: string) => v.replace(/\D/g, "").replace(/^91/, "").slice(0, 10);

  const validate = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.instagramHandle.trim()) errs.instagramHandle = "Instagram handle is required";
      else if (!IG_HANDLE_RE.test(form.instagramHandle)) errs.instagramHandle = "Only letters, numbers, underscores, and periods are allowed";
      else if (handleAvailable === false) errs.instagramHandle = "This handle is already registered";
      if (!form.profilePhotoUrl) errs.profilePhotoUrl = "Profile photo is required";
      if (!form.followerCount || parseInt(form.followerCount) < 0) errs.followerCount = "Follower count is required";
    }
    if (s === 2) {
      if (!form.fullName.trim()) errs.fullName = "Full name is required";
      if (!form.dateOfBirth) errs.dateOfBirth = "Date of birth is required";
      else { const age = (Date.now() - new Date(form.dateOfBirth).getTime()) / (365.25*24*60*60*1000); if (age < 14) errs.dateOfBirth = "You must be at least 14 years old"; else if (age > 100) errs.dateOfBirth = "Please enter a valid date of birth"; }
      const ph = cleanPhoneDisplay(form.phone);
      if (!ph) errs.phone = "Phone number is required";
      else if (ph.length !== 10) errs.phone = "Please enter a valid 10-digit phone number";
      else if (phoneAvailable === false) errs.phone = "This phone number is already registered";
      const emailVal = (form.email ?? "").trim();
      if (!emailVal) errs.email = "Email address is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) errs.email = "Please enter a valid email address";
      else if (emailAvailable === false) errs.email = "This email is already registered";
      if (!form.password || form.password.length < 8) errs.password = "Password must be at least 8 characters";
      if (form.password !== form.confirmPassword) errs.confirmPassword = "Passwords do not match";
      if (form.images.length < 4) errs.images = "All 4 photos are required";
      if (imagesUploading) errs.images = "Please wait for image upload to finish";
      if (isFieldRequired("gender") && !form.gender) errs.gender = "Gender is required";
      if (!form.state) errs.state = "Please select your State / UT";
      if (isFieldRequired("bio") && !form.bio.trim()) errs.bio = "Bio is required";
      if (isFieldRequired("youtubeHandle") && !form.youtubeHandle.trim()) errs.youtubeHandle = "YouTube handle is required";
      if (isFieldRequired("otherSocialHandle") && !form.otherSocialHandle.trim()) errs.otherSocialHandle = "Other social handle is required";
    }
    if (s === 3) {
      if (isFieldRequired("categories") && form.categories.length === 0) errs.categories = "Select at least 1 category";
    }
    if (s === 4) {
      // Audience + Goals merged
      if (!form.audienceAge) errs.audienceAge = "Select your audience's primary age group";
      if (locations.length > 0 && !form.audienceLocation) errs.audienceLocation = "Select your audience's primary location";
      if (contentTypes.length > 0 && !form.contentType) errs.contentType = "Select your primary content type";
    }
    if (s === 5) { if (!form.selectedSlabId) errs.selectedSlabId = "Select a pricing tier"; }
    // Step 7 (portfolio) — optional, no minimum required
    // Custom fields step
    if (customFieldsStep && s === customFieldsStep) {
      for (const cf of customFields) {
        if (cf.isRequired && !customFieldValues[cf.id]?.trim()) {
          errs[`cf_${cf.id}`] = `${cf.label} is required`;
        }
      }
    }
    if (s === reviewStep) {
      if (!form.termsAccepted) errs.termsAccepted = "You must accept the terms to continue";
      if (isUnder18 && !guardianAccepted) errs.guardianAccepted = "Guardian confirmation is required for creators under 18";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) scrollToFirstError(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    if (step === 5 && detectedSlab && form.selectedSlabId) {
      const selIdx = eligibleSlabs.findIndex(s => s.id === form.selectedSlabId);
      const sugIdx = eligibleSlabs.findIndex(s => s.id === detectedSlab.id);
      if (selIdx > sugIdx) { setShowHigherSlabModal(true); return; }
    }
    setStep(s => s + 1);
  };
  const prev = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    // Re-validate every step before submitting so errors appear on the correct step
    for (let s = 1; s < reviewStep; s++) {
      if (!validate(s)) {
        setStep(s);
        return;
      }
    }
    if (!validate(reviewStep)) return;
    setSubmitting(true);
    try {
      const slab = allSlabs.find(s => s.id === form.selectedSlabId);
      const cleanPhone = cleanPhoneDisplay(form.phone);
      const body = {
        instagramHandle: form.instagramHandle.trim(), profilePhotoUrl: form.profilePhotoUrl,
        followerCount: parseInt(form.followerCount), fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth, phone: cleanPhone, email: form.email.trim().toLowerCase(), password: form.password,
        gender: form.gender || null,
        state: form.state || null,
        bio: form.bio.trim() || undefined,
        youtubeHandle: form.youtubeHandle.trim() || undefined,
        otherSocialHandle: form.otherSocialHandle.trim() || undefined,
        categories: form.categories.map(c => ({ categoryId: c.categoryId, subcategoryId: c.subcategoryId })),
        audienceGenderFemale: parseInt(form.audienceGenderFemale), audienceGenderMale: parseInt(form.audienceGenderMale),
        audienceAge: form.audienceAge, audienceLocation: form.audienceLocation,
        contentType: form.contentType,
        campaignGoal: form.contentType || "Brand Collaborations",
        purchaseBehaviour: form.contentType || "Brand collaborations",
        selectedSlabId: form.selectedSlabId,
        reelPriceMin: slab?.recReelMin ?? 0, reelPriceMax: slab?.recReelMax ?? 0,
        storyPriceMin: slab?.recStoryMin ?? 0, storyPriceMax: slab?.recStoryMax ?? 0,
        postPriceMin: slab?.recPostMin ?? 0, postPriceMax: slab?.recPostMax ?? 0,
        portfolio: form.portfolio.filter(p => p.videoUrl.trim()).map(p => ({ videoUrl: p.videoUrl.trim(), selfDeclared: true })),
        images: form.images,
        customFieldValues: Object.entries(customFieldValues).map(([fieldId, value]) => ({ fieldId, value })),
      };
      const r = await fetch(`${BASE_URL}/api/auth/creator/signup`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg: string = data.error ?? "Signup failed";
        // Route server errors back to the relevant step so they never show on review
        if (/instagram|handle/i.test(msg)) {
          setErrors({ instagramHandle: msg }); setStep(1);
        } else if (/email.*already|already.*email|email.*registered|registered.*email/i.test(msg)) {
          setErrors({ email: msg }); setStep(2);
        } else if (/phone.*already|already.*phone|phone.*registered|registered.*phone/i.test(msg)) {
          setErrors({ phone: msg }); setStep(2);
        } else {
          setErrors({ _form: msg });
        }
        return;
      }
      localStorage.removeItem(STORAGE_KEY);
      setAuth(data.accessToken, data.creatorId, data.fullName);
      pixelTrack("Lead", { content_name: "creator_signup" });
      identifyUser(data.creatorId, "CREATOR");
      trackEvent("signup_completed", { user_type: "CREATOR", method: "email" });
      navigate("/home-creator");
    } finally { setSubmitting(false); }
  };

  const fmt = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;
  const fmtK = (n: number | null) => {
    if (n === null) return null;
    if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(1))}M`;
    if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}K`;
    return `${n}`;
  };

  const oauthEnabled = signupConfig.instagram_oauth_enabled !== false;

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {/* Higher slab confirmation modal */}
      {showHigherSlabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#100814", border: "1px solid rgba(240,24,122,0.25)" }}>
            <h3 className="text-white font-bold text-base mb-3">Are you sure?</h3>
            <p className="text-amber-400 text-sm leading-relaxed mb-5">
              ⚠ Most deals on our platform happen in the suggested <strong>{detectedSlab?.label}</strong> tier for your follower range. Also, your pricing is locked for 14 days after signup — you won't be able to change it during this period.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setShowHigherSlabModal(false); setStep(s => s + 1); }}
                className="w-full py-3 rounded-full text-white font-semibold text-sm transition-all"
                style={{ background: "#E14F69" }}>
                Yes, I'm sure
              </button>
              <button
                onClick={() => {
                  if (detectedSlab) setForm(f => ({ ...f, selectedSlabId: detectedSlab.id, selectedSlabLabel: detectedSlab.label }));
                  setShowHigherSlabModal(false);
                }}
                className="w-full py-3 rounded-full text-white/80 text-sm border border-white/20 hover:bg-white/5 transition-colors">
                No, select suggested price
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info modal */}
      {showInfoModal && infoContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowInfoModal(false); }}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "rgba(240,24,122,0.18)", border: "1px solid rgba(240,24,122,0.35)", backdropFilter: "blur(24px)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#E14F69" }}><Info className="w-4 h-4 text-white" /></div>
                <span className="text-white font-semibold text-sm">{stepLabels[step - 1]}</span>
              </div>
              <button onClick={() => setShowInfoModal(false)} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-white/75 text-sm leading-relaxed">{infoContent}</p>
          </div>
        </div>
      )}

      <header className="px-6 py-4 flex items-center justify-between">
        <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
        <Link href="/signup-brand"><button className="border border-white text-white text-[11px] px-4 py-2 rounded-full hover:bg-white/10 transition-colors">Signup / Login as Brand</button></Link>
      </header>

      <div className="flex justify-center px-4 py-4 pb-20">
        <div className="w-full max-w-[520px]">
          <div className="flex rounded-full mb-5 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="flex-1 py-2.5 rounded-full text-center text-sm font-semibold text-white" style={{ background: "#E14F69" }}>Signup</div>
            <Link href="/login-creator" className="flex-1">
              <div className="py-2.5 text-center text-sm font-medium text-white/90 cursor-pointer hover:text-white transition-colors">Login</div>
            </Link>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-0.5 mb-5 overflow-x-auto pb-1">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{ background: i+1 < step ? "#16a34a" : i+1 === step ? "#E14F69" : "rgba(255,255,255,0.06)", color: i+1 <= step ? "white" : "rgba(255,255,255,0.70)" }}>
                    {i+1 < step ? <Check className="w-3.5 h-3.5" /> : i+1}
                  </div>
                  <span className="text-[9px] mt-0.5 whitespace-nowrap" style={{ color: i+1 === step ? "#E14F69" : "rgba(255,255,255,0.70)" }}>{label}</span>
                </div>
                {i < stepLabels.length - 1 && <div className="w-5 h-px mx-0.5 mb-3 flex-shrink-0" style={{ background: i+1 < step ? "#16a34a" : "rgba(255,255,255,0.07)" }} />}
              </div>
            ))}
          </div>

          <div ref={formCardRef} className="rounded-2xl p-6" style={CARD_STYLE}>
            {errors._form && <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{errors._form}</div>}

            {/* ── STEP 1: Instagram ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-bold text-lg">{oauthEnabled ? "Connect Instagram" : "Instagram Profile"}</h2>
                    <p className="text-white/70 text-xs mt-0.5">{oauthEnabled ? "Link your Instagram account to get started" : "Enter your Instagram details to get started"}</p>
                  </div>
                  {infoContent && <button onClick={() => setShowInfoModal(true)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-2" style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(240,24,122,0.30)" }}><Info className="w-3.5 h-3.5 text-[#E14F69]" /></button>}
                </div>

                {/* Instagram OAuth error — only visible when OAuth is enabled */}
                {oauthEnabled && igError && (
                  <div className="p-3 rounded-xl space-y-2" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-red-300 text-xs leading-relaxed">{igError}</p>
                    </div>
                    {(igErrorCode === "no_instagram_business" || igErrorCode === "no_pages" || igErrorCode === "no_facebook_pages") && (
                      <div className="pl-6 space-y-1">
                        <p className="text-white/70 text-xs">To link your account, go to:</p>
                        <p className="text-[#E14F69] text-xs font-medium">Instagram → Settings → Account → Sharing to other apps → Facebook</p>
                        <a href={`${BASE_URL}/api/auth/meta`}
                          className="inline-block mt-1 text-xs text-white/80 underline underline-offset-2">
                          Try connecting again
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Connect / Connected button — only visible when OAuth is enabled */}
                {oauthEnabled && (igLoading ? (
                  <div className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-semibold text-base"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.70)" }}>
                    <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                    Connecting…
                  </div>
                ) : igConnected ? (
                  <div>
                    <div className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-3 font-semibold text-base"
                      style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "white" }}>
                      <Check className="w-5 h-5" /> Instagram Connected
                    </div>
                    <div className="flex items-center justify-between mt-2 px-1">
                      <p className="text-white/80 text-xs">@{igUsername}</p>
                      <button type="button" onClick={handleIgDisconnect}
                        className="text-xs text-red-400 underline underline-offset-2">
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <a href={`${BASE_URL}/api/auth/meta`}
                      className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-semibold text-base transition-all hover:opacity-90"
                      style={{ background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)", color: "white", display: "flex" }}>
                      <Instagram className="w-5 h-5" /> Connect with Instagram
                    </a>
                    <p className="text-white/70 text-xs text-center mt-2 leading-relaxed">Instagram Creator/Business accounts require Meta authorization to fetch profile and follower data securely.</p>
                  </div>
                ))}

                {/* Manual fields — divider only shown when OAuth is also visible */}
                <div className={oauthEnabled ? "border-t border-white/8 pt-4 space-y-4" : "space-y-4"}>
                  <div data-field="profilePhotoUrl">
                    <label className="block text-white text-sm font-medium mb-2">Profile Photo *</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full overflow-hidden border-2 flex items-center justify-center cursor-pointer flex-shrink-0"
                        style={{ borderColor: errors.profilePhotoUrl ? "#ef4444" : "rgba(240,24,122,0.40)", background: "rgba(240,24,122,0.08)" }}
                        onClick={() => photoRef.current?.click()}>
                        {form.profilePhotoUrl ? <img src={form.profilePhotoUrl} className="w-full h-full object-cover" alt="" /> : <Upload className="w-5 h-5 text-[#E14F69]" />}
                      </div>
                      <div>
                        <button type="button" onClick={() => photoRef.current?.click()} className="text-sm text-[#E14F69] underline">Upload photo</button>
                        <p className="text-white/70 text-xs mt-0.5">Use your Instagram profile photo</p>
                        {errors.profilePhotoUrl && <p className="text-red-400 text-xs mt-1">{errors.profilePhotoUrl}</p>}
                      </div>
                      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </div>
                  </div>
                  <div data-field="instagramHandle">
                    <label className="block text-white text-sm font-medium mb-1.5">Instagram Handle *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 text-sm">@</span>
                      <input className={inputClass + " pl-8"} placeholder="yourhandle" value={form.instagramHandle}
                        onChange={e => {
                          const val = e.target.value.replace(/@/g, "").replace(/[^a-zA-Z0-9_.]/g, "");
                          setField("instagramHandle", val); checkHandle(val);
                        }} />
                      {checkingHandle && IG_HANDLE_RE.test(form.instagramHandle) && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 text-xs">checking...</span>}
                      {!checkingHandle && handleAvailable === true && form.instagramHandle.length > 0 && IG_HANDLE_RE.test(form.instagramHandle) && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-400 text-xs">✓ available</span>}
                      {!checkingHandle && handleAvailable === false && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-red-400 text-xs">✗ taken</span>}
                    </div>
                    {form.instagramHandle.length > 0 && !IG_HANDLE_RE.test(form.instagramHandle) && !errors.instagramHandle && (
                      <p className="text-red-400 text-xs mt-1">Only letters, numbers, underscores, and periods are allowed</p>
                    )}
                    {errors.instagramHandle && <p className="text-red-400 text-xs mt-1">{errors.instagramHandle}</p>}
                  </div>
                  <div data-field="followerCount">
                    <label className="block text-white text-sm font-medium mb-1.5">Follower Count *</label>
                    <input className={inputClass} type="number" min="0" placeholder="e.g. 15000" value={form.followerCount} onChange={e => setField("followerCount", e.target.value)} />
                    {errors.followerCount && <p className="text-red-400 text-xs mt-1">{errors.followerCount}</p>}
                    <p className="text-white/70 text-xs mt-1">This will be verified by our team during review</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: Personal Details ── */}
            {step === 2 && (
              <div className="space-y-4">
                {slabMessage && (
                  <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#F0187A", color: "#fff", boxShadow: "0 0 6px 1px rgba(255,255,255,0.70)" }}>
                    <p className="text-sm leading-relaxed font-medium">{slabMessage}</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div><h2 className="text-white font-bold text-lg">Personal Details</h2><p className="text-white/70 text-xs">Private & secure — never shared with brands</p></div>
                  {infoContent && <button onClick={() => setShowInfoModal(true)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-2" style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(240,24,122,0.30)" }}><Info className="w-3.5 h-3.5 text-[#E14F69]" /></button>}
                </div>
                <div data-field="fullName">
                  <label className="block text-white text-sm font-medium mb-1.5">Full Name *</label>
                  <input className={inputClass} placeholder="As per government ID" value={form.fullName} onChange={e => setField("fullName", e.target.value)} />
                  {errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName}</p>}
                </div>
                <div data-field="dateOfBirth">
                  <label className="block text-white text-sm font-medium mb-1.5">Date of Birth *</label>
                  <input className={inputClass} type="date"
                    max={new Date().toISOString().split("T")[0]}
                    value={form.dateOfBirth}
                    onChange={e => {
                      const val = e.target.value;
                      setField("dateOfBirth", val);
                      if (val) {
                        const age = (Date.now() - new Date(val).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
                        if (age < 14) setErrors(er => ({ ...er, dateOfBirth: "You must be at least 14 years old" }));
                        else if (age > 100) setErrors(er => ({ ...er, dateOfBirth: "Please enter a valid date of birth" }));
                        else setErrors(er => { const n = { ...er }; delete n.dateOfBirth; return n; });
                      } else {
                        setErrors(er => { const n = { ...er }; delete n.dateOfBirth; return n; });
                      }
                    }}
                  />
                  {errors.dateOfBirth ? <p className="text-red-400 text-xs mt-1">{errors.dateOfBirth}</p> : <p className="text-white/70 text-xs mt-1">Must be 14+ to join Collabry</p>}
                </div>
                <div data-field="phone">
                  <label className="block text-white text-sm font-medium mb-1.5">Phone Number *</label>
                  <div className="relative">
                    <input className={inputClass} type="tel" placeholder="10-digit mobile number" value={form.phone}
                      onChange={e => { const v = cleanPhoneDisplay(e.target.value); setField("phone", v); checkPhone(v); }}
                      onBlur={() => { const v = cleanPhoneDisplay(form.phone); if (v.length > 0 && v.length !== 10) setErrors(er => ({ ...er, phone: "Please enter a valid 10-digit phone number" })); }} />
                    {checkingPhone && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/70">Checking…</span>}
                    {!checkingPhone && phoneAvailable === true && form.phone.length === 10 && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-400">✓ Available</span>
                    )}
                  </div>
                  {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
                  {!errors.phone && phoneAvailable === false && <p className="text-red-400 text-xs mt-1">This phone number is already registered</p>}
                  <p className="text-white/70 text-xs mt-1">Enter 10-digit number without country code</p>
                </div>
                <div data-field="email">
                  <label className="block text-white text-sm font-medium mb-1.5">Email Address *</label>
                  <div className="relative">
                    <input className={inputClass + " pr-24"} type="email" placeholder="you@example.com" value={form.email}
                      onChange={e => {
                        const val = e.target.value;
                        setField("email", val);
                        if (!val.trim()) {
                          setEmailAvailable(null);
                          return;
                        }
                        if (!EMAIL_RE.test(val.trim())) {
                          setEmailAvailable(null);
                          setErrors(er => ({ ...er, email: "Please enter a valid email address" }));
                        } else {
                          setErrors(er => { const n = { ...er }; delete n.email; return n; });
                          checkEmail(val);
                        }
                      }}
                      onBlur={() => {
                        if (form.email.trim() && EMAIL_RE.test(form.email.trim())) checkEmail(form.email);
                      }}
                    />
                    {checkingEmail && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 text-xs">checking...</span>}
                    {!checkingEmail && emailAvailable === true && EMAIL_RE.test(form.email.trim()) && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-400 text-xs">✓ available</span>}
                    {!checkingEmail && emailAvailable === false && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-red-400 text-xs">✗ taken</span>}
                  </div>
                  {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
                </div>
                {isFieldVisible("gender") && (
                  <div data-field="gender">
                    <label className="block text-white text-sm font-medium mb-2">Gender {isFieldRequired("gender") ? "*" : <span className="text-white/70 font-normal">(optional)</span>}</label>
                    <div className="flex flex-wrap gap-2">
                      {["Male", "Female", "Other"].map(g => (
                        <button key={g} type="button" onClick={() => setField("gender", form.gender === g ? "" : g)}
                          className="px-3 py-1.5 rounded-full text-xs transition-all"
                          style={{ background: form.gender === g ? "#E14F69" : "rgba(255,255,255,0.06)", color: form.gender === g ? "white" : "rgba(255,255,255,0.75)", border: `1px solid ${form.gender === g ? "#E14F69" : "rgba(255,255,255,0.10)"}` }}>
                          {g}
                        </button>
                      ))}
                    </div>
                    {errors.gender && <p className="text-red-400 text-xs mt-1">{errors.gender}</p>}
                  </div>
                )}
                <StateDropdown value={form.state} onChange={v => setField("state", v)} error={errors.state} />
                {isFieldVisible("bio") && (
                  <div data-field="bio">
                    <label className="block text-white text-sm font-medium mb-1.5">
                      Bio {isFieldRequired("bio") ? <span className="text-[#E14F69]">*</span> : <span className="text-white/70 font-normal">(optional)</span>}
                    </label>
                    <textarea className={inputClass + " resize-none"} rows={2} placeholder="A short blurb about yourself (max 150 chars)" maxLength={150} value={form.bio} onChange={e => setField("bio", e.target.value.slice(0, 150))} />
                    <div className="flex items-center justify-between mt-0.5">
                      {errors.bio ? <p className="text-red-400 text-xs">{errors.bio}</p> : <span />}
                      <p className="text-white/70 text-xs">{form.bio.length}/150</p>
                    </div>
                  </div>
                )}
                {isFieldVisible("youtubeHandle") && (
                  <div>
                    <label className="block text-white text-sm font-medium mb-1.5">
                      YouTube Handle {isFieldRequired("youtubeHandle") ? <span className="text-[#E14F69]">*</span> : <span className="text-white/70 font-normal">(optional)</span>}
                    </label>
                    <input className={inputClass} placeholder="@yourchannel" value={form.youtubeHandle} onChange={e => setField("youtubeHandle", e.target.value)} />
                    {errors.youtubeHandle && <p className="text-red-400 text-xs mt-1">{errors.youtubeHandle}</p>}
                  </div>
                )}
                {isFieldVisible("otherSocialHandle") && (
                  <div>
                    <label className="block text-white text-sm font-medium mb-1.5">
                      Other Social Handle {isFieldRequired("otherSocialHandle") ? <span className="text-[#E14F69]">*</span> : <span className="text-white/70 font-normal">(optional)</span>}
                    </label>
                    <input className={inputClass} placeholder="e.g. Twitter, Moj, Josh..." value={form.otherSocialHandle} onChange={e => setField("otherSocialHandle", e.target.value)} />
                    {errors.otherSocialHandle && <p className="text-red-400 text-xs mt-1">{errors.otherSocialHandle}</p>}
                  </div>
                )}
                <div data-field="images">
                  <label className="block text-white text-sm font-medium mb-2">
                    Add Your Best Photos <span className="text-white">*</span>
                  </label>
                  <p className="text-white/70 text-xs mb-2">Upload 4 photos that represent you best - strong profiles get noticed faster by brands. You can update them anytime from your profile.</p>
                  <MultiImageUpload
                    value={form.images}
                    onChange={imgs => setField("images", imgs)}
                    max={4}
                    helperText={form.images.length < 4 ? `${form.images.length}/4 uploaded — all 4 required` : "4/4 photos uploaded ✓"}
                    onUploadingChange={setImagesUploading}
                    error={errors.images}
                  />
                </div>
                <div data-field="password">
                  <label className="block text-white text-sm font-medium mb-1.5">Password *</label>
                  <div className="relative">
                    <input className={inputClass + " pr-10"} type={showPass ? "text" : "password"} autoComplete="new-password" placeholder="Min. 8 characters" value={form.password} onChange={e => setField("password", e.target.value)} />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">{showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
                </div>
                <div data-field="confirmPassword">
                  <label className="block text-white text-sm font-medium mb-1.5">Confirm Password *</label>
                  <div className="relative">
                    <input className={inputClass + " pr-10"} type={showConfirm ? "text" : "password"} autoComplete="new-password" placeholder="Re-enter password" value={form.confirmPassword} onChange={e => setField("confirmPassword", e.target.value)} />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">{showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
                </div>
              </div>
            )}

            {/* ── STEP 3: Categories ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-white font-bold text-lg">Content Categories</h2><p className="text-white/70 text-xs">Select the categories that best match your content.</p></div>
                  {infoContent && <button onClick={() => setShowInfoModal(true)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-2" style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(240,24,122,0.30)" }}><Info className="w-3.5 h-3.5 text-[#E14F69]" /></button>}
                </div>
                {errors.categories && <p className="text-red-400 text-xs">{errors.categories}</p>}
                <p className="text-white/70 text-xs">You can select up to 7 categories.</p>
                <div data-field="categories" className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {allCategories.map((cat: any) => {
                    const sel = form.categories.find(c => c.categoryId === cat.id);
                    const atLimit = !sel && form.categories.length >= 7;
                    return (
                      <button key={cat.id} type="button" onClick={() => {
                        if (sel) setField("categories", form.categories.filter(c => c.categoryId !== cat.id));
                        else if (form.categories.length < 7) setField("categories", [...form.categories, { categoryId: cat.id, categoryName: cat.name }]);
                      }}
                        disabled={!!atLimit}
                        className="flex items-center gap-2 p-3 rounded-xl text-left text-sm transition-all"
                        style={{ background: sel ? "rgba(240,24,122,0.20)" : "rgba(255,255,255,0.04)", border: `1px solid ${sel ? "#E14F69" : "rgba(255,255,255,0.10)"}`, color: sel ? "#E14F69" : atLimit ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.90)", cursor: atLimit ? "not-allowed" : "pointer", opacity: atLimit ? 0.5 : 1 }}>
                        {sel && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-white/70 text-xs">
                  {form.categories.length}/7 selected
                  {form.categories.length >= 7 && <span className="text-amber-400 ml-2">· Limit reached</span>}
                </p>
              </div>
            )}

            {/* ── STEP 4: Audience + Goals (merged) ── */}
            {step === 4 && (
              <div className="space-y-5">
                {randomCategoryMessage && (
                  <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#F0187A", color: "#fff", boxShadow: "0 0 6px 1px rgba(255,255,255,0.70)" }}>
                    <p className="text-sm leading-relaxed font-medium">{randomCategoryMessage}</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div><h2 className="text-white font-bold text-lg">About Your Audience</h2><p className="text-white/70 text-xs">Tell brands who follows you</p></div>
                  {infoContent && <button onClick={() => setShowInfoModal(true)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-2" style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(240,24,122,0.30)" }}><Info className="w-3.5 h-3.5 text-[#E14F69]" /></button>}
                </div>
                <div data-field="audienceGenderFemale">
                  <label className="block text-white text-sm font-medium mb-2">Gender Split</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-white/70 text-xs mb-1">Female %</label>
                      <input className={inputClass} type="number" min="0" max="100" value={form.audienceGenderFemale}
                        onChange={e => { const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0)); setField("audienceGenderFemale", String(v)); setField("audienceGenderMale", String(100-v)); }} />
                    </div>
                    <div>
                      <label className="block text-white/70 text-xs mb-1">Male %</label>
                      <input className={inputClass} type="number" min="0" max="100" value={form.audienceGenderMale}
                        onChange={e => { const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0)); setField("audienceGenderMale", String(v)); setField("audienceGenderFemale", String(100-v)); }} />
                    </div>
                  </div>
                  {errors.audienceGenderFemale && <p className="text-red-400 text-xs mt-1">{errors.audienceGenderFemale}</p>}
                  <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${form.audienceGenderFemale}%`, background: "linear-gradient(90deg,#E14F69,#ff7eb3)" }} />
                  </div>
                  <div className="flex justify-between text-xs mt-1 text-white/70"><span>♀ {form.audienceGenderFemale}%</span><span>♂ {form.audienceGenderMale}%</span></div>
                </div>
                <div data-field="audienceAge">
                  <label className="block text-white text-sm font-medium mb-2">Audience Age Group *</label>
                  <div className={`flex flex-wrap gap-2 p-2 rounded-xl transition-all ${errors.audienceAge ? "ring-1 ring-red-500/70" : ""}`}>
                    {ageGroups.map((g: OptionItem) => (
                      <button key={g.label} type="button" onClick={() => setField("audienceAge", g.label)}
                        className="px-3 py-1.5 rounded-full text-xs transition-all"
                        style={{ background: form.audienceAge === g.label ? "#E14F69" : "rgba(255,255,255,0.06)", color: form.audienceAge === g.label ? "white" : "rgba(255,255,255,0.75)", border: `1px solid ${form.audienceAge === g.label ? "#E14F69" : "rgba(255,255,255,0.10)"}` }}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                  {errors.audienceAge && <p className="text-red-400 text-xs mt-1">{errors.audienceAge}</p>}
                </div>
                {locations.length > 0 && (
                  <div data-field="audienceLocation">
                    <label className="block text-white text-sm font-medium mb-2">Audience Location *</label>
                    <div className="flex flex-wrap gap-2">
                      {locations.map((l: OptionItem) => (
                        <button key={l.label} type="button" onClick={() => setField("audienceLocation", form.audienceLocation === l.label ? "" : l.label)}
                          className="px-3 py-1.5 rounded-full text-xs transition-all"
                          style={{ background: form.audienceLocation === l.label ? "#E14F69" : "rgba(255,255,255,0.06)", color: form.audienceLocation === l.label ? "white" : "rgba(255,255,255,0.75)", border: `1px solid ${form.audienceLocation === l.label ? "#E14F69" : "rgba(255,255,255,0.10)"}` }}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                    {errors.audienceLocation && <p className="text-red-400 text-xs mt-1">{errors.audienceLocation}</p>}
                  </div>
                )}
                {contentTypes.length > 0 && (
                  <div data-field="contentType">
                    <label className="block text-white text-sm font-medium mb-2">What's your primary content style? *</label>
                    <div className="flex flex-wrap gap-2">
                      {contentTypes.map((t: OptionItem) => (
                        <button key={t.label} type="button" onClick={() => setField("contentType", form.contentType === t.label ? "" : t.label)}
                          className="px-3 py-1.5 rounded-full text-xs transition-all"
                          style={{ background: form.contentType === t.label ? "#E14F69" : "rgba(255,255,255,0.06)", color: form.contentType === t.label ? "white" : "rgba(255,255,255,0.75)", border: `1px solid ${form.contentType === t.label ? "#E14F69" : "rgba(255,255,255,0.10)"}` }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {errors.contentType && <p className="text-red-400 text-xs mt-1">{errors.contentType}</p>}
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 5: Pricing ── */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-white font-bold text-lg">Pricing Tier</h2><p className="text-white/70 text-xs">Set your content pricing based on your reach</p></div>
                  {infoContent && <button onClick={() => setShowInfoModal(true)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-2" style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(240,24,122,0.30)" }}><Info className="w-3.5 h-3.5 text-[#E14F69]" /></button>}
                </div>
                {loadingSlabs ? <div className="text-white/70 text-sm text-center py-4">Loading tiers...</div> : (
                  <div>
                    {detectedSlab && (
                      <div className="p-3 rounded-xl mb-3" style={{ background: "#F0187A", boxShadow: "0 0 6px 1px rgba(255,255,255,0.70)" }}>
                        <p className="text-white text-xs">Based on your {parseInt(form.followerCount || "0").toLocaleString("en-IN")} followers, we suggest the <strong>{detectedSlab.label}</strong> tier — most deals on our platform for creators in your range are made here.</p>
                      </div>
                    )}
                    <div className="space-y-2" data-field="selectedSlabId">
                      {eligibleSlabs.map((slab: any) => {
                        const isSelected = form.selectedSlabId === slab.id;
                        const isSuggested = detectedSlab?.id === slab.id;
                        return (
                          <button key={slab.id} type="button" onClick={() => setForm(f => ({ ...f, selectedSlabId: slab.id, selectedSlabLabel: slab.label }))}
                            className="w-full text-left p-4 rounded-xl transition-all"
                            style={{
                              background: isSelected ? "rgba(240,24,122,0.14)" : "rgba(255,255,255,0.04)",
                              border: `1.5px solid ${isSelected ? "#E14F69" : isSuggested ? "rgba(240,24,122,0.35)" : "rgba(255,255,255,0.10)"}`,
                              boxShadow: isSelected ? "0 0 14px 0 rgba(240,24,122,0.25)" : "none",
                            }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-white font-semibold text-sm">{slab.label}</span>
                                  {isSuggested && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(240,24,122,0.20)", color: "#E14F69" }}>Suggested</span>}
                                </div>
                                <span className="text-white/70 text-xs block mb-1.5">
                                  {fmtK(slab.minFollowers)}{slab.maxFollowers ? `–${fmtK(slab.maxFollowers)}` : "+"} followers
                                </span>
                                <div className="flex flex-col gap-0.5 text-xs text-white">
                                  <span>Reel: {fmt(slab.recReelMin)} – {fmt(slab.recReelMax)}</span>
                                  <span>Story: {fmt(slab.recStoryMin)} – {fmt(slab.recStoryMax)}</span>
                                  <span>Post: {fmt(slab.recPostMin)} – {fmt(slab.recPostMax)}</span>
                                </div>
                              </div>
                              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ borderColor: isSelected ? "#E14F69" : "rgba(255,255,255,0.20)", background: isSelected ? "rgba(240,24,122,0.15)" : "transparent" }}>
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#E14F69" }} />}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {errors.selectedSlabId && <p className="text-red-400 text-xs mt-1">{errors.selectedSlabId}</p>}
                    {detectedSlab && form.selectedSlabId && (() => {
                      const selIdx = eligibleSlabs.findIndex(s => s.id === form.selectedSlabId);
                      const sugIdx = eligibleSlabs.findIndex(s => s.id === detectedSlab.id);
                      if (selIdx > sugIdx) {
                        return (
                          <div className="p-3 rounded-xl mt-2" style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)" }}>
                            <p className="text-amber-400 text-xs leading-relaxed">⚠ Most deals on our platform happen in the suggested <strong>{detectedSlab.label}</strong> tier for your follower range. Also, your pricing is locked for 14 days after signup — you won't be able to change it during this period.</p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {form.selectedSlabId && (() => {
                      const slab = allSlabs.find(s => s.id === form.selectedSlabId);
                      return slab?.disclaimerRecommended ? <p className="text-white/70 text-xs mt-2 italic">{slab.disclaimerRecommended}</p> : null;
                    })()}
                  </div>
                )}
                <p className="text-white/70 text-xs">Pricing is locked for 14 days after first edit.</p>
              </div>
            )}

            {/* ── CUSTOM FIELDS (only if exist) — appears at customFieldsStep ── */}
            {customFieldsStep && step === customFieldsStep && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-white font-bold text-lg">Additional Information</h2><p className="text-white/70 text-xs">A few more details to complete your profile</p></div>
                </div>
                {customFields.map(cf => (
                  <div key={cf.id}>
                    <label className="block text-white text-sm font-medium mb-1.5">
                      {cf.label} {cf.isRequired ? <span className="text-[#E14F69]">*</span> : <span className="text-white/70 font-normal">(optional)</span>}
                    </label>
                    <input className={inputClass} type="text" value={customFieldValues[cf.id] ?? ""}
                      onChange={e => { setCustomFieldValues(v => ({ ...v, [cf.id]: e.target.value })); setErrors(er => { const n = { ...er }; delete n[`cf_${cf.id}`]; return n; }); }} />
                    {errors[`cf_${cf.id}`] && <p className="text-red-400 text-xs mt-1">{errors[`cf_${cf.id}`]}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* ── REVIEW STEP ── */}
            {step === reviewStep && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-white font-bold text-lg">Review & Submit</h2><p className="text-white/70 text-xs">Your profile will be reviewed within 24–48 hours</p></div>
                  {infoContent && <button onClick={() => setShowInfoModal(true)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-2" style={{ background: "rgba(240,24,122,0.15)", border: "1px solid rgba(240,24,122,0.30)" }}><Info className="w-3.5 h-3.5 text-[#E14F69]" /></button>}
                </div>
                <div className="space-y-2 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {([
                    ["Instagram", `@${form.instagramHandle}`],
                    ["Followers", parseInt(form.followerCount || "0").toLocaleString("en-IN")],
                    ["Name", form.fullName],
                    ["Phone", form.phone],
                    ["Email", form.email],
                    isFieldVisible("gender") ? ["Gender", form.gender || "—"] : null,
                    ["State / UT", form.state || "—"],
                    isFieldVisible("bio") && form.bio ? ["Bio", form.bio] : null,
                    isFieldVisible("youtubeHandle") && form.youtubeHandle ? ["YouTube", form.youtubeHandle] : null,
                    isFieldVisible("otherSocialHandle") && form.otherSocialHandle ? ["Other Social", form.otherSocialHandle] : null,
                    ["Categories", form.categories.map(c => c.categoryName).join(", ") || "—"],
                    ["Audience", `${form.audienceGenderFemale}% F · ${form.audienceAge} · ${form.audienceLocation}`],
                    ["Pricing Tier", (() => {
                      const s = allSlabs.find(sl => sl.id === form.selectedSlabId);
                      if (!s) return form.selectedSlabLabel || "—";
                      return `${s.label}\nReel ${fmt(s.recReelMin)}–${fmt(s.recReelMax)} · Story ${fmt(s.recStoryMin)}–${fmt(s.recStoryMax)} · Photo ${fmt(s.recPostMin)}–${fmt(s.recPostMax)}`;
                    })()],
                  ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, val]) => (
                    <div key={String(label)} className="flex justify-between items-start py-1 border-b border-white/5 last:border-0 gap-3">
                      <span className="text-white/70 text-xs shrink-0 mr-3">{label}</span>
                      <span className="text-white text-sm font-medium text-right whitespace-pre-line break-words max-w-[65%]">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Under-18 warning + guardian checkbox */}
                {isUnder18 && (
                  <div className="p-3 rounded-xl" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)" }}>
                    <p className="text-yellow-400 text-xs font-medium">You are {ageDisplay} years old. Users under 18 must have their account managed by a parent or guardian.</p>
                  </div>
                )}

                {/* Main T&C checkbox */}
                <div data-field="termsAccepted">
                <label className="flex items-start gap-2.5 cursor-pointer" onClick={() => setField("termsAccepted", !form.termsAccepted)}>
                  <div className="w-5 h-5 rounded border mt-0.5 flex-shrink-0 flex items-center justify-center"
                    style={{ background: form.termsAccepted ? "#E14F69" : "transparent", borderColor: form.termsAccepted ? "#E14F69" : "rgba(255,255,255,0.20)" }}>
                    {form.termsAccepted && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>}
                  </div>
                  <span className="text-white/80 text-xs leading-relaxed">
                    I agree to Collabry's{" "}
                    <Link href="/terms-conditions" className="text-[#E14F69] hover:underline" onClick={e => e.stopPropagation()}>Terms & Conditions</Link>
                    {" "}and{" "}
                    <Link href="/privacy-policies" className="text-[#E14F69] hover:underline" onClick={e => e.stopPropagation()}>Privacy Policy</Link>
                    . I understand that KYC verification may be required for payouts and off-platform contact is prohibited.
                  </span>
                </label>
                {errors.termsAccepted && <p className="text-red-400 text-xs">{errors.termsAccepted}</p>}
                </div>

                {/* Under-18 guardian checkbox */}
                {isUnder18 && (
                  <div data-field="guardianAccepted">
                    <label className="flex items-start gap-2.5 cursor-pointer" onClick={() => setGuardianAccepted(!guardianAccepted)}>
                      <div className="w-5 h-5 rounded border mt-0.5 flex-shrink-0 flex items-center justify-center"
                        style={{ background: guardianAccepted ? "#E14F69" : "transparent", borderColor: guardianAccepted ? "#E14F69" : "rgba(255,255,255,0.20)" }}>
                        {guardianAccepted && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>}
                      </div>
                      <span className="text-white/80 text-xs leading-relaxed">
                        I confirm that I am under 18 years of age and my Collabry account will be managed by my parent or guardian in accordance with Collabry's Terms of Service.
                      </span>
                    </label>
                    {errors.guardianAccepted && <p className="text-red-400 text-xs">{errors.guardianAccepted}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 mt-6">
              {step > 1 && (
                <button type="button" onClick={prev} className="flex-1 py-3.5 rounded-full border border-white/20 text-white text-sm flex items-center justify-center gap-1.5 hover:bg-white/5 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
              {step < totalSteps ? (
                <button type="button" onClick={next} className="flex-1 py-3.5 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition-all" style={{ background: "#E14F69" }}>
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-3.5 rounded-full text-white font-semibold text-sm disabled:opacity-50 transition-all" style={{ background: "#E14F69" }}>
                  {submitting ? "Submitting..." : "Submit Profile"}
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-white/70 text-xs mt-4">
            Already registered? <Link href="/login-creator" className="text-[#E14F69] hover:underline">Login here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
