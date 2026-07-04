/**
 * Client mirror of server/lib/profileJobSchedule.ts — keep in sync when changing
 * the schedule model or defaults.
 */

export interface ProfileJobSchedule {
  enabled: boolean;
  timezone: string;
  days: number[];
  timesPerDay: number;
  startTime: string;
  endTime: string;
}

export type JobSchedulesMap = Record<string, ProfileJobSchedule>;

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const WEEKDAY_LABELS_SV: Record<number, string> = {
  1: "Mån",
  2: "Tis",
  3: "Ons",
  4: "Tor",
  5: "Fre",
  6: "Lör",
  7: "Sön",
};

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function parseTime(value: string): { hours: number; minutes: number } | null {
  const m = TIME_RE.exec(String(value || "").trim());
  if (!m) return null;
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

function clampTimesPerDay(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.round(n)));
}

function clampDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [1, 2, 3, 4, 5];
  const allowed = new Set<number>();
  for (const d of days) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 1 && n <= 7) allowed.add(n);
  }
  return allowed.size > 0 ? [...allowed].sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

function defaultEndTime(startTime: string): string {
  const start = parseTime(startTime);
  if (!start) return "17:00";
  const total = start.hours * 60 + start.minutes + 8 * 60;
  const capped = Math.min(total, 20 * 60);
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normaliseProfileJobSchedule(
  raw: unknown,
  fallback?: Partial<ProfileJobSchedule>
): ProfileJobSchedule {
  const base = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fb = fallback ?? {};
  const startTime =
    parseTime(String(base.startTime ?? fb.startTime ?? "09:00")) != null
      ? String(base.startTime ?? fb.startTime ?? "09:00").trim()
      : "09:00";
  const endCandidate = String(base.endTime ?? fb.endTime ?? defaultEndTime(startTime)).trim();
  const endTime = parseTime(endCandidate) ? endCandidate : defaultEndTime(startTime);
  const tz = String(base.timezone ?? fb.timezone ?? "Europe/Stockholm").trim() || "Europe/Stockholm";
  return {
    enabled: Boolean(base.enabled ?? fb.enabled ?? false),
    timezone: tz,
    days: clampDays(base.days ?? fb.days),
    timesPerDay: clampTimesPerDay(Number(base.timesPerDay ?? fb.timesPerDay ?? 1)),
    startTime,
    endTime,
  };
}

export const DEFAULT_SCHEDULES_BY_KEY: Record<string, Partial<ProfileJobSchedule>> = {
  "auto-reply": { days: [1, 2, 3, 4, 5], timesPerDay: 2, startTime: "09:00", endTime: "17:00", enabled: false },
  "daily-digest": { days: [1, 2, 3, 4, 5], timesPerDay: 1, startTime: "07:00", endTime: "07:00", enabled: false },
  "weekly-report": { days: [1], timesPerDay: 1, startTime: "08:00", endTime: "08:00", enabled: false },
  "marketing-alerts": { days: [1, 2, 3, 4, 5], timesPerDay: 1, startTime: "08:00", endTime: "08:00", enabled: false },
  "lead-reminder": { days: [1, 2, 3, 4, 5], timesPerDay: 1, startTime: "09:00", endTime: "09:00", enabled: false },
  "task-reminder": { days: [1, 2, 3, 4, 5], timesPerDay: 1, startTime: "09:00", endTime: "09:00", enabled: false },
  "refresh-ai-recommendations": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "06:00",
    endTime: "06:00",
    enabled: true,
  },
  "marketing-snapshot": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "03:00",
    endTime: "03:00",
    enabled: true,
  },
  "market-pulse-snapshot": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "05:00",
    endTime: "05:00",
    enabled: true,
  },
  "publish-scheduled-posts": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "00:00",
    endTime: "23:59",
    enabled: true,
  },
  "sales-outreach-auto": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 1,
    startTime: "08:00",
    endTime: "08:00",
    enabled: false,
  },
  "content-pipeline": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "10:00",
    endTime: "10:00",
    enabled: false,
  },
  "cart-recovery": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "11:00",
    endTime: "11:00",
    enabled: false,
  },
  "review-reply-auto": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "09:30",
    endTime: "09:30",
    enabled: false,
  },
  "marketing-actions": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 1,
    startTime: "07:30",
    endTime: "07:30",
    enabled: false,
  },
  "weekly-insight-digest": {
    days: [1],
    timesPerDay: 1,
    startTime: "08:30",
    endTime: "08:30",
    enabled: false,
  },
  "engagement-followup": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 2,
    startTime: "09:00",
    endTime: "17:00",
    enabled: false,
  },
};

export function expandRunTimes(schedule: ProfileJobSchedule): string[] {
  const start = parseTime(schedule.startTime);
  const end = parseTime(schedule.endTime);
  if (!start || !end) return [schedule.startTime];
  const startMin = start.hours * 60 + start.minutes;
  const endMin = end.hours * 60 + end.minutes;
  const n = clampTimesPerDay(schedule.timesPerDay);
  if (n === 1) return [schedule.startTime];
  const span = Math.max(0, endMin - startMin);
  const times: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const offset = n === 1 ? 0 : Math.round((span * i) / (n - 1));
    const total = startMin + offset;
    const h = Math.floor(total / 60);
    const m = total % 60;
    times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return times;
}

export function formatScheduleSummarySv(schedule: ProfileJobSchedule): string {
  const dayPart =
    schedule.days.length === 7
      ? "Varje dag"
      : schedule.days.length === 5 &&
          schedule.days.every((d, i) => d === [1, 2, 3, 4, 5][i])
        ? "Vardagar"
        : schedule.days.map((d) => WEEKDAY_LABELS_SV[d]).join(", ");
  const times = expandRunTimes(schedule);
  const timesPart =
    schedule.timesPerDay === 1
      ? `kl. ${times[0]}`
      : `${schedule.timesPerDay} ggr/dag (${times.join(", ")})`;
  return `${dayPart}, ${timesPart}`;
}

export function defaultScheduleForKey(key: string): ProfileJobSchedule {
  return normaliseProfileJobSchedule(null, DEFAULT_SCHEDULES_BY_KEY[key]);
}

export const SCHEDULABLE_CRON_KEYS = Object.keys(DEFAULT_SCHEDULES_BY_KEY);
