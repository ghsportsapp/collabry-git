import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, MessageCircle, CornerDownRight } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { type ChatbotConfig, type ChatNode, type ChatAudience, DEFAULT_CHATBOT_CONFIG } from "@/lib/chatbot";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#F0187A";
const BG = "#0A0A0F";

const inputClass = "w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/40 placeholder:text-white/30";

// ── Immutable tree helpers (operate on a ChatNode[] by node id) ──
const newNode = (): ChatNode => ({ id: crypto.randomUUID(), question: "", answer: "", children: [] });

function patchNode(nodes: ChatNode[], id: string, patch: Partial<ChatNode>): ChatNode[] {
  return nodes.map((n) =>
    n.id === id ? { ...n, ...patch } : { ...n, children: patchNode(n.children, id, patch) }
  );
}
function removeNode(nodes: ChatNode[], id: string): ChatNode[] {
  return nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: removeNode(n.children, id) }));
}
function addChildTo(nodes: ChatNode[], parentId: string, child: ChatNode): ChatNode[] {
  return nodes.map((n) =>
    n.id === parentId ? { ...n, children: [...n.children, child] } : { ...n, children: addChildTo(n.children, parentId, child) }
  );
}
function moveNode(nodes: ChatNode[], id: string, dir: -1 | 1): ChatNode[] {
  const i = nodes.findIndex((n) => n.id === id);
  if (i !== -1) {
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return nodes;
    const copy = [...nodes];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    return copy;
  }
  return nodes.map((n) => ({ ...n, children: moveNode(n.children, id, dir) }));
}

