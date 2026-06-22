import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { pixelPageView } from "@/lib/pixel";

/**
 * Fires a Meta Pixel PageView on each client-side route change. The very first
 * page load is already tracked by the base snippet in index.html, so we skip
 * the initial render to avoid a double count.
 */
export default function PixelPageViews() {
  const [location] = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pixelPageView();
  }, [location]);
  return null;
}
