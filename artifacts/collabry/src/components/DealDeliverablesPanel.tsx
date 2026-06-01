import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerTime, fmtCountdown } from "@/hooks/useServerTime";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

interface Deliverable {
  id: string;
  type: "REEL" | "STORY" | "POST";
  slotLabel: string;
  conceptUrl: string | null;
  conceptStatus: "PENDING" | "SUBMITTED" | "APPROVED" | "REVISION_REQUESTED";
  conceptRevisionCount: number;
  conceptRevisionReason: string | null;
  conceptRevisionBrief: string | null;
  finalUrl: string | null;
  finalStatus: "PENDING" | "SUBMITTED" | "APPROVED" | "REVISION_REQUESTED";
  finalRevisionCount: number;
  finalRevisionReason: string | null;
  finalRevisionBrief: string | null;
  livePostUrl: string | null;
  livePostFlagged: boolean;
  livePostResubmissionCount: number;
  livePostAdminOverride: boolean;
  storyAutoConfirmed: boolean;
  livePostConfirmedByBrand: boolean;
}

interface Submission {
  id: string;
  deliverableId: string;
  stage: "CONCEPT" | "FINAL";
  version: number;
  url: string;
  submittedBy: string;
  submittedAt: string;
  outcome: "PENDING" | "APPROVED" | "REVISION_REQUESTED" | "SUPERSEDED";
  reviewedAt: string | null;
  reviewedBy: "BRAND" | "AUTO" | null;
  revisionReason: string | null;
  revisionBrief: string | null;
}

interface PanelData {
  dealStatus: string;
  postedBy: "CREATOR" | "BRAND" | "BOTH";
  productRequired: boolean;
  productShippedAt: string | null;
  productReceivedAt: string | null;
  timelineStartAt: string | null;
  deadlineAt: string | null;
  disputeWindowEnd: string | null;
  disputeRaised: boolean;
  payoutStatus: string;
  livePostReviewDeadline: string | null;
  deliverables: Deliverable[];
  submissions: Submission[];
  creatorActionDueSince: string | null;
  conceptInactivityStage: number;
  finalInactivityStage: number;
}

interface Props {
  dealId: string;
  role: "BRAND" | "CREATOR";
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onChange?: () => void;
}

const FIELD = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" } as const;
const FIELD_ERR = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(239,68,68,0.55)" } as const;
const HELPER_TEXT_CONCEPT = "Paste any publicly accessible link to your concept video or file.";
const HELPER_TEXT_FINAL = "Paste a publicly accessible link to your final video or post file.";

function isUrl(s: string) { return s.trim().length > 0 && s.includes("."); }
function getAbsoluteUrl(url: string | null | undefined): string {
  if (!url) return "#";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}


function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    PENDING:            { bg: "rgba(255,255,255,0.06)", fg: "rgba(255,255,255,0.75)", label: "Pending" },
    SUBMITTED:          { bg: "rgba(59,130,246,0.20)",  fg: "#7DB7FF",              label: "In review" },
    APPROVED:           { bg: "rgba(34,197,94,0.20)",   fg: "#7AE2A0",              label: "Approved" },
    REVISION_REQUESTED: { bg: "rgba(245,158,11,0.20)",  fg: "#FFCB7A",              label: "Revision" },
  };
  const m = map[status] ?? map["PENDING"]!;
  return <span style={{ background: m.bg, color: m.fg, padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{m.label}</span>;
}


function UrlInput({ value, onChange, placeholder = "https://...", helperText = HELPER_TEXT_CONCEPT, error }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helperText?: string;
  error?: boolean;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...FIELD, width: "100%", padding: "8px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS }}
      />
      {error
        ? <p style={{ fontSize: 11, color: "#F0187A", margin: "4px 0 0", fontFamily: POPPINS, lineHeight: 1.4 }}>Please enter a valid URL (e.g. drive.google.com/...)</p>
        : <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.70)", margin: "3px 0 0", fontFamily: POPPINS, lineHeight: 1.35 }}>{helperText}</p>
      }
    </div>
  );
}

function SubmissionHistory({ submissions, deliverableId, stage }: {
  submissions: Submission[];
  deliverableId: string;
  stage: "CONCEPT" | "FINAL";
}) {
  const rows = submissions
    .filter(s => s.deliverableId === deliverableId && s.stage === stage)
    .sort((a, b) => a.version - b.version);
  if (rows.length === 0) return null;
  const labelFor = (v: number) => v === 1 ? (stage === "CONCEPT" ? "Concept" : "Final V1") : `${stage === "CONCEPT" ? "Concept" : "Final"} V${v}`;
  return (
    <div style={{ marginTop: 4, marginBottom: 6, padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.70)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Submission history</p>
      {rows.map(r => (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, padding: "3px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginRight: 6 }}>{labelFor(r.version)}</span>
            <a href={getAbsoluteUrl(r.url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: PINK, wordBreak: "break-all" }}>{r.url}</a>
          </div>
          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, fontWeight: 700, flexShrink: 0,
            background:
              r.outcome === "APPROVED" ? "rgba(34,197,94,0.18)" :
              r.outcome === "REVISION_REQUESTED" ? "rgba(245,158,11,0.18)" :
              r.outcome === "SUPERSEDED" ? "rgba(255,255,255,0.07)" : "rgba(59,130,246,0.18)",
            color:
              r.outcome === "APPROVED" ? "#7AE2A0" :
              r.outcome === "REVISION_REQUESTED" ? "#FFCB7A" :
              r.outcome === "SUPERSEDED" ? "rgba(255,255,255,0.70)" : "#7DB7FF",
          }}>
            {r.outcome === "APPROVED" ? (r.reviewedBy === "AUTO" ? "Auto-approved" : "Approved") :
             r.outcome === "REVISION_REQUESTED" ? "Revision" :
             r.outcome === "SUPERSEDED" ? "Superseded" : "Pending"}
          </span>
        </div>
      ))}
    </div>
  );
}

// Concept-stage statuses where creator exit / brand cancel are still allowed
// without penalty. Mirrors the backend guard in /exit-at-concept and
// /cancel-at-concept (dealPipeline.ts).
const CONCEPT_PHASE_STATUSES = new Set([
  "IN_ESCROW",
  "CONCEPT_SUBMITTED",
  "REVISION_REQUESTED",
]);

