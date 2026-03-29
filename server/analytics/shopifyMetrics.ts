type ShopifyOrder = {
  created_at?: string;
  total_price?: string;
};

export function calculateShopifyRevenueStats(orders: unknown) {
  const list = Array.isArray(orders) ? (orders as ShopifyOrder[]) : [];
  const now = Date.now();
  const days30Ms = 30 * 86400 * 1000;

  const revenue30d = list
    .filter((o) => {
      const created = new Date(o.created_at ?? "");
      return now - created.getTime() < days30Ms;
    })
    .reduce((sum, o) => sum + parseFloat(o.total_price || "0"), 0);

  const avgOrderValue =
    list.length > 0 ? list.reduce((sum, o) => sum + parseFloat(o.total_price || "0"), 0) / list.length : 0;

  return {
    revenue30d: Math.round(revenue30d * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
  };
}
