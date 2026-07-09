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

export function buildShortcutSections(modKey: string): ShortcutSection[] {
  return [
    {
      id: "global",
      title: "Globalt",
      shortcuts: [
        { keys: [`${modKey}`, "K"], description: "Kommandopalett — sök sidor och åtgärder" },
        { keys: ["G", "H"], description: "Gå till Hem" },
        { keys: ["G", "T"], description: "Gå till Uppgifter" },
        { keys: ["G", "M"], description: "Gå till Meddelanden" },
        { keys: ["G", "S"], description: "Gå till Försäljning (företagsläge)" },
        { keys: ["G", "C"], description: "Gå till Företag (företagsläge)" },
        { keys: ["G", "I"], description: "Gå till MCP Intelligence" },
        { keys: ["G", "P"], description: "Gå till Inställningar" },
        { keys: ["?"], description: "Visa denna genvägslista" },
        { keys: [`${modKey}`, "B"], description: "Visa/dölj sidopanel" },
      ],
    },
    {
      id: "messages",
      title: "Meddelanden",
      routes: ["/messages"],
      shortcuts: [
        { keys: ["J"], description: "Nästa meddelande" },
        { keys: ["K"], description: "Föregående meddelande" },
        { keys: ["E"], description: "Markera som hanterad" },
        { keys: ["/"], description: "Fokus på sök" },
        { keys: ["Esc"], description: "Stäng meddelande" },
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
        { keys: ["Esc"], description: "Stäng detaljvy" },
      ],
    },
    {
      id: "tasks",
      title: "Uppgifter",
      routes: ["/tasks"],
      shortcuts: [
        { keys: ["Enter"], description: "Öppna markerat kort" },
        { keys: ["Space"], description: "Öppna markerat kort" },
      ],
    },
  ];
}
