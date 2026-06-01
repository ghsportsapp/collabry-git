import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, CheckCircle, XCircle, Eye, Sparkles, ShieldCheck, ShieldX, FileText, Handshake, Package, PackageCheck, FileVideo, RotateCcw, Star, AlertTriangle, Coins, Megaphone } from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { CreatorLayout, PINK, POPPINS, BG } from "@/components/CreatorNavLayout";
import LockedFeatureModal from "@/components/LockedFeatureModal";

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(date).toLocaleDateString("en-IN");
}

function notifIcon(type: string) {
  switch (type) {
    case "PROFILE_APPROVED":     return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "PROFILE_REJECTED":     return <XCircle className="w-5 h-5 text-red-400" />;
    case "PROFILE_UNDER_REVIEW": return <Eye className="w-5 h-5 text-yellow-400" />;
    case "NEW_FUN_QUESTIONS":    return <Sparkles className="w-5 h-5" style={{ color: PINK }} />;
    case "KYC_APPROVED":         return <ShieldCheck className="w-5 h-5 text-green-400" />;
    case "KYC_REJECTED":         return <ShieldX className="w-5 h-5 text-red-400" />;
    case "FIELD_REQUIRED":       return <FileText className="w-5 h-5 text-yellow-400" />;
    case "REQUEST_RECEIVED":     return <Handshake className="w-5 h-5" style={{ color: PINK }} />;
    case "REQUEST_ACCEPTED":     return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "REQUEST_REJECTED":     return <XCircle className="w-5 h-5 text-red-400" />;
    case "REQUEST_COUNTERED":    return <RotateCcw className="w-5 h-5 text-yellow-400" />;
    case "DEAL_LIVE":            return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "PRODUCT_SHIPPED":      return <Package className="w-5 h-5 text-blue-400" />;
    case "PRODUCT_RECEIVED":     return <PackageCheck className="w-5 h-5 text-green-400" />;
    case "PRODUCT_RESHIPPED":    return <Package className="w-5 h-5 text-yellow-400" />;
    case "DEAL_CONCEPT_SUBMITTED":
    case "DEAL_CONCEPT_RESUBMITTED": return <FileVideo className="w-5 h-5" style={{ color: PINK }} />;
    case "DEAL_CONCEPT_REVISION_REQUESTED": return <RotateCcw className="w-5 h-5 text-yellow-400" />;
    case "DEAL_CONCEPT_APPROVED": return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "DEAL_CONTENT_SUBMITTED":
    case "DEAL_CONTENT_RESUBMITTED": return <FileVideo className="w-5 h-5 text-blue-400" />;
    case "DEAL_CONTENT_REVISION_REQUESTED": return <RotateCcw className="w-5 h-5 text-yellow-400" />;
    case "DEAL_CONTENT_APPROVED": return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "DEAL_FINAL_POST_CONFIRMED": return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "DEAL_COMPLETED":       return <Star className="w-5 h-5 text-yellow-400" />;
    case "DEAL_OVERDUE_CREATOR": return <AlertTriangle className="w-5 h-5 text-red-400" />;
    case "PAYOUT_PENDING_KYC":   return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    case "PAYOUT_RELEASED":      return <Coins className="w-5 h-5 text-green-400" />;
    case "DELIVERY_WARNING":     return <Package className="w-5 h-5 text-yellow-400" />;
    case "MAKE_IT_REQUEST":      return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    case "AWB_CONFIRMED":        return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "AWB_UPDATED":          return <Package className="w-5 h-5 text-blue-400" />;
    case "DEAL_CANCELLED":       return <XCircle className="w-5 h-5 text-red-400" />;
    case "NON_DELIVERY_RESOLVED": return <ShieldCheck className="w-5 h-5 text-green-400" />;
    case "DELIVERY_EXTENDED":    return <Package className="w-5 h-5 text-blue-400" />;
    case "CAMPAIGN_LIVE":        return <Megaphone className="w-5 h-5" style={{ color: PINK }} />;
    case "INVOICE_READY":        return <FileText className="w-5 h-5" style={{ color: PINK }} />;
    default:                     return <Bell className="w-5 h-5 text-white/80" />;
  }
}

