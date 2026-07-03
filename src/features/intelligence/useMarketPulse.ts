import { useQuery } from "@tanstack/react-query";
import { fetchMarketPulse, type MarketPulse } from "./intelligenceService";

export const MARKET_PULSE_KEY = ["intelligence", "market-pulse"] as const;

/**
 * Market pulse for the home dashboard. Quiet by design: while loading or when
 * no provider is connected, `pulse` stays null and the card renders nothing.
 * Cached client-side for 15 minutes to mirror the server-side cache.
 */
export function useMarketPulse(businessProfileId: string | null, topic = "bitcoin") {
  const query = useQuery<MarketPulse>({
    queryKey: [...MARKET_PULSE_KEY, businessProfileId, topic],
    queryFn: () => fetchMarketPulse(businessProfileId, topic),
    enabled: Boolean(businessProfileId),
    staleTime: 15 * 60 * 1000,
    retry: false,
  });
  const pulse = query.data && query.data.available ? query.data : null;
  return { pulse, isLoading: query.isLoading };
}
