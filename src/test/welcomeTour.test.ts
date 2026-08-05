import { describe, expect, it } from "vitest";
import { welcomeTourSeen } from "@/features/onboarding/welcomeTourState";
import { priorityConnectsForKind } from "@/features/onboarding/firstWin";
import { GUIDE_IDS } from "@/features/guides/guideCatalog";
import svOnboarding from "@/locales/sv/onboarding.json";
import enOnboarding from "@/locales/en/onboarding.json";

describe("welcome tour", () => {
  it("auto-opens only for tenants that neither finished nor skipped", () => {
    expect(welcomeTourSeen(undefined)).toBe(false);
    expect(welcomeTourSeen({})).toBe(false);
    expect(welcomeTourSeen({ completedAt: "2026-08-05T00:00:00Z" })).toBe(true);
    expect(welcomeTourSeen({ dismissedAt: "2026-08-05T00:00:00Z" })).toBe(true);
  });

  it("has priority-connect copy for every platform the tour can show", () => {
    const priority = svOnboarding.priority as Record<string, unknown>;
    const priorityEn = enOnboarding.priority as Record<string, unknown>;
    for (const kind of ["personal", "company"] as const) {
      for (const item of priorityConnectsForKind(kind)) {
        expect(priority[item.platform], `sv: ${item.platform}`).toBeTruthy();
        expect(priorityEn[item.platform], `en: ${item.platform}`).toBeTruthy();
      }
    }
  });

  it("ships tour copy in both languages with the same slide keys", () => {
    const sv = svOnboarding.tour as Record<string, unknown>;
    const en = enOnboarding.tour as Record<string, unknown>;
    expect(Object.keys(sv).sort()).toEqual(Object.keys(en).sort());
    for (const slide of ["welcome", "connect", "safety", "daily"]) {
      expect(sv[slide], `sv tour.${slide}`).toBeTruthy();
      expect(en[slide], `en tour.${slide}`).toBeTruthy();
    }
  });

  it("first-win steps map to guides that actually exist", () => {
    // Mirrors GUIDE_FOR_STEP in FirstWinChecklist — keep in sync.
    const mapping = ["connections", "connections", "messages", "automations", "company"];
    for (const id of mapping) {
      expect(GUIDE_IDS, id).toContain(id);
    }
  });
});
