import { useState, useEffect } from "react";

interface SyncPoint {
  serverTs: number;
  mono: number;
}

let cached: SyncPoint | null = null;
let fetchPromise: Promise<SyncPoint> | null = null;

async function getSyncPoint(): Promise<SyncPoint> {
  if (cached) return cached;
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      const mono0 = performance.now();
      const r = await fetch("/api/server-time");
      const d: { ts: number } = await r.json();
      const mono1 = performance.now();
      const syncPoint: SyncPoint = {
        serverTs: d.ts + (mono1 - mono0) / 2,
        mono: mono1,
      };
      cached = syncPoint;
      return syncPoint;
    } catch {
      const mono = performance.now();
      const syncPoint: SyncPoint = { serverTs: Date.now(), mono };
      cached = syncPoint;
      return syncPoint;
    }
  })();
  return fetchPromise;
}

export function useServerTime() {
  const [serverNow, setServerNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    getSyncPoint().then(sync => {
      const compute = () => sync.serverTs + (performance.now() - sync.mono);
      setServerNow(compute());
      interval = setInterval(() => setServerNow(compute()), 1000);
    });
    return () => { clearInterval(interval); };
  }, []);

  return { serverNow };
}

export function fmtCountdown(deadline: string | null | undefined, serverNow: number): string {
  if (!deadline) return "";
  const diff = new Date(deadline).getTime() - serverNow;
  if (diff <= 0) return "Expired";
  const totalMins = Math.floor(diff / 60000);
  const totalHours = Math.floor(totalMins / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (totalMins > 0) return `${totalMins}m`;
  return "< 1m";
}