function getNotifUrl(n: any): string | null {
  const type       = n.type              as string;
  const entityType = n.relatedEntityType as string | null;
  const entityId   = n.relatedEntityId   as string | null;
  const id = entityId ?? "";

  // Invoice
  if (type === "INVOICE_READY") return "/home-creator/earnings";

  // Campaign / barter
  if (type === "CAMPAIGN_LIVE" || type === "APPLICATION_SHORTLISTED")
    return entityId
      ? (entityType === "BARTER_CAMPAIGN" ? `/home-creator/barter/${id}` : `/home-creator/campaigns/${id}`)
      : "/home-creator/campaigns";

  if (["APPLICATION_APPROVED", "CREATOR_SELECTED"].includes(type))
    return entityId ? `/home-creator/campaigns/${id}` : "/home-creator/campaigns";

  // Requests
  if (type === "REQUEST_RECEIVED" || type === "REQUEST_COUNTERED") return "/home-creator/requests";
  if (type === "REQUEST_ACCEPTED")
    return entityId ? `/home-creator/deals?tab=pending&deal=${id}` : "/home-creator/deals?tab=pending";
  if (type === "REQUEST_REJECTED")
    return entityId ? `/home-creator/deals?tab=cancelled&deal=${id}` : "/home-creator/deals?tab=cancelled";

  // Live-deal types (product, content, revisions, shipping, dispute)
  if ([
    "DEAL_LIVE", "PRODUCT_SHIPPED", "PRODUCT_RESHIPPED", "PRODUCT_RECEIVED",
    "DEAL_CONCEPT_REVISION_REQUESTED", "DEAL_CONTENT_REVISION_REQUESTED",
    "DELIVERY_WARNING", "MAKE_IT_REQUEST", "AWB_CONFIRMED", "AWB_UPDATED",
    "DELIVERY_EXTENDED", "DEAL_OVERDUE_CREATOR", "DEAL_DISPUTE_OPENED",
  ].includes(type))
    return entityId ? `/home-creator/deals?tab=live&deal=${id}` : "/home-creator/deals?tab=live";

  // Completed-deal types
  if ([
    "DEAL_COMPLETED", "DEAL_FINAL_POST_CONFIRMED",
    "DEAL_CONCEPT_APPROVED", "DEAL_CONTENT_APPROVED",
  ].includes(type))
    return entityId ? `/home-creator/deals?tab=completed&deal=${id}` : "/home-creator/deals?tab=completed";

  // Payout
  if (type === "PAYOUT_RELEASED" || type === "PAYOUT_READY") return "/home-creator/earnings";
  if (type === "PAYOUT_PENDING_KYC") return "/home-creator/profile#kyc";

  // Cancelled / resolved
  if (type === "DEAL_CANCELLED" || type === "NON_DELIVERY_RESOLVED")
    return entityId ? `/home-creator/deals?tab=cancelled&deal=${id}` : "/home-creator/deals?tab=cancelled";

  // Profile / KYC
  if (type === "PROFILE_APPROVED") return "/home-creator";
  if (["PROFILE_REJECTED", "PROFILE_UNDER_REVIEW", "FIELD_REQUIRED"].includes(type))
    return "/home-creator/profile";
  if (type === "KYC_APPROVED" || type === "KYC_REJECTED") return "/home-creator/profile#kyc";

  if (type === "NEW_FUN_QUESTIONS") return "/home-creator";

  // Entity-based fallback
  if (type === "DEAL_CHAT_MESSAGE")
    return entityId ? `/home-creator/deals?tab=live&deal=${id}&chat=1` : "/home-creator/deals?tab=live";

  if (entityType === "Deal" || entityType === "DEAL")
    return entityId ? `/home-creator/deals?tab=live&deal=${id}` : "/home-creator/deals?tab=live";
  if (entityType === "DealRequest") return "/home-creator/requests";
  if (entityType === "Campaign" && entityId) return `/home-creator/campaigns/${id}`;
  if (entityType === "BARTER_CAMPAIGN" && entityId) return `/home-creator/barter/${id}`;

  return null;
}

