import { useState, useEffect } from "react";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const FALLBACK = "support@collabry.in";

let _cache: Promise<string> | null = null;

function fetchSupportEmail(): Promise<string> {
  if (!_cache) {
    _cache = fetch(`${BASE_URL}/api/about-us`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: { contactEmail?: string }) => d.contactEmail?.trim() || FALLBACK)
      .catch(() => FALLBACK);
  }
  return _cache;
}

export function useSupportEmail(): string {
  const [email, setEmail] = useState(FALLBACK);
  useEffect(() => {
    fetchSupportEmail().then(setEmail);
  }, []);
  return email;
}
