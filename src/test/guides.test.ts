import { describe, expect, it } from "vitest";
import svGuides from "@/locales/sv/guides.json";
import enGuides from "@/locales/en/guides.json";
import { GUIDES, GUIDE_IDS, getGuide, guideForRoute } from "@/features/guides/guideCatalog";

type GuideCopy = {
  title?: string;
  why?: string;
  result?: string;
  steps?: Array<{ title?: string; detail?: string }>;
};

const catalogs: Array<[string, Record<string, unknown>]> = [
  ["sv", svGuides as unknown as Record<string, unknown>],
  ["en", enGuides as unknown as Record<string, unknown>],
];

describe("guide catalog", () => {
  it("routes are unique so a page never offers two guides", () => {
    const routes = GUIDES.map((g) => g.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("every id in GUIDE_IDS has a definition", () => {
    for (const id of GUIDE_IDS) {
      expect(getGuide(id), id).not.toBeNull();
    }
  });

  it("resolves the home guide only for the exact root path", () => {
    expect(guideForRoute("/")?.id).toBe("home");
    expect(guideForRoute("/reviews")?.id).toBe("reviews");
  });

  it("keeps a guide on nested paths under the same section", () => {
    expect(guideForRoute("/connections/health")?.id).toBe("connections");
    expect(guideForRoute("/sales/leads")?.id).toBe("sales");
  });

  it("returns null for routes without a guide", () => {
    expect(guideForRoute("/preferences")).toBeNull();
  });

  it("step links point at real guide-less or guided app routes, never off-site", () => {
    for (const guide of GUIDES) {
      for (const to of Object.values(guide.stepLinks ?? {})) {
        expect(to.startsWith("/"), `${guide.id} -> ${to}`).toBe(true);
      }
    }
  });

  it("step link indexes stay inside the declared step count", () => {
    for (const guide of GUIDES) {
      for (const index of Object.keys(guide.stepLinks ?? {})) {
        expect(Number(index), `${guide.id} step ${index}`).toBeLessThan(guide.stepCount);
      }
    }
  });
});

describe.each(catalogs)("guide copy (%s)", (lang, copy) => {
  it("has an entry for every guide", () => {
    for (const guide of GUIDES) {
      expect(copy[guide.id], `${lang}: missing ${guide.id}`).toBeTruthy();
    }
  });

  it("matches the step count declared in the catalog", () => {
    for (const guide of GUIDES) {
      const entry = copy[guide.id] as GuideCopy;
      expect(entry.steps?.length, `${lang}: ${guide.id}`).toBe(guide.stepCount);
    }
  });

  it("gives every guide a title, a why and a titled step", () => {
    for (const guide of GUIDES) {
      const entry = copy[guide.id] as GuideCopy;
      expect(entry.title?.trim(), `${lang}: ${guide.id} title`).toBeTruthy();
      expect(entry.why?.trim(), `${lang}: ${guide.id} why`).toBeTruthy();
      for (const [index, step] of (entry.steps ?? []).entries()) {
        expect(step.title?.trim(), `${lang}: ${guide.id} step ${index}`).toBeTruthy();
      }
    }
  });

  it("keeps guides short enough to actually be read", () => {
    for (const guide of GUIDES) {
      const entry = copy[guide.id] as GuideCopy;
      expect(entry.steps?.length ?? 0, `${lang}: ${guide.id}`).toBeLessThanOrEqual(5);
    }
  });

  it("has the shared UI strings the dialog needs", () => {
    const ui = copy.ui as Record<string, string>;
    for (const key of ["trigger", "why", "result", "progress", "done", "reset", "goThere"]) {
      expect(ui?.[key], `${lang}: ui.${key}`).toBeTruthy();
    }
  });
});

describe("guide copy parity", () => {
  it("sv and en describe the same guides with the same step counts", () => {
    for (const guide of GUIDES) {
      const sv = (svGuides as unknown as Record<string, GuideCopy>)[guide.id];
      const en = (enGuides as unknown as Record<string, GuideCopy>)[guide.id];
      expect(sv.steps?.length, guide.id).toBe(en.steps?.length);
      expect(Boolean(sv.result), `${guide.id} result`).toBe(Boolean(en.result));
    }
  });
});
