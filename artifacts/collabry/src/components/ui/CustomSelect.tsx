import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface Option { value: string; label: string }

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CustomSelect({ options, value, onChange, placeholder = "Select...", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const checkPosition = () => {
      if (!containerRef.current || !listRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const listHeight = Math.min(200, options.length * 44);
      setOpenUpward(rect.bottom + listHeight + 8 > viewportHeight - 20);
    };
    checkPosition();
    window.addEventListener("scroll", checkPosition, { passive: true });
    window.addEventListener("resize", checkPosition, { passive: true });
    return () => {
      window.removeEventListener("scroll", checkPosition);
      window.removeEventListener("resize", checkPosition);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between bg-transparent border border-white/30 rounded-lg px-4 py-3 text-left text-sm transition-all outline-none"
        style={{ color: value ? "white" : "rgba(255,255,255,0.20)", borderColor: open ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.20)" }}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 ml-2 transition-transform text-white/70 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 overflow-y-auto rounded-xl z-[9999]"
          style={{
            background: "#1a0a14",
            border: "1px solid rgba(255,255,255,0.15)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            maxHeight: "200px",
            ...(openUpward ? { bottom: "calc(100% + 4px)" } : { top: "calc(100% + 4px)" }),
          }}
        >
          {options.length === 0 ? (
            <div className="px-4 py-3 text-white/70 text-sm">No options</div>
          ) : (
            options.map(opt => (
              <button
                key={opt.value}
                type="button"
                className="w-full text-left px-4 text-sm transition-colors hover:bg-white/8 active:bg-white/12"
                style={{
                  minHeight: "44px",
                  display: "flex",
                  alignItems: "center",
                  color: opt.value === value ? "#E14F69" : "white",
                  fontWeight: opt.value === value ? 600 : 400,
                }}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
