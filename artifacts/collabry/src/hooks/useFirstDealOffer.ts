import { useQuery } from "@tanstack/react-query";
import { useBrandAuth } from "@/contexts/BrandAuthContext";

export interface FirstDealOffer {
  eligible: boolean;
  percent: number;
}

export const FIRST_DEAL_OFFER_QUERY_KEY = ["brand", "first-deal-offer"] as const;

/**
 * Live-derived first-deal offer for the signed-in brand. The endpoint returns
 * { eligible, percent }; eligibility flips to false once the brand has a live/
 * accepted direct deal and back to true automatically if that deal is later
 * rejected/expired — so polling keeps every marketing surface truthful without
 * any client-side state. The % is read from the endpoint, never hardcoded.
 */
export function useFirstDealOffer() {
  const { brandId, apiFetch } = useBrandAuth();

  const query = useQuery<FirstDealOffer | null>({
    queryKey: [...FIRST_DEAL_OFFER_QUERY_KEY, brandId],
    enabled: !!brandId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    queryFn: async () => {
      const r = await apiFetch("/api/brand/first-deal-offer");
      if (!r.ok) return null;
      return (await r.json()) as FirstDealOffer;
    },
  });

  const data = query.data ?? null;
  return {
    // Only "eligible" when the endpoint has actually confirmed it — never during
    // load or on error, so a surface never makes a false claim.
    eligible: data?.eligible === true,
    percent: data?.percent ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
