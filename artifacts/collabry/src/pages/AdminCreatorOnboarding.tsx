import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, X, CheckCircle, XCircle, PauseCircle, PlayCircle, Ban, Eye, Plus, Trash2, Pencil, Users, UserCheck, UserX, AlertTriangle } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

const POPPINS = "'Poppins', sans-serif";
const inputClass = "w-full bg-transparent border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E14F69] placeholder:text-white/70 transition-all";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-400/20 text-yellow-300", ACTIVE: "bg-green-500/20 text-green-400",
  REJECTED: "bg-red-500/20 text-red-400", SUSPENDED: "bg-orange-500/20 text-orange-400",
  BANNED: "bg-red-900/40 text-red-500",
};

const CONFIG_OPTION_KEYS = [
  { key: "creator_audience_age_groups", label: "Audience Age Groups" },
  { key: "creator_audience_locations", label: "Audience Locations" },
  { key: "creator_content_types", label: "Content Types" },
];

const PERSONAL_FIELD_KEYS = ["categories","gender","bio","youtubeHandle","otherSocialHandle","creatorImages"];
const INFO_STEPS = [
  { key: "creator_signup_info_1", label: "Step 1 — Instagram" },
  { key: "creator_signup_info_2", label: "Step 2 — Personal Details" },
  { key: "creator_signup_info_3", label: "Step 3 — Categories" },
  { key: "creator_signup_info_4", label: "Step 4 — Audience Demographics" },
  { key: "creator_signup_info_5", label: "Step 5 — Audience Insights" },
  { key: "creator_signup_info_6", label: "Step 6 — Pricing" },
  { key: "creator_signup_info_7", label: "Step 7 — Portfolio" },
  { key: "creator_signup_info_8", label: "Step 8 — Review & Submit" },
];

type MainTab = "applications" | "signup-config" | "info-cards" | "users-list" | "reasons-solutions" | "fun-questions" | "messages" | "footer" | "audience-config" | "kyc-management" | "reported";

