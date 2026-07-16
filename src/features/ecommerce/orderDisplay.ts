import { formatCurrency } from "@/lib/format";

export function formatPromoValue(value: string | null, valueType: string | null, currency: string) {
  if (!value) return "—";
  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) return value;
  if (valueType === "percentage") return `${Math.abs(numeric)}%`;
  return formatCurrency(Math.abs(numeric), currency);
}

export const statusColors: Record<string, string> = {
  paid: "bg-green-500/15 text-green-600",
  pending: "bg-yellow-500/15 text-yellow-600",
  refunded: "bg-red-500/15 text-red-500",
  voided: "bg-muted text-muted-foreground",
  partially_paid: "bg-blue-500/15 text-blue-500",
};

export const fulfillmentColors: Record<string, string> = {
  fulfilled: "bg-green-500/15 text-green-600",
  unfulfilled: "bg-orange-500/15 text-orange-500",
  partial: "bg-yellow-500/15 text-yellow-600",
  restocked: "bg-muted text-muted-foreground",
};

/**
 * Swedish labels for the raw Shopify status values shown in order badges
 * and filter dropdowns. Unknown values fall back to the raw string so new
 * Shopify statuses never render blank.
 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Betald",
  pending: "Väntar",
  refunded: "Återbetald",
  voided: "Annullerad",
  partially_paid: "Delbetald",
};

export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  fulfilled: "Skickad",
  unfulfilled: "Ej skickad",
  partial: "Delvis skickad",
  restocked: "Återlagd",
};

export const paymentStatusLabel = (status: string) => PAYMENT_STATUS_LABELS[status] ?? status;
export const fulfillmentStatusLabel = (status: string) => FULFILLMENT_STATUS_LABELS[status] ?? status;

export interface PersistedOrderFilters {
  payment: string;
  fulfillment: string;
}

export function orderFiltersStorageKey(profileKey: string | null): string {
  return `automazing-ecommerce-order-filters:${profileKey || "default"}`;
}

export function readPersistedOrderFilters(profileKey: string | null): PersistedOrderFilters {
  try {
    const raw = localStorage.getItem(orderFiltersStorageKey(profileKey));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedOrderFilters>;
      return {
        payment: typeof parsed.payment === "string" ? parsed.payment : "all",
        fulfillment: typeof parsed.fulfillment === "string" ? parsed.fulfillment : "all",
      };
    }
  } catch {
    /* corrupt/blocked storage — fall through to defaults */
  }
  return { payment: "all", fulfillment: "all" };
}
