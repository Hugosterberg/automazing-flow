/**
 * Client-side inbox triage — maps messages into actionable buckets.
 *
 * Taxonomy (capped at 4, action-oriented — see ai/ROADMAP parked "Inbox triage"):
 *   today   — reply today (person + request / urgency)
 *   week    — reply this week (real conversation, less urgent)
 *   fyi     — worth knowing, no reply expected
 *   noise   — newsletters, noreply, bulk, receipts
 *
 * Pure heuristics on fields we already have (from/subject/snippet/body/kind).
 * No headers API, no DB — overrides can be layered later via local prefs.
 */
import type { UnifiedMessage } from "./types";

export type TriageBucket = "today" | "week" | "fyi" | "noise";

export type TriageResult = {
  bucket: TriageBucket;
  /** Higher = show earlier within the same bucket. */
  score: number;
  reason: string;
};

export const TRIAGE_BUCKET_ORDER: TriageBucket[] = ["today", "week", "fyi", "noise"];

export const TRIAGE_BUCKET_LABELS: Record<TriageBucket, string> = {
  today: "Idag",
  week: "Denna vecka",
  fyi: "FYI",
  noise: "Brus",
};

export const TRIAGE_BUCKET_HINTS: Record<TriageBucket, string> = {
  today: "Svara idag",
  week: "Svara denna vecka",
  fyi: "Ingen åtgärd",
  noise: "Nyhetsbrev / automail",
};

const NOREPLY_RE = /\b(no[-_.]?reply|donotreply|do[-_.]?not[-_.]?reply|noreply)\b/i;
const BULK_SENDER_RE =
  /\b(newsletter|news|updates?|notifications?|alerts?|marketing|promo|digest|mailer|campaign)\b/i;
const UNSUBSCRIBE_RE = /\b(unsubscribe|avregistrera|avprenumerera|opt[- ]?out|manage preferences|email preferences)\b/i;
const VIEW_IN_BROWSER_RE = /\b(view in browser|visa i webbläsare|view this email in)\b/i;
const RECEIPT_RE =
  /\b(receipt|kvitto|order confirmation|orderbekräftelse|invoice|faktura|shipping|leverans|tracking|your order|din order)\b/i;
const URGENT_RE =
  /\b(urgent|asap|as soon as possible|deadline|by eod|by end of day|today|imorgon|idag|snarast|akut|brådskande|asap|time[- ]sensitive)\b/i;
const QUESTION_RE =
  /\?|\b(can you|could you|please|vänligen|kan du|skulle du|behöver|need you to|let me know|hör av dig)\b/i;
const MEETING_RE =
  /\b(meeting|möte|call|zoom|teams|calendar|kalender|boka|schedule|availability|tillgänglig)\b/i;

function textBlob(msg: UnifiedMessage): string {
  return [msg.subject, msg.snippet, msg.body?.slice(0, 800)].filter(Boolean).join("\n");
}

function senderBlob(msg: UnifiedMessage): string {
  return `${msg.from.email || ""} ${msg.from.name || ""}`.toLowerCase();
}

