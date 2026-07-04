import { describe, expect, it } from "vitest";
import { createZipStore } from "../../server/lib/zipStore.ts";
import { extractZipEntries } from "../../server/lib/zipExtract.ts";

describe("zipExtract", () => {
  it("extracts stored image entries from a zip buffer", () => {
    const zip = createZipStore([
      { name: "outputs/one.png", data: Buffer.from("png-one") },
      { name: "outputs/two.png", data: Buffer.from("png-two") },
      { name: "readme.txt", data: Buffer.from("skip me") },
    ]);
    const { entries, skipped } = extractZipEntries(zip);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.name).toBe("one.png");
    expect(entries[0]?.contentType).toBe("image/png");
    expect(skipped).toBeGreaterThanOrEqual(1);
  });

  it("skips macOS junk paths", () => {
    const zip = createZipStore([
      { name: "__MACOSX/._photo.png", data: Buffer.from("junk") },
      { name: "photo.png", data: Buffer.from("real") },
    ]);
    const { entries } = extractZipEntries(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("photo.png");
  });
});
