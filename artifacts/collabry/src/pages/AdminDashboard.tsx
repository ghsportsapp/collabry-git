import { Link, useLocation } from "wouter";
import { Layout, Settings, Users, ArrowRight, CreditCard, Tag, LogOut, FileText, Star, Megaphone, Sliders, Info, Video, Sparkles, Image as ImageIcon, Shield } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { clearAdminSession } from "@/lib/adminAuth";

const POPPINS = "'Poppins', sans-serif";

const pages = [
  { id: "landing", title: "Landing Page", desc: "Edit hero, how it works, collab modes, comparison, team, footer and design colors.", icon: Layout, href: "/admin-collabryangad/landing", status: "Live", statusColor: "bg-green-500" },
  { id: "brand-landing", title: "Brand Landing Page (/brand)", desc: "Edit every section of the /brand page — hero, stats, how it works, collab modes, comparison, CTA, team and footer.", icon: Layout, href: "/admin-collabryangad/brand-landing", status: "Live", statusColor: "bg-green-500" },
  { id: "creator-landing", title: "Creator Landing Page (/creator)", desc: "Edit every section of the /creator page — header, hero, earnings & safety, how it works, 4 ways to get discovered.", icon: Layout, href: "/admin-collabryangad/creator-landing", status: "Live", statusColor: "bg-green-500" },
  { id: "brand-onboarding", title: "Brand Onboarding", desc: "Manage brand signups, view registered brands, adjust credits, suspend accounts, and customize the brand signup form.", icon: Users, href: "/admin-collabryangad/brand-onboarding", status: "Live", statusColor: "bg-green-500" },
  { id: "credits", title: "Credits Management", desc: "Configure free credits on signup, set expiry days, and gift credits to one or multiple brands.", icon: CreditCard, href: "/admin-collabryangad/credits", status: "Live", statusColor: "bg-green-500" },
  { id: "categories", title: "Categories", desc: "Add, rename, and delete brand categories and subcategories. Brands are notified on deletion.", icon: Tag, href: "/admin-collabryangad/categories", status: "Live", statusColor: "bg-green-500" },
  { id: "about-us", title: "Connect Now Editor", desc: "Edit the public Connect Now / About Us page content, team members, mission, and contact details.", icon: Info, href: "/admin-collabryangad/contact-us", status: "Live", statusColor: "bg-green-500" },
  { id: "white-glove", title: "White Glove Service", desc: "Edit the public /white-glove-service page — hero, the included service points, and all three pricing plans.", icon: Sparkles, href: "/admin-collabryangad/white-glove", status: "Live", statusColor: "bg-green-500" },
  { id: "advertisement", title: "Advertisement", desc: "Manage creator-facing ad banners — upload 16:9 images, set headline and body text, toggle active, and reorder the feed.", icon: ImageIcon, href: "/admin-collabryangad/advertisement", status: "Live", statusColor: "bg-green-500" },
  { id: "legal", title: "Legal Pages", desc: "Edit Terms & Conditions and Privacy Policy content shown to users during signup and on the site.", icon: FileText, href: "/admin-collabryangad/legal", status: "Live", statusColor: "bg-green-500" },
  { id: "creator-onboarding", title: "Creator Onboarding", desc: "Review creator applications, approve or reject profiles, view portfolio, and manage suspensions and bans.", icon: Star, href: "/admin-collabryangad/creator-onboarding", status: "Live", statusColor: "bg-green-500" },
  { id: "pricing", title: "Pricing & Slabs", desc: "Configure follower-based pricing slabs shown as recommendations to creators during signup.", icon: CreditCard, href: "/admin-collabryangad/pricing", status: "Live", statusColor: "bg-green-500" },
  { id: "campaign-management", title: "Campaign Management", desc: "All-in-one hub for paid campaigns, barter review queue, and campaign settings (rules for paid + barter).", icon: Megaphone, href: "/admin-collabryangad/campaign-management", status: "Live", statusColor: "bg-green-500" },
  { id: "deal-management", title: "Deal Management", desc: "Configure deal settings (timelines, helper text) and view every finalized deal across paid, barter and matchmaking.", icon: Settings, href: "/admin-collabryangad/deal-management", status: "Live", statusColor: "bg-green-500" },
  { id: "matchmaking", title: "Matchmaking Config", desc: "Configure scoring weights, parameter cards, adjacency rules, field options, result filters and creator profile visibility for the brand matchmaking engine.", icon: Sliders, href: "/admin-collabryangad/matchmaking", status: "Live", statusColor: "bg-green-500" },
  { id: "landing-videos", title: "Videos", desc: "Upload and manage videos and thumbnails for landing pages and other sections.", icon: Video, href: "/admin-collabryangad/landing-videos", status: "Live", statusColor: "bg-green-500" },
  // Super-admin only: filtered in via isSuperAdmin (no normal admin can hold the "manage-admins" key).
  { id: "manage-admins", title: "Manage Admins", desc: "Create admin accounts, set each one's password, OTP and allowed sections, and enable, disable or delete them.", icon: Shield, href: "/admin-collabryangad/manage-admins", status: "Live", statusColor: "bg-green-500" },
];

