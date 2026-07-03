import { describe, expect, it } from "vitest";
import { normalizeAssessmentSubject } from "../../server/lib/mcpMultiSource.ts";

describe("normalizeAssessmentSubject", () => {
  it("normalizes bare domains", () => {
    expect(normalizeAssessmentSubject("automazing.life")).toEqual({
      subject: "automazing.life",
      kind: "domain",
    });
  });

  it("strips protocol and www", () => {
    expect(normalizeAssessmentSubject("https://www.Acme.com/about")).toEqual({
      subject: "acme.com",
      kind: "domain",
    });
  });

  it("treats company names as company kind", () => {
    expect(normalizeAssessmentSubject("Acme Corp")).toEqual({
      subject: "Acme Corp",
      kind: "company",
    });
  });

  it("rejects empty input", () => {
    expect(normalizeAssessmentSubject("  ")).toBeNull();
  });
});
