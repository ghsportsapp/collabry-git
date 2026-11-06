import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { MessageCircle, X, Undo2 } from "lucide-react";
import { type ChatbotConfig, type ChatNode, type ChatAudience, chatAudienceForPath } from "@/lib/chatbot";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const DARK = "#0A0A0F";
const BOT_BUBBLE = "rgba(225,79,105,0.12)"; // lighter theme shade for bot
const TYPING_DELAY_MS = 650;

/* ─────────────────────────────────────────────────────────────────────────
   Mount: pick the right audience for the current route and render its widget.
   Nothing on "/", admin pages, or neutral pages. Keyed by audience so it fully
   resets when crossing between brand and creator areas.
   ───────────────────────────────────────────────────────────────────────── */
export default function ChatbotMount() {
  const [location] = useLocation();
  const audience = chatAudienceForPath(location);
  if (!audience) return null;
  return <ChatbotWidget key={audience} audience={audience} />;
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return mobile;
}

interface Msg { id: number; role: "bot" | "user"; text: string; animate: boolean }

function ChatbotWidget({ audience }: { audience: ChatAudience }) {
  const [cfg, setCfg] = useState<ChatbotConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [options, setOptions] = useState<ChatNode[]>([]);
  const [atRoot, setAtRoot] = useState(true);
  const [typing, setTyping] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const msgId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Load the public display config for this audience.
  useEffect(() => {
    let alive = true;
    fetch(`${BASE_URL}/api/chatbot/${audience}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ChatbotConfig) => { if (alive) setCfg(d && typeof d === "object" ? d : null); })
      .catch(() => { if (alive) setCfg(null); });
    return () => { alive = false; };
  }, [audience]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  const resetConversation = useCallback(() => {
    clearTimers();
    setTyping(false);
    if (!cfg) return;
    msgId.current = 1;
    setMessages([{ id: 1, role: "bot", text: cfg.welcomeMessage, animate: true }]);
    setOptions(cfg.tree);
    setAtRoot(true);
  }, [cfg]);

  const openWidget = () => { setOpen(true); resetConversation(); };
  const closeWidget = () => { setOpen(false); clearTimers(); setTyping(false); };

  // Close on outside click / tap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || launcherRef.current?.contains(t)) return;
      closeWidget();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  // Keep scrolled to the latest message / typing indicator.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, typing, options]);

  const chooseNode = (node: ChatNode) => {
    clearTimers();
    const uid = ++msgId.current;
    setMessages((m) => [...m, { id: uid, role: "user", text: node.question, animate: true }]);
    setOptions([]);
    setTyping(true);
    const t = setTimeout(() => {
      setTyping(false);
      if (node.answer) {
        const bid = ++msgId.current;
        setMessages((m) => [...m, { id: bid, role: "bot", text: node.answer, animate: true }]);
      }
      setOptions(node.children ?? []);
      setAtRoot(false);
    }, TYPING_DELAY_MS);
    timers.current.push(t);
  };

  const returnToMenu = () => {
    clearTimers();
    setTyping(false);
    if (cfg) { setOptions(cfg.tree); setAtRoot(true); }
  };

  // Render nothing when there's no usable bot.
  if (!cfg || !cfg.enabled || cfg.tree.length === 0) return null;

  const panelStyle: React.CSSProperties = isMobile
    ? { position: "fixed", left: 0, right: 0, bottom: 0, width: "100%", height: "70vh",
        borderTopLeftRadius: 20, borderTopRightRadius: 20, zIndex: 2147483000 }
    : { position: "fixed", right: 24, bottom: 92, width: 380, maxWidth: "calc(100vw - 32px)",
        height: "min(600px, 72vh)", borderRadius: 20, zIndex: 2147483000 };

  return (
    <>
      {/* Mobile dim backdrop — tapping above the sheet closes it. */}
      {open && isMobile && (
        <div onClick={closeWidget} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2147482000 }} />
      )}

      {/* Launcher */}
      <div ref={launcherRef} style={{ position: "fixed", right: 20, bottom: 20, zIndex: 2147482500, fontFamily: POPPINS }}>
        {!open && (
          <button
            onClick={openWidget}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            aria-label="Open Collabry Chatbot"
            style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer", border: "none",
              height: 58, padding: !isMobile && hovered ? "0 20px 0 16px" : 0,
              width: 58 + (!isMobile && hovered ? 170 : 0),
              borderRadius: 999, color: "#fff",
              background: `linear-gradient(135deg, ${PINK} 0%, #B4324A 100%)`,
              boxShadow: "0 10px 30px rgba(225,79,105,0.45), inset 0 1px 1px rgba(255,255,255,0.35)",
              transition: "width .32s cubic-bezier(0.34,1.56,0.64,1), padding .32s cubic-bezier(0.34,1.56,0.64,1)",
              overflow: "hidden", justifyContent: !isMobile && hovered ? "flex-start" : "center",
            }}
          >
            <span style={{
              flexShrink: 0, width: 42, height: 42, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.18)", boxShadow: "inset 0 1px 2px rgba(255,255,255,0.4)",
            }}>
              <MessageCircle className="w-5 h-5" />
            </span>
            {!isMobile && hovered && (
              <span style={{ whiteSpace: "nowrap", fontWeight: 600, fontSize: 14 }}>Collabry Chatbot</span>
            )}
          </button>
        )}
      </div>

      {/* Chat panel */}
      {open && (
        <div ref={panelRef} style={{
          ...panelStyle, display: "flex", flexDirection: "column", overflow: "hidden",
          background: DARK, border: "1px solid rgba(225,79,105,0.35)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.6)", fontFamily: POPPINS,
          animation: "clb-pop .28s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          {/* Header */}
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
            background: `linear-gradient(135deg, ${PINK} 0%, #B4324A 100%)`, color: "#fff",
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.22)", fontWeight: 700, fontSize: 17,
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.4)",
            }}>
              {(cfg.botName || "R").trim().charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14.5, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cfg.botName}</p>
              <p style={{ margin: 0, fontSize: 11.5, opacity: 0.9, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "#4ade80", display: "inline-block" }} /> Online · replies instantly
              </p>
            </div>
            <button onClick={closeWidget} aria-label="Close chat" style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "radial-gradient(1200px 400px at 50% -10%, rgba(225,79,105,0.06), transparent)" }}>
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role} animate={m.animate} text={m.text} onReveal={() => {
                const el = bodyRef.current; if (el) el.scrollTo({ top: el.scrollHeight });
              }} />
            ))}
            {typing && <TypingDots />}

            {/* Options */}
            {!typing && options.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, alignItems: "flex-start" }}>
                {options.map((o) => (
                  <button key={o.id} onClick={() => chooseNode(o)} style={optionBtnStyle}>
                    {o.question}
                  </button>
                ))}
              </div>
            )}

            {/* Return to main menu — automatic, shown once past the main menu */}
            {!typing && !atRoot && (
              <button onClick={returnToMenu} style={{ ...optionBtnStyle, alignSelf: "flex-start", marginTop: 2, color: PINK, background: "transparent", border: `1px dashed rgba(225,79,105,0.5)`, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Undo2 className="w-3.5 h-3.5" /> Return to main menu
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes clb-pop { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes clb-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes clb-dot { 0%,60%,100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-4px); opacity: 1; } }
      `}</style>
    </>
  );
}

const optionBtnStyle: React.CSSProperties = {
  textAlign: "left", maxWidth: "85%", padding: "9px 14px", borderRadius: 14,
  border: `1px solid rgba(225,79,105,0.45)`, background: "rgba(225,79,105,0.10)",
  color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: POPPINS,
  lineHeight: 1.35, transition: "background .15s",
};

function Bubble({ role, text, animate, onReveal }: { role: "bot" | "user"; text: string; animate: boolean; onReveal: () => void }) {
  const isBot = role === "bot";
  return (
    <div style={{ alignSelf: isBot ? "flex-start" : "flex-end", maxWidth: "85%", animation: "clb-in .25s ease" }}>
      <div style={{
        padding: "10px 14px", borderRadius: 16,
        borderBottomLeftRadius: isBot ? 4 : 16, borderBottomRightRadius: isBot ? 16 : 4,
        background: isBot ? BOT_BUBBLE : PINK, color: "#fff", fontSize: 13.5, lineHeight: 1.5,
        border: isBot ? "1px solid rgba(225,79,105,0.25)" : "none", whiteSpace: "pre-wrap",
      }}>
        {isBot && animate ? <Typewriter text={text} onReveal={onReveal} /> : text}
      </div>
    </div>
  );
}

function Typewriter({ text, onReveal }: { text: string; onReveal: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    // Snappy: whole message reveals within ~900ms regardless of length.
    const step = Math.max(10, Math.min(28, Math.floor(900 / text.length)));
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      onReveal();
      if (i >= text.length) clearInterval(id);
    }, step);
    return () => clearInterval(id);
  }, [text]);
  return <>{text.slice(0, n)}</>;
}

function TypingDots() {
  return (
    <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: 16, borderBottomLeftRadius: 4, background: BOT_BUBBLE, border: "1px solid rgba(225,79,105,0.25)", display: "flex", gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: 999, background: PINK, display: "inline-block", animation: `clb-dot 1.1s ${i * 0.15}s infinite ease-in-out` }} />
      ))}
    </div>
  );
}