// Statuses where the creator is no longer expected to do concept/content work
// — suppress the inactivity banner entirely.
const INACTIVITY_BANNER_SUPPRESSED = new Set([
  "CONTENT_APPROVED",
  "POST_LIVE_PENDING",
  "URL_FLAGGED",
  "DISPUTE_WINDOW_OPEN",
  "COMPLETED",
  "CANCELLED",
]);

function InactivityBanner({ data, role, busy, onCreatorExit }: {
  data: PanelData;
  role: "BRAND" | "CREATOR";
  busy: boolean;
  onCreatorExit: () => void;
}) {
  if (!data.creatorActionDueSince) return null;
  if (INACTIVITY_BANNER_SUPPRESSED.has(data.dealStatus)) return null;
  const atConcept = CONCEPT_PHASE_STATUSES.has(data.dealStatus) || data.conceptInactivityStage > 0;
  const canCreatorExit = role === "CREATOR" && atConcept;

  const openTutorial = () => {
    window.dispatchEvent(new CustomEvent("collabry:tutorial"));
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
  };

  let headline = "";
  let sub = "";
  if (role === "BRAND") {
    headline = atConcept
      ? "Waiting for creator to submit the concept video."
      : "Waiting for creator to upload the final content.";
    sub = atConcept
      ? "Not aware of how concept videos work?"
      : "Not aware of the content upload process?";
  } else {
    headline = atConcept
      ? "Upload the concept video."
      : "Upload your final content before the deadline.";
    sub = atConcept
      ? "Not aware of how concept videos work?"
      : "Not aware of the content upload process?";
  }

  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 8, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#FFCB7A", margin: 0, fontFamily: POPPINS }}>
        ⏱ {headline}
      </p>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", margin: 0, fontFamily: POPPINS }}>
          {sub} See how the deal flow works.
        </p>
        <button
          onClick={openTutorial}
          style={{
            background: "rgba(240,24,122,0.18)", color: "#F0187A",
            border: "1px solid rgba(240,24,122,0.35)", padding: "3px 10px",
            borderRadius: 999, fontSize: 10, fontWeight: 700,
            cursor: "pointer", fontFamily: POPPINS, flexShrink: 0,
          }}
        >
          See Video
        </button>
      </div>
      {role === "BRAND" && (
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", margin: "6px 0 0", fontFamily: POPPINS }}>
          This deal will expire automatically on the deadline. Creator can request a time extension if needed.
        </p>
      )}
      {canCreatorExit && (
        <div style={{ marginTop: 7, display: "flex", gap: 6 }}>
          <button onClick={onCreatorExit} disabled={busy}
            style={{ background: "rgba(239,68,68,0.18)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.40)", padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.5 : 1 }}>
            Exit deal
          </button>
        </div>
      )}
    </div>
  );
}

