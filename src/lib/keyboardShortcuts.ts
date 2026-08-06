import { navItems, topNavItems, type TopNavItem } from "@/components/navConfig";
import { t } from "@/lib/i18n";

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
  { key: "h", url: "/" },
  { key: "t", url: "/tasks" },
  { key: "m", url: "/messages" },
  { key: "s", url: "/sales", modes: ["business"] },
  { key: "c", url: "/company", modes: ["business"] },
  { key: "e", url: "/ecommerce", modes: ["business"] },
  { key: "i", url: "/intelligence" },
  { key: "p", url: "/preferences" },
  { key: "u", url: "/handbook" },
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
  if (pathname === "/") return t("nav.home");
  const item = ALL_NAV.find((entry) => entry.url === pathname);
  if (item) return t(`nav.${item.key}`);
  const prefix = ALL_NAV.find(
    (entry) => entry.url !== "/" && pathname.startsWith(`${entry.url}/`)
  );
  return prefix ? t(`nav.${prefix.key}`) : pathname;
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
      title: t("shortcuts:sections.global"),
      shortcuts: [
        { keys: [`${modKey}`, "K"], description: t("shortcuts:global.palette") },
        { keys: ["G", "H"], description: t("shortcuts:global.home") },
        { keys: ["G", "T"], description: t("shortcuts:global.tasks") },
        { keys: ["G", "M"], description: t("shortcuts:global.messages") },
        { keys: ["G", "S"], description: t("shortcuts:global.sales") },
        { keys: ["G", "C"], description: t("shortcuts:global.company") },
        { keys: ["G", "E"], description: t("shortcuts:global.ecommerce") },
        { keys: ["G", "I"], description: t("shortcuts:global.intelligence") },
        { keys: ["G", "P"], description: t("shortcuts:global.preferences") },
        { keys: ["G", "U"], description: t("shortcuts:global.handbook") },
        { keys: ["?"], description: t("shortcuts:global.help") },
        { keys: [`${modKey}`, "B"], description: t("shortcuts:global.sidebar") },
      ],
    },
    {
      id: "ecommerce",
      title: t("shortcuts:sections.ecommerce"),
      routes: ["/ecommerce"],
      shortcuts: [
        { keys: ["O"], description: t("shortcuts:ecommerce.overview") },
        { keys: ["R"], description: t("shortcuts:ecommerce.orders") },
        { keys: ["P"], description: t("shortcuts:ecommerce.products") },
        { keys: ["I"], description: t("shortcuts:ecommerce.insights") },
        { keys: ["U"], description: t("shortcuts:ecommerce.unfulfilled") },
        { keys: ["B"], description: t("shortcuts:ecommerce.pending") },
      ],
    },
    {
      id: "messages",
      title: t("shortcuts:sections.messages"),
      routes: ["/messages"],
      shortcuts: [
        { keys: ["J"], description: t("shortcuts:messages.next") },
        { keys: ["K"], description: t("shortcuts:messages.prev") },
        { keys: ["H"], description: t("shortcuts:messages.handled") },
        { keys: ["R"], description: t("shortcuts:messages.reply") },
        { keys: ["N"], description: t("shortcuts:messages.nextOpen") },
        { keys: ["Q"], description: t("shortcuts:messages.filterQueue") },
        { keys: ["O"], description: t("shortcuts:messages.filterOpen") },
        { keys: ["A"], description: t("shortcuts:messages.filterAll") },
        { keys: ["/"], description: t("shortcuts:messages.search") },
        { keys: ["Esc"], description: t("shortcuts:messages.close") },
        { keys: [`${modKey}`, "Enter"], description: t("shortcuts:messages.send") },
      ],
    },
    {
      id: "reviews",
      title: t("shortcuts:sections.reviews"),
      routes: ["/reviews"],
      shortcuts: [
        { keys: ["J"], description: t("shortcuts:reviews.next") },
        { keys: ["K"], description: t("shortcuts:reviews.prev") },
        { keys: ["M"], description: t("shortcuts:reviews.markReplied") },
        { keys: ["D"], description: t("shortcuts:reviews.aiDraft") },
        { keys: ["A"], description: t("shortcuts:reviews.filterAll") },
        { keys: ["N"], description: t("shortcuts:reviews.filterNeeds") },
        { keys: ["/"], description: t("shortcuts:reviews.search") },
        { keys: ["Esc"], description: t("shortcuts:reviews.close") },
      ],
    },
    {
      id: "activity",
      title: t("shortcuts:sections.activity"),
      routes: ["/activity"],
      shortcuts: [
        { keys: ["J"], description: t("shortcuts:activity.next") },
        { keys: ["K"], description: t("shortcuts:activity.prev") },
        { keys: ["/"], description: t("shortcuts:activity.search") },
        { keys: ["E"], description: t("shortcuts:activity.filterError") },
        { keys: ["W"], description: t("shortcuts:activity.filterWarn") },
        { keys: ["Esc"], description: t("shortcuts:activity.close") },
      ],
    },
    {
      id: "sales",
      title: t("shortcuts:sections.sales"),
      routes: ["/sales"],
      shortcuts: [
        { keys: ["/"], description: t("shortcuts:sales.search") },
        { keys: ["J"], description: t("shortcuts:sales.next") },
        { keys: ["K"], description: t("shortcuts:sales.prev") },
        { keys: ["S"], description: t("shortcuts:sales.markSent") },
        { keys: ["O"], description: t("shortcuts:sales.outreachDraft") },
      ],
    },
    {
      id: "tasks",
      title: t("shortcuts:sections.tasks"),
      routes: ["/tasks"],
      shortcuts: [
        { keys: ["/"], description: t("shortcuts:tasks.search") },
        { keys: ["N"], description: t("shortcuts:tasks.new") },
        { keys: ["J"], description: t("shortcuts:tasks.next") },
        { keys: ["K"], description: t("shortcuts:tasks.prev") },
        { keys: ["E"], description: t("shortcuts:tasks.edit") },
        { keys: ["A"], description: t("shortcuts:tasks.filterAll") },
        { keys: ["O"], description: t("shortcuts:tasks.filterOverdue") },
        { keys: ["T"], description: t("shortcuts:tasks.filterToday") },
      ],
    },
    {
      id: "customers",
      title: t("shortcuts:sections.customers"),
      routes: ["/customers"],
      shortcuts: [
        { keys: ["J"], description: t("shortcuts:customers.next") },
        { keys: ["K"], description: t("shortcuts:customers.prev") },
        { keys: ["/"], description: t("shortcuts:customers.search") },
        { keys: ["Esc"], description: t("shortcuts:customers.close") },
      ],
    },
    {
      id: "content",
      title: t("shortcuts:sections.content"),
      routes: ["/content"],
      shortcuts: [
        { keys: ["J"], description: t("shortcuts:content.next") },
        { keys: ["K"], description: t("shortcuts:content.prev") },
        { keys: ["/"], description: t("shortcuts:content.search") },
        { keys: ["S"], description: t("shortcuts:content.select") },
      ],
    },
    {
      id: "automations",
      title: t("shortcuts:sections.automations"),
      routes: ["/automations"],
      shortcuts: [
        { keys: ["F"], description: t("shortcuts:automations.failed") },
      ],
    },
    {
      id: "marketing",
      title: t("shortcuts:sections.marketing"),
      routes: ["/marketing"],
      shortcuts: [
        { keys: ["J"], description: t("shortcuts:marketing.next") },
        { keys: ["K"], description: t("shortcuts:marketing.prev") },
        { keys: ["N"], description: t("shortcuts:marketing.new") },
        { keys: ["E"], description: t("shortcuts:marketing.edit") },
      ],
    },
    {
      id: "calendar",
      title: t("shortcuts:sections.calendar"),
      routes: ["/calendar"],
      shortcuts: [
        { keys: ["J"], description: t("shortcuts:calendar.next") },
        { keys: ["K"], description: t("shortcuts:calendar.prev") },
        { keys: ["O"], description: t("shortcuts:calendar.open") },
      ],
    },
  ];
}
