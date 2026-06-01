import { useCallback, useEffect, useRef, useState } from "react";
import type { PopupItem } from "../components/GlobalPopup";

type Role = "creator" | "brand";

export function usePopupQueue(
  role: Role,
  getToken: () => string | null,
  filterPopup?: (popup: PopupItem) => PopupItem | null,
) {
  const [queue, setQueue] = useState<PopupItem[]>([]);
  const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const filterPopupRef = useRef(filterPopup);
  filterPopupRef.current = filterPopup;

  const serverDismiss = useCallback(async (id: string) => {
    const token = getTokenRef.current();
    if (!token) return;
    try {
      await fetch(`${BASE_URL}/api/${role}/popups/${id}/dismiss`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { }
  }, [role, BASE_URL]);

  const dismiss = useCallback(async (id: string) => {
    setQueue(q => q.filter(p => p.id !== id));
    await serverDismiss(id);
  }, [serverDismiss]);

  const enqueue = useCallback((item: PopupItem) => {
    const filter = filterPopupRef.current;
    if (filter) {
      const transformed = filter(item);
      if (transformed === null) {
        serverDismiss(item.id);
        return;
      }
      setQueue(q => q.some(p => p.id === transformed.id) ? q : [...q, transformed]);
      return;
    }
    setQueue(q => q.some(p => p.id === item.id) ? q : [...q, item]);
  }, [serverDismiss]);

  const mergePending = useCallback(() => {
    const token = getTokenRef.current();
    if (!token) return;
    fetch(`${BASE_URL}/api/${role}/popups/pending`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.popups?.length) return;
        setQueue(q => {
          const existingIds = new Set(q.map(p => p.id));
          const filter = filterPopupRef.current;
          const incoming: PopupItem[] = [];
          for (const raw of data.popups as PopupItem[]) {
            if (existingIds.has(raw.id)) continue;
            if (filter) {
              const transformed = filter(raw);
              if (transformed === null) {
                serverDismiss(raw.id);
                continue;
              }
              if (!existingIds.has(transformed.id)) {
                incoming.push(transformed);
                existingIds.add(transformed.id);
              }
            } else {
              incoming.push(raw);
            }
          }
          return incoming.length ? [...q, ...incoming] : q;
        });
      })
      .catch(() => { });
  }, [role, BASE_URL, serverDismiss]);

  useEffect(() => {
    mergePending();
    const t = setInterval(mergePending, 30_000);
    return () => clearInterval(t);
  }, [mergePending]);

  return { current: queue[0] ?? null, dismiss: () => dismiss(queue[0]?.id ?? ""), enqueue };
}
