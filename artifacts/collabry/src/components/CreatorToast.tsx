import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Megaphone, X } from "lucide-react";

const PINK = "#F0187A";
const POPPINS = "'Poppins', sans-serif";

export type ToastItem = {
  id: string;
  title: string;
  body: string;
  url: string | null;
};

let listeners: Array<(item: ToastItem) => void> = [];

export function pushCreatorToast(item: Omit<ToastItem, "id">): void {
  const full: ToastItem = { ...item, id: Math.random().toString(36).slice(2) };
  listeners.forEach(fn => fn(full));
}

type ToastState = ToastItem & { visible: boolean };

export function CreatorToastHost() {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [, navigate] = useLocation();

  useEffect(() => {
    const fn = (item: ToastItem) => {
      setToasts(prev => [...prev, { ...item, visible: true }]);

      const hideTimer = setTimeout(() => {
        setToasts(prev => prev.map(t => t.id === item.id ? { ...t, visible: false } : t));
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== item.id));
        }, 400);
      }, 6_000);

      return () => clearTimeout(hideTimer);
    };

    listeners.push(fn);
    return () => { listeners = listeners.filter(f => f !== fn); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2 pointer-events-none"
      style={{ top: "1rem", right: "1rem", left: "1rem", maxWidth: "22rem", marginLeft: "auto" }}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => {
            if (t.url) navigate(t.url);
            setToasts(prev => prev.filter(x => x.id !== t.id));
          }}
          className="pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, #14101F 0%, #1C0E2E 100%)",
            border: "1px solid rgba(240,24,122,0.4)",
            boxShadow: "0 4px 32px rgba(240,24,122,0.15), 0 8px 24px rgba(0,0,0,0.65)",
            cursor: t.url ? "pointer" : "default",
            opacity: t.visible ? 1 : 0,
            transform: t.visible ? "translateX(0)" : "translateX(calc(100% + 1.5rem))",
            transition: "opacity 0.35s ease, transform 0.38s cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
            style={{ background: "rgba(240,24,122,0.18)" }}
          >
            <Megaphone className="w-4 h-4" style={{ color: PINK }} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-semibold leading-snug" style={{ fontFamily: POPPINS }}>
              {t.title}
            </p>
            <p className="text-white/75 text-[11px] mt-0.5 leading-relaxed" style={{ fontFamily: POPPINS }}>
              {t.body}
            </p>
            {t.url && (
              <p className="text-[11px] font-semibold mt-1.5" style={{ color: PINK, fontFamily: POPPINS }}>
                View campaign →
              </p>
            )}
          </div>

          <button
            onClick={e => {
              e.stopPropagation();
              setToasts(prev => prev.filter(x => x.id !== t.id));
            }}
            className="flex-shrink-0 p-0.5 hover:opacity-70 transition-opacity"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
