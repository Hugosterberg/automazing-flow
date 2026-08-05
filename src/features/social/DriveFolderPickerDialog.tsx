import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Folder, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
import type { DriveBrowserItem, DriveProviderData } from "@/features/content/DriveMediaGrid";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driveAccountId: string;
  businessProfileId: string | null;
  title: string;
  onPick: (folder: { id: string; name: string; imageCount: number }) => void;
};

/**
 * Lightweight Drive folder picker for the Instagram queue — navigate folders,
 * count images in the current folder, confirm selection.
 */
export function DriveFolderPickerDialog({
  open,
  onOpenChange,
  driveAccountId,
  businessProfileId,
  title,
  onPick,
}: Props) {
  const { t } = useTranslation("social");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [stack, setStack] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<DriveProviderData>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!driveAccountId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      const res = await fetchWithTimeout(
        accountDataUrl(driveAccountId, businessProfileId, params),
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(body, t("driveQueue.picker.loadError")));
      }
      const json = (await res.json()) as DriveProviderData;
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : t("driveQueue.picker.loadError"));
    } finally {
      setLoading(false);
    }
  }, [businessProfileId, driveAccountId, folderId, open, t]);

  useEffect(() => {
    if (!open) {
      setFolderId(null);
      setStack([]);
      setData(null);
      setError(null);
      return;
    }
    void load();
  }, [open, load]);

  const items = Array.isArray(data?.items) ? data.items : [];
  const folders = items.filter((i) => i.kind === "folder");
  const images = items.filter((i) => i.kind === "image");
  const currentName =
    data?.currentFolderName ||
    (folderId ? stack[stack.length - 1]?.name : t("driveQueue.picker.root"));

  function openFolder(item: DriveBrowserItem) {
    setStack((prev) => [...prev, { id: item.id, name: item.name }]);
    setFolderId(item.id);
  }

  function goUp() {
    setStack((prev) => {
      const next = prev.slice(0, -1);
      setFolderId(next.length ? next[next.length - 1].id : null);
      return next;
    });
  }

  function confirm() {
    if (!folderId) {
      setError(t("driveQueue.picker.pickSubfolder"));
      return;
    }
    onPick({ id: folderId, name: currentName || folderId, imageCount: images.length });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("driveQueue.picker.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <Button type="button" variant="ghost" size="sm" disabled={!folderId || loading} onClick={goUp}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium truncate">{currentName}</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {t("driveQueue.picker.imageCount", { count: images.length })}
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("driveQueue.picker.loading")}
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-destructive">{error}</p>
          ) : folders.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("driveQueue.picker.emptyFolders")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                    onClick={() => openFolder(folder)}
                  >
                    <Folder className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("driveQueue.picker.cancel")}
          </Button>
          <Button type="button" onClick={confirm} disabled={!folderId || loading}>
            {t("driveQueue.picker.useFolder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
