import { describe, expect, it } from "vitest";
import {
  buildEmailIframeDocument,
  isHtmlEmailContent,
  prepareEmailHtmlForIframe,
} from "@/features/messages/messageBodyHtml";

describe("isHtmlEmailContent", () => {
  it("detects full HTML documents", () => {
    expect(isHtmlEmailContent("<!DOCTYPE html><html><body>Hi</body></html>")).toBe(true);
  });

  it("detects HTML fragments with multiple tags", () => {
    expect(
      isHtmlEmailContent('<div><p>Hello</p><table><tr><td>Cell</td></tr></table></div>')
    ).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(isHtmlEmailContent("Hej,\n\nTack för ditt meddelande.")).toBe(false);
  });
});

describe("prepareEmailHtmlForIframe", () => {
  it("extracts body inner HTML and strips scripts", () => {
    const raw = `<html><body><p>Hello</p><script>alert(1)</script></body></html>`;
    expect(prepareEmailHtmlForIframe(raw)).toBe("<p>Hello</p>");
  });
});

describe("buildEmailIframeDocument", () => {
  it("wraps body HTML in a document shell", () => {
    const doc = buildEmailIframeDocument("<p>Test</p>");
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("<p>Test</p>");
    expect(doc).toContain('target="_blank"');
  });
});
