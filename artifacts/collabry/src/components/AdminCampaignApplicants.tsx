import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useCampaignApplicants } from "@/hooks/useCampaignApplicants";
import ApplicantCard, { type Applicant } from "@/components/ApplicantCard";
import CreatorFilterBar, { type FilterOptions } from "@/components/CreatorFilterBar";
import PaginationBar from "@/components/PaginationBar";
import { POPPINS, PINK } from "@/components/BrandLayout";

/* Admin read-only applicants view. Reuses the brand ApplicantCard + filter bar +
   paging hook verbatim; the only difference is the API namespace (/api/admin/…)
   and an All / Selected tab split instead of brand's PENDING/SHORTLISTED/SELECTED.
   Cards render with no footer, so there are no brand-only actions. */

const ADMIN_STATUSES = ["ALL", "SELECTED"]; // module-level: stable identity for the hook

export default function AdminCampaignApplicants({ kind, campaignId, campaignName, onClose }: {
  kind: "paid" | "barter";
  campaignId: string;
  campaignName?: string;
  onClose: () => void;
}) {
  const { adminFetch } = useAdminAuth();
  const [tab, setTab] = useState(0); // 0 = All, 1 = Selected
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [counts, setCounts] = useState<{ applied: number; selected: number } | null>(null);

  const base = kind === "paid" ? "campaigns" : "barter";

  const { apps, page, totalPages, loading, filters, setFilters, setPage } = useCampaignApplicants({
    kind, campaignId, tab, apiFetch: adminFetch, enabled: true,
    apiRole: "admin", statuses: ADMIN_STATUSES,
  });

  useEffect(() => {
    adminFetch("/api/admin/search/filter-options")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setFilterOpts(d); })
      .catch(() => {});
  }, [adminFetch]);

  useEffect(() => {
    adminFetch(`/api/admin/${base}/${campaignId}/applicant-counts`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCounts(d); })
      .catch(() => {});
  }, [adminFetch, base, campaignId]);

  // Close on Escape, like the other admin modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = (apps ?? []) as Applicant[];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button onClick={onClose} className="text-white/70 hover:text-white p-1" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-white font-bold text-base truncate">{campaignName ?? "Applicants"}</h2>
          <p className="text-white/50 text-xs">
            {counts ? `${counts.applied} applied · ${counts.selected} selected` : "Loading…"}
            <span className="text-white/30"> · {kind === "paid" ? "Paid campaign" : "Barter campaign"}</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-2 px-4 pt-3">
        {["All", "Selected"].map((label, i) => {
          const active = tab === i;
          const n = counts ? (i === 0 ? counts.applied : counts.selected) : null;
          return (
            <button key={label} onClick={() => setTab(i)}
              className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
              style={active
                ? { background: PINK, color: "#fff" }
                : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {label}{n !== null ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-4 pt-3">
        <CreatorFilterBar opts={filterOpts} filters={filters} onChange={setFilters} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto">
          {loading && list.length === 0 ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}
            </div>
          ) : list.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-16">
              {tab === 1 ? "No creators selected for this campaign yet." : "No applicants yet."}
            </p>
          ) : (
            <>
              {list.map(app => <ApplicantCard key={app.id} app={app} />)}
              <PaginationBar page={page} totalPages={totalPages} loading={loading} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
