import { navItems, topNavItems, type TopNavItem } from "@/components/navConfig";

import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";

const ALL_NAV: TopNavItem[] = [...navItems, ...topNavItems];
const RECENT_PAGES_KEY = "automazing-flow-recent-pages";
const MAX_RECENT_PAGES = 5;
const GO_CHORD_MS = 1000;

export interface RecentPage {
  pathname: string;
  title: string;
  visitedAt: number;
}

export interface GoNavTarget {
  key: string;
  url: string;
  title: string;
  modes?: WorkspaceMode[];
}

export interface ShortcutEntry {
  keys: string[];
  description: string;
}

export interface ShortcutSection {
  id: string;
  title: string;
  /** Omit on routes where the section does not apply. */
  routes?: string[];
  shortcuts: ShortcutEntry[];
}

export const GO_NAV_TARGETS: GoNavTarget[] = [
  { key: "h", url: "/", title: "Hem" },
  { key: "t", url: "/tasks", title: "Uppgifter" },
  { key: "m", url: "/messages", title: "Meddelanden" },
  { key: "s", url: "/sales", title: "Försäljning", modes: ["business"] },
  { key: "c", url: "/company", title: "Företag", modes: ["business"] },
  { key: "i", url: "/intelligence", title: "MCP Intelligence" },
  { key: "p", url: "/preferences", title: "Inställningar" },
];

export function isMacLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

