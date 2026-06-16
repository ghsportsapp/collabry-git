import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Bell, Home, Search, Megaphone, Handshake, User, LogOut, Coins, CheckCircle, XCircle, Package, PackageCheck, FileVideo, RotateCcw, ShieldCheck, AlertTriangle, Star, FileText } from "lucide-react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useBrandCredits } from "@/hooks/useBrandCredits";
import Footer from "@/components/landing/Footer";
import { usePopupQueue } from "@/hooks/usePopupQueue";
import { useBrandSSE } from "@/hooks/useBrandSSE";
import GlobalPopup from "@/components/GlobalPopup";

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(date).toLocaleDateString("en-IN");
}

function brandNotifIcon(type: string, pink: string) {
  switch (type) {
    case "REQUEST_ACCEPTED":     return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "REQUEST_REJECTED":     return <XCircle className="w-4 h-4 text-red-400" />;
    case "REQUEST_COUNTERED":    return <Handshake className="w-4 h-4 text-yellow-400" />;
    case "PAYMENT_SUCCESS":      return <Coins className="w-4 h-4 text-green-400" />;
    case "DEAL_LIVE":            return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "PRODUCT_RECEIVED":     return <PackageCheck className="w-4 h-4 text-green-400" />;
    case "DEAL_CONCEPT_SUBMITTED":
    case "DEAL_CONCEPT_RESUBMITTED": return <FileVideo className="w-4 h-4" style={{ color: pink }} />;
    case "DEAL_CONTENT_SUBMITTED":
    case "DEAL_CONTENT_RESUBMITTED": return <FileVideo className="w-4 h-4 text-blue-400" />;
    case "DEAL_FINAL_POST_CONFIRMED": return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "DEAL_COMPLETED":       return <Star className="w-4 h-4 text-yellow-400" />;
    case "DEAL_DISPUTE_RESOLVED": return <ShieldCheck className="w-4 h-4 text-green-400" />;
    case "DEAL_OVERDUE_BRAND":   return <AlertTriangle className="w-4 h-4 text-red-400" />;
    case "PAYOUT_PENDING_KYC":
    case "FIELD_REQUIRED":
    case "AWB_WRONG_RAISED":     return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
    case "BRAND_APPROVED":       return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "BRAND_REJECTED":       return <XCircle className="w-4 h-4 text-red-400" />;
    case "ADMIN_GIFT_RECEIVED":  return <Coins className="w-4 h-4" style={{ color: pink }} />;
    case "ADMIN_CREDIT_REMOVED": return <Coins className="w-4 h-4 text-red-400" />;
    case "PRODUCT_ISSUE_RAISED":
    case "CREATOR_CANNOT_PROCEED": return <AlertTriangle className="w-4 h-4 text-red-400" />;
    case "NON_DELIVERY_RESOLVED": return <ShieldCheck className="w-4 h-4 text-green-400" />;
    case "DELIVERY_EXTENDED":    return <Package className="w-4 h-4 text-blue-400" />;
    case "INVOICE_READY":        return <FileText className="w-4 h-4" style={{ color: pink }} />;
    default:                     return <Bell className="w-4 h-4 text-white/80" />;
  }
}

