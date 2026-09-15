import { POPPINS, PINK } from "@/components/BrandLayout";

/* The same Prev / "n / m" / Next control the search page uses, extracted so the
   campaign applicant lists match it exactly. Renders nothing on a single page. */
export default function PaginationBar({ page, totalPages, loading, onChange }: {
  page: number;
  totalPages: number;
  loading?: boolean;
  onChange: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-8">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1 || loading}
        className="text-xs rounded-full px-5 py-2"
        style={{
          border: "1px solid rgba(255,255,255,0.15)",
          background: "none",
          color: "rgba(255,255,255,0.90)",
          fontFamily: POPPINS,
          opacity: page <= 1 ? 0.4 : 1,
          cursor: page <= 1 ? "not-allowed" : "pointer",
        }}
      >
        ← Prev
      </button>
      <span className="text-xs" style={{ color: "rgba(255,255,255,0.70)", fontFamily: POPPINS }}>
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages || loading}
        className="text-xs font-semibold rounded-full px-5 py-2"
        style={{
          border: "none",
          background: PINK,
          color: "#fff",
          fontFamily: POPPINS,
          opacity: page >= totalPages ? 0.4 : 1,
          cursor: page >= totalPages ? "not-allowed" : "pointer",
        }}
      >
        Next →
      </button>
    </div>
  );
}
