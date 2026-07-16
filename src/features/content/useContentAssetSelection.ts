import { t } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  loadSelectedContent,
  saveSelectedContent,
  assetSelectionKey,
  type SelectedContentAsset,
} from "@/lib/contentSelection";
import { useProfileDocument } from "@/features/profile-documents";
import type { ApiaiBatchIngestItem } from "@/features/content/apiaiClient";
import { enqueueContentPipelineItems } from "@/features/content/contentPipelineQueue";
import { uploadContentMedia } from "@/features/content/contentMediaClient";
import { publishMediaUrlsFromAssets } from "@/features/content/contentPublishMedia";
import type { DriveBrowserItem } from "@/features/content/DriveMediaGrid";
import type { ContentTab } from "@/features/content/contentFlow";
import type { ConnectedAccount } from "@/types/accounts";

type Args = {
  activeProfileId: string | null | undefined;
  activeAccount: ConnectedAccount | null;
  createBusinessProfileId: string | null;
  ensureBackendSession: () => Promise<void>;
  goToTab: (tab: ContentTab) => void;
  recordAsset: (asset: SelectedContentAsset, options?: { toolName?: string }) => void;
};

/**
 * Selected content assets + upload/batch helpers for the Content page.
 */
export function useContentAssetSelection({
  activeProfileId,
  activeAccount,
  createBusinessProfileId,
  ensureBackendSession,
  goToTab,
  recordAsset,
}: Args) {
  // Selected content assets persist per business profile in the DB (synced
  // across devices and live across pages via React Query), migrating any
  // device-local selection on first load.
  const selectionDoc = useProfileDocument<SelectedContentAsset[]>("content-selection", [], {
    legacyRead: () => {
      const v = loadSelectedContent(activeProfileId);
      return v.length ? v : undefined;
    },
    legacyWrite: (_bpId, value) => saveSelectedContent(activeProfileId, value),
  });
  const selectedAssets = selectionDoc.data;
  const [uploadingBrowse, setUploadingBrowse] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selectedAssets.map((asset) => assetSelectionKey(asset))),
    [selectedAssets]
  );
  const selectedImages = selectedAssets.filter((asset) => asset.kind === "image");
  const selectedVideos = selectedAssets.filter((asset) => asset.kind === "video");
  const publishMediaUrls = useMemo(() => publishMediaUrlsFromAssets(selectedAssets), [selectedAssets]);

  function assetFromDriveFile(file: DriveBrowserItem): SelectedContentAsset | null {
    if ((file.kind !== "image" && file.kind !== "video") || !activeAccount) return null;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      kind: file.kind,
      thumbnailUrl: file.thumbnailUrl,
      previewUrl: file.previewUrl,
      webViewLink: file.webViewLink,
      sourceAccountId: activeAccount.id,
      sourceAccountName: activeAccount.username || "Google Drive",
    };
  }

  function saveAssetSelection(asset: SelectedContentAsset, checked: boolean) {
    const key = assetSelectionKey(asset);
    const next: SelectedContentAsset[] = checked
      ? [...selectedAssets.filter((existing) => assetSelectionKey(existing) !== key), asset]
      : selectedAssets.filter((existing) => assetSelectionKey(existing) !== key);

    selectionDoc.save(next);
  }

  function recordGeneratedAsset(asset: SelectedContentAsset, options?: { toolName?: string }) {
    recordAsset(asset, options);
  }

  function saveGeneratedToSelection(asset: SelectedContentAsset, options?: { toolName?: string }) {
    saveAssetSelection(asset, true);
    recordAsset(asset, options);
    toast.success(t("content:toasts.addedToSelectedAndHistory"));
  }

  function handleBatchIngested(
    items: ApiaiBatchIngestItem[],
    meta: { batchId: number; workflow?: string; addToSelection: boolean }
  ) {
    items.forEach((item, index) => {
      const asset: SelectedContentAsset = {
        id: `apiai-batch-${meta.batchId}-${index}`,
        name: item.filename,
        mimeType: item.contentType,
        kind: item.kind === "video" ? "video" : "image",
        thumbnailUrl: item.mediaUrl,
        previewUrl: item.mediaUrl,
        sourceAccountId: "apiai",
        sourceAccountName: "apiai.me",
      };
      recordAsset(asset, { toolName: meta.workflow || `batch #${meta.batchId}` });
      if (meta.addToSelection) saveAssetSelection(asset, true);
    });
    if (items.length > 0 && createBusinessProfileId) {
      void enqueueContentPipelineItems(
        createBusinessProfileId,
        items.map((item, index) => ({
          title: item.filename || `Batch ${meta.batchId} #${index + 1}`,
          captionHint: meta.workflow ? `Workflow: ${meta.workflow}` : undefined,
          accountIds: [],
          platforms: [],
          mediaUrls: [item.mediaUrl],
          scheduledFor: "",
        }))
      ).then((count) => {
        if (count > 0) {
          toast.message(
            count === 1
              ? t("content:toasts.pipelineQueued")
              : t("content:toasts.pipelineQueued_other", { count })
          );
        }
      });
    }
    if (meta.addToSelection && items.length > 0) {
      goToTab("publish");
    }
  }

  async function handleBrowseUploadFiles(fileList: FileList | null) {
    if (!fileList?.length || !createBusinessProfileId) return;
    setUploadingBrowse(true);
    try {
      await ensureBackendSession();
      let added = 0;
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
        const uploaded = await uploadContentMedia({ file, businessProfileId: createBusinessProfileId });
        const asset: SelectedContentAsset = {
          id: `upload-${Date.now()}-${added}`,
          name: uploaded.filename,
          mimeType: uploaded.contentType,
          kind: file.type.startsWith("video/") ? "video" : "image",
          thumbnailUrl: uploaded.url,
          previewUrl: uploaded.url,
          sourceAccountId: "upload",
          sourceAccountName: "Upload",
        };
        saveGeneratedToSelection(asset, { toolName: "Upload" });
        added += 1;
      }
      if (added > 0) {
        toast.success(t("content:toasts.filesUploaded", { count: added }));
        goToTab("selected");
      } else {
        toast.message(t("content:toasts.noMediaFiles"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("content:toasts.uploadFailed"));
    } finally {
      setUploadingBrowse(false);
    }
  }

  function toggleAsset(file: DriveBrowserItem, checked: boolean) {
    const asset = assetFromDriveFile(file);
    if (!asset) return;
    saveAssetSelection(asset, checked);
    if (checked) {
      toast.message(t("content:toasts.addedToSelectedDrive"));
    }
  }

  function removeFromSelected(asset: SelectedContentAsset) {
    saveAssetSelection(asset, false);
  }

  function removeManyFromSelected(assets: SelectedContentAsset[]) {
    const keys = new Set(assets.map((asset) => assetSelectionKey(asset)));
    selectionDoc.save(selectedAssets.filter((asset) => !keys.has(assetSelectionKey(asset))));
  }

  function reorderSelected(assets: SelectedContentAsset[]) {
    selectionDoc.save(assets);
  }

  function handleClearSelection() {
    selectionDoc.save([]);
  }

  return {
    selectedAssets,
    selectedIds,
    selectedImages,
    selectedVideos,
    publishMediaUrls,
    uploadingBrowse,
    assetFromDriveFile,
    saveAssetSelection,
    recordGeneratedAsset,
    saveGeneratedToSelection,
    handleBatchIngested,
    handleBrowseUploadFiles,
    toggleAsset,
    removeFromSelected,
    removeManyFromSelected,
    reorderSelected,
    handleClearSelection,
  };
}
