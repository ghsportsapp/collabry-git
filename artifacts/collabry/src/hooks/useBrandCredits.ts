import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBrandAuth } from "@/contexts/BrandAuthContext";

export interface FreeBatch { amount: number; expiresAt: string | null; label: string; }
export interface CreditBalance {
  total: number;
  free: number;
  purchased: number;
  freeExpiry: string | null;
  freeBatches?: FreeBatch[];
}

export const BRAND_CREDITS_QUERY_KEY = ["brand", "credits", "balance"] as const;

export function useBrandCredits() {
  const { brandId, apiFetch } = useBrandAuth();
  const qc = useQueryClient();
  const queryKey = [...BRAND_CREDITS_QUERY_KEY, brandId];

  const query = useQuery<CreditBalance | null>({
    queryKey,
    enabled: !!brandId,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    queryFn: async () => {
      const r = await apiFetch("/api/brand/credits/balance");
      if (!r.ok) return null;
      return (await r.json()) as CreditBalance;
    },
  });

  const setCredits = useCallback((updater: CreditBalance | ((prev: CreditBalance | null) => CreditBalance | null) | null) => {
    qc.setQueryData<CreditBalance | null>(queryKey, (prev) => {
      const next = typeof updater === "function" ? (updater as (p: CreditBalance | null) => CreditBalance | null)(prev ?? null) : updater;
      return next;
    });
    // queryKey depends only on brandId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, qc]);

  const setTotal = useCallback((newTotal: number) => {
    setCredits((prev) => (prev ? { ...prev, total: newTotal } : { total: newTotal, free: 0, purchased: 0, freeExpiry: null }));
  }, [setCredits]);

  return {
    credits: query.data ?? null,
    total: query.data?.total ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
    setCredits,
    setTotal,
  };
}

export function useInvalidateBrandCredits() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: BRAND_CREDITS_QUERY_KEY });
}
