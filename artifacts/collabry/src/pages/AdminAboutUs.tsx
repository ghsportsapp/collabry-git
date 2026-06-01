import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, Upload, Loader2, User, Image as ImageIcon } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const ALLOWED = ["image/jpeg", "image/jpg", "image/png"];
const TARGET_BYTES = 250 * 1024;

interface TeamMember { name: string; image: string; occupation?: string }
interface AboutUs {
  heading: string;
  content: string;
  mission: string;
  missionImage: string;
  contactEmail: string;
  contactDesc: string;
  teamDesc: string;
  team: TeamMember[];
}

async function compressImage(file: File): Promise<Blob> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target!.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = rej;
    i.src = dataUrl;
  });
  const maxDim = 1200;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.85;
  let blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), "image/jpeg", quality));
  while (blob.size > TARGET_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await new Promise(res => canvas.toBlob(b => res(b!), "image/jpeg", quality));
  }
  return blob;
}

async function uploadImage(f: File): Promise<string | null> {
  const mime = f.type.toLowerCase();
  if (!ALLOWED.includes(mime)) return null;
  try {
    const blob = await compressImage(f);
    const formData = new FormData();
    formData.append("file", new File([blob], f.name, { type: "image/jpeg" }));
    const r = await fetch(`${BASE_URL}/api/uploads/image`, {
      method: "POST",
      body: formData,
    });
    if (!r.ok) return null;
    const { objectPath } = await r.json();
    return objectPath;
  } catch { return null; }
}

