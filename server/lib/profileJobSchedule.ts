/**
 * Per-profile automation schedules stored in `automation_settings.job_schedules`.
 *
 * Vercel Cron runs at fixed UTC intervals; each handler gates per tenant using
 * these settings (local timezone, weekdays, and spread run times).
 */

export interface ProfileJobSchedule {
  enabled: boolean;
  /** IANA timezone, e.g. Europe/Stockholm */
  timezone: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday */
  days: number[];
  /** How many times per selected day (1–6). */
  timesPerDay: number;
  /** First run time in local timezone, "HH:MM". */
  startTime: string;
  /** Last run time in local timezone; times are spread evenly between start and end. */
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

/** Default schedules for each automation key (before legacy enable flags). */
export const DEFAULT_SCHEDULES_BY_KEY: Record<string, Partial<ProfileJobSchedule>> = {
  "auto-reply": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 2,
    startTime: "09:00",
    endTime: "17:00",
    enabled: false,
  },
  "daily-digest": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 1,
    startTime: "07:00",
    endTime: "07:00",
    enabled: false,
  },
  "weekly-report": {
    days: [1],
    timesPerDay: 1,
    startTime: "08:00",
    endTime: "08:00",
    enabled: false,
  },
  "marketing-alerts": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 1,
    startTime: "08:00",
    endTime: "08:00",
    enabled: false,
  },
  "lead-reminder": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 1,
    startTime: "09:00",
    endTime: "09:00",
    enabled: false,
  },
  "task-reminder": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 1,
    startTime: "09:00",
    endTime: "09:00",
    enabled: false,
  },
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
  "social-stats-snapshot": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "02:30",
    endTime: "02:30",
    enabled: true,
  },
  "publish-scheduled-posts": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "00:00",
    endTime: "23:59",
    enabled: true,
  },
  "instagram-drive-queue": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "09:00",
    endTime: "09:00",
    enabled: false,
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
  "mail-reply-auto": {
    days: [1, 2, 3, 4, 5],
    timesPerDay: 1,
    startTime: "09:00",
    endTime: "09:00",
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
  "post-purchase-review-request": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "12:00",
    endTime: "12:00",
    enabled: false,
  },
  "customer-winback": {
    days: [1],
    timesPerDay: 1,
    startTime: "13:00",
    endTime: "13:00",
    enabled: false,
  },
  "product-content-automation": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "10:30",
    endTime: "10:30",
    enabled: false,
  },
  "fortnox-invoice-suggest": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "14:00",
    endTime: "14:00",
    enabled: false,
  },
  "fortnox-payment-sync": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "14:30",
    endTime: "14:30",
    enabled: false,
  },
  "fortnox-refund-credit-suggest": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "15:00",
    endTime: "15:00",
    enabled: false,
  },
  "low-stock-alert": {
    days: [1, 2, 3, 4, 5, 6, 7],
    timesPerDay: 1,
    startTime: "08:00",
    endTime: "08:00",
    enabled: false,
  },
};

export interface LegacyAutomationFlags {
  dmAutoReplyEnabled?: boolean;
  dailyDigestEnabled?: boolean;
  marketingAlertsEnabled?: boolean;
}

export function parseJobSchedulesJson(
  raw: unknown,
  legacy?: LegacyAutomationFlags
): JobSchedulesMap {
  const stored =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out: JobSchedulesMap = {};
  for (const [key, defaults] of Object.entries(DEFAULT_SCHEDULES_BY_KEY)) {
    out[key] = normaliseProfileJobSchedule(stored[key], defaults);
  }
  if (legacy) {
    if (legacy.dmAutoReplyEnabled != null) {
      out["auto-reply"] = { ...out["auto-reply"], enabled: Boolean(legacy.dmAutoReplyEnabled) };
    }
    if (legacy.dailyDigestEnabled != null) {
      out["daily-digest"] = { ...out["daily-digest"], enabled: Boolean(legacy.dailyDigestEnabled) };
      out["weekly-report"] = { ...out["weekly-report"], enabled: Boolean(legacy.dailyDigestEnabled) };
    }
    if (legacy.marketingAlertsEnabled != null) {
      out["marketing-alerts"] = {
        ...out["marketing-alerts"],
        enabled: Boolean(legacy.marketingAlertsEnabled),
      };
    }
  }
  return out;
}

export function jobSchedulesToJson(map: JobSchedulesMap): Record<string, ProfileJobSchedule> {
  return { ...map };
}

/** Spread run times evenly between start and end (inclusive). */
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

interface LocalParts {
  weekday: number;
  hour: number;
  minute: number;
}

function localPartsInTimezone(date: Date, timezone: string): LocalParts | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    const weekdayMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    const weekday = weekdayMap[weekdayStr];
    if (!weekday || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return { weekday, hour, minute };
  } catch {
    return null;
  }
}

/**
 * True when `now` falls in a scheduled run window for this profile.
 * `windowMinutes` should match the cron interval (15 for quarter-hourly, 60 for hourly).
 */
export function isProfileJobDue(
  schedule: ProfileJobSchedule,
  now: Date = new Date(),
  windowMinutes = 60
): boolean {
  if (!schedule.enabled) return false;
  const local = localPartsInTimezone(now, schedule.timezone);
  if (!local) return false;
  if (!schedule.days.includes(local.weekday)) return false;
  const nowMin = local.hour * 60 + local.minute;
  for (const slot of expandRunTimes(schedule)) {
    const parsed = parseTime(slot);
    if (!parsed) continue;
    const slotMin = parsed.hours * 60 + parsed.minutes;
    if (nowMin >= slotMin && nowMin < slotMin + windowMinutes) return true;
  }
  return false;
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

/** Next run strictly after `from` for a profile schedule (approximate, 1-min steps). */
export function computeNextProfileRun(
  schedule: ProfileJobSchedule,
  from: Date = new Date()
): Date | null {
  if (!schedule.enabled) return null;
  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const maxMinutes = 366 * 24 * 60;
  for (let i = 0; i < maxMinutes; i += 1) {
    if (isProfileJobDue(schedule, candidate, 1)) return new Date(candidate.getTime());
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

export function cronWindowMinutesForKey(key: string): number {
  if (key === "auto-reply" || key === "publish-scheduled-posts") return 15;
  if (key === "engagement-followup") return 60;
  return 60;
}

export function isJobEnabledForProfile(
  key: string,
  schedules: JobSchedulesMap,
  legacy?: LegacyAutomationFlags
): boolean {
  const schedule = schedules[key];
  if (schedule) return schedule.enabled;
  if (key === "auto-reply") return Boolean(legacy?.dmAutoReplyEnabled);
  if (key === "daily-digest" || key === "weekly-report") return Boolean(legacy?.dailyDigestEnabled);
  if (key === "marketing-alerts") return Boolean(legacy?.marketingAlertsEnabled);
  const defaults = DEFAULT_SCHEDULES_BY_KEY[key];
  return Boolean(defaults?.enabled);
}

export function shouldRunProfileJob(
  key: string,
  schedules: JobSchedulesMap,
  legacy: LegacyAutomationFlags | undefined,
  now: Date
): boolean {
  if (!isJobEnabledForProfile(key, schedules, legacy)) return false;
  const schedule = schedules[key] ?? normaliseProfileJobSchedule(null, DEFAULT_SCHEDULES_BY_KEY[key]);
  return isProfileJobDue(schedule, now, cronWindowMinutesForKey(key));
}
