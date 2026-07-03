import { describe, expect, it } from "vitest";
import {
  AUTOMATION_TOPICS,
  AUTOMATION_TOPIC_ORDER,
  automationCatalog,
  catalogEntriesForTopic,
} from "./automationCatalog";
import { navItems, topNavItems } from "@/components/navConfig";
import { AUTOMATION_SCHEDULES } from "../../../server/lib/automationSchedules";

describe("automationCatalog", () => {
  it("has unique entry ids", () => {
    const ids = automationCatalog.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry belongs to a defined topic", () => {
    for (const entry of automationCatalog) {
      expect(AUTOMATION_TOPICS[entry.topic]).toBeDefined();
    }
  });

  it("topic order covers every topic exactly once", () => {
    expect([...AUTOMATION_TOPIC_ORDER].sort()).toEqual(
      Object.keys(AUTOMATION_TOPICS).sort()
    );
  });

  it("every topic has at least one entry", () => {
    for (const topic of AUTOMATION_TOPIC_ORDER) {
      expect(catalogEntriesForTopic(topic).length).toBeGreaterThan(0);
    }
  });

  it("output links point to real nav routes", () => {
    const knownUrls = new Set(
      [...navItems, ...topNavItems].map((item) => item.url)
    );
    for (const entry of automationCatalog) {
      if (entry.outputHref) {
        expect(knownUrls.has(entry.outputHref)).toBe(true);
      }
    }
  });

  it("every cronKey maps to a real server automation schedule", () => {
    const scheduleKeys = new Set(AUTOMATION_SCHEDULES.map((s) => s.key));
    for (const entry of automationCatalog) {
      if (entry.cronKey) {
        expect(scheduleKeys.has(entry.cronKey)).toBe(true);
      }
    }
  });

  it("filters business-only entries when asked", () => {
    const all = catalogEntriesForTopic("insights");
    const privateOnly = catalogEntriesForTopic("insights", {
      includeBusinessOnly: false,
    });
    expect(privateOnly.every((entry) => !entry.businessOnly)).toBe(true);
    expect(privateOnly.length).toBeLessThanOrEqual(all.length);
    // The marketing snapshot is company-oriented and must not leak into
    // the private workspace.
    expect(privateOnly.map((e) => e.id)).not.toContain("marketing-snapshot");
  });
});
