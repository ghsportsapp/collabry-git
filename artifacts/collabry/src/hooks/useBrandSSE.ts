import { useEffect, useRef } from "react";

type SSEHandler = (event: MessageEvent) => void;

const SSE_EVENTS = ["popup", "notification", "message"];

export function useBrandSSE(getToken: () => string | null, onMessage: (type: string, data: unknown) => void) {
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    const url = `${BASE_URL}/api/brand/notifications/stream?token=${encodeURIComponent(token)}`;
    let destroyed = false;

    const handler: SSEHandler = (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessageRef.current(e.type, data);
      } catch { }
    };

    function connect() {
      if (destroyed) return;
      const es = new EventSource(url);
      esRef.current = es;
      SSE_EVENTS.forEach(type => es.addEventListener(type, handler as EventListener));
      // The connection drops when the PWA is backgrounded / on network blips;
      // reconnect so live notifications resume instead of silently stopping.
      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!destroyed) reconnectRef.current = setTimeout(connect, 5_000);
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [getToken]);
}