function isCampaignNotif(n: any): boolean {
  const type = n.type as string;
  const entityType = n.relatedEntityType as string | null;
  return (
    type === "CAMPAIGN_LIVE" ||
    type === "APPLICATION_SHORTLISTED" ||
    entityType === "Campaign" ||
    entityType === "BARTER_CAMPAIGN"
  );
}

export default function CreatorNotifications() {
  const { apiFetch, accessToken, loading } = useCreatorAuth();
  const [, navigate] = useLocation();
  const [items, setItems] = useState<any[]>([]);
  const [loadingNotif, setLoadingNotif] = useState(true);
  const [status, setStatus] = useState<string>("PENDING");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showLocked, setShowLocked] = useState(false);

  useEffect(() => {
    if (!loading && !accessToken) { navigate("/login-creator"); return; }
    if (!loading && accessToken) {
      Promise.all([
        apiFetch("/api/creator/notifications").then(r => r.json()),
        apiFetch("/api/creator/home").then(r => r.json()),
      ]).then(([n, h]) => {
        setItems(n.notifications ?? []);
        setStatus(h.status ?? "PENDING");
        apiFetch("/api/creator/notifications/mark-all-read", { method: "PATCH" }).catch(() => {});
      }).finally(() => setLoadingNotif(false));
    }
  }, [loading, accessToken]);

  const markAllRead = async () => {
    await apiFetch("/api/creator/notifications/mark-all-read", { method: "PATCH" });
    setItems(items.map(i => ({ ...i, isRead: true })));
  };

  function handleClick(n: any) {
    if (status !== "ACTIVE" && isCampaignNotif(n)) { setShowLocked(true); return; }
    const url = getNotifUrl(n);
    if (url) navigate(url);
  }

  return (
    <CreatorLayout status={status} onLocked={() => {}}>
      {showLocked && <LockedFeatureModal onClose={() => setShowLocked(false)} />}
      <div className="px-4 md:px-0">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/home-creator")} className="text-white/80 hover:text-white md:hidden">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-white font-bold text-lg" style={{ fontFamily: POPPINS }}>Notifications</h1>
          </div>
          {items.some(i => !i.isRead) && (
            <button onClick={markAllRead} className="text-sm font-semibold" style={{ color: PINK, fontFamily: POPPINS }}>
              Mark all as read
            </button>
          )}
        </div>

        {loadingNotif ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: PINK, borderTopColor: "transparent" }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(255,255,255,0.04)" }}>
              <Bell className="w-7 h-7 text-white/70" />
            </div>
            <p className="text-white font-semibold text-base" style={{ fontFamily: POPPINS }}>No notifications yet</p>
            <p className="text-white/70 text-sm mt-1" style={{ fontFamily: POPPINS }}>You will see important updates here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(n => {
              const isHovered = hoveredId === n.id;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{
                    background: isHovered
                      ? (n.isRead ? "rgba(255,255,255,0.04)" : "rgba(240,24,122,0.17)")
                      : (n.isRead ? "transparent" : "rgba(240,24,122,0.10)"),
                    border: `1px solid ${n.isRead ? (isHovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)") : "rgba(240,24,122,0.25)"}`,
                    cursor: "pointer",
                    transition: "background 0.15s, border-color 0.15s",
                    transform: isHovered ? "translateY(-1px)" : "none",
                  }}
                >
                  <div className="flex-shrink-0 mt-0.5">{notifIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold leading-snug" style={{ fontFamily: POPPINS }}>{n.title}</p>
                    <p className="text-white/80 text-xs mt-0.5 leading-relaxed" style={{ fontFamily: POPPINS }}>{n.body}</p>
                    <p className="text-white/70 text-[10px] mt-1.5" style={{ fontFamily: POPPINS }}>{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: PINK }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CreatorLayout>
  );
}
