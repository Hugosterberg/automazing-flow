/**
 * Client for the auto-reply automation endpoints (server: automationRoutes).
 * All calls are scoped to a business profile via `business_profile_id`.
 */

import { apiUrl } from "@/lib/apiBase";

export interface AutomationSettings {
  dmAutoReplyEnabled: boolean;
  dmAutoReplyMode: "draft" | "send";
  tone: string;
  language: string;
  instructions: string;
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

async function parseOrThrow<T>(res: Response, fallbackError: string): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || payload?.error || fallbackError);
  }
  return payload as T;
}

export async function fetchAutomationSettings(
  businessProfileId: string
): Promise<{ storeEnabled: boolean; settings: AutomationSettings }> {
  const res = await fetch(
    apiUrl(`/api/automation/settings?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include" }
  );
  return parseOrThrow(res, "Could not load automation settings.");
}

export async function saveAutomationSettings(
  businessProfileId: string,
  settings: AutomationSettings
): Promise<{ ok: boolean; settings: AutomationSettings }> {
  const res = await fetch(apiUrl("/api/automation/settings"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, ...settings }),
  });
  return parseOrThrow(res, "Could not save automation settings.");
}

export async function fetchAutoReplyLog(
  businessProfileId: string,
  limit = 25
): Promise<{ entries: AutoReplyLogEntry[] }> {
  const res = await fetch(
    apiUrl(
      `/api/automation/log?business_profile_id=${encodeURIComponent(businessProfileId)}&limit=${limit}`
    ),
    { credentials: "include" }
  );
  return parseOrThrow(res, "Could not load the automation log.");
}

export async function sendAutomationDraft(
  businessProfileId: string,
  logId: string,
  message?: string
): Promise<{ ok: boolean }> {
  const res = await fetch(apiUrl("/api/automation/send-draft"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId, logId, ...(message ? { message } : {}) }),
  });
  return parseOrThrow(res, "Could not send the draft.");
}

export async function runAutomationNow(
  businessProfileId: string
): Promise<{ ok: boolean; summary: AutoReplyRunSummary }> {
  const res = await fetch(apiUrl("/api/automation/run"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_profile_id: businessProfileId }),
  });
  return parseOrThrow(res, "Could not run the automation.");
}
