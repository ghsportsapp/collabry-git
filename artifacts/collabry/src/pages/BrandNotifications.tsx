import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Bell, CheckCircle, XCircle, Handshake, Package, PackageCheck,
  FileVideo, RotateCcw, ShieldCheck, AlertTriangle, Coins, Star, Sparkles, FileText,
} from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import { BrandLayout, PINK, POPPINS, BG } from "@/components/BrandLayout";

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
    case "REQUEST_ACCEPTED":     return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "REQUEST_REJECTED":     return <XCircle className="w-5 h-5 text-red-400" />;
    case "REQUEST_COUNTERED":    return <Handshake className="w-5 h-5 text-yellow-400" />;
    case "PAYMENT_SUCCESS":      return <Coins className="w-5 h-5 text-green-400" />;
    case "DEAL_LIVE":            return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "PRODUCT_RECEIVED":     return <PackageCheck className="w-5 h-5 text-green-400" />;
    case "DEAL_CONCEPT_SUBMITTED":
    case "DEAL_CONCEPT_RESUBMITTED": return <FileVideo className="w-5 h-5" style={{ color: PINK }} />;
    case "DEAL_CONTENT_SUBMITTED":
    case "DEAL_CONTENT_RESUBMITTED": return <FileVideo className="w-5 h-5 text-blue-400" />;
    case "DEAL_FINAL_POST_CONFIRMED": return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "DEAL_COMPLETED":       return <Star className="w-5 h-5 text-yellow-400" />;
    case "DEAL_DISPUTE_RESOLVED": return <ShieldCheck className="w-5 h-5 text-green-400" />;
    case "DEAL_OVERDUE_BRAND":   return <AlertTriangle className="w-5 h-5 text-red-400" />;
    case "PAYOUT_PENDING_KYC":   return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    case "FIELD_REQUIRED":       return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    case "BRAND_APPROVED":       return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "BRAND_REJECTED":       return <XCircle className="w-5 h-5 text-red-400" />;
    case "WELCOME_CREDITS":      return <Sparkles className="w-5 h-5" style={{ color: PINK }} />;
    case "ADMIN_GIFT_RECEIVED":  return <Coins className="w-5 h-5" style={{ color: PINK }} />;
    case "ADMIN_CREDIT_REMOVED": return <Coins className="w-5 h-5 text-red-400" />;
    case "AWB_WRONG_RAISED":     return <Package className="w-5 h-5 text-yellow-400" />;
    case "PRODUCT_ISSUE_RAISED": return <AlertTriangle className="w-5 h-5 text-red-400" />;
    case "CREATOR_CANNOT_PROCEED": return <AlertTriangle className="w-5 h-5 text-red-400" />;
    case "NON_DELIVERY_RESOLVED": return <ShieldCheck className="w-5 h-5 text-green-400" />;
    case "DELIVERY_EXTENDED":    return <Package className="w-5 h-5 text-blue-400" />;
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
  if (type === "INVOICE_READY") return "/home-brand";

  // Profile / approval
  if (type === "BRAND_APPROVED" || type === "BRAND_REJECTED" || type === "FIELD_REQUIRED") return "/home-brand";

  // Credits / wallet
  if (["ADMIN_GIFT_RECEIVED", "ADMIN_CREDIT_REMOVED", "WELCOME_CREDITS", "CREDITS_ADDED"].includes(type))
    return "/home-brand/credits";

  // Applications / campaign status
  if (["APPLICATION_SUBMITTED", "CREATOR_APPLIED", "NEW_APPLICANT", "BRAND_3DAY_APPLICANTS",
       "CAMPAIGN_APPROVED", "CAMPAIGN_REJECTED"].includes(type))
    return entityId ? `/home-brand/campaigns/${id}` : "/home-brand/campaigns";

  // Campaign / barter entity fallback
  if (entityType === "Campaign" && entityId) return `/home-brand/campaigns/${id}`;
  if (entityType === "BARTER_CAMPAIGN" && entityId) return `/home-brand/barter/${id}`;

  // Pending-deal types
  if (["REQUEST_ACCEPTED", "REQUEST_COUNTERED", "PAYMENT_REQUIRED"].includes(type))
    return entityId ? `/home-brand/deals?tab=pending&deal=${id}` : "/home-brand/deals?tab=pending";
  if (type === "REQUEST_REJECTED")
    return entityId ? `/home-brand/deals?tab=cancelled&deal=${id}` : "/home-brand/deals?tab=cancelled";

  // Live-deal types
  if ([
    "DEAL_LIVE", "PAYMENT_SUCCESS", "PRODUCT_RECEIVED",
    "DEAL_CONCEPT_SUBMITTED", "DEAL_CONCEPT_RESUBMITTED",
    "DEAL_CONTENT_SUBMITTED", "DEAL_CONTENT_RESUBMITTED",
    "DEAL_FINAL_POST_CONFIRMED", "DEAL_OVERDUE_BRAND",
    "AWB_WRONG_RAISED", "PRODUCT_ISSUE_RAISED",
    "NON_DELIVERY_RESOLVED", "DELIVERY_EXTENDED",
    "DEAL_DISPUTE_RESOLVED", "DEAL_DISPUTE_OPENED",
    "CREATOR_CANNOT_PROCEED", "REFUND_TO_BRAND",
  ].includes(type))
    return entityId ? `/home-brand/deals?tab=live&deal=${id}` : "/home-brand/deals?tab=live";

  // Completed
  if (type === "DEAL_COMPLETED")
    return entityId ? `/home-brand/deals?tab=completed&deal=${id}` : "/home-brand/deals?tab=completed";

  // Cancelled
  if (type === "DEAL_CANCELLED")
    return entityId ? `/home-brand/deals?tab=cancelled&deal=${id}` : "/home-brand/deals?tab=cancelled";

  // Chat / entity-based fallback
  if (type === "DEAL_CHAT_MESSAGE")
    return entityId ? `/home-brand/deals?tab=live&deal=${id}&chat=1` : "/home-brand/deals?tab=live";

  if (entityType === "Deal" || entityType === "DEAL")
    return entityId ? `/home-brand/deals?tab=live&deal=${id}` : "/home-brand/deals?tab=live";
  if (entityType === "DealRequest")
    return entityId ? `/home-brand/deals?tab=pending&deal=${id}` : "/home-brand/deals?tab=pending";

  return null;
}

