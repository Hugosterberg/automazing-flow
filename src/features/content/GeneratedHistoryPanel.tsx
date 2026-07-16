import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderPlus, History, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeMedium } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  generatedItemToAsset,
  isLikelyExpiredMedia,
  resolveDownloadUrl,
  resolveThumbnailUrl,
  type GeneratedContentItem,
} from "./generatedContentHistory";
import { assetSelectionKey } from "@/lib/contentSelection";

type SourceFilter = "all" | GeneratedContentItem["source"];

function sourceLabel(source: GeneratedContentItem["source"], t: (key: string) => string) {
  if (source === "apiai") return t("sources.apiai");
  if (source === "openai") return t("sources.openai");
  if (source === "canva") return t("sources.canva");
  if (source === "upload") return t("sources.upload");
  return source;
}

const FILTER_IDS: SourceFilter[] = ["all", "apiai", "openai", "canva", "upload"];

function HistoryThumbnail({ item, src, t }: { item: GeneratedContentItem; src: string; t: (key: string) => string }) {
  const [failed, setFailed] = useState(false);
  const expired = isLikelyExpiredMedia(item);

  if (failed || expired) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-muted-foreground p-2 text-center">
        <ImageIcon className="h-8 w-8 opacity-60" />
        <p className="text-[10px]">{expired ? t("history.previewExpired") : t("history.previewUnavailable")}</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={item.name}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function GeneratedHistoryPanel({
  items,
  loading,
  selectedKeys,
  onAddToSelection,
  onAddAllToSelection,
  onRemove,
  onClear,
}: {
  items: GeneratedContentItem[];
  loading?: boolean;
  selectedKeys?: Set<string>;
  onAddToSelection: (asset: ReturnType<typeof generatedItemToAsset>) => void;
  onAddAllToSelection?: (assets: ReturnType<typeof generatedItemToAsset>[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation("content");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const filteredItems = useMemo(() => {
    if (sourceFilter === "all") return items;
    return items.filter((item) => item.source === sourceFilter);
  }, [items, sourceFilter]);

  const notYetSelected = useMemo(() => {
    if (!selectedKeys) return filteredItems;
    return filteredItems.filter(
      (item) => !selectedKeys.has(assetSelectionKey(generatedItemToAsset(item)))
    );
  }, [filteredItems, selectedKeys]);

  if (loading) {
    return (
      <Card className="border-border border-dashed">
        <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("history.loading")}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="border-border border-dashed">
        <CardContent className="py-10 text-center space-y-2">
          <History className="h-8 w-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {t("history.empty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("history.savedCount", { count: items.length })}
        </p>
        <div className="flex flex-wrap gap-2">
          {onAddAllToSelection && notYetSelected.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onAddAllToSelection(notYetSelected.map((item) => generatedItemToAsset(item)))
              }
            >
              <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
              {t("history.addAll", { count: notYetSelected.length })}
            </Button>
          ) : null}
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                {t("history.clear")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("history.clearTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("history.clearDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("history.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onClear();
                    setConfirmOpen(false);
                  }}
                >
                  {t("history.confirmClear")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_IDS.map((id) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={sourceFilter === id ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setSourceFilter(id)}
          >
            {id === "all" ? t("sourceFilters.all") : t(`sources.${id}`)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredItems.map((item) => {
          const expired = isLikelyExpiredMedia(item);
          const downloadUrl = resolveDownloadUrl(item);
          const thumbnailUrl = resolveThumbnailUrl(item);
          const alreadySelected = selectedKeys?.has(assetSelectionKey(generatedItemToAsset(item)));
          return (
            <Card key={item.id} className="overflow-hidden border-border">
              <div className="aspect-square bg-muted/30 relative">
                {item.kind === "image" ? (
                  <HistoryThumbnail item={item} src={thumbnailUrl} t={t} />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                <Badge variant="secondary" className="absolute top-2 left-2 text-[10px]">
                  {sourceLabel(item.source, t)}
                </Badge>
              </div>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs truncate">{item.name}</CardTitle>
                <CardDescription className="text-[10px]">
                  {formatDateTimeMedium(item.createdAt)}
                  {item.toolName ? ` · ${item.toolName}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {expired ? (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300">
                    {t("history.linkExpired")}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    disabled={alreadySelected}
                    onClick={() => onAddToSelection(generatedItemToAsset(item))}
                  >
                    <FolderPlus className="h-3 w-3 mr-1" />
                    {alreadySelected ? t("history.inSelected") : t("history.addToSelected")}
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                    <a href={downloadUrl} download={item.name} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3 w-3 mr-1" />
                      {t("history.save")}
                    </a>
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                    <span className="sr-only">{t("history.remove")}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{t("history.noFilterMatch")}</p>
      ) : null}
    </div>
  );
}
