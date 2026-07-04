import { useCallback } from "react";
import { useProfileDocument } from "@/features/profile-documents";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import {
  GENERATED_HISTORY_DOC_KEY,
  appendGeneratedContent,
  generatedHistoryLegacyKey,
  type GeneratedContentItem,
  type GeneratedContentSource,
} from "./generatedContentHistory";

export type RecordGeneratedInput = {
  name: string;
  mimeType: string;
  kind: "image" | "video";
  mediaUrl: string;
  thumbnailUrl?: string;
  source: GeneratedContentSource;
  sourceLabel: string;
  toolName?: string;
};

export function useGeneratedContentHistory() {
  const doc = useProfileDocument<GeneratedContentItem[]>(GENERATED_HISTORY_DOC_KEY, [], {
    legacyRead: (profileId) => {
      try {
        const raw = localStorage.getItem(generatedHistoryLegacyKey(profileId));
        return raw ? (JSON.parse(raw) as GeneratedContentItem[]) : undefined;
      } catch {
        return undefined;
      }
    },
    legacyWrite: (profileId, value) => {
      localStorage.setItem(generatedHistoryLegacyKey(profileId), JSON.stringify(value));
    },
  });

  const record = useCallback(
    (input: RecordGeneratedInput) => {
      doc.save(
        appendGeneratedContent(doc.data, {
          ...input,
          thumbnailUrl: input.thumbnailUrl || input.mediaUrl,
        })
      );
    },
    [doc]
  );

  const recordAsset = useCallback(
    (asset: SelectedContentAsset, meta?: { toolName?: string }) => {
      const preview = asset.previewUrl || asset.thumbnailUrl;
      if (!preview) return;
      let source: GeneratedContentSource = "other";
      const sid = asset.sourceAccountId.toLowerCase();
      if (sid.includes("apiai")) source = "apiai";
      else if (sid.includes("openai")) source = "openai";
      else if (sid.includes("canva")) source = "canva";

      record({
        name: asset.name,
        mimeType: asset.mimeType,
        kind: asset.kind,
        mediaUrl: preview,
        thumbnailUrl: asset.thumbnailUrl || preview,
        source,
        sourceLabel: asset.sourceAccountName || source,
        toolName: meta?.toolName,
      });
    },
    [record]
  );

  const remove = useCallback(
    (id: string) => {
      doc.save(doc.data.filter((item) => item.id !== id));
    },
    [doc]
  );

  const clear = useCallback(() => {
    doc.save([]);
  }, [doc]);

  return {
    history: doc.data,
    record,
    recordAsset,
    remove,
    clear,
    isLoading: doc.isLoading,
    businessProfileId: doc.businessProfileId,
  };
}