export default function BrandNotifications() {
  const { apiFetch, brandId, loading: authLoading } = useBrandAuth();
  const [, navigate] = useLocation();
  const [items, setItems] = useState<any[]>([]);
  const [loadingNotif, setLoadingNotif] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { total: credits } = useBrandCredits();

  useEffect(() => {
    if (!authLoading && !brandId) { navigate("/login-brand"); return; }
    if (!authLoading && brandId) {
      apiFetch("/api/brand/notifications").then(r => r.json()).then((n) => {
        setItems(n.notifications ?? []);
        apiFetch("/api/brand/notifications/mark-all-read", { method: "PATCH" }).catch(() => {});
      }).finally(() => setLoadingNotif(false));
    }
  }, [authLoading, brandId]);

  const markAllRead = async () => {
    await apiFetch("/api/brand/notifications/mark-all-read", { method: "PATCH" });
    setItems(items.map(i => ({ ...i, isRead: true })));
  };

  function handleClick(n: any) {
    const url = getNotifUrl(n);
    if (url) navigate(url);
  }

  return (
    <BrandLayout credits={credits}>
      <div className="lg:max-w-6xl lg:mx-auto lg:px-6 lg:pt-6">
      <div className="px-4 md:px-0">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/home-brand")} className="text-white/80 hover:text-white md:hidden">
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
                    <p className="text-white/80 text-xs mt-0.5 leading-relaxed" style={{ fontFamily: POPPINS }}>
                      {typeof n.body === "string" ? n.body : n.body ? JSON.stringify(n.body) : ""}
                    </p>
                    <p className="text-white/70 text-[10px] mt-1.5" style={{ fontFamily: POPPINS }}>{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: PINK }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </BrandLayout>
  );
}