function getBrandNotifUrl(n: any): string | null {
  const type       = n.type              as string;
  const entityType = n.relatedEntityType as string | null;
  const entityId   = n.relatedEntityId   as string | null;
  const id = entityId ?? "";

  if (type === "INVOICE_READY") return "/home-brand";
  if (type === "BRAND_APPROVED" || type === "BRAND_REJECTED" || type === "FIELD_REQUIRED") return "/home-brand";
  if (["ADMIN_GIFT_RECEIVED","ADMIN_CREDIT_REMOVED","WELCOME_CREDITS","CREDITS_ADDED"].includes(type)) return "/home-brand/credits";

  if (["APPLICATION_SUBMITTED","CREATOR_APPLIED","NEW_APPLICANT","BRAND_3DAY_APPLICANTS","CAMPAIGN_APPROVED","CAMPAIGN_REJECTED"].includes(type))
    return entityId ? `/home-brand/campaigns/${id}` : "/home-brand/campaigns";

  if (entityType === "Campaign" && entityId) return `/home-brand/campaigns/${id}`;
  if (entityType === "BARTER_CAMPAIGN" && entityId) return `/home-brand/barter/${id}`;

  if (["REQUEST_ACCEPTED","REQUEST_COUNTERED","PAYMENT_REQUIRED"].includes(type))
    return entityId ? `/home-brand/deals?tab=pending&deal=${id}` : "/home-brand/deals?tab=pending";
  if (type === "REQUEST_REJECTED")
    return entityId ? `/home-brand/deals?tab=cancelled&deal=${id}` : "/home-brand/deals?tab=cancelled";

  if (["DEAL_LIVE","PAYMENT_SUCCESS","PRODUCT_RECEIVED",
       "DEAL_CONCEPT_SUBMITTED","DEAL_CONCEPT_RESUBMITTED",
       "DEAL_CONTENT_SUBMITTED","DEAL_CONTENT_RESUBMITTED",
       "DEAL_FINAL_POST_CONFIRMED","DEAL_OVERDUE_BRAND",
       "AWB_WRONG_RAISED","PRODUCT_ISSUE_RAISED",
       "NON_DELIVERY_RESOLVED","DELIVERY_EXTENDED",
       "DEAL_DISPUTE_RESOLVED","DEAL_DISPUTE_OPENED",
       "CREATOR_CANNOT_PROCEED","REFUND_TO_BRAND"].includes(type))
    return entityId ? `/home-brand/deals?tab=live&deal=${id}` : "/home-brand/deals?tab=live";

  if (type === "DEAL_COMPLETED")
    return entityId ? `/home-brand/deals?tab=completed&deal=${id}` : "/home-brand/deals?tab=completed";
  if (type === "DEAL_CANCELLED")
    return entityId ? `/home-brand/deals?tab=cancelled&deal=${id}` : "/home-brand/deals?tab=cancelled";

  if (type === "DEAL_CHAT_MESSAGE")
    return entityId ? `/home-brand/deals?tab=live&deal=${id}&chat=1` : "/home-brand/deals?tab=live";

  if (entityType === "Deal" || entityType === "DEAL")
    return entityId ? `/home-brand/deals?tab=live&deal=${id}` : "/home-brand/deals?tab=live";
  if (entityType === "DealRequest")
    return entityId ? `/home-brand/deals?tab=pending&deal=${id}` : "/home-brand/deals?tab=pending";
  return null;
}

export const POPPINS = "'Poppins', sans-serif";
export const PINK = "#E14F69";
export const BG = "#0A0A0F";

const NAV_TABS = [
  { icon: Home, label: "Home", path: "/home-brand", badgeKey: null as null },
  { icon: Search, label: "Search", path: "/home-brand/search", badgeKey: null as null },
  { icon: Megaphone, label: "Campaigns", path: "/home-brand/campaigns", badgeKey: "campaigns" as const },
  { icon: Handshake, label: "Deals", path: "/home-brand/deals", badgeKey: "deals" as const },
  { icon: User, label: "Profile", path: "/home-brand/profile", badgeKey: null as null },
];

type BadgeKey = "deals" | "campaigns";
type Badges = Record<BadgeKey, number>;

function isActiveTab(location: string, path: string): boolean {
  if (path === "/home-brand") return location === "/home-brand";
  return location === path || location.startsWith(path + "/");
}

