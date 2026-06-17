import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Bell, Home, Mail, Handshake, Megaphone, User, LogOut, CheckCircle, XCircle, Eye, Sparkles, ShieldCheck, ShieldX, FileText, Package, PackageCheck, FileVideo, RotateCcw, Star, AlertTriangle, Coins, ExternalLink } from "lucide-react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import Footer from "@/components/landing/Footer";
import { useCreatorSSE } from "@/hooks/useCreatorSSE";
import { pushCreatorToast, CreatorToastHost } from "@/components/CreatorToast";
import { usePopupQueue } from "@/hooks/usePopupQueue";
import GlobalPopup from "@/components/GlobalPopup";
import KycPopup from "@/components/KycPopup";
import LockedFeatureModal from "@/components/LockedFeatureModal";

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(date).toLocaleDateString("en-IN");
}

function creatorNotifIcon(type: string, pink: string) {
  switch (type) {
    case "PROFILE_APPROVED":     return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "PROFILE_REJECTED":     return <XCircle className="w-4 h-4 text-red-400" />;
    case "PROFILE_UNDER_REVIEW": return <Eye className="w-4 h-4 text-yellow-400" />;
    case "NEW_FUN_QUESTIONS":    return <Sparkles className="w-4 h-4" style={{ color: pink }} />;
    case "KYC_APPROVED":         return <ShieldCheck className="w-4 h-4 text-green-400" />;
    case "KYC_REJECTED":         return <ShieldX className="w-4 h-4 text-red-400" />;
    case "FIELD_REQUIRED":       return <FileText className="w-4 h-4 text-yellow-400" />;
    case "REQUEST_RECEIVED":     return <Handshake className="w-4 h-4" style={{ color: pink }} />;
    case "REQUEST_ACCEPTED":     return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "REQUEST_REJECTED":     return <XCircle className="w-4 h-4 text-red-400" />;
    case "REQUEST_COUNTERED":    return <RotateCcw className="w-4 h-4 text-yellow-400" />;
    case "DEAL_LIVE":            return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "PRODUCT_SHIPPED":      return <Package className="w-4 h-4 text-blue-400" />;
    case "PRODUCT_RECEIVED":     return <PackageCheck className="w-4 h-4 text-green-400" />;
    case "DEAL_CONCEPT_SUBMITTED":
    case "DEAL_CONCEPT_RESUBMITTED": return <FileVideo className="w-4 h-4" style={{ color: pink }} />;
    case "DEAL_CONCEPT_REVISION_REQUESTED": return <RotateCcw className="w-4 h-4 text-yellow-400" />;
    case "DEAL_CONCEPT_APPROVED": return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "DEAL_CONTENT_SUBMITTED":
    case "DEAL_CONTENT_RESUBMITTED": return <FileVideo className="w-4 h-4 text-blue-400" />;
    case "DEAL_CONTENT_REVISION_REQUESTED": return <RotateCcw className="w-4 h-4 text-yellow-400" />;
    case "DEAL_CONTENT_APPROVED": return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "DEAL_FINAL_POST_CONFIRMED": return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "DEAL_COMPLETED":       return <Star className="w-4 h-4 text-yellow-400" />;
    case "DEAL_OVERDUE_CREATOR": return <AlertTriangle className="w-4 h-4 text-red-400" />;
    case "PAYOUT_PENDING_KYC":   return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
    case "PAYOUT_RELEASED":      return <Coins className="w-4 h-4 text-green-400" />;
    case "DELIVERY_WARNING":     return <Package className="w-4 h-4 text-yellow-400" />;
    case "AWB_CONFIRMED":        return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "AWB_UPDATED":          return <Package className="w-4 h-4 text-blue-400" />;
    case "DEAL_CANCELLED":       return <XCircle className="w-4 h-4 text-red-400" />;
    case "NON_DELIVERY_RESOLVED": return <ShieldCheck className="w-4 h-4 text-green-400" />;
    case "DELIVERY_EXTENDED":    return <Package className="w-4 h-4 text-blue-400" />;
    case "CAMPAIGN_LIVE":        return <Megaphone className="w-4 h-4" style={{ color: pink }} />;
    case "INVOICE_READY":        return <FileText className="w-4 h-4" style={{ color: pink }} />;
    default:                     return <Bell className="w-4 h-4 text-white/80" />;
  }
}

