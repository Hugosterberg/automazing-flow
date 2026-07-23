/**
 * Single source of truth for the automation schedules the app runs on Vercel
 * Cron. Mirrors `vercel.json` → `crons` (keep the two in sync when a schedule
 * changes) and adds the metadata the Automations page needs: a stable key
 * (matching the cron path segment and `automation_runs.automation_key`) and the
 * next scheduled run time derived from the cron expression.
 *
 * Timezone: Vercel Cron evaluates expressions in **UTC**, so `computeNextRun`
 * works entirely in UTC. Callers return an absolute ISO timestamp and let the
 * client render it relative to the viewer's locale.
 */

export interface AutomationSchedule {
  /** Matches the cron path segment and `automation_runs.automation_key`. */
  key: string;
  /** Standard 5-field cron expression, mirroring vercel.json. */
  cron: string;
  /** Whether the job does per-tenant work (informational). */
  perTenant: boolean;
}

export const AUTOMATION_SCHEDULES: AutomationSchedule[] = [
  { key: "lead-reminder", cron: "0 * * * *", perTenant: true },
  { key: "task-reminder", cron: "0 * * * *", perTenant: true },
  { key: "cleanup-oauth-pending", cron: "0 4 * * *", perTenant: false },
  { key: "refresh-ai-recommendations", cron: "0 5 * * *", perTenant: true },
  { key: "auto-reply", cron: "*/15 * * * *", perTenant: true },
  { key: "publish-scheduled-posts", cron: "*/15 * * * *", perTenant: true },
  { key: "sales-outreach-auto", cron: "0 8 * * 1-5", perTenant: true },
  { key: "content-pipeline", cron: "0 10 * * *", perTenant: true },
  { key: "cart-recovery", cron: "0 11 * * *", perTenant: true },
  { key: "review-reply-auto", cron: "30 9 * * *", perTenant: true },
  { key: "mail-reply-auto", cron: "0 9 * * *", perTenant: true },
  { key: "marketing-actions", cron: "30 7 * * 1-5", perTenant: true },
  { key: "weekly-insight-digest", cron: "30 8 * * 1", perTenant: true },
  { key: "engagement-followup", cron: "0 10,16 * * 1-5", perTenant: true },
  { key: "daily-digest", cron: "0 6 * * 1-5", perTenant: true },
  { key: "marketing-alerts", cron: "0 7 * * 1-5", perTenant: true },
  { key: "marketing-snapshot", cron: "0 3 * * *", perTenant: true },
  { key: "social-stats-snapshot", cron: "30 2 * * *", perTenant: true },
  { key: "market-pulse-snapshot", cron: "15 5 * * *", perTenant: true },
  { key: "weekly-report", cron: "30 7 * * 1", perTenant: true },
  { key: "post-purchase-review-request", cron: "0 12 * * *", perTenant: true },
  { key: "customer-winback", cron: "0 13 * * 1", perTenant: true },
  { key: "product-content-automation", cron: "30 10 * * *", perTenant: true },
  { key: "fortnox-invoice-suggest", cron: "0 14 * * *", perTenant: true },
  { key: "fortnox-payment-sync", cron: "30 14 * * *", perTenant: true },
  { key: "fortnox-refund-credit-suggest", cron: "0 15 * * *", perTenant: true },
  { key: "low-stock-alert", cron: "0 8 * * *", perTenant: true },
];

export function getSchedule(key: string): AutomationSchedule | undefined {
  return AUTOMATION_SCHEDULES.find((s) => s.key === key);
}

/**
 * Expand a single cron field into the set of integers it allows within
 * [min, max]. Supports wildcards, steps, ranges, range+step and comma lists
 * (e.g. "*", "a-b", "a,b,c", and the star-slash-step / range-slash-step forms)
 * — the syntax used by the app's schedules. Throws on anything it does not
 * understand so a malformed expression fails loudly rather than silently
 * matching nothing.
 */
function expandField(field: string, min: number, max: number): Set<number> {
  const allowed = new Set<number>();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`invalid cron step in "${field}"`);
    }
    let rangeStart = min;
    let rangeEnd = max;
    if (rangePart !== "*") {
      const bounds = rangePart.split("-");
      rangeStart = Number(bounds[0]);
      rangeEnd = bounds.length > 1 ? Number(bounds[1]) : rangeStart;
      if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) {
        throw new Error(`invalid cron range in "${field}"`);
      }
    }
    for (let v = rangeStart; v <= rangeEnd; v += step) {
      if (v >= min && v <= max) allowed.add(v);
    }
  }
  return allowed;
}

interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`expected 5 cron fields, got ${fields.length}: "${expr}"`);
  }
  const [minute, hour, dom, month, dow] = fields;
  return {
    minutes: expandField(minute, 0, 59),
    hours: expandField(hour, 0, 23),
    daysOfMonth: expandField(dom, 1, 31),
    months: expandField(month, 1, 12),
    // 0 and 7 both mean Sunday in cron; normalise 7 → 0.
    daysOfWeek: new Set(
      Array.from(expandField(dow.replace(/7/g, "0"), 0, 6))
    ),
    domRestricted: dom !== "*",
    dowRestricted: dow !== "*",
  };
}

function matches(parsed: ParsedCron, date: Date): boolean {
  if (!parsed.minutes.has(date.getUTCMinutes())) return false;
  if (!parsed.hours.has(date.getUTCHours())) return false;
  if (!parsed.months.has(date.getUTCMonth() + 1)) return false;

  const domOk = parsed.daysOfMonth.has(date.getUTCDate());
  const dowOk = parsed.daysOfWeek.has(date.getUTCDay());
  // POSIX rule: when both day-of-month and day-of-week are restricted, a match
  // on either is enough. When only one is restricted, that one must match.
  if (parsed.domRestricted && parsed.dowRestricted) return domOk || dowOk;
  if (parsed.domRestricted) return domOk;
  if (parsed.dowRestricted) return dowOk;
  return true;
}

/**
 * Next time (UTC) a cron expression fires strictly after `from`. Returns null
 * if the expression is malformed or no match is found within a year (i.e. an
 * impossible schedule) so callers can degrade gracefully.
 */
export function computeNextRun(cron: string, from: Date = new Date()): Date | null {
  let parsed: ParsedCron;
  try {
    parsed = parseCron(cron);
  } catch (err) {
    console.warn(
      "[automationSchedules] bad cron expression:",
      err instanceof Error ? err.message : err
    );
    return null;
  }

  // Start at the next whole minute after `from` (seconds/ms zeroed).
  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  const maxMinutes = 366 * 24 * 60; // one-year safety cap
  for (let i = 0; i < maxMinutes; i += 1) {
    if (matches(parsed, candidate)) return new Date(candidate.getTime());
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

/** Convenience: next run for a known automation key, as an ISO string. */
export function nextRunIso(key: string, from: Date = new Date()): string | null {
  const schedule = getSchedule(key);
  if (!schedule) return null;
  const next = computeNextRun(schedule.cron, from);
  return next ? next.toISOString() : null;
}
