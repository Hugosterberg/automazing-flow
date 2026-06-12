export type AlibabaProductImport = {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  description: string;
  price: string | null;
  currency: string | null;
  images: string[];
  specs: Array<{ label: string; value: string }>;
  warnings: string[];
};

export type ShopifyDraftProductResult = {
  product: {
    id: number | string;
    title: string;
    status: string;
    adminUrl: string;
  };
};
