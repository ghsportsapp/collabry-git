import { useState, useEffect, useCallback } from "react";
import { useServerTime } from "@/hooks/useServerTime";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Star, Clock, Package, Pause, Play, Trash2, AlertTriangle,
  X as XIcon, ChevronDown, ChevronUp, Lock, Sparkles, Users,
  Eye, Hourglass, BadgeCheck,
} from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { BrandLayout, POPPINS, PINK } from "@/components/BrandLayout";
import UnlockCelebration from "@/components/UnlockCelebration";

const TABS = ["Applications", "Shortlisted", "Selected"];
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  LIVE:             { color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  HIDDEN:           { color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  PAUSED:           { color: "#60A5FA", bg: "rgba(96,165,250,0.15)" },
  PENDING_APPROVAL: { color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  CREDIT_HOLD:      { color: "#F97316", bg: "rgba(249,115,22,0.15)" },
  REJECTED:         { color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  EXPIRED:          { color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" },
  DELETED:          { color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
};

function fmtK(n: number) {
  return n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n ?? 0);
}

function StatBadge({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-2.5 rounded-xl flex-1" style={{ background: "rgba(240,24,122,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
      <span className="font-bold text-sm" style={{ fontFamily: POPPINS, color: color ?? "#fff" }}>{value}</span>
      <span className="text-white/70 text-xs mt-0.5" style={{ fontFamily: POPPINS }}>{label}</span>
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────

function DeleteConfirmModal({ campaignName, onClose, onConfirm }: { campaignName: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md rounded-2xl p-5" style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-sm">Delete Campaign?</h3>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>
        <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
            <div>
              <p className="text-red-300 text-xs font-semibold mb-1">This action cannot be undone</p>
              <p className="text-white/80 text-xs leading-relaxed">"{campaignName}" will be permanently removed from creator discovery.</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-white/90 text-xs font-semibold" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>Cancel</button>
          <button disabled={submitting}
            onClick={async () => { setSubmitting(true); try { await onConfirm(); } finally { setSubmitting(false); } }}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold"
            style={{ background: submitting ? "rgba(239,68,68,0.5)" : "#EF4444" }}>
            {submitting ? "Deleting…" : "Delete Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectConfirmModal({ app, onClose, onConfirm, slotsFull }: { app: any; onClose: () => void; onConfirm: () => Promise<void>; slotsFull?: boolean }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md rounded-2xl p-5" style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.10)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-sm">Select @{app.instagramHandle}?</h3>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-white/80" /></button>
        </div>
        {slotsFull && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)" }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
              <p className="text-red-300 text-xs leading-relaxed font-semibold">
                All slots for this campaign are filled. You cannot select more creators.
              </p>
            </div>
          </div>
        )}
        <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
            <p className="text-white/90 text-xs leading-relaxed">
              Once selected, the creator has 48 hours to confirm. If they don't respond, the slot reopens.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-white/90 text-xs font-semibold" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>Cancel</button>
          <button disabled={submitting || slotsFull}
            onClick={async () => { setSubmitting(true); try { await onConfirm(); } finally { setSubmitting(false); } }}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold"
            style={{ background: submitting || slotsFull ? "rgba(16,185,129,0.35)" : "#10B981", cursor: slotsFull ? "not-allowed" : undefined }}>
            {submitting ? "Selecting…" : "Confirm Select"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrandBarterDetail() {
  const { serverNow } = useServerTime();
  const { brandId, apiFetch, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState(0);
  const [barter, setBarter] = useState<any>(null);
  const [apps, setApps] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" }>({ text: "", type: "success" });
  const [celeb, setCeleb] = useState<{ show: boolean; username: string | null; fullName: string | null }>({ show: false, username: null, fullName: null });
  const [selectCeleb, setSelectCeleb] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmApp, setConfirmApp] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<"pause" | "resume" | null>(null);

  useEffect(() => {
    if (!authLoading && !brandId) navigate("/login-brand");
  }, [brandId, authLoading]);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/brand/barter/${id}`);
    if (r.ok) setBarter(await r.json());
    else setError("Campaign not found");
  }, [id, apiFetch]);

  const loadApps = useCallback(async () => {
    const statuses = ["PENDING", "SHORTLISTED", "SELECTED"];
    const r = await apiFetch(`/api/brand/barter/${id}/applications?status=${statuses[tab]}`);
    if (r.ok) setApps(await r.json());
    else setApps([]);
  }, [id, tab, apiFetch]);

  useEffect(() => { if (brandId) load(); }, [load, brandId]);
  useEffect(() => {
    if (brandId) { setApps(null); loadApps(); }
  }, [loadApps, brandId, tab]);

  const flash = (text: string, type: "success" | "error" = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "success" }), 3500);
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const handleShortlist = async (appId: string) => {
    const r = await apiFetch(`/api/brand/barter/${id}/applications/${appId}/shortlist`, { method: "POST" });
    if (r.ok) { flash("Creator shortlisted!"); loadApps(); setTimeout(() => setTab(1), 800); }
    else { const d = await r.json(); flash(d.error ?? "Failed", "error"); }
  };

  const handleUnlock = async (appId: string) => {
    const r = await apiFetch(`/api/brand/barter/${id}/applications/${appId}/unlock`, { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      setCeleb({ show: true, username: d.instagramHandle ?? null, fullName: d.fullName ?? null });
      setTimeout(() => setCeleb(s => ({ ...s, show: false })), 1800);
      loadApps();
    } else {
      const d = await r.json().catch(() => ({}));
      flash(d.message ?? d.error ?? "Failed to unlock", "error");
    }
  };

  const handleSelect = async (appId: string) => {
    const r = await apiFetch(`/api/brand/barter/${id}/applications/${appId}/select`, { method: "POST" });
    if (r.ok) {
      setSelectCeleb(true);
      setConfirmApp(null); loadApps(); load();
    } else { const d = await r.json(); flash(d.error ?? "Failed", "error"); }
  };

  const handlePause = async () => {
    setActionLoading("pause");
    const r = await apiFetch(`/api/brand/barter/${id}/pause`, { method: "PATCH" });
    setActionLoading(null);
    if (r.ok) { flash("Campaign paused. Creators can no longer see it."); load(); }
    else { const d = await r.json().catch(() => ({})); flash(d.error ?? "Failed to pause", "error"); }
  };

  const handleResume = async () => {
    setActionLoading("resume");
    const r = await apiFetch(`/api/brand/barter/${id}/resume`, { method: "PATCH" });
    setActionLoading(null);
    if (r.ok) { flash("Campaign resumed! Creators can now discover and apply."); load(); }
    else { const d = await r.json().catch(() => ({})); flash(d.error ?? "Failed to resume", "error"); }
  };

  const handleDelete = async () => {
    const r = await apiFetch(`/api/brand/barter/${id}`, { method: "DELETE" });
    if (r.ok) { navigate("/home-brand/campaigns"); }
    else { const d = await r.json().catch(() => ({})); flash(d.error ?? "Failed to delete", "error"); setShowDelete(false); }
  };

  if (authLoading || !brandId) return null;

  const isExpired = barter?.expiresAt ? new Date(barter.expiresAt) <= new Date() : false;
  const daysLeft = barter?.expiresAt ? Math.max(0, Math.ceil((new Date(barter.expiresAt).getTime() - Date.now()) / 86400000)) : null;
  const statusInfo = STATUS_COLORS[barter?.status] ?? { color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" };
  const canPause = ["LIVE", "HIDDEN"].includes(barter?.status) && !isExpired;
  const canResume = barter?.status === "PAUSED" && !isExpired;
  const canDelete = barter?.status !== "DELETED";
  const showTabs = ["LIVE", "HIDDEN", "PAUSED"].includes(barter?.status);

  return (
    <BrandLayout>
      <UnlockCelebration show={celeb.show} username={celeb.username} fullName={celeb.fullName} />

      {selectCeleb && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px", background: "rgba(0,0,0,0.6)" }}>
          <div style={{ background: "#16161E", border: "1px solid rgba(240,24,122,0.25)", borderRadius: 20, padding: "32px 28px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 0 60px rgba(240,24,122,0.15)" }}>
            <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 14 }}>🎉</div>
            <p style={{ color: "white", fontFamily: POPPINS, fontWeight: 700, fontSize: 20, margin: 0 }}>Creator Selected!</p>
            <p style={{ color: "rgba(255,255,255,0.8)", fontFamily: POPPINS, fontSize: 14, margin: "10px 0 24px", lineHeight: 1.6 }}>
              You've selected this creator for the barter.<br />Waiting for their confirmation (48h window).
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setSelectCeleb(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.90)", fontFamily: POPPINS, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                View Campaign
              </button>
              <button onClick={() => { setSelectCeleb(false); setTab(2); }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: PINK, color: "white", fontFamily: POPPINS, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Go to Selected
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 pt-5 pb-28">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate("/home-brand/campaigns")}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.07)" }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-bold text-base truncate" style={{ fontFamily: POPPINS }}>{barter?.name ?? "Barter Campaign"}</h1>
            <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>Barter Campaign</p>
          </div>
          {barter && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
              style={{ color: statusInfo.color, background: statusInfo.bg, fontFamily: POPPINS }}>
              {barter.status === "LIVE" ? "Active" : barter.status === "HIDDEN" ? "Full" : barter.status === "PAUSED" ? "Paused" : barter.status.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {/* Flash */}
        {msg.text && (
          <div className="rounded-xl p-3 mb-4" style={{ background: msg.type === "error" ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${msg.type === "error" ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}` }}>
            <p className="text-xs" style={{ color: msg.type === "error" ? "#F87171" : "#34D399", fontFamily: POPPINS }}>{msg.text}</p>
          </div>
        )}
        {error && <p className="text-red-400 text-xs mb-4" style={{ fontFamily: POPPINS }}>{error}</p>}

        {barter && (
          <>
            {/* Stat row */}
            <div className="flex gap-2 mb-4">
              <StatBadge label="Slots" value={`${barter.slotsFilled ?? 0}/${barter.slotCount}`} />
              <StatBadge label="Product Value" value={`₹${parseFloat(barter.productValueInr ?? 0).toLocaleString("en-IN")}`} color={PINK} />
              <StatBadge label="Expires in" value={daysLeft !== null ? `${daysLeft}d` : "—"} color={daysLeft !== null && daysLeft <= 3 ? "#F59E0B" : undefined} />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {canPause && (
                <button onClick={handlePause} disabled={actionLoading === "pause"}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(96,165,250,0.15)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.3)", fontFamily: POPPINS }}>
                  <Pause className="w-3 h-3" />
                  {actionLoading === "pause" ? "Pausing…" : "Pause Campaign"}
                </button>
              )}
              {canResume && (
                <button onClick={handleResume} disabled={actionLoading === "resume"}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)", fontFamily: POPPINS }}>
                  <Play className="w-3 h-3" />
                  {actionLoading === "resume" ? "Resuming…" : "Resume Campaign"}
                </button>
              )}
              {barter?.status === "PAUSED" && isExpired && (
                <p className="text-xs text-white/70 self-center" style={{ fontFamily: POPPINS }}>Campaign expired — cannot be resumed</p>
              )}
              {canDelete && (
                <button onClick={() => setShowDelete(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold ml-auto"
                  style={{ background: "rgba(239,68,68,0.10)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)", fontFamily: POPPINS }}>
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </div>

            {/* Status banners */}
            {barter.status === "PENDING_APPROVAL" && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <p className="text-amber-400 text-xs" style={{ fontFamily: POPPINS }}>⏳ Your campaign is under review. We'll notify you within 48 hours.</p>
              </div>
            )}
            {barter.status === "CREDIT_HOLD" && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <p className="text-orange-400 text-xs" style={{ fontFamily: POPPINS }}>⚠ Approved! Top up credits to go live.</p>
              </div>
            )}
            {barter.status === "REJECTED" && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p className="text-red-400 text-xs font-semibold mb-0.5" style={{ fontFamily: POPPINS }}>Not Approved</p>
                {(barter.adminRejectionReason ?? barter.rejectionReason) && (
                  <p className="text-red-300 text-xs" style={{ fontFamily: POPPINS }}>{barter.adminRejectionReason ?? barter.rejectionReason}</p>
                )}
              </div>
            )}
            {barter.status === "PAUSED" && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                <p className="text-blue-300 text-xs" style={{ fontFamily: POPPINS }}>⏸ Campaign is paused — not visible to creators. {isExpired ? "This campaign has expired and cannot be resumed." : "Resume anytime before expiry."}</p>
              </div>
            )}

            {/* Campaign Details collapsible */}
            <div className="rounded-2xl mb-5 overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <button onClick={() => setDetailsOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3" style={{ fontFamily: POPPINS }}>
                <span className="text-white font-semibold text-xs">Campaign Details</span>
                {detailsOpen ? <ChevronUp className="w-4 h-4 text-white/70" /> : <ChevronDown className="w-4 h-4 text-white/70" />}
              </button>
              {detailsOpen && (
                <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="pt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>Content Type</p>
                      <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{barter.contentType}</p>
                    </div>
                    <div>
                      <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>Content Timeline</p>
                      <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{barter.timelineDays ? `${barter.timelineDays} days` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>Expires On</p>
                      <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{fmtDate(barter.expiresAt)}</p>
                    </div>
                    {barter.durationDays && (
                      <div>
                        <p className="text-white/70 text-xs mb-0.5" style={{ fontFamily: POPPINS }}>Campaign Duration</p>
                        <p className="text-white text-xs font-medium" style={{ fontFamily: POPPINS }}>{barter.durationDays} days</p>
                      </div>
                    )}
                  </div>

                  {/* Product */}
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-start gap-2 mb-2">
                      <Package className="w-3.5 h-3.5 text-white/70 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-white text-xs font-semibold break-all" style={{ fontFamily: POPPINS }}>{barter.productName}</p>
                        {barter.productDescription && <p className="text-white/70 text-xs mt-0.5 break-all" style={{ fontFamily: POPPINS }}>{barter.productDescription}</p>}
                      </div>
                    </div>
                    {barter.productPhotos?.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {barter.productPhotos.map((url: string, i: number) => (
                          <button key={i} type="button"
                            onClick={() => window.open(/^https?:\/\//i.test(url) ? url : `https://${url}`, "_blank", "noopener,noreferrer")}
                            title="Open image in new tab"
                            className="rounded-xl overflow-hidden hover:opacity-80 transition-opacity cursor-pointer flex-shrink-0"
                            style={{ width: 56, height: 56, padding: 0, border: "none", background: "none" }}>
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {barter.contentRequirements && (
                    <div>
                      <p className="text-white/70 text-xs mb-1" style={{ fontFamily: POPPINS }}>Campaign Description</p>
                      <p className="text-white/80 text-xs leading-relaxed break-words" style={{ fontFamily: POPPINS }}>{barter.contentRequirements}</p>
                    </div>
                  )}
                  {barter.script && (
                    <div>
                      <p className="text-white/70 text-xs mb-1" style={{ fontFamily: POPPINS }}>Reel Script</p>
                      <p className="text-white/80 text-xs leading-relaxed break-words whitespace-pre-wrap" style={{ fontFamily: POPPINS }}>{barter.script}</p>
                    </div>
                  )}
                  {barter.keyMessage && (
                    <div>
                      <p className="text-white/70 text-xs mb-1" style={{ fontFamily: POPPINS }}>Key Message</p>
                      <p className="text-white/80 text-xs leading-relaxed break-words" style={{ fontFamily: POPPINS }}>{barter.keyMessage}</p>
                    </div>
                  )}
                  {barter.dosAndDonts && (
                    <div>
                      <p className="text-white/70 text-xs mb-1" style={{ fontFamily: POPPINS }}>Dos & Don'ts</p>
                      <p className="text-white/80 text-xs leading-relaxed break-words whitespace-pre-wrap" style={{ fontFamily: POPPINS }}>{barter.dosAndDonts}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Applications section */}
        {showTabs && (
          <>
            {/* Tab bar */}
            <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "rgba(255,255,255,0.06)" }}>
              {TABS.map((t, i) => (
                <button key={t} onClick={() => setTab(i)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: tab === i ? PINK : "transparent", color: tab === i ? "#fff" : "rgba(255,255,255,0.7)", fontFamily: POPPINS }}>
                  {t}
                </button>
              ))}
            </div>

            {apps === null ? (
              <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />)}</div>
            ) : tab === 2 ? (
              /* Selected tab */
              apps.length === 0 ? (
                <p className="text-center text-white/70 text-xs py-10" style={{ fontFamily: POPPINS }}>No selected creators yet</p>
              ) : (
                apps.map((app: any) => {
                  const isPendingConfirm = app.status === "SELECTED" && !app.dealId;
                  const isDealLive = app.dealStatus === "IN_ESCROW" || app.status === "CONFIRMED";
                  const deadline = app.confirmationDeadline ? new Date(app.confirmationDeadline).getTime() : 0;
                  const remaining = deadline - serverNow;
                  const hours = Math.max(0, Math.floor(remaining / 3600000));
                  const mins = Math.max(0, Math.floor((remaining % 3600000) / 60000));
                  const rating = app.averageRating && parseFloat(app.averageRating) > 0 ? parseFloat(app.averageRating).toFixed(1) : null;
                  const cardBorder = isDealLive
                    ? { border: "1px solid rgba(16,185,129,0.35)", boxShadow: "0 0 20px rgba(16,185,129,0.08)" }
                    : { border: "1px solid rgba(255,255,255,0.08)" };
                  return (
                    <div key={app.id} className="rounded-2xl mb-4 overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", ...cardBorder }}>
                      {isDealLive && (
                        <div className="px-4 py-2.5 flex items-center gap-2"
                          style={{ background: "rgba(16,185,129,0.08)", borderBottom: "1px solid rgba(16,185,129,0.15)" }}>
                          <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#10B981" }} />
                          <p className="text-emerald-300 text-xs font-semibold" style={{ fontFamily: POPPINS }}>
                            Deal is live — content workflow has started
                          </p>
                        </div>
                      )}
                      <div className="p-4">
                        {/* Profile header */}
                        <div className="flex items-start gap-3 mb-3">
                          {app.profilePhotoUrl
                            ? <img src={app.profilePhotoUrl} alt="" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"
                                style={{ border: "2px solid rgba(255,255,255,0.10)" }} />
                            : <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-bold"
                                style={{ background: `rgba(240,24,122,0.25)`, color: PINK, border: `2px solid rgba(240,24,122,0.3)` }}>
                                {app.fullName?.[0] ?? "?"}
                              </div>}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <p className="text-white font-bold text-sm leading-tight" style={{ fontFamily: POPPINS }}>{app.fullName}</p>
                              {isDealLive && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                                  style={{ color: "#10B981", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", fontFamily: POPPINS }}>
                                  Live
                                </span>
                              )}
                              {isPendingConfirm && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                                  style={{ color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", fontFamily: POPPINS }}>
                                  Awaiting
                                </span>
                              )}
                            </div>
                            <p className="text-white/70 text-xs mb-2" style={{ fontFamily: POPPINS }}>@{app.instagramHandle}</p>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
                                <Users className="w-3 h-3" style={{ color: PINK }} />{fmtK(app.followerCount ?? 0)}
                              </span>
                              {rating && (
                                <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                                  style={{ background: "rgba(245,158,11,0.10)", color: "#F59E0B", fontFamily: POPPINS }}>
                                  <Star className="w-3 h-3 fill-current" />{rating}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Categories */}
                        {(app.categories ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {(app.categories as any[]).map((c: any, i: number) => (
                              <span key={i} className="px-2.5 py-0.5 rounded-full text-[11px]"
                                style={{ background: `rgba(240,24,122,0.15)`, color: PINK, border: `1px solid rgba(240,24,122,0.2)`, fontFamily: POPPINS }}>
                                {c.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Countdown */}
                        {isPendingConfirm && remaining > 0 && (
                          <div className="flex items-center gap-2 mb-3 p-3 rounded-xl"
                            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
                            <Hourglass className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
                            <p className="text-amber-300/90 text-xs" style={{ fontFamily: POPPINS }}>
                              Creator has <span className="font-bold">{hours}h {mins}m</span> left to confirm
                            </p>
                          </div>
                        )}
                        {isPendingConfirm && remaining <= 0 && deadline > 0 && (
                          <div className="flex items-center gap-2 mb-3 p-3 rounded-xl"
                            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                            <Clock className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                            <p className="text-red-300 text-xs" style={{ fontFamily: POPPINS }}>Confirmation window expired — slot will reopen shortly</p>
                          </div>
                        )}

                        {/* CTA */}
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => navigate(`/home-brand/unlocked/creator/${app.creatorId}`, { state: { campaignId: id, appId: app.id, campaignType: "barter", slotsFull: (barter.slotsFilled ?? 0) >= (barter.slotCount ?? Infinity) } })}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
                            style={{ background: "transparent", border: `1px solid rgba(240,24,122,0.6)`, color: PINK, fontFamily: POPPINS }}>
                            <Eye className="w-3.5 h-3.5" />
                            View Profile
                          </button>
                          {isDealLive && (
                            <button className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 opacity-60 cursor-default"
                              style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.25)", fontFamily: POPPINS }}>
                              <BadgeCheck className="w-3.5 h-3.5" style={{ color: "#10B981" }} />
                              <span style={{ color: "#10B981" }}>Active</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              <div>
                {apps !== null && apps.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>
                      {tab === 0 ? "No pending applications yet" : "No shortlisted creators yet"}
                    </p>
                  </div>
                ) : tab === 0 ? (
                    (apps ?? []).map((app: any) => (
                      <div key={app.id} className="rounded-2xl p-4 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        {/* Meta row — followers + rating */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2.5">
                          <div className="flex items-center gap-1">
                            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                              <Lock className="w-3 h-3 text-white/70" />
                            </div>
                            <span className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>{fmtK(app.followerCount ?? 0)} followers</span>
                          </div>
                          {app.averageRating > 0 && (
                            <span className="flex items-center gap-0.5 text-[11px]" style={{ color: "#F59E0B", fontFamily: POPPINS }}>
                              <Star className="w-3 h-3 fill-current" />{parseFloat(app.averageRating).toFixed(1)}
                            </span>
                          )}
                        </div>

                        {/* Tags — categories */}
                        {app.categories?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {app.categories.map((c: any, i: number) => (
                              <span key={i} className="px-2.5 py-0.5 rounded-full text-[11px]"
                                style={{ background: "rgba(240,24,122,0.18)", color: PINK, fontFamily: POPPINS }}>{c.name}</span>
                            ))}
                          </div>
                        )}

                        {/* Gender + age */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1">
                          {app.creatorGender && (
                            <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>
                              {app.audienceGenderFemale != null && app.audienceGenderMale != null
                                ? `${app.audienceGenderFemale}% Female ${app.audienceGenderMale}% Male`
                                : app.creatorGender}
                            </span>
                          )}
                          {app.creatorAge != null && (
                            <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>Age {app.creatorAge}</span>
                          )}
                        </div>

                        {/* Portfolio strip */}
                        {(app.portfolioImages ?? []).length > 0 && (
                          <div className="grid grid-cols-4 gap-1.5 mt-3">
                            {((app.portfolioImages ?? []) as string[]).slice(0, 4).map((src: string, i: number) => (
                              <div key={i} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                                <img src={src} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))}
                            {Array.from({ length: Math.max(0, 4 - Math.min((app.portfolioImages ?? []).length, 4)) }).map((_, i) => (
                              <div key={`ph-${i}`} className="rounded-xl" style={{ aspectRatio: "1/1", background: "rgba(255,255,255,0.04)" }} />
                            ))}
                          </div>
                        )}

                        <button onClick={() => handleShortlist(app.id)}
                          className="w-full py-2.5 rounded-xl text-white font-semibold text-xs mt-3" style={{ background: PINK, fontFamily: POPPINS }}>
                          Shortlist (Free)
                        </button>
                      </div>
                    ))
                  ) : (
                    (apps ?? []).map((app: any) => {
                      const isLocked = !app.isUnlocked;
                      const portfolioImgs = (app.portfolioImages ?? []).slice(0, 4) as string[];
                      return (
                        <div key={app.id} className="rounded-2xl p-4 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>

                          {/* Identity row — only when unlocked */}
                          {!isLocked && (
                            <div className="flex items-center gap-2.5 mb-3">
                              {app.profilePhotoUrl
                                ? <img src={app.profilePhotoUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                : <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm" style={{ background: "rgba(240,24,122,0.25)", color: PINK }}>{app.fullName?.[0] ?? "?"}</div>}
                              <div className="min-w-0">
                                <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: POPPINS }}>{app.fullName}</p>
                                <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>@{app.instagramHandle}</p>
                              </div>
                            </div>
                          )}

                          {/* Meta row — followers + rating */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2.5">
                            <div className="flex items-center gap-1">
                              {isLocked ? (
                                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                                  <Lock className="w-3 h-3 text-white/70" />
                                </div>
                              ) : app.profilePhotoUrl ? (
                                <img src={app.profilePhotoUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-[9px]" style={{ background: "rgba(240,24,122,0.3)", color: PINK }}>{app.fullName?.[0] ?? "?"}</div>
                              )}
                              <span className="text-white/80 text-xs font-semibold" style={{ fontFamily: POPPINS }}>{fmtK(app.followerCount ?? 0)} followers</span>
                            </div>
                            {app.averageRating > 0 && (
                              <span className="flex items-center gap-0.5 text-[11px]" style={{ color: "#F59E0B", fontFamily: POPPINS }}>
                                <Star className="w-3 h-3 fill-current" />{parseFloat(app.averageRating).toFixed(1)}
                              </span>
                            )}
                          </div>

                          {/* Tags — categories */}
                          {app.categories?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {app.categories.map((c: any, i: number) => (
                                <span key={i} className="px-2.5 py-0.5 rounded-full text-[11px]"
                                  style={{ background: "rgba(240,24,122,0.18)", color: PINK, fontFamily: POPPINS }}>{c.name}</span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1">
                            {app.creatorGender && (
                              <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>
                                {app.audienceGenderFemale != null && app.audienceGenderMale != null
                                  ? `${app.audienceGenderFemale}% Female ${app.audienceGenderMale}% Male`
                                  : app.creatorGender}
                              </span>
                            )}
                            {app.creatorAge != null && (
                              <span className="text-white/70 text-[11px]" style={{ fontFamily: POPPINS }}>Age {app.creatorAge}</span>
                            )}
                          </div>

                          {/* Portfolio strip */}
                          {portfolioImgs.length > 0 && (
                            <div className="grid grid-cols-4 gap-1.5 mt-3">
                              {portfolioImgs.map((src, i) => (
                                <div key={i} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                                  <img src={src} alt="" className="w-full h-full object-cover" />
                                </div>
                              ))}
                              {Array.from({ length: Math.max(0, 4 - portfolioImgs.length) }).map((_, i) => (
                                <div key={`ph-${i}`} className="rounded-xl" style={{ aspectRatio: "1/1", background: "rgba(255,255,255,0.04)" }} />
                              ))}
                            </div>
                          )}

                          {/* CTAs */}
                          <div className="flex gap-2 mt-3">
                            {isLocked ? (
                              <button onClick={() => handleUnlock(app.id)}
                                className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                                style={{ background: PINK, fontFamily: POPPINS }}>
                                <Sparkles className="w-3.5 h-3.5" />
                                Unlock Full Profile – 1 Credit
                              </button>
                            ) : (
                              <>
                                <button onClick={() => navigate(`/home-brand/unlocked/creator/${app.creatorId}`, { state: { campaignId: id, appId: app.id, campaignType: "barter", slotsFull: (barter.slotsFilled ?? 0) >= (barter.slotCount ?? Infinity) } })}
                                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                                  style={{ background: "transparent", border: `1px solid ${PINK}`, color: PINK, fontFamily: POPPINS }}>
                                  Profile Unlocked — View Full Profile
                                </button>
                                <button onClick={() => setConfirmApp(app)}
                                  className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold flex-shrink-0"
                                  style={{ background: "#10B981", fontFamily: POPPINS }}>
                                  Select
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
              </div>
            )}
          </>
        )}

        {barter && !showTabs && !["PENDING_APPROVAL", "CREDIT_HOLD"].includes(barter.status) && (
          <div className="text-center py-10">
            <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>
              {barter.status === "EXPIRED" ? "This campaign has expired." : barter.status === "REJECTED" ? "This campaign was not approved." : barter.status === "DELETED" ? "This campaign has been deleted." : ""}
            </p>
          </div>
        )}
      </div>

      {confirmApp && (
        <SelectConfirmModal app={confirmApp} onClose={() => setConfirmApp(null)} onConfirm={() => handleSelect(confirmApp.id)} slotsFull={(barter?.slotsFilled ?? 0) >= (barter?.slotCount ?? Infinity)} />
      )}
      {showDelete && (
        <DeleteConfirmModal campaignName={barter?.name ?? ""} onClose={() => setShowDelete(false)} onConfirm={handleDelete} />
      )}
    </BrandLayout>
  );
}
