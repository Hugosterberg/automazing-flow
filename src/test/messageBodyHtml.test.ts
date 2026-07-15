import { describe, expect, it } from "vitest";
import {
  buildEmailIframeDocument,
  isHtmlEmailContent,
  prepareEmailHtmlForIframe,
} from "@/features/messages/messageBodyHtml";

describe("messageBodyHtml", () => {
  it("detects HTML marketing templates", () => {
    expect(
      isHtmlEmailContent(
        "<html><body><table><tr><td><img src='x'><p>Hej</p><a href='#'>Länk</a></td></tr></table></body></html>"
      )
    ).toBe(true);
    expect(isHtmlEmailContent("Plain text only")).toBe(false);
  });

  it("strips scripts and prefers body content", () => {
    const prepared = prepareEmailHtmlForIframe(
      "<html><body><p>Hej</p><script>alert(1)</script></body></html>"
    );
    expect(prepared).toContain("<p>Hej</p>");
    expect(prepared.toLowerCase()).not.toContain("<script");
  });

  it("constrains images and embeds in the iframe stylesheet", () => {
    const doc = buildEmailIframeDocument("<img src='hero.png' width='1600' height='900'>");
    expect(doc).toContain("max-height: min(28vh, 200px)");
    expect(doc).toContain("object-fit: contain");
    expect(doc).toContain("img, video, iframe, embed, object");
    expect(doc).toContain("overflow-x: hidden");
    expect(doc).toContain("font-size: 12.5px");
    expect(doc).toContain("zoom: 0.86");
  });
});
