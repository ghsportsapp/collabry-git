import { useState, useEffect } from "react";
import { useBrandAuth } from "@/contexts/BrandAuthContext";

/**
 * The global profile-unlock cost (credits), read from the SAME public config
 * (`/api/credits/price` → profileUnlockCredits) the unlock endpoint charges on,
 * so every surface shows the number that will actually be deducted. Defaults to 1
 * until loaded, and floors at 1 (missing/unparseable → 1), mirroring the backend.
 */
export function useProfileUnlockCost(): number {
  const { apiFetch } = useBrandAuth();
  const [cost, setCost] = useState(1);
  useEffect(() => {
    apiFetch("/api/credits/price")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const n = Number(d?.profileUnlockCredits);
        if (Number.isFinite(n) && n >= 1) setCost(Math.floor(n));
      })
      .catch(() => {});
  }, [apiFetch]);
  return cost;
}
