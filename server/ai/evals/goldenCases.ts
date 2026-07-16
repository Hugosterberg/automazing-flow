/**
 * Golden cases for automation trust (ROADMAP v1).
 *
 * These pin expected *fallback* draft behaviour so prompt/template changes
 * can't silently regress the no-key / OpenAI-down path. LLM output itself is
 * non-deterministic and is not asserted here.
 *
 * Run via: `src/test/aiEvalGolden.test.ts`
 */
import type { ReplyDraftInput } from "../replyDraft.ts";

export type ReplyDraftGolden = {
  id: string;
  input: ReplyDraftInput;
  /** Substrings that MUST appear in the fallback draft (case-insensitive). */
  mustInclude: string[];
  /** Substrings that must NOT appear. */
  mustNotInclude?: string[];
};

export const REPLY_DRAFT_GOLDENS: ReplyDraftGolden[] = [
  {
    id: "dm-basic",
    input: {
      kind: "dm",
      text: "Hej! Är ni öppna imorgon?",
      authorName: "Lisa",
      businessName: "Los Tios",
    },
    mustInclude: ["lisa", "thanks for reaching out"],
  },
  {
    id: "email-basic",
    input: {
      kind: "email",
      text: "Can you send the invoice for order #42?",
      authorName: "Erik Svensson",
    },
    mustInclude: ["erik", "thanks for your email", "best regards"],
  },
  {
    id: "review-positive",
    input: {
      kind: "review",
      text: "Fantastic food and service!",
      authorName: "Anna",
      rating: 5,
    },
    mustInclude: ["anna", "thank you", "good experience"],
  },
  {
    id: "review-critical",
    input: {
      kind: "review",
      text: "Waited 40 minutes for cold food.",
      authorName: "Bo",
      rating: 2,
    },
    mustInclude: ["bo", "thank you"],
    mustNotInclude: ["glad you had a good experience"],
  },
];

/** Digest signal-over-noise: all-clear profiles should produce zero action items. */
export type DigestSkipGolden = {
  id: string;
  unreadDms: number;
  overdueTasks: number;
  connectionIssues: number;
  expectAllClear: boolean;
};

export const DIGEST_SKIP_GOLDENS: DigestSkipGolden[] = [
  {
    id: "all-clear",
    unreadDms: 0,
    overdueTasks: 0,
    connectionIssues: 0,
    expectAllClear: true,
  },
  {
    id: "has-dms",
    unreadDms: 3,
    overdueTasks: 0,
    connectionIssues: 0,
    expectAllClear: false,
  },
  {
    id: "has-overdue",
    unreadDms: 0,
    overdueTasks: 2,
    connectionIssues: 0,
    expectAllClear: false,
  },
];
