import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Camera, Lock, ChevronRight, X, Plus, Trash2, LogOut,
  Sparkles, CheckCircle, AlertCircle, Link as LinkIcon, MapPin,
} from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { CreatorLayout, PINK, BG, POPPINS } from "@/components/CreatorNavLayout";
import MultiImageUpload from "@/components/MultiImageUpload";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

function apiFetch(token: string, path: string, opts?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
}

/* ─── Toast ─── */
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2800); return () => clearTimeout(t); }, []);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-white text-sm max-w-xs text-center shadow-lg"
      style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", fontFamily: POPPINS }}>
      {message}
    </div>
  );
}

/* ─── Label ─── */
function FieldLabel({ text }: { text: string }) {
  return <p className="text-white/70 text-[11px] mb-1.5 uppercase tracking-wider" style={{ fontFamily: POPPINS }}>{text}</p>;
}

/* ─── Input ─── */
function Inp({ value, onChange, placeholder, type = "text", disabled = false }:
  { value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean }) {
  return (
    <input type={type} value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled}
      className="w-full px-3.5 py-3 rounded-xl text-sm outline-none"
      style={{
        background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${disabled ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"}`,
        color: disabled ? "rgba(255,255,255,0.70)" : "white", fontFamily: POPPINS,
      }} />
  );
}

const INDIA_STATES_LIST = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal",
  "Andaman & Nicobar Islands","Chandigarh","Dadra & Nagar Haveli and Daman & Diu",
  "Delhi","Jammu & Kashmir","Ladakh","Lakshadweep","Puducherry",
];

