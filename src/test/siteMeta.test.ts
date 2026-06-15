import { describe, expect, it } from "vitest";
import { extractSiteMeta } from "../../server/lib/siteMeta";

describe("extractSiteMeta", () => {
  it("prefers og:site_name and og:description, decoding entities", () => {
    const html = `
      <html><head>
        <meta property="og:site_name" content="Acme &amp; Co" />
        <meta property="og:description" content="We build &quot;great&quot; widgets" />
        <title>Acme &amp; Co — Widgets</title>
      </head></html>`;
    const meta = extractSiteMeta(html);
    expect(meta.company).toBe("Acme & Co");
    expect(meta.description).toBe('We build "great" widgets');
  });

  it("falls back to the title tag, trimming a trailing tagline", () => {
    const html = `<head><title>Bright Studio | Design agency in Malmö</title></head>`;
    const meta = extractSiteMeta(html);
    expect(meta.company).toBe("Bright Studio");
  });

  it("reads name= meta description when og tags are absent", () => {
    const html = `<head><meta name="description" content="Local coffee roastery"><title>Roast</title></head>`;
    const meta = extractSiteMeta(html);
    expect(meta.company).toBe("Roast");
    expect(meta.description).toBe("Local coffee roastery");
  });

  it("returns empty strings for a page with no usable meta", () => {
    const meta = extractSiteMeta("<html><body>hello</body></html>");
    expect(meta.company).toBe("");
    expect(meta.description).toBe("");
  });
});
