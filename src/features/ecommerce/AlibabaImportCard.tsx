import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Loader2,
  PackagePlus,
  ShoppingCart,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/apiBase";
import { loadAlibabaImport, saveAlibabaImport } from "@/lib/alibabaImportStorage";
import { useProfileDocument } from "@/features/profile-documents";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import type { AlibabaProductImport } from "@/types/ecommerce";
import { toast } from "sonner";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

function slugifyFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "product";
}

type Props = {
  businessProfileId: string | null;
  shopifyAccountId: string | null;
  onSaveAsProduct?: (product: AlibabaProductImport) => Promise<void>;
};

export function AlibabaImportCard({ businessProfileId, shopifyAccountId, onSaveAsProduct }: Props) {
  const { t } = useTranslation("ecommerce");
  const [alibabaUrl, setAlibabaUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const importDoc = useProfileDocument<AlibabaProductImport | null>("alibaba-import", null, {
    legacyRead: () => loadAlibabaImport(businessProfileId) ?? undefined,
    legacyWrite: (_bpId, value) => saveAlibabaImport(businessProfileId, value),
  });
  const product = importDoc.data;
  const setProduct = (value: AlibabaProductImport | null) => importDoc.save(value);

  const previewImageUrl = useMemo(
    () => (imageUrl: string) => apiUrl(`/api/ecommerce/alibaba/image?url=${encodeURIComponent(imageUrl)}`),
    []
  );
  const downloadImageUrl = useMemo(
    () => (imageUrl: string) =>
      apiUrl(`/api/ecommerce/alibaba/image?url=${encodeURIComponent(imageUrl)}&download=1`),
    []
  );

  async function handleImport() {
    const url = alibabaUrl.trim();
    if (!url) return;
    setLoading(true);
    setError(null);
    setShowFullDescription(false);
    try {
      const res = await fetchWithTimeout(apiUrl("/api/ecommerce/alibaba/import"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(payload, t("alibaba.importFailed")));
      }
      setProduct(payload.product as AlibabaProductImport);
    } catch (err) {
      setProduct(null);
      setError(err instanceof Error ? err.message : t("alibaba.importFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function copyText(labelKey: "titleLabel" | "descriptionLabel", value: string) {
    if (!value.trim()) return;
    const label = t(`alibaba.${labelKey}`);
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("toasts.copiedLabel", { label }));
    } catch {
      toast.error(t("toasts.copyFailed"));
    }
  }

  async function downloadZip() {
    if (!product?.images.length) return;
    setDownloadingZip(true);
    try {
      const res = await fetchWithTimeout(apiUrl("/api/ecommerce/alibaba/images/zip"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: product.images }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(payload, t("alibaba.zipFailed")));
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${slugifyFilename(product.title)}-images.zip`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("alibaba.downloadFailed"));
    } finally {
      setDownloadingZip(false);
    }
  }

  async function createShopifyDraft() {
    if (!shopifyAccountId || !product) return;
    setCreatingDraft(true);
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/ecommerce/shopify/${shopifyAccountId}/products`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: product.title,
          description: product.description,
          price: product.price,
          sourceUrl: product.finalUrl,
          images: product.images,
          business_profile_id: businessProfileId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(payload, t("toasts.shopifyDraftFailed")));
      }
      toast.success(t("toasts.shopifyDraftCreated"));
      if (payload?.product?.adminUrl) {
        window.open(payload.product.adminUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.shopifyDraftFailed"));
    } finally {
      setCreatingDraft(false);
    }
  }

  const descriptionPreview =
    product && product.description.length > 320 && !showFullDescription
      ? `${product.description.slice(0, 320).trim()}…`
      : product?.description;

  return (
    <Card className="bg-card border-border glow-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Link2 className="h-5 w-5" />
          {t("alibaba.title")}
        </CardTitle>
        <CardDescription>{t("alibaba.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={alibabaUrl}
            onChange={(e) => setAlibabaUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleImport()}
            placeholder="https://www.alibaba.com/product-detail/..."
            aria-label={t("alibaba.urlAriaLabel")}
            className="flex-1"
          />
          <Button onClick={() => void handleImport()} disabled={loading || !alibabaUrl.trim()}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t("alibaba.fetching")}
              </>
            ) : (
              t("alibaba.importProduct")
            )}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {product ? (
          <div className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-4">
            {product.warnings.length > 0 ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 space-y-1">
                {product.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-warning flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2 flex-1">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="text-base font-semibold flex-1">{product.title}</p>
                  <Button variant="ghost" size="sm" onClick={() => void copyText("titleLabel", product.title)}>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {t("alibaba.copyTitle")}
                  </Button>
                </div>
                {product.price ? (
                  <p className="text-sm text-muted-foreground">
                    {t("alibaba.priceLabel")} {product.price}
                    {product.currency ? ` ${product.currency}` : ""}
                  </p>
                ) : null}
                {product.description ? (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{descriptionPreview}</p>
                    {product.description.length > 320 ? (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setShowFullDescription((value) => !value)}
                      >
                        {showFullDescription ? t("alibaba.showLess") : t("alibaba.showMore")}
                      </button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0 h-auto text-xs"
                      onClick={() => void copyText("descriptionLabel", product.description)}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      {t("alibaba.copyDescription")}
                    </Button>
                  </div>
                ) : null}
                <a
                  href={product.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {t("alibaba.viewSource")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {onSaveAsProduct ? (
                  <Button
                    size="sm"
                    disabled={savingProduct}
                    onClick={async () => {
                      setSavingProduct(true);
                      try {
                        await onSaveAsProduct(product);
                        toast.success(t("toasts.alibabaSavedAsProduct"));
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : t("toasts.alibabaSaveFailed"));
                      } finally {
                        setSavingProduct(false);
                      }
                    }}
                  >
                    {savingProduct ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <PackagePlus className="h-4 w-4 mr-2" />
                    )}
                    {t("alibaba.saveAsProduct")}
                  </Button>
                ) : null}
                {product.images.length > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => void downloadZip()} disabled={downloadingZip}>
                    {downloadingZip ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    {t("alibaba.downloadImagesZip")}
                  </Button>
                ) : null}
                {shopifyAccountId ? (
                  <Button variant="outline" size="sm" onClick={() => void createShopifyDraft()} disabled={creatingDraft}>
                    {creatingDraft ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ShoppingCart className="h-4 w-4 mr-2" />
                    )}
                    {t("alibaba.createShopifyDraft")}
                  </Button>
                ) : null}
              </div>
            </div>

            {product.specs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.specs.map((spec) => (
                  <div key={`${spec.label}-${spec.value}`} className="rounded-md border border-border/60 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{spec.label}</p>
                    <p className="text-sm">{spec.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {product.images.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {product.images.map((imageUrl, index) => (
                  <div key={`${imageUrl}-${index}`} className="rounded-lg border border-border overflow-hidden bg-background">
                    <ImageWithFallback
                      src={previewImageUrl(imageUrl)}
                      alt={`${product.title} ${index + 1}`}
                      className="aspect-square w-full object-cover"
                      fallback={
                        <div className="aspect-square w-full flex items-center justify-center bg-secondary/40">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      }
                    />
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" />
                        {t("alibaba.imageLabel", { index: index + 1 })}
                      </span>
                      <a
                        href={downloadImageUrl(imageUrl)}
                        download={`${slugifyFilename(product.title)}-${index + 1}.jpg`}
                        className="text-[11px] text-primary hover:underline"
                      >
                        {t("alibaba.download")}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("alibaba.noImagesFound")}</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