function linkDensity(text: string): number {
  const links = text.match(/https?:\/\//gi)?.length ?? 0;
  const len = Math.max(text.length, 1);
  return links / (len / 400);
}

/**
 * Classify a single unified message into a triage bucket.
 * DMs default toward action buckets (people messaging you expect a reply).
 */
export function classifyMessageTriage(msg: UnifiedMessage): TriageResult {
  const sender = senderBlob(msg);
  const text = textBlob(msg);
  const lower = text.toLowerCase();

  // --- Noise ceiling (never escalate bulk into "today") ---
  const noiseSignals: string[] = [];
  if (NOREPLY_RE.test(sender) || NOREPLY_RE.test(msg.from.email || "")) {
    noiseSignals.push("noreply");
  }
  if (BULK_SENDER_RE.test(sender)) noiseSignals.push("bulk-sender");
  if (UNSUBSCRIBE_RE.test(lower)) noiseSignals.push("unsubscribe");
  if (VIEW_IN_BROWSER_RE.test(lower)) noiseSignals.push("view-in-browser");
  if (RECEIPT_RE.test(lower) && (NOREPLY_RE.test(sender) || linkDensity(text) > 1.5)) {
    noiseSignals.push("receipt");
  }
  if (linkDensity(text) >= 3 && UNSUBSCRIBE_RE.test(lower)) {
    noiseSignals.push("link-heavy");
  }

  const isBulk = noiseSignals.length >= 2 || (noiseSignals.includes("noreply") && noiseSignals.includes("unsubscribe"));

  if (isBulk || noiseSignals.includes("receipt")) {
    return {
      bucket: "noise",
      score: msg.isUnread ? 10 : 0,
      reason: noiseSignals[0] ? `Automatiskt / brus (${noiseSignals[0]})` : "Brus",
    };
  }

  // Soft noise: one signal only → FYI, not action
  if (noiseSignals.length === 1 && msg.kind === "email") {
    return {
      bucket: "fyi",
      score: msg.isUnread ? 20 : 5,
      reason: `Ser automatiskt ut (${noiseSignals[0]})`,
    };
  }

  // --- Action scoring ---
  let score = 0;
  const reasons: string[] = [];

  if (msg.kind === "dm") {
    score += 40;
    reasons.push("DM");
  }
  if (msg.isUnread) {
    score += 25;
    reasons.push("oläst");
  }
  if (msg.isStarred) {
    score += 30;
    reasons.push("flaggad");
  }

  if (URGENT_RE.test(lower)) {
    score += 45;
    reasons.push("brådskande");
  }
  if (QUESTION_RE.test(text)) {
    score += 25;
    reasons.push("fråga");
  }
  if (MEETING_RE.test(lower)) {
    score += 20;
    reasons.push("möte");
  }

  // Person-looking sender (not a role mailbox)
  const emailLocal = (msg.from.email || "").split("@")[0] || "";
  if (emailLocal && !NOREPLY_RE.test(emailLocal) && !BULK_SENDER_RE.test(emailLocal) && /[._-]/.test(emailLocal) === false) {
    // single-token local part can still be a person; boost lightly for DMs/unread
    if (msg.kind === "dm" || msg.isUnread) score += 5;
  } else if (/^[a-z]+\.[a-z]+$/i.test(emailLocal)) {
    score += 15;
    reasons.push("person");
  }

  const ageHours = Math.max(0, (Date.now() - (Date.parse(msg.date) || Date.now())) / 3_600_000);
  if (ageHours < 24) score += 15;
  else if (ageHours < 72) score += 8;
  else if (ageHours > 14 * 24) score -= 10;

  if (score >= 70) {
    return {
      bucket: "today",
      score,
      reason: reasons.slice(0, 2).join(" · ") || "Behöver svar idag",
    };
  }
  if (score >= 35 || msg.kind === "dm") {
    return {
      bucket: "week",
      score,
      reason: reasons.slice(0, 2).join(" · ") || "Svara denna vecka",
    };
  }
  if (score >= 15 || msg.isUnread) {
    return {
      bucket: "fyi",
      score,
      reason: reasons[0] || "Värt att känna till",
    };
  }
  return {
    bucket: "noise",
    score,
    reason: "Låg signal",
  };
}

export function triageBucketRank(bucket: TriageBucket): number {
  return TRIAGE_BUCKET_ORDER.indexOf(bucket);
}

/** Sort: today → week → fyi → noise, then by score desc, then oldest open first. */
export function compareByTriage(a: UnifiedMessage, b: UnifiedMessage): number {
  const ta = classifyMessageTriage(a);
  const tb = classifyMessageTriage(b);
  const bucketDiff = triageBucketRank(ta.bucket) - triageBucketRank(tb.bucket);
  if (bucketDiff !== 0) return bucketDiff;
  if (tb.score !== ta.score) return tb.score - ta.score;
  const aDate = Date.parse(a.date) || 0;
  const bDate = Date.parse(b.date) || 0;
  // Within "today/week", older unanswered first (waited longer)
  if (ta.bucket === "today" || ta.bucket === "week") return aDate - bDate;
  return bDate - aDate;
}

export function countByTriageBucket(
  messages: UnifiedMessage[]
): Record<TriageBucket, number> {
  const counts: Record<TriageBucket, number> = {
    today: 0,
    week: 0,
    fyi: 0,
    noise: 0,
  };
  for (const msg of messages) {
    counts[classifyMessageTriage(msg).bucket] += 1;
  }
  return counts;
}

export function isTriageBucket(value: string | null | undefined): value is TriageBucket {
  return value === "today" || value === "week" || value === "fyi" || value === "noise";
}
