import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Upload, Trash2, Loader2, Image, RefreshCw,
  Save, AlertCircle, Youtube, ExternalLink, X,
} from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

const PAGES = [
  { key: "home", label: "Home Landing Page", route: "/" },
  { key: "brand", label: "Brand Landing Page", route: "/brand" },
  { key: "creator", label: "Creator Landing Page", route: "/creator" },
] as const;

interface VideoRecord {
  page: string;
  youtubeUrl: string | null;
  videoId: string | null;
  thumbnailPath: string | null;
  updatedAt: string | null;
}

interface Staged {
  youtubeUrl?: string | null;
  thumbnailPath?: string | null;
}

function extractYoutubeId(url: string): string | null {
  const pattern =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const m = url.trim().match(pattern);
  return m ? m[1] : null;
}

function ytThumb(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

function ytEmbed(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
}

async function requestUploadUrl(
  name: string,
  size: number,
  contentType: string
): Promise<{ uploadURL: string; objectPath: string } | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/storage/uploads/request-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, size, contentType }),
    });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

async function uploadFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

function hasUnsaved(saved: VideoRecord | null, staged: Staged): boolean {
  if ("youtubeUrl" in staged) {
    const normalized = staged.youtubeUrl?.trim() || null;
    if (normalized !== (saved?.youtubeUrl ?? null)) return true;
  }
  if ("thumbnailPath" in staged) {
    if (staged.thumbnailPath !== (saved?.thumbnailPath ?? null)) return true;
  }
  return false;
}

