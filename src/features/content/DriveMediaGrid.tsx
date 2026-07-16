import React, { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Film, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type DriveBrowserItem = {
  id: string;
  name: string;
  mimeType: string;
  kind: "folder" | "image" | "video" | "other";
  thumbnailUrl: string;
  iconLink?: string;
  isShortcut?: boolean;
  previewUrl?: string;
  webViewLink?: string;
  modifiedTime?: string;
  ownerName?: string;
  size?: number;
};

export type DriveProviderData = {
  source?: string;
  items?: DriveBrowserItem[];
  sharedItems?: DriveBrowserItem[];
  currentFolderId?: string | null;
  currentFolderName?: string | null;
  parentFolderId?: string | null;
} | null;

export type DriveOAuthPopupMessage = {
  type: "google_drive_oauth";
  success?: boolean;
  error?: string;
  statusCode?: string | null;
  exception?: string | null;
  hint?: string | null;
  platform?: "google_drive";
  account_id?: string;
  username?: string;
  profile_id?: string;
};

export function formatBytes(value?: number) {
  if (!value || Number.isNaN(value)) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function MediaTile({
  file,
  checked,
  onToggle,
  focused = false,
}: {
  file: DriveBrowserItem;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  focused?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(file.thumbnailUrl) && !imgFailed;

  return (
    <div
      role="button"
      tabIndex={0}
      data-drive-file-id={file.id}
      aria-pressed={checked}
      aria-label={`${checked ? "Ta bort från Valda" : "Lägg till i Valda"} ${file.name}`}
      className={cn(
        "group relative rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer bg-secondary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        focused && "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50"
      )}
      onClick={() => onToggle(!checked)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(!checked);
        }
      }}
    >
      <div className="aspect-square bg-secondary/50 flex items-center justify-center overflow-hidden relative">
        {showImage ? (
          <img
            src={file.thumbnailUrl}
            alt={file.name}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : file.kind === "video" ? (
          <Film className="h-8 w-8 text-muted-foreground" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
        {checked && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
              <span className="text-[10px] text-primary-foreground font-bold">✓</span>
            </div>
          </div>
        )}
        {file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded-md bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-black/80"
            title="Open in Google Drive"
          >
            <ExternalLink className="h-3.5 w-3.5 text-white" />
          </a>
        )}
      </div>
      <div className="p-2">
        <p className="text-[11px] font-medium truncate">{file.name}</p>
        {file.size ? <p className="text-[10px] text-muted-foreground/70">{formatBytes(file.size)}</p> : null}
      </div>
    </div>
  );
}

const GRID_BATCH_SIZE = 12;
const GRID_INITIAL = 8;

export function MediaSection({
  title,
  icon,
  files,
  expanded,
  onToggleExpand,
  previewCount,
  selectedIds,
  selectionKeyForFile,
  onToggleAsset,
  focusedFileId,
}: {
  title: string;
  icon: React.ReactNode;
  files: DriveBrowserItem[];
  expanded: boolean;
  onToggleExpand: () => void;
  previewCount: number;
  selectedIds: Set<string>;
  selectionKeyForFile: (file: DriveBrowserItem) => string;
  onToggleAsset: (file: DriveBrowserItem, checked: boolean) => void;
  focusedFileId?: string | null;
}) {
  const [visibleCount, setVisibleCount] = useState(expanded ? Math.max(files.length, GRID_INITIAL) : previewCount);

  useEffect(() => {
    setVisibleCount(expanded ? Math.max(files.length, GRID_INITIAL) : previewCount);
  }, [expanded, files.length, previewCount]);

  useEffect(() => {
    if (!focusedFileId) return;
    const idx = files.findIndex((file) => file.id === focusedFileId);
    if (idx < 0) return;
    if (!expanded) onToggleExpand();
    setVisibleCount((count) => Math.max(count, idx + 1));
  }, [focusedFileId, files, expanded, onToggleExpand]);

  const visible = files.slice(0, visibleCount);
  const hidden = files.length - visible.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">({files.length})</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {visible.map((file) => (
          <MediaTile
            key={file.id}
            file={file}
            checked={selectedIds.has(selectionKeyForFile(file))}
            onToggle={(checked) => onToggleAsset(file, checked)}
            focused={focusedFileId === file.id}
          />
        ))}
      </div>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => {
            if (expanded && visibleCount >= files.length) {
              onToggleExpand();
              return;
            }
            if (!expanded) onToggleExpand();
            setVisibleCount((count) => Math.min(files.length, count + GRID_BATCH_SIZE));
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${expanded && visibleCount >= files.length ? "rotate-180" : ""}`}
          />
          {expanded && visibleCount >= files.length
            ? "Show less"
            : `Show ${Math.min(hidden, GRID_BATCH_SIZE)} more ${title.toLowerCase()}`}
        </button>
      ) : expanded ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          Show less
        </button>
      ) : null}
    </div>
  );
}
