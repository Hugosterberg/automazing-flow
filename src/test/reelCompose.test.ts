import { describe, expect, it } from "vitest";
import {
  buildReelUrl,
  isValidReelPublicId,
  planReelSegments,
  readCloudinaryConfig,
  signCloudinaryParams,
} from "../../server/lib/reelCompose";

describe("planReelSegments", () => {
  it("splits the target evenly across equally long clips", () => {
    expect(planReelSegments([{ duration: 20 }, { duration: 20 }, { duration: 20 }], 30)).toEqual([
      10, 10, 10,
    ]);
  });

  it("caps short clips and redistributes the freed time", () => {
    // 4s clip keeps its 4s; the remaining 26s is split between the long clips.
    expect(planReelSegments([{ duration: 4 }, { duration: 40 }, { duration: 40 }], 30)).toEqual([
      4, 13, 13,
    ]);
  });

  it("uses all material when the clips are shorter than the target", () => {
    expect(planReelSegments([{ duration: 8 }, { duration: 5 }], 60)).toEqual([8, 5]);
  });

  it("respects start offsets when computing usable length", () => {
    expect(planReelSegments([{ duration: 10, startOffset: 6 }, { duration: 40 }], 30)).toEqual([
      4, 26,
    ]);
  });

  it("keeps the original clip order", () => {
    const seconds = planReelSegments([{ duration: 60 }, { duration: 2 }, { duration: 60 }], 60);
    expect(seconds[1]).toBe(2);
    expect(seconds[0]).toBe(29);
    expect(seconds[2]).toBe(29);
  });
});

describe("buildReelUrl", () => {
  it("builds a spliced 9:16 mp4 URL with per-segment trims", () => {
    const { url, posterUrl } = buildReelUrl({
      cloudName: "demo",
      segments: [
        { publicId: "automazing/reels/bp1/a", seconds: 10, startOffset: 0 },
        { publicId: "automazing/reels/bp1/b", seconds: 20, startOffset: 2 },
      ],
    });
    expect(url).toBe(
      "https://res.cloudinary.com/demo/video/upload/" +
        "du_10,c_fill,w_1080,h_1920/" +
        "fl_splice,l_video:automazing:reels:bp1:b/" +
        "so_2,du_20,c_fill,w_1080,h_1920/" +
        "fl_layer_apply/" +
        "automazing/reels/bp1/a.mp4"
    );
    expect(posterUrl).toBe(
      "https://res.cloudinary.com/demo/video/upload/so_0,c_fill,w_1080,h_1920/automazing/reels/bp1/a.jpg"
    );
  });

  it("handles a single segment without splice layers", () => {
    const { url } = buildReelUrl({
      cloudName: "demo",
      segments: [{ publicId: "clip", seconds: 30, startOffset: 0 }],
    });
    expect(url).toBe(
      "https://res.cloudinary.com/demo/video/upload/du_30,c_fill,w_1080,h_1920/clip.mp4"
    );
  });

  it("throws without segments", () => {
    expect(() => buildReelUrl({ cloudName: "demo", segments: [] })).toThrow();
  });
});

describe("isValidReelPublicId", () => {
  it("accepts folder-style ids and rejects traversal or URL characters", () => {
    expect(isValidReelPublicId("automazing/reels/bp1/xyz_123")).toBe(true);
    expect(isValidReelPublicId("../etc/passwd")).toBe(false);
    expect(isValidReelPublicId("a b")).toBe(false);
    expect(isValidReelPublicId("a,b/c_fill")).toBe(false);
    expect(isValidReelPublicId("")).toBe(false);
  });
});

describe("signCloudinaryParams", () => {
  it("signs the alphabetically sorted params with the secret appended", () => {
    // sha1("folder=f&timestamp=1234secret")
    const signature = signCloudinaryParams({ timestamp: 1234, folder: "f" }, "secret");
    expect(signature).toMatch(/^[0-9a-f]{40}$/);
    expect(signature).toBe(signCloudinaryParams({ folder: "f", timestamp: 1234 }, "secret"));
  });
});

describe("readCloudinaryConfig", () => {
  it("prefers explicit vars and falls back to CLOUDINARY_URL", () => {
    expect(
      readCloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: "cloud",
        CLOUDINARY_API_KEY: "key",
        CLOUDINARY_API_SECRET: "secret",
      })
    ).toEqual({ cloudName: "cloud", apiKey: "key", apiSecret: "secret" });

    expect(readCloudinaryConfig({ CLOUDINARY_URL: "cloudinary://key:secret@cloud" })).toEqual({
      cloudName: "cloud",
      apiKey: "key",
      apiSecret: "secret",
    });

    expect(readCloudinaryConfig({})).toBeNull();
    expect(readCloudinaryConfig({ CLOUDINARY_URL: "not-a-url" })).toBeNull();
  });
});
