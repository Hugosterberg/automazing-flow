import { useQuery } from "@tanstack/react-query";
import { fetchMarketPulse, type MarketPulse } from "./intelligenceService";

export const MARKET_PULSE_KEY = ["intelligence", "market-pulse"] as const;

/**
 * Market pulse for the home dashboard. Returns the full pulse payload including
 * unavailable states so the card can show a setup / missing-key hint.
 */
export function useMarketPulse(businessProfileId: string | null, topic = "bitcoin") {
  const query = useQuery<MarketPulse>({
    queryKey: [...MARKET_PULSE_KEY, businessProfileId, topic],
    queryFn: () => fetchMarketPulse(businessProfileId, topic),
    enabled: Boolean(businessProfileId),
    staleTime: 15 * 60 * 1000,
    retry: false,
  });
  return { pulse: query.data ?? null, isLoading: query.isLoading, refetch: query.refetch };
}
