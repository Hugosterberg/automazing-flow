import type { CalendarEvent } from "@/types/calendar";
import type { ConnectedAccount } from "@/types/accounts";

const STORAGE_KEY = "automazing-calendar-events";

export function sortCalendarAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const rank = (p: string) => (p === "google_calendar" ? 0 : p === "outlook_calendar" ? 1 : 9);
  const d = rank(a.platform) - rank(b.platform);
  if (d !== 0) return d;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

export function readLegacyEvents(): CalendarEvent[] | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CalendarEvent[]) : undefined;
  } catch {
    return undefined;
  }
}

export function writeLegacyEvents(events: CalendarEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    /* ignore */
  }
}

export function sortByTime(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

export function isExternalEvent(ev: CalendarEvent & { source?: string; readOnly?: boolean }): boolean {
  return ev.source === "external" || Boolean(ev.readOnly);
}

export function localTimeOfIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
