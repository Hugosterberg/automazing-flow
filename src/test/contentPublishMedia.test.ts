import { describe, expect, it } from "vitest";
import { publishMediaUrlsFromAssets } from "@/features/content/contentPublishMedia";
import type { SelectedContentAsset } from "@/lib/contentSelection";

describe("content publish media", () => {
  it("prefers preview URLs and dedupes assets", () => {
    const assets: SelectedContentAsset[] = [
      {
        id: "1",
        name: "a.jpg",
        mimeType: "image/jpeg",
        kind: "image",
        thumbnailUrl: "/api/accounts/a/drive/files/1/thumbnail",
        previewUrl: "/api/accounts/a/drive/files/1/content",
        sourceAccountId: "acc",
        sourceAccountName: "Drive",
      },
      {
        id: "2",
        name: "b.jpg",
        mimeType: "image/jpeg",
        kind: "image",
        thumbnailUrl: "/api/content/media/out.png",
        previewUrl: "/api/content/media/out.png",
        sourceAccountId: "apiai",
        sourceAccountName: "apiai.me",
      },
    ];
    const urls = publishMediaUrlsFromAssets(assets);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("/content");
    expect(urls[1]).toContain("/api/content/media/out.png");
  });
});
