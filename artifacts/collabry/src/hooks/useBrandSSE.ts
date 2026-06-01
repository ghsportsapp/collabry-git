import { useEffect, useRef } from "react";

type SSEHandler = (event: MessageEvent) => void;

export function useBrandSSE(getToken: () => string | null, onMessage: (type: string, data: unknown) => void) {
  const esRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    const url = `${BASE_URL}/api/brand/notifications/stream?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    esRef.current = es;

    const handler: SSEHandler = (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessageRef.current(e.type, data);
      } catch { }
    };

    const popupEvents = ["popup", "notification", "message"];
    popupEvents.forEach(type => es.addEventListener(type, handler as EventListener));

    es.onerror = () => {
      es.close();
    };

    return () => {
      popupEvents.forEach(type => es.removeEventListener(type, handler as EventListener));
      es.close();
      esRef.current = null;
    };
  }, [getToken]);
}
