import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trackPageView } from "@/lib/analytics";

/**
 * Fires a GTM `page_view` event on each client-side route change. The initial
 * page load is already tracked by GTM's `gtm.js` event in index.html, so we
 * skip the first render to avoid a double count.
 */
export default function DataLayerPageViews() {
  const [location] = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    trackPageView(location);
  }, [location]);
  return null;
}
