import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Shield, ChevronDown, ChevronUp } from "lucide-react";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

const BLOCKED_WORDS = [
  "mc","bc","madarchod","behenchod","bhenchod","bhosdike","bhosadi",
  "chutiya","chut","gaand","gandu","lund","lavde","randi","harami","kamina",
  "fuck","fucking","motherfucker","mf","bitch","asshole","bastard",
  "slut","whore","dick","pussy","cunt","nigga","nigger","retard",
  "bsdk","mkc","bkc",
];

function containsAbusiveLanguage(message: string): boolean {
  // Strip everything except a-z0-9, then check each blocked word (also stripped)
  const normalized = message.toLowerCase().replace(/[^a-z0-9]/g, "");
  return BLOCKED_WORDS.some(w => normalized.includes(w.replace(/[^a-z0-9]/g, "")));
}

interface DealMessage {
  id: string;
  dealId: string;
  senderType: "BRAND" | "CREATOR" | "SYSTEM";
  senderId: string | null;
  messageType: string;
  content: string;
  metadata: any;
  createdAt: string;
}

interface DealChatProps {
  dealId: string;
  currentUserType: "BRAND" | "CREATOR";
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  dealStatus?: string;
}

function formatIST(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateIST(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return new Date(d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })).toISOString().slice(0, 10);
}

function PermanentSafetyBanner() {
  return (
    <div
      style={{
        background: "rgba(240,24,122,0.14)",
        border: "1px solid rgba(240,24,122,0.45)",
        borderRadius: 14,
        padding: "10px 12px",
        marginBottom: 8,
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <Shield size={14} color={PINK} style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ color: "#fff", fontSize: 11, fontFamily: POPPINS, lineHeight: 1.55, margin: 0 }}>
        <strong style={{ color: PINK }}>Stay safe on Collabry.</strong> Keep all payments, deliverables, and communication on this platform. Never share personal contact details — moving deals off-platform voids your escrow protection and may result in account termination.
      </p>
    </div>
  );
}

