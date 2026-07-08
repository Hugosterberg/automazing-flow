import { describe, expect, it } from "vitest";
import {
  linkDisplayLabel,
  normalizeEmailPlainText,
  segmentLinks,
  splitEmailBody,
  splitEmailParagraphs,
} from "@/features/messages/messageBodyFormat";

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

describe("normalizeEmailPlainText", () => {
  it("dedupes consecutive identical lines", () => {
    expect(
      normalizeEmailPlainText("Hello\nHello\n\nWorld")
    ).toBe("Hello\n\nWorld");
  });

  it("merges single line breaks into paragraphs via splitEmailParagraphs", () => {
    expect(
      splitEmailParagraphs("Line one\nLine two\n\nNew paragraph")
    ).toEqual(["Line one Line two", "New paragraph"]);
  });
});

describe("segmentLinks", () => {
  it("extracts URLs with shortened labels", () => {
    const segments = segmentLinks("See https://example.com/page for info");
    expect(segments).toEqual([
      { type: "text", value: "See" },
      { type: "link", href: "https://example.com/page", label: "example.com/page" },
      { type: "text", value: " for info" },
    ]);
  });

  it("handles parenthesized tracking URLs", () => {
    const segments = segmentLinks("( https://clicks.example.com/track/abc123 )");
    expect(segments.some((s) => s.type === "link" && s.href.includes("clicks.example.com"))).toBe(true);
  });
});

describe("linkDisplayLabel", () => {
  it("shortens long paths", () => {
    const label = linkDisplayLabel(
      "https://clicks.suno.com/f/a/very-long-tracking-path-that-should-be-truncated"
    );
    expect(label.endsWith("…")).toBe(true);
    expect(label.includes("clicks.suno.com")).toBe(true);
  });
});
