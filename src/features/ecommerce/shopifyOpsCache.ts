/**
 * Session cache for Shopify ops signals (stale unfulfilled, pending pay,
 * low stock, abandoned carts). Ecommerce writes when store data loads;
 * Daily Brief reads with `enabled: false` so Home never fans out Shopify
 * fetches — same pattern as `useCachedMarketingRoas`.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import type { ShopifyData } from "@/features/ecommerce/ecommerceOrg";

export const SHOPIFY_OPS_CACHE_KEY = ["shopify-ops-cache"] as const;

export type ShopifyOpsSnapshot = {
  staleUnfulfilled: number;
  pendingPayments: number;
  lowStock: number;
  abandonedCheckouts: number;
  abandonedValue: number;
  totalActions: number;
  updatedAt: number;
};

export const STALE_UNFULFILLED_DAYS = 2;

export function computeShopifyOpsSnapshot(shopifyData: ShopifyData | null): ShopifyOpsSnapshot | null {
  if (!shopifyData) return null;
  const staleCutoffMs = Date.now() - STALE_UNFULFILLED_DAYS * 86400000;
  const staleUnfulfilled = shopifyData.orders.filter((order) => {
    const fulfillment = order.fulfillment || "unfulfilled";
    if (fulfillment === "fulfilled" || fulfillment === "restocked") return false;
    const createdMs = Date.parse(order.createdAt);
    return Number.isFinite(createdMs) && createdMs <= staleCutoffMs;
  }).length;
  const pendingPayments = shopifyData.orders.filter(
    (order) => order.status === "pending" || order.status === "partially_paid"
  ).length;
  const lowStock = shopifyData.stats.lowStockCount ?? 0;
  const abandonedCheckouts = shopifyData.stats.abandonedCheckouts30d ?? 0;
  const abandonedValue = shopifyData.stats.abandonedValue30d ?? 0;
  return {
    staleUnfulfilled,
    pendingPayments,
    lowStock,
    abandonedCheckouts,
    abandonedValue,
    totalActions: staleUnfulfilled + pendingPayments + lowStock,
    updatedAt: Date.now(),
  };
}

/** Cache-only reader for Home / Daily Brief. Returns null when cold. */
export function useCachedShopifyOps(): ShopifyOpsSnapshot | null {
  const { user } = useAuth();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const query = useQuery<ShopifyOpsSnapshot | null>({
    queryKey: [...SHOPIFY_OPS_CACHE_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      throw new Error("cache-only");
    },
    enabled: false,
  });
  return query.data ?? null;
}

/** Keep the brief cache warm while Ecommerce has live Shopify data. */
export function useSeedShopifyOpsCache(shopifyData: ShopifyData | null): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const businessProfileId = useActiveBusinessProfileIdOptional();

  useEffect(() => {
    const snapshot = computeShopifyOpsSnapshot(shopifyData);
    if (!snapshot) return;
    queryClient.setQueryData(
      [...SHOPIFY_OPS_CACHE_KEY, user?.id ?? null, businessProfileId ?? null],
      snapshot
    );
  }, [shopifyData, queryClient, user?.id, businessProfileId]);
}
