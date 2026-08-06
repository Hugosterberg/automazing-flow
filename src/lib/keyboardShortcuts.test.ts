import { beforeAll, describe, expect, it } from "vitest";
import {
  buildShortcutSections,
  goTargetForKey,
  isPlainLetterShortcut,
  matchesKey,
} from "./keyboardShortcuts";
import { initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  initI18n();
  await i18n.changeLanguage("sv");
});

describe("keyboardShortcuts", () => {
  it("matchesKey is case-insensitive", () => {
    expect(matchesKey({ key: "H" } as KeyboardEvent, "h")).toBe(true);
    expect(matchesKey({ key: "h" } as KeyboardEvent, "H")).toBe(true);
    expect(matchesKey({ key: "j" } as KeyboardEvent, "k")).toBe(false);
  });

  it("isPlainLetterShortcut rejects modified keys", () => {
    expect(
      isPlainLetterShortcut({ key: "h", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent)
    ).toBe(true);
    expect(
      isPlainLetterShortcut({ key: "h", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent)
    ).toBe(false);
    expect(
      isPlainLetterShortcut({ key: "J", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true } as KeyboardEvent)
    ).toBe(false);
  });

  it("goTargetForKey respects workspace mode", () => {
    expect(goTargetForKey("s", "business")?.url).toBe("/sales");
    expect(goTargetForKey("s", "private")).toBeNull();
    expect(goTargetForKey("m", "private")?.url).toBe("/messages");
    expect(goTargetForKey("u", "business")?.url).toBe("/handbook");
    expect(goTargetForKey("u", "private")?.url).toBe("/handbook");
    expect(goTargetForKey("e", "business")?.url).toBe("/ecommerce");
    expect(goTargetForKey("e", "private")).toBeNull();
  });

  it("buildShortcutSections uses English-first-letter keys for triage pages", () => {
    const sections = buildShortcutSections("⌘");
    const messages = sections.find((s) => s.id === "messages");
    const reviews = sections.find((s) => s.id === "reviews");
    const tasks = sections.find((s) => s.id === "tasks");

    expect(messages?.shortcuts.some((s) => s.keys.includes("H") && s.description.includes("hanterad"))).toBe(true);
    expect(reviews?.shortcuts.some((s) => s.keys.includes("M") && s.description.includes("Markera"))).toBe(true);
    expect(reviews?.shortcuts.some((s) => s.keys.includes("D") && s.description.includes("utkast"))).toBe(true);
    expect(tasks?.shortcuts.some((s) => s.keys.includes("E") && s.description.includes("Redigera"))).toBe(true);
    expect(tasks?.shortcuts.some((s) => s.keys.includes("O") && s.description.includes("Försenade"))).toBe(true);
  });
});
