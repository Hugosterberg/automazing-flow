import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  BookmarkCheck,
  ExternalLink,
  Film,
  FolderOpen,
  GripVertical,
  History,
  ImageIcon,
  Send,
  Share2,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ContentUploadDropzone } from "./ContentUploadDropzone";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import { assetSelectionKey } from "@/lib/contentSelection";
import {
  generatedItemToAsset,
  resolveThumbnailUrl,
  type GeneratedContentItem,
} from "./generatedContentHistory";
import { cn } from "@/lib/utils";

type SourceFilter = "all" | "drive" | "upload" | "apiai" | "generated";

function sourceLabel(asset: SelectedContentAsset, t: (key: string) => string) {
  if (asset.sourceAccountId === "upload") return t("sources.upload");
  if (asset.sourceAccountId === "apiai") return t("sources.apiai");
  if (asset.sourceAccountId === "openai") return t("sources.openai");
  if (asset.sourceAccountId === "canva") return t("sources.canva");
  return asset.sourceAccountName || t("sources.drive");
}

function assetSourceFilter(asset: SelectedContentAsset): SourceFilter {
  if (asset.sourceAccountId === "upload") return "upload";
  if (asset.sourceAccountId === "apiai") return "apiai";
  if (asset.sourceAccountId === "openai" || asset.sourceAccountId === "canva" || asset.sourceAccountId === "reel")
    return "generated";
  return "drive";
}

const FILTER_IDS: SourceFilter[] = ["all", "drive", "upload", "apiai", "generated"];