export default function AdminCreatorOnboarding() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();
  const [mainTab, setMainTab] = useState<MainTab>("applications");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  // ── Shared selection state ──
  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<"profile" | "portfolio" | "notes">("profile");
  const [modal, setModal] = useState<"approve"|"reject"|"suspend"|"unsuspend"|"ban"|"unban"|null>(null);
  const [reason, setReason] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Dedicated delete state (kept separate from handleAction to avoid closure issues)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletingCreator, setDeletingCreator] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // ── Reported Creators state ──
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    const r = await adminFetch("/api/admin/creator-reports");
    if (r.ok) { const d = await r.json(); setReports(d.reports ?? []); }
    setReportsLoading(false);
  }, [adminFetch]);

  useEffect(() => { if (mainTab === "reported") loadReports(); }, [mainTab, loadReports]);

  // ── Applications state ──
  const [appCreators, setAppCreators] = useState<any[]>([]);
  const [appTotal, setAppTotal] = useState(0);
  const [appPage, setAppPage] = useState(1);
  const [appSearch, setAppSearch] = useState("");
  const [appLoading, setAppLoading] = useState(false);

  // ── Users List state ──
  const [ulCreators, setUlCreators] = useState<any[]>([]);
  const [ulTotal, setUlTotal] = useState(0);
  const [ulPage, setUlPage] = useState(1);
  const [ulSearch, setUlSearch] = useState("");
  const [ulStatus, setUlStatus] = useState("ALL");
  const [ulLoading, setUlLoading] = useState(false);
  const [statusCounts, setStatusCounts] = useState({ TOTAL: 0, ACTIVE: 0, REJECTED: 0, SUSPENDED: 0, BANNED: 0 });

  // ── Signup Config state ──
  const [configData, setConfigData] = useState<Record<string, any>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [personalFields, setPersonalFields] = useState<any[]>([]);

  // ── Custom Fields state (Signup Config tab) ──
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [savingField, setSavingField] = useState(false);

  // ── Rejection reasons state ──
  const [rejectionReasons, setRejectionReasons] = useState<any[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [rrModal, setRrModal] = useState<"add" | "edit" | null>(null);
  const [rrEditing, setRrEditing] = useState<any | null>(null);
  const [rrReason, setRrReason] = useState("");
  const [rrSolution, setRrSolution] = useState("");
  const [rrSaving, setRrSaving] = useState(false);
  const [rrDeleting, setRrDeleting] = useState<string | null>(null);
  const [rrDeleteConfirm, setRrDeleteConfirm] = useState<string | null>(null);

  const loadRejectionReasons = useCallback(async () => {
    const r = await adminFetch("/api/admin/rejection-reasons");
    if (r.ok) setRejectionReasons(await r.json());
  }, [adminFetch]);

  useEffect(() => { if (mainTab === "reasons-solutions") loadRejectionReasons(); }, [loadRejectionReasons, mainTab]);
  useEffect(() => { if (modal === "reject") loadRejectionReasons(); }, [modal]);

  // ── Fun Questions state ──
  const [funQuestions, setFunQuestions] = useState<any[]>([]);
  const [fqModal, setFqModal] = useState<"add" | "edit" | null>(null);
  const [fqEditing, setFqEditing] = useState<any | null>(null);
  const [fqText, setFqText] = useState("");
  const [fqOptions, setFqOptions] = useState<string[]>(["", ""]);
  const [fqSaving, setFqSaving] = useState(false);
  const [fqDeleteConfirm, setFqDeleteConfirm] = useState<string | null>(null);
  const [fqDeleting, setFqDeleting] = useState<string | null>(null);

  const loadFunQuestions = useCallback(async () => {
    const r = await adminFetch("/api/admin/fun-questions");
    if (r.ok) setFunQuestions(await r.json());
  }, [adminFetch]);

  useEffect(() => { if (mainTab === "fun-questions") loadFunQuestions(); }, [loadFunQuestions, mainTab]);

  const openFqAdd = () => { setFqEditing(null); setFqText(""); setFqOptions(["", ""]); setFqModal("add"); };
  const openFqEdit = (q: any) => {
    setFqEditing(q); setFqText(q.questionText);
    setFqOptions(q.options.length >= 2 ? q.options.map((o: any) => o.optionText) : ["", ""]);
    setFqModal("edit");
  };

  // ── Info Cards state ──
  const [infoTexts, setInfoTexts] = useState<Record<string, string>>({});
  const [savingInfo, setSavingInfo] = useState<string | null>(null);

  // ── Messages state (slab motivational + category messages) ──
  const [slabMessages, setSlabMessages] = useState<any[]>([]);
  const [slabEdits, setSlabEdits] = useState<Record<string, string>>({});
  const [savingSlab, setSavingSlab] = useState<string | null>(null);
  const [catMessages, setCatMessages] = useState<any[]>([]);
  const [newCatMsg, setNewCatMsg] = useState("");
  const [addingCatMsg, setAddingCatMsg] = useState(false);
  const [savingCatMsg, setSavingCatMsg] = useState(false);
  const [editingCatMsgId, setEditingCatMsgId] = useState<string | null>(null);
  const [editingCatMsgText, setEditingCatMsgText] = useState("");
  const [deletingCatMsg, setDeletingCatMsg] = useState<string | null>(null);

  // ── Footer state ──
  const [footerCreatorLinks, setFooterCreatorLinks] = useState("[]");
  const [footerCreatorCopyright, setFooterCreatorCopyright] = useState("© 2025 Collabry. All rights reserved.");
  const [footerCreatorSocials, setFooterCreatorSocials] = useState("{}");
  const [savingFooter, setSavingFooter] = useState(false);

  const loadFooter = useCallback(async () => {
    const r = await adminFetch("/api/landing-content");
    if (!r.ok) return;
    const d: Record<string, string> = await r.json();
    try {
      if (d["footer.creator.links"]) setFooterCreatorLinks(JSON.stringify(JSON.parse(d["footer.creator.links"]), null, 2));
      if (d["footer.creator.copyright"]) setFooterCreatorCopyright(d["footer.creator.copyright"]);
      if (d["footer.creator.socials"]) setFooterCreatorSocials(JSON.stringify(JSON.parse(d["footer.creator.socials"]), null, 2));
    } catch {}
  }, [adminFetch]);

  useEffect(() => { if (mainTab === "footer") loadFooter(); }, [mainTab, loadFooter]);

  const saveFooter = async () => {
    setSavingFooter(true);
    try {
      JSON.parse(footerCreatorLinks); JSON.parse(footerCreatorSocials);
    } catch { showToast("Invalid JSON", false); setSavingFooter(false); return; }
    const updates = [
      ["footer.creator.links", footerCreatorLinks],
      ["footer.creator.copyright", footerCreatorCopyright],
      ["footer.creator.socials", footerCreatorSocials],
    ];
    for (const [key, value] of updates) {
      await adminFetch("/api/landing-content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    }
    setSavingFooter(false);
    showToast("Footer saved");
  };

  const loadMessages = useCallback(async () => {
    const [slabRes, catRes] = await Promise.all([
      adminFetch("/api/admin/slab-messages"),
      adminFetch("/api/admin/category-messages"),
    ]);
    if (slabRes.ok) { const d = await slabRes.json(); setSlabMessages(d); const edits: Record<string, string> = {}; d.forEach((s: any) => { edits[s.id] = s.motivationalMessage ?? ""; }); setSlabEdits(edits); }
    if (catRes.ok) setCatMessages(await catRes.json());
  }, [adminFetch]);

  useEffect(() => { if (mainTab === "messages") loadMessages(); }, [mainTab, loadMessages]);

  const saveSlabMessage = async (slabId: string) => {
    setSavingSlab(slabId);
    await adminFetch(`/api/admin/slab-messages/${slabId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: slabEdits[slabId] ?? "" }) });
    setSavingSlab(null);
    showToast("Slab message saved");
  };

  const addCatMsg = async () => {
    if (!newCatMsg.trim()) return;
    setSavingCatMsg(true);
    const r = await adminFetch("/api/admin/category-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: newCatMsg.trim() }) });
    if (r.ok) { setNewCatMsg(""); setAddingCatMsg(false); loadMessages(); showToast("Message added"); }
    else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
    setSavingCatMsg(false);
  };

  const saveCatMsg = async (id: string) => {
    setSavingCatMsg(true);
    await adminFetch(`/api/admin/category-messages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: editingCatMsgText }) });
    setEditingCatMsgId(null); loadMessages(); showToast("Message saved");
    setSavingCatMsg(false);
  };

  const deleteCatMsg = async (id: string) => {
    setDeletingCatMsg(id);
    await adminFetch(`/api/admin/category-messages/${id}`, { method: "DELETE" });
    setDeletingCatMsg(null); loadMessages();
  };

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const r = await adminFetch(`/api/admin/creators/${id}`);
    if (r.ok) {
      const d = await r.json();
      setDetail(d);
      setAdminNote(d.creator.adminNotes ?? "");
    }
    setLoadingDetail(false);
  }, [adminFetch]);

  useEffect(() => {
    if (selected) { setDetail(null); loadDetail(selected.id); setDetailTab("profile"); }
  }, [selected]);

  // Load applications (PENDING only)
  const loadApplications = useCallback(async () => {
    setAppLoading(true);
    const params = new URLSearchParams({ page: String(appPage), limit: "20", status: "PENDING", search: appSearch });
    const r = await adminFetch(`/api/admin/creators?${params}`);
    if (r.ok) { const d = await r.json(); setAppCreators(d.creators); setAppTotal(d.total); }
    setAppLoading(false);
  }, [adminFetch, appPage, appSearch]);

  // Load users list (non-pending)
  const loadUsersList = useCallback(async () => {
    setUlLoading(true);
    const params = new URLSearchParams({ page: String(ulPage), limit: "20", status: ulStatus, search: ulSearch });
    const r = await adminFetch(`/api/admin/creators?${params}`);
    if (r.ok) { const d = await r.json(); setUlCreators(d.creators); setUlTotal(d.total); }
    setUlLoading(false);
  }, [adminFetch, ulPage, ulStatus, ulSearch]);

  const loadStatusCounts = useCallback(async () => {
    const r = await adminFetch("/api/admin/creators/counts");
    if (r.ok) setStatusCounts(await r.json());
  }, [adminFetch]);

  useEffect(() => { if (mainTab === "applications") loadApplications(); }, [loadApplications, mainTab]);
  useEffect(() => { if (mainTab === "users-list") { loadUsersList(); loadStatusCounts(); } }, [loadUsersList, loadStatusCounts, mainTab]);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    const [cfgR, fieldsR] = await Promise.all([
      adminFetch("/api/admin/creator-signup-config"),
      adminFetch("/api/admin/creator-signup-fields"),
    ]);
    if (cfgR.ok) {
      const d = await cfgR.json();
      setConfigData(d);
      const pfRaw = d["creator_personal_fields"]?.value ?? [];
      const pfLabels: Record<string, string> = { categories: "Categories", gender: "Gender", bio: "Bio", youtubeHandle: "YouTube Handle", otherSocialHandle: "Other Social Handle", creatorImages: "Creator Images (up to 4)" };
      const pfMap: Record<string, any> = {};
      pfRaw.forEach((f: any) => { pfMap[f.key] = f; });
      const pf = PERSONAL_FIELD_KEYS.map(key => pfMap[key] ?? { key, label: pfLabels[key] ?? key, visibility: "optional" });
      setPersonalFields(pf);
      const infos: Record<string, string> = {};
      INFO_STEPS.forEach(s => { infos[s.key] = d[s.key]?.value ?? ""; });
      setInfoTexts(infos);
    }
    if (fieldsR.ok) setCustomFields(await fieldsR.json());
    setLoadingConfig(false);
  }, [adminFetch]);

  useEffect(() => { if (mainTab === "signup-config" || mainTab === "info-cards") loadConfig(); }, [loadConfig, mainTab]);

  // Action handler
  const handleAction = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      let path = ""; let body: Record<string, any> = {};
      if (modal === "approve") path = "approve";
      else if (modal === "reject") {
        const pReasons = (detail?.creator?.pendingReason ?? "").split("|").filter(Boolean);
        const isProfileChange = pReasons.some((r: string) => ["RE_VERIFICATION", "PRICING_CHANGE"].includes(r));
        if (isProfileChange) {
          path = "reject"; body = { reason: reason.trim() || undefined };
        } else {
          if (!selectedReasonId) { showToast("Select a rejection reason", false); setSubmitting(false); return; }
          path = "reject"; body = { reasonId: selectedReasonId };
        }
      } else if (modal === "suspend") {
        if (!reason.trim()) { showToast("Suspension reason required", false); setSubmitting(false); return; }
        path = "suspend"; body = { reason };
      } else if (modal === "unsuspend") path = "unsuspend";
      else if (modal === "ban") {
        if (!reason.trim()) { showToast("Ban reason required", false); setSubmitting(false); return; }
        path = "ban"; body = { reason };
      } else if (modal === "unban") {
        if (!reason.trim()) { showToast("Reason required for unban", false); setSubmitting(false); return; }
        path = "unban"; body = { reason };
      }
      const r = await adminFetch(`/api/admin/creators/${selected.id}/${path}`, { method: "POST", body: JSON.stringify(body) });
      if (r.ok) {
        showToast(`Action applied successfully`);
        setModal(null); setReason(""); setCustomNote(""); setSelectedReasonId("");
        if (mainTab === "applications") { loadApplications(); setSelected(null); setDetail(null); }
        else { loadUsersList(); loadStatusCounts(); loadDetail(selected.id); setSelected((s: any) => ({ ...s, status: path === "unsuspend" || path === "unban" ? "ACTIVE" : path.toUpperCase() })); }
      } else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
    } finally { setSubmitting(false); }
  };

  const handleDeleteCreator = async () => {
    if (!selected) return;
    setDeletingCreator(true);
    try {
      const res = await adminFetch(`/api/admin/creators/${selected.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason: deleteReason.trim() || undefined }),
      });
      if (res.ok) {
        showToast("Creator deleted");
        setShowDeleteModal(false);
        setDeleteReason("");
        setSelected(null);
        setDetail(null);
        if (mainTab === "applications") loadApplications();
        else { loadUsersList(); loadStatusCounts(); }
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error ?? "Failed to delete", false);
      }
    } catch {
      showToast("Network error. Please try again.", false);
    } finally {
      setDeletingCreator(false);
    }
  };

  const saveAdminNote = async () => {
    if (!selected) return;
    setSavingNote(true);
    const r = await adminFetch(`/api/admin/creators/${selected.id}/notes`, { method: "PATCH", body: JSON.stringify({ note: adminNote }) });
    if (r.ok) showToast("Notes saved");
    else showToast("Failed to save notes", false);
    setSavingNote(false);
  };

  // Signup config helpers
  const saveOptionList = async (key: string, value: any) => {
    setSavingConfig(key);
    const r = await adminFetch(`/api/admin/creator-signup-config/${key}`, { method: "PATCH", body: JSON.stringify({ value }) });
    if (r.ok) { showToast("Saved"); loadConfig(); setEditingKey(null); setNewOptionLabel(""); }
    else showToast("Failed to save", false);
    setSavingConfig(null);
  };

  const savePersonalFields = async () => {
    setSavingConfig("creator_personal_fields");
    const r = await adminFetch("/api/admin/creator-signup-config/creator_personal_fields", { method: "PATCH", body: JSON.stringify({ value: personalFields }) });
    if (r.ok) showToast("Personal fields saved");
    else showToast("Failed", false);
    setSavingConfig(null);
  };

  const saveInfoText = async (key: string) => {
    setSavingInfo(key);
    const r = await adminFetch(`/api/admin/creator-signup-config/${key}`, { method: "PATCH", body: JSON.stringify({ value: infoTexts[key] }) });
    if (r.ok) showToast("Info card saved");
    else showToast("Failed", false);
    setSavingInfo(null);
  };

  const addCustomField = async () => {
    if (!newFieldLabel.trim()) return;
    setSavingField(true);
    const r = await adminFetch("/api/admin/creator-signup-fields", { method: "POST", body: JSON.stringify({ label: newFieldLabel.trim(), fieldType: "text", isRequired: newFieldRequired }) });
    if (r.ok) { showToast("Field added"); setAddingField(false); setNewFieldLabel(""); setNewFieldRequired(false); loadConfig(); }
    else showToast("Failed to add field", false);
    setSavingField(false);
  };

  const deleteCustomField = async (id: string) => {
    const r = await adminFetch(`/api/admin/creator-signup-fields/${id}`, { method: "DELETE" });
    if (r.ok) { showToast("Field deleted"); loadConfig(); }
    else showToast("Failed", false);
  };

  const toggleCustomFieldRequired = async (field: any) => {
    const r = await adminFetch(`/api/admin/creator-signup-fields/${field.id}`, { method: "PATCH", body: JSON.stringify({ isRequired: !field.isRequired }) });
    if (r.ok) loadConfig();
    else showToast("Failed", false);
  };

  const getOptions = (key: string): any[] => configData[key]?.value ?? [];
  const fmt = (n: number) => n != null ? `₹${Number(n).toLocaleString("en-IN")}` : "—";

  // Creator list item
  const CreatorRow = ({ c, isSelected, onClick }: { c: any; isSelected: boolean; onClick: () => void }) => {
    const cReasons = (c.pendingReason ?? "").split("|").filter(Boolean);
    const PENDING_BADGES: { key: string; label: string; bg: string; color: string }[] = [
      { key: "", label: "New", bg: "rgba(34,197,94,0.18)", color: "#4ade80" },
      { key: "RE_VERIFICATION", label: "Re-verify", bg: "rgba(251,191,36,0.18)", color: "#fbbf24" },
      { key: "PRICING_CHANGE", label: "Pricing", bg: "rgba(59,130,246,0.18)", color: "#60a5fa" },
    ];
    const rowBadges = c.status === "PENDING"
      ? (cReasons.length === 0
          ? [PENDING_BADGES[0]]
          : PENDING_BADGES.filter(b => b.key && cReasons.includes(b.key)))
      : [];
    return (
    <div onClick={onClick} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 cursor-pointer transition-colors hover:bg-white/2"
      style={{ background: isSelected ? "rgba(240,24,122,0.08)" : "transparent" }}>
      <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
        {c.profilePhotoUrl ? <img src={c.profilePhotoUrl} className="w-full h-full object-cover" alt="" />
        : <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{ background: "#E14F69" }}>{c.fullName?.[0] ?? "C"}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{c.fullName}</p>
        <p className="text-white/70 text-xs truncate">@{c.instagramHandle} · {c.followerCount?.toLocaleString("en-IN")}</p>
        {c.email && <p className="text-white/70 text-xs truncate">{c.email}</p>}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] ?? "bg-white/10 text-white/70"}`}>{c.status}</span>
        {rowBadges.map(b => (
          <span key={b.key || "new"} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: b.bg, color: b.color }}>{b.label}</span>
        ))}
      </div>
    </div>
    );
  };

  // Full creator detail panel (shared by Applications + Users List)
  const DetailPanel = () => {
    if (!selected) return (
      <div className="h-full flex flex-col items-center justify-center">
        <Users className="w-12 h-12 text-white/60 mb-3" />
        <p className="text-white/70 text-sm">Select a creator to review</p>
      </div>
    );
    if (loadingDetail) return (
      <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-[#E14F69] border-t-transparent rounded-full animate-spin" /></div>
    );
    if (!detail) return null;
    const c = detail.creator;

    return (
      <div>
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
            {c.profilePhotoUrl ? <img src={c.profilePhotoUrl} className="w-full h-full object-cover" alt="" />
            : <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold" style={{ background: "#E14F69" }}>{c.fullName?.[0]}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-xl">{c.fullName}</h2>
            <p className="text-white/70 text-sm">@{c.instagramHandle}</p>
            {c.email && <p className="text-white/70 text-xs mt-0.5">{c.email}</p>}
            <p className="text-white/70 text-xs mt-1">{c.followerCount?.toLocaleString("en-IN")} followers</p>
            {(() => {
              const dReasons = (c.pendingReason ?? "").split("|").filter(Boolean);
              return (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-xs px-2.5 py-1 rounded-full inline-block ${STATUS_COLORS[c.status] ?? "bg-white/10 text-white/70"}`}>{c.status}</span>
                  {c.status === "PENDING" && dReasons.length === 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full inline-block font-semibold" style={{ background: "rgba(34,197,94,0.2)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.35)" }}>New Application</span>
                  )}
                  {c.status === "PENDING" && dReasons.includes("RE_VERIFICATION") && (
                    <span className="text-xs px-2.5 py-1 rounded-full inline-block font-semibold" style={{ background: "rgba(251,191,36,0.2)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" }}>Re-Verification</span>
                  )}
                </div>
              );
            })()}
          </div>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            {c.status === "PENDING" && <>
              <button onClick={() => setModal("approve")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#16a34a" }}><CheckCircle className="w-3 h-3" /> Approve</button>
              <button onClick={() => setModal("reject")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#dc2626" }}><XCircle className="w-3 h-3" /> Reject</button>
            </>}
            {c.status === "REJECTED" && <>
              <button onClick={() => setModal("approve")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#16a34a" }}><CheckCircle className="w-3 h-3" /> Approve</button>
            </>}
            {c.status === "ACTIVE" && <button onClick={() => setModal("suspend")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#ea580c" }}><PauseCircle className="w-3 h-3" /> Suspend</button>}
            {c.status === "SUSPENDED" && <button onClick={() => setModal("unsuspend")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#16a34a" }}><PlayCircle className="w-3 h-3" /> Unsuspend</button>}
            {c.status === "BANNED" && <button onClick={() => setModal("unban")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#16a34a" }}><UserCheck className="w-3 h-3" /> Unban</button>}
            {c.status !== "BANNED" && <button onClick={() => setModal("ban")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#7f1d1d" }}><Ban className="w-3 h-3" /> Ban</button>}
            <button onClick={() => setShowDeleteModal(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#450a0a" }}><Trash2 className="w-3 h-3" /> Delete</button>
          </div>
        </div>

        {/* Status notices */}
        {c.status === "REJECTED" && <div className="mb-4 p-3 rounded-xl bg-red-900/20 border border-red-500/20"><p className="text-red-400 text-xs font-medium">Rejected: {c.rejectionReason}</p>{c.rejectionNote && <p className="text-red-400/60 text-xs mt-1">{c.rejectionNote}</p>}</div>}
        {c.status === "BANNED" && <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-900/30"><p className="text-red-400 text-xs font-medium">Banned{c.bannedAt ? ` on ${new Date(c.bannedAt).toLocaleDateString("en-IN")}` : ""}</p>{c.bannedReason && <p className="text-red-400/60 text-xs mt-1">Reason: {c.bannedReason}</p>}</div>}
        {c.status === "SUSPENDED" && <div className="mb-4 p-3 rounded-xl bg-orange-950/30 border border-orange-800/20"><p className="text-orange-400 text-xs font-medium">Suspended{c.suspendedAt ? ` on ${new Date(c.suspendedAt).toLocaleDateString("en-IN")}` : ""}</p>{c.suspensionReason && <p className="text-orange-400/60 text-xs mt-1">Reason: {c.suspensionReason}</p>}</div>}

        {/* Detail tabs */}
        <div className="flex gap-1 mb-5" style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4 }}>
          {(["profile","portfolio","notes"] as const).map(t => (
            <button key={t} onClick={() => setDetailTab(t)} className="flex-1 py-2 text-xs font-medium rounded-lg transition-all capitalize"
              style={{ background: detailTab === t ? "#E14F69" : "transparent", color: detailTab === t ? "white" : "rgba(255,255,255,0.70)" }}>{t === "notes" ? "Admin Notes" : t}</button>
          ))}
        </div>

        {detailTab === "profile" && (
          <div className="space-y-4">
            {(() => {
              const tabReasons = (detail.creator?.pendingReason ?? "").split("|").filter(Boolean);
              const hasReVerify = tabReasons.includes("RE_VERIFICATION");
              return (<>
                {/* Pending Follower Count Change Review */}
                {hasReVerify && detail.creator?.pendingFollowerCount != null && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
                    <p className="text-yellow-300 text-xs font-semibold uppercase tracking-wide mb-3">Follower Count Change Pending Review</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-white/70 text-[11px] mb-1">Current</p>
                        <p className="text-white font-semibold text-sm">{detail.creator?.followerCount?.toLocaleString("en-IN")}</p>
                      </div>
                      <div>
                        <p className="text-yellow-300 text-[11px] mb-1">Requested (pending)</p>
                        <p className="text-yellow-300 font-semibold text-sm">{Number(detail.creator.pendingFollowerCount).toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pending Username (Instagram handle) Change Review */}
                {hasReVerify && detail.creator?.pendingInstagramHandle != null && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
                    <p className="text-yellow-300 text-xs font-semibold uppercase tracking-wide mb-3">Username Change Pending Review</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-white/70 text-[11px] mb-1">Current</p>
                        <p className="text-white font-semibold text-sm">@{detail.creator?.instagramHandle}</p>
                      </div>
                      <div>
                        <p className="text-yellow-300 text-[11px] mb-1">Requested (pending)</p>
                        <p className="text-yellow-300 font-semibold text-sm">@{detail.creator.pendingInstagramHandle}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pending Pricing Change Review */}
                {tabReasons.includes("PRICING_CHANGE") && detail.creator?.pendingPricing && (() => {
                  const pp = detail.creator.pendingPricing as Record<string, { min: number; max: number }>;
                  const fmtAmt = (n: number) => n >= 200000 ? "₹2L+" : n >= 100000 ? `₹${n / 100000}L` : n >= 1000 ? `₹${n / 1000}K` : `₹${n}`;
                  const fmtRange = (mn: number, mx: number) => `${fmtAmt(mn)}–${fmtAmt(mx)}`;
                  const changed = (["reel", "story", "post"] as const).filter(t => pp[t]);
                  if (!changed.length) return null;
                  return (
                    <div className="rounded-xl p-4" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)" }}>
                      <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide mb-3">Pricing Change Pending Review</p>
                      <div className="grid grid-cols-3 gap-3">
                        {changed.map(t => {
                          const p = pp[t];
                          const curMin = detail.creator[`${t}PriceMin`];
                          const curMax = detail.creator[`${t}PriceMax`];
                          return (
                            <div key={t}>
                              <p className="text-white/70 text-[11px] mb-1 capitalize">{t} Price</p>
                              {curMin != null && curMax != null && (
                                <p className="text-white/70 text-xs line-through mb-0.5">{fmtRange(Number(curMin), Number(curMax))}</p>
                              )}
                              <p className="text-blue-300 text-xs font-semibold">{fmtRange(p.min, p.max)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>);
            })()}

            {/* Current photos */}
            {Array.isArray(detail.creator?.images) && detail.creator.images.length > 0 && (
              <div>
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-2">Profile Photos</h3>
                <div className="grid grid-cols-4 gap-2">
                  {detail.creator.images.map((img: string, i: number) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                      <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wide">Personal Information</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Email", c.email || "Not provided"],
                ["Phone", c.phone],
                ["DOB", c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString("en-IN") : "—"],
                ["Gender", c.gender || "—"],
                ["KYC", c.kycStatus],
                ["Joined", new Date(c.createdAt).toLocaleDateString("en-IN")],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-white/70 text-xs mb-0.5">{label}</p>
                  <p className="text-white text-sm break-all">{val}</p>
                </div>
              ))}
            </div>
            {c.bio && <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}><p className="text-white/70 text-xs mb-0.5">Bio</p><p className="text-white text-sm">{c.bio}</p></div>}

            <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wide mt-4">Content & Audience</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Categories", detail.categories?.map((x: any) => x.categoryName).join(", ") || "—"],
                ["Audience", `${c.audienceGenderFemale}% F · ${c.audienceGenderMale}% M`],
                ["Age Group", c.audienceAge || "—"],
                ["Location", c.audienceLocation || "—"],
                ["Content Type", c.contentType || "—"],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-white/70 text-xs mb-0.5">{label}</p>
                  <p className="text-white text-sm">{val}</p>
                </div>
              ))}
            </div>

            <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wide mt-4">Pricing</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Reel", `${fmt(c.reelPriceMin)} – ${fmt(c.reelPriceMax)}`],
                ["Story", `${fmt(c.storyPriceMin)} – ${fmt(c.storyPriceMax)}`],
                ["Post", `${fmt(c.postPriceMin)} – ${fmt(c.postPriceMax)}`],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-white/70 text-xs mb-0.5">{label}</p>
                  <p className="text-white text-sm">{val}</p>
                </div>
              ))}
            </div>

            {(c.youtubeHandle || c.otherSocialHandle) && (
              <>
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wide mt-4">Other Socials</h3>
                <div className="grid grid-cols-2 gap-3">
                  {c.youtubeHandle && <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}><p className="text-white/70 text-xs mb-0.5">YouTube</p><p className="text-white text-sm">{c.youtubeHandle}</p></div>}
                  {c.otherSocialHandle && <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}><p className="text-white/70 text-xs mb-0.5">Other</p><p className="text-white text-sm">{c.otherSocialHandle}</p></div>}
                </div>
              </>
            )}

            {detail.customFieldValues?.length > 0 && (
              <>
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wide mt-4">Custom Fields</h3>
                <div className="grid grid-cols-2 gap-3">
                  {detail.customFieldValues.map((cfv: any) => (
                    <div key={cfv.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-white/70 text-xs mb-0.5">{cfv.label}</p>
                      <p className="text-white text-sm">{cfv.value || "—"}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {detailTab === "portfolio" && (
          <div className="space-y-2">
            {detail.portfolio?.length === 0 ? <p className="text-white/70 text-sm text-center py-8">No portfolio reels</p>
            : detail.portfolio?.map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(240,24,122,0.10)" }}>
                  <svg className="w-3.5 h-3.5 text-[#E14F69]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
                <p className="flex-1 text-white/80 text-xs truncate">{item.videoUrl}</p>
                <a href={item.videoUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <Eye className="w-3 h-3" /> Open
                </a>
              </div>
            ))}
          </div>
        )}

        {detailTab === "notes" && (
          <div>
            <p className="text-white/70 text-xs mb-3">Internal notes — not visible to the creator.</p>
            <textarea className={inputClass + " resize-none mb-3"} rows={6}
              value={adminNote} onChange={e => setAdminNote(e.target.value)}
              placeholder="Add internal notes about this creator..." />
            <button onClick={saveAdminNote} disabled={savingNote}
              className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
              {savingNote ? "Saving..." : "Save Notes"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {toast && <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm text-white shadow-lg ${toast.ok ? "bg-green-700/90" : "bg-red-700/90"}`}>{toast.msg}</div>}

      {/* Action modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold capitalize">{modal} Creator</h3>
              <button onClick={() => { setModal(null); setReason(""); setCustomNote(""); setSelectedReasonId(""); }} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {modal === "reject" && (() => {
              const mReasons = (detail?.creator?.pendingReason ?? "").split("|").filter(Boolean);
              const mIsProfileChange = mReasons.some((r: string) => ["RE_VERIFICATION", "PRICING_CHANGE"].includes(r));
              const mParts: string[] = [];
              if (mReasons.includes("RE_VERIFICATION") && detail?.creator?.pendingFollowerCount != null) mParts.push("follower count");
              if (mReasons.includes("RE_VERIFICATION") && detail?.creator?.pendingInstagramHandle != null) mParts.push("username");
              if (mReasons.includes("PRICING_CHANGE")) mParts.push("pricing");
              return mIsProfileChange ? (
                <div className="mb-4 space-y-2">
                  <p className="text-white/70 text-sm">Rejecting {mParts.join(", ")} change — the creator's current profile will remain active.</p>
                  <textarea className={inputClass + " resize-none"} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional: reason for rejection (visible to creator)" />
                </div>
              ) : null;
            })()}
            {modal === "reject" && (() => {
              const mReasons = (detail?.creator?.pendingReason ?? "").split("|").filter(Boolean);
              const mIsProfileChange = mReasons.some((r: string) => ["RE_VERIFICATION", "PRICING_CHANGE"].includes(r));
              return !mIsProfileChange;
            })() && (
              <div className="space-y-2.5 mb-4">
                <p className="text-white/70 text-sm">Select rejection reason:</p>
                {rejectionReasons.length === 0 ? (
                  <p className="text-white/70 text-xs italic">Loading reasons...</p>
                ) : rejectionReasons.map(rr => (
                  <label key={rr.id} className="flex items-start gap-2 cursor-pointer" onClick={() => setSelectedReasonId(rr.id)}>
                    <div className="w-4 h-4 rounded-full border flex-shrink-0 mt-0.5 flex items-center justify-center" style={{ borderColor: selectedReasonId === rr.id ? "#E14F69" : "rgba(255,255,255,0.20)" }}>
                      {selectedReasonId === rr.id && <div className="w-2 h-2 rounded-full" style={{ background: "#E14F69" }} />}
                    </div>
                    <div>
                      <p className="text-white/80 text-sm leading-snug">{rr.reason}</p>
                      <p className="text-white/70 text-xs leading-snug mt-0.5 line-clamp-2">{rr.solution}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {(modal === "suspend" || modal === "ban") && <div className="mb-4"><label className="block text-white/70 text-sm mb-2">Reason for {modal}</label><textarea className={inputClass + " resize-none"} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={`Why is this creator being ${modal === "ban" ? "banned" : "suspended"}?`} /></div>}
            {modal === "unban" && <div className="mb-4"><label className="block text-white/70 text-sm mb-2">Reason for unbanning</label><textarea className={inputClass + " resize-none"} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this creator being unbanned?" /></div>}
            {modal === "approve" && (() => {
              const aReasons = (detail?.creator?.pendingReason ?? "").split("|").filter(Boolean);
              const aParts: string[] = [];
              if (aReasons.includes("RE_VERIFICATION") && detail?.creator?.pendingFollowerCount != null) aParts.push("follower count");
              if (aReasons.includes("RE_VERIFICATION") && detail?.creator?.pendingInstagramHandle != null) aParts.push("username");
              if (aReasons.includes("PRICING_CHANGE")) aParts.push("pricing");
              return aParts.length > 0
                ? <p className="text-white/80 text-sm mb-4">Approve the updated {aParts.join(", ")} — changes will go live and the creator will be notified.</p>
                : <p className="text-white/80 text-sm mb-4">Approve this creator and notify them.</p>;
            })()}
            {modal === "unsuspend" && <p className="text-white/80 text-sm mb-4">Reactivate this creator's account.</p>}
            <div className="flex gap-3">
              <button onClick={() => { setModal(null); setReason(""); setCustomNote(""); }} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
              <button onClick={handleAction} disabled={submitting} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: modal === "approve" || modal === "unsuspend" || modal === "unban" ? "#16a34a" : "#E14F69" }}>
                {submitting ? "..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Creator modal — separate from handleAction to avoid stale closure */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">Delete Creator</h3>
              <button onClick={() => { setShowDeleteModal(false); setDeleteReason(""); }} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="mb-4 space-y-3">
              <div className="p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <p className="text-red-400 text-sm font-medium">⚠ This action is permanent and cannot be undone.</p>
                <p className="text-red-400/80 text-xs mt-1">The creator's account and all associated data will be permanently deleted. Their email, phone, and Instagram handle will become available for new signups.</p>
              </div>
              <textarea className={inputClass + " resize-none"} rows={2} value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Optional: reason for deletion" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteReason(""); }} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
              <button onClick={handleDeleteCreator} disabled={deletingCreator} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#7f1d1d" }}>
                {deletingCreator ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Field modal */}
      {addingField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">Add Custom Field</h3>
              <button onClick={() => { setAddingField(false); setNewFieldLabel(""); setNewFieldRequired(false); }} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-white/80 text-sm mb-1.5">Field Label</label>
                <input className={inputClass} value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="e.g. City, Niche, Language..." />
              </div>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => setNewFieldRequired(!newFieldRequired)}>
                <div className="w-5 h-5 rounded border flex items-center justify-center"
                  style={{ background: newFieldRequired ? "#E14F69" : "transparent", borderColor: newFieldRequired ? "#E14F69" : "rgba(255,255,255,0.20)" }}>
                  {newFieldRequired && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>}
                </div>
                <span className="text-white/90 text-sm">Required field</span>
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setAddingField(false); setNewFieldLabel(""); setNewFieldRequired(false); }} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
              <button onClick={addCustomField} disabled={savingField || !newFieldLabel.trim()} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
                {savingField ? "Adding..." : "Add Field"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="text-white font-semibold text-lg">Creator Onboarding</h1>
        </div>
        <div className="flex gap-1 flex-wrap" style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4, display: "inline-flex" }}>
          {[["applications","Applications"],["users-list","Users List"],["signup-config","Signup Config"],["info-cards","Info Cards"],["messages","Messages"],["reasons-solutions","Reasons & Solutions"],["fun-questions","Fun Questions"],["footer","Footer"],["audience-config","Audience Config"],["kyc-management","KYC Requests"],["reported","Reported"]].map(([t, l]) => (
            <button key={t} onClick={() => { setMainTab(t as MainTab); setSelected(null); setDetail(null); }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: mainTab === t ? "#E14F69" : "transparent", color: mainTab === t ? "white" : "rgba(255,255,255,0.70)" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── APPLICATIONS TAB ── */}
      {mainTab === "applications" && (
        <div className="flex h-[calc(100vh-120px)]">
          {/* List — hidden on mobile when detail is open */}
          <div className={`${selected ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-80 flex-shrink-0 border-r border-white/8`}>
            <div className="px-4 pt-4 pb-3">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" />
                <input className={inputClass + " pl-9"} placeholder="Search by name or handle..." value={appSearch} onChange={e => { setAppSearch(e.target.value); setAppPage(1); }} />
              </div>
              <p className="text-white/70 text-xs">Showing pending applications only</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {appLoading ? <div className="text-white/70 text-xs text-center py-8">Loading...</div>
              : appCreators.length === 0 ? <div className="text-white/70 text-xs text-center py-8">No pending applications</div>
              : appCreators.map(c => <CreatorRow key={c.id} c={c} isSelected={selected?.id === c.id} onClick={() => setSelected(c)} />)}
            </div>
            {appTotal > 20 && (
              <div className="px-4 py-3 border-t border-white/8 flex items-center justify-between">
                <button onClick={() => setAppPage(p => Math.max(1, p-1))} disabled={appPage === 1} className="text-white/70 text-xs disabled:opacity-30">← Prev</button>
                <span className="text-white/70 text-xs">Page {appPage}</span>
                <button onClick={() => setAppPage(p => p+1)} disabled={appCreators.length < 20} className="text-white/70 text-xs disabled:opacity-30">Next →</button>
              </div>
            )}
          </div>
          {/* Detail — full-screen on mobile when selected */}
          <div className={`${selected ? "flex" : "hidden lg:flex"} flex-1 flex-col overflow-y-auto`}>
            {selected && (
              <button onClick={() => { setSelected(null); setDetail(null); }} className="lg:hidden flex items-center gap-1.5 px-4 pt-4 text-white/70 text-sm hover:text-white flex-shrink-0">
                <ArrowLeft className="w-4 h-4" /> Back to list
              </button>
            )}
            <div className="p-4 lg:p-6 flex-1 min-w-0"><DetailPanel /></div>
          </div>
        </div>
      )}

      {/* ── USERS LIST TAB ── */}
      {mainTab === "users-list" && (
        <div className="flex h-[calc(100vh-120px)]">
          <div className={`${selected ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-96 flex-shrink-0 border-r border-white/8`}>
            {/* Status count cards */}
            <div className="px-3 pt-3 pb-2 flex gap-1.5">
              {[
                { label: "Total", count: statusCounts.TOTAL, status: "ALL", color: "#E14F69" },
                { label: "Active", count: statusCounts.ACTIVE, status: "ACTIVE", color: "#22c55e" },
                { label: "Rejected", count: statusCounts.REJECTED, status: "REJECTED", color: "#ef4444" },
                { label: "Suspended", count: statusCounts.SUSPENDED, status: "SUSPENDED", color: "#f97316" },
                { label: "Banned", count: statusCounts.BANNED, status: "BANNED", color: "#991b1b" },
              ].map(({ label, count, status, color }) => {
                const active = ulStatus === status;
                return (
                  <button key={status} onClick={() => { setUlStatus(status); setUlPage(1); }}
                    title={count >= 1000 ? count.toLocaleString() : undefined}
                    className="flex-1 min-w-0 rounded-xl py-2 px-1 text-center transition-all"
                    style={{ background: active ? `${color}20` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? `${color}60` : "rgba(255,255,255,0.08)"}`, boxShadow: active ? `0 0 8px 0 ${color}30` : "none" }}>
                    <p className="font-bold leading-none mb-0.5 tabular-nums truncate"
                      style={{ fontSize: fmtCount(count).length > 4 ? "11px" : "14px", color: active ? color : "white" }}>
                      {fmtCount(count)}
                    </p>
                    <p className="text-white/70 leading-tight truncate" style={{ fontSize: "9px" }}>{label}</p>
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" />
                <input className={inputClass + " pl-9"} placeholder="Search by name, handle, or email..." value={ulSearch} onChange={e => { setUlSearch(e.target.value); setUlPage(1); }} />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {["ALL","ACTIVE","REJECTED","SUSPENDED","BANNED"].map(s => (
                  <button key={s} onClick={() => { setUlStatus(s); setUlPage(1); }}
                    className="text-xs px-2.5 py-1 rounded-full transition-colors"
                    style={{ background: ulStatus === s ? "#E14F69" : "rgba(255,255,255,0.06)", color: ulStatus === s ? "white" : "rgba(255,255,255,0.70)" }}>{s}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {ulLoading ? <div className="text-white/70 text-xs text-center py-8">Loading...</div>
              : ulCreators.length === 0 ? <div className="text-white/70 text-xs text-center py-8">No creators found</div>
              : ulCreators.map(c => <CreatorRow key={c.id} c={c} isSelected={selected?.id === c.id} onClick={() => setSelected(c)} />)}
            </div>
            {/* Pagination */}
            {ulTotal > 0 && (
              <div className="px-4 py-3 border-t border-white/8">
                <div className="flex items-center justify-between mb-1">
                  <button onClick={() => setUlPage(p => Math.max(1, p-1))} disabled={ulPage === 1} className="text-white/70 text-xs disabled:opacity-30">← Prev</button>
                  <span className="text-white/70 text-xs">{ulPage} / {Math.ceil(ulTotal / 20)} ({ulTotal} total)</span>
                  <button onClick={() => setUlPage(p => p+1)} disabled={ulCreators.length < 20} className="text-white/70 text-xs disabled:opacity-30">Next →</button>
                </div>
                <div className="flex gap-1 justify-center flex-wrap">
                  {Array.from({ length: Math.min(7, Math.ceil(ulTotal / 20)) }, (_, i) => i + 1).map(pg => (
                    <button key={pg} onClick={() => setUlPage(pg)}
                      className="w-7 h-7 rounded-lg text-xs transition-colors"
                      style={{ background: ulPage === pg ? "#E14F69" : "rgba(255,255,255,0.06)", color: ulPage === pg ? "white" : "rgba(255,255,255,0.70)" }}>{pg}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Detail — full-screen on mobile when selected */}
          <div className={`${selected ? "flex" : "hidden lg:flex"} flex-1 flex-col overflow-y-auto`}>
            {selected && (
              <button onClick={() => { setSelected(null); setDetail(null); }} className="lg:hidden flex items-center gap-1.5 px-4 pt-4 text-white/70 text-sm hover:text-white flex-shrink-0">
                <ArrowLeft className="w-4 h-4" /> Back to list
              </button>
            )}
            <div className="p-4 lg:p-6 flex-1 min-w-0"><DetailPanel /></div>
          </div>
        </div>
      )}

      {/* ── SIGNUP CONFIG TAB ── */}
      {mainTab === "signup-config" && (
        <div className="px-6 py-6 max-w-3xl">
          {loadingConfig ? <div className="text-white/70 py-8 text-center">Loading...</div> : (
            <div className="space-y-6">
              {/* Instagram OAuth Toggle */}
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-white font-semibold">Instagram OAuth Login</h3>
                    <p className="text-white/70 text-xs mt-1 leading-relaxed max-w-sm">When enabled, creators will see the Connect with Instagram button on signup. When disabled, only manual entry is shown.</p>
                  </div>
                  <button
                    onClick={() => {
                      const currentVal = configData["instagram_oauth_enabled"]?.value !== false;
                      saveOptionList("instagram_oauth_enabled", !currentVal);
                    }}
                    disabled={savingConfig === "instagram_oauth_enabled"}
                    className="relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-60 mt-0.5"
                    style={{ background: configData["instagram_oauth_enabled"]?.value !== false ? "#E14F69" : "rgba(255,255,255,0.15)" }}>
                    <span
                      className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200"
                      style={{ left: configData["instagram_oauth_enabled"]?.value !== false ? "calc(100% - 1.25rem)" : "0.25rem" }} />
                  </button>
                </div>
              </div>

              {/* Default locked fields */}
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <h3 className="text-white font-semibold mb-1">Default Fields (Locked)</h3>
                <p className="text-white/70 text-xs mb-4">These fields are built-in and cannot be removed.</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { label: "Instagram Handle", required: true },
                    { label: "Profile Photo", required: true },
                    { label: "Follower Count", required: true },
                    { label: "Full Name", required: true },
                    { label: "Date of Birth", required: true },
                    { label: "Email", required: true },
                    { label: "Phone Number", required: true },
                    { label: "Password", required: true },
                    { label: "Audience Details", required: false },
                    { label: "Pricing", required: true },
                    { label: "Portfolio", required: false },
                  ] as { label: string; required: boolean }[]).map(f => (
                    <div key={f.label} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className="text-white/80 text-xs">{f.label}</span>
                      <span className={`text-xs ${f.required ? "text-[#E14F69]" : "text-white/70"}`}>{f.required ? "Required" : "Optional"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Personal field visibility */}
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold">Optional Field Visibility</h3>
                  <button onClick={savePersonalFields} disabled={savingConfig === "creator_personal_fields"}
                    className="px-4 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
                    {savingConfig === "creator_personal_fields" ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className="space-y-3">
                  {personalFields.map((field: any, idx: number) => (
                    <div key={field.key} className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div><p className="text-white text-sm font-medium">{field.label}</p><p className="text-white/70 text-xs">{field.key}</p></div>
                      <select className="bg-transparent border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-[#E14F69]"
                        value={field.visibility}
                        onChange={e => { const updated = [...personalFields]; updated[idx] = { ...field, visibility: e.target.value }; setPersonalFields(updated); }}
                        style={{ background: "#111" }}>
                        <option value="required" style={{ background: "#111" }}>Required</option>
                        <option value="optional" style={{ background: "#111" }}>Optional</option>
                        <option value="hidden" style={{ background: "#111" }}>Hidden</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Fields */}
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-4">
                  <div><h3 className="text-white font-semibold">Custom Fields</h3><p className="text-white/70 text-xs mt-0.5">Shown in signup after Portfolio step. Applies to new signups only.</p></div>
                  <button onClick={() => setAddingField(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold" style={{ background: "#E14F69" }}>
                    <Plus className="w-3 h-3" /> Add Field
                  </button>
                </div>
                {customFields.length === 0 ? (
                  <p className="text-white/70 text-sm text-center py-4">No custom fields added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {customFields.map((field: any) => (
                      <div key={field.id} className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex-1">
                          <p className="text-white text-sm font-medium">{field.label}</p>
                          <p className="text-white/70 text-xs">{field.isRequired ? "Required" : "Optional"} · Text</p>
                        </div>
                        <button onClick={() => toggleCustomFieldRequired(field)}
                          className="text-xs px-2.5 py-1 rounded-full transition-colors"
                          style={{ background: field.isRequired ? "rgba(240,24,122,0.15)" : "rgba(255,255,255,0.06)", color: field.isRequired ? "#E14F69" : "rgba(255,255,255,0.70)", border: `1px solid ${field.isRequired ? "rgba(240,24,122,0.30)" : "rgba(255,255,255,0.10)"}` }}>
                          {field.isRequired ? "Required" : "Optional"}
                        </button>
                        <button onClick={() => deleteCustomField(field.id)} className="text-white/70 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Option lists */}
              {CONFIG_OPTION_KEYS.map(({ key, label }) => {
                const options: any[] = getOptions(key);
                const isEditing = editingKey === key;
                return (
                  <div key={key} className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-semibold">{label}</h3>
                      {!isEditing && <button onClick={() => setEditingKey(key)} className="px-3 py-1 rounded-lg text-white/80 hover:text-white text-xs border border-white/15 flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit</button>}
                      {isEditing && (
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingKey(null); setNewOptionLabel(""); }} className="px-3 py-1 rounded-lg text-white/70 text-xs border border-white/10">Cancel</button>
                          <button onClick={() => saveOptionList(key, options)} disabled={savingConfig === key}
                            className="px-3 py-1 rounded-lg text-white text-xs font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
                            {savingConfig === key ? "Saving..." : "Save"}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {options.map((opt: any, idx: number) => (
                        <div key={opt.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all"
                          style={{ background: opt.isActive ? "rgba(240,24,122,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${opt.isActive ? "#E14F69" : "rgba(255,255,255,0.10)"}`, color: opt.isActive ? "#E14F69" : "rgba(255,255,255,0.70)" }}>
                          {isEditing && (
                            <button onClick={() => {
                              const newOpts = options.map((o: any, i: number) => i === idx ? { ...o, isActive: !o.isActive } : o);
                              setConfigData(d => ({ ...d, [key]: { ...d[key], value: newOpts } }));
                            }} className="w-3 h-3" title={opt.isActive ? "Deactivate" : "Activate"}>
                              <div className={`w-2 h-2 rounded-full mx-auto ${opt.isActive ? "bg-[#E14F69]" : "bg-white/20"}`} />
                            </button>
                          )}
                          {opt.label}
                          {isEditing && (
                            <button onClick={() => {
                              const newOpts = options.filter((_: any, i: number) => i !== idx);
                              setConfigData(d => ({ ...d, [key]: { ...d[key], value: newOpts } }));
                            }} className="text-white/70 hover:text-red-400 ml-0.5"><X className="w-2.5 h-2.5" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                    {isEditing && (
                      <div className="flex gap-2">
                        <input className={inputClass} placeholder="Add new option..." value={newOptionLabel} onChange={e => setNewOptionLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && newOptionLabel.trim()) { const newOpts = [...options, { label: newOptionLabel.trim(), isActive: true }]; setConfigData(d => ({ ...d, [key]: { ...d[key], value: newOpts } })); setNewOptionLabel(""); } }} />
                        <button onClick={() => { if (!newOptionLabel.trim()) return; const newOpts = [...options, { label: newOptionLabel.trim(), isActive: true }]; setConfigData(d => ({ ...d, [key]: { ...d[key], value: newOpts } })); setNewOptionLabel(""); }}
                          className="px-3 py-2 rounded-lg text-white text-sm" style={{ background: "rgba(240,24,122,0.20)", border: "1px solid rgba(240,24,122,0.30)" }}>
                          <Plus className="w-4 h-4 text-[#E14F69]" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── INFO CARDS TAB ── */}
      {mainTab === "info-cards" && (
        <div className="px-6 py-6 max-w-2xl">
          <p className="text-white/70 text-sm mb-5">Edit the info popup content shown on each step of the creator signup.</p>
          {loadingConfig ? <div className="text-white/70 py-8 text-center">Loading...</div> : (
            <div className="space-y-4">
              {INFO_STEPS.map(({ key, label }) => (
                <div key={key} className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-medium text-sm">{label}</h3>
                    <button onClick={() => saveInfoText(key)} disabled={savingInfo === key}
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
                      {savingInfo === key ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <textarea className={inputClass + " resize-none"} rows={3}
                    value={infoTexts[key] ?? ""}
                    onChange={e => setInfoTexts(t => ({ ...t, [key]: e.target.value }))}
                    placeholder="Enter info popup content for this step..." />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MESSAGES TAB ── */}
      {mainTab === "messages" && (
        <div className="px-6 py-6 max-w-2xl space-y-8">
          {/* Slab Motivational Messages */}
          <div>
            <h2 className="text-white font-semibold text-lg mb-1">Slab Motivational Messages</h2>
            <p className="text-white/70 text-sm mb-5">Message shown to creators after entering their follower count, based on which slab they fall into.</p>
            {slabMessages.length === 0 ? (
              <div className="text-white/70 text-sm text-center py-8">Loading slabs...</div>
            ) : (
              <div className="space-y-3">
                {slabMessages.map(slab => (
                  <div key={slab.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-white font-medium text-sm">{slab.label}</p>
                        <p className="text-white/70 text-xs">{(slab.minFollowers ?? 0).toLocaleString("en-IN")} – {slab.maxFollowers ? slab.maxFollowers.toLocaleString("en-IN") : "∞"} followers</p>
                      </div>
                      <button onClick={() => saveSlabMessage(slab.id)} disabled={savingSlab === slab.id}
                        className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
                        {savingSlab === slab.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                    <textarea className={inputClass + " resize-none"} rows={2}
                      placeholder="e.g. Congratulations! You are a Nano Creator. Brands love working with genuine voices."
                      value={slabEdits[slab.id] ?? ""}
                      onChange={e => setSlabEdits(prev => ({ ...prev, [slab.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category Motivational Messages */}
          <div>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-white font-semibold text-lg">Category Messages</h2>
                <p className="text-white/70 text-sm mt-1 mb-5">One random active message is shown to creators after selecting their content categories.</p>
              </div>
              <button onClick={() => setAddingCatMsg(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0"
                style={{ background: "#E14F69" }}>
                <Plus className="w-4 h-4" /> Add Message
              </button>
            </div>

            {addingCatMsg && (
              <div className="rounded-2xl p-4 mb-4" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.30)" }}>
                <textarea className={inputClass + " resize-none mb-3"} rows={2} placeholder="Type a motivational message..."
                  value={newCatMsg} onChange={e => setNewCatMsg(e.target.value)} autoFocus />
                <div className="flex gap-2">
                  <button onClick={() => setAddingCatMsg(false)} className="flex-1 py-2 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
                  <button onClick={addCatMsg} disabled={savingCatMsg || !newCatMsg.trim()}
                    className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
                    {savingCatMsg ? "Adding..." : "Add"}
                  </button>
                </div>
              </div>
            )}

            {catMessages.length === 0 && !addingCatMsg ? (
              <div className="text-white/70 text-sm text-center py-8">No category messages yet. Click Add Message to create one.</div>
            ) : (
              <div className="space-y-3">
                {catMessages.map(cm => (
                  <div key={cm.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {editingCatMsgId === cm.id ? (
                      <div>
                        <textarea className={inputClass + " resize-none mb-3"} rows={2}
                          value={editingCatMsgText} onChange={e => setEditingCatMsgText(e.target.value)} autoFocus />
                        <div className="flex gap-2">
                          <button onClick={() => setEditingCatMsgId(null)} className="flex-1 py-2 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
                          <button onClick={() => saveCatMsg(cm.id)} disabled={savingCatMsg}
                            className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#E14F69" }}>
                            {savingCatMsg ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <p className="text-white text-sm flex-1 leading-relaxed">{cm.message}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => { setEditingCatMsgId(cm.id); setEditingCatMsgText(cm.message); }}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteCatMsg(cm.id)} disabled={deletingCatMsg === cm.id}
                            className="p-1.5 rounded-lg hover:bg-red-900/30 text-white/70 hover:text-red-400 transition-colors disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REASONS & SOLUTIONS TAB ── */}
      {mainTab === "reasons-solutions" && (
        <div className="px-6 py-6 max-w-2xl">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-white font-semibold text-lg">Rejection Reasons & Solutions</h2>
              <p className="text-white/70 text-sm mt-1">These reasons appear when rejecting a creator. Each reason has a solution shown to the creator.</p>
            </div>
            <button onClick={() => { setRrModal("add"); setRrReason(""); setRrSolution(""); setRrEditing(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0"
              style={{ background: "#E14F69" }}>
              <Plus className="w-4 h-4" /> Add New
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {rejectionReasons.length === 0 ? (
              <div className="text-white/70 text-sm text-center py-12">No reasons yet. Click Add New to create one.</div>
            ) : rejectionReasons.map(rr => (
              <div key={rr.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium leading-snug">{rr.reason}</p>
                    <p className="text-white/70 text-xs leading-relaxed mt-1 line-clamp-2">{rr.solution}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => { setRrEditing(rr); setRrReason(rr.reason); setRrSolution(rr.solution); setRrModal("edit"); }}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setRrDeleteConfirm(rr.id)}
                      className="p-1.5 rounded-lg hover:bg-red-900/30 text-white/70 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fun Questions tab */}
      {mainTab === "fun-questions" && (
        <div className="px-6 py-6 max-w-2xl">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-white font-semibold text-lg">Fun Questions</h2>
              <p className="text-white/70 text-sm mt-1">Active creators answer these to complete their profile. Maximum 10 active questions. Each question must have 2–4 options.</p>
              <p className="text-white/70 text-xs mt-1">{funQuestions.length}/10 active questions</p>
            </div>
            <button onClick={openFqAdd} disabled={funQuestions.length >= 10}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 disabled:opacity-40"
              style={{ background: "#E14F69" }}>
              <Plus className="w-4 h-4" /> Add New
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {funQuestions.length === 0 ? (
              <div className="text-white/70 text-sm text-center py-12">No fun questions yet. Click Add New to create one.</div>
            ) : funQuestions.map(q => (
              <div key={q.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium leading-snug">{q.questionText}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {q.options.map((o: any) => (
                        <span key={o.id} className="text-white/80 text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(240,24,122,0.10)", border: "1px solid rgba(240,24,122,0.20)" }}>{o.optionText}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openFqEdit(q)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setFqDeleteConfirm(q.id)} className="p-1.5 rounded-lg hover:bg-red-900/30 text-white/70 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Fun Question modal */}
      {fqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-semibold">{fqModal === "add" ? "Add Fun Question" : "Edit Fun Question"}</h3>
              <button onClick={() => setFqModal(null)} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {fqModal === "edit" && (
              <p className="text-yellow-400/70 text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.25)" }}>
                Editing this question will clear all existing creator answers.
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-white/80 text-sm mb-1.5">Question Text</label>
                <input className={inputClass} value={fqText} onChange={e => setFqText(e.target.value)} placeholder="e.g. What's your go-to coffee order?" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-white/80 text-sm">Options ({fqOptions.length}/4)</label>
                  {fqOptions.length < 4 && (
                    <button onClick={() => setFqOptions([...fqOptions, ""])} className="text-[#E14F69] text-xs font-semibold">+ Add option</button>
                  )}
                </div>
                <div className="space-y-2">
                  {fqOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={inputClass} value={opt} placeholder={`Option ${i + 1}`}
                        onChange={e => setFqOptions(fqOptions.map((o, idx) => idx === i ? e.target.value : o))} />
                      {fqOptions.length > 2 && (
                        <button onClick={() => setFqOptions(fqOptions.filter((_, idx) => idx !== i))}
                          className="px-2.5 rounded-xl text-white/70 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setFqModal(null)} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
              <button disabled={fqSaving || !fqText.trim() || fqOptions.filter(o => o.trim()).length < 2} onClick={async () => {
                setFqSaving(true);
                try {
                  const url = fqModal === "edit" ? `/api/admin/fun-questions/${fqEditing.id}` : "/api/admin/fun-questions";
                  const method = fqModal === "edit" ? "PATCH" : "POST";
                  const r = await adminFetch(url, { method, body: JSON.stringify({ questionText: fqText.trim(), options: fqOptions.map(o => o.trim()).filter(Boolean) }) });
                  if (r.ok) { showToast(fqModal === "add" ? "Question added" : "Question updated"); setFqModal(null); loadFunQuestions(); }
                  else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
                } finally { setFqSaving(false); }
              }} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                style={{ background: "#E14F69" }}>
                {fqSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Fun Question confirm */}
      {fqDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <h3 className="text-white font-semibold mb-2">Delete Fun Question?</h3>
            <p className="text-white/70 text-sm mb-5">This will permanently remove the question and all answers from creators.</p>
            <div className="flex gap-3">
              <button onClick={() => setFqDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
              <button disabled={fqDeleting === fqDeleteConfirm} onClick={async () => {
                setFqDeleting(fqDeleteConfirm);
                try {
                  const r = await adminFetch(`/api/admin/fun-questions/${fqDeleteConfirm}`, { method: "DELETE" });
                  if (r.ok) { showToast("Question deleted"); setFqDeleteConfirm(null); loadFunQuestions(); }
                  else showToast("Failed to delete", false);
                } finally { setFqDeleting(null); }
              }} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: "#dc2626" }}>
                {fqDeleting === fqDeleteConfirm ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Reason modal */}
      {rrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-semibold">{rrModal === "add" ? "Add New Reason" : "Edit Reason"}</h3>
              <button onClick={() => setRrModal(null)} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-white/80 text-sm mb-1.5">Rejection Reason</label>
                <input className={inputClass} value={rrReason} onChange={e => setRrReason(e.target.value)}
                  placeholder="e.g. Instagram profile not verified" />
              </div>
              <div>
                <label className="block text-white/80 text-sm mb-1.5">Solution (shown to creator)</label>
                <textarea className={inputClass + " resize-none"} rows={4} value={rrSolution} onChange={e => setRrSolution(e.target.value)}
                  placeholder="e.g. Make sure you sent Hi to @CollabryOfficial from your registered Instagram handle..." />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setRrModal(null)} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
              <button disabled={rrSaving || !rrReason.trim() || !rrSolution.trim()} onClick={async () => {
                setRrSaving(true);
                try {
                  const url = rrModal === "edit" ? `/api/admin/rejection-reasons/${rrEditing.id}` : "/api/admin/rejection-reasons";
                  const method = rrModal === "edit" ? "PATCH" : "POST";
                  const r = await adminFetch(url, { method, body: JSON.stringify({ reason: rrReason.trim(), solution: rrSolution.trim() }) });
                  if (r.ok) { showToast(rrModal === "add" ? "Reason added" : "Reason updated"); setRrModal(null); loadRejectionReasons(); }
                  else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
                } finally { setRrSaving(false); }
              }} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                style={{ background: "#E14F69" }}>
                {rrSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Tab */}
      {mainTab === "footer" && (
        <div className="px-6 py-6 max-w-2xl space-y-6">
          <div>
            <h2 className="text-white font-semibold text-lg">Creator Footer</h2>
            <p className="text-white/70 text-sm mt-1">Configure the footer shown on all creator pages. Uses JSON format for links and socials.</p>
          </div>

          <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <label className="block text-white/80 text-sm font-medium mb-1.5">Copyright Text</label>
              <input className={inputClass} value={footerCreatorCopyright} onChange={e => setFooterCreatorCopyright(e.target.value)}
                placeholder="© 2025 Collabry. All rights reserved." />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-1.5">Navigation Links (JSON)</label>
              <p className="text-white/70 text-xs mb-2">Array of {"{ label, href }"}. Leave empty <code>{"[]"}</code> to use defaults.</p>
              <textarea className={inputClass + " resize-none font-mono text-xs"} rows={6} value={footerCreatorLinks} onChange={e => setFooterCreatorLinks(e.target.value)}
                placeholder={`[\n  { "label": "Home", "href": "/home-creator" },\n  { "label": "Profile", "href": "/home-creator/profile" }\n]`} />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-1.5">Social Links (JSON)</label>
              <p className="text-white/70 text-xs mb-2">Object with optional keys: instagram, youtube, twitter, linkedin.</p>
              <textarea className={inputClass + " resize-none font-mono text-xs"} rows={5} value={footerCreatorSocials} onChange={e => setFooterCreatorSocials(e.target.value)}
                placeholder={`{\n  "instagram": "https://instagram.com/collabry",\n  "linkedin": "https://linkedin.com/company/collabry"\n}`} />
            </div>

            <button onClick={saveFooter} disabled={savingFooter}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
              style={{ background: "#E14F69" }}>
              {savingFooter ? "Saving..." : "Save Footer"}
            </button>
          </div>
        </div>
      )}

      {mainTab === "audience-config" && <AudienceConfigTab adminFetch={adminFetch} />}
      {mainTab === "kyc-management" && <KYCManagementTab adminFetch={adminFetch} />}
      {mainTab === "reported" && (
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-base" style={{ fontFamily: POPPINS }}>Reported Creators</h2>
            <button onClick={loadReports} className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>
              Refresh
            </button>
          </div>
          {reportsLoading ? (
            <div className="text-white/60 text-sm py-6 text-center" style={{ fontFamily: POPPINS }}>Loading…</div>
          ) : reports.length === 0 ? (
            <div className="py-12 text-center rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-white/50 text-sm" style={{ fontFamily: POPPINS }}>No reports submitted yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((rep: any) => (
                <div key={rep.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-start gap-3">
                    {rep.creatorPhoto
                      ? <img src={rep.creatorPhoto} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm" style={{ background: "#E14F69" }}>{(rep.creatorName?.[0] ?? "C").toUpperCase()}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>{rep.creatorName ?? "—"}</span>
                        <span className="text-white/55 text-xs" style={{ fontFamily: POPPINS }}>@{rep.creatorHandle}</span>
                      </div>
                      <p className="text-white/50 text-[11px] mb-2" style={{ fontFamily: POPPINS }}>
                        Reported by <span className="text-white/75 font-medium">{rep.brandName}</span>
                        {" · "}{new Date(rep.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        {", "}{new Date(rep.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </p>
                      <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                        <p className="text-red-300 text-xs leading-relaxed break-words" style={{ fontFamily: POPPINS, wordBreak: "break-word", overflowWrap: "break-word" }}>{rep.reason}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirm modal */}
      {rrDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.80)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <h3 className="text-white font-semibold mb-2">Delete Reason?</h3>
            <p className="text-white/70 text-sm mb-5">This reason will no longer appear in the rejection dropdown. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setRrDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm">Cancel</button>
              <button disabled={rrDeleting === rrDeleteConfirm} onClick={async () => {
                setRrDeleting(rrDeleteConfirm);
                try {
                  const r = await adminFetch(`/api/admin/rejection-reasons/${rrDeleteConfirm}`, { method: "DELETE" });
                  if (r.ok) { showToast("Reason deleted"); setRrDeleteConfirm(null); loadRejectionReasons(); }
                  else showToast("Failed to delete", false);
                } finally { setRrDeleting(null); }
              }} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: "#dc2626" }}>
                {rrDeleting === rrDeleteConfirm ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   AUDIENCE FIELD CONFIG TAB
═══════════════════════════════════════════════════════════════════ */
const BASE_URL_ACO = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

function AudienceConfigTab({ adminFetch }: { adminFetch: (path: string, opts?: RequestInit) => Promise<Response> }) {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminFetch(`${BASE_URL_ACO}/api/admin/audience-fields`)
      .then(r => r.json()).then(setFields).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const patch = async (id: string, body: Record<string, boolean>) => {
    setSaving(id);
    try {
      const r = await adminFetch(`${BASE_URL_ACO}/api/admin/audience-fields/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { load(); setMsg("Saved"); setTimeout(() => setMsg(null), 2000); }
    } finally { setSaving(null); }
  };

  if (loading) return <div className="p-6 text-white/70 text-sm">Loading…</div>;

  return (
    <div className="px-6 py-6 max-w-2xl space-y-4">
      <div>
        <h2 className="text-white font-semibold text-lg">Audience Fields</h2>
        <p className="text-white/70 text-sm mt-1">Control which fields creators must fill in during signup, and which are shown to brands on profiles.</p>
      </div>
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="px-5 py-2.5 grid grid-cols-3 gap-2" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-white/70 text-xs col-span-1">Field</p>
          <p className="text-white/70 text-xs text-center">Required (signup)</p>
          <p className="text-white/70 text-xs text-center">Visible to brands</p>
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className="px-5 py-3.5 grid grid-cols-3 gap-2 items-center" style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderBottom: i < fields.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <div>
              <p className="text-white text-sm font-medium">{f.label}</p>
              <p className="text-white/70 text-xs">{f.fieldKey}</p>
            </div>
            <div className="flex justify-center">
              <button
                disabled={saving === f.id}
                onClick={() => patch(f.id, { isRequired: !f.isRequired })}
                className="w-11 h-6 rounded-full transition-all flex-shrink-0 disabled:opacity-50"
                style={{ background: f.isRequired ? "#E14F69" : "rgba(255,255,255,0.15)" }}>
                <div className="w-5 h-5 m-0.5 rounded-full bg-white transition-all" style={{ transform: f.isRequired ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>
            <div className="flex justify-center">
              <button
                disabled={saving === f.id}
                onClick={() => patch(f.id, { isVisible: !f.isVisible })}
                className="w-11 h-6 rounded-full transition-all flex-shrink-0 disabled:opacity-50"
                style={{ background: f.isVisible ? "#10b981" : "rgba(255,255,255,0.15)" }}>
                <div className="w-5 h-5 m-0.5 rounded-full bg-white transition-all" style={{ transform: f.isVisible ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-xs text-white/70">
        <span><span className="text-[#E14F69]">■</span> Required = creators must fill in during signup</span>
        <span><span className="text-[#10b981]">■</span> Visible = shown to brands on profiles</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   KYC MANAGEMENT TAB
═══════════════════════════════════════════════════════════════════ */

function KYCManagementTab({ adminFetch }: { adminFetch: (path: string, opts?: RequestInit) => Promise<Response> }) {
  const [subTab, setSubTab] = useState<"requests" | "docs">("requests");

  return (
    <div className="px-6 py-6 max-w-3xl">
      <div className="mb-5">
        <h2 className="text-white font-semibold text-lg">KYC Management</h2>
        <p className="text-white/70 text-sm mt-1">Manage KYC requests and configure required documents.</p>
      </div>
      <div className="flex gap-2 mb-6">
        {([["requests","KYC Requests"],["docs","Required Docs"]] as const).map(([t, l]) => (
          <button key={t} onClick={() => setSubTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: subTab === t ? "#E14F69" : "rgba(255,255,255,0.07)",
              color: "white",
              border: subTab === t ? "none" : "1px solid rgba(255,255,255,0.10)",
            }}>{l}</button>
        ))}
      </div>
      {subTab === "requests" && <KYCRequestsSection adminFetch={adminFetch} />}
      {subTab === "docs" && <KYCDocsSection adminFetch={adminFetch} />}
    </div>
  );
}

function KYCRequestsSection({ adminFetch }: { adminFetch: (path: string, opts?: RequestInit) => Promise<Response> }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [actionModal, setActionModal] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const load = (p: number, s: string, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), ...(s !== "ALL" ? { status: s } : {}), ...(q.trim() ? { search: q.trim() } : {}) });
    adminFetch(`${BASE_URL_ACO}/api/admin/kyc-requests?${params}`)
      .then(r => r.json())
      .then(d => { setRequests(d.requests ?? []); setTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1, filterStatus, search); setPage(1); }, [filterStatus]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1, filterStatus, search); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const doAction = async () => {
    if (!detail) return;
    setSubmitting(true);
    try {
      const path = actionModal === "approve"
        ? `${BASE_URL_ACO}/api/admin/kyc-requests/${detail.id}/approve`
        : `${BASE_URL_ACO}/api/admin/kyc-requests/${detail.id}/reject`;
      const r = await adminFetch(path, {
        method: "POST",
        body: actionModal === "reject" ? JSON.stringify({ reason }) : undefined,
      });
      if (r.ok) {
        setMsg({ text: actionModal === "approve" ? "KYC approved — creator notified" : "KYC rejected — creator notified", ok: true });
        setActionModal(null); setDetail(null); setReason(""); load(page, filterStatus, search);
      } else { setMsg({ text: "Action failed", ok: false }); }
    } catch { setMsg({ text: "Error", ok: false }); }
    finally { setSubmitting(false); setTimeout(() => setMsg(null), 3500); }
  };

  const statusColor = (s: string) => s === "VERIFIED" ? "#4ade80" : s === "SUBMITTED" ? "#60a5fa" : s === "REJECTED" ? "#f87171" : "#94a3b8";
  const statusBg   = (s: string) => s === "VERIFIED" ? "rgba(34,197,94,0.15)" : s === "SUBMITTED" ? "rgba(59,130,246,0.15)" : s === "REJECTED" ? "rgba(239,68,68,0.15)" : "rgba(148,163,184,0.12)";
  const statusLabel = (s: string) => s === "VERIFIED" ? "Verified" : s === "SUBMITTED" ? "Under Review" : s === "REJECTED" ? "Rejected" : "Not Submitted";

  return (
    <div className="space-y-4">
      {msg && <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${msg.ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>{msg.text}</div>}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by @username…"
          className="w-full pl-8 pr-4 py-2 rounded-xl text-sm text-white outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {["ALL","SUBMITTED","VERIFIED","REJECTED"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: filterStatus === s ? "#E14F69" : "rgba(255,255,255,0.07)", color: filterStatus === s ? "white" : "rgba(255,255,255,0.75)" }}>
            {s === "ALL" ? "All Applicants" : s === "SUBMITTED" ? "Under Review" : s === "VERIFIED" ? "Verified" : "Rejected"}
          </button>
        ))}
      </div>

      {loading ? <div className="text-white/70 text-sm py-4">Loading…</div> : requests.length === 0 ? (
        <p className="text-white/70 text-sm py-4">No KYC submissions found.</p>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{r.fullName}</p>
                <p className="text-white/70 text-xs">@{r.instagramHandle} · {r.kycSubmittedAt ? new Date(r.kycSubmittedAt).toLocaleDateString("en-IN") : "Never submitted"}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-lg font-semibold flex-shrink-0" style={{ background: statusBg(r.kycStatus), color: statusColor(r.kycStatus) }}>
                {statusLabel(r.kycStatus)}
              </span>
              <button onClick={() => setDetail(r)} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 text-white"
                style={{ background: "rgba(240,24,122,0.20)", border: "1px solid rgba(240,24,122,0.40)" }}>
                View Details
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p, filterStatus, search); }}
            disabled={page <= 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.90)" }}>← Prev</button>
          <span className="text-white/70 text-xs">{page} / {totalPages} · {total} total</span>
          <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); load(p, filterStatus, search); }}
            disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.90)" }}>Next →</button>
        </div>
      )}

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.88)" }}
          onClick={e => { if (e.target === e.currentTarget) { setDetail(null); setActionModal(null); setReason(""); } }}>
          <div className="w-full max-w-lg rounded-2xl p-5 overflow-y-auto" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)", maxHeight: "90vh" }}>

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-white font-bold text-base">{detail.fullName}</h3>
                <p className="text-white/70 text-xs mt-0.5">@{detail.instagramHandle} · Submitted {detail.kycSubmittedAt ? new Date(detail.kycSubmittedAt).toLocaleDateString("en-IN") : "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-lg font-semibold" style={{ background: statusBg(detail.kycStatus), color: statusColor(detail.kycStatus) }}>
                  {statusLabel(detail.kycStatus)}
                </span>
                <button onClick={() => { setDetail(null); setActionModal(null); setReason(""); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <X className="w-4 h-4 text-white/80" />
                </button>
              </div>
            </div>

            {/* KYC field values */}
            {Array.isArray(detail.kycData) && detail.kycData.length > 0 ? (
              <div className="space-y-3 mb-5">
                <p className="text-white/70 text-xs uppercase tracking-wider mb-2">Submitted Documents</p>
                {(detail.kycData as Array<{ fieldLabel: string; value: string; fileUrl: string | null }>).map((d, i) => (
                  <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-white/70 text-[11px] mb-1.5 uppercase tracking-wider">{d.fieldLabel}</p>
                    {(() => {
                      if (!d.fileUrl) {
                        return <p className="text-white text-sm font-medium">{d.value || "—"}</p>;
                      }
                      // Handle both legacy data: URLs and new /api/storage/private/<key>.<ext> paths.
                      const isImage = d.fileUrl.startsWith("data:image/") || /\.(jpe?g|png|webp)(\?|$)/i.test(d.fileUrl);
                      const isPdf = d.fileUrl.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(d.fileUrl);
                      if (isImage) {
                        return (
                          <button onClick={() => setLightbox(d.fileUrl)} className="w-full text-left group relative">
                            <img src={d.fileUrl} alt={d.fieldLabel} className="max-h-48 rounded-xl object-contain w-full transition-opacity group-hover:opacity-80" style={{ background: "rgba(0,0,0,0.30)" }} />
                            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl text-white text-xs font-semibold" style={{ background: "rgba(0,0,0,0.45)" }}>
                              🔍 Click to enlarge
                            </span>
                          </button>
                        );
                      }
                      if (isPdf) {
                        return (
                          <a href={d.fileUrl} download={`${d.fieldLabel}.pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg font-semibold" style={{ background: "rgba(240,24,122,0.15)", color: "#E14F69" }}>
                            📄 Download PDF
                          </a>
                        );
                      }
                      return <p className="text-white text-sm">{d.value}</p>;
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-5 py-6 text-center rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-white/70 text-sm">No documents submitted yet</p>
              </div>
            )}

            {/* Rejection reason if previously rejected */}
            {detail.kycStatus === "REJECTED" && detail.kycRejectionReason && (
              <div className="mb-4 px-3 py-2.5 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}>
                <p className="text-red-400/70 text-[11px] uppercase tracking-wider mb-1">Previous Rejection Reason</p>
                <p className="text-red-300 text-sm">{detail.kycRejectionReason}</p>
              </div>
            )}

            {/* Action section */}
            {detail.kycStatus === "SUBMITTED" && !actionModal && (
              <div className="flex gap-3 pt-2">
                <button onClick={() => setActionModal("reject")} className="flex-1 py-2.5 rounded-xl text-red-400 text-sm font-semibold"
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>Reject</button>
                <button onClick={() => setActionModal("approve")} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold"
                  style={{ background: "#16a34a" }}>Approve KYC</button>
              </div>
            )}

            {actionModal === "approve" && (
              <div className="pt-2 space-y-3">
                <p className="text-white/80 text-sm">This will mark the creator's KYC as verified and send them a notification.</p>
                <div className="flex gap-3">
                  <button onClick={() => setActionModal(null)} className="flex-1 py-2.5 rounded-xl border text-sm text-white/80" style={{ borderColor: "rgba(255,255,255,0.15)" }}>Back</button>
                  <button onClick={doAction} disabled={submitting} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#16a34a" }}>
                    {submitting ? "Approving…" : "Confirm Approve"}
                  </button>
                </div>
              </div>
            )}

            {actionModal === "reject" && (
              <div className="pt-2 space-y-3">
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                  className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none resize-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)" }}
                  placeholder="Reason for rejection — shown to creator with the notification…" />
                <div className="flex gap-3">
                  <button onClick={() => { setActionModal(null); setReason(""); }} className="flex-1 py-2.5 rounded-xl border text-sm text-white/80" style={{ borderColor: "rgba(255,255,255,0.15)" }}>Back</button>
                  <button onClick={doAction} disabled={submitting || !reason.trim()} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#dc2626" }}>
                    {submitting ? "Rejecting…" : "Confirm Reject"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.95)" }}
          onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.12)" }}>
            <X className="w-5 h-5 text-white" />
          </button>
          <img src={lightbox} alt="Document preview" className="max-w-full max-h-[90vh] rounded-2xl object-contain"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

    </div>
  );
}

function KYCDocsSection({ adminFetch }: { adminFetch: (path: string, opts?: RequestInit) => Promise<Response> }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const showMsg = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000); };

  const load = () => {
    setLoading(true);
    adminFetch(`${BASE_URL_ACO}/api/admin/kyc-fields`)
      .then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const addDoc = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      const r = await adminFetch(`${BASE_URL_ACO}/api/admin/kyc-fields`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), isRequired: newRequired, fieldType: "document" }),
      });
      if (r.ok) { showMsg("Document added"); setNewLabel(""); setAdding(false); load(); }
      else showMsg("Failed to add", false);
    } catch { showMsg("Error", false); }
    finally { setSaving(false); }
  };

  const cycleState = async (doc: any) => {
    let patch: Record<string, boolean>;
    if (doc.isActive && doc.isRequired) patch = { isActive: true, isRequired: false };
    else if (doc.isActive && !doc.isRequired) patch = { isActive: false, isRequired: false };
    else patch = { isActive: true, isRequired: true };
    try {
      const r = await adminFetch(`${BASE_URL_ACO}/api/admin/kyc-fields/${doc.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (r.ok) setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, ...patch } : d));
      else showMsg("Save failed", false);
    } catch { showMsg("Error", false); }
  };

  const remove = async (doc: any) => {
    if (!confirm(`Delete "${doc.label}"? This cannot be undone.`)) return;
    try {
      const r = await adminFetch(`${BASE_URL_ACO}/api/admin/kyc-fields/${doc.id}`, { method: "DELETE" });
      if (r.ok) { showMsg("Document deleted"); setDocs(prev => prev.filter(d => d.id !== doc.id)); }
      else showMsg("Failed", false);
    } catch { showMsg("Error", false); }
  };

  if (loading) return <div className="text-white/70 text-sm">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-white/70 text-sm">Configure which documents creators must upload to complete KYC verification.</p>
        <button onClick={() => setAdding(v => !v)}
          className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: adding ? "rgba(255,255,255,0.08)" : "#E14F69" }}>
          <Plus className="w-4 h-4" /> Add Doc
        </button>
      </div>

      {msg && <div className={`px-4 py-3 rounded-xl text-sm font-medium ${msg.ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>{msg.text}</div>}

      {adding && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(240,24,122,0.07)", border: "1px solid rgba(240,24,122,0.2)" }}>
          <p className="text-white text-sm font-semibold">New KYC Document</p>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E14F69] placeholder:text-white/70"
            placeholder="e.g. Aadhaar Card, PAN Card, Bank Passbook…" />
          <div className="flex items-center gap-3">
            <label className="text-white/80 text-sm">Required:</label>
            <button onClick={() => setNewRequired(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: newRequired ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)", color: newRequired ? "#4ade80" : "rgba(255,255,255,0.70)", border: `1px solid ${newRequired ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}` }}>
              {newRequired ? "Yes — Mandatory" : "No — Optional"}
            </button>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setAdding(false); setNewLabel(""); }} className="flex-1 py-2 rounded-lg border text-sm text-white/70" style={{ borderColor: "rgba(255,255,255,0.12)" }}>Cancel</button>
            <button onClick={addDoc} disabled={saving || !newLabel.trim()} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#E14F69" }}>
              {saving ? "Adding…" : "Add Document"}
            </button>
          </div>
        </div>
      )}

      {docs.length === 0 && !adding && (
        <div className="text-center py-8">
          <p className="text-white/70 text-sm">No KYC documents configured.</p>
          <p className="text-white/70 text-xs mt-1">Add documents that creators must upload for verification.</p>
        </div>
      )}

      <div className="space-y-2">
        {docs.map(doc => (
          <div key={doc.id} className="flex items-center gap-4 px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">{doc.label}</p>
              <p className="text-white/70 text-xs capitalize">{doc.fieldType ?? "document"}</p>
            </div>
            <button onClick={() => cycleState(doc)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
              style={{
                background: !doc.isActive ? "rgba(99,102,241,0.15)" : doc.isRequired ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)",
                color: !doc.isActive ? "#818cf8" : doc.isRequired ? "#4ade80" : "rgba(255,255,255,0.70)",
                border: `1px solid ${!doc.isActive ? "rgba(99,102,241,0.3)" : doc.isRequired ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}`,
              }}>
              {!doc.isActive ? "Hidden" : doc.isRequired ? "Required" : "Optional"}
            </button>
            <button onClick={() => remove(doc)} className="flex-shrink-0 p-1.5 rounded-lg text-white/70 hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
