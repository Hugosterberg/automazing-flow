import { describe, expect, it } from "vitest";
import {
  alreadyEnqueuedToday,
  appendInstagramHashtags,
  buildBrandCaption,
  captionFromTemplate,
  expandCaptionTokens,
  findBestProductMatch,
  neededDayOffsets,
  occupiedDriveFileIds,
  parseInstagramDriveQueueConfig,
  pickNextDriveImage,
  preferredVariantFromHistory,
  scoreProductMatch,
  utcDayKey,
} from "../../server/lib/instagramDriveQueue.ts";
import { parseDriveFolderId } from "@/features/social/InstagramDriveQueueCard";

describe("instagramDriveQueue helpers", () => {
  it("expands caption tokens", () => {
    expect(expandCaptionTokens("Hi {{company}} — {{name}}", { company: "Acme", name: "shot" })).toBe(
      "Hi Acme — shot"
    );
    expect(captionFromTemplate("Today: {{name}}", "summer-sale.jpg")).toBe("Today: summer-sale");
  });

  it("builds brand advertising captions from profile", () => {
    const caption = buildBrandCaption(
      "product-hero.png",
      {
        name: "Acme",
        company: "Acme Studio",
        website: "acme.example",
        notes: "Handmade ceramics for modern kitchens.",
      },
      true
    );
    expect(caption).toContain("product-hero");
    expect(caption).toContain("Acme Studio");
    expect(caption).toContain("Handmade ceramics");
    expect(caption).toContain("#smallbusiness");
  });

  it("skips hashtags when disabled", () => {
    expect(appendInstagramHashtags("Hello", false)).toBe("Hello");
    expect(appendInstagramHashtags("Hello #x", true)).toBe("Hello #x");
  });

  it("defaults captionMode to brand and enables new queue options", () => {
    const parsed = parseInstagramDriveQueueConfig({
      enabled: true,
      driveAccountId: "d",
      toPostFolderId: "a",
      postedFolderId: "b",
      instagramAccountId: "ig",
    });
    expect(parsed?.captionMode).toBe("brand");
    expect(parsed?.includeHashtags).toBe(true);
    expect(parsed?.daysAhead).toBe(1);
    expect(parsed?.abTesting).toBe(true);
    expect(parsed?.matchShopifyProducts).toBe(true);
    expect(parsed?.useVision).toBe(true);
  });

  it("detects same UTC day enqueue", () => {
    const config = {
      enabled: true,
      driveAccountId: "d1",
      toPostFolderId: "a",
      postedFolderId: "b",
      instagramAccountId: "ig1",
      captionMode: "brand" as const,
      captionTemplate: "{{name}}",
      includeHashtags: true,
      daysAhead: 1,
      abTesting: true,
      matchShopifyProducts: true,
      useVision: true,
      lastEnqueuedAt: "2026-08-05T08:00:00.000Z",
    };
    expect(alreadyEnqueuedToday(config, new Date("2026-08-05T20:00:00.000Z"))).toBe(true);
    expect(alreadyEnqueuedToday(config, new Date("2026-08-06T01:00:00.000Z"))).toBe(false);
    expect(utcDayKey("2026-08-05T23:59:59.000Z")).toBe("2026-08-05");
  });

  it("computes needed day offsets for batch fill", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    expect(neededDayOffsets(now, [], 3)).toEqual([0, 1, 2]);
    const occupied = [
      {
        id: "p1",
        caption: "x",
        accountIds: [],
        platforms: ["instagram"],
        status: "scheduled" as const,
        scheduledFor: "2026-08-05T09:00:00.000Z",
        mediaUrls: [],
        createdAt: "2026-08-05T08:00:00.000Z",
        updatedAt: "",
        source: "instagram-drive-queue",
      },
    ];
    expect(neededDayOffsets(now, occupied as never[], 3)).toEqual([1, 2]);
  });

  it("scores and picks Shopify product matches from filename", () => {
    expect(scoreProductMatch("blue-mug", "Blue Ceramic Mug")).toBeGreaterThan(0);
    const match = findBestProductMatch(
      "blue-mug.jpg",
      [
        { title: "Blue Ceramic Mug", handle: "blue-mug", price: "12.00", currency: "USD" },
        { title: "Red Plate", handle: "red-plate", price: "8.00", currency: "USD" },
      ],
      "acme.myshopify.com"
    );
    expect(match?.title).toBe("Blue Ceramic Mug");
    expect(match?.url).toContain("/products/blue-mug");
  });

  it("prefers historically winning A/B variant", () => {
    expect(
      preferredVariantFromHistory([
        {
          postId: "a",
          variants: ["one", "two"],
          selected: 1,
          at: "2026-01-01T00:00:00.000Z",
        },
        {
          postId: "b",
          variants: ["one", "two"],
          selected: 1,
          at: "2026-01-02T00:00:00.000Z",
        },
        {
          postId: "c",
          variants: ["one", "two"],
          selected: 0,
          at: "2026-01-03T00:00:00.000Z",
        },
      ])
    ).toBe(1);
  });

  it("picks the first free image", () => {
    const images = [
      { id: "1", name: "a.jpg", mimeType: "image/jpeg", modifiedTime: "2026-01-01T00:00:00Z" },
      { id: "2", name: "b.jpg", mimeType: "image/jpeg", modifiedTime: "2026-01-02T00:00:00Z" },
    ];
    expect(pickNextDriveImage(images, new Set(["1"]))?.id).toBe("2");
    expect(pickNextDriveImage(images, new Set(["1", "2"]))).toBeNull();
  });

  it("tracks occupied drive file ids from scheduled posts", () => {
    const ids = occupiedDriveFileIds([
      {
        id: "p1",
        caption: "x",
        accountIds: [],
        platforms: ["instagram"],
        status: "scheduled",
        scheduledFor: null,
        mediaUrls: [],
        createdAt: "",
        updatedAt: "",
        driveFileId: "file-1",
      },
      {
        id: "p2",
        caption: "y",
        accountIds: [],
        platforms: ["instagram"],
        status: "failed",
        scheduledFor: null,
        mediaUrls: [],
        createdAt: "",
        updatedAt: "",
        driveFileId: "file-2",
      },
    ]);
    expect(ids.has("file-1")).toBe(true);
    expect(ids.has("file-2")).toBe(false);
  });
});

describe("parseDriveFolderId", () => {
  it("extracts id from Drive URLs and raw ids", () => {
    expect(parseDriveFolderId("https://drive.google.com/drive/folders/abc123XYZ")).toBe("abc123XYZ");
    expect(parseDriveFolderId("abc123XYZ")).toBe("abc123XYZ");
    expect(parseDriveFolderId("  ")).toBe("");
  });
});
