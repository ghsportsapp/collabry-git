const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export type LandingItem = { key: string; value: string };

const SS_KEY = "collabry.landingContent.v2";
const SS_TS_KEY = "collabry.landingContent.ts.v2";
const MIN_REFETCH_MS = 5 * 60 * 1000;
const MAX_VALUE_BYTES = 50_000;
const HEAVY_TTL_MS = 2 * 60 * 1000;
const HERO_TTL_MS = 2 * 60 * 1000;

let inflight: Promise<LandingItem[] | null> | null = null;
let cached: LandingItem[] | null = null;
let lastFetchedAt = 0;

let heavyInflight: Promise<Record<string, string> | null> | null = null;
let heavyCached: Record<string, string> | null = null;
let heavyFetchedAt = 0;

export interface HeroMedia { type: "photo" | "video"; src?: string; }
let heroInflight: Promise<HeroMedia[] | null> | null = null;
let heroCached: HeroMedia[] | null = null;
let heroFetchedAt = 0;

function readSession(): { items: LandingItem[]; ts: number } | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    const ts = Number(sessionStorage.getItem(SS_TS_KEY) ?? 0);
    if (!raw || !ts) return null;
    const items = JSON.parse(raw) as LandingItem[];
    if (!Array.isArray(items)) return null;
    return { items, ts };
  } catch { return null; }
}

function writeSession(items: LandingItem[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const safe = items.filter((i) => i.value.length <= MAX_VALUE_BYTES);
    sessionStorage.setItem(SS_KEY, JSON.stringify(safe));
    sessionStorage.setItem(SS_TS_KEY, String(Date.now()));
  } catch {}
}

(function hydrate() {
  const s = readSession();
  if (s) { cached = s.items; lastFetchedAt = s.ts; }
})();

export async function fetchLandingContent(force = false): Promise<LandingItem[] | null> {
  const now = Date.now();
  if (!force && cached && now - lastFetchedAt < MIN_REFETCH_MS) {
    return cached;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const fetchOpts = force ? { cache: "no-store" as RequestCache } : {};
      const res = await fetch(`${BASE_URL}/api/landing-content`, fetchOpts);
      if (!res.ok) return cached;
      const items = (await res.json()) as LandingItem[];
      cached = items;
      lastFetchedAt = Date.now();
      writeSession(items);
      return items;
    } catch {
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getCachedLandingContent(): LandingItem[] | null {
  return cached;
}

export async function fetchLandingHeavy(force = false): Promise<Record<string, string> | null> {
  const now = Date.now();
  if (!force && heavyCached && now - heavyFetchedAt < HEAVY_TTL_MS) return heavyCached;
  if (heavyInflight) return heavyInflight;
  heavyInflight = (async () => {
    try {
      const fetchOpts = force ? { cache: "no-store" as RequestCache } : {};
      const res = await fetch(`${BASE_URL}/api/landing-heavy`, fetchOpts);
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, string>;
      heavyCached = data;
      heavyFetchedAt = Date.now();
      return data;
    } catch {
      return null;
    } finally {
      heavyInflight = null;
    }
  })();
  return heavyInflight;
}

export async function fetchHeroMedia(force = false): Promise<HeroMedia[] | null> {
  const now = Date.now();
  if (!force && heroCached && now - heroFetchedAt < HERO_TTL_MS) return heroCached;
  if (heroInflight) return heroInflight;
  heroInflight = (async () => {
    try {
      const fetchOpts = force ? { cache: "no-store" as RequestCache } : {};
      const res = await fetch(`${BASE_URL}/api/landing-hero-media`, fetchOpts);
      if (!res.ok) return null;
      const data = (await res.json()) as HeroMedia[] | null;
      if (Array.isArray(data)) {
        heroCached = data;
        heroFetchedAt = Date.now();
        return data;
      }
      return null;
    } catch {
      return null;
    } finally {
      heroInflight = null;
    }
  })();
  return heroInflight;
}

export function getHeroCached(): HeroMedia[] | null { return heroCached; }

export function bustAllCaches(): void {
  cached = null;
  lastFetchedAt = 0;
  heavyCached = null;
  heavyFetchedAt = 0;
  heroCached = null;
  heroFetchedAt = 0;
  inflight = null;
  heavyInflight = null;
  heroInflight = null;
  try { sessionStorage.removeItem(SS_KEY); sessionStorage.removeItem(SS_TS_KEY); } catch {}
  // Also clear localStorage landing cache so stale heavy data (old images) never flashes on next load
  try { localStorage.removeItem("collabry_landing_v2"); } catch {}
}
