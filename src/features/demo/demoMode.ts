/** Profile document key — client-only sandbox, no new DB tables. */
export const DEMO_MODE_DOC_KEY = "demo-mode";

export const DEMO_ID_PREFIX = "demo-";

export type DemoDmDraft = {
  id: string;
  kind: "dm";
  conversation_id: string | null;
  platform: string | null;
  author_name: string | null;
  incoming_text: string | null;
  draft_text: string | null;
  status: "drafted" | "sent" | "failed";
  error: string | null;
  created_at: string;
};

export type DemoModeDoc = {
  enabled?: boolean;
  seededAt?: string | null;
  /** Mutable DM draft queue for sandbox (API has no demo rows). */
  dmDrafts?: DemoDmDraft[];
};

export function isDemoId(id: string | null | undefined): boolean {
  return Boolean(id && String(id).startsWith(DEMO_ID_PREFIX));
}

export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