/* ─── State Dropdown ─── */
function StateEditDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  const filtered = INDIA_STATES_LIST.filter(s => s.toLowerCase().includes(search.toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <p className="text-white/70 text-[11px] mb-1.5 uppercase tracking-wider" style={{ fontFamily: POPPINS }}>State / UT</p>
      {value ? (
        <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl text-sm text-white cursor-pointer"
          style={{ background: "rgba(240,24,122,0.10)", border: "1px solid rgba(240,24,122,0.35)" }}
          onClick={() => { setOpen(o => !o); setSearch(""); }}>
          <span className="flex-1">{value}</span>
          <button type="button" className="text-white/70 hover:text-white transition-colors" onClick={e => { e.stopPropagation(); onChange(""); setOpen(false); }}>✕</button>
        </div>
      ) : (
        <div className="px-3.5 py-3 rounded-xl text-sm cursor-pointer"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.70)" }}
          onClick={() => { setOpen(true); setSearch(""); }}>
          Select your state or UT…
        </div>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden shadow-2xl" style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="p-2">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none placeholder:text-white/70"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }} />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-2 text-sm text-white/70" style={{ fontFamily: POPPINS }}>No match</p>
            ) : filtered.map(s => (
              <button key={s} type="button"
                className="w-full text-left px-4 py-2.5 text-sm transition-all"
                style={{ color: s === value ? PINK : "rgba(255,255,255,0.90)", background: s === value ? "rgba(240,24,122,0.10)" : "transparent", fontFamily: POPPINS }}
                onClick={() => { onChange(s); setOpen(false); setSearch(""); }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Edit Section Card ─── */
function EditSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div>
        <p className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>{title}</p>
        {subtitle && <p className="text-white/70 text-[11px] mt-0.5" style={{ fontFamily: POPPINS }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* ─── Pill Selector ─── */
function SelectPill({ options, value, onChange, label }: { options: string[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div>
      {label && <FieldLabel text={label} />}
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const sel = value === opt;
          return (
            <button key={opt} onClick={() => onChange(opt)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: sel ? PINK : "rgba(255,255,255,0.05)", color: sel ? "white" : "rgba(255,255,255,0.85)", border: `1px solid ${sel ? PINK : "rgba(255,255,255,0.10)"}`, fontFamily: POPPINS }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   FUN QUESTIONS SECTION (with save button)
══════════════════════════════════════════════════════════════════ */
function FunQuestionsSection({ token, onToast }: { token: string; onToast: (msg: string) => void }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [savedAnswers, setSavedAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(token, "/api/creator/fun-questions").then(r => r.json()).then(d => {
      const qs = d.questions ?? [];
      setQuestions(qs);
      const ans: Record<string, string> = {};
      qs.forEach((q: any) => { if (q.selectedOptionId) ans[q.id] = q.selectedOptionId; });
      setLocalAnswers(ans); setSavedAnswers(ans);
    }).finally(() => setLoading(false));
  }, []);

  const hasChanges = questions.some(q => localAnswers[q.id] !== savedAnswers[q.id]);

  const save = async () => {
    setSaving(true);
    for (const q of questions.filter(q => localAnswers[q.id] !== savedAnswers[q.id] && localAnswers[q.id])) {
      await apiFetch(token, "/api/creator/fun-answers", { method: "PATCH", body: JSON.stringify({ questionId: q.id, optionId: localAnswers[q.id] }) });
    }
    setSavedAnswers({ ...localAnswers });
    setSaving(false);
    onToast("Answers saved!");
  };

  if (loading || questions.length === 0) return null;
  const unanswered = questions.filter(q => !localAnswers[q.id]).length;

  return (
    <div className="mx-4 lg:mx-0">
      {/* Big stylised heading */}
      <div className="flex items-center justify-center gap-3 mb-6 mt-2">
        <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: POPPINS }}>
          <span className="text-white">Fun </span>
          <span style={{ color: PINK }}>Questions</span>
        </h2>
        {unanswered > 0
          ? <span className="text-xs px-2.5 py-1 rounded-full text-white font-semibold" style={{ background: PINK, fontFamily: POPPINS }}>{unanswered} Pending</span>
          : <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", fontFamily: POPPINS }}>All done</span>}
      </div>

      <div className="rounded-2xl p-5 space-y-6" style={{ background: "rgba(225,79,105,0.13)", border: "1px solid rgba(255,255,255,0.18)" }}>
        {questions.map((q: any) => (
          <div key={q.id}>
            <p className="text-white text-sm font-semibold mb-3 leading-snug" style={{ fontFamily: POPPINS }}>{q.questionText}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {q.options.map((opt: any) => {
                const sel = localAnswers[q.id] === opt.id;
                return (
                  <button key={opt.id} onClick={() => setLocalAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                    className="text-left px-3 py-2 rounded-xl text-sm transition-all"
                    style={{ background: sel ? PINK : "rgba(255,255,255,0.05)", color: sel ? "white" : "rgba(255,255,255,0.90)", border: `1px solid ${sel ? PINK : "rgba(255,255,255,0.10)"}`, fontWeight: sel ? 600 : 400, fontFamily: POPPINS }}>
                    {opt.optionText}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <button onClick={save} disabled={!hasChanges || saving}
          className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: hasChanges ? PINK : "rgba(255,255,255,0.07)", color: hasChanges ? "white" : "rgba(255,255,255,0.70)", fontFamily: POPPINS, cursor: hasChanges ? "pointer" : "not-allowed" }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   COMPREHENSIVE EDIT OVERLAY
══════════════════════════════════════════════════════════════════ */

interface EditState {
  fullName: string; bio: string; youtubeHandle: string; otherSocialHandle: string; gender: string; state: string;
  phone: string;
  username: string;
  followerCount: string;
  editCats: Array<{ categoryId: string; subcategoryId?: string }>;
  gF: string; gM: string; audienceAge: string; audienceLocation: string;
  contentType: string;
  editSlabId: string;
  portfolioUrls: Array<{ id: string; videoUrl: string }>;
  images: string[];
}

function EditOverlay({ token, creator, initialCats, initialPortfolio, allCategories, signupConfig, onClose, onSaved, onToast, scrollTo }:
  { token: string; creator: any; initialCats: any[]; initialPortfolio: any[]; allCategories: any[]; signupConfig: any; onClose: () => void; onSaved: () => void; onToast: (m: string) => void; scrollTo?: string }) {

  const scrollBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollTo || !scrollBodyRef.current) return;
    const timer = setTimeout(() => {
      const el = scrollBodyRef.current?.querySelector(`[data-section="${scrollTo}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(timer);
  }, [scrollTo]);

  // Lock state comes exclusively from backend (server-side, immune to device clock manipulation)
  const pricingDaysLeft: number = creator.pricingDaysRemaining ?? 0;
  const pricingLocked = pricingDaysLeft > 0;
  // Username (Instagram handle) 14-day cooldown — server-computed, immune to device clock
  const usernameDaysLeft: number = creator.usernameDaysRemaining ?? 0;
  const usernameLocked = usernameDaysLeft > 0;
  const normHandle = (v: string) => v.trim().replace(/^@/, "").toLowerCase();

  const [allSlabs, setAllSlabs] = useState<any[]>([]);
  const [loadingSlabs, setLoadingSlabs] = useState(true);
  useEffect(() => {
    fetch(`${BASE_URL}/api/slabs/all`)
      .then(r => r.json())
      .then((d: any[]) => {
        const active = d.filter(sl => sl.isActive).sort((a, b) => a.minFollowers - b.minFollowers);
        setAllSlabs(active);
        // If no selectedSlabId stored, detect the current slab for pre-selection
        if (!creator.selectedSlabId) {
          // 1. Try exact price match
          const priceMatch = active.find(sl =>
            creator.reelPriceMin != null &&
            Number(sl.recReelMin) === Number(creator.reelPriceMin) &&
            Number(sl.recReelMax) === Number(creator.reelPriceMax) &&
            Number(sl.recStoryMin) === Number(creator.storyPriceMin) &&
            Number(sl.recStoryMax) === Number(creator.storyPriceMax) &&
            Number(sl.recPostMin) === Number(creator.postPriceMin) &&
            Number(sl.recPostMax) === Number(creator.postPriceMax)
          );
          if (priceMatch) {
            upd("editSlabId", priceMatch.id);
          } else {
            // 2. Fall back to follower-count based slab
            const fc = Number(creator.followerCount ?? 0);
            const followerMatch = active.find(sl =>
              sl.minFollowers <= fc && (sl.maxFollowers === null || sl.maxFollowers >= fc)
            );
            if (followerMatch) upd("editSlabId", followerMatch.id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSlabs(false));
  }, []);

  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [s, setS] = useState<EditState>({
    fullName: creator.fullName ?? "", bio: creator.bio ?? "",
    gender: creator.gender ?? "", state: creator.state ?? "",
    phone: creator.phone ?? "",
    username: creator.instagramHandle ?? "",
    youtubeHandle: creator.youtubeHandle ?? "", otherSocialHandle: creator.otherSocialHandle ?? "",
    followerCount: String(creator.followerCount ?? ""),
    editCats: initialCats.map((c: any) => ({ categoryId: c.categoryId, subcategoryId: c.subcategoryId })),
    gF: String(creator.audienceGenderFemale ?? 50), gM: String(creator.audienceGenderMale ?? 50),
    audienceAge: creator.audienceAge ?? "", audienceLocation: creator.audienceLocation ?? "",
    contentType: creator.contentType ?? "",
    editSlabId: creator.selectedSlabId ?? "",
    portfolioUrls: initialPortfolio.map((p: any) => ({ id: p.id, videoUrl: p.videoUrl })),
    images: Array.isArray(creator.images) ? creator.images : [],
  });
  const upd = (k: keyof EditState, v: any) => setS(prev => ({ ...prev, [k]: v }));

  const [newPUrl, setNewPUrl] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  const ageGroups = (signupConfig.creator_audience_age_groups ?? []).filter((o: any) => o.isActive).map((o: any) => o.label);
  const locations = (signupConfig.creator_audience_locations ?? []).filter((o: any) => o.isActive).map((o: any) => o.label);
  const contentTypes = (signupConfig.creator_content_types ?? []).filter((o: any) => o.isActive).map((o: any) => o.label);

  const origCatSig = initialCats.map((c: any) => `${c.categoryId}:${c.subcategoryId ?? ""}`).sort().join(",");
  const newCatSig = s.editCats.map(c => `${c.categoryId}:${c.subcategoryId ?? ""}`).sort().join(",");
  const catsChanged = origCatSig !== newCatSig;
  const followerChanged = Number(s.followerCount) !== Number(creator.followerCount);
  const usernameChanged = !usernameLocked && normHandle(s.username) !== "" && normHandle(s.username) !== normHandle(creator.instagramHandle ?? "");
  const audChanged = Number(s.gF) !== Number(creator.audienceGenderFemale) || Number(s.gM) !== Number(creator.audienceGenderMale) || s.audienceAge !== creator.audienceAge || s.audienceLocation !== creator.audienceLocation || s.contentType !== creator.contentType;
  const origImages = (Array.isArray(creator.images) ? creator.images : []).join("|");
  const imagesChanged = s.images.join("|") !== origImages;
  const personalFields: any[] = signupConfig?.creator_personal_fields?.value ?? signupConfig?.creator_personal_fields ?? [];
  const imagesField = Array.isArray(personalFields) ? personalFields.find((f: any) => f?.key === "creatorImages") : null;
  const imagesVisible = !imagesField || imagesField.visibility !== "hidden";
  // Slab is considered "changed" when user picks a different tier and pricing is not locked
  const resolvedOrigSlabId = creator.selectedSlabId ?? "";
  const slabChanged = !pricingLocked && s.editSlabId !== "" && s.editSlabId !== resolvedOrigSlabId;
  // Follower-count and username changes require admin re-verification — pricing is direct
  const anyReview = followerChanged || usernameChanged;
  const basicChanged = s.fullName !== creator.fullName || s.bio !== (creator.bio ?? "") || s.gender !== (creator.gender ?? "") || s.state !== (creator.state ?? "") || s.youtubeHandle !== (creator.youtubeHandle ?? "") || s.otherSocialHandle !== (creator.otherSocialHandle ?? "");
  const phoneChanged = s.phone !== (creator.phone ?? "");

  const scrollToPwSection = () => setTimeout(() => {
    const el = scrollBodyRef.current?.querySelector('[data-section="password"]');
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 50);

  const handlePasswordChange = async () => {
    setPwError(null); setPwSuccess(false);
    if (!pwCurrent) { setPwError("Current password is required"); scrollToPwSection(); return; }
    if (!pwNew) { setPwError("New password is required"); scrollToPwSection(); return; }
    if (pwNew.length < 8) { setPwError("Password must be at least 8 characters"); scrollToPwSection(); return; }
    if (pwNew === pwCurrent) { setPwError("New password must be different from current password"); scrollToPwSection(); return; }
    if (pwNew !== pwConfirm) { setPwError("Passwords don't match"); scrollToPwSection(); return; }
    setPwSaving(true);
    try {
      const r = await apiFetch(token, "/api/creator/profile/password", { method: "PATCH", body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }) });
      const d = await r.json();
      if (!r.ok) { setPwError(d.error ?? "Failed to update password"); scrollToPwSection(); return; }
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setPwSuccess(true);
      onToast("Password Updated");
    } catch { setPwError("Failed to update password"); scrollToPwSection(); }
    finally { setPwSaving(false); }
  };

  const handleSave = () => {
    if (anyReview && creator.status === "ACTIVE") { setShowPopup(true); } else { doSave(); }
  };

  const doSave = async () => {
    if (phoneChanged) {
      const phone = s.phone.trim();
      if (!phone) { onToast("Phone number is required"); return; }
      if (!/^\d{10}$/.test(phone)) { setPhoneError("Phone number must be exactly 10 digits."); return; }
      const cr = await fetch(`${BASE_URL}/api/creators/check-phone?phone=${encodeURIComponent(phone)}`);
      const cd = await cr.json();
      if (!cd.available) { setPhoneError("This phone number is already linked to another account."); return; }
    }
    if (usernameChanged) {
      const handle = normHandle(s.username);
      if (!/^[a-zA-Z0-9_.]+$/.test(handle)) { setUsernameError("Username can only contain letters, numbers, underscores, and periods."); return; }
      const ur = await fetch(`${BASE_URL}/api/creators/check-handle?handle=${encodeURIComponent(handle)}`);
      const ud = await ur.json();
      if (!ud.available) { setUsernameError("This username is already linked to a Collabry account."); return; }
    }
    setSaving(true); setShowPopup(false);
    try {
      if (basicChanged) await apiFetch(token, "/api/creator/profile/basic", { method: "PATCH", body: JSON.stringify({ fullName: s.fullName, bio: s.bio, gender: s.gender, state: s.state || null, youtubeHandle: s.youtubeHandle, otherSocialHandle: s.otherSocialHandle }) });
      if (phoneChanged) {
        const pr = await apiFetch(token, "/api/creator/phone", { method: "PATCH", body: JSON.stringify({ phone: s.phone }) });
        if (!pr.ok) { const pd = await pr.json(); onToast(pd.error ?? "Failed to update phone"); setSaving(false); return; }
      }
      if (followerChanged) await apiFetch(token, "/api/creator/follower-count", { method: "PATCH", body: JSON.stringify({ followerCount: Number(s.followerCount) }) });
      if (usernameChanged) {
        const ur = await apiFetch(token, "/api/creator/username", { method: "PATCH", body: JSON.stringify({ instagramHandle: normHandle(s.username) }) });
        if (!ur.ok) { const ud = await ur.json(); setUsernameError(ud.error === "Username locked" ? `Username can be changed in ${ud.daysRemaining} day${ud.daysRemaining === 1 ? "" : "s"}.` : (ud.error ?? "Failed to update username")); setSaving(false); return; }
      }
      if (slabChanged) {
        const r = await apiFetch(token, "/api/creator/pricing/slab", { method: "PATCH", body: JSON.stringify({ slabId: s.editSlabId }) });
        if (!r.ok) { const d = await r.json(); onToast(d.error ?? "Failed to submit pricing"); setSaving(false); return; }
      }
      if (catsChanged) {
        const catR = await apiFetch(token, "/api/creator/categories", { method: "PATCH", body: JSON.stringify({ categories: s.editCats }) });
        if (!catR.ok) { const d = await catR.json(); onToast(d.error ?? "Failed to save categories"); setSaving(false); return; }
      }
      if (audChanged) await apiFetch(token, "/api/creator/audience", { method: "PATCH", body: JSON.stringify({ audienceGenderFemale: parseInt(s.gF), audienceGenderMale: parseInt(s.gM), audienceAge: s.audienceAge, audienceLocation: s.audienceLocation, contentType: s.contentType }) });
      if (imagesChanged) {
        if (s.images.length < 4) { onToast("All 4 photos are required"); return; }
        const r = await apiFetch(token, "/api/creator/profile/images", { method: "PATCH", body: JSON.stringify({ images: s.images }) });
        if (!r.ok) { const d = await r.json(); onToast(d.error ?? "Failed to submit photos"); return; }
      }
      onSaved(); onClose();
      const msg = slabChanged ? "Pricing tier updated!" : anyReview ? "Changes submitted for review!" : "Profile updated!";
      onToast(msg);
    } catch { onToast("Failed to save changes"); } finally { setSaving(false); }
  };

  const toggleCat = (catId: string) => {
    const exists = s.editCats.some(c => c.categoryId === catId);
    if (exists) { if (s.editCats.length <= 1) return; upd("editCats", s.editCats.filter(c => c.categoryId !== catId)); }
    else { if (s.editCats.length >= 7) { onToast("You can select a maximum of 7 categories"); return; } upd("editCats", [...s.editCats, { categoryId: catId }]); }
  };

  const addPortfolio = async () => {
    if (!newPUrl.trim()) return;
    if (s.portfolioUrls.length >= 5) { onToast("Maximum 5 videos allowed"); return; }
    if (!newPUrl.trim().includes(".")) { onToast("Please enter a valid URL"); return; }
    const r = await apiFetch(token, "/api/creator/portfolio", { method: "POST", body: JSON.stringify({ videoUrl: newPUrl.trim(), selfDeclared: true }) });
    if (r.ok) { const d = await r.json(); upd("portfolioUrls", [...s.portfolioUrls, { id: d.id, videoUrl: d.videoUrl }]); setNewPUrl(""); onToast("Video added"); }
    else { const d = await r.json(); onToast(d.error ?? "Failed to add"); }
  };

  const removePortfolio = async (pid: string) => {
    setRemovingId(pid);
    const r = await apiFetch(token, `/api/creator/portfolio/${pid}`, { method: "DELETE" });
    if (r.ok) { upd("portfolioUrls", s.portfolioUrls.filter(p => p.id !== pid)); onToast("Video removed"); }
    else { const d = await r.json(); onToast(d.error ?? "Cannot remove"); }
    setRemovingId(null);
  };

  const syncGender = (which: "f" | "m", val: string) => {
    const n = Math.max(0, Math.min(100, parseInt(val) || 0));
    if (which === "f") { upd("gF", String(n)); upd("gM", String(100 - n)); }
    else { upd("gM", String(n)); upd("gF", String(100 - n)); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center" style={{ background: BG }}>
      <div className="flex flex-col h-full w-full lg:max-w-[1280px] relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <button onClick={onClose} className="p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}><X className="w-4 h-4 text-white" /></button>
        <h2 className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>Edit Profile</h2>
        <div className="w-10" />
      </div>

      {/* Body */}
      <div ref={scrollBodyRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4" style={{ scrollbarWidth: "none" }}>

        {/* Locked */}
        {creator.email && (
          <EditSection title="Account Info" subtitle="This cannot be changed">
            <div>
              <FieldLabel text="Email" />
              <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Lock className="w-3.5 h-3.5 text-white/70" />
                <span className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>{creator.email}</span>
              </div>
            </div>
          </EditSection>
        )}

        {/* Username / Instagram handle (review + 14-day cooldown) */}
        <EditSection title="Username" subtitle={usernameLocked ? `Username can be changed in ${usernameDaysLeft} day${usernameDaysLeft === 1 ? "" : "s"}` : "Changes trigger a profile review · Locked for 14 days after each change"}>
          {usernameLocked ? (
            <div>
              <FieldLabel text="Instagram Handle" />
              <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Lock className="w-3.5 h-3.5 text-white/70" />
                <span className="text-white/70 text-sm" style={{ fontFamily: POPPINS }}>@{creator.instagramHandle}</span>
              </div>
              <p className="text-white/70 text-[11px] mt-1.5" style={{ fontFamily: POPPINS }}>You can change your username again in {usernameDaysLeft} day{usernameDaysLeft === 1 ? "" : "s"}.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.20)" }}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
                <p className="text-xs" style={{ color: "#f59e0b", fontFamily: POPPINS }}>Changing your username requires re-verification</p>
              </div>
              <div>
                <FieldLabel text="Instagram Handle" />
                <div className="flex items-center rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <span className="pl-3.5 text-white/60 text-sm" style={{ fontFamily: POPPINS }}>@</span>
                  <input
                    value={s.username.replace(/^@/, "")}
                    onChange={e => { setUsernameError(null); upd("username", e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9_.]/g, "").toLowerCase()); }}
                    onBlur={async () => {
                      const handle = normHandle(s.username);
                      if (!handle || handle === normHandle(creator.instagramHandle ?? "")) { setUsernameError(null); return; }
                      if (!/^[a-zA-Z0-9_.]+$/.test(handle)) { setUsernameError("Username can only contain letters, numbers, underscores, and periods."); return; }
                      const r = await fetch(`${BASE_URL}/api/creators/check-handle?handle=${encodeURIComponent(handle)}`);
                      const d = await r.json();
                      setUsernameError(d.available ? null : "This username is already linked to a Collabry account.");
                    }}
                    placeholder="yourusername"
                    className="flex-1 px-2 py-3 text-sm outline-none bg-transparent"
                    style={{ color: "white", fontFamily: POPPINS }}
                  />
                </div>
                {usernameError && <p className="text-[11px] mt-1.5" style={{ color: PINK, fontFamily: POPPINS }}>{usernameError}</p>}
              </div>
            </>
          )}
        </EditSection>

        {/* Basic (no review) */}
        <EditSection title="Basic Info" subtitle="No review required for these changes">
          <div><FieldLabel text="Full Name" /><Inp value={s.fullName} onChange={v => upd("fullName", v)} placeholder="Your full name" /></div>
          <div>
            <FieldLabel text="Gender" />
            <div className="flex gap-2">
              {["Male", "Female", "Other"].map(g => (
                <button key={g} type="button" onClick={() => upd("gender", s.gender === g ? "" : g)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: s.gender === g ? PINK : "rgba(255,255,255,0.06)", color: s.gender === g ? "white" : "rgba(255,255,255,0.75)", border: `1px solid ${s.gender === g ? PINK : "rgba(255,255,255,0.10)"}`, fontFamily: POPPINS }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <StateEditDropdown value={s.state} onChange={v => upd("state", v)} />
          <div data-section="bio">
            <FieldLabel text="Bio (max 150)" />
            <textarea value={s.bio} onChange={e => upd("bio", e.target.value)} maxLength={150} placeholder="Tell brands about yourself..." rows={3}
              className="w-full px-3.5 py-3 rounded-xl text-sm outline-none resize-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontFamily: POPPINS }} />
            <p className="text-right text-white/70 text-[11px] mt-0.5" style={{ fontFamily: POPPINS }}>{s.bio.length}/150</p>
          </div>
          <div><FieldLabel text="YouTube Handle" /><Inp value={s.youtubeHandle} onChange={v => upd("youtubeHandle", v)} placeholder="@yourchannel" /></div>
          <div><FieldLabel text="Other Social" /><Inp value={s.otherSocialHandle} onChange={v => upd("otherSocialHandle", v)} placeholder="@handle" /></div>
          <div>
            <FieldLabel text="Phone Number" />
            <input
              type="tel"
              value={s.phone}
              onChange={e => { setPhoneError(null); upd("phone", e.target.value.replace(/\D/g, "").slice(0, 10)); }}
              onBlur={async () => {
                const phone = s.phone.trim();
                if (!phone || phone === (creator.phone ?? "")) { setPhoneError(null); return; }
                if (!/^\d{10}$/.test(phone)) { setPhoneError("Phone number must be exactly 10 digits."); return; }
                const r = await fetch(`${BASE_URL}/api/creators/check-phone?phone=${encodeURIComponent(phone)}`);
                const d = await r.json();
                setPhoneError(d.available ? null : "This phone number is already linked to another account.");
              }}
              placeholder="10-digit mobile number"
              maxLength={10}
              className="w-full px-3.5 py-3 rounded-xl text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontFamily: POPPINS }}
            />
            {phoneError && <p className="text-[11px] mt-1.5" style={{ color: PINK, fontFamily: POPPINS }}>{phoneError}</p>}
          </div>
        </EditSection>

        {/* Follower count (review) */}
        <EditSection title="Follower Count" subtitle="Changes trigger a profile review">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.20)" }}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
            <p className="text-xs" style={{ color: "#f59e0b", fontFamily: POPPINS }}>Changing follower count requires re-verification</p>
          </div>
          <div><FieldLabel text="Follower Count" /><Inp type="number" value={s.followerCount} onChange={v => upd("followerCount", v)} placeholder="e.g. 50000" /></div>
        </EditSection>

        {/* Categories (instant update) */}
        <EditSection title="Content Categories" subtitle="1–7 categories · Updates instantly">
          <p className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>You can select up to 7 categories.</p>
          <div className="flex flex-wrap gap-2">
            {allCategories.map((cat: any) => {
              const sel = s.editCats.some(c => c.categoryId === cat.id);
              const atLimit = !sel && s.editCats.length >= 7;
              return (
                <button key={cat.id} onClick={() => toggleCat(cat.id)}
                  disabled={atLimit}
                  className="px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{ background: sel ? PINK : "rgba(255,255,255,0.05)", color: sel ? "white" : atLimit ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.85)", border: `1px solid ${sel ? PINK : "rgba(255,255,255,0.08)"}`, fontFamily: POPPINS, cursor: atLimit ? "not-allowed" : "pointer", opacity: atLimit ? 0.45 : 1 }}>
                  {cat.name}
                </button>
              );
            })}
          </div>
          <p className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>
            {s.editCats.length}/7 selected
            {s.editCats.length >= 7 && <span style={{ color: "#f59e0b", marginLeft: 8 }}>· Limit reached</span>}
          </p>
        </EditSection>

        {/* Audience (no review) */}
        <EditSection title="Audience Details" subtitle="No review required for these changes">
          <div>
            <FieldLabel text="Gender Split (must total 100%)" />
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-white/70 text-[11px] mb-1" style={{ fontFamily: POPPINS }}>Female %</p><Inp type="number" value={s.gF} onChange={v => syncGender("f", v)} placeholder="50" /></div>
              <div><p className="text-white/70 text-[11px] mb-1" style={{ fontFamily: POPPINS }}>Male %</p><Inp type="number" value={s.gM} onChange={v => syncGender("m", v)} placeholder="50" /></div>
            </div>
          </div>
          {ageGroups.length > 0 && <SelectPill label="Age Group" options={ageGroups} value={s.audienceAge} onChange={v => upd("audienceAge", v)} />}
          {locations.length > 0 && <SelectPill label="Primary Location" options={locations} value={s.audienceLocation} onChange={v => upd("audienceLocation", v)} />}
          {contentTypes.length > 0 && <SelectPill label="Primary Content Type" options={contentTypes} value={s.contentType} onChange={v => upd("contentType", v)} />}
        </EditSection>

        {/* Pricing Tier (matches signup UI exactly) */}
        <EditSection title="Pricing Tier" subtitle={pricingLocked ? `Pricing can be updated in ${pricingDaysLeft} day${pricingDaysLeft === 1 ? "" : "s"}` : "Select your pricing tier · Locked for 14 days after each change"}>
          {loadingSlabs ? (
            <div className="text-center py-4" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS, fontSize: 13 }}>Loading tiers…</div>
          ) : (() => {
            const fmt = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;
            const fmtK = (n: number | null) => {
              if (n === null) return null;
              if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(1))}M`;
              if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}K`;
              return `${n}`;
            };
            const followerCnt = Number(creator.followerCount ?? 0);
            const detectedSlab = allSlabs.find(sl => sl.minFollowers <= followerCnt && (sl.maxFollowers === null || sl.maxFollowers >= followerCnt));

            return (
              <>
                {/* Lock banner — days remaining from backend, no device date used */}
                {pricingLocked && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-1" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
                    <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
                    <span className="text-xs" style={{ color: "#f59e0b", fontFamily: POPPINS }}>
                      Pricing can be updated in {pricingDaysLeft} day{pricingDaysLeft === 1 ? "" : "s"}
                    </span>
                  </div>
                )}

                {/* Suggested tier banner (when unlocked) */}
                {!pricingLocked && detectedSlab && (
                  <div className="p-3 rounded-xl mb-1" style={{ background: PINK, boxShadow: "0 0 6px 1px rgba(255,255,255,0.12)" }}>
                    <p className="text-white text-xs" style={{ fontFamily: POPPINS }}>
                      Based on your {followerCnt.toLocaleString("en-IN")} followers, we suggest the <strong>{detectedSlab.label}</strong> tier — most deals on our platform for creators in your range are made here.
                    </p>
                  </div>
                )}

                {/* Tier cards */}
                <div className="space-y-2">
                  {allSlabs.map(slab => {
                    const isSelected = s.editSlabId === slab.id;
                    const isCurrentActive = (creator.selectedSlabId ?? resolvedOrigSlabId) === slab.id;
                    const isSuggested = detectedSlab?.id === slab.id;
                    return (
                      <button key={slab.id} type="button" disabled={pricingLocked}
                        onClick={() => upd("editSlabId", isSelected ? resolvedOrigSlabId : slab.id)}
                        className="w-full text-left p-4 rounded-xl transition-all"
                        style={{
                          background: isSelected ? "rgba(240,24,122,0.14)" : "rgba(255,255,255,0.04)",
                          border: `1.5px solid ${isSelected ? "#E14F69" : isCurrentActive ? "rgba(240,24,122,0.35)" : isSuggested ? "rgba(240,24,122,0.20)" : "rgba(255,255,255,0.10)"}`,
                          boxShadow: isSelected ? "0 0 14px 0 rgba(240,24,122,0.25)" : "none",
                          cursor: pricingLocked ? "not-allowed" : "pointer",
                          opacity: pricingLocked && !isCurrentActive ? 0.55 : 1,
                        }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-sm" style={{ color: "white", fontFamily: POPPINS }}>{slab.label}</span>
                              {isSuggested && !pricingLocked && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(240,24,122,0.20)", color: "#E14F69", fontFamily: POPPINS }}>Suggested</span>}
                              {isCurrentActive && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Current</span>}
                            </div>
                            <span className="block mb-1.5 text-xs" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>
                              {fmtK(slab.minFollowers)}{slab.maxFollowers ? `–${fmtK(slab.maxFollowers)}` : "+"} followers
                            </span>
                            <div className="flex flex-col gap-0.5" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS, fontSize: 12 }}>
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

                {!pricingLocked && slabChanged && detectedSlab && (() => {
                  const selIdx = allSlabs.findIndex(sl => sl.id === s.editSlabId);
                  const sugIdx = allSlabs.findIndex(sl => sl.id === detectedSlab.id);
                  if (selIdx > sugIdx) return (
                    <div className="p-3 rounded-xl mt-1" style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)" }}>
                      <p className="text-xs leading-relaxed" style={{ color: "#fbbf24", fontFamily: POPPINS }}>⚠ Most deals on our platform happen in the suggested <strong>{detectedSlab.label}</strong> tier for your follower range. Pricing is locked for 14 days after each change.</p>
                    </div>
                  );
                  return null;
                })()}
              </>
            );
          })()}
        </EditSection>

        {/* Top Videos — above Photos */}
        <div data-section="videos">
          <EditSection title="Your Best Videos" subtitle={`Add video URL · ${s.portfolioUrls.length} / 5 videos added`}>
            <div className="space-y-2">
              {s.portfolioUrls.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 rounded-xl text-xs truncate" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)", fontFamily: POPPINS }}>{p.videoUrl}</div>
                  <button onClick={() => removePortfolio(p.id)} disabled={removingId === p.id} className="p-2 rounded-lg disabled:opacity-30" style={{ background: "rgba(239,68,68,0.12)" }}>
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
              {s.portfolioUrls.length < 5 && <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>You can add {5 - s.portfolioUrls.length} more videos</p>}
              {s.portfolioUrls.length >= 5 && <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Maximum 5 videos reached</p>}
            </div>
            {s.portfolioUrls.length < 5 && (
              <div className="flex gap-2 mt-1">
                <input value={newPUrl} onChange={e => setNewPUrl(e.target.value)} placeholder="Paste video URL..."
                  className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontFamily: POPPINS }} />
                <button onClick={addPortfolio} className="px-4 py-2.5 lg:px-7 lg:py-3.5 rounded-xl flex items-center gap-1.5 text-sm lg:text-[15px] font-semibold" style={{ background: PINK, color: "white", fontFamily: POPPINS }}>
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            )}
          </EditSection>
        </div>

        {/* Creator Images (instant update) */}
        {imagesVisible && (
          <EditSection title="Your Photos" subtitle="All 4 photos required · Updates instantly">
            <p className="text-white/70 text-[11px] mb-2" style={{ fontFamily: POPPINS }}>Upload all 4 photos.</p>
            <MultiImageUpload
              value={s.images}
              onChange={imgs => upd("images", imgs)}
              max={4}
              helperText={s.images.length < 4 ? `${s.images.length}/4 uploaded — all 4 required` : "4/4 photos ready"}
            />
          </EditSection>
        )}

        {/* Change Password */}
        <div data-section="password">
        <EditSection title="Change Password" subtitle="Optional · Leave blank to keep your current password">
          <div className="space-y-3">
            <div>
              <p className="text-white/70 text-[11px] mb-2" style={{ fontFamily: POPPINS }}>Enter your current password to verify, then choose a new one.</p>
              <div className="relative">
                <input
                  type={showPwCurrent ? "text" : "password"}
                  placeholder="Current password"
                  value={pwCurrent}
                  onChange={e => { setPwError(null); setPwSuccess(false); setPwCurrent(e.target.value); }}
                  className="w-full px-3.5 py-3 pr-16 rounded-xl text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${pwError ? "rgba(248,113,113,0.6)" : "rgba(255,255,255,0.12)"}`, color: "white", fontFamily: POPPINS }} />
                <button
                  type="button"
                  onClick={() => setShowPwCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/70 hover:text-white"
                  style={{ fontFamily: POPPINS }}
                >
                  {showPwCurrent ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                type={showPwNew ? "text" : "password"}
                placeholder="New password (min 8 chars)"
                value={pwNew}
                onChange={e => { setPwError(null); setPwSuccess(false); setPwNew(e.target.value); }}
                className="w-full px-3.5 py-3 pr-16 rounded-xl text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${pwError ? "rgba(248,113,113,0.6)" : "rgba(255,255,255,0.12)"}`, color: "white", fontFamily: POPPINS }} />
              <button
                type="button"
                onClick={() => setShowPwNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/70 hover:text-white"
                style={{ fontFamily: POPPINS }}
              >
                {showPwNew ? "Hide" : "Show"}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPwConfirm ? "text" : "password"}
                placeholder="Confirm new password"
                value={pwConfirm}
                onChange={e => { setPwError(null); setPwSuccess(false); setPwConfirm(e.target.value); }}
                className="w-full px-3.5 py-3 pr-16 rounded-xl text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${pwError ? "rgba(248,113,113,0.6)" : "rgba(255,255,255,0.12)"}`, color: "white", fontFamily: POPPINS }} />
              <button
                type="button"
                onClick={() => setShowPwConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/70 hover:text-white"
                style={{ fontFamily: POPPINS }}
              >
                {showPwConfirm ? "Hide" : "Show"}
              </button>
            </div>
            {pwError && (
              <p className="text-sm font-medium" style={{ color: "#f87171", fontFamily: POPPINS }}>{pwError}</p>
            )}
            {pwSuccess && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <p className="text-xs font-semibold" style={{ color: "#4ade80", fontFamily: POPPINS }}>Password updated successfully!</p>
              </div>
            )}
            <button
              type="button"
              onClick={handlePasswordChange}
              disabled={pwSaving || (!pwCurrent && !pwNew && !pwConfirm)}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
              style={{ background: PINK, fontFamily: POPPINS }}>
              {pwSaving ? "Updating..." : "Update Password"}
            </button>
          </div>
        </EditSection>
        </div>

        <div className="h-4" />
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <button onClick={handleSave} disabled={saving} className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm disabled:opacity-50" style={{ background: PINK, fontFamily: POPPINS }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {anyReview && <p className="text-center text-white/70 text-[11px] mt-2" style={{ fontFamily: POPPINS }}>* Some changes will trigger a profile review</p>}
      </div>

      {/* Re-review popup */}
      {showPopup && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.88)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(240,24,122,0.15)" }}>
              <AlertCircle className="w-6 h-6" style={{ color: PINK }} />
            </div>
            <h3 className="text-white font-bold text-base text-center mb-2" style={{ fontFamily: POPPINS }}>Heads up!</h3>
            <p className="text-white/80 text-sm text-center leading-relaxed mb-5" style={{ fontFamily: POPPINS }}>
              Your profile will go back for a quick re-verification. While under review, new deal opportunities will be paused — but all your ongoing deals will continue without any interruption.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowPopup(false)} disabled={saving} className="flex-1 py-3 rounded-xl border text-sm" style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>Cancel</button>
              <button onClick={doSave} disabled={saving} className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: PINK, fontFamily: POPPINS }}>{saving ? "Saving..." : "Confirm & Save"}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════════ */
export default function CreatorProfile() {
  const { accessToken, loading, clearAuth } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [editMode, setEditMode] = useState(() => new URLSearchParams(window.location.search).get("edit") === "true");
  const [initialSection] = useState(() => new URLSearchParams(window.location.search).get("section") ?? "");
  const [creator, setCreator] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [reviews, setReviews] = useState<{ id: string; rating: number; reviewText: string | null; createdAt: string; brandName: string }[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [signupConfig, setSignupConfig] = useState<any>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showLogout, setShowLogout] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycFields, setKycFields] = useState<Array<{ id: string; label: string; fieldType: string; isRequired: boolean }>>([]);
  const [kycFieldValues, setKycFieldValues] = useState<Record<string, string>>({});
  const [kycLoadingFields, setKycLoadingFields] = useState(false);
  const [kycSubmitError, setKycSubmitError] = useState<string | null>(null);
  const [kycFileUploading, setKycFileUploading] = useState<Record<string, boolean>>({});
  const [kycFieldErrors, setKycFieldErrors] = useState<Record<string, string>>({});
  const [kycFieldTouched, setKycFieldTouched] = useState<Record<string, boolean>>({});
  const [kycSubmitAttempted, setKycSubmitAttempted] = useState(false);
  const [kycFileNotes, setKycFileNotes] = useState<Record<string, { msg: string; ok: boolean }>>({});

  useEffect(() => {
    if (window.location.hash !== "#kyc") return;
    const el = document.getElementById("kyc");
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const t = setTimeout(() => {
      document.getElementById("kyc")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 600);
    return () => clearTimeout(t);
  }, []);

  function validateKycFieldValue(label: string, value: string): string {
    const l = label.toLowerCase().trim();
    const v = value.trim();
    if (!v) return "";
    if (l.includes("pan") && !l.includes("account")) {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) return "Invalid PAN format (e.g. ABCDE1234F)";
    }
    if (l.includes("aadhaar") || l.includes("aadhar")) {
      const digits = v.replace(/\s/g, "");
      if (!/^\d{12}$/.test(digits)) return "Aadhaar must be exactly 12 digits";
    }
    if (l.includes("ifsc")) {
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) return "Invalid IFSC format (e.g. HDFC0001234)";
    }
    if (l.includes("account") && l.includes("number") && !l.includes("ifsc")) {
      if (!/^\d{9,18}$/.test(v)) return "Bank account number must be 9–18 digits";
    }
    if (l.includes("date of birth") || l.includes("dob")) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const d = new Date(v);
      const minD = new Date(today); minD.setFullYear(today.getFullYear() - 100);
      if (isNaN(d.getTime())) return "Please enter a valid date of birth";
      if (d < minD) return "Please enter a valid date of birth";
      if (d > today) return "Date of birth cannot be in the future";
    }
    if (l.includes("full legal name") || l.includes("account holder name") || (l.includes("holder") && l.includes("name"))) {
      if (v.length < 3 || !/^[a-zA-Z\s]+$/.test(v)) return "Please enter a valid full name";
    }
    return "";
  }

  function formatKycInput(label: string, raw: string): string {
    const l = label.toLowerCase().trim();
    if ((l.includes("pan") && !l.includes("account")) || l.includes("ifsc")) {
      return raw.toUpperCase();
    }
    if (l.includes("aadhaar") || l.includes("aadhar")) {
      const digits = raw.replace(/\D/g, "").slice(0, 12);
      return digits.replace(/(\d{4})(\d{0,4})(\d{0,4})/, (_: string, a: string, b: string, c: string) =>
        [a, b, c].filter(Boolean).join(" ")
      );
    }
    return raw;
  }

  const openKycModal = async () => {
    setKycModalOpen(true);
    setKycSubmitError(null);
    if (!accessToken) return;
    setKycLoadingFields(true);
    try {
      const [fieldsR, existingR] = await Promise.all([
        apiFetch(accessToken, "/api/creator/kyc/fields"),
        apiFetch(accessToken, "/api/creator/kyc/data"),
      ]);
      const fields = fieldsR.ok ? await fieldsR.json() : [];
      setKycFields(fields);
      if (existingR.ok) {
        const existing: Array<{ fieldId: string; value: string; fileUrl: string | null }> = await existingR.json();
        const vals: Record<string, string> = {};
        for (const e of existing) {
          // For FILE fields restore the actual fileUrl (data URL) so preview works
          vals[e.fieldId] = e.fileUrl ?? e.value;
        }
        setKycFieldValues(vals);
      }
    } finally { setKycLoadingFields(false); }
  };

  const handleKycFileChange = async (fieldId: string, file: File | undefined) => {
    if (!file) return;
    setKycFileUploading(v => ({ ...v, [fieldId]: true }));
    setKycFileNotes(v => ({ ...v, [fieldId]: { msg: "", ok: true } }));
    try {
      if (!accessToken) throw new Error("Please sign in to upload files");
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(file.type)) throw new Error("Only JPG, PNG, WebP, or PDF allowed");
      if (file.size > 5 * 1024 * 1024) throw new Error("File too large (max 5MB)");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("prefix", "kyc");

      const r = await fetch(`${BASE_URL}/api/uploads/private`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? `Upload failed (${r.status})`);
      }
      const { objectPath } = (await r.json()) as { objectPath: string };
      setKycFieldValues(v => ({ ...v, [fieldId]: objectPath }));
      setKycFileNotes(v => ({ ...v, [fieldId]: { msg: "File uploaded ✓", ok: true } }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to upload file. Please try again.";
      setKycFileNotes(v => ({ ...v, [fieldId]: { msg, ok: false } }));
      setKycFieldValues(v => ({ ...v, [fieldId]: "" }));
    } finally {
      setKycFileUploading(v => ({ ...v, [fieldId]: false }));
    }
  };

  const submitKyc = async () => {
    if (!accessToken) return;
    setKycSubmitAttempted(true);
    setKycSubmitError(null);
    const errors: Record<string, string> = {};
    for (const f of kycFields) {
      const val = kycFieldValues[f.id] ?? "";
      if (f.isRequired && !val.trim()) {
        errors[f.id] = `"${f.label}" is required`;
      } else if (f.fieldType !== "FILE" && val.trim()) {
        const err = validateKycFieldValue(f.label, val);
        if (err) errors[f.id] = err;
      }
    }
    if (Object.keys(errors).length > 0) {
      setKycFieldErrors(errors);
      setKycSubmitError("Please fix the errors above before submitting.");
      return;
    }
    setKycFieldErrors({});
    setKycSubmitting(true);
    try {
      const fields = kycFields.map(f => ({ fieldId: f.id, fieldLabel: f.label, value: kycFieldValues[f.id] ?? "" })).filter(f => f.value.trim());
      const r = await apiFetch(accessToken, "/api/creator/kyc/submit", {
        method: "POST",
        body: JSON.stringify({ fields }),
      });
      if (r.ok) {
        setKycModalOpen(false);
        setKycFieldValues({});
        setToast("KYC submitted! Our team will review shortly.");
        await loadProfile();
      } else {
        const e = await r.json();
        setKycSubmitError(e.error ?? "Failed to submit KYC");
      }
    } catch { setKycSubmitError("Network error. Please try again."); }
    finally { setKycSubmitting(false); }
  };

  const loadProfile = useCallback(async () => {
    if (!accessToken) return;
    const [pR, cR, rR] = await Promise.all([
      apiFetch(accessToken, "/api/creator/profile"),
      fetch(`${BASE_URL}/api/categories`),
      apiFetch(accessToken, "/api/creator/ratings").catch(() => null),
    ]);
    const pd = await pR.json(); const cd = await cR.json();
    setCreator(pd.creator); setCategories(pd.categories ?? []); setPortfolio(pd.portfolio ?? []);
    setAllCategories(cd ?? []);
    if (rR?.ok) { const rd = await rR.json(); setReviews(rd.reviews ?? []); }
  }, [accessToken]);

  useEffect(() => {
    if (!loading && !accessToken) { navigate("/login-creator"); return; }
    if (!loading && accessToken) {
      Promise.all([
        loadProfile(),
        fetch(`${BASE_URL}/api/creator-signup-config`).then(r => r.json()).then(setSignupConfig).catch(() => {}),
      ]).finally(() => setDataLoading(false));
    }
  }, [loading, accessToken]);

  if (loading || dataLoading) return <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}><div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: PINK, borderTopColor: "transparent" }} /></div>;
  if (!creator) return <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}><p className="text-white/80">Could not load profile.</p></div>;

  const statusBadge = ({ ACTIVE: { bg: "rgba(34,197,94,0.15)", col: "#4ade80", label: "Active" }, PENDING: { bg: "rgba(245,158,11,0.15)", col: "#fbbf24", label: "Under Review" }, REJECTED: { bg: "rgba(239,68,68,0.15)", col: "#f87171", label: "Not Approved" } } as any)[creator.status] ?? { bg: "rgba(255,255,255,0.08)", col: "white", label: creator.status };

  const S = { background: "rgba(225,79,105,0.13)", border: "1px solid rgba(255,255,255,0.18)" } as const;
  const fmtRupee = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

  return (
    <CreatorLayout status={creator.status} onLocked={() => {}}>
      <div className="pb-10 space-y-3 pt-1 lg:pt-6">

        {/* ── SECTION 1: HERO CARD ── */}
        <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>

          {/* Row 1: avatar · name+handle · deal counters (desktop only) */}
          <div className="flex items-center gap-3 sm:gap-4 mb-3 pt-2 sm:pt-3">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden" style={{ border: `2px solid ${PINK}99` }}>
                {creator.profilePhotoUrl
                  ? <img src={creator.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-white font-bold text-xl" style={{ background: PINK }}>{creator.fullName?.[0] ?? "C"}</div>}
              </div>
            </div>

            {/* Name + handle + badge + bio */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>@{creator.instagramHandle}</p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: statusBadge.bg, color: statusBadge.col, fontFamily: POPPINS }}>{statusBadge.label}</span>
              </div>
              <h1 className="text-white font-bold text-xl sm:text-2xl leading-tight mb-1" style={{ fontFamily: POPPINS }}>{creator.fullName}</h1>
              {creator.bio && <p className="text-white/70 text-xs sm:text-sm leading-relaxed line-clamp-2 mb-1" style={{ fontFamily: POPPINS }}>{creator.bio}</p>}
              {creator.state && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: PINK }} />
                  <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.85)", fontFamily: POPPINS }}>{creator.state}</span>
                </div>
              )}
            </div>

            {/* Deal counters — desktop only (hidden on mobile) */}
            <div className="hidden sm:flex flex-row gap-6 items-center pr-4">
              {[
                { n: creator.activeDeals ?? 0, lbl: "Active Deals" },
                { n: creator.liveCampaigns ?? 0, lbl: "Live Campaigns" },
                { n: creator.totalDeals ?? 0, lbl: "Total Deals" },
              ].map(({ n, lbl }) => (
                <div key={lbl} className="text-center">
                  <p className="text-white font-bold text-2xl leading-none" style={{ fontFamily: POPPINS }}>{String(n).padStart(2, "0")}</p>
                  <p className="text-white/70 text-[10px] whitespace-nowrap mt-0.5" style={{ fontFamily: POPPINS }}>{lbl}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Deal counters — mobile only, horizontal row above edit button */}
          <div className="flex sm:hidden flex-row justify-around mb-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
            {[
              { n: creator.activeDeals ?? 0, lbl: "Active Deals" },
              { n: creator.liveCampaigns ?? 0, lbl: "Live Campaigns" },
              { n: creator.totalDeals ?? 0, lbl: "Total Deals" },
            ].map(({ n, lbl }) => (
              <div key={lbl} className="text-center">
                <p className="text-white font-bold text-lg leading-none" style={{ fontFamily: POPPINS }}>{String(n).padStart(2, "0")}</p>
                <p className="text-white/70 text-[10px] whitespace-nowrap mt-0.5" style={{ fontFamily: POPPINS }}>{lbl}</p>
              </div>
            ))}
          </div>

          {/* Edit Profile button — white stroke, no fill, triple width */}
          <button onClick={() => setEditMode(true)}
            className="mx-auto flex items-center justify-center gap-1.5 px-24 sm:px-28 py-2.5 rounded-2xl font-semibold text-sm mb-4"
            style={{ background: "transparent", border: "1.5px solid rgba(255,255,255,1)", color: "white", fontFamily: POPPINS }}>
            Edit Your Profile <ChevronRight className="w-4 h-4" />
          </button>

          {/* Stat cards — E14F69 at 10%, numbers pink, labels white */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { val: (creator.followerCount ?? 0).toLocaleString("en-IN"), label: "Followers" },
              { val: parseFloat(creator.averageRating ?? "0").toFixed(1), label: "Rating" },
              { val: String(creator.ratingCount ?? 0), label: "Reviews" },
            ].map(({ val, label }) => (
              <div key={label} className="rounded-xl py-4 px-2 flex flex-col items-center justify-center" style={{ background: "rgba(225,79,105,0.10)", border: "1px solid rgba(225,79,105,0.30)" }}>
                <p className="font-bold text-lg sm:text-xl leading-none mb-0.5" style={{ color: PINK, fontFamily: POPPINS }}>{val}</p>
                <p className="text-white text-[10px] sm:text-xs font-medium" style={{ fontFamily: POPPINS }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 2: CONTENT CATEGORIES ── */}
        {categories.length > 0 && (
          <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
            <p className="text-white/75 text-xs sm:text-sm font-semibold mb-3 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Content Categories</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c: any) => (
                <span key={c.categoryId} className="px-3 py-1.5 rounded-full text-xs sm:text-sm text-white font-semibold"
                  style={{ background: PINK, fontFamily: POPPINS }}>
                  {c.categoryName}{c.subcategoryName ? ` · ${c.subcategoryName}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION 3: PERSONAL DETAILS ── */}
        <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
          <p className="text-white/75 text-xs sm:text-sm font-semibold mb-4 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Personal Details</p>
          {/* Row 1: Gender · Age · Location */}
          <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-4">
            {[
              { label: "Gender", value: creator.gender || "—" },
              { label: "Age", value: creator.creatorAge ? `${creator.creatorAge} yrs` : (creator.age ? `${creator.age} yrs` : "—") },
              { label: "Location", value: creator.state ? `${creator.state}` : "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] sm:text-xs mb-1" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>{label}</p>
                <p className="text-sm sm:text-base font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>{value}</p>
              </div>
            ))}
          </div>
          {/* Row 2: Phone · E-mail · Primary Content Style */}
          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            {[
              { label: "Phone", value: creator.phone || "—" },
              { label: "E-mail", value: creator.email || "—" },
              { label: "Content Style", value: creator.contentType || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <p className="text-[10px] sm:text-xs mb-1" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>{label}</p>
                <p className="text-sm sm:text-base font-semibold break-words leading-snug" style={{ color: PINK, fontFamily: POPPINS }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 4: BEST VIDEOS ── */}
        <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
          <p className="text-white/75 text-xs sm:text-sm font-semibold mb-3 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Your Best Videos</p>
          {portfolio.length > 0 ? (
            <div className="space-y-2 mb-3">
              {portfolio.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-xs sm:text-sm truncate"
                    style={{ background: "rgba(225,79,105,0.30)", border: "1px solid rgba(225,79,105,0.40)", color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>
                    {p.videoUrl}
                  </div>
                  <button onClick={() => window.open(/^https?:\/\//i.test(p.videoUrl) ? p.videoUrl : `https://${p.videoUrl}`, '_blank', 'noopener,noreferrer')}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap"
                    style={{ background: PINK, color: "white", fontFamily: POPPINS }}>
                    <LinkIcon className="w-3.5 h-3.5" /> Visit Video
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/70 text-xs mb-3" style={{ fontFamily: POPPINS }}>No videos added yet</p>
          )}
          {/* Pink filled short "Add More" button — scrolls to video section in edit */}
          <button
            onClick={() => { setEditMode(true); setTimeout(() => { document.querySelector('[data-section="videos"]')?.scrollIntoView({ behavior: "smooth" }); }, 200); }}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: PINK, color: "white", fontFamily: POPPINS }}>
            <Plus className="w-4 h-4" /> {portfolio.length > 0 ? "Add More Videos" : "Add Videos"}
          </button>
        </div>

        {/* ── SECTION 5: AUDIENCE DETAILS ── */}
        <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
          <p className="text-white/75 text-xs sm:text-sm font-semibold mb-4 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Audience Details</p>
          {/* 3-col layout: Gender | Age Range | Location */}
          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            {/* Gender — Female then Male each with bar + % */}
            <div>
              <p className="text-[10px] sm:text-xs mb-3" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Gender</p>
              <div className="space-y-2.5">
                {/* Female */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] sm:text-xs text-white/75" style={{ fontFamily: POPPINS }}>Female</span>
                    <span className="text-xs sm:text-sm font-bold" style={{ color: PINK, fontFamily: POPPINS }}>{creator.audienceGenderFemale ?? 0}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.10)", maxWidth: "120px" }}>
                    <div className="h-full rounded-full" style={{ width: `${creator.audienceGenderFemale ?? 0}%`, background: PINK }} />
                  </div>
                </div>
                {/* Male */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] sm:text-xs text-white/75" style={{ fontFamily: POPPINS }}>Male</span>
                    <span className="text-xs sm:text-sm font-bold" style={{ color: PINK, fontFamily: POPPINS }}>{creator.audienceGenderMale ?? 0}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.10)", maxWidth: "120px" }}>
                    <div className="h-full rounded-full" style={{ width: `${creator.audienceGenderMale ?? 0}%`, background: PINK }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Age Range */}
            <div>
              <p className="text-[10px] sm:text-xs mb-3" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Age Range</p>
              <p className="text-sm sm:text-base font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>{creator.audienceAge || "—"}</p>
            </div>

            {/* Location */}
            <div>
              <p className="text-[10px] sm:text-xs mb-3" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>Location</p>
              <p className="text-sm sm:text-base font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>{creator.audienceLocation || "—"}</p>
            </div>
          </div>
        </div>

        {/* ── SECTION 6: PRICING — Reel · Story · Photo ── */}
        <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
          <p className="text-white/75 text-xs sm:text-sm font-semibold mb-4 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Pricing</p>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { label: "Reel", min: creator.reelPriceMin, max: creator.reelPriceMax },
              { label: "Story", min: creator.storyPriceMin, max: creator.storyPriceMax },
              { label: "Photo", min: creator.postPriceMin, max: creator.postPriceMax },
            ].map(({ label, min, max }) => (
              <div key={label} className="rounded-xl p-3 sm:p-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
                <p className="text-white/70 text-[10px] sm:text-xs mb-1" style={{ fontFamily: POPPINS }}>{label}</p>
                {/* Mobile: stacked; Desktop: single line */}
                <p className="font-semibold text-sm sm:text-base leading-tight block sm:hidden" style={{ color: PINK, fontFamily: POPPINS }}>
                  {fmtRupee(Number(min))}
                </p>
                <p className="text-sm font-semibold leading-tight block sm:hidden" style={{ color: PINK, fontFamily: POPPINS }}>– {fmtRupee(Number(max))}</p>
                <p className="font-semibold text-base leading-tight hidden sm:block whitespace-nowrap" style={{ color: PINK, fontFamily: POPPINS }}>
                  {fmtRupee(Number(min))} – {fmtRupee(Number(max))}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 7: FUN QUESTIONS ── */}
        <div className="mt-4">
          {accessToken && <FunQuestionsSection token={accessToken} onToast={msg => setToast(msg)} />}
        </div>

        {/* ── SECTION 8: YOUR PHOTOS ── */}
        {Array.isArray(creator.images) && creator.images.length > 0 && (
          <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/75 text-xs sm:text-sm font-semibold uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Your Photos</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {creator.images.map((img: string, i: number) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                  <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION 9: BRAND REVIEWS ── */}
        {reviews.length > 0 && (
          <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-white/75 text-xs sm:text-sm font-semibold uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Brand Reviews</p>
            </div>
            <div className="flex items-center gap-1.5 mb-4">
              {[1,2,3,4,5].map(n => (
                <svg key={n} width="15" height="15" viewBox="0 0 24 24" fill={parseFloat(creator.averageRating ?? "0") >= n ? PINK : "rgba(255,255,255,0.18)"}>
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                </svg>
              ))}
              <span className="text-white font-bold text-sm sm:text-base ml-1" style={{ fontFamily: POPPINS }}>{parseFloat(creator.averageRating ?? "0").toFixed(1)}/5</span>
              <span className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>({reviews.length})</span>
            </div>
            <div className="space-y-3">
              {reviews.map(r => (
                <div key={r.id} className="rounded-2xl p-4" style={{ background: "rgba(225,79,105,0.18)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <div className="flex items-center gap-3 mb-2.5">
                    {/* Brand avatar — larger, more prominent */}
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-base sm:text-lg font-bold flex-shrink-0"
                      style={{ background: PINK, color: "white", fontFamily: POPPINS }}>
                      {r.brandName?.[0]?.toUpperCase() ?? "B"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-bold" style={{ color: PINK, fontFamily: POPPINS }}>{r.brandName}</p>
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {[1,2,3,4,5].map(n => (
                          <svg key={n} width="11" height="11" viewBox="0 0 24 24" fill={r.rating >= n ? PINK : "rgba(255,255,255,0.70)"}>
                            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                          </svg>
                        ))}
                      </div>
                    </div>
                    <span className="text-white/70 text-[10px] flex-shrink-0" style={{ fontFamily: POPPINS }}>
                      {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  {r.reviewText && (
                    <p className="text-white/90 text-xs sm:text-sm leading-relaxed" style={{ fontFamily: POPPINS }}>{r.reviewText}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION 10: KYC ── */}
        <div id="kyc" className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/75 text-xs sm:text-sm font-semibold uppercase tracking-widest" style={{ fontFamily: POPPINS }}>KYC Update</p>
            <span className="text-xs sm:text-sm px-2.5 py-1 rounded-lg font-semibold"
              style={{
                background: creator.kycStatus === "VERIFIED" ? "rgba(34,197,94,0.15)" : creator.kycStatus === "SUBMITTED" ? "rgba(59,130,246,0.15)" : creator.kycStatus === "REJECTED" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                color: creator.kycStatus === "VERIFIED" ? "#4ade80" : creator.kycStatus === "SUBMITTED" ? "#60a5fa" : creator.kycStatus === "REJECTED" ? "#f87171" : "#fbbf24",
                fontFamily: POPPINS,
              }}>
              {creator.kycStatus === "VERIFIED" ? "Verified" : creator.kycStatus === "SUBMITTED" ? "Under Review" : creator.kycStatus === "REJECTED" ? "Rejected" : "Not Submitted"}
            </span>
          </div>
          {creator.kycStatus === "REJECTED" && creator.kycRejectionReason && (
            <p className="text-red-400/80 text-xs sm:text-sm mb-3 leading-relaxed" style={{ fontFamily: POPPINS }}>Reason: {creator.kycRejectionReason}</p>
          )}
          {creator.kycStatus !== "VERIFIED" && creator.kycStatus !== "SUBMITTED" && (
            <button onClick={openKycModal}
              className="w-full py-3.5 rounded-xl text-sm sm:text-base font-semibold text-white flex items-center justify-center gap-3"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.16)", fontFamily: POPPINS }}>
              {creator.kycStatus === "REJECTED" ? "Resubmit KYC Documents" : "Submit KYC Documents"}
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Account info + logout */}
        <div className="mx-4 lg:mx-0 rounded-2xl p-4" style={S}>
          <p className="text-white/75 text-xs sm:text-sm font-semibold mb-3 uppercase tracking-widest" style={{ fontFamily: POPPINS }}>Account</p>
          <div className="space-y-2.5 text-xs sm:text-sm">
            {creator.youtubeHandle && (
              <div className="flex items-center justify-between">
                <span className="text-white/70" style={{ fontFamily: POPPINS }}>YouTube</span>
                <span className="text-white/75" style={{ fontFamily: POPPINS }}>{creator.youtubeHandle}</span>
              </div>
            )}
            {creator.otherSocialHandle && (
              <div className="flex items-center justify-between">
                <span className="text-white/70" style={{ fontFamily: POPPINS }}>Other Social</span>
                <span className="text-white/75" style={{ fontFamily: POPPINS }}>{creator.otherSocialHandle}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-white/70" style={{ fontFamily: POPPINS }}>Member since</span>
              <span className="text-white/75" style={{ fontFamily: POPPINS }}>{new Date(creator.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
            </div>
          </div>
        </div>

        <div className="mx-4 lg:mx-0">
          <button onClick={() => setShowLogout(true)}
            className="w-full py-3 rounded-2xl text-sm sm:text-base font-semibold flex items-center justify-center gap-2"
            style={{ border: "1px solid rgba(239,68,68,0.35)", color: "#f87171", fontFamily: POPPINS }}>
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      {/* Overlays */}
      {editMode && (
        <EditOverlay token={accessToken!} creator={creator} initialCats={categories} initialPortfolio={portfolio} allCategories={allCategories} signupConfig={signupConfig} onClose={() => setEditMode(false)} onSaved={loadProfile} onToast={msg => setToast(msg)} scrollTo={initialSection} />
      )}

      {kycModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}
          onClick={e => { if (e.target === e.currentTarget) setKycModalOpen(false); }}>
          <div className="w-full max-w-sm rounded-2xl p-5 overflow-y-auto" style={{ background: "#111118", border: "1px solid rgba(240,24,122,0.25)", maxHeight: "88vh" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-base" style={{ fontFamily: POPPINS }}>
                {creator.kycStatus === "REJECTED" ? "Resubmit KYC" : "KYC Verification"}
              </h3>
              <button onClick={() => setKycModalOpen(false)}><X className="w-5 h-5 text-white/70" /></button>
            </div>

            {kycLoadingFields ? (
              <div className="py-8 flex items-center justify-center">
                <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: PINK, borderTopColor: "transparent" }} />
              </div>
            ) : kycFields.length === 0 ? (
              <p className="text-white/70 text-sm text-center py-6" style={{ fontFamily: POPPINS }}>No KYC fields have been configured yet.</p>
            ) : (
              <div className="space-y-3 mb-4">
                <p className="text-white/70 text-xs leading-relaxed mb-3" style={{ fontFamily: POPPINS }}>
                  Fill in all required fields below. This will be verified by our team during deal time.
                </p>
                {kycFields.map(f => {
                  const fieldErr = (kycFieldTouched[f.id] || kycSubmitAttempted) ? kycFieldErrors[f.id] : "";
                  const fileNote = kycFileNotes[f.id];
                  const borderColor = fieldErr ? "rgba(240,24,122,0.6)" : "rgba(255,255,255,0.12)";
                  return (
                  <div key={f.id}>
                    <label className="block text-white/80 text-xs mb-1" style={{ fontFamily: POPPINS }}>
                      {f.label}{f.isRequired ? <span style={{ color: PINK }}> *</span> : " (optional)"}
                    </label>
                    {f.fieldType === "FILE" ? (
                      <div>
                        <label htmlFor={`kyc-file-${f.id}`}
                          className="flex items-center gap-2 w-full rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-colors"
                          style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${kycFieldValues[f.id] ? PINK + "60" : "rgba(255,255,255,0.12)"}`, fontFamily: POPPINS, color: kycFieldValues[f.id] ? "#4ade80" : "rgba(255,255,255,0.70)" }}>
                          {kycFileUploading[f.id] ? (
                            <span>Processing…</span>
                          ) : kycFieldValues[f.id] ? (
                            <><span style={{ color: "#4ade80" }}>✓</span><span>File selected — tap to change</span></>
                          ) : (
                            <><span>📎</span><span>Tap to upload photo / PDF</span></>
                          )}
                        </label>
                        <input id={`kyc-file-${f.id}`} type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => handleKycFileChange(f.id, e.target.files?.[0])} />
                        {kycFieldValues[f.id] && !/\.pdf(\?|$)/i.test(kycFieldValues[f.id]) && (
                          <img src={kycFieldValues[f.id]} alt="preview" className="mt-2 max-h-28 rounded-lg object-cover w-full" style={{ border: "1px solid rgba(255,255,255,0.12)" }} />
                        )}
                        {kycFieldValues[f.id] && /\.pdf(\?|$)/i.test(kycFieldValues[f.id]) && (
                          <p className="text-xs mt-1.5" style={{ color: "#4ade80", fontFamily: POPPINS }}>PDF selected</p>
                        )}
                        {fileNote?.msg && (
                          <p className="text-xs mt-1" style={{ color: fileNote.ok ? "#4ade80" : "#F0187A", fontFamily: POPPINS }}>{fileNote.msg}</p>
                        )}
                      </div>
                    ) : f.fieldType === "textarea" ? (
                      <>
                        <textarea rows={3} value={kycFieldValues[f.id] ?? ""}
                          onChange={e => setKycFieldValues(v => ({ ...v, [f.id]: e.target.value }))}
                          onBlur={() => {
                            setKycFieldTouched(v => ({ ...v, [f.id]: true }));
                            const err = validateKycFieldValue(f.label, kycFieldValues[f.id] ?? "");
                            setKycFieldErrors(v => ({ ...v, [f.id]: err }));
                          }}
                          className="w-full rounded-xl px-3 py-2.5 text-white text-sm outline-none resize-none"
                          style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${borderColor}`, fontFamily: POPPINS }} />
                        {fieldErr && <p className="mt-1 text-[11px]" style={{ color: "#F0187A", fontFamily: POPPINS }}>{fieldErr}</p>}
                      </>
                    ) : f.fieldType === "date" ? (
                      <>
                        <input type="date"
                          value={kycFieldValues[f.id] ?? ""}
                          max={new Date().toISOString().split("T")[0]}
                          min={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 100); return d.toISOString().split("T")[0]; })()}
                          onChange={e => {
                            setKycFieldValues(v => ({ ...v, [f.id]: e.target.value }));
                            if (kycFieldTouched[f.id]) {
                              const err = validateKycFieldValue(f.label, e.target.value);
                              setKycFieldErrors(v => ({ ...v, [f.id]: err }));
                            }
                          }}
                          onBlur={() => {
                            setKycFieldTouched(v => ({ ...v, [f.id]: true }));
                            const err = validateKycFieldValue(f.label, kycFieldValues[f.id] ?? "");
                            setKycFieldErrors(v => ({ ...v, [f.id]: err }));
                          }}
                          className="w-full rounded-xl px-3 py-2.5 text-white text-sm outline-none"
                          style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${borderColor}`, fontFamily: POPPINS, colorScheme: "dark" }} />
                        {fieldErr && <p className="mt-1 text-[11px]" style={{ color: "#F0187A", fontFamily: POPPINS }}>{fieldErr}</p>}
                      </>
                    ) : (
                      <>
                        <input
                          type={f.fieldType === "number" ? "number" : "text"}
                          value={kycFieldValues[f.id] ?? ""}
                          onChange={e => {
                            const formatted = formatKycInput(f.label, e.target.value);
                            setKycFieldValues(v => ({ ...v, [f.id]: formatted }));
                            if (kycFieldTouched[f.id]) {
                              const err = validateKycFieldValue(f.label, formatted);
                              setKycFieldErrors(v => ({ ...v, [f.id]: err }));
                            }
                          }}
                          onBlur={() => {
                            setKycFieldTouched(v => ({ ...v, [f.id]: true }));
                            const err = validateKycFieldValue(f.label, kycFieldValues[f.id] ?? "");
                            setKycFieldErrors(v => ({ ...v, [f.id]: err }));
                          }}
                          className="w-full rounded-xl px-3 py-2.5 text-white text-sm outline-none"
                          style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${borderColor}`, fontFamily: POPPINS }} />
                        {fieldErr && <p className="mt-1 text-[11px]" style={{ color: "#F0187A", fontFamily: POPPINS }}>{fieldErr}</p>}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {kycSubmitError && (
              <p className="text-red-400 text-xs mb-3" style={{ fontFamily: POPPINS }}>{kycSubmitError}</p>
            )}

            {!kycLoadingFields && (
              <div className="flex gap-3">
                <button onClick={() => setKycModalOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm" style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>Cancel</button>
                <button onClick={submitKyc} disabled={kycSubmitting || kycFields.length === 0} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: PINK, fontFamily: POPPINS }}>
                  {kycSubmitting ? "Submitting…" : "Submit KYC"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <h3 className="text-white font-semibold mb-2" style={{ fontFamily: POPPINS }}>Log out?</h3>
            <p className="text-white/75 text-sm mb-5" style={{ fontFamily: POPPINS }}>You'll need to log back in to access your creator account.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogout(false)} className="flex-1 py-2.5 rounded-xl border text-sm" style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>Cancel</button>
              <button onClick={() => { clearAuth(); navigate("/"); }} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: "#ef4444", fontFamily: POPPINS }}>Log Out</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </CreatorLayout>
  );
}
