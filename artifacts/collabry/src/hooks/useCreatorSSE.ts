import { useEffect, useRef } from "react";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";

export type CampaignLivePayload = {
  entityType: "CAMPAIGN" | "BARTER_CAMPAIGN";
  entityId: string;
  title: string;
  body: string;
};

export type PopupSSEPayload = {
  id: string;
  type?: string | null;
  title: string;
  body: string;
  ctaText?: string | null;
  ctaPath?: string | null;
  isCelebration: boolean;
  secondCtaText?: string | null;
  secondCtaPath?: string | null;
};

export function useCreatorSSE(
  onCampaignLive: (payload: CampaignLivePayload) => void,
  onPopup?: (payload: PopupSSEPayload) => void,
): void {
  const { accessToken } = useCreatorAuth();
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlerRef = useRef(onCampaignLive);
  handlerRef.current = onCampaignLive;
  const popupHandlerRef = useRef(onPopup);
  popupHandlerRef.current = onPopup;

  useEffect(() => {
    if (!accessToken) return;

    const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const url = `${BASE_URL}/api/creator/notifications/stream?token=${encodeURIComponent(accessToken!)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("campaign_live", (e: MessageEvent) => {
        try { handlerRef.current(JSON.parse(e.data) as CampaignLivePayload); } catch { /* ignore */ }
      });

      es.addEventListener("popup", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as PopupSSEPayload;
          popupHandlerRef.current?.(data);
        } catch { /* ignore */ }
      });

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
  }, [accessToken]);
}
