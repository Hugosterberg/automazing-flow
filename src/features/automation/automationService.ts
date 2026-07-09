/**
 * Client for the auto-reply automation endpoints (server: automationRoutes).
 * All calls are scoped to a business profile via `business_profile_id`.
 */

import { apiJson } from "@/lib/apiJson";
import type { JobSchedulesMap } from "@/lib/profileJobSchedule";

export interface AutomationSettings {
  dmAutoReplyEnabled: boolean;
  dmAutoReplyMode: "draft" | "send";
  tone: string;
  language: string;
  instructions: string;
  dailyDigestEnabled: boolean;
  marketingAlertsEnabled: boolean;
  /** Where automated updates are emailed; empty = fall back to profile/owner email. */
  notificationEmail: string;
  jobSchedules: JobSchedulesMap;
}

export interface AutoReplyLogEntry {
  id: string;
  kind: "dm" | "review";
  conversation_id: string | null;
  platform: string | null;
  author_name: string | null;
  incoming_text: string | null;
  draft_text: string | null;
  status: "drafted" | "sent" | "failed";
  error: string | null;
  created_at: string;
}

export interface AutoReplyRunSummary {
  scanned: number;
  drafted: number;
  sent: number;
  failed: number;
  skipped: number;
  note?: string;
  errors: string[];
}

/** One automation's last recorded run (null = it has never run). */
export interface AutomationLastRun {
  status: "ok" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  /** Short result summary the job reported (e.g. { sent, skipped, failed }). */
  result: Record<string, unknown>;
  errorMessage: string | null;
}

/** Run status for one scheduled automation (keyed by its cron key). */
export interface AutomationRunStatus {
  key: string;
  /** Cron expression mirroring vercel.json. */
  cron: string;
  /** ISO timestamp of the next scheduled run (null if unknown/unschedulable). */
  nextRunAt: string | null;
  lastRun: AutomationLastRun | null;
}

export async function fetchAutomationSettings(
  businessProfileId: string
): Promise<{ storeEnabled: boolean; settings: AutomationSettings }> {
  return apiJson(
    `/api/automation/settings?business_profile_id=${encodeURIComponent(businessProfileId)}`,
    "Could not load automation settings."
  );
}

export async function saveAutomationSettings(
  businessProfileId: string,
  settings: Partial<AutomationSettings> & { jobSchedules?: JobSchedulesMap }
): Promise<{ ok: boolean; settings: AutomationSettings }> {
  return apiJson("/api/automation/settings", "Could not save automation settings.", {
    method: "PUT",
    body: { business_profile_id: businessProfileId, ...settings },
  });
}

export async function fetchAutoReplyLog(
  businessProfileId: string,
  limit = 25
): Promise<{ entries: AutoReplyLogEntry[] }> {
  return apiJson(
    `/api/automation/log?business_profile_id=${encodeURIComponent(businessProfileId)}&limit=${limit}`,
    "Could not load the automation log."
  );
}

export async function sendAutomationDraft(
  businessProfileId: string,
  logId: string,
  message?: string
): Promise<{ ok: boolean }> {
  return apiJson("/api/automation/send-draft", "Could not send the draft.", {
    body: { business_profile_id: businessProfileId, logId, ...(message ? { message } : {}) },
  });
}

export async function fetchAutomationRuns(
  businessProfileId: string
): Promise<{ runs: AutomationRunStatus[] }> {
  return apiJson(
    `/api/automation/runs?business_profile_id=${encodeURIComponent(businessProfileId)}`,
    "Could not load automation run status."
  );
}

export async function runAutomationNow(
  businessProfileId: string
): Promise<{ ok: boolean; summary: AutoReplyRunSummary }> {
  return apiJson("/api/automation/run", "Could not run the automation.", {
    body: { business_profile_id: businessProfileId },
  });
}

/** Retry a failed scheduled automation (server re-runs the cron job on demand). */
export async function retryAutomation(
  businessProfileId: string,
  key: string
): Promise<{ ok: boolean; key: string }> {
  return apiJson("/api/automation/retry", "Could not retry the automation.", {
    body: { business_profile_id: businessProfileId, key },
    timeoutMs: 150_000,
  });
}
