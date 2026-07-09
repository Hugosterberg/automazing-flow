import { describe, expect, it } from "vitest";
import { extractSiteMeta } from "../../server/lib/siteMeta";
import { formatOrgNumberDisplay, isValidOrgNumber, normalizeOrgNumber } from "../../server/lib/orgNumber";

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

  it("reads JSON-LD LocalBusiness for phone and address", () => {
    const html = `<head>
      <script type="application/ld+json">
        {"@type":"LocalBusiness","name":"Café Nord","telephone":"+46 40 123 45","email":"hej@cafe.se",
         "address":{"streetAddress":"Storgatan 1","postalCode":"21142","addressLocality":"Malmö"},
         "description":"Specialty coffee"}
      </script>
    </head>`;
    const meta = extractSiteMeta(html);
    expect(meta.company).toBe("Café Nord");
    expect(meta.phone).toBe("+46 40 123 45");
    expect(meta.email).toBe("hej@cafe.se");
    expect(meta.location).toBe("Malmö");
    expect(meta.address).toContain("Storgatan 1");
    expect(meta.description).toBe("Specialty coffee");
  });

  it("returns undefined fields for a page with no usable meta", () => {
    const meta = extractSiteMeta("<html><body>hello</body></html>");
    expect(meta.company).toBeUndefined();
    expect(meta.description).toBeUndefined();
  });
});

describe("orgNumber", () => {
  it("normalizes and validates Swedish org numbers", () => {
    expect(normalizeOrgNumber("556016-0680")).toBe("5560160680");
    expect(isValidOrgNumber("5560160680")).toBe(true);
    expect(formatOrgNumberDisplay("5560160680")).toBe("556016-0680");
    expect(isValidOrgNumber("123")).toBe(false);
  });
});
