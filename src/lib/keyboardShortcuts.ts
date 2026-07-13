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

/** Swedish display titles for nav items (sidebar stays English for now). */
export const NAV_TITLE_SV: Record<string, string> = {
  company: "Företag",
  connections: "Kopplingar",
  intelligence: "MCP Intelligence",
  preferences: "Inställningar",
  content: "Innehåll",
  "social-media": "Sociala medier",
  ecommerce: "E-handel",
  "sales-marketing": "Försäljning",
  marketing: "Marknadsföring",
  "digital-brand": "Digitalt varumärke",
  customers: "Kunder",
  calendar: "Kalender",
  messages: "Meddelanden",
  reviews: "Recensioner",
  tasks: "Uppgifter",
  activity: "Aktivitet",
  automations: "Automationer",
  "ai-recommendations": "AI-rekommendationer",
};

export const NAV_GROUP_LABELS_SV: Record<string, string> = {
  work: "Arbete",
  productivity: "Produktivitet",
  system: "System",
};

export const GO_NAV_TARGETS: GoNavTarget[] = [
  { key: "h", url: "/", title: "Hem" },
  { key: "t", url: "/tasks", title: "Uppgifter" },
  { key: "m", url: "/messages", title: "Meddelanden" },
  { key: "s", url: "/sales", title: "Försäljning", modes: ["business"] },
  { key: "c", url: "/company", title: "Företag", modes: ["business"] },
  { key: "i", url: "/intelligence", title: "MCP Intelligence" },
  { key: "p", url: "/preferences", title: "Inställningar" },
];

export function navTitleSv(key: string, fallback: string): string {
  return NAV_TITLE_SV[key] ?? fallback;
}

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
  if (item) return navTitleSv(item.key, item.title);
  const prefix = ALL_NAV.find(
    (entry) => entry.url !== "/" && pathname.startsWith(`${entry.url}/`)
  );
  return prefix ? navTitleSv(prefix.key, prefix.title) : pathname;
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
        { keys: [`${modKey}`, "K"], description: "Kommandopalett (Command palette)" },
        { keys: ["G", "H"], description: "Go Home" },
        { keys: ["G", "T"], description: "Go Tasks" },
        { keys: ["G", "M"], description: "Go Messages" },
        { keys: ["G", "S"], description: "Go Sales (företagsläge)" },
        { keys: ["G", "C"], description: "Go Company (företagsläge)" },
        { keys: ["G", "I"], description: "Go Intelligence" },
        { keys: ["G", "P"], description: "Go Preferences" },
        { keys: ["?"], description: "Visa genvägslista" },
        { keys: [`${modKey}`, "B"], description: "Sidebar toggle" },
      ],
    },
    {
      id: "messages",
      title: "Meddelanden",
      routes: ["/messages"],
      shortcuts: [
        { keys: ["J"], description: "Next message" },
        { keys: ["K"], description: "Previous message" },
        { keys: ["H"], description: "Handled (eller filter Handled utan valt meddelande)" },
        { keys: ["R"], description: "Reply (fokus)" },
        { keys: ["N"], description: "Next open" },
        { keys: ["Q"], description: "Filter: Queue" },
        { keys: ["O"], description: "Filter: Open" },
        { keys: ["A"], description: "Filter: All" },
        { keys: ["/"], description: "Search" },
        { keys: ["Esc"], description: "Close" },
        { keys: [`${modKey}`, "Enter"], description: "Send reply" },
      ],
    },
    {
      id: "reviews",
      title: "Recensioner",
      routes: ["/reviews"],
      shortcuts: [
        { keys: ["J"], description: "Next review" },
        { keys: ["K"], description: "Previous review" },
        { keys: ["M"], description: "Mark replied" },
        { keys: ["D"], description: "Draft (AI)" },
        { keys: ["A"], description: "Filter: All" },
        { keys: ["N"], description: "Filter: Needs reply" },
        { keys: ["/"], description: "Search" },
        { keys: ["Esc"], description: "Close" },
      ],
    },
    {
      id: "activity",
      title: "Aktivitet",
      routes: ["/activity"],
      shortcuts: [
        { keys: ["J"], description: "Next event" },
        { keys: ["K"], description: "Previous event" },
        { keys: ["/"], description: "Search" },
        { keys: ["E"], description: "Filter: Error" },
        { keys: ["W"], description: "Filter: Warning" },
        { keys: ["Esc"], description: "Close" },
      ],
    },
    {
      id: "sales",
      title: "Sales",
      routes: ["/sales"],
      shortcuts: [
        { keys: ["/"], description: "Search" },
        { keys: ["J"], description: "Next (outreach / follow-up)" },
        { keys: ["K"], description: "Previous (outreach / follow-up)" },
        { keys: ["S"], description: "Sent (outreach-kö)" },
        { keys: ["O"], description: "Outreach draft (uppföljningar)" },
      ],
    },
    {
      id: "tasks",
      title: "Uppgifter",
      routes: ["/tasks"],
      shortcuts: [
        { keys: ["/"], description: "Search" },
        { keys: ["N"], description: "New task" },
        { keys: ["J"], description: "Next card" },
        { keys: ["K"], description: "Previous card" },
        { keys: ["E"], description: "Edit focused card" },
        { keys: ["A"], description: "Filter: All" },
        { keys: ["O"], description: "Filter: Overdue" },
        { keys: ["T"], description: "Filter: Today" },
      ],
    },
    {
      id: "customers",
      title: "Kunder",
      routes: ["/customers"],
      shortcuts: [
        { keys: ["J"], description: "Next customer" },
        { keys: ["K"], description: "Previous customer" },
        { keys: ["/"], description: "Search" },
        { keys: ["Esc"], description: "Close" },
      ],
    },
    {
      id: "content",
      title: "Innehåll",
      routes: ["/content"],
      shortcuts: [
        { keys: ["J"], description: "Next file (Browse)" },
        { keys: ["K"], description: "Previous file (Browse)" },
        { keys: ["/"], description: "Search (Browse)" },
        { keys: ["S"], description: "Select / toggle file" },
      ],
    },
    {
      id: "automations",
      title: "Automationer",
      routes: ["/automations"],
      shortcuts: [
        { keys: ["F"], description: "Failed runs (scroll to list)" },
      ],
    },
    {
      id: "marketing",
      title: "Marketing",
      routes: ["/marketing"],
      shortcuts: [
        { keys: ["J"], description: "Next campaign" },
        { keys: ["K"], description: "Previous campaign" },
        { keys: ["N"], description: "New campaign" },
        { keys: ["E"], description: "Edit focused campaign" },
      ],
    },
    {
      id: "calendar",
      title: "Kalender",
      routes: ["/calendar"],
      shortcuts: [
        { keys: ["J"], description: "Next event (selected day)" },
        { keys: ["K"], description: "Previous event (selected day)" },
        { keys: ["O"], description: "Open focused event" },
      ],
    },
  ];
}
