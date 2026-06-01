import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Megaphone, Gift, Sliders } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import AdminCampaigns from "./AdminCampaigns";
import AdminBarter from "./AdminBarter";
import AdminCampaignSettings from "./AdminCampaignSettings";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";

type Tab = "paid" | "barter" | "settings";

const TABS: { key: Tab; label: string; icon: typeof Megaphone }[] = [
  { key: "paid", label: "Paid Campaigns", icon: Megaphone },
  { key: "barter", label: "Barter Review", icon: Gift },
  { key: "settings", label: "Campaign Settings", icon: Sliders },
];

export default function AdminCampaignManagement() {
  const { adminId } = useAdminAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("paid");

  useEffect(() => { if (!adminId) navigate("/admin-collabryangad/login"); }, [adminId, navigate]);
  if (!adminId) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/8">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
          <span className="text-white/70 text-lg">|</span>
          <span className="text-[#9CA3AF] text-sm">Campaign Management</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Campaign Management</h1>
          <p className="text-white/70 text-sm mt-1">Manage paid campaigns, barter reviews and campaign settings</p>
        </div>

        <div className="flex gap-0 mb-8 border-b border-white/10 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-5 py-3 text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
                style={{
                  color: active ? PINK : "rgba(255,255,255,0.70)",
                  borderBottom: active ? `2px solid ${PINK}` : "2px solid transparent",
                }}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "paid" && <AdminCampaigns embedded />}
        {tab === "barter" && <AdminBarter embedded />}
        {tab === "settings" && <AdminCampaignSettings embedded />}
      </main>
    </div>
  );
}