function getCreatorNotifUrl(n: any): string | null {
  const type       = n.type              as string;
  const entityType = n.relatedEntityType as string | null;
  const entityId   = n.relatedEntityId   as string | null;
  const id = entityId ?? "";

  if (type === "INVOICE_READY") return "/home-creator/earnings";

  if (type === "CAMPAIGN_LIVE" || type === "APPLICATION_SHORTLISTED")
    return entityId
      ? (entityType === "BARTER_CAMPAIGN" ? `/home-creator/barter/${id}` : `/home-creator/campaigns/${id}`)
      : "/home-creator/campaigns";

  if (["APPLICATION_APPROVED","CREATOR_SELECTED"].includes(type))
    return entityId ? `/home-creator/campaigns/${id}` : "/home-creator/campaigns";

  if (type === "REQUEST_RECEIVED" || type === "REQUEST_COUNTERED")
    return entityId ? `/home-creator/requests` : "/home-creator/requests";
  if (type === "REQUEST_ACCEPTED")
    return entityId ? `/home-creator/deals?tab=pending&deal=${id}` : "/home-creator/deals?tab=pending";
  if (type === "REQUEST_REJECTED")
    return entityId ? `/home-creator/deals?tab=cancelled&deal=${id}` : "/home-creator/deals?tab=cancelled";

  if (["DEAL_LIVE","PRODUCT_SHIPPED","PRODUCT_RESHIPPED","PRODUCT_RECEIVED",
       "DEAL_CONCEPT_REVISION_REQUESTED","DEAL_CONTENT_REVISION_REQUESTED",
       "DELIVERY_WARNING","MAKE_IT_REQUEST","AWB_CONFIRMED","AWB_UPDATED",
       "DELIVERY_EXTENDED","DEAL_OVERDUE_CREATOR","DEAL_DISPUTE_OPENED"].includes(type))
    return entityId ? `/home-creator/deals?tab=live&deal=${id}` : "/home-creator/deals?tab=live";

  if (["DEAL_COMPLETED","DEAL_FINAL_POST_CONFIRMED","DEAL_CONCEPT_APPROVED","DEAL_CONTENT_APPROVED"].includes(type))
    return entityId ? `/home-creator/deals?tab=completed&deal=${id}` : "/home-creator/deals?tab=completed";

  if (type === "PAYOUT_RELEASED" || type === "PAYOUT_READY") return "/home-creator/earnings";
  if (type === "PAYOUT_PENDING_KYC") return "/home-creator/profile#kyc";

  if (type === "DEAL_CANCELLED" || type === "NON_DELIVERY_RESOLVED")
    return entityId ? `/home-creator/deals?tab=cancelled&deal=${id}` : "/home-creator/deals?tab=cancelled";

  if (type === "PROFILE_APPROVED") return "/home-creator";
  if (["PROFILE_REJECTED","PROFILE_UNDER_REVIEW","FIELD_REQUIRED"].includes(type))
    return "/home-creator/profile";
  if (type === "KYC_APPROVED" || type === "KYC_REJECTED") return "/home-creator/profile#kyc";

  if (type === "DEAL_CHAT_MESSAGE")
    return entityId ? `/home-creator/deals?tab=live&deal=${id}&chat=1` : "/home-creator/deals?tab=live";

  if (entityType === "Deal" || entityType === "DEAL")
    return entityId ? `/home-creator/deals?tab=live&deal=${id}` : "/home-creator/deals?tab=live";
  if (entityType === "DealRequest") return "/home-creator/requests";
  if (entityType === "Campaign" && entityId) return `/home-creator/campaigns/${id}`;
  if (entityType === "BARTER_CAMPAIGN" && entityId) return `/home-creator/barter/${id}`;
  return null;
}

export const POPPINS = "'Poppins', sans-serif";
export const PINK = "#E14F69";
export const BG = "#0A0A0F";

const NAV_TABS = [
  { icon: Home, label: "Home", path: "/home-creator", badgeKey: null as null },
  { icon: Mail, label: "Request", path: "/home-creator/requests", badgeKey: "requests" as const },
  { icon: Handshake, label: "Deals", path: "/home-creator/deals", badgeKey: "deals" as const },
  { icon: Megaphone, label: "Campaign", path: "/home-creator/campaigns", badgeKey: "campaigns" as const },
  { icon: User, label: "Profile", path: "/home-creator/profile", badgeKey: null as null },
];

type BadgeKey = "requests" | "deals" | "campaigns";
type Badges = Record<BadgeKey, number>;

function isActiveTab(location: string, path: string): boolean {
  if (path === "/home-creator") return location === "/home-creator";
  return location === path || location.startsWith(path + "/");
}

