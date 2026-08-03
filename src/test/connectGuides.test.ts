import { describe, expect, it } from "vitest";
import { CONNECTION_CATALOG } from "@/lib/connectionCatalog";
import { getConnectGuide, oauthCallbackUrlForDisplay } from "@/features/connections/connectGuides";

describe("connect guides", () => {
  it("covers every connection in the catalog", () => {
    const missing = CONNECTION_CATALOG.filter(
      (entry) => getConnectGuide(entry.platform, entry.label) === null
    ).map((entry) => entry.platform);
    expect(missing).toEqual([]);
  });

  it("gives every guide at least two ordered steps with a title", () => {
    for (const entry of CONNECTION_CATALOG) {
      const guide = getConnectGuide(entry.platform, entry.label);
      expect(guide, entry.platform).not.toBeNull();
      expect(guide!.steps.length, entry.platform).toBeGreaterThanOrEqual(2);
      for (const step of guide!.steps) {
        expect(step.title.trim(), entry.platform).not.toBe("");
      }
    }
  });

  it("uses unique step titles so progress keys stay stable", () => {
    // The guide component keys steps by title; duplicates would make two rows
    // share a checkbox.
    for (const entry of CONNECTION_CATALOG) {
      const guide = getConnectGuide(entry.platform, entry.label);
      const titles = guide!.steps.map((s) => s.title);
      expect(new Set(titles).size, entry.platform).toBe(titles.length);
    }
  });

  it("points external links at real https destinations", () => {
    for (const entry of CONNECTION_CATALOG) {
      const guide = getConnectGuide(entry.platform, entry.label);
      const links = [
        ...guide!.steps.flatMap((s) => (s.link ? [s.link.href] : [])),
        ...(guide!.docs ? [guide!.docs.href] : []),
      ];
      for (const href of links) {
        expect(href, `${entry.platform}: ${href}`).toMatch(/^https:\/\//);
      }
    }
  });

  it("builds an absolute callback URL for provider consoles", () => {
    expect(oauthCallbackUrlForDisplay("/api/auth/gmail/callback")).toMatch(
      /^https?:\/\/[^/]+\/api\/auth\/gmail\/callback$/
    );
  });
});