export function modKeyLabel(): string {
  return isMacLike() ? "⌘" : "Ctrl";
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function isShortcutBlocked(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[role="dialog"][data-state="open"]'));
}

/** Case-insensitive single-key match (English shortcut letters). */
export function matchesKey(event: KeyboardEvent, key: string): boolean {
  return event.key.toLowerCase() === key.toLowerCase();
}

/** Letter shortcut without modifiers (not Shift+J list nav, etc.). */
export function isPlainLetterShortcut(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

export function titleForRecentPage(pathname: string): string {
  if (pathname === "/") return "Hem";
  const item = ALL_NAV.find((entry) => entry.url === pathname);
  if (item) return item.title;
  const prefix = ALL_NAV.find(
    (entry) => entry.url !== "/" && pathname.startsWith(`${entry.url}/`)
  );
  return prefix ? prefix.title : pathname;
}

export function recordRecentPage(pathname: string, title?: string): void {
  if (!pathname || pathname === "/404") return;
  const label = (title ?? titleForRecentPage(pathname)).trim() || pathname;
  try {
    const existing = getRecentPages();
    const filtered = existing.filter((entry) => entry.pathname !== pathname);
    const next: RecentPage[] = [
      { pathname, title: label, visitedAt: Date.now() },
      ...filtered,
    ].slice(0, MAX_RECENT_PAGES);
    sessionStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage unavailable — ignore
  }
}

export function getRecentPages(): RecentPage[] {
  try {
    const raw = sessionStorage.getItem(RECENT_PAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function goTargetForKey(key: string, mode: WorkspaceMode): GoNavTarget | null {
  const normalized = key.toLowerCase();
  const target = GO_NAV_TARGETS.find((item) => item.key === normalized);
  if (!target) return null;
  if (target.modes && !target.modes.includes(mode)) return null;
  return target;
}

export { GO_CHORD_MS };

/** Keys match the first letter of the English action name (J/K = list navigation convention). */
export function buildShortcutSections(modKey: string): ShortcutSection[] {
  return [
    {
      id: "global",
      title: "Globalt",
      shortcuts: [
        { keys: [`${modKey}`, "K"], description: "Kommandopalett" },
        { keys: ["G", "H"], description: "Gå till Startsida" },
        { keys: ["G", "T"], description: "Gå till Uppgifter" },
        { keys: ["G", "M"], description: "Gå till Meddelanden" },
        { keys: ["G", "S"], description: "Gå till Försäljning (företagsläge)" },
        { keys: ["G", "C"], description: "Gå till Företag (företagsläge)" },
        { keys: ["G", "I"], description: "Gå till MCP Intelligence" },
        { keys: ["G", "P"], description: "Gå till Inställningar" },
        { keys: ["?"], description: "Visa genvägslista" },
        { keys: [`${modKey}`, "B"], description: "Visa/dölj sidopanelen" },
      ],
    },
    {
      id: "messages",
      title: "Meddelanden",
      routes: ["/messages"],
      shortcuts: [
        { keys: ["J"], description: "Nästa meddelande" },
        { keys: ["K"], description: "Föregående meddelande" },
        { keys: ["H"], description: "Markera som hanterad (eller filtret Hanterade utan valt meddelande)" },
        { keys: ["R"], description: "Svara (fokus)" },
        { keys: ["N"], description: "Nästa öppna" },
        { keys: ["Q"], description: "Filter: Kö" },
        { keys: ["O"], description: "Filter: Öppna" },
        { keys: ["A"], description: "Filter: Alla" },
        { keys: ["/"], description: "Sök" },
        { keys: ["Esc"], description: "Stäng" },
        { keys: [`${modKey}`, "Enter"], description: "Skicka svar" },
      ],
    },
    {
      id: "reviews",
      title: "Recensioner",
      routes: ["/reviews"],
      shortcuts: [
        { keys: ["J"], description: "Nästa recension" },
        { keys: ["K"], description: "Föregående recension" },
        { keys: ["M"], description: "Markera som besvarad" },
        { keys: ["D"], description: "AI-utkast" },
        { keys: ["A"], description: "Filter: Alla" },
        { keys: ["N"], description: "Filter: Behöver svar" },
        { keys: ["/"], description: "Sök" },
        { keys: ["Esc"], description: "Stäng" },
      ],
    },
    {
      id: "activity",
      title: "Aktivitet",
      routes: ["/activity"],
      shortcuts: [
        { keys: ["J"], description: "Nästa händelse" },
        { keys: ["K"], description: "Föregående händelse" },
        { keys: ["/"], description: "Sök" },
        { keys: ["E"], description: "Filter: Fel" },
        { keys: ["W"], description: "Filter: Varningar" },
        { keys: ["Esc"], description: "Stäng" },
      ],
    },
    {
      id: "sales",
      title: "Sales",
      routes: ["/sales"],
      shortcuts: [
        { keys: ["/"], description: "Sök" },
        { keys: ["J"], description: "Nästa (outreach / uppföljning)" },
        { keys: ["K"], description: "Föregående (outreach / uppföljning)" },
        { keys: ["S"], description: "Markera som skickad (outreach-kö)" },
        { keys: ["O"], description: "Outreach-utkast (uppföljningar)" },
      ],
    },
    {
      id: "tasks",
      title: "Uppgifter",
      routes: ["/tasks"],
      shortcuts: [
        { keys: ["/"], description: "Sök" },
        { keys: ["N"], description: "Ny uppgift" },
        { keys: ["J"], description: "Nästa kort" },
        { keys: ["K"], description: "Föregående kort" },
        { keys: ["E"], description: "Redigera fokuserat kort" },
        { keys: ["A"], description: "Filter: Alla" },
        { keys: ["O"], description: "Filter: Försenade" },
        { keys: ["T"], description: "Filter: Idag" },
      ],
    },
    {
      id: "customers",
      title: "Kunder",
      routes: ["/customers"],
      shortcuts: [
        { keys: ["J"], description: "Nästa kund" },
        { keys: ["K"], description: "Föregående kund" },
        { keys: ["/"], description: "Sök" },
        { keys: ["Esc"], description: "Stäng" },
      ],
    },
    {
      id: "content",
      title: "Innehåll",
      routes: ["/content"],
      shortcuts: [
        { keys: ["J"], description: "Nästa fil (Bläddra)" },
        { keys: ["K"], description: "Föregående fil (Bläddra)" },
        { keys: ["/"], description: "Sök (Bläddra)" },
        { keys: ["S"], description: "Välj / växla fil" },
      ],
    },
    {
      id: "automations",
      title: "Automationer",
      routes: ["/automations"],
      shortcuts: [
        { keys: ["F"], description: "Misslyckade körningar (scrolla till listan)" },
      ],
    },
    {
      id: "marketing",
      title: "Marknadsföring",
      routes: ["/marketing"],
      shortcuts: [
        { keys: ["J"], description: "Nästa kampanj" },
        { keys: ["K"], description: "Föregående kampanj" },
        { keys: ["N"], description: "Ny kampanj" },
        { keys: ["E"], description: "Redigera fokuserad kampanj" },
      ],
    },
    {
      id: "calendar",
      title: "Kalender",
      routes: ["/calendar"],
      shortcuts: [
        { keys: ["J"], description: "Nästa händelse (vald dag)" },
        { keys: ["K"], description: "Föregående händelse (vald dag)" },
        { keys: ["O"], description: "Öppna fokuserad händelse" },
      ],
    },
  ];
}