function SelectedTile({
  asset,
  index,
  bulkMode,
  bulkChecked,
  onBulkToggle,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  dragOver,
  t,
}: {
  asset: SelectedContentAsset;
  index: number;
  bulkMode: boolean;
  bulkChecked: boolean;
  onBulkToggle: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
  dragOver: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const [failed, setFailed] = useState(false);
  const src = asset.thumbnailUrl || asset.previewUrl;

  return (
    <Card
      className={cn(
        "overflow-hidden border-border group relative",
        dragOver && "ring-2 ring-primary border-primary"
      )}
      draggable={!bulkMode}
      onDragStart={(event) => {
        if (bulkMode) {
          event.preventDefault();
          return;
        }
        onDragStart();
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      {!bulkMode ? (
        <div className="absolute left-1 top-1 z-10 rounded bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : null}
      <div className="aspect-square bg-muted/30 relative">
        {src && !failed && asset.kind === "image" ? (
          <img
            src={src}
            alt={asset.name}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {asset.kind === "video" ? <Film className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
          </div>
        )}
        {bulkMode ? (
          <div className="absolute top-2 left-2">
            <Checkbox checked={bulkChecked} onCheckedChange={onBulkToggle} aria-label={t("selected.selectAria", { name: asset.name })} />
          </div>
        ) : (
          <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] max-w-[85%] truncate">
            {sourceLabel(asset, t)}
          </Badge>
        )}
        {!bulkMode ? (
          <>
            {asset.webViewLink ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute bottom-2 left-2 h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                asChild
              >
                <a href={asset.webViewLink} target="_blank" rel="noopener noreferrer" aria-label={t("selected.openAria", { name: asset.name })}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              onClick={onRemove}
              aria-label={t("selected.removeAria", { name: asset.name })}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : null}
        {!bulkMode ? (
          <span className="absolute bottom-2 right-2 rounded bg-background/80 px-1.5 text-[10px] text-muted-foreground tabular-nums">
            {index + 1}
          </span>
        ) : null}
      </div>
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-xs truncate">{asset.name}</CardTitle>
        <CardDescription className="text-[10px] capitalize">{asset.kind}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function SelectedContentPanel({
  selectedAssets,
  historyItems = [],
  onRemove,
  onRemoveMany,
  onClear,
  onReorder,
  onAddFromHistory,
  onUploadFiles,
  uploading = false,
  uploadDisabled = false,
  onGoBrowse,
  onGoHistory,
  onCreate,
  onPublish,
  compact = false,
}: {
  selectedAssets: SelectedContentAsset[];
  historyItems?: GeneratedContentItem[];
  onRemove: (asset: SelectedContentAsset) => void;
  onRemoveMany?: (assets: SelectedContentAsset[]) => void;
  onClear: () => void;
  onReorder?: (assets: SelectedContentAsset[]) => void;
  onAddFromHistory?: (asset: SelectedContentAsset) => void;
  onUploadFiles?: (files: FileList | null) => void | Promise<void>;
  uploading?: boolean;
  uploadDisabled?: boolean;
  onGoBrowse: () => void;
  onGoHistory: () => void;
  onCreate: () => void;
  onPublish: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation("content");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkKeys, setBulkKeys] = useState<Set<string>>(() => new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const selectedKeys = useMemo(
    () => new Set(selectedAssets.map((asset) => assetSelectionKey(asset))),
    [selectedAssets]
  );

  const filteredAssets = useMemo(() => {
    if (sourceFilter === "all") return selectedAssets;
    return selectedAssets.filter((asset) => assetSourceFilter(asset) === sourceFilter);
  }, [selectedAssets, sourceFilter]);

  const selectedImages = selectedAssets.filter((asset) => asset.kind === "image");
  const selectedVideos = selectedAssets.filter((asset) => asset.kind === "video");

  const historyToAdd = useMemo(
    () =>
      historyItems
        .filter((item) => !selectedKeys.has(assetSelectionKey(generatedItemToAsset(item))))
        .slice(0, 8),
    [historyItems, selectedKeys]
  );

  function toggleBulkKey(asset: SelectedContentAsset) {
    const key = assetSelectionKey(asset);
    setBulkKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function removeBulkSelected() {
    const toRemove = selectedAssets.filter((asset) => bulkKeys.has(assetSelectionKey(asset)));
    if (toRemove.length === 0) return;
    if (onRemoveMany) onRemoveMany(toRemove);
    else toRemove.forEach((asset) => onRemove(asset));
    setBulkKeys(new Set());
    setBulkMode(false);
  }

  function handleDrop(toIndex: number) {
    if (dragIndex === null || dragIndex === toIndex || !onReorder) return;
    const next = [...selectedAssets];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next);
    setDragIndex(null);
    setDropIndex(null);
  }

  const empty = selectedAssets.length === 0;

  return (
    <div className="space-y-6">
      {onUploadFiles && !compact ? (
        <ContentUploadDropzone
          onFiles={onUploadFiles}
          busy={uploading}
          disabled={uploadDisabled}
          label={t("selected.dropzone")}
        />
      ) : null}

      {empty ? (
        <Card className="border-dashed border-border">
          <CardContent className="py-10 text-center space-y-4">
            <BookmarkCheck className="h-10 w-10 mx-auto text-muted-foreground/60" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("selected.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("selected.emptyDescription")}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="default" size="sm" onClick={onGoBrowse}>
                <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                {t("selected.browseDrive")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onGoHistory}>
                <History className="h-3.5 w-3.5 mr-1.5" />
                {t("selected.openHistory")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border bg-muted/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookmarkCheck className="h-4 w-4 text-primary" />
                {t("selected.title")}
              </CardTitle>
              <CardDescription>
                {t("selected.description", {
                  count: selectedAssets.length,
                  images: selectedImages.length,
                  videos: selectedVideos.length,
                })}
                {onReorder ? t("selected.dragHint") : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onCreate}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  {t("selected.createWithAi")}
                </Button>
                <Button type="button" variant="outline" onClick={onPublish}>
                  <Send className="h-4 w-4 mr-2" />
                  {t("selected.postOrSave")}
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link to="/social-media">
                    <Share2 className="h-3.5 w-3.5 mr-1.5" />
                    {t("selected.openSocial")}
                  </Link>
                </Button>
                {!compact ? (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={onGoBrowse}>
                      {t("selected.addFromDrive")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={onGoHistory}>
                      {t("selected.addFromHistory")}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link to="/content?tab=selected">{t("selected.manageInContent")}</Link>
                  </Button>
                )}
                <Button
                  type="button"
                  variant={bulkMode ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setBulkMode((value) => !value);
                    setBulkKeys(new Set());
                  }}
                >
                  {bulkMode ? t("selected.cancelBulk") : t("selected.bulkRemove")}
                </Button>
                {bulkMode && bulkKeys.size > 0 ? (
                  <Button type="button" variant="destructive" size="sm" onClick={removeBulkSelected}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {t("selected.removeCount", { count: bulkKeys.size })}
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                    {t("selected.clearAll")}
                  </Button>
                )}
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
                    {t(`sourceFilters.${id}`)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredAssets.map((asset) => {
              const globalIndex = selectedAssets.findIndex(
                (item) => assetSelectionKey(item) === assetSelectionKey(asset)
              );
              return (
                <SelectedTile
                  key={assetSelectionKey(asset)}
                  asset={asset}
                  index={globalIndex}
                  bulkMode={bulkMode}
                  bulkChecked={bulkKeys.has(assetSelectionKey(asset))}
                  onBulkToggle={() => toggleBulkKey(asset)}
                  onRemove={() => onRemove(asset)}
                  onDragStart={() => setDragIndex(globalIndex)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropIndex(globalIndex);
                  }}
                  onDrop={() => handleDrop(globalIndex)}
                  dragOver={dropIndex === globalIndex && dragIndex !== null && dragIndex !== globalIndex}
                  t={t}
                />
              );
            })}
          </div>

          {filteredAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("selected.noFilterMatch")}</p>
          ) : null}
        </>
      )}

      {!empty && historyToAdd.length > 0 && onAddFromHistory && !compact ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">{t("selected.fromHistoryTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("selected.fromHistoryHint")}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {historyToAdd.map((item) => {
              const asset = generatedItemToAsset(item);
              const thumb = resolveThumbnailUrl(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onAddFromHistory(asset)}
                  className="rounded-lg border border-border overflow-hidden text-left hover:border-primary/40 hover:bg-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="aspect-square bg-muted/30">
                    <img src={thumb} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <p className="truncate px-2 py-1.5 text-[10px] font-medium">{item.name}</p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
