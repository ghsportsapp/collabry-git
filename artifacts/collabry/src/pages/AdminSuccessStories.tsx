import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Film, Image as ImageIcon, X } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { prepareImageAnyRatio } from "@/lib/bannerImage";
import { validateVideoFile, uploadVideoViaPresign } from "@/lib/bannerVideo";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // mirrors the server presign cap
const inputClass = "w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/50 placeholder:text-white/40";

interface Detail { label: string; answer: string }
interface Story {
  id: string; position: number;
  videoUrl: string | null; posterUrl: string | null;
  details: Detail[]; isPublished: boolean;
}
interface Stats { brands: string; creators: string; collabs: string; totalViews: string }

export default function AdminSuccessStories() {
  const { adminFetch, adminId } = useAdminAuth();
  const [, navigate] = useLocation();

  const [stories, setStories] = useState<Story[]>([]);
  const [stats, setStats] = useState<Stats>({ brands: "", creators: "", collabs: "", totalViews: "" });
  const [loading, setLoading] = useState(true);
  const [savingStats, setSavingStats] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, str] = await Promise.all([
        adminFetch("/api/admin/success-stories"),
        adminFetch("/api/admin/success-stats"),
      ]);
      if (sr.ok) { const d = await sr.json(); setStories(d.stories ?? []); }
      if (str.ok) setStats(await str.json());
    } catch { /* surfaced via empty state */ }
    finally { setLoading(false); }
  }, [adminFetch]);

  useEffect(() => { if (adminId) load(); }, [adminId, load]);

  const saveStats = async () => {
    setSavingStats(true);
    try {
      const r = await adminFetch("/api/admin/success-stats", { method: "PATCH", body: JSON.stringify(stats) });
      showToast(r.ok ? "Stats saved" : "Failed to save stats", r.ok);
    } catch { showToast("Failed to save stats", false); }
    finally { setSavingStats(false); }
  };

  const addStory = async () => {
    try {
      const r = await adminFetch("/api/admin/success-stories", { method: "POST", body: JSON.stringify({ details: [], isPublished: false }) });
      if (r.ok) { await load(); showToast("Story added — upload a video & fill in the details"); }
      else showToast("Failed to add story", false);
    } catch { showToast("Failed to add story", false); }
  };

  const deleteStory = async (id: string) => {
    if (!confirm("Delete this story? Its video and poster will be removed from storage.")) return;
    try {
      const r = await adminFetch(`/api/admin/success-stories/${id}`, { method: "DELETE" });
      if (r.ok) { setStories(prev => prev.filter(s => s.id !== id)); showToast("Story deleted"); }
      else showToast("Failed to delete", false);
    } catch { showToast("Failed to delete", false); }
  };

  const reorder = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stories.length) return;
    const next = [...stories];
    [next[index], next[target]] = [next[target], next[index]];
    setStories(next); // optimistic
    try {
      const r = await adminFetch("/api/admin/success-stories/reorder", { method: "POST", body: JSON.stringify({ ids: next.map(s => s.id) }) });
      if (!r.ok) { await load(); showToast("Failed to reorder", false); }
    } catch { await load(); showToast("Failed to reorder", false); }
  };

  const patchStory = async (id: string, body: Partial<Pick<Story, "videoUrl" | "posterUrl" | "details" | "isPublished">>) => {
    const r = await adminFetch(`/api/admin/success-stories/${id}`, { method: "PUT", body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? "Save failed"); }
    const d = await r.json();
    setStories(prev => prev.map(s => s.id === id ? d.story : s));
  };

  if (!adminId) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      <div className="max-w-4xl mx-auto px-5 py-8">
        <button onClick={() => navigate("/admin-collabryangad")} className="flex items-center gap-1.5 text-white/70 text-xs mb-5 hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </button>
        <h1 className="text-2xl font-bold text-white mb-1">Success Stories</h1>
        <p className="text-white/60 text-sm mb-7">Manage the public showcase: upload reels, write details, set the order, and edit the headline stats.</p>

        {/* ── Stats ── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-7">
          <h2 className="text-white font-semibold mb-4">Headline Stats (free text)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ["brands", "Brands"], ["creators", "Creators"],
              ["collabs", "Collabs"], ["totalViews", "Total Views"],
            ] as Array<[keyof Stats, string]>).map(([key, label]) => (
              <div key={key}>
                <label className="block text-white/80 text-xs mb-1.5">{label}</label>
                <input className={inputClass} value={stats[key]} placeholder={`e.g. 500+`}
                  onChange={e => setStats(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <button onClick={saveStats} disabled={savingStats}
            className="mt-4 px-5 py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50" style={{ background: PINK }}>
            {savingStats ? "Saving…" : "Save Stats"}
          </button>
        </div>

        {/* ── Stories ── */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">Stories ({stories.length})</h2>
          <button onClick={addStory} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold" style={{ background: PINK }}>
            <Plus className="w-4 h-4" /> Add Story
          </button>
        </div>

        {loading ? (
          <p className="text-white/50 text-sm py-8 text-center">Loading…</p>
        ) : stories.length === 0 ? (
          <div className="rounded-2xl p-10 text-center bg-white/[0.03] border border-white/10">
            <p className="text-white/70 text-sm">No stories yet. Click “Add Story” to create the first one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {stories.map((s, i) => (
              <StoryCard
                key={s.id}
                story={s}
                index={i}
                total={stories.length}
                adminFetch={adminFetch}
                onPatch={patchStory}
                onDelete={() => deleteStory(s.id)}
                onReorder={reorder}
                onError={(m) => showToast(m, false)}
              />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full text-sm text-white shadow-lg"
          style={{ background: toast.ok ? "#16a34a" : "#dc2626" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StoryCard({ story, index, total, adminFetch, onPatch, onDelete, onReorder, onError }: {
  story: Story;
  index: number;
  total: number;
  adminFetch: (path: string, options?: RequestInit) => Promise<Response>;
  onPatch: (id: string, body: Partial<Pick<Story, "videoUrl" | "posterUrl" | "details" | "isPublished">>) => Promise<void>;
  onDelete: () => void;
  onReorder: (index: number, dir: -1 | 1) => void;
  onError: (msg: string) => void;
}) {
  const [details, setDetails] = useState<Detail[]>(story.details ?? []);
  const [savingDetails, setSavingDetails] = useState(false);
  const [videoPct, setVideoPct] = useState<number | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);

  const onVideoPick = async (file: File) => {
    const err = validateVideoFile(file, MAX_VIDEO_BYTES);
    if (err) { onError(err); return; }
    setVideoPct(0);
    try {
      const { videoUrl } = await uploadVideoViaPresign({
        file,
        presignPath: "/api/admin/success-stories/video-url",
        fetcher: adminFetch,
        onProgress: (p) => setVideoPct(p),
      });
      await onPatch(story.id, { videoUrl }); // persists + purges the old object
    } catch (e: any) { onError(e?.message ?? "Video upload failed"); }
    finally { setVideoPct(null); }
  };

  const onPosterPick = async (file: File) => {
    setPosterBusy(true);
    try {
      const prepared = await prepareImageAnyRatio(file);
      if ("error" in prepared) { onError(prepared.error); return; }
      const fd = new FormData();
      fd.append("file", prepared.blob, "poster.webp");
      const r = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: fd });
      if (!r.ok) { onError("Poster upload failed"); return; }
      const j = (await r.json()) as { objectPath?: string };
      if (!j.objectPath) { onError("Poster upload failed"); return; }
      await onPatch(story.id, { posterUrl: j.objectPath });
    } catch (e: any) { onError(e?.message ?? "Poster upload failed"); }
    finally { setPosterBusy(false); }
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    try { await onPatch(story.id, { details }); } catch (e: any) { onError(e?.message ?? "Save failed"); }
    finally { setSavingDetails(false); }
  };

  const togglePublish = async () => {
    try { await onPatch(story.id, { isPublished: !story.isPublished }); } catch (e: any) { onError(e?.message ?? "Save failed"); }
  };

  return (
    <div className="rounded-2xl p-5 bg-white/[0.04] border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-xs">#{index + 1}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${story.isPublished ? "text-green-300" : "text-white/60"}`}
            style={{ background: story.isPublished ? "rgba(22,163,74,0.15)" : "rgba(255,255,255,0.08)" }}>
            {story.isPublished ? "Published" : "Draft"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onReorder(index, -1)} disabled={index === 0} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-white/10" title="Move up"><ArrowUp className="w-4 h-4 text-white/80" /></button>
          <button onClick={() => onReorder(index, 1)} disabled={index === total - 1} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-white/10" title="Move down"><ArrowDown className="w-4 h-4 text-white/80" /></button>
          <button onClick={togglePublish} className="ml-1 px-3 py-1.5 rounded-full text-xs font-semibold text-white" style={{ background: story.isPublished ? "rgba(255,255,255,0.12)" : PINK }}>
            {story.isPublished ? "Unpublish" : "Publish"}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/15" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Video */}
        <div>
          <label className="flex items-center gap-1.5 text-white/80 text-xs mb-1.5"><Film className="w-3.5 h-3.5" /> Video (vertical 9:16)</label>
          {story.videoUrl ? (
            <video src={story.videoUrl} className="w-full rounded-lg mb-2 bg-black" style={{ maxHeight: 220, aspectRatio: "9 / 16", objectFit: "cover" }} muted playsInline controls />
          ) : (
            <div className="rounded-lg mb-2 flex items-center justify-center text-white/30 text-xs" style={{ aspectRatio: "9 / 16", maxHeight: 220, background: "rgba(255,255,255,0.05)" }}>No video</div>
          )}
          <label className="inline-block text-xs cursor-pointer hover:opacity-80" style={{ color: PINK }}>
            {videoPct !== null ? `Uploading… ${videoPct}%` : story.videoUrl ? "Replace video" : "Upload video"}
            <input type="file" accept="video/mp4" className="hidden" disabled={videoPct !== null}
              onChange={e => { const f = e.target.files?.[0]; if (f) onVideoPick(f); e.target.value = ""; }} />
          </label>
          {videoPct !== null && (
            <div className="h-1.5 rounded-full bg-white/10 mt-1.5 overflow-hidden"><div className="h-full" style={{ width: `${videoPct}%`, background: PINK }} /></div>
          )}
          <p className="text-white/40 text-[10px] mt-1">MP4, H.264 only · max 100 MB</p>
        </div>

        {/* Poster */}
        <div>
          <label className="flex items-center gap-1.5 text-white/80 text-xs mb-1.5"><ImageIcon className="w-3.5 h-3.5" /> Poster (shown while the video loads)</label>
          {story.posterUrl ? (
            <img src={story.posterUrl} alt="" className="w-full rounded-lg mb-2" style={{ maxHeight: 220, aspectRatio: "9 / 16", objectFit: "cover" }} />
          ) : (
            <div className="rounded-lg mb-2 flex items-center justify-center text-white/30 text-xs" style={{ aspectRatio: "9 / 16", maxHeight: 220, background: "rgba(255,255,255,0.05)" }}>No poster</div>
          )}
          <label className="inline-block text-xs cursor-pointer hover:opacity-80" style={{ color: PINK }}>
            {posterBusy ? "Uploading…" : story.posterUrl ? "Replace poster" : "Upload poster"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={posterBusy}
              onChange={e => { const f = e.target.files?.[0]; if (f) onPosterPick(f); e.target.value = ""; }} />
          </label>
          <p className="text-white/40 text-[10px] mt-1">Any ratio · auto-compressed</p>
        </div>
      </div>

      {/* Details */}
      <div className="mb-3">
        <label className="block text-white/80 text-xs mb-2">Details (label → answer)</label>
        <div className="space-y-2">
          {details.map((d, di) => (
            <div key={di} className="flex items-center gap-2">
              <input className={inputClass + " flex-1"} placeholder="Label (e.g. Creator)" value={d.label}
                onChange={e => setDetails(prev => prev.map((x, j) => j === di ? { ...x, label: e.target.value } : x))} />
              <input className={inputClass + " flex-1"} placeholder="Answer (e.g. @riya)" value={d.answer}
                onChange={e => setDetails(prev => prev.map((x, j) => j === di ? { ...x, answer: e.target.value } : x))} />
              <button onClick={() => setDetails(prev => prev.filter((_, j) => j !== di))} className="p-1.5 rounded-lg hover:bg-white/10" title="Remove row"><X className="w-4 h-4 text-white/60" /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setDetails(prev => [...prev, { label: "", answer: "" }])} className="mt-2 flex items-center gap-1 text-xs hover:opacity-80" style={{ color: PINK }}>
          <Plus className="w-3.5 h-3.5" /> Add row
        </button>
      </div>

      <button onClick={saveDetails} disabled={savingDetails} className="px-4 py-2 rounded-full text-white text-xs font-semibold disabled:opacity-50" style={{ background: PINK }}>
        {savingDetails ? "Saving…" : "Save Details"}
      </button>
    </div>
  );
}
