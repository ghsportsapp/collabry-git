import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Shield, X } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#F0187A";
const BG = "#0A0A0F";

// The 16 grantable sections (manage-admins is NOT grantable to normal admins).
const SECTIONS: Array<{ key: string; label: string }> = [
  { key: "landing", label: "Landing Page" },
  { key: "brand-landing", label: "Brand Landing" },
  { key: "creator-landing", label: "Creator Landing" },
  { key: "brand-onboarding", label: "Brand Onboarding" },
  { key: "credits", label: "Credits" },
  { key: "categories", label: "Categories" },
  { key: "about-us", label: "Connect Now" },
  { key: "white-glove", label: "White Glove" },
  { key: "advertisement", label: "Advertisement" },
  { key: "legal", label: "Legal Pages" },
  { key: "creator-onboarding", label: "Creator Onboarding" },
  { key: "pricing", label: "Pricing & Slabs" },
  { key: "campaign-management", label: "Campaign Management" },
  { key: "deal-management", label: "Deal Management" },
  { key: "matchmaking", label: "Matchmaking" },
  { key: "landing-videos", label: "Videos" },
  { key: "chatbot", label: "Chatbot" },
];
const LABEL: Record<string, string> = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label]));

interface AdminRow {
  id: string;
  name: string | null;
  email: string;
  allowedSections: string[];
  isSuperAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}

const inputClass = "w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/40 placeholder:text-white/30";

