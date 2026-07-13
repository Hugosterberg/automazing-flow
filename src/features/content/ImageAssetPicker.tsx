import { useMemo, useState } from "react";
import { Check, Image as ImageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 16;

function assetKey(asset: SelectedContentAsset) {
  return `${asset.sourceAccountId}:${asset.id}`;
}

function AssetThumb({
  asset,
  selected,
  onToggle,
  compact,
}: {
  asset: SelectedContentAsset;
  selected: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = asset.thumbnailUrl || asset.previewUrl;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "group relative overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border bg-background hover:bg-accent/40",
        compact ? "w-20 shrink-0" : "w-full"
      )}
    >
      <div className={cn("bg-secondary/40", compact ? "aspect-square w-20" : "aspect-square w-full")}>
        {src && !failed ? (
          <img
            src={src}
            alt={asset.name}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        {selected ? (
          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
      </div>
      {!compact ? (
        <div className="p-2">
          <p className="truncate text-[11px] font-medium">{asset.name}</p>
          <p className="text-[10px] text-muted-foreground">{selected ? "Selected" : "Click to select"}</p>
        </div>
      ) : (
        <span className="sr-only">{asset.name}</span>
      )}
    </button>
  );
}

export function ImageAssetPicker({
  selectedAssets,
  folderAssets = [],
  onToggle,
  onOpenBrowse,
  onOpenSelected,
  imagesOnly = true,
  maxVisibleSelected = 24,
}: {
  selectedAssets: SelectedContentAsset[];
  folderAssets?: SelectedContentAsset[];
  onToggle: (asset: SelectedContentAsset, selected: boolean) => void;
  onOpenBrowse?: () => void;
  onOpenSelected?: () => void;
  imagesOnly?: boolean;
  maxVisibleSelected?: number;
}) {
  const [query, setQuery] = useState("");
  const [folderVisible, setFolderVisible] = useState(PAGE_SIZE);

  const selectedKeys = useMemo(() => new Set(selectedAssets.map(assetKey)), [selectedAssets]);

  const filteredFolder = useMemo(() => {
    const base = imagesOnly ? folderAssets.filter((a) => a.kind === "image") : folderAssets;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => a.name.toLowerCase().includes(q));
  }, [folderAssets, imagesOnly, query]);

  const visibleFolder = filteredFolder.slice(0, folderVisible);
  const selectedImages = useMemo(
    () => (imagesOnly ? selectedAssets.filter((a) => a.kind === "image") : selectedAssets).slice(0, maxVisibleSelected),
    [selectedAssets, imagesOnly, maxVisibleSelected]
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground">Selected for Create</p>
          <div className="flex gap-1">
            {onOpenSelected ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onOpenSelected}>
                Open Selected
              </Button>
            ) : null}
            {onOpenBrowse ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onOpenBrowse}>
                Browse Drive
              </Button>
            ) : null}
          </div>
        </div>
        {selectedImages.length === 0 ? (
          <p className="text-xs text-muted-foreground">No images in Selected yet. Mark files in Browse or add from History.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {selectedImages.map((asset) => (
              <AssetThumb
                key={assetKey(asset)}
                asset={asset}
                selected
                compact
                onToggle={() => onToggle(asset, false)}
              />
            ))}
          </div>
        )}
      </div>

      {folderAssets.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">Lägg till från denna mapp</p>
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFolderVisible(PAGE_SIZE);
              }}
              placeholder="Filter by name…"
              className="h-8 max-w-[180px] text-xs"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visibleFolder.map((asset) => (
              <AssetThumb
                key={assetKey(asset)}
                asset={asset}
                selected={selectedKeys.has(assetKey(asset))}
                onToggle={() => onToggle(asset, !selectedKeys.has(assetKey(asset)))}
              />
            ))}
          </div>
          {filteredFolder.length > visibleFolder.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={() => setFolderVisible((n) => n + PAGE_SIZE)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Load {Math.min(PAGE_SIZE, filteredFolder.length - visibleFolder.length)} more
            </Button>
          ) : null}
        </div>
      ) : onOpenSelected || onOpenBrowse ? (
        <div className="flex flex-wrap gap-2">
          {onOpenSelected ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenSelected}>
              Open Selected
            </Button>
          ) : null}
          {onOpenBrowse ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenBrowse}>
              Browse Drive
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