const comingSoon = [
  { id: "settings", title: "Site Settings", desc: "Manage logo, favicon, SEO, social links.", icon: Settings },
];

export default function AdminDashboard() {
  const { username, isSuperAdmin, allowedSections } = useAdminAuth();
  const [, navigate] = useLocation();

  // Each card's id is its section key — show only the sections this admin may
  // access (super admins see everything).
  const visiblePages = pages.filter((p) => isSuperAdmin || allowedSections.includes(p.id));

  const handleLogout = () => {
    clearAdminSession();
    navigate("/admin-collabryangad/login");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F]" style={{ fontFamily: POPPINS }}>
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-white/8">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-2xl text-[#E14F69]" style={{ fontFamily: "'Macondo Swash Caps', cursive" }}>Collabry</span>
            <span className="text-white/70 text-lg">|</span>
            <span className="text-[#9CA3AF] text-sm font-medium">Admin Panel</span>
          </div>
          <div className="flex items-center gap-4">
            {username && <span className="text-white/70 text-xs hidden sm:block">@{username}</span>}
            <a href="/" target="_blank" rel="noopener noreferrer" className="text-[#9CA3AF] hover:text-white text-sm transition-colors">View Site →</a>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white">Pages</h1>
          <p className="text-[#9CA3AF] mt-2 text-sm">Select a page to edit its content.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
          {visiblePages.map((page) => {
            const Icon = page.icon;
            return (
              <Link key={page.id} href={page.href}>
                <div className="group bg-[#111118] border border-white/10 rounded-2xl p-6 hover:border-[#E14F69]/50 hover:bg-[#E14F69]/5 transition-all cursor-pointer relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#E14F69]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-[#E14F69]/15 border border-[#E14F69]/20 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-[#E14F69]" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${page.statusColor}`} />
                        <span className="text-xs text-[#9CA3AF]">{page.status}</span>
                      </div>
                    </div>
                    <h3 className="text-white font-semibold text-base mb-2">{page.title}</h3>
                    <p className="text-[#9CA3AF] text-xs leading-relaxed mb-5">{page.desc}</p>
                    <div className="flex items-center gap-1 text-[#E14F69] text-xs font-medium group-hover:gap-2 transition-all">
                      <span>Open</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {comingSoon.map((page) => {
            const Icon = page.icon;
            return (
              <div key={page.id} className="bg-[#0d0d14] border border-white/5 rounded-2xl p-6 opacity-50 cursor-not-allowed">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#9CA3AF]" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                    <span className="text-xs text-[#9CA3AF]">Soon</span>
                  </div>
                </div>
                <h3 className="text-white font-semibold text-base mb-2">{page.title}</h3>
                <p className="text-[#9CA3AF] text-xs leading-relaxed mb-5">{page.desc}</p>
                <span className="text-xs text-[#9CA3AF]">Coming soon</span>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
