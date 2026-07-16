import { describe, expect, it } from "vitest";
import { briefItemsForRoute, routeModuleLabel } from "@/features/daily-brief/briefForRoute";
import type { BriefItem } from "@/features/daily-brief/buildDailyBrief";

function item(partial: Pick<BriefItem, "id" | "kind">): BriefItem {
  return {
    severity: "info",
    title: partial.id,
    description: "",
    to: "/",
    count: 1,
    ...partial,
  };
}

describe("briefItemsForRoute", () => {
  const items = [
    item({ id: "m1", kind: "message" }),
    item({ id: "t1", kind: "task" }),
    item({ id: "l1", kind: "lead" }),
    item({ id: "mk1", kind: "marketing" }),
  ];

  it("filters to kinds relevant for the current route", () => {
    expect(briefItemsForRoute("/messages", items).map((i) => i.id)).toEqual(["m1"]);
    expect(briefItemsForRoute("/sales", items).map((i) => i.id)).toEqual(["l1", "mk1"]);
    expect(briefItemsForRoute("/tasks/board", items).map((i) => i.id)).toEqual(["t1"]);
  });

  it("returns the first three items on home (no route filter)", () => {
    const many = [
      ...items,
      item({ id: "r1", kind: "recommendation" }),
      item({ id: "a1", kind: "automation" }),
    ];
    expect(briefItemsForRoute("/", many).map((i) => i.id)).toEqual(["m1", "t1", "l1"]);
  });

  it("returns an empty list when no items match the route", () => {
    expect(briefItemsForRoute("/reviews", items)).toEqual([]);
  });
});

describe("routeModuleLabel", () => {
  it("returns Swedish module labels for known routes", () => {
    expect(routeModuleLabel("/messages")).toBe("Meddelanden");
    expect(routeModuleLabel("/tasks/today")).toBe("Uppgifter");
    expect(routeModuleLabel("/ecommerce")).toBe("E-handel");
  });

  it("returns null for unknown routes", () => {
    expect(routeModuleLabel("/settings")).toBeNull();
    expect(routeModuleLabel("/")).toBeNull();
  });
});