function VideoCard({ pageInfo }: { pageInfo: (typeof PAGES)[number] }) {
  const { accessToken: token } = useAdminAuth();
  const [saved, setSaved] = useState<VideoRecord | null>(null);
  const [staged, setStaged] = useState<Staged>({});
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbProgress, setThumbProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);

  const unsaved = hasUnsaved(saved, staged);

  const effectiveVideoId: string | null = (() => {
    if ("youtubeUrl" in staged) {
      return staged.youtubeUrl ? extractYoutubeId(staged.youtubeUrl) : null;
    }
    return saved?.videoId ?? null;
  })();

  const effectiveThumb: string | null =
    "thumbnailPath" in staged ? staged.thumbnailPath ?? null : saved?.thumbnailPath ?? null;

  const previewThumb = effectiveThumb ?? (effectiveVideoId ? ytThumb(effectiveVideoId) : null);

  const fetchRecord = async () => {
    try {
      const r = await fetch(`${BASE_URL}/api/landing-videos/${pageInfo.key}`);
      if (r.ok) {
        const rec: VideoRecord = await r.json();
        setSaved(rec);
        setUrlInput(rec.youtubeUrl ?? "");
      } else {
        setSaved(null);
        setUrlInput("");
      }
    } catch {
      setSaved(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRecord(); }, [pageInfo.key]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    setUrlError(null);
    if (val.trim() === "") {
      setStaged((prev) => ({ ...prev, youtubeUrl: null }));
      return;
    }
    const id = extractYoutubeId(val);
    if (!id) {
      setUrlError("Invalid YouTube URL. Paste a youtube.com or youtu.be link.");
      return;
    }
    setStaged((prev) => ({ ...prev, youtubeUrl: val.trim() }));
  };

  const handleClearUrl = () => {
    setUrlInput("");
    setUrlError(null);
    setStaged((prev) => ({ ...prev, youtubeUrl: null }));
  };

  const handleSave = async () => {
    if (!unsaved) return;
    if (urlInput.trim() && !extractYoutubeId(urlInput)) {
      setUrlError("Fix the YouTube URL before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch: Staged = {};
      if ("youtubeUrl" in staged) patch.youtubeUrl = staged.youtubeUrl?.trim() || null;
      if ("thumbnailPath" in staged) patch.thumbnailPath = staged.thumbnailPath;

      const r = await fetch(`${BASE_URL}/api/landing-videos/${pageInfo.key}`, {
        method: "PUT",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as any).error ?? "Save failed");
      }
      const updated: VideoRecord = await r.json();
      setSaved(updated);
      setUrlInput(updated.youtubeUrl ?? "");
      setStaged({});
      showSuccess("Changes saved successfully.");
    } catch (e: any) {
      setError(e.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setStaged({});
    setUrlInput(saved?.youtubeUrl ?? "");
    setUrlError(null);
    setError(null);
  };

  const handleRemoveVideo = async () => {
    if (!confirm("Remove the YouTube video for this page?")) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${BASE_URL}/api/landing-videos/${pageInfo.key}/video`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!r.ok) throw new Error("Remove failed");
      await fetchRecord();
      setStaged({});
      showSuccess("Video removed.");
    } catch (e: any) {
      setError(e.message ?? "Remove failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleThumbUpload = async (file: File) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are supported.");
      return;
    }
    setError(null);
    setThumbUploading(true);
    setThumbProgress(0);
    try {
      const urls = await requestUploadUrl(file.name, file.size, file.type);
      if (!urls) throw new Error("Failed to get upload URL");
      const ok = await uploadFileWithProgress(urls.uploadURL, file, file.type, setThumbProgress);
      if (!ok) throw new Error("Upload failed");
      setStaged((prev) => ({ ...prev, thumbnailPath: `${BASE_URL}${urls.objectPath}` }));
    } catch (e: any) {
      setError(e.message ?? "Upload failed.");
    } finally {
      setThumbUploading(false);
      setThumbProgress(0);
      if (thumbFileRef.current) thumbFileRef.current.value = "";
    }
  };

  const handleDeleteThumb = async () => {
    if (!saved?.thumbnailPath) return;
    if (!confirm("Delete the custom thumbnail?")) return;
    try {
      const r = await fetch(`${BASE_URL}/api/landing-videos/${pageInfo.key}/thumbnail`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!r.ok) throw new Error("Delete failed");
      await fetchRecord();
      setStaged((prev) => { const n = { ...prev }; delete n.thumbnailPath; return n; });
      showSuccess("Custom thumbnail removed.");
    } catch (e: any) {
      setError(e.message ?? "Delete failed.");
    }
  };

  const thumbIsStaged = "thumbnailPath" in staged && staged.thumbnailPath !== (saved?.thumbnailPath ?? null);
  const urlIsStaged = "youtubeUrl" in staged;

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "#111118",
        border: `1px solid ${unsaved ? "rgba(225,79,105,0.35)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      {/* ── CARD HEADER ── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-white font-semibold text-base" style={{ fontFamily: POPPINS }}>
            {pageInfo.label}
          </h2>
          <a
            href={pageInfo.route}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs mt-0.5 inline-flex items-center gap-1 hover:underline"
            style={{ color: PINK }}
          >
            View page <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
        <button
          type="button"
          onClick={fetchRecord}
          title="Refresh"
          className="text-white/70 hover:text-white/80 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── ALERTS ── */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-400" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}>
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-white/70 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── YOUTUBE URL ── */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${urlIsStaged ? "rgba(225,79,105,0.25)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Youtube className="w-4 h-4" style={{ color: PINK }} />
                <span className="text-white/90 text-sm font-medium">YouTube Video</span>
                {urlIsStaged && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(225,79,105,0.15)", color: PINK, border: "1px solid rgba(225,79,105,0.25)" }}>
                    Unsaved
                  </span>
                )}
              </div>
              {saved?.videoId && (
                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 pr-8"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${urlError ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`,
                  outline: "none",
                  fontFamily: POPPINS,
                }}
              />
              {urlInput && (
                <button
                  type="button"
                  onClick={handleClearUrl}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/70 hover:text-white/80 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {urlError && <p className="text-xs text-red-400">{urlError}</p>}
            <p className="text-white/70 text-xs">Supports youtube.com/watch, youtu.be, and YouTube Shorts URLs.</p>

            {/* ── EMBED PREVIEW ── */}
            {effectiveVideoId && (
              <div
                className="relative w-full overflow-hidden rounded-lg"
                style={{ aspectRatio: "16/9", background: "#0d0d14" }}
              >
                <iframe
                  src={ytEmbed(effectiveVideoId)}
                  title="Preview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                  style={{ border: "none" }}
                  loading="lazy"
                />
              </div>
            )}
          </div>

          {/* ── CUSTOM THUMBNAIL (OPTIONAL) ── */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${thumbIsStaged ? "rgba(225,79,105,0.25)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4" style={{ color: PINK }} />
                <span className="text-white/90 text-sm font-medium">Custom Thumbnail</span>
                <span className="text-[10px] text-white/70 font-medium">Optional</span>
                {thumbIsStaged && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(225,79,105,0.15)", color: PINK, border: "1px solid rgba(225,79,105,0.25)" }}>
                    Unsaved
                  </span>
                )}
              </div>
              {saved?.thumbnailPath && (
                <button
                  type="button"
                  onClick={handleDeleteThumb}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </div>

            {previewThumb && effectiveVideoId ? (
              <div className="space-y-2">
                <img
                  src={previewThumb}
                  alt="Thumbnail preview"
                  className="w-full rounded-lg object-cover"
                  style={{ maxHeight: 140 }}
                />
                {effectiveThumb ? (
                  <button
                    type="button"
                    onClick={() => thumbFileRef.current?.click()}
                    disabled={thumbUploading}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white/80 hover:text-white transition-colors disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {thumbUploading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {thumbProgress > 0 ? `${thumbProgress}%` : "Uploading…"}</>
                    ) : (
                      <><RefreshCw className="w-3.5 h-3.5" /> Replace Custom Thumbnail</>
                    )}
                  </button>
                ) : (
                  <p className="text-white/70 text-xs text-center">Using YouTube auto-thumbnail. Upload a custom one below.</p>
                )}
              </div>
            ) : (
              <div
                className="w-full rounded-lg flex flex-col items-center justify-center gap-2 py-6"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}
              >
                <Image className="w-7 h-7 text-white/70" />
                <span className="text-white/70 text-xs">No custom thumbnail</span>
                <span className="text-white/70 text-[10px]">YouTube's thumbnail is used automatically when a video is set.</span>
              </div>
            )}

            {(!effectiveThumb || thumbUploading) && (
              <button
                type="button"
                onClick={() => thumbFileRef.current?.click()}
                disabled={thumbUploading}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white/90 hover:text-white transition-colors disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {thumbUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {thumbProgress > 0 ? `Uploading ${thumbProgress}%` : "Uploading…"}</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload Custom Thumbnail</>
                )}
              </button>
            )}

            {thumbUploading && thumbProgress > 0 && (
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-200" style={{ width: `${thumbProgress}%`, background: PINK }} />
              </div>
            )}
          </div>

          {/* ── SAVE / DISCARD BAR ── */}
          {unsaved && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "rgba(225,79,105,0.07)", border: "1px solid rgba(225,79,105,0.22)" }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: PINK }} />
              <span className="flex-1 text-xs text-white/80">Unsaved changes — click Save to publish.</span>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving}
                className="text-xs text-white/70 hover:text-white/90 transition-colors disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !!urlError}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-60"
                style={{ background: PINK }}
              >
                {saving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="w-3.5 h-3.5" /> Save Changes</>
                )}
              </button>
            </div>
          )}

          {saved?.updatedAt && !unsaved && (
            <p className="text-white/70 text-xs">
              Last saved: {new Date(saved.updatedAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
      )}

      <input
        ref={thumbFileRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleThumbUpload(f); }}
      />
    </div>
  );
}

