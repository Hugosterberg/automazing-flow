import { describe, expect, it } from "vitest";
import { titleForPath } from "@/hooks/useDocumentTitle";

describe("titleForPath", () => {
  it("resolves known top-level routes to their nav title", () => {
    expect(titleForPath("/ecommerce")).toBe("E-handel");
    expect(titleForPath("/content")).toBe("Content");
    expect(titleForPath("/connections")).toBe("Kopplingar");
    expect(titleForPath("/preferences")).toBe("Inställningar");
  });

  it("matches nested routes via their parent prefix", () => {
    expect(titleForPath("/ecommerce/anything")).toBe("E-handel");
  });

  it("returns empty string for unknown routes and the landing page", () => {
    expect(titleForPath("/")).toBe("");
    expect(titleForPath("/totally-unknown")).toBe("");
  });

  it("does not treat a sibling prefix as a nested match", () => {
    // "/sales-marketing" must not resolve via the "/sales" entry.
    expect(titleForPath("/sales-marketing")).toBe("");
  });
});
