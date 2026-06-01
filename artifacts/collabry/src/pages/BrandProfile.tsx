import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Upload } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useToast } from "@/hooks/use-toast";
import { BrandLayout } from "@/components/BrandLayout";
import { CustomSelect } from "@/components/ui/CustomSelect";

const POPPINS = "'Poppins', sans-serif";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const viewClass  = "w-full bg-white/[0.04] border border-white/10 rounded-lg px-4 py-3 text-white text-sm outline-none placeholder:text-white/70 transition-all cursor-default";
const editClass  = "w-full bg-transparent border border-[#E14F69] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-white focus:shadow-[0_0_0_2px_rgba(255,255,255,0.15)] placeholder:text-white/70 transition-all";
const labelClass = "block text-white text-sm font-medium mb-1.5";
const inlineErrStyle: React.CSSProperties = { color: "#E14F69", fontFamily: POPPINS, fontSize: 11, marginTop: 4 };

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 800;
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = Math.round((h / w) * MAX_DIM); w = MAX_DIM; }
          else { w = Math.round((w / h) * MAX_DIM); h = MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const MAX_BYTES = 100 * 1024;
        let quality = 0.85;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (quality > 0.5) {
          const b64 = dataUrl.substring(dataUrl.indexOf(",") + 1);
          if (Math.ceil(b64.length * 0.75) <= MAX_BYTES) break;
          quality = Math.round((quality - 0.05) * 100) / 100;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BrandProfile() {
  const { brandId, clearAuth, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [brand, setBrand] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ brandName: "", contactName: "", websiteUrl: "", categoryId: "", subcategoryId: "", instagramHandle: "", bio: "", logoUrl: "", currentPassword: "", newPassword: "", confirmNewPassword: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const pwSectionRef = useRef<HTMLDivElement>(null);

  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  const [nameError, setNameError] = useState<string | null>(null);
  const [igError, setIgError] = useState<string | null>(null);
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!authLoading && !brandId) { navigate("/login-brand"); }
  }, [authLoading, brandId]);

  useEffect(() => {
    if (!brandId) return;
    Promise.all([
      apiFetch("/api/brand/profile").then(r => r.json()),
      fetch(`${BASE_URL}/api/categories`).then(r => r.json()),
    ]).then(([profileData, cats]) => {
      const b = profileData.brand;
      setBrand(b);
      setCategories(cats);
      setCustomFields(profileData.customFields ?? []);
      const cvMap: Record<string, string> = {};
      (profileData.customFields ?? []).forEach((f: any) => { cvMap[f.id] = f.value ?? ""; });
      setCustomValues(cvMap);
      setForm({
        brandName: b.brandName ?? "",
        contactName: b.contactName ?? "",
        websiteUrl: b.websiteUrl ?? "",
        categoryId: b.categoryId ?? "",
        subcategoryId: b.subcategoryId ?? "",
        instagramHandle: b.instagramHandle ?? "",
        bio: b.bio ?? "",
        logoUrl: b.logoUrl ?? "",
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [brandId]);

  const subcategories = categories.find((c: any) => c.id === form.categoryId)?.subcategories ?? [];

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editing) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setForm(prev => ({ ...prev, logoUrl: dataUrl }));
    } catch {
      toast({ title: "Upload failed", description: "Could not process image", variant: "destructive" });
    }
  };

  const scrollToPwSection = () => setTimeout(() => pwSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

  const checkBrandNameValue = async (name: string): Promise<string | null> => {
    const newN = name.trim();
    const origN = (brand?.brandName ?? "").trim();
    if (!newN || newN.toLowerCase() === origN.toLowerCase()) return null;
    const r = await fetch(`${BASE_URL}/api/brands/check-name?name=${encodeURIComponent(newN)}`);
    const d = await r.json();
    return d.available ? null : "This brand name is already taken.";
  };

  const checkIgHandleValue = async (handle: string): Promise<string | null> => {
    const newH = handle.trim().replace(/^@/, "").toLowerCase();
    const origH = (brand?.instagramHandle ?? "").trim().replace(/^@/, "").toLowerCase();
    if (!newH || newH === origH) return null;
    const r = await fetch(`${BASE_URL}/api/creators/check-handle?handle=${encodeURIComponent(newH)}`);
    const d = await r.json();
    return d.available ? null : "This Instagram handle is already in use by another account.";
  };

  const checkPhoneFieldValue = async (fieldId: string, raw: string): Promise<string | null> => {
    const phone = raw.replace(/\D/g, "");
    const origField = customFields.find((f: any) => f.id === fieldId);
    const origPhone = (origField?.value ?? "").replace(/\D/g, "");
    if (!phone || phone === origPhone) return null;
    if (!/^\d{10}$/.test(phone)) return "Phone number must be exactly 10 digits.";
    const r = await fetch(`${BASE_URL}/api/brands/check-phone?phone=${encodeURIComponent(phone)}`);
    const d = await r.json();
    return d.available ? null : "This phone number is already linked to another account.";
  };

  const handleSave = async () => {
    setPwError(null);

    const newNameError = await checkBrandNameValue(form.brandName);
    setNameError(newNameError);

    const newIgError = await checkIgHandleValue(form.instagramHandle);
    setIgError(newIgError);

    const newPhoneErrors: Record<string, string | null> = {};
    for (const f of customFields) {
      if (f.fieldType === "tel") {
        newPhoneErrors[f.id] = await checkPhoneFieldValue(f.id, customValues[f.id] ?? "");
      }
    }
    setPhoneErrors(newPhoneErrors);

    if (newNameError || newIgError || Object.values(newPhoneErrors).some(e => e != null)) return;

    const changingPassword = !!(form.currentPassword || form.newPassword || form.confirmNewPassword);
    if (changingPassword) {
      if (!form.currentPassword) { setPwError("Current password is required"); scrollToPwSection(); return; }
      if (!form.newPassword) { setPwError("New password is required"); scrollToPwSection(); return; }
      if (form.newPassword.length < 8) { setPwError("Password must be at least 8 characters"); scrollToPwSection(); return; }
      if (form.newPassword === form.currentPassword) { setPwError("New password must be different from current password"); scrollToPwSection(); return; }
      if (form.newPassword !== form.confirmNewPassword) { setPwError("Passwords don't match"); scrollToPwSection(); return; }
    }
    setSaving(true);
    try {
      const body: any = { brandName: form.brandName, contactName: form.contactName, websiteUrl: form.websiteUrl, categoryId: form.categoryId, subcategoryId: form.subcategoryId, instagramHandle: form.instagramHandle, bio: form.bio, logoUrl: form.logoUrl, customFields: customValues };
      if (changingPassword) { body.currentPassword = form.currentPassword; body.newPassword = form.newPassword; }
      const r = await apiFetch("/api/brand/profile", { method: "PATCH", body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) {
        if (changingPassword) { setPwError(data.error ?? "Failed to update password"); scrollToPwSection(); }
        else { toast({ title: "Error", description: data.error, variant: "destructive" }); }
        return;
      }
      if (changingPassword) {
        toast({ title: "Password Updated", description: "Your password was changed successfully." });
      } else {
        toast({ title: "Profile updated successfully" });
      }
      setForm(prev => ({ ...prev, currentPassword: "", newPassword: "", confirmNewPassword: "" }));
      setEditing(false);
    } catch { toast({ title: "Error", description: "Failed to save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleLogout = async () => {
    await apiFetch("/api/auth/brand/logout", { method: "POST" }).catch(() => {});
    clearAuth();
    navigate("/login-brand");
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0F" }}><div className="w-8 h-8 border-2 border-[#E14F69] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <BrandLayout credits={brand?.creditBalance ?? null}>
      <main className="max-w-2xl lg:max-w-6xl mx-auto px-6 lg:px-6 py-10 lg:py-6" style={{ fontFamily: POPPINS }}>

        {/* Action button row — completely outside any form */}
        <div className="flex justify-end mb-6">
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-5 py-2 rounded-full text-white text-sm font-semibold"
              style={{ background: "#E14F69" }}>
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setForm({
                    brandName: brand?.brandName ?? "",
                    contactName: brand?.contactName ?? "",
                    websiteUrl: brand?.websiteUrl ?? "",
                    categoryId: brand?.categoryId ?? "",
                    subcategoryId: brand?.subcategoryId ?? "",
                    instagramHandle: brand?.instagramHandle ?? "",
                    bio: brand?.bio ?? "",
                    logoUrl: brand?.logoUrl ?? "",
                    currentPassword: "",
                    newPassword: "",
                    confirmNewPassword: "",
                  });
                  const cvMap: Record<string, string> = {};
                  customFields.forEach((f: any) => { cvMap[f.id] = f.value ?? ""; });
                  setCustomValues(cvMap);
                  setNameError(null);
                  setIgError(null);
                  setPhoneErrors({});
                  setPwError(null);
                  setEditing(false);
                }}
                className="px-5 py-2 rounded-full text-white/90 text-sm font-semibold border border-white/20">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-full text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: "#E14F69" }}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>

        {/* All fields are plain divs — no form wrapper */}
        <div className="space-y-5">
          <div className="flex items-center gap-4 mb-2">
            {form.logoUrl ? (
              <div className="w-20 h-20 rounded-2xl overflow-hidden border border-white/20 flex-shrink-0">
                <img src={form.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-2xl border border-dashed border-white/30 flex items-center justify-center flex-shrink-0">
                <Upload className="w-6 h-6 text-white/70" />
              </div>
            )}
            <div>
              <label className={`text-sm ${editing ? "cursor-pointer text-[#E14F69] hover:underline" : "cursor-not-allowed text-white/70"}`}>
                Change Logo
                <input type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={handleLogoUpload} disabled={!editing} />
              </label>
              {editing && <p className="text-white/70 text-xs mt-1">JPG/PNG</p>}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Brand Name</label>
              <input
                className={editing ? editClass : viewClass}
                value={form.brandName}
                onChange={e => { setNameError(null); setForm(p => ({ ...p, brandName: e.target.value })); }}
                onBlur={async () => { const err = await checkBrandNameValue(form.brandName); setNameError(err); }}
                disabled={!editing}
              />
              {editing && nameError && <p style={inlineErrStyle}>{nameError}</p>}
            </div>
            <div>
              <label className={labelClass}>Contact Person</label>
              <input className={editing ? editClass : viewClass} value={form.contactName} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} disabled={!editing} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Email <span className="text-white/70 text-xs">(cannot change)</span></label>
            <input className={viewClass + " opacity-60 cursor-not-allowed"} value={brand?.email ?? ""} readOnly />
          </div>

          <div>
            <label className={labelClass}>Website URL</label>
            <input className={editing ? editClass : viewClass} placeholder="https://..." value={form.websiteUrl} onChange={e => setForm(p => ({ ...p, websiteUrl: e.target.value }))} disabled={!editing} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Brand Category</label>
              {editing ? (
                <CustomSelect
                  options={categories.map((c: any) => ({ value: c.id, label: c.name }))}
                  value={form.categoryId}
                  onChange={v => setForm(p => ({ ...p, categoryId: v, subcategoryId: "" }))}
                  placeholder="Select category"
                />
              ) : (
                <div className={viewClass}>
                  {categories.find((c: any) => c.id === form.categoryId)?.name ?? <span className="text-white/40">—</span>}
                </div>
              )}
            </div>
            {subcategories.length > 0 && (
              <div>
                <label className={labelClass}>Sub-category</label>
                {editing ? (
                  <CustomSelect
                    options={subcategories.map((s: any) => ({ value: s.id, label: s.name }))}
                    value={form.subcategoryId}
                    onChange={v => setForm(p => ({ ...p, subcategoryId: v }))}
                    placeholder="Select sub-category"
                  />
                ) : (
                  <div className={viewClass}>
                    {subcategories.find((s: any) => s.id === form.subcategoryId)?.name ?? <span className="text-white/40">—</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Brand Instagram Handle</label>
            <input
              className={editing ? editClass : viewClass}
              placeholder="@handle"
              value={form.instagramHandle}
              onChange={e => { setIgError(null); setForm(p => ({ ...p, instagramHandle: e.target.value })); }}
              onBlur={async () => { const err = await checkIgHandleValue(form.instagramHandle); setIgError(err); }}
              disabled={!editing}
            />
            {editing && igError && <p style={inlineErrStyle}>{igError}</p>}
          </div>

          <div>
            <label className={labelClass}>Bio <span className="text-white/70 text-xs">{form.bio.length}/150</span></label>
            <textarea className={(editing ? editClass : viewClass) + " resize-none"} rows={3} maxLength={150} placeholder="Tell us about your brand..." value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} disabled={!editing} />
          </div>

          {customFields.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-white/10">
              <h3 className="text-white/80 text-xs uppercase tracking-wider">Additional Info</h3>
              {customFields.map((f: any) => (
                <div key={f.id}>
                  <label className={labelClass}>{f.label}{f.isRequired && <span className="text-[#E14F69]"> *</span>}</label>
                  <input
                    className={editing ? editClass : viewClass}
                    value={customValues[f.id] ?? ""}
                    onChange={e => {
                      if (f.fieldType === "tel") setPhoneErrors(p => ({ ...p, [f.id]: null }));
                      setCustomValues(p => ({ ...p, [f.id]: e.target.value }));
                    }}
                    onBlur={f.fieldType === "tel" ? async () => {
                      const err = await checkPhoneFieldValue(f.id, customValues[f.id] ?? "");
                      setPhoneErrors(p => ({ ...p, [f.id]: err }));
                    } : undefined}
                    disabled={!editing}
                  />
                  {editing && f.fieldType === "tel" && phoneErrors[f.id] && (
                    <p style={inlineErrStyle}>{phoneErrors[f.id]}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {editing && (
            <div ref={pwSectionRef} className="space-y-3 pt-4 border-t border-white/10">
              <h3 className="text-white font-semibold text-sm">Change Password <span className="text-white/70 text-xs font-normal">(optional)</span></h3>
              <div className="relative">
                <input
                  className={editClass} type={showPwCurrent ? "text" : "password"} placeholder="Current password"
                  value={form.currentPassword}
                  onChange={e => { setPwError(null); setForm(p => ({ ...p, currentPassword: e.target.value })); }} />
                <button type="button" onClick={() => setShowPwCurrent(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs"
                  style={{ fontFamily: POPPINS }}>{showPwCurrent ? "Hide" : "Show"}</button>
              </div>
              <div className="relative">
                <input
                  className={editClass} type={showPwNew ? "text" : "password"} placeholder="New password (min 8 chars)"
                  value={form.newPassword}
                  onChange={e => { setPwError(null); setForm(p => ({ ...p, newPassword: e.target.value })); }} />
                <button type="button" onClick={() => setShowPwNew(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs"
                  style={{ fontFamily: POPPINS }}>{showPwNew ? "Hide" : "Show"}</button>
              </div>
              <div className="relative">
                <input
                  className={editClass} type={showPwConfirm ? "text" : "password"} placeholder="Confirm new password"
                  value={form.confirmNewPassword}
                  onChange={e => { setPwError(null); setForm(p => ({ ...p, confirmNewPassword: e.target.value })); }} />
                <button type="button" onClick={() => setShowPwConfirm(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs"
                  style={{ fontFamily: POPPINS }}>{showPwConfirm ? "Hide" : "Show"}</button>
              </div>
              {pwError && (
                <p className="text-sm font-medium" style={{ color: "#f87171", fontFamily: "'Poppins', sans-serif" }}>{pwError}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 p-5 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h3 className="text-white font-semibold text-sm mb-3">Credits</h3>
          <div className="text-2xl font-bold text-[#E14F69] mb-1">{brand?.creditBalance ?? 0} credits</div>
          {brand?.freeCreditsExpiry && (
            <p className="text-white/70 text-xs">Free credits expire on {new Date(brand.freeCreditsExpiry).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
          )}
        </div>
      </main>
    </BrandLayout>
  );
}
