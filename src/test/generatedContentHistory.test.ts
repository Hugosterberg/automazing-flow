import { describe, expect, it } from "vitest";
import {
  appendGeneratedContent,
  generatedItemToAsset,
  isLikelyExpiredMedia,
} from "@/features/content/generatedContentHistory";

describe("generatedContentHistory", () => {
  it("prepends new items and dedupes by media url", () => {
    const first = appendGeneratedContent([], {
      name: "a.png",
      mimeType: "image/png",
      kind: "image",
      mediaUrl: "/api/content/media/one.png",
      thumbnailUrl: "/api/content/media/one.png",
      source: "openai",
      sourceLabel: "OpenAI",
    });
    expect(first).toHaveLength(1);

    const second = appendGeneratedContent(first, {
      name: "b.png",
      mimeType: "image/png",
      kind: "image",
      mediaUrl: "/api/content/media/one.png",
      thumbnailUrl: "/api/content/media/one.png",
      source: "openai",
      sourceLabel: "OpenAI",
    });
    expect(second).toHaveLength(1);
    expect(second[0]?.name).toBe("b.png");
  });

  it("converts history item to selection asset", () => {
    const [item] = appendGeneratedContent([], {
      name: "test.png",
      mimeType: "image/png",
      kind: "image",
      mediaUrl: "https://example.com/a.png",
      thumbnailUrl: "https://example.com/a.png",
      source: "canva",
      sourceLabel: "Canva",
    });
    const asset = generatedItemToAsset(item!);
    expect(asset.sourceAccountId).toBe("canva");
    expect(asset.previewUrl).toContain("example.com");
  });

  it("does not flag recent server-stored media as expired", () => {
    const recent = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(
      isLikelyExpiredMedia({
        id: "x",
        name: "x",
        mimeType: "image/png",
        kind: "image",
        mediaUrl: "/api/content/media/x.png",
        thumbnailUrl: "/api/content/media/x.png",
        source: "apiai",
        sourceLabel: "apiai.me",
        createdAt: recent,
      })
    ).toBe(false);
  });

  it("flags old Canva URLs as likely expired", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(
      isLikelyExpiredMedia({
        id: "x",
        name: "x",
        mimeType: "image/png",
        kind: "image",
        mediaUrl: "https://export.canva.com/x.png",
        thumbnailUrl: "https://export.canva.com/x.png",
        source: "canva",
        sourceLabel: "Canva",
        createdAt: old,
      })
    ).toBe(true);
  });
});