function DealTutorialCard() {
  const { adminFetch } = useAdminAuth();
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch(`${BASE_URL}/api/admin/deal-tutorial-video`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setSaved(d.url ?? ""); setUrlInput(d.url ?? ""); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminFetch]);

  const effectiveVideoId = (() => {
    const url = urlInput.trim();
    return url ? extractYoutubeId(url) : null;
  })();

  const handleSave = async () => {
    if (urlInput.trim() && !extractYoutubeId(urlInput)) {
      setUrlError("Invalid YouTube URL."); return;
    }
    setSaving(true); setError(null);
    try {
      const r = await adminFetch(`${BASE_URL}/api/admin/deal-tutorial-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Save failed");
      setSaved(urlInput.trim());
      setSuccess("Deal tutorial video saved.");
      setTimeout(() => setSuccess(null), 3500);
    } catch (e: any) {
      setError(e.message ?? "Save failed.");
    } finally { setSaving(false); }
  };

  const unsaved = urlInput.trim() !== saved;

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "#111118", border: `1px solid ${unsaved ? "rgba(225,79,105,0.35)" : "rgba(255,255,255,0.08)"}` }}
    >
      <div className="mb-5">
        <h2 className="text-white font-semibold text-base" style={{ fontFamily: POPPINS }}>Deal Flow Tutorial Video</h2>
        <p className="text-white/70 text-xs mt-0.5">Shown to brands on the Deals page in a collapsible "See how it works" section.</p>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-400" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}>{success}</div>}

      {loading ? (
        <div className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4" style={{ color: PINK }} />
              <span className="text-white/90 text-sm font-medium">YouTube URL</span>
            </div>
            <div className="relative">
              <input
                type="url"
                value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setUrlError(null); }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 pr-8"
                style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${urlError ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`, outline: "none", fontFamily: POPPINS }}
              />
              {urlInput && (
                <button type="button" onClick={() => { setUrlInput(""); setUrlError(null); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/70 hover:text-white/80 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {urlError && <p className="text-xs text-red-400">{urlError}</p>}
            {effectiveVideoId && (
              <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: "16/9", background: "#0d0d14" }}>
                <iframe
                  src={ytEmbed(effectiveVideoId)}
                  title="Preview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen className="w-full h-full" style={{ border: "none" }} loading="lazy"
                />
              </div>
            )}
          </div>

          {unsaved && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(225,79,105,0.07)", border: "1px solid rgba(225,79,105,0.22)" }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: PINK }} />
              <span className="flex-1 text-xs text-white/80">Unsaved changes</span>
              <button type="button" onClick={() => setUrlInput(saved)} disabled={saving} className="text-xs text-white/70 hover:text-white/90 transition-colors disabled:opacity-50">Discard</button>
              <button type="button" onClick={handleSave} disabled={saving || !!urlError}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                style={{ background: PINK }}>
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminLandingVideos() {
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header
        className="sticky top-0 z-50 backdrop-blur-md border-b"
        style={{ background: "rgba(10,10,15,0.95)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/admin-collabryangad">
            <button type="button" className="text-white/70 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-white font-semibold text-base" style={{ fontFamily: POPPINS }}>
              Videos
            </h1>
            <p className="text-white/70 text-xs">Manage YouTube videos for landing pages and other sections</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div
          className="mb-8 px-5 py-4 rounded-xl text-sm text-white/70"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          Paste a YouTube link for each page. The video section appears below the comparison table. Uploading is not required — YouTube handles streaming automatically. Click <strong className="text-white/90">Save Changes</strong> to publish.
        </div>

        <div className="grid gap-6">
          {PAGES.map((p) => (
            <VideoCard key={p.key} pageInfo={p} />
          ))}
          <DealTutorialCard />
        </div>
      </main>
    </div>
  );
}
