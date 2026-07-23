import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  applyProductContentDraft,
  dismissProductContentDraft,
  fetchProductContentDrafts,
  type ProductContentDraft,
} from "./productContentClient";

/**
 * Pending AI-drafted description/tag improvements for thin Shopify product
 * listings — draft-before-write, like every other automation in the app.
 * Approving pushes the update to the local catalogue and, when the product
 * is Shopify-synced, to the live store too.
 */
export function ProductContentDraftsCard({ businessProfileId }: { businessProfileId: string | null }) {
  const { t } = useTranslation("ecommerce");
  const [drafts, setDrafts] = useState<ProductContentDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessProfileId) {
      setDrafts([]);
      return;
    }
    setLoading(true);
    try {
      const { drafts: list } = await fetchProductContentDrafts(businessProfileId);
      setDrafts(list);
    } catch {
      // Informational card — a failed load just means it stays hidden.
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [businessProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApply(draft: ProductContentDraft) {
    if (!businessProfileId) return;
    setBusyId(draft.productId);
    try {
      const result = await applyProductContentDraft(businessProfileId, draft.productId);
      setDrafts((prev) => prev.filter((d) => d.productId !== draft.productId));
      toast.success(
        result.pushedToShopify
          ? t("productContent.appliedWithShopify")
          : t("productContent.appliedLocalOnly")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("productContent.applyFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(draft: ProductContentDraft) {
    if (!businessProfileId) return;
    setBusyId(draft.productId);
    try {
      await dismissProductContentDraft(businessProfileId, draft.productId);
      setDrafts((prev) => prev.filter((d) => d.productId !== draft.productId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("productContent.dismissFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (!businessProfileId || (!loading && drafts.length === 0)) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          {t("productContent.title")}
        </CardTitle>
        <CardDescription>{t("productContent.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("productContent.loading")}</p>
        ) : (
          drafts.map((draft) => (
            <div key={draft.productId} className="rounded-lg border border-border bg-background p-3 space-y-2">
              <p className="text-sm font-medium">{draft.productName}</p>
              <p className="text-xs text-muted-foreground line-clamp-3">{draft.suggestedDescription}</p>
              {draft.suggestedTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {draft.suggestedTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={busyId === draft.productId}
                  onClick={() => void handleDismiss(draft)}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  {t("productContent.dismiss")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={busyId === draft.productId}
                  onClick={() => void handleApply(draft)}
                >
                  {busyId === draft.productId ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t("productContent.apply")}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
