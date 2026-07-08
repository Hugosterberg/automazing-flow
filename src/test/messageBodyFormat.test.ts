import { describe, expect, it } from "vitest";
import { segmentLinks, splitEmailBody } from "@/features/messages/messageBodyFormat";

describe("splitEmailBody", () => {
  it("splits on quoted lines", () => {
    const { main, quoted } = splitEmailBody("Thanks!\n\n> Old reply\n> more");
    expect(main).toBe("Thanks!");
    expect(quoted).toContain("> Old reply");
  });

  it("splits on On ... wrote", () => {
    const { main, quoted } = splitEmailBody("Sure thing.\n\nOn Tue, Jan 1 wrote:\nPrevious text");
    expect(main).toBe("Sure thing.");
    expect(quoted).toMatch(/On Tue/i);
  });

  it("returns full text when no quote marker", () => {
    expect(splitEmailBody("Hello there")).toEqual({ main: "Hello there", quoted: null });
  });
});

describe("segmentLinks", () => {
  it("extracts URLs", () => {
    const segments = segmentLinks("See https://example.com/page for info");
    expect(segments).toEqual([
      { type: "text", value: "See " },
      { type: "link", href: "https://example.com/page", label: "https://example.com/page" },
      { type: "text", value: " for info" },
    ]);
  });
});
