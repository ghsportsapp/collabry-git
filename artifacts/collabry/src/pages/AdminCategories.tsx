import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronRight, X, Check, Search, Eye, EyeOff } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const POPPINS = "'Poppins', sans-serif";
const inputClass = "bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/60 placeholder:text-white/70 transition-all";

interface Subcategory { id: string; name: string; displayOrder: number; isActive: boolean }
interface Category { id: string; name: string; displayOrder: number; isActive: boolean; subcategoryCount: number; relatedCategories: { id: string; name: string }[] }

interface EditModal {
  id: string;
  name: string;
  relatedIds: string[];
}

function RelatedCategorySelect({
  allCategories,
  currentId,
  selected,
  onChange,
}: {
  allCategories: Category[];
  currentId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const options = allCategories.filter(c => c.id !== currentId);
  const filtered = search.trim()
    ? options.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  const remove = (id: string) => onChange(selected.filter(x => x !== id));
  const selectedCats = options.filter(c => selected.includes(c.id));

  return (
    <div ref={ref} className="relative">
      {/* Tag area + dropdown trigger */}
      <div
        className="min-h-[42px] w-full border border-white/20 rounded-lg px-3 py-2 cursor-pointer transition-all flex flex-wrap gap-1.5 items-center"
        style={{ background: "transparent", borderColor: open ? "rgba(255,255,255,0.20)" : "" }}
        onClick={() => setOpen(v => !v)}
      >
        {selectedCats.length === 0 && (
          <span className="text-white/70 text-sm select-none">Select related categories…</span>
        )}
        {selectedCats.map(cat => (
          <span key={cat.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: "rgba(240,24,122,0.18)", color: "#E14F69", border: "1px solid rgba(240,24,122,0.30)" }}>
            {cat.name}
            <button type="button" onClick={e => { e.stopPropagation(); remove(cat.id); }}
              className="hover:text-white ml-0.5 leading-none">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <ChevronDown className={`w-4 h-4 text-white/70 ml-auto flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {/* Clear all */}
      {selected.length > 0 && (
        <button type="button" onClick={e => { e.stopPropagation(); onChange([]); }}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-white/70 hover:text-white/80 text-xs">
          Clear all
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border border-white/15 overflow-hidden"
          style={{ background: "#1a1a24", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          <div className="p-2 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" />
              <input
                className="w-full bg-white/5 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs outline-none placeholder:text-white/70"
                placeholder="Search categories…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-white/70 text-xs text-center py-4">No categories found</p>
            )}
            {filtered.map(cat => {
              const checked = selected.includes(cat.id);
              return (
                <button key={cat.id} type="button"
                  onClick={e => { e.stopPropagation(); toggle(cat.id); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${checked ? "border-[#E14F69]" : "border-white/25"}`}
                    style={{ background: checked ? "#E14F69" : "transparent" }}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className={`text-sm ${checked ? "text-white" : "text-white/90"}`}>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCategories() {
  const { adminFetch } = useAdminAuth();
  const [, navigate] = useLocation();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subcategoriesMap, setSubcategoriesMap] = useState<Record<string, Subcategory[]>>({});
  const [loadingSubsFor, setLoadingSubsFor] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [addCatName, setAddCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);

  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [editSubId, setEditSubId] = useState<{ id: string; name: string } | null>(null);
  const [addSubName, setAddSubName] = useState<Record<string, string>>({});
  const [showAddSub, setShowAddSub] = useState<Set<string>>(new Set());

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const r = await adminFetch("/api/admin/categories");
    if (r.ok) setCategories(await r.json());
    setLoading(false);
  }, [adminFetch]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const loadSubcategories = async (catId: string) => {
    if (subcategoriesMap[catId]) return;
    setLoadingSubsFor(catId);
    const r = await adminFetch(`/api/admin/categories/${catId}/subcategories`);
    if (r.ok) { const data = await r.json(); setSubcategoriesMap(prev => ({ ...prev, [catId]: data })); }
    setLoadingSubsFor(null);
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); }
    else { setExpandedId(id); loadSubcategories(id); }
  };

  const addCategory = async () => {
    if (!addCatName.trim()) return;
    setAddingCat(true);
    const r = await adminFetch("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: addCatName.trim() }) });
    if (r.ok) { showToast("Category added"); setAddCatName(""); setShowAddCat(false); loadCategories(); }
    else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
    setAddingCat(false);
  };

  const openEditModal = (cat: Category) => {
    setEditModal({
      id: cat.id,
      name: cat.name,
      relatedIds: cat.relatedCategories.map(r => r.id),
    });
  };

  const saveEdit = async () => {
    if (!editModal) return;
    setSavingEdit(true);
    const r = await adminFetch(`/api/admin/categories/${editModal.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: editModal.name.trim(), relatedCategoryIds: editModal.relatedIds }),
    });
    if (r.ok) {
      showToast("Category updated");
      setEditModal(null);
      loadCategories();
    } else {
      const d = await r.json();
      showToast(d.error ?? "Failed", false);
    }
    setSavingEdit(false);
  };

  const toggleActive = async (cat: Category) => {
    const r = await adminFetch(`/api/admin/categories/${cat.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !cat.isActive }),
    });
    if (r.ok) { showToast(cat.isActive ? "Category deactivated" : "Category activated"); loadCategories(); }
    else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
  };

  const deleteCategory = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    const r = await adminFetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    if (r.ok) { const d = await r.json(); showToast(`Deleted. ${d.affectedBrands} brands notified.`); loadCategories(); if (expandedId === id) setExpandedId(null); }
    else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
  };

  const addSubcategory = async (catId: string) => {
    const name = addSubName[catId]?.trim();
    if (!name) return;
    const r = await adminFetch(`/api/admin/categories/${catId}/subcategories`, { method: "POST", body: JSON.stringify({ name }) });
    if (r.ok) { showToast("Subcategory added"); setAddSubName(p => ({ ...p, [catId]: "" })); setSubcategoriesMap(p => { const c = { ...p }; delete c[catId]; return c; }); loadSubcategories(catId); }
    else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
  };

  const renameSubcategory = async (id: string, catId: string, name: string) => {
    const r = await adminFetch(`/api/admin/subcategories/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (r.ok) { showToast("Renamed"); setEditSubId(null); setSubcategoriesMap(p => { const c = { ...p }; delete c[catId]; return c; }); loadSubcategories(catId); }
    else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
  };

  const deleteSubcategory = async (id: string, catId: string, name: string) => {
    if (!confirm(`Delete subcategory "${name}"?`)) return;
    const r = await adminFetch(`/api/admin/subcategories/${id}`, { method: "DELETE" });
    if (r.ok) { showToast("Deleted"); setSubcategoriesMap(p => ({ ...p, [catId]: (p[catId] ?? []).filter(s => s.id !== id) })); loadCategories(); }
    else { const d = await r.json(); showToast(d.error ?? "Failed", false); }
  };

  return (
    <div className="min-h-screen px-4 py-8 max-w-3xl mx-auto" style={{ background: "#0A0A0F", fontFamily: POPPINS }}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm text-white shadow-lg ${toast.ok ? "bg-green-700/90" : "bg-red-700/90"}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Edit Category Modal ──────────────────────────────────────────── */}
      {editModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-5" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold text-base">Edit Category</h2>
              <button onClick={() => setEditModal(null)} className="text-white/70 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>

            {/* Category name */}
            <div>
              <label className="block text-white/70 text-xs mb-1.5">Category Name</label>
              <input
                className={inputClass + " w-full"}
                value={editModal.name}
                onChange={e => setEditModal(p => p ? { ...p, name: e.target.value } : null)}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(); }}
                autoFocus
              />
            </div>

            {/* Related categories multi-select */}
            <div>
              <label className="block text-white/70 text-xs mb-1.5">Related Categories</label>
              <RelatedCategorySelect
                allCategories={categories}
                currentId={editModal.id}
                selected={editModal.relatedIds}
                onChange={ids => setEditModal(p => p ? { ...p, relatedIds: ids } : null)}
              />
              <p className="text-white/70 text-xs mt-1.5">Selected categories will be linked bidirectionally as related.</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm hover:border-white/30 transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={savingEdit || !editModal.name.trim()}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all"
                style={{ background: "#E14F69" }}>
                {savingEdit ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/admin-collabryangad")} className="text-white/80 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white text-xl font-bold">Categories</h1>
          <span className="text-white/70 text-sm">({categories.filter(c => c.isActive).length} active)</span>
        </div>
        <button onClick={() => setShowAddCat(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-semibold transition-all" style={{ background: "#E14F69" }}>
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {showAddCat && (
        <div className="rounded-xl p-4 mb-4 border border-white/10 flex gap-3" style={{ background: "rgba(240,24,122,0.08)" }}>
          <input className={inputClass + " flex-1"} placeholder="Category name" value={addCatName} onChange={e => setAddCatName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addCategory(); }} autoFocus />
          <button onClick={addCategory} disabled={addingCat || !addCatName.trim()} className="px-4 py-2 rounded-full text-white text-sm font-semibold disabled:opacity-40" style={{ background: "#E14F69" }}>
            {addingCat ? "..." : "Add"}
          </button>
          <button onClick={() => { setShowAddCat(false); setAddCatName(""); }} className="text-white/70 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-white/70 text-center py-16">Loading categories...</div>
      ) : categories.length === 0 ? (
        <div className="text-white/70 text-center py-16">No categories yet. Add one above.</div>
      ) : (
        <div className="space-y-2">
          {categories.map(cat => (
            <div key={cat.id} className="rounded-xl border overflow-hidden transition-all"
              style={{ background: cat.isActive ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)", borderColor: cat.isActive ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)" }}>
              {/* Category row */}
              <div className={`flex items-start gap-3 px-4 py-3.5 ${!cat.isActive ? "opacity-50" : ""}`}>
                <button onClick={() => toggleExpand(cat.id)} className="text-white/70 hover:text-white transition-colors mt-0.5 flex-shrink-0">
                  {expandedId === cat.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* Name + related tags */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">{cat.name}</span>
                    {!cat.isActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)" }}>
                        inactive
                      </span>
                    )}
                  </div>
                  {/* Related category tags */}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {cat.relatedCategories.length > 0 ? (
                      cat.relatedCategories.map(rel => (
                        <span key={rel.id} className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "rgba(240,24,122,0.15)", color: "#E14F69", border: "1px solid rgba(240,24,122,0.25)" }}>
                          {rel.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-white/70 text-xs">No related categories</span>
                    )}
                  </div>
                </div>

                <span className="text-white/70 text-xs flex-shrink-0 mt-0.5">{cat.subcategoryCount} subs</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleActive(cat)} className="transition-colors p-1"
                    style={{ color: cat.isActive ? "#4ade80" : "rgba(255,255,255,0.70)" }}
                    title={cat.isActive ? "Deactivate category" : "Activate category"}>
                    {cat.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => openEditModal(cat)} className="text-white/70 hover:text-white transition-colors p-1" title="Edit category"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteCategory(cat.id, cat.name)} className="text-white/70 hover:text-red-400 transition-colors p-1" title="Delete category"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Subcategories panel */}
              {expandedId === cat.id && (
                <div className="border-t border-white/10 px-4 py-3">
                  {loadingSubsFor === cat.id ? (
                    <p className="text-white/70 text-sm py-2 text-center">Loading...</p>
                  ) : (
                    <>
                      <div className="space-y-2 mb-3">
                        {(subcategoriesMap[cat.id] ?? []).filter(s => s.isActive).map(sub => (
                          <div key={sub.id} className="flex items-center gap-3 ml-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/20 flex-shrink-0" />
                            {editSubId?.id === sub.id ? (
                              <input className={inputClass + " flex-1 text-xs"} value={editSubId.name}
                                onChange={e => setEditSubId(p => p ? { ...p, name: e.target.value } : null)}
                                onKeyDown={e => { if (e.key === "Enter") renameSubcategory(sub.id, cat.id, editSubId.name); if (e.key === "Escape") setEditSubId(null); }}
                                autoFocus />
                            ) : (
                              <span className="flex-1 text-white/80 text-xs">{sub.name}</span>
                            )}
                            {editSubId?.id === sub.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => renameSubcategory(sub.id, cat.id, editSubId.name)} className="text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setEditSubId(null)} className="text-white/70 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button onClick={() => setEditSubId({ id: sub.id, name: sub.name })} className="text-white/70 hover:text-white transition-colors p-1"><Pencil className="w-3 h-3" /></button>
                                <button onClick={() => deleteSubcategory(sub.id, cat.id, sub.name)} className="text-white/70 hover:text-red-400 transition-colors p-1"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {showAddSub.has(cat.id) ? (
                        <div className="flex gap-2 ml-4">
                          <input className={inputClass + " flex-1 text-xs"} placeholder="New subcategory name"
                            value={addSubName[cat.id] ?? ""}
                            onChange={e => setAddSubName(p => ({ ...p, [cat.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") addSubcategory(cat.id); if (e.key === "Escape") setShowAddSub(p => { const n = new Set(p); n.delete(cat.id); return n; }); }}
                            autoFocus />
                          <button onClick={() => addSubcategory(cat.id)} className="text-[#E14F69] hover:text-[#d4156b] transition-colors"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setShowAddSub(p => { const n = new Set(p); n.delete(cat.id); return n; })} className="text-white/70 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <button onClick={() => setShowAddSub(p => new Set(p).add(cat.id))}
                          className="flex items-center gap-1.5 ml-4 text-white/70 hover:text-[#E14F69] transition-colors text-xs">
                          <Plus className="w-3 h-3" /> Add subcategory {(subcategoriesMap[cat.id] ?? []).filter(s => s.isActive).length >= 8 && <span className="text-red-400">(max 8)</span>}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