function MemberRow({ idx, m, onChange, onRemove, onImageUploaded }: {
  idx: number; m: TeamMember;
  onChange: (i: number, patch: Partial<TeamMember>) => void;
  onRemove: (i: number) => void;
  onImageUploaded: (i: number, url: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (f: File | null) => {
    if (!f) return;
    setUploading(true);
    const url = await uploadImage(f);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (url) {
      onChange(idx, { image: url });
      await onImageUploaded(idx, url);
    }
  };

  return (
    <div className="rounded-xl p-4 flex items-start gap-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center mt-1"
        style={{ background: "rgba(255,255,255,0.06)", border: "1.5px dashed rgba(240,24,122,0.4)", cursor: uploading ? "wait" : "pointer" }}>
        {uploading ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: PINK }} />
          : m.image ? <img src={m.image} alt="" className="w-full h-full object-cover rounded-full" />
          : <Upload className="w-5 h-5" style={{ color: PINK }} />}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png"
        className="hidden" onChange={e => pick(e.target.files?.[0] ?? null)} />
      <div className="flex-1 flex flex-col gap-2">
        <input type="text" placeholder="Team member name" value={m.name}
          onChange={e => onChange(idx, { name: e.target.value })}
          className="w-full bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-white/40 placeholder:text-white/70" />
        <input type="text" placeholder="e.g. Co-founder, Designer..." value={m.occupation ?? ""}
          onChange={e => onChange(idx, { occupation: e.target.value })}
          className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white/80 text-xs outline-none focus:border-white/30 placeholder:text-white/40" />
      </div>
      <button type="button" onClick={() => onRemove(idx)} className="text-white/70 hover:text-red-400 transition-colors p-2 mt-1">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

const DEFAULT_DATA: AboutUs = {
  heading: "About Us",
  content: "",
  mission: "",
  missionImage: "",
  contactEmail: "support@collabry.in",
  contactDesc: "If you have any questions, partnership inquiries, or support requests, feel free to reach out to us at the email address below. Please mention whether you are contacting us as a Creator or a Brand in the subject line for faster assistance.",
  teamDesc: "A passionate team focused on redefining how modern brand collaborations work.",
  team: [],
};

export default function AdminAboutUs() {
  const { adminFetch } = useAdminAuth();
  const [data, setData] = useState<AboutUs>(DEFAULT_DATA);
  const dataRef = useRef<AboutUs>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const missionImgRef = useRef<HTMLInputElement>(null);
  const [uploadingMission, setUploadingMission] = useState(false);

  useEffect(() => { dataRef.current = data; }, [data]);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    fetch(`${BASE_URL}/api/about-us`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: Partial<AboutUs>) => { const merged = { ...DEFAULT_DATA, ...d }; setData(merged); dataRef.current = merged; setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const doSave = useCallback(async (d: AboutUs) => {
    setSaving(true);
    try {
      const r = await adminFetch(`/api/admin/about-us`, {
        method: "PATCH",
        body: JSON.stringify(d),
      });
      if (r.ok) showToast("Saved");
      else { try { const e = await r.json(); showToast(e.error ?? "Failed to save", false); } catch { showToast("Failed to save", false); } }
    } catch { showToast("Network error", false); }
    setSaving(false);
  }, [adminFetch]);

  const save = () => doSave(dataRef.current);

  const setMember = (i: number, patch: Partial<TeamMember>) =>
    setData(p => { const next = { ...p, team: p.team.map((m, j) => j === i ? { ...m, ...patch } : m) }; dataRef.current = next; return next; });
  const removeMember = (i: number) =>
    setData(p => { const next = { ...p, team: p.team.filter((_, j) => j !== i) }; dataRef.current = next; return next; });
  const addMember = () =>
    setData(p => { const next = { ...p, team: [...p.team, { name: "", image: "", occupation: "" }] }; dataRef.current = next; return next; });

  const handleMemberImageUploaded = useCallback(async (i: number, url: string) => {
    const newData = { ...dataRef.current, team: dataRef.current.team.map((m, j) => j === i ? { ...m, image: url } : m) };
    setData(newData);
    dataRef.current = newData;
    await doSave(newData);
  }, [doSave]);

  const pickMissionImage = async (f: File | null) => {
    if (!f) return;
    setUploadingMission(true);
    const url = await uploadImage(f);
    setUploadingMission(false);
    if (missionImgRef.current) missionImgRef.current.value = "";
    if (url) {
      const newData = { ...dataRef.current, missionImage: url };
      setData(newData);
      dataRef.current = newData;
      await doSave(newData);
    }
  };

  const inputClass = "w-full bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-white/40 placeholder:text-white/70";
  const textareaClass = inputClass + " resize-none";
  const labelClass = "block text-white/75 text-xs mb-1.5";
  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm text-white shadow-lg ${toast.ok ? "bg-green-700/90" : "bg-red-700/90"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-8">
        <Link href="/admin-collabryangad">
          <button className="text-white/80 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></button>
        </Link>
        <h1 className="text-white text-xl font-bold">Contact Us Editor</h1>
        <a href="/contact-us" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs hover:underline" style={{ color: PINK }}>Preview →</a>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-40 bg-white/5 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Contact Us ── */}
          <div className="rounded-2xl p-5" style={card}>
            <h2 className="text-white font-semibold text-sm mb-4">Contact Us</h2>
            <label className={labelClass}>Contact Us Description</label>
            <textarea className={textareaClass + " mb-4"} rows={4}
              placeholder="If you have any questions, partnership inquiries…"
              value={data.contactDesc}
              onChange={e => setData(p => ({ ...p, contactDesc: e.target.value }))} />
            <label className={labelClass}>Contact Email</label>
            <input className={inputClass} placeholder="support@collabry.in" type="email"
              value={data.contactEmail} onChange={e => setData(p => ({ ...p, contactEmail: e.target.value }))} />
          </div>

          {/* ── About Collabry ── */}
          <div className="rounded-2xl p-5" style={card}>
            <h2 className="text-white font-semibold text-sm mb-4">About Collabry</h2>
            <label className={labelClass}>Heading</label>
            <input className={inputClass + " mb-4"} placeholder="About Us"
              value={data.heading} onChange={e => setData(p => ({ ...p, heading: e.target.value }))} />
            <label className={labelClass}>About Paragraph</label>
            <textarea className={textareaClass} rows={6} placeholder="Tell the world about Collabry…"
              value={data.content} onChange={e => setData(p => ({ ...p, content: e.target.value }))} />
          </div>

          {/* ── Our Mission ── */}
          <div className="rounded-2xl p-5" style={card}>
            <h2 className="text-white font-semibold text-sm mb-4">Our Mission</h2>
            <label className={labelClass}>Mission Paragraph</label>
            <textarea className={textareaClass + " mb-4"} rows={5} placeholder="Describe the mission…"
              value={data.mission} onChange={e => setData(p => ({ ...p, mission: e.target.value }))} />

            <label className={labelClass}>Mission Image <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>(JPG / PNG)</span></label>
            <div className="flex items-start gap-4">
              {data.missionImage ? (
                <div className="relative flex-shrink-0">
                  <img src={data.missionImage} alt="" className="w-32 h-24 object-cover rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.10)" }} />
                  <button onClick={() => setData(p => ({ ...p, missionImage: "" }))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                    style={{ background: "#ef4444", color: "white" }}>×</button>
                </div>
              ) : null}
              <button type="button" disabled={uploadingMission} onClick={() => missionImgRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px dashed rgba(255,255,255,0.70)", color: "rgba(255,255,255,0.85)" }}>
                {uploadingMission ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                {uploadingMission ? "Uploading & Saving…" : data.missionImage ? "Change Image" : "Upload Image"}
              </button>
              <input ref={missionImgRef} type="file" accept="image/jpeg,image/jpg,image/png"
                className="hidden" onChange={e => pickMissionImage(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          {/* ── The Collabry Team ── */}
          <div className="rounded-2xl p-5" style={card}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-semibold text-sm flex items-center gap-2"><User className="w-4 h-4" /> The Collabry Team</h2>
                <p className="text-white/70 text-[11px] mt-1">{data.team.length} member{data.team.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            <label className={labelClass}>Team Short Description</label>
            <input className={inputClass + " mb-4"} placeholder="A passionate team focused on…"
              value={data.teamDesc} onChange={e => setData(p => ({ ...p, teamDesc: e.target.value }))} />

            <label className={labelClass}>Team Members <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>(photos save automatically on upload)</span></label>
            <div className="space-y-3">
              {data.team.map((m, i) => (
                <MemberRow key={i} idx={i} m={m} onChange={setMember} onRemove={removeMember} onImageUploaded={handleMemberImageUploaded} />
              ))}
              <button onClick={addMember}
                className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 text-white/70 text-sm hover:border-white/30 hover:text-white/80 transition-all flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Team Member
              </button>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end pb-8">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50 transition-all"
              style={{ background: PINK }}>
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