function useBrandNavBadges() {
  const { apiFetch, brandId } = useBrandAuth();
  const [badges, setBadges] = useState<Badges>({ deals: 0, campaigns: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBadges = () => {
    if (!brandId) return;
    apiFetch("/api/brand/nav-badges").then(r => r.json()).then((d: Badges) => {
      setBadges({ deals: d.deals ?? 0, campaigns: d.campaigns ?? 0 });
    }).catch(() => {});
  };

  useEffect(() => {
    if (!brandId) return;
    fetchBadges();
    intervalRef.current = setInterval(fetchBadges, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [brandId]);

  const clearBadge = (key: BadgeKey) => {
    if (badges[key] <= 0) return;
    apiFetch(`/api/brand/nav-badges/${key}`, { method: "PATCH" }).then(() => {
      setBadges(b => ({ ...b, [key]: 0 }));
    }).catch(() => {});
  };

  return { badges, clearBadge };
}

/* ── Header: logo + (desktop nav) + credits + bell + logout ── */
function BrandHeader({ credits, onLocked, badges, clearBadge }: { credits: number | null; onLocked: (msg: string) => void; badges: Badges; clearBadge: (k: BadgeKey) => void }) {
  const [location, navigate] = useLocation();
  const { clearAuth, apiFetch, brandId } = useBrandAuth();
  const [showLogout, setShowLogout] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupItems, setPopupItems] = useState<any[]>([]);
  const [popupLoading, setPopupLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!brandId) return;
    apiFetch("/api/brand/notifications/unread-count").then(r => r.json()).then(d => setUnreadCount(d.count ?? 0)).catch(() => {});
  }, [brandId]);

  // Live bell-badge bump when a notification arrives over SSE (dispatched by
  // BrandLayout). Keeps the SSE wiring in the layout while the count lives here.
  useEffect(() => {
    const onNotif = () => setUnreadCount(n => n + 1);
    window.addEventListener("collabry:brand-notification", onNotif);
    return () => window.removeEventListener("collabry:brand-notification", onNotif);
  }, []);

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
    apiFetch("/api/brand/notifications").then(r => r.json()).then(d => {
      setPopupItems((d.notifications ?? []).slice(0, 5));
      setUnreadCount(0);
      apiFetch("/api/brand/notifications/mark-all-read", { method: "PATCH" }).catch(() => {});
    }).finally(() => setPopupLoading(false));
  };

  const handleDesktopTabClick = (tab: typeof NAV_TABS[number]) => {
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
              <button onClick={() => { setShowLogout(false); clearAuth(); navigate("/login-brand"); }}
                className="flex-1 py-2.5 rounded-full text-white text-sm font-semibold" style={{ background: PINK, fontFamily: POPPINS }}>Log out</button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-40 px-4 py-3"
        style={{ background: BG, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button className="text-2xl flex-shrink-0" style={{ fontFamily: "'Macondo Swash Caps', cursive", color: PINK }}
            onClick={() => navigate("/home-brand")} aria-label="Home">Collabry</button>

          {/* Desktop nav (hidden on mobile) */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {NAV_TABS.map(tab => {
              const active = isActiveTab(location, tab.path);
              const hasNew = !!(tab.badgeKey && badges && badges[tab.badgeKey] > 0);
              return (
                <button key={tab.path}
                  onClick={() => handleDesktopTabClick(tab)}
                  className="relative px-4 py-2 text-sm font-medium transition-colors"
                  style={{ color: active ? PINK : "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
                  {tab.label}
                  {active && <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full" style={{ background: PINK }} />}
                  {hasNew && !active && (
                    <span style={{
                      position: "absolute", top: 4, right: 4, width: 8, height: 8,
                      background: PINK, borderRadius: 999,
                    }} />
                  )}
                </button>
              );
            })}
            {(() => {
              const active = location === "/contact-us" || location === "/about-us";
              return (
                <button onClick={() => navigate("/contact-us")}
                  className="relative px-4 py-2 text-sm font-medium transition-colors"
                  style={{ color: active ? PINK : "rgba(255,255,255,0.90)", fontFamily: POPPINS }}>
                  Contact Us
                  {active && <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full" style={{ background: PINK }} />}
                </button>
              );
            })()}
          </nav>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => navigate("/home-brand/credits")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-xs font-semibold"
              style={{ background: PINK, fontFamily: POPPINS }}
              aria-label="Credits">
              <Coins className="w-3.5 h-3.5" />
              <span>{credits ?? "–"}</span>
            </button>
            <div ref={bellRef} className="relative">
              <button onClick={openPopup} className="relative p-1.5" aria-label="Notifications">
                <Bell className="w-5 h-5 text-white" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style={{ background: PINK }} />
                )}
              </button>
              {popupOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-2xl overflow-hidden shadow-2xl z-50"
                  style={{ background: "#15151D", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="text-white font-semibold text-sm" style={{ fontFamily: POPPINS }}>Notifications</span>
                    <button onClick={() => { navigate("/home-brand/notifications"); setPopupOpen(false); }}
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
                        const notifUrl = getBrandNotifUrl(n);
                        return (
                        <div key={n.id}
                          className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] cursor-pointer"
                          onClick={() => { if (notifUrl) { navigate(notifUrl); setPopupOpen(false); } }}
                          style={{
                            background: n.isRead ? "transparent" : "rgba(225,79,105,0.08)",
                            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
                          }}>
                          <div className="flex-shrink-0 mt-0.5">{brandNotifIcon(n.type, PINK)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-semibold leading-snug" style={{ fontFamily: POPPINS }}>{n.title}</p>
                            <p className="text-white/70 text-[11px] mt-0.5 leading-relaxed line-clamp-2" style={{ fontFamily: POPPINS }}>
                              {typeof n.body === "string" ? n.body : n.body ? JSON.stringify(n.body) : ""}
                            </p>
                            <p className="text-white/70 text-[10px] mt-1" style={{ fontFamily: POPPINS }}>{timeAgo(n.createdAt)}</p>
                          </div>
                          {!n.isRead && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: PINK }} />}
                        </div>
                      ); })}
                    </div>
                  )}
                  <div className="px-4 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <button onClick={() => { navigate("/home-brand/notifications"); setPopupOpen(false); }}
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
    </>
  );
}

/* ── Mobile-only nav row below header ── */
function BrandNavRow({ onLocked: _onLocked, badges, clearBadge }: { onLocked: (msg: string) => void; badges: Badges; clearBadge: (k: BadgeKey) => void }) {
  const [location, navigate] = useLocation();

  const handleClick = (tab: typeof NAV_TABS[number]) => {
    if (tab.badgeKey) clearBadge(tab.badgeKey);
    navigate(tab.path);
  };

  return (
    <div className="md:hidden sticky top-[57px] z-30 grid grid-cols-5 gap-1 px-3 py-2"
      style={{ background: BG, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {NAV_TABS.map(tab => {
        const active = isActiveTab(location, tab.path);
        const Icon = tab.icon;
        const hasNew = !!(tab.badgeKey && badges && badges[tab.badgeKey] > 0);
        return (
          <button key={tab.path}
            onClick={() => handleClick(tab)}
            className="relative flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all"
            style={{ background: active ? PINK : "rgba(255,255,255,0.05)" }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon className="w-5 h-5" style={{ color: active ? "white" : "rgba(255,255,255,0.80)" }} />
              {hasNew && !active && (
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
  );
}


/* ── Toast for "Coming soon" ── */
export function BrandLayout({ credits: creditsProp, children, activeTab: _activeTab }: { credits?: number | null; children: ReactNode; activeTab?: string }) {
  const { total: creditsHook } = useBrandCredits();
  const credits = creditsProp ?? creditsHook;
  const [toast, setToast] = useState<string | null>(null);
  const { badges, clearBadge } = useBrandNavBadges();
  const { accessToken, clearAuth } = useBrandAuth();
  const getToken = useCallback(() => accessToken ?? null, [accessToken]);
  const { current: activePopup, dismiss, enqueue } = usePopupQueue("brand", getToken);

  useBrandSSE(getToken, (type, data) => {
    if (type === "notification") {
      // Live in-app notification: lightweight toast + bell-badge bump (handled
      // by BrandHeader via the window event). NOT a full-screen popup.
      const n = data as { title?: string };
      if (n?.title) setToast(n.title);
      window.dispatchEvent(new CustomEvent("collabry:brand-notification"));
      return;
    }
    // `popup` / `message` events are intentional full-screen interrupts.
    const p = data as { id: string; type?: string; title: string; body: string; ctaText?: string; ctaPath?: string; isCelebration: boolean; secondCtaText?: string; secondCtaPath?: string };
    if (p?.id && p?.title) enqueue(p);
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG, fontFamily: POPPINS }}>
      <BrandHeader credits={credits} onLocked={setToast} badges={badges} clearBadge={clearBadge} />
      <BrandNavRow onLocked={setToast} badges={badges} clearBadge={clearBadge} />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-white text-sm shadow-lg animate-fadeIn"
          style={{ background: "#15151D", border: "1px solid rgba(240,24,122,0.4)", fontFamily: POPPINS }}>
          {toast}
        </div>
      )}
      {activePopup && (
        <GlobalPopup popup={activePopup} onDismiss={dismiss} onLogout={clearAuth} />
      )}
    </div>
  );
}