export default function AdminChatbot() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();
  const [audience, setAudience] = useState<ChatAudience>("brand");
  const [configs, setConfigs] = useState<Record<ChatAudience, ChatbotConfig | null>>({ brand: null, creator: null });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const cfg = configs[audience];

  const load = useCallback(async (a: ChatAudience) => {
    setLoading(true);
    try {
      const r = await adminFetch(`/api/admin/chatbot/${a}`);
      const d = r.ok ? await r.json() : null;
      setConfigs((c) => ({ ...c, [a]: d && typeof d === "object" ? d : { ...DEFAULT_CHATBOT_CONFIG } }));
    } catch {
      setConfigs((c) => ({ ...c, [a]: { ...DEFAULT_CHATBOT_CONFIG } }));
    } finally { setLoading(false); }
  }, [adminFetch]);

  useEffect(() => { if (configs[audience] === null) load(audience); }, [audience, configs, load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);

  const update = (patch: Partial<ChatbotConfig>) => setConfigs((c) => ({ ...c, [audience]: { ...(c[audience] as ChatbotConfig), ...patch } }));
  const setTree = (fn: (t: ChatNode[]) => ChatNode[]) => setConfigs((c) => {
    const cur = c[audience] as ChatbotConfig;
    return { ...c, [audience]: { ...cur, tree: fn(cur.tree) } };
  });

  const save = async () => {
    if (!cfg) return;
    setSaving(true); setMsg(null);
    try {
      const r = await adminFetch(`/api/admin/chatbot/${audience}`, { method: "PUT", body: JSON.stringify(cfg) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setConfigs((c) => ({ ...c, [audience]: d.config ?? cfg })); setMsg({ text: "Saved. Links in answers are stripped automatically.", ok: true }); }
      else setMsg({ text: d?.error ?? "Save failed.", ok: false });
    } catch { setMsg({ text: "Could not reach the server.", ok: false }); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: POPPINS }}>
      <header className="sticky top-0 z-40 px-6 h-16 flex items-center gap-4 border-b border-white/8" style={{ background: "rgba(10,10,15,0.95)" }}>
        <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 hover:text-white flex items-center gap-1.5">
          <ArrowLeft className="w-5 h-5" /><span className="text-sm">Back</span>
        </button>
        <h1 className="text-white font-bold text-base flex items-center gap-2"><MessageCircle className="w-4 h-4" style={{ color: PINK }} /> Chatbot</h1>
        <button onClick={save} disabled={saving || !cfg} className="ml-auto text-white text-xs font-semibold px-4 py-2 rounded-full disabled:opacity-50" style={{ background: PINK }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(["brand", "creator"] as ChatAudience[]).map((a) => (
            <button key={a} onClick={() => setAudience(a)}
              className="px-4 py-2 rounded-full text-xs font-semibold capitalize"
              style={audience === a
                ? { background: PINK, color: "#fff" }
                : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {a} Chatbot
            </button>
          ))}
        </div>

        {msg && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: msg.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, color: msg.ok ? "#34d399" : "#f87171" }}>
            {msg.text}
          </div>
        )}

        {loading || !cfg ? (
          <p className="text-white/50 text-sm py-10 text-center">Loading…</p>
        ) : (
          <div className="space-y-5">
            {/* Settings */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.08)" }}>
              <label className="flex items-center justify-between">
                <span className="text-white text-sm font-semibold">Enabled</span>
                <button onClick={() => update({ enabled: !cfg.enabled })}
                  className="relative w-11 h-6 rounded-full transition-colors"
                  style={{ background: cfg.enabled ? PINK : "rgba(255,255,255,0.18)" }}>
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: cfg.enabled ? 22 : 2 }} />
                </button>
              </label>
              <div>
                <label className="block text-white/60 text-xs mb-1">Bot name</label>
                <input className={inputClass} value={cfg.botName} onChange={(e) => update({ botName: e.target.value })} placeholder="Radhika from Collabry" />
              </div>
              <div>
                <label className="block text-white/60 text-xs mb-1">Welcome message (shown before the menu)</label>
                <textarea className={inputClass} rows={2} value={cfg.welcomeMessage} onChange={(e) => update({ welcomeMessage: e.target.value })} />
              </div>
            </div>

            {/* Tree */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-semibold text-sm">Menu flow</p>
                <button onClick={() => setTree((t) => [...t, newNode()])} className="text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: "rgba(240,24,122,0.15)", color: PINK }}>
                  <Plus className="w-3.5 h-3.5" /> Add main-menu option
                </button>
              </div>
              <p className="text-white/40 text-[11px] mb-3">Each option is a button the user taps. Its answer is the bot's reply; add child options for follow-up questions (unlimited depth). “Return to main menu” is added automatically in the widget.</p>

              {cfg.tree.length === 0 ? (
                <p className="text-white/40 text-xs py-6 text-center rounded-xl" style={{ border: "1px dashed rgba(255,255,255,0.12)" }}>No options yet — add your first main-menu option.</p>
              ) : (
                <div className="space-y-2">
                  {cfg.tree.map((n, i) => (
                    <NodeEditor key={n.id} node={n} index={i} siblingCount={cfg.tree.length} depth={0}
                      onUpdate={(id, patch) => setTree((t) => patchNode(t, id, patch))}
                      onDelete={(id) => setTree((t) => removeNode(t, id))}
                      onAddChild={(id) => setTree((t) => addChildTo(t, id, newNode()))}
                      onMove={(id, dir) => setTree((t) => moveNode(t, id, dir))}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

interface NodeEditorProps {
  node: ChatNode;
  index: number;
  siblingCount: number;
  depth: number;
  onUpdate: (id: string, patch: Partial<ChatNode>) => void;
  onDelete: (id: string) => void;
  onAddChild: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

function NodeEditor({ node, index, siblingCount, depth, onUpdate, onDelete, onAddChild, onMove }: NodeEditorProps) {
  return (
    <div className="rounded-xl p-3" style={{ background: depth % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(240,24,122,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginLeft: depth > 0 ? 16 : 0 }}>
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2 min-w-0">
          <input className={inputClass} value={node.question} onChange={(e) => onUpdate(node.id, { question: e.target.value })} placeholder="Option label (what the user taps)" />
          <textarea className={inputClass} rows={2} value={node.answer} onChange={(e) => onUpdate(node.id, { answer: e.target.value })} placeholder="Bot's answer (no links — they're removed on save)" />
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button onClick={() => onMove(node.id, -1)} disabled={index === 0} className="p-1 rounded text-white/60 hover:text-white disabled:opacity-25" title="Move up"><ChevronUp className="w-4 h-4" /></button>
          <button onClick={() => onMove(node.id, 1)} disabled={index === siblingCount - 1} className="p-1 rounded text-white/60 hover:text-white disabled:opacity-25" title="Move down"><ChevronDown className="w-4 h-4" /></button>
          <button onClick={() => onDelete(node.id)} className="p-1 rounded text-red-400/80 hover:text-red-400" title="Delete"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <button onClick={() => onAddChild(node.id)} className="mt-2 text-[11px] font-semibold flex items-center gap-1.5" style={{ color: PINK }}>
        <CornerDownRight className="w-3.5 h-3.5" /> Add child option
      </button>
      {node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((c, i) => (
            <NodeEditor key={c.id} node={c} index={i} siblingCount={node.children.length} depth={depth + 1}
              onUpdate={onUpdate} onDelete={onDelete} onAddChild={onAddChild} onMove={onMove} />
          ))}
        </div>
      )}
    </div>
  );
}