export default function DealDeliverablesPanel({ dealId, role, apiFetch, onChange }: Props) {
  const { serverNow } = useServerTime();
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conceptUrls, setConceptUrls] = useState<Record<string, string>>({});
  const [contentUrls, setContentUrls] = useState<Record<string, string>>({});
  const [conceptUrlErrors, setConceptUrlErrors] = useState<Record<string, boolean>>({});
  const [contentUrlErrors, setContentUrlErrors] = useState<Record<string, boolean>>({});
  const [postUrls, setPostUrls] = useState<Record<string, string>>({});
  const [reviseModal, setReviseModal] = useState<{ deliverableId: string; phase: "concept" | "content" } | null>(null);
  const [revisionReasons, setRevisionReasons] = useState<{ id: string; reason: string }[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [reasonBrief, setReasonBrief] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeDesc, setDisputeDesc] = useState("");
  const [flagReasons, setFlagReasons] = useState<Record<string, string>>({});
  const [resubmitUrls, setResubmitUrls] = useState<Record<string, string>>({});

  const [confirmFinalApprove, setConfirmFinalApprove] = useState<{ deliverableId: string; slotLabel: string } | null>(null);
  const [confirmExitConcept, setConfirmExitConcept] = useState(false);

  const path = role === "BRAND" ? "brand" : "creator";

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await apiFetch(`/api/${path}/deals/${dealId}/deliverables`);
      if (r.ok) setData(await r.json());
      else { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Failed to load"); }
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }, [apiFetch, dealId, path]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch whenever a popup CTA navigates the user to this page
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const handler = () => loadRef.current();
    window.addEventListener("collabry:refresh", handler);
    return () => window.removeEventListener("collabry:refresh", handler);
  }, []);

  useEffect(() => {
    if (!reviseModal) return;
    setReasonText(""); setReasonBrief(""); setSelectedReasonId("");
    const type = reviseModal.phase === "concept" ? "CONCEPT" : "CONTENT";
    apiFetch(`/api/platform-config/revision-reasons?type=${type}`)
      .then(r => r.ok ? r.json() : { reasons: [] })
      .then(d => setRevisionReasons(Array.isArray(d.reasons) ? d.reasons : []))
      .catch(() => setRevisionReasons([]));
  }, [reviseModal, apiFetch]);


  const refresh = async () => { await load(); onChange?.(); };

  const groupByPhase = useMemo(() => {
    if (!data) return null;
    return {
      conceptPending: data.deliverables.filter(d => d.conceptStatus === "PENDING"),
      conceptRevise:  data.deliverables.filter(d => d.conceptStatus === "REVISION_REQUESTED"),
      contentPending: data.deliverables.filter(d => d.finalStatus === "PENDING" && d.conceptStatus === "APPROVED"),
      contentRevise:  data.deliverables.filter(d => d.finalStatus === "REVISION_REQUESTED"),
    };
  }, [data]);

  if (loading) return <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: POPPINS }}>Loading deliverables...</p>;
  if (err) return <p style={{ color: "#F87171", fontSize: 12, fontFamily: POPPINS }}>{err}</p>;
  if (!data || !groupByPhase) return null;

  const { dealStatus, postedBy, productRequired, productShippedAt, productReceivedAt } = data;

  const submitConcepts = async () => {
    const targets = groupByPhase.conceptPending;
    const slots = targets.map(t => ({ deliverableId: t.id, conceptUrl: (conceptUrls[t.id] ?? "").trim() }));
    const invalid = targets.filter(t => !isUrl((conceptUrls[t.id] ?? "").trim()));
    if (invalid.length > 0) { setConceptUrlErrors(p => { const n = { ...p }; invalid.forEach(t => { n[t.id] = true; }); return n; }); return; }
    setBusy(true);
    try {
      const r = await apiFetch(`/api/creator/deals/${dealId}/concept/submit`, { method: "POST", body: JSON.stringify({ slots }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setConceptUrls({}); await refresh(); }
    } finally { setBusy(false); }
  };
  const resubmitConcepts = async () => {
    const targets = groupByPhase.conceptRevise;
    const slots = targets.map(t => ({ deliverableId: t.id, conceptUrl: (conceptUrls[t.id] ?? t.conceptUrl ?? "").trim() }));
    const invalid = targets.filter(t => !isUrl((conceptUrls[t.id] ?? t.conceptUrl ?? "").trim()));
    if (invalid.length > 0) { setConceptUrlErrors(p => { const n = { ...p }; invalid.forEach(t => { n[t.id] = true; }); return n; }); return; }
    setBusy(true);
    try {
      const r = await apiFetch(`/api/creator/deals/${dealId}/concept/resubmit`, { method: "POST", body: JSON.stringify({ slots }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setConceptUrls({}); await refresh(); }
    } finally { setBusy(false); }
  };
  const submitContent = async () => {
    const targets = data.deliverables.filter(d => d.finalStatus === "PENDING");
    const slots = targets.map(t => ({ deliverableId: t.id, finalUrl: (contentUrls[t.id] ?? "").trim() }));
    const invalid = targets.filter(t => !isUrl((contentUrls[t.id] ?? "").trim()));
    if (invalid.length > 0) { setContentUrlErrors(p => { const n = { ...p }; invalid.forEach(t => { n[t.id] = true; }); return n; }); return; }
    setBusy(true);
    try {
      const r = await apiFetch(`/api/creator/deals/${dealId}/content/submit`, { method: "POST", body: JSON.stringify({ slots }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setContentUrls({}); await refresh(); }
    } finally { setBusy(false); }
  };
  const resubmitContent = async () => {
    const targets = groupByPhase.contentRevise;
    const slots = targets.map(t => ({ deliverableId: t.id, finalUrl: (contentUrls[t.id] ?? t.finalUrl ?? "").trim() }));
    const invalid = targets.filter(t => !isUrl((contentUrls[t.id] ?? t.finalUrl ?? "").trim()));
    if (invalid.length > 0) { setContentUrlErrors(p => { const n = { ...p }; invalid.forEach(t => { n[t.id] = true; }); return n; }); return; }
    setBusy(true);
    try {
      const r = await apiFetch(`/api/creator/deals/${dealId}/content/resubmit`, { method: "POST", body: JSON.stringify({ slots }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setContentUrls({}); await refresh(); }
    } finally { setBusy(false); }
  };
  const submitFinalPosts = async () => {
    const nonStory = data.deliverables.filter(d => d.type !== "STORY");
    const slots = nonStory.map(t => ({ deliverableId: t.id, livePostUrl: (postUrls[t.id] ?? "").trim() }));
    if (slots.some(s => !isUrl(s.livePostUrl))) return alert("Each live post URL must be a valid http(s) URL");
    setBusy(true);
    try {
      const r = await apiFetch(`/api/creator/deals/${dealId}/final-post/submit`, { method: "POST", body: JSON.stringify({ slots }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setPostUrls({}); await refresh(); }
    } finally { setBusy(false); }
  };
  const approve = async (deliverableId: string, phase: "concept" | "content"): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/brand/deals/${dealId}/${phase}/approve`, { method: "POST", body: JSON.stringify({ deliverableId }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); return false; }
      await refresh();
      return true;
    } finally { setBusy(false); }
  };
  const submitRevise = async () => {
    if (!reviseModal) return;
    const finalReason = selectedReasonId
      ? (revisionReasons.find(r => r.id === selectedReasonId)?.reason ?? reasonText.trim())
      : reasonText.trim();
    if (!finalReason) return alert("Select or enter a reason");
    if (!reasonBrief.trim()) return alert("Add details in the brief");
    setBusy(true);
    try {
      const r = await apiFetch(`/api/brand/deals/${dealId}/${reviseModal.phase}/revise`, {
        method: "POST",
        body: JSON.stringify({ deliverableId: reviseModal.deliverableId, reason: finalReason, brief: reasonBrief.trim() }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setReviseModal(null); await refresh(); }
    } finally { setBusy(false); }
  };
  const reviewLiveSlot = async (deliverableId: string, action: "CONFIRM" | "FLAG") => {
    const flagReason = flagReasons[deliverableId] ?? "";
    if (action === "FLAG" && !flagReason.trim()) return alert("Please provide a reason for flagging this post");
    setBusy(true);
    try {
      const r = await apiFetch(`/api/brand/deals/${dealId}/final-post/review-slot`, {
        method: "POST",
        body: JSON.stringify({ deliverableId, action, flagReason: flagReason.trim() }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setFlagReasons({}); await refresh(); }
    } finally { setBusy(false); }
  };

  const resubmitLiveSlot = async (deliverableId: string) => {
    const url = (resubmitUrls[deliverableId] ?? "").trim();
    if (!isUrl(url)) return alert("Please enter a valid http(s) URL");
    setBusy(true);
    try {
      const r = await apiFetch(`/api/creator/deals/${dealId}/final-post/resubmit-slot`, {
        method: "POST",
        body: JSON.stringify({ deliverableId, livePostUrl: url }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setResubmitUrls({}); await refresh(); }
    } finally { setBusy(false); }
  };
  const submitDispute = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/brand/deals/${dealId}/dispute`, {
        method: "POST", body: JSON.stringify({ description: disputeDesc.trim() || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setDisputeOpen(false); setDisputeDesc(""); await refresh(); }
    } finally { setBusy(false); }
  };

  const containerStyle = { fontFamily: POPPINS, color: "white" } as React.CSSProperties;
  const sectionStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, marginTop: 8 } as React.CSSProperties;

  const showCreatorConceptSubmit   = role === "CREATOR" && dealStatus === "IN_ESCROW" && groupByPhase.conceptPending.length > 0;
  const showCreatorConceptResubmit = role === "CREATOR" && groupByPhase.conceptRevise.length > 0;
  const showCreatorContentSubmit   = role === "CREATOR" &&
    ["CONCEPT_APPROVED","PRODUCT_RECEIVED","IN_PROGRESS"].includes(dealStatus) &&
    data.deliverables.some(d => d.finalStatus === "PENDING") &&
    (!productRequired || !!productReceivedAt);
  const showCreatorContentResubmit = role === "CREATOR" && groupByPhase.contentRevise.length > 0;
  const showCreatorFinalPost       = false;
  const showCreatorWaitPost        = false;
  const showCreatorFlaggedResubmit = false;
  const showBrandConfirmPost       = false;

  const conceptReviewSlots  = data.deliverables.filter(d => ["SUBMITTED","APPROVED","REVISION_REQUESTED"].includes(d.conceptStatus));
  const contentReviewSlots  = data.deliverables.filter(d => ["SUBMITTED","APPROVED","REVISION_REQUESTED"].includes(d.finalStatus));
  const showBrandConceptReview = role === "BRAND" && ["CONCEPT_SUBMITTED","REVISION_REQUESTED","CONCEPT_APPROVED"].includes(dealStatus) && conceptReviewSlots.some(s => s.conceptStatus !== "APPROVED");
  const showBrandContentReview = role === "BRAND" && ["CONTENT_UPLOADED","REVISION_REQUESTED","CONTENT_APPROVED"].includes(dealStatus) && contentReviewSlots.some(s => s.finalStatus !== "APPROVED");
  const withinDisputeWindow  = !!data.disputeWindowEnd && new Date(data.disputeWindowEnd) > new Date() && !data.disputeRaised;
  const showBrandDispute     = role === "BRAND" && (postedBy === "CREATOR" || postedBy === "BOTH") && (dealStatus === "DISPUTE_WINDOW_OPEN" || (dealStatus === "COMPLETED" && withinDisputeWindow));
  const disputeDaysLeft      = data.disputeWindowEnd ? Math.max(0, Math.ceil((new Date(data.disputeWindowEnd).getTime() - Date.now()) / 86_400_000)) : 0;

  const exitAtConcept = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/creator/deals/${dealId}/exit-at-concept`, { method: "POST" });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); }
      else { setConfirmExitConcept(false); await refresh(); }
    } finally { setBusy(false); }
  };
  const approveFinalConfirmed = async () => {
    if (!confirmFinalApprove) return;
    const ok = await approve(confirmFinalApprove.deliverableId, "content");
    if (ok) setConfirmFinalApprove(null);
  };

  const reviseDeliverable = reviseModal
    ? data.deliverables.find(d => d.id === reviseModal.deliverableId) ?? null
    : null;
  const reviseCount = reviseModal
    ? reviseDeliverable
      ? (reviseModal.phase === "concept" ? reviseDeliverable.conceptRevisionCount : reviseDeliverable.finalRevisionCount)
      : 0
    : 0;

  return (
    <div style={containerStyle}>
      <InactivityBanner
        data={data}
        role={role}
        busy={busy}
        onCreatorExit={() => setConfirmExitConcept(true)}
      />
      {data.disputeWindowEnd && dealStatus === "DISPUTE_WINDOW_OPEN" && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, marginBottom: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)" }}>
          <span style={{ fontSize: 11, color: "#FFCB7A", fontFamily: POPPINS }}>⏱ Dispute window closes {new Date(data.disputeWindowEnd).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
        </div>
      )}

      {/* CREATOR: Concept submit */}
      {showCreatorConceptSubmit && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📝 Submit concept{groupByPhase.conceptPending.length > 1 ? "s" : ""}</p>
          {groupByPhase.conceptPending.map(d => (
            <div key={d.id} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>{d.slotLabel}</p>
              <UrlInput value={conceptUrls[d.id] ?? ""} onChange={v => { setConceptUrls(p => ({ ...p, [d.id]: v })); setConceptUrlErrors(p => ({ ...p, [d.id]: false })); }} error={conceptUrlErrors[d.id]} />
              <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.6)", marginTop: 6, fontFamily: POPPINS }}>💡 New to concept videos? No stress — just record a short casual video explaining what you plan to create, how you'll shoot it, and the message you want to deliver. Think of it as a quick walkthrough of your idea before you start.</p>
            </div>
          ))}
          {groupByPhase.conceptPending.length > 1 && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", marginBottom: 8, fontFamily: POPPINS }}>
              {groupByPhase.conceptPending.filter(d => isUrl(conceptUrls[d.id] ?? "")).length}/{groupByPhase.conceptPending.length} slots filled
            </p>
          )}
          <button disabled={busy} onClick={submitConcepts}
            style={{ background: PINK, color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }}>
            Submit all concepts
          </button>
        </div>
      )}

      {/* CREATOR: Concept resubmit */}
      {showCreatorConceptResubmit && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🔁 Resubmit revised concept{groupByPhase.conceptRevise.length > 1 ? "s" : ""}</p>
          {groupByPhase.conceptRevise.map(d => (
            <div key={d.id} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>
                {d.slotLabel}{d.conceptRevisionCount > 0 ? ` · revision #${d.conceptRevisionCount}` : ""}
              </p>
              {(d.conceptRevisionReason || d.conceptRevisionBrief) && (
                <div style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)" }}>
                  {d.conceptRevisionReason && <p style={{ fontSize: 11, fontWeight: 700, color: "#FFCB7A", marginBottom: 2 }}>Reason: {d.conceptRevisionReason}</p>}
                  {d.conceptRevisionBrief && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.90)", whiteSpace: "pre-wrap", margin: 0 }}>{d.conceptRevisionBrief}</p>}
                </div>
              )}
              <UrlInput value={conceptUrls[d.id] ?? d.conceptUrl ?? ""} onChange={v => { setConceptUrls(p => ({ ...p, [d.id]: v })); setConceptUrlErrors(p => ({ ...p, [d.id]: false })); }} error={conceptUrlErrors[d.id]} />
              <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.6)", marginTop: 6, fontFamily: POPPINS }}>💡 New to concept videos? No stress — just record a short casual video explaining what you plan to create, how you'll shoot it, and the message you want to deliver. Think of it as a quick walkthrough of your idea before you start.</p>
            </div>
          ))}
          <button disabled={busy} onClick={resubmitConcepts}
            style={{ background: PINK, color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }}>
            Resubmit
          </button>
        </div>
      )}

      {/* CREATOR: Content submit */}
      {showCreatorContentSubmit && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🎬 Upload final content</p>
          {data.deliverables.filter(d => d.finalStatus === "PENDING").map(d => (
            <div key={d.id} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>{d.slotLabel}</p>
              <UrlInput value={contentUrls[d.id] ?? ""} onChange={v => { setContentUrls(p => ({ ...p, [d.id]: v })); setContentUrlErrors(p => ({ ...p, [d.id]: false })); }} helperText={HELPER_TEXT_FINAL} error={contentUrlErrors[d.id]} />
              <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.6)", marginTop: 6, fontFamily: POPPINS }}>💡 This is your final deliverable — upload the completed video exactly as you plan to post it. Make sure it matches the approved concept and brand brief before submitting.</p>
            </div>
          ))}
          {data.deliverables.filter(d => d.finalStatus === "PENDING").length > 1 && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", marginBottom: 8, fontFamily: POPPINS }}>
              {data.deliverables.filter(d => d.finalStatus === "PENDING" && isUrl(contentUrls[d.id] ?? "")).length}/{data.deliverables.filter(d => d.finalStatus === "PENDING").length} slots filled
            </p>
          )}
          <button disabled={busy} onClick={submitContent}
            style={{ background: PINK, color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }}>
            Submit all content
          </button>
        </div>
      )}

      {/* CREATOR: Content resubmit */}
      {showCreatorContentResubmit && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🔁 Resubmit revised content</p>
          {groupByPhase.contentRevise.map(d => (
            <div key={d.id} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>
                {d.slotLabel}{d.finalRevisionCount > 0 ? ` · revision #${d.finalRevisionCount}` : ""}
              </p>
              {(d.finalRevisionReason || d.finalRevisionBrief) && (
                <div style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)" }}>
                  {d.finalRevisionReason && <p style={{ fontSize: 11, fontWeight: 700, color: "#FFCB7A", marginBottom: 2 }}>Reason: {d.finalRevisionReason}</p>}
                  {d.finalRevisionBrief && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.90)", whiteSpace: "pre-wrap", margin: 0 }}>{d.finalRevisionBrief}</p>}
                </div>
              )}
              <UrlInput value={contentUrls[d.id] ?? d.finalUrl ?? ""} onChange={v => { setContentUrls(p => ({ ...p, [d.id]: v })); setContentUrlErrors(p => ({ ...p, [d.id]: false })); }} helperText={HELPER_TEXT_FINAL} error={contentUrlErrors[d.id]} />
              <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.6)", marginTop: 6, fontFamily: POPPINS }}>💡 This is your final deliverable — upload the completed video exactly as you plan to post it. Make sure it matches the approved concept and brand brief before submitting.</p>
            </div>
          ))}
          <button disabled={busy} onClick={resubmitContent}
            style={{ background: PINK, color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }}>
            Resubmit
          </button>
        </div>
      )}

      {/* CREATOR: Waiting for brand to confirm live posts */}
      {showCreatorWaitPost && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📲 Photos submitted — awaiting brand review</p>
          {data.livePostReviewDeadline && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", marginBottom: 8 }}>
              Auto-confirms in: {fmtCountdown(data.livePostReviewDeadline, serverNow)}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {data.deliverables.map(d => (
              <div key={d.id} style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${d.livePostConfirmedByBrand ? "rgba(34,197,94,0.30)" : "rgba(255,255,255,0.08)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: d.livePostUrl ? 3 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{d.slotLabel}</span>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, fontWeight: 700,
                    background: d.storyAutoConfirmed ? "rgba(34,197,94,0.18)" : d.livePostConfirmedByBrand ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.07)",
                    color: d.storyAutoConfirmed ? "#7AE2A0" : d.livePostConfirmedByBrand ? "#7AE2A0" : "rgba(255,255,255,0.70)" }}>
                    {d.storyAutoConfirmed ? "Auto-confirmed (Story)" : d.livePostConfirmedByBrand ? "Confirmed" : "Pending review"}
                  </span>
                </div>
                {d.livePostUrl && !d.storyAutoConfirmed && (
                  <a href={d.livePostUrl} target="_blank" rel="noreferrer" style={{ color: PINK, fontSize: 11, wordBreak: "break-all" }}>{d.livePostUrl}</a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATOR: Flagged URL resubmit (URL_FLAGGED status) */}
      {showCreatorFlaggedResubmit && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🚩 Brand flagged a live post — please resubmit</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.70)", marginBottom: 10 }}>
            One or more of your post URLs was flagged. Submit a corrected URL (max 1 resubmission per slot). Admin will review if the dispute continues.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.deliverables.filter(d => d.livePostFlagged || d.livePostConfirmedByBrand || d.storyAutoConfirmed).map(d => (
              <div key={d.id} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${d.livePostFlagged ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.25)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: d.livePostFlagged ? 6 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{d.slotLabel}</span>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, fontWeight: 700,
                    background: d.livePostFlagged ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.18)",
                    color: d.livePostFlagged ? "#F87171" : "#7AE2A0" }}>
                    {d.livePostFlagged ? "Flagged" : d.storyAutoConfirmed ? "Auto-confirmed" : "Confirmed"}
                  </span>
                </div>
                {d.livePostFlagged && (
                  <>
                    {d.livePostResubmissionCount >= 1 && (
                      <p style={{ fontSize: 10, color: "#FFCB7A", margin: "0 0 4px" }}>Max resubmission used — admin is reviewing.</p>
                    )}
                    {d.livePostResubmissionCount < 1 && (
                      <>
                        <input type="url" placeholder="https://www.instagram.com/p/..." value={resubmitUrls[d.id] ?? ""}
                          onChange={e => setResubmitUrls(p => ({ ...p, [d.id]: e.target.value }))}
                          style={{ ...FIELD, width: "100%", padding: "7px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS, marginBottom: 6 }} />
                        <button disabled={busy || !isUrl(resubmitUrls[d.id] ?? "")} onClick={() => resubmitLiveSlot(d.id)}
                          style={{ background: PINK, color: "white", border: 0, padding: "5px 13px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                            opacity: (busy || !isUrl(resubmitUrls[d.id] ?? "")) ? 0.4 : 1 }}>
                          Resubmit URL
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATOR: Final post submit */}
      {showCreatorFinalPost && (() => {
        const nonStorySlots = data.deliverables.filter(d => d.type !== "STORY");
        const storySlots    = data.deliverables.filter(d => d.type === "STORY");
        const filled = nonStorySlots.filter(d => isUrl(postUrls[d.id] ?? "")).length;
        return (
          <div style={sectionStyle}>
            <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📲 Confirm live post URLs (Instagram links)</p>
            {storySlots.length > 0 && (
              <div style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.22)", marginBottom: 10 }}>
                <p style={{ fontSize: 10, color: "#7AE2A0", fontWeight: 700, margin: 0 }}>
                  ✅ {storySlots.length} story slot{storySlots.length > 1 ? "s" : ""} auto-confirmed — stories expire in 24hrs so no screenshot required.
                </p>
              </div>
            )}
            {nonStorySlots.length > 0 && (
              <>
                {nonStorySlots.map(d => (
                  <div key={d.id} style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>{d.slotLabel} · {d.type}</p>
                    <input type="url" placeholder="https://www.instagram.com/p/..." value={postUrls[d.id] ?? ""}
                      onChange={e => setPostUrls(p => ({ ...p, [d.id]: e.target.value }))}
                      style={{ ...FIELD, width: "100%", padding: "8px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS }} />
                    <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.70)", margin: "3px 0 0", fontFamily: POPPINS, lineHeight: 1.35 }}>
                      Paste the public Instagram post or reel URL once it's live.
                    </p>
                  </div>
                ))}
                {nonStorySlots.length > 1 && (
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", marginBottom: 8 }}>
                    {filled}/{nonStorySlots.length} slots filled
                  </p>
                )}
              </>
            )}
            <button disabled={busy || (nonStorySlots.length > 0 && filled < nonStorySlots.length)} onClick={submitFinalPosts}
              style={{ background: PINK, color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, opacity: (busy || (nonStorySlots.length > 0 && filled < nonStorySlots.length)) ? 0.5 : 1, cursor: "pointer" }}>
              {nonStorySlots.length === 0 ? "✅ Confirm all stories auto-confirmed" : "Confirm posts are live"}
            </button>
          </div>
        );
      })()}

      {/* BRAND: Per-slot live post review */}
      {showBrandConfirmPost && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>📲 Review creator's live post URLs</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.70)", marginBottom: 8 }}>
            Confirm or flag each post. Once all are confirmed, the 7-day dispute window starts.
          </p>
          {data.livePostReviewDeadline && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", marginBottom: 10 }}>
              Auto-confirms in: {fmtCountdown(data.livePostReviewDeadline, serverNow)}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.deliverables.map(d => {
              const isConfirmed = d.livePostConfirmedByBrand || d.storyAutoConfirmed;
              const isFlagged   = d.livePostFlagged;
              return (
                <div key={d.id} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${isConfirmed ? "rgba(34,197,94,0.30)" : isFlagged ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.09)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{d.slotLabel}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", marginLeft: 6 }}>{d.type}</span>
                    </div>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, fontWeight: 700,
                      background: isConfirmed ? "rgba(34,197,94,0.18)" : isFlagged ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.07)",
                      color: isConfirmed ? "#7AE2A0" : isFlagged ? "#F87171" : "rgba(255,255,255,0.70)" }}>
                      {d.storyAutoConfirmed ? "Auto-confirmed" : isConfirmed ? "Confirmed" : isFlagged ? "Flagged" : "Pending"}
                    </span>
                  </div>
                  {d.storyAutoConfirmed ? (
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", margin: 0 }}>Story — auto-confirmed (expires in 24hrs)</p>
                  ) : (
                    <>
                      {d.livePostUrl
                        ? <a href={d.livePostUrl} target="_blank" rel="noreferrer" style={{ color: PINK, fontSize: 11, wordBreak: "break-all", display: "block", marginBottom: 6 }}>{d.livePostUrl}</a>
                        : <p style={{ fontSize: 11, color: "rgba(255,255,255,0.70)", marginBottom: 6 }}>No URL submitted</p>}
                      {!isConfirmed && !isFlagged && d.livePostUrl && (
                        <>
                          <div style={{ marginBottom: 5 }}>
                            <input type="text" placeholder="Reason for flagging (fill before clicking Flag)…"
                              value={flagReasons[d.id] ?? ""}
                              onChange={e => setFlagReasons(p => ({ ...p, [d.id]: e.target.value }))}
                              style={{ ...FIELD, width: "100%", padding: "6px 10px", borderRadius: 8, color: "white", fontSize: 11, fontFamily: POPPINS }} />
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button disabled={busy} onClick={() => reviewLiveSlot(d.id, "CONFIRM")}
                              style={{ background: "#22C55E", color: "white", border: 0, padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
                              ✅ Confirm
                            </button>
                            <button disabled={busy} onClick={() => reviewLiveSlot(d.id, "FLAG")}
                              style={{ background: "rgba(239,68,68,0.80)", color: "white", border: 0, padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
                              🚩 Flag
                            </button>
                          </div>
                        </>
                      )}
                      {isFlagged && (
                        <p style={{ fontSize: 10, color: "#F87171", margin: 0 }}>Flagged — admin is reviewing. Creator may resubmit a new URL.</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BRAND: Concept review */}
      {showBrandConceptReview && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📝 Review concepts</p>
          {conceptReviewSlots.map(d => (
            <div key={d.id} style={{ ...FIELD, padding: 8, borderRadius: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{d.slotLabel}</span>
                <StatusPill status={d.conceptStatus} />
              </div>
              {d.conceptUrl && <a href={getAbsoluteUrl(d.conceptUrl)} target="_blank" rel="noopener noreferrer" style={{ color: PINK, fontSize: 11, wordBreak: "break-all", display: "block", marginBottom: 6 }}>{d.conceptUrl}</a>}
              {d.conceptUrl && <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.6)", marginTop: 0, marginBottom: 8, fontFamily: POPPINS }}>💡 The creator has shared their concept — a short overview of how they plan to execute the content, including the shoot style and message. Review it and approve or request changes.</p>}
              <SubmissionHistory submissions={data.submissions} deliverableId={d.id} stage="CONCEPT" />
              {d.conceptStatus === "SUBMITTED" && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button disabled={busy} onClick={() => approve(d.id, "concept")}
                    style={{ background: "#22C55E", color: "white", border: 0, padding: "6px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>Approve</button>
                  <button disabled={busy} onClick={() => setReviseModal({ deliverableId: d.id, phase: "concept" })}
                    style={{ background: "rgba(245,158,11,0.25)", color: "#FFCB7A", border: "1px solid rgba(245,158,11,0.45)", padding: "6px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                    Request revision
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* BRAND: Content review */}
      {showBrandContentReview && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🎬 Review content</p>
          {contentReviewSlots.map(d => (
            <div key={d.id} style={{ ...FIELD, padding: 8, borderRadius: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{d.slotLabel}</span>
                <StatusPill status={d.finalStatus} />
              </div>
              {d.finalUrl && <a href={getAbsoluteUrl(d.finalUrl)} target="_blank" rel="noopener noreferrer" style={{ color: PINK, fontSize: 11, wordBreak: "break-all", display: "block", marginBottom: 6 }}>{d.finalUrl}</a>}
              {d.finalUrl && <p style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.6)", marginTop: 0, marginBottom: 8, fontFamily: POPPINS }}>💡 This is the creator's final video — review it carefully against your brief and the approved concept before approving or requesting a revision.</p>}
              <SubmissionHistory submissions={data.submissions} deliverableId={d.id} stage="FINAL" />
              {d.finalStatus === "SUBMITTED" && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button disabled={busy} onClick={() => setConfirmFinalApprove({ deliverableId: d.id, slotLabel: d.slotLabel })}
                    style={{ background: "#22C55E", color: "white", border: 0, padding: "6px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>Approve</button>
                  <button disabled={busy} onClick={() => setReviseModal({ deliverableId: d.id, phase: "content" })}
                    style={{ background: "rgba(245,158,11,0.25)", color: "#FFCB7A", border: "1px solid rgba(245,158,11,0.45)", padding: "6px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                    Request revision
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* BRAND: Dispute window */}
      {showBrandDispute && (
        <div style={{ ...sectionStyle, background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.30)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", marginBottom: 6 }}>⚠️ Dispute Window Open</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.80)", marginBottom: 8, lineHeight: 1.6 }}>
            You have <strong>{disputeDaysLeft} day{disputeDaysLeft !== 1 ? "s" : ""}</strong> left to raise a dispute if the creator has deleted the posted content.
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 14, lineHeight: 1.5 }}>
            For any other concerns or issues with this deal, please contact our support team.
          </p>
          <button disabled={busy} onClick={() => setDisputeOpen(true)}
            style={{ background: PINK, color: "#fff", border: "none", padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: POPPINS, cursor: "pointer" }}>
            Raise Dispute
          </button>
        </div>
      )}
      {role === "BRAND" && dealStatus === "DISPUTED" && (
        <div style={{ ...sectionStyle, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.30)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 6 }}>⚠️ Dispute Under Review</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.80)", margin: 0, lineHeight: 1.6 }}>
            Your dispute has been submitted. An admin will review it and notify you of the outcome.
          </p>
        </div>
      )}

      {role === "CREATOR" && postedBy === "BRAND" && dealStatus === "CONTENT_APPROVED" && (
        <div style={sectionStyle}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}>✅ Brand approved your content and will publish it. The deal will be marked complete shortly.</p>
        </div>
      )}

      {/* CREATOR: Dispute window / disputed banners */}
      {role === "CREATOR" && (postedBy === "CREATOR" || postedBy === "BOTH") && dealStatus === "DISPUTE_WINDOW_OPEN" && (
        <div style={{ ...sectionStyle, background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.30)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", marginBottom: 6 }}>⚠️ Dispute Window Open — Payment Pending</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.80)", marginBottom: 6, lineHeight: 1.6 }}>
            Do <strong>NOT</strong> delete your posted content during this period. Removing it may result in your payment being withheld and your account being suspended.
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.80)", margin: 0, lineHeight: 1.6 }}>
            Your payout will be released once the 7-day dispute window closes. No other action is required from you.
          </p>
        </div>
      )}
      {role === "CREATOR" && dealStatus === "DISPUTED" && (
        <div style={{ ...sectionStyle, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.30)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 6 }}>⚠️ Dispute Raised</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.80)", margin: 0, lineHeight: 1.6 }}>
            The brand has raised a dispute on this deal. An admin will review the case and resolve it.
          </p>
        </div>
      )}

      {/* All slots overview */}
      <div style={{ ...sectionStyle, marginTop: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: 4, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.70)", textTransform: "uppercase", letterSpacing: "0.05em" }}>All Slots</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.70)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Concept Video</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.70)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Final Video</span>
        </div>
        {data.deliverables.map(d => (
          <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: 4, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 11 }}>
            <span style={{ color: "rgba(255,255,255,0.90)", fontWeight: 600 }}>{d.slotLabel}</span>
            <span style={{ display: "flex", justifyContent: "center" }}>
              <StatusPill status={d.conceptStatus} />
            </span>
            <span style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4 }}>
              <StatusPill status={d.finalStatus} />
              {d.livePostUrl && <a href={d.livePostUrl} target="_blank" rel="noreferrer" style={{ color: PINK, fontSize: 10 }}>↗</a>}
            </span>
          </div>
        ))}
      </div>

      {productRequired && dealStatus === "CONCEPT_APPROVED" && !productShippedAt && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 8 }}>
          ⚙️ Brand can now ship the product.
        </p>
      )}

      {/* Revision modal */}
      {reviseModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setReviseModal(null); }}>
          <div style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 16, maxWidth: 420, width: "100%", fontFamily: POPPINS }}>
            <p style={{ color: "white", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              Request revision — {reviseDeliverable?.slotLabel}
            </p>
            <div style={{
              padding: "10px 12px", borderRadius: 12, marginBottom: 12,
              background: "linear-gradient(135deg, rgba(125,183,255,0.14), rgba(240,24,122,0.10))",
              border: "1px solid rgba(125,183,255,0.28)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
            }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: "#7DB7FF", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                For smoother collaboration
              </p>
              <div style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(240,24,122,0.10)",
                border: "1px solid rgba(240,24,122,0.22)",
              }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: "white", margin: 0, lineHeight: 1.5 }}>
                  We recommend discussing the feedback in the deal chat or on a Google Meet call for better clarity and smoother approvals.
                </p>
                <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.82)", margin: "6px 0 0", lineHeight: 1.45 }}>
                  All revisions and approvals must still be submitted through Collabry.
                </p>
              </div>
              <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.72)", margin: "8px 0 0", lineHeight: 1.45 }}>
                {reviseCount > 0 ? `This will be revision #${reviseCount + 1}. ` : ""}There is no cap on revisions, but every round adds delay — please be specific in your feedback.
              </p>
            </div>
            <label style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Reason</label>
            {revisionReasons.length > 0 ? (
              <>
                <div style={{ maxHeight: 160, overflowY: "auto", scrollbarWidth: "thin", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", marginBottom: 8 }}>
                  {[{ id: "", reason: "— Select a reason —" }, ...revisionReasons, { id: "__other__", reason: "Other (type below)" }].map((opt, idx, arr) => (
                    <div key={opt.id}
                      onClick={() => setSelectedReasonId(opt.id)}
                      style={{
                        padding: "9px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: POPPINS,
                        borderBottom: idx < arr.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                        background: selectedReasonId === opt.id ? "rgba(240,24,122,0.12)" : "rgba(255,255,255,0.03)",
                        color: selectedReasonId === opt.id ? "white" : opt.id === "" ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.90)",
                        fontWeight: selectedReasonId === opt.id ? 700 : 400,
                      }}>
                      {opt.reason}
                    </div>
                  ))}
                </div>
                {selectedReasonId === "__other__" && (
                  <input type="text" value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="Describe reason..."
                    style={{ ...FIELD, width: "100%", padding: "8px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS, marginBottom: 8 }} />
                )}
              </>
            ) : (
              <input type="text" value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="e.g. Wrong product angle, lighting off..."
                style={{ ...(reasonText.trim() ? FIELD : FIELD_ERR), width: "100%", padding: "8px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS, marginBottom: 8 }} />
            )}
            <label style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Details (creator will see this)</label>
            <textarea rows={3} value={reasonBrief} onChange={e => setReasonBrief(e.target.value.slice(0, 300))} maxLength={300} placeholder="Describe exactly what needs to be changed..."
              style={{ ...(reasonBrief.trim() ? FIELD : FIELD_ERR), width: "100%", padding: "8px 10px", borderRadius: 8, color: "white", fontSize: 12, fontFamily: POPPINS, marginBottom: 4, resize: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <p style={{ fontSize: 10, color: reasonBrief.length >= 300 ? "#E14F69" : "rgba(255,255,255,0.70)", fontFamily: POPPINS, margin: 0 }}>{reasonBrief.length}/300</p>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setReviseModal(null)} style={{ background: "rgba(255,255,255,0.08)", color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Cancel</button>
              <button disabled={busy} onClick={submitRevise} style={{ background: PINK, color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Send</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm final approval modal */}
      {confirmFinalApprove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmFinalApprove(null); }}>
          <div style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 16, maxWidth: 420, width: "100%", fontFamily: POPPINS }}>
            <p style={{ color: "white", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              Approve final content — {confirmFinalApprove.slotLabel}?
            </p>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              {postedBy === "BRAND"
                ? "Once approved, this version is locked and the deal will be marked as completed. You won't be able to request more revisions on this slot."
                : "Once approved, this version is locked and the deal moves to the live posting stage. You won't be able to request more revisions on this slot."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmFinalApprove(null)}
                style={{ background: "rgba(255,255,255,0.08)", color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button disabled={busy} onClick={approveFinalConfirmed}
                style={{ background: "#22C55E", color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
                Yes, approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creator: confirm exit at concept */}
      {confirmExitConcept && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmExitConcept(false); }}>
          <div style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 16, maxWidth: 420, width: "100%", fontFamily: POPPINS }}>
            <p style={{ color: "white", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Exit this deal?</p>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              You can exit at no penalty while you're still at the concept stage. The brand will be notified and the deal will be cancelled.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmExitConcept(false)}
                style={{ background: "rgba(255,255,255,0.08)", color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Stay</button>
              <button disabled={busy} onClick={exitAtConcept}
                style={{ background: "rgba(239,68,68,0.85)", color: "white", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
                Exit deal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute modal */}
      {disputeOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) { setDisputeOpen(false); setDisputeDesc(""); } }}>
          <div style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 20, maxWidth: 420, width: "100%", fontFamily: POPPINS }}>
            <p style={{ color: "white", fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Raise a Dispute</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Reason</label>
              <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
                Creator deleted the posted video
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Description <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 400, textTransform: "none", fontSize: 11 }}>(optional)</span>
              </label>
              <textarea rows={4} value={disputeDesc} onChange={e => setDisputeDesc(e.target.value.slice(0, 500))}
                placeholder="Describe what happened (e.g. the creator deleted the reel after posting)…"
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontSize: 13, fontFamily: POPPINS, resize: "none" }} />
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: "4px 0 0", textAlign: "right" }}>{disputeDesc.length}/500</p>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setDisputeOpen(false); setDisputeDesc(""); }}
                style={{ background: "transparent", color: PINK, border: `1.5px solid ${PINK}`, padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: POPPINS, cursor: "pointer" }}>
                Cancel
              </button>
              <button disabled={busy} onClick={submitDispute}
                style={{ background: PINK, color: "white", border: "none", padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: POPPINS, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                Submit Dispute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