export default function ManageAdmins() {
  const { adminFetch, isSuperAdmin, adminId } = useAdminAuth();
  const [, navigate] = useLocation();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch("/api/admin/manage-admins");
      if (r.ok) { const d = await r.json(); setAdmins(d.admins ?? []); }
      else setMsg({ text: "Failed to load admins.", ok: false });
    } catch { setMsg({ text: "Failed to load admins.", ok: false }); }
    finally { setLoading(false); }
  }, [adminFetch]);

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);

  if (!isSuperAdmin) return null; // route guard also redirects; defense in depth

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: POPPINS }}>
      <header className="sticky top-0 z-40 px-6 h-16 flex items-center gap-4 border-b border-white/8" style={{ background: "rgba(10,10,15,0.95)" }}>
        <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 hover:text-white flex items-center gap-1.5">
          <ArrowLeft className="w-5 h-5" /><span className="text-sm">Back</span>
        </button>
        <h1 className="text-white font-bold text-base flex items-center gap-2"><Shield className="w-4 h-4" style={{ color: PINK }} /> Manage Admins</h1>
        <button onClick={() => setShowCreate(true)} className="ml-auto flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-2 rounded-full" style={{ background: PINK }}>
          <Plus className="w-3.5 h-3.5" /> New Admin
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {msg && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: msg.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, color: msg.ok ? "#34d399" : "#f87171" }}>
            {msg.text}
          </div>
        )}

        {loading ? (
          <p className="text-white/50 text-sm py-10 text-center">Loading…</p>
        ) : (
          <div className="space-y-3">
            {admins.map((a) => (
              <div key={a.id} className="rounded-2xl p-4 flex flex-wrap items-center gap-3" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold text-sm truncate">{a.name || a.email}</p>
                    {a.isSuperAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(240,24,122,0.15)", color: PINK }}>Super Admin</span>}
                    {a.disabled && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>Disabled</span>}
                  </div>
                  <p className="text-white/50 text-xs mt-0.5 truncate">{a.email}</p>
                  {!a.isSuperAdmin && (
                    <p className="text-white/40 text-[11px] mt-1">
                      {a.allowedSections.length === 0 ? "No sections" : a.allowedSections.map((s) => LABEL[s] ?? s).join(" · ")}
                    </p>
                  )}
                </div>
                {!a.isSuperAdmin && (
                  <button onClick={() => setEditing(a)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20 text-white hover:bg-white/5">
                    Edit
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateAdminModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setMsg({ text: "Admin created.", ok: true }); load(); }}
          adminFetch={adminFetch}
        />
      )}
      {editing && (
        <EditAdminModal
          admin={editing}
          isSelf={editing.id === adminId}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMsg({ text, ok: true }); load(); }}
          adminFetch={adminFetch}
        />
      )}
    </div>
  );
}

function SectionPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
      {SECTIONS.map((s) => {
        const sel = value.includes(s.key);
        return (
          <button key={s.key} type="button" onClick={() => toggle(s.key)}
            className="text-left text-xs px-2.5 py-2 rounded-lg transition-colors"
            style={{ background: sel ? "rgba(240,24,122,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${sel ? PINK : "rgba(255,255,255,0.10)"}`, color: sel ? "#fff" : "rgba(255,255,255,0.75)" }}>
            {sel ? "✓ " : ""}{s.label}
          </button>
        );
      })}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#15151D", border: "1px solid rgba(240,24,122,0.3)", fontFamily: POPPINS }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-base">{title}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Fetcher = (path: string, options?: RequestInit) => Promise<Response>;

function CreateAdminModal({ onClose, onCreated, adminFetch }: { onClose: () => void; onCreated: () => void; adminFetch: Fetcher }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || password.length < 8 || !/^\d{4,6}$/.test(otp)) {
      setError("Name, valid email, 8+ char password and a 4–6 digit OTP are required."); return;
    }
    setSaving(true);
    try {
      const r = await adminFetch("/api/admin/manage-admins", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, otp, allowedSections: sections }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) onCreated();
      else setError(d?.error ?? "Could not create admin.");
    } catch { setError("Could not reach the server."); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title="Create Admin" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div><label className="block text-white/60 text-xs mb-1">Name</label><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="block text-white/60 text-xs mb-1">Email</label><input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="block text-white/60 text-xs mb-1">Password</label><input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" /></div>
        <div><label className="block text-white/60 text-xs mb-1">OTP (4–6 digits)</label><input className={inputClass} inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="e.g. 1234" /></div>
        <div><label className="block text-white/60 text-xs mb-1.5">Sections this admin can access</label><SectionPicker value={sections} onChange={setSections} /></div>
        <button type="submit" disabled={saving} className="w-full py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50" style={{ background: PINK }}>
          {saving ? "Creating…" : "Create Admin"}
        </button>
      </form>
    </ModalShell>
  );
}

function EditAdminModal({ admin, isSelf, onClose, onSaved, adminFetch }: { admin: AdminRow; isSelf: boolean; onClose: () => void; onSaved: (text: string) => void; adminFetch: Fetcher }) {
  const [sections, setSections] = useState<string[]>(admin.allowedSections);
  const [newPassword, setNewPassword] = useState("");
  const [newOtp, setNewOtp] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const patch = async (body: Record<string, unknown>, successText: string) => {
    setError(""); setSaving(true);
    try {
      const r = await adminFetch(`/api/admin/manage-admins/${admin.id}`, { method: "PATCH", body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) onSaved(successText);
      else setError(d?.error ?? "Update failed.");
    } catch { setError("Could not reach the server."); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!window.confirm(`Delete ${admin.email}? This cannot be undone.`)) return;
    setError(""); setSaving(true);
    try {
      const r = await adminFetch(`/api/admin/manage-admins/${admin.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) onSaved("Admin deleted.");
      else setError(d?.error ?? "Delete failed.");
    } catch { setError("Could not reach the server."); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={`Edit · ${admin.name || admin.email}`} onClose={onClose}>
      <div className="space-y-4">
        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div>
          <label className="block text-white/60 text-xs mb-1.5">Sections</label>
          <SectionPicker value={sections} onChange={setSections} />
          <button onClick={() => patch({ allowedSections: sections }, "Sections updated.")} disabled={saving}
            className="mt-2 w-full py-2 rounded-full text-white text-xs font-semibold disabled:opacity-50" style={{ background: PINK }}>
            Save sections
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-white/60 text-xs mb-1">Reset password</label>
            <input className={inputClass} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="min 8" />
            <button onClick={() => patch({ password: newPassword }, "Password reset.")} disabled={saving || newPassword.length < 8}
              className="mt-1.5 w-full py-1.5 rounded-full text-xs border border-white/20 text-white disabled:opacity-40">Reset</button>
          </div>
          <div>
            <label className="block text-white/60 text-xs mb-1">Reset OTP</label>
            <input className={inputClass} inputMode="numeric" value={newOtp} onChange={(e) => setNewOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="4–6 digits" />
            <button onClick={() => patch({ otp: newOtp }, "OTP reset.")} disabled={saving || !/^\d{4,6}$/.test(newOtp)}
              className="mt-1.5 w-full py-1.5 rounded-full text-xs border border-white/20 text-white disabled:opacity-40">Reset</button>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-white/8">
          <button onClick={() => patch({ disabled: !admin.disabled }, admin.disabled ? "Admin enabled." : "Admin disabled.")}
            disabled={saving || (isSelf && !admin.disabled)}
            className="flex-1 py-2 rounded-full text-xs font-semibold border border-white/20 text-white disabled:opacity-40"
            title={isSelf && !admin.disabled ? "You can't disable your own account" : ""}>
            {admin.disabled ? "Enable" : "Disable"}
          </button>
          <button onClick={del} disabled={saving || isSelf}
            className="flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
            style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
            title={isSelf ? "You can't delete your own account" : ""}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