function useCreatorNavBadges() {
  const { apiFetch, accessToken } = useCreatorAuth();
  const [badges, setBadges] = useState<Badges>({ requests: 0, deals: 0, campaigns: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBadges = () => {
    if (!accessToken) return;
    apiFetch("/api/creator/nav-badges").then(r => r.json()).then((d: Badges) => {
      setBadges({ requests: d.requests ?? 0, deals: d.deals ?? 0, campaigns: d.campaigns ?? 0 });
    }).catch(() => {});
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchBadges();
    intervalRef.current = setInterval(fetchBadges, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [accessToken]);

  const clearBadge = (key: BadgeKey) => {
    if (badges[key] <= 0) return;
    apiFetch(`/api/creator/nav-badges/${key}`, { method: "PATCH" }).then(() => {
      setBadges(b => ({ ...b, [key]: 0 }));
    }).catch(() => {});
  };

  return { badges, clearBadge };
}

/* ── Sticky top header: logo + (desktop nav) + bell + logout ── */
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

export function CreatorHeader({ badges, clearBadge, status = "", onLocked, onPopup }: { badges: Badges; clearBadge: (k: BadgeKey) => void; status?: string; onLocked?: () => void; onPopup?: (p: import("@/hooks/useCreatorSSE").PopupSSEPayload) => void }) {
  const [location, navigate] = useLocation();
  const [dropdownLocked, setDropdownLocked] = useState(false);
  const { clearAuth, apiFetch, accessToken } = useCreatorAuth();
  const [showLogout, setShowLogout] = useState(false);
  const [unread, setUnread] = useState(0);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupItems, setPopupItems] = useState<any[]>([]);
  const [popupLoading, setPopupLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/creator/home").then(r => r.json()).then(d => {
      setUnread(d.unreadNotificationCount ?? 0);
    }).catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!popupOpen) return;
    function handleOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setPopupOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [popupOpen]);

  const openPopup = () => {
    if (popupOpen) { setPopupOpen(false); return; }
    setPopupOpen(true);
    setPopupLoading(true);
    apiFetch("/api/creator/notifications").then(r => r.json()).then(d => {
      setPopupItems((d.notifications ?? []).slice(0, 5));
      setUnread(0);
      apiFetch("/api/creator/notifications/mark-all-read", { method: "PATCH" }).catch(() => {});
    }).finally(() => setPopupLoading(false));
  };

  useCreatorSSE(
    useCallback((payload) => {
      setUnread(n => n + 1);
      const url = payload.entityType === "BARTER_CAMPAIGN"
        ? `/home-creator/barter/${payload.entityId}`
        : `/home-creator/campaigns/${payload.entityId}`;
      pushCreatorToast({ title: payload.title, body: payload.body, url });
    }, []),
    useCallback((p: import("@/hooks/useCreatorSSE").PopupSSEPayload) => { onPopup?.(p); }, [onPopup]),
    useCallback((p: import("@/hooks/useCreatorSSE").NotificationSSEPayload) => {
      // Live notification while on the app: bump the bell, surface it at the
      // top of the dropdown list, and show a tap-through toast.
      setUnread(n => n + 1);
      setPopupItems(items => [{ ...p, isRead: false }, ...items].slice(0, 5));
      pushCreatorToast({ title: p.title, body: p.body, url: "/home-creator/notifications" });
    }, []),
  );

  const isLocked = (tab: typeof NAV_TABS[number]) => tab.badgeKey !== null && status !== "ACTIVE";

  const handleDesktopTabClick = (tab: typeof NAV_TABS[number]) => {
    if (isLocked(tab)) { onLocked?.(); return; }
    if (tab.badgeKey) clearBadge(tab.badgeKey);
    navigate(tab.path);
  };

  return (
    <>
      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowLogout(false); }}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#15151D", border: "1px solid rgba(240,24,122,0.35)" }}>
            <h3 className="text-white font-bold text-base mb-2" style={{ fontFamily: POPPINS }}>Log out of Collabry?</h3>
            <p className="text-white/85 text-sm mb-4" style={{ fontFamily: POPPINS }}>You'll need to log in again to access your account.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowLogout(false)} className="flex-1 py-2.5 rounded-full border border-white/20 text-white text-sm" style={{ fontFamily: POPPINS }}>Cancel</button>
              <button onClick={() => { setShowLogout(false); clearAuth(); navigate("/login-creator"); }}
                className="flex-1 py-2.5 rounded-full text-white text-sm font-semibold" style={{ background: PINK, fontFamily: POPPINS }}>Log out</button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-40 px-4 lg:px-6 py-3"
        style={{ background: BG, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button className="text-2xl flex-shrink-0 flex items-center gap-2" style={{ fontFamily: "'Macondo Swash Caps', cursive", color: PINK }}
            onClick={() => navigate("/home-creator")} aria-label="Home">
            <img src={`${import.meta.env.BASE_URL}logo-mark.svg`} alt="" className="h-7 w-auto" />
            Collabry
          </button>

          {/* Desktop nav (hidden on mobile) */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {NAV_TABS.map(tab => {
              const active = isActiveTab(location, tab.path);
              const hasNew = !!(tab.badgeKey && badges[tab.badgeKey] > 0);
              const locked = isLocked(tab);
              return (
                <button key={tab.path}
                  onClick={() => handleDesktopTabClick(tab)}
                  className="relative px-4 py-2 text-sm font-medium transition-colors"
                  style={{ color: active ? PINK : locked ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
                  {tab.label}
                  {locked && (
                    <svg className="inline-block ml-1 mb-0.5" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  )}
                  {active && !locked && <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full" style={{ background: PINK }} />}
                  {hasNew && !active && !locked && (
                    <span style={{
                      position: "absolute", top: 4, right: 4, width: 8, height: 8,
                      background: PINK, borderRadius: 999,
                    }} />
                  )}
                </button>
              );
            })}
            <button
              onClick={() => navigate("/contact-us")}
              className="relative px-4 py-2 text-sm font-medium transition-colors"
              style={{ color: (location === "/contact-us" || location === "/about-us") ? PINK : "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
              Contact Us
              {(location === "/contact-us" || location === "/about-us") && <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full" style={{ background: PINK }} />}
            </button>
          </nav>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div ref={bellRef} className="relative">
              <button onClick={openPopup} className="relative p-1.5" aria-label="Notifications">
                <Bell className="w-5 h-5 text-white" />
                {unread > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style={{ background: PINK }} />
                )}
              </button>
              {popupOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-2xl overflow-hidden shadow-2xl z-50"
                  style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>Notifications</span>
                    <button onClick={() => { navigate("/home-creator/notifications"); setPopupOpen(false); }}
                      className="text-xs font-semibold hover:opacity-80 transition-opacity" style={{ color: PINK, fontFamily: POPPINS }}>
                      See all
                    </button>
                  </div>
                  {popupLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: PINK, borderTopColor: "transparent" }} />
                    </div>
                  ) : popupItems.length === 0 ? (
                    <div className="py-8 text-center">
                      <Bell className="w-6 h-6 text-white/70 mx-auto mb-2" />
                      <p className="text-white/70 text-xs" style={{ fontFamily: POPPINS }}>No notifications yet</p>
                    </div>
                  ) : (
                    <div className="max-h-[360px] overflow-y-auto">
                      {popupItems.map((n, i) => {
                        const url = getCreatorNotifUrl(n);
                        return (
                          <div key={n.id}
                            onClick={() => {
                              if (!url) return;
                              if (status !== "ACTIVE" && isCampaignNotif(n)) { setDropdownLocked(true); setPopupOpen(false); return; }
                              navigate(url); setPopupOpen(false);
                            }}
                            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] cursor-pointer"
                            style={{
                              background: n.isRead ? "transparent" : "rgba(225,79,105,0.08)",
                              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
                            }}>
                            <div className="flex-shrink-0 mt-0.5">{creatorNotifIcon(n.type, PINK)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-semibold leading-snug" style={{ fontFamily: POPPINS }}>{n.title}</p>
                              <p className="text-white/70 text-[11px] mt-0.5 leading-relaxed line-clamp-2" style={{ fontFamily: POPPINS }}>
                                {typeof n.body === "string" ? n.body : n.body ? JSON.stringify(n.body) : ""}
                              </p>
                              <p className="text-white/70 text-[10px] mt-1" style={{ fontFamily: POPPINS }}>{timeAgo(n.createdAt)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {!n.isRead && <div className="w-1.5 h-1.5 rounded-full" style={{ background: PINK }} />}
                              {url && <ExternalLink className="w-3 h-3 text-white/70" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="px-4 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <button onClick={() => { navigate("/home-creator/notifications"); setPopupOpen(false); }}
                      className="w-full text-xs font-semibold py-2 rounded-full transition-colors hover:opacity-90"
                      style={{ color: PINK, fontFamily: POPPINS, background: "rgba(225,79,105,0.12)" }}>
                      See all notifications →
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setShowLogout(true)} className="p-1.5" aria-label="Log out">
              <LogOut className="w-5 h-5 text-white/90" />
            </button>
          </div>
        </div>
      </header>
      {dropdownLocked && <LockedFeatureModal onClose={() => setDropdownLocked(false)} />}
    </>
  );
}

/* ── Mobile-only nav row below header ── */
export function CreatorNavRow({ status, onLocked, badges, clearBadge }: { status: string; onLocked: () => void; badges: Badges; clearBadge: (k: BadgeKey) => void }) {
  const [location, navigate] = useLocation();

  const isLocked = (tab: typeof NAV_TABS[number]) => tab.badgeKey !== null && status !== "ACTIVE";

  const handleClick = (tab: typeof NAV_TABS[number]) => {
    if (isLocked(tab)) { onLocked(); return; }
    if (tab.badgeKey) clearBadge(tab.badgeKey);
    navigate(tab.path);
  };

  return (
    <div className="md:hidden sticky top-[57px] z-30"
      style={{ background: BG, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="max-w-6xl mx-auto grid grid-cols-5 gap-1 px-3 py-2">
        {NAV_TABS.map(tab => {
          const active = isActiveTab(location, tab.path);
          const Icon = tab.icon;
          const hasNew = !!(tab.badgeKey && badges[tab.badgeKey] > 0);
          const locked = isLocked(tab);
          return (
            <button key={tab.path}
              onClick={() => handleClick(tab)}
              className="relative flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl transition-all cursor-pointer"
              style={{ background: active ? PINK : locked ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)", opacity: locked ? 0.5 : 1 }}>
              <span style={{ position: "relative", display: "inline-flex" }}>
                <Icon className="w-5 h-5" style={{ color: active ? "white" : "rgba(255,255,255,0.80)" }} />
                {hasNew && !active && !locked && (
                  <span style={{
                    position: "absolute", top: -2, right: -2, width: 8, height: 8,
                    background: PINK, borderRadius: 999, border: "1.5px solid " + BG,
                  }} />
                )}
              </span>
              <span className="text-[10px] font-medium leading-none"
                style={{ color: active ? "white" : "rgba(255,255,255,0.80)", fontFamily: POPPINS }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/* ── Full layout: header + sticky nav + content + footer ── */
export function CreatorLayout({ status, children, onLocked }: { status: string; children: ReactNode; onLocked: () => void }) {
  const { badges, clearBadge } = useCreatorNavBadges();
  const { accessToken, clearAuth } = useCreatorAuth();
  const getToken = useCallback(() => accessToken ?? null, [accessToken]);

  const filterCampaignLivePopup = useCallback((popup: import("@/components/GlobalPopup").PopupItem): import("@/components/GlobalPopup").PopupItem | null => {
    if (popup.type !== "CAMPAIGN_LIVE") return popup;
    const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
    const lastShown = localStorage.getItem("lastCampaignPopupShown");
    const now = Date.now();
    if (lastShown && now - parseInt(lastShown, 10) < FORTY_EIGHT_HOURS) {
      return null;
    }
    localStorage.setItem("lastCampaignPopupShown", String(now));
    return {
      id: popup.id,
      type: "CAMPAIGN_LIVE",
      title: "New campaigns are live!",
      body: "Check them out before slots fill up.",
      ctaText: "View Campaigns →",
      ctaPath: "/home-creator/campaigns",
      isCelebration: false,
    };
  }, []);

  const { current: activePopup, dismiss, enqueue } = usePopupQueue("creator", getToken, filterCampaignLivePopup);

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: POPPINS }}>
      <CreatorToastHost />
      <CreatorHeader badges={badges} clearBadge={clearBadge} status={status} onLocked={onLocked} onPopup={enqueue} />
      <CreatorNavRow status={status} onLocked={onLocked} badges={badges} clearBadge={clearBadge} />
      <main className="max-w-lg lg:max-w-[1280px] mx-auto lg:px-6">
        {children}
      </main>
      <Footer />
      {activePopup && (
        ["KYC_APPROVED", "KYC_REJECTED", "PAYOUT_PENDING_KYC", "DEAL_COMPLETE_KYC_NEEDED"].includes(activePopup.type ?? "")
          ? <KycPopup popup={activePopup} onDismiss={dismiss} />
          : <GlobalPopup popup={activePopup} onDismiss={dismiss} creatorStatus={status} onLogout={clearAuth} />
      )}
    </div>
  );
}