function ModerationNotice({ dealId }: { dealId: string }) {
  const lsKey = `collabry_chat_notice_${dealId}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(lsKey) === "1";
    } catch {
      return false;
    }
  });

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(lsKey, next ? "1" : "0");
    } catch {}
  }

  return (
    <div
      style={{
        background: "rgba(240,24,122,0.10)",
        border: "1px solid rgba(240,24,122,0.30)",
        borderRadius: 14,
        padding: collapsed ? "10px 14px" : "12px 14px",
        marginBottom: 10,
        flexShrink: 0,
      }}
    >
      <button
        onClick={toggle}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <Shield size={14} color={PINK} style={{ flexShrink: 0 }} />
        <span style={{ color: PINK, fontSize: 12, fontWeight: 700, fontFamily: POPPINS, flex: 1, textAlign: "left" }}>
          🛡️ Chat Moderation Notice
        </span>
        {collapsed ? <ChevronDown size={14} color={PINK} /> : <ChevronUp size={14} color={PINK} />}
      </button>
      {!collapsed && (
        <p style={{ color: "rgba(255,255,255,0.90)", fontSize: 11, fontFamily: POPPINS, marginTop: 8, lineHeight: 1.6, margin: "8px 0 0" }}>
          This chat is monitored by the Collabry team. Please do not share phone numbers, email addresses, or any personal contact details.
          Abuse or harassment may result in account suspension. Keep all deal communication within Collabry for your protection.
        </p>
      )}
    </div>
  );
}

function SystemMessage({ msg }: { msg: DealMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isRevision = msg.content.startsWith("🔁") && msg.content.includes("Details:");

  if (isRevision) {
    const reasonMatch = msg.content.match(/Reason:\s*(.+?)\.\s*Details:/);
    const detailsMatch = msg.content.match(/Details:\s*([\s\S]+)$/);
    const slotMatch = msg.content.match(/\(([^)]+)\)/);
    const slot = slotMatch ? slotMatch[1] : "";
    const reason = reasonMatch ? reasonMatch[1].trim() : "";
    const details = detailsMatch ? detailsMatch[1].trim() : "";

    return (
      <div style={{ margin: "10px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(245,158,11,0.20)" }} />
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, cursor: "pointer", border: "1px solid rgba(245,158,11,0.30)", background: "rgba(245,158,11,0.08)", color: "#FFCB7A", fontFamily: POPPINS, fontSize: 11 }}
          >
            <span>🔁 Revision requested{slot ? ` · ${slot}` : ""}{reason ? ` — ${reason}` : ""}</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <div style={{ flex: 1, height: 1, background: "rgba(245,158,11,0.20)" }} />
        </div>
        {expanded && details && (
          <div style={{ margin: "6px 12px 0", padding: "8px 10px", borderRadius: 8, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.20)", fontFamily: POPPINS }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>Brief</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.80)", whiteSpace: "pre-wrap", margin: 0 }}>{details}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
      <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 11, fontFamily: POPPINS, textAlign: "center", maxWidth: "80%", lineHeight: 1.5 }}>
        {msg.content}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
    </div>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
      <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 10, fontFamily: POPPINS }}>── {date} ──</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
    </div>
  );
}

function MessageBubble({ msg }: { msg: DealMessage }) {
  const isBrand = msg.senderType === "BRAND";
  const alignRight = isBrand;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: alignRight ? "flex-end" : "flex-start", marginBottom: 12 }}>
      <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 10, fontFamily: POPPINS, marginBottom: 4, paddingInline: 2 }}>
        {isBrand ? "Brand" : "Creator"} · {formatIST(msg.createdAt)}
      </span>
      <div
        style={{
          maxWidth: "82%",
          minWidth: "min(220px, 100%)",
          marginLeft: alignRight ? "auto" : 0,
          marginRight: alignRight ? 0 : "auto",
          padding: "11px 14px",
          borderRadius: alignRight ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: alignRight ? "linear-gradient(180deg, rgba(240,24,122,0.30) 0%, rgba(240,24,122,0.18) 100%)" : "rgba(255,255,255,0.08)",
          border: alignRight ? "1px solid rgba(240,24,122,0.28)" : "1px solid rgba(255,255,255,0.08)",
          color: "#fff",
          fontSize: 13,
          fontFamily: POPPINS,
          lineHeight: 1.55,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          boxShadow: alignRight ? "0 10px 24px rgba(240,24,122,0.08)" : "none",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

export default function DealChat({ dealId, currentUserType, apiFetch, dealStatus }: DealChatProps) {
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatArchived, setChatArchived] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [inputError, setInputError] = useState("");
  const [abuseWarning, setAbuseWarning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isReadOnly = dealStatus === "COMPLETED" || dealStatus === "CANCELLED";
  const baseUrl = currentUserType === "BRAND" ? "/api/brand" : "/api/creator";

  const scrollToBottom = useCallback((force = false) => {
    if (scrollRef.current && (force || atBottomRef.current)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const fetchMessages = useCallback(async (initial = false) => {
    try {
      const r = await apiFetch(`${baseUrl}/deals/${dealId}/chat`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.chatArchived) {
        setChatArchived(true);
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        if (initial) setLoading(false);
        return;
      }
      const msgs: DealMessage[] = d.messages ?? [];
      setMessages(prev => {
        if (initial) return msgs;
        if (msgs.length === prev.length) return prev;
        const newOnes = msgs.filter(m => !prev.some(p => p.id === m.id));
        if (newOnes.length === 0) return prev;
        return [...prev, ...newOnes];
      });
    } catch {}
    if (initial) setLoading(false);
  }, [dealId, apiFetch, baseUrl]);

  useEffect(() => {
    fetchMessages(true).then(() => setTimeout(() => scrollToBottom(true), 50));
    pollingRef.current = setInterval(() => {
      fetchMessages(false).then(() => scrollToBottom());
    }, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchMessages, scrollToBottom]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    atBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
  }

  async function sendMessage() {
    const value = text.trim();
    if (!value || sending || isReadOnly) return;
    if (containsAbusiveLanguage(value)) { setAbuseWarning(true); return; }
    setSending(true);
    setInputError("");
    setAbuseWarning(false);
    try {
      const r = await apiFetch(`${baseUrl}/deals/${dealId}/chat/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setInputError(d.error || "Failed to send message");
        return;
      }
      setText("");
      await fetchMessages(false);
      setTimeout(() => scrollToBottom(true), 50);
    } finally {
      setSending(false);
    }
  }

  const grouped = (() => {
    const out: Array<{ type: "date" | "msg"; key: string; msg?: DealMessage; date?: string }> = [];
    let lastDay = "";
    for (const msg of messages) {
      const dk = dayKey(msg.createdAt);
      if (dk !== lastDay) {
        out.push({ type: "date", key: `d-${dk}`, date: formatDateIST(msg.createdAt) });
        lastDay = dk;
      }
      out.push({ type: "msg", key: msg.id, msg });
    }
    return out;
  })();

  if (chatArchived) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "24px 16px", textAlign: "center", gap: 10,
        borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <span style={{ fontSize: 22 }}>🗂️</span>
        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: POPPINS, lineHeight: 1.6, margin: 0 }}>
          Conversation removed after dispute window expired.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <PermanentSafetyBanner />
      <ModerationNotice dealId={dealId} />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "6px 2px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {grouped.map(item =>
          item.type === "date" ? (
            <DateSeparator key={item.key} date={item.date!} />
          ) : item.msg!.senderType === "SYSTEM" ? (
            <SystemMessage key={item.key} msg={item.msg!} />
          ) : (
            <MessageBubble key={item.key} msg={item.msg!} />
          )
        )}
      </div>
      {!isReadOnly && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <textarea
            value={text}
            onChange={e => {
              setText(e.target.value);
              if (abuseWarning) setAbuseWarning(containsAbusiveLanguage(e.target.value));
            }}
            placeholder="Type a message..."
            style={{
              width: "100%",
              minHeight: 78,
              resize: "none",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(10,10,15,0.9)",
              color: "#fff",
              padding: "12px 14px",
              fontFamily: POPPINS,
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={sending}
            style={{
              alignSelf: "flex-end",
              minWidth: 112,
              border: "none",
              borderRadius: 999,
              padding: "10px 16px",
              background: sending ? "rgba(240,24,122,0.55)" : "linear-gradient(180deg, #ff2b8e 0%, #e41170 100%)",
              color: "#fff",
              fontFamily: POPPINS,
              fontWeight: 700,
              cursor: sending ? "wait" : "pointer",
            }}
          >
            Send
          </button>
          {abuseWarning && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)",
            }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>🚫</span>
              <div>
                <p style={{ margin: 0, color: "#f87171", fontFamily: POPPINS, fontSize: 12, fontWeight: 700 }}>
                  Message Blocked
                </p>
                <p style={{ margin: "2px 0 0", color: "rgba(248,113,113,0.85)", fontFamily: POPPINS, fontSize: 11, lineHeight: 1.5 }}>
                  Please avoid abusive or offensive language while communicating on Collabry.
                </p>
                <p style={{ margin: "2px 0 0", color: "rgba(255,255,255,0.70)", fontFamily: POPPINS, fontSize: 10 }}>
                  Repeated violations may lead to account restrictions.
                </p>
              </div>
            </div>
          )}
          {!abuseWarning && inputError ? <div style={{ color: "#ff9bc9", fontSize: 11, fontFamily: POPPINS }}>{inputError}</div> : null}
        </div>
      )}
    </div>
  );
}
