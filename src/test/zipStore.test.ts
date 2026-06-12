import { describe, expect, it } from "vitest";
import { createZipStore } from "../../server/lib/zipStore.ts";

describe("zipStore", () => {
  it("creates a zip archive with one entry", () => {
    const zip = createZipStore([{ name: "hello.txt", data: Buffer.from("hello") }]);
    expect(zip.slice(0, 4).toString()).toBe("PK\u0003\u0004");
    expect(zip.length).toBeGreaterThan(30);
  });
});
