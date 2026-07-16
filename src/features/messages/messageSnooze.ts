/**
 * Local snooze map for inbox triage — hide a message until `untilIso`.
 * Stored in a profile document; expired entries are pruned on read.
 */

export type SnoozeMap = Record<string, string>;

export function pruneSnoozeMap(map: SnoozeMap | null | undefined, nowMs = Date.now()): SnoozeMap {
  const out: SnoozeMap = {};
  if (!map || typeof map !== "object") return out;
  for (const [id, until] of Object.entries(map)) {
    const t = Date.parse(until);
    if (Number.isFinite(t) && t > nowMs) out[id] = until;
  }
  return out;
}

export function isSnoozed(map: SnoozeMap, id: string, nowMs = Date.now()): boolean {
  const until = map[id];
  if (!until) return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > nowMs;
}

/** Snooze until local tomorrow 08:00. */
export function snoozeUntilTomorrowMorning(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

/** Snooze until local Monday 08:00 (or next Monday if already weekend/Monday morning passed). */
export function snoozeUntilNextWeek(from = new Date()): string {
  const d = new Date(from);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}
