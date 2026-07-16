import { describe, expect, it } from "vitest";
import { buildFallbackReplyDraft } from "../../server/ai/replyDraft.ts";
import {
  DIGEST_SKIP_GOLDENS,
  REPLY_DRAFT_GOLDENS,
} from "../../server/ai/evals/goldenCases.ts";
import { buildDailyBrief } from "../features/daily-brief/buildDailyBrief";

describe("reply-draft golden cases (fallback path)", () => {
  for (const golden of REPLY_DRAFT_GOLDENS) {
    it(golden.id, () => {
      const draft = buildFallbackReplyDraft(golden.input).toLowerCase();
      for (const needle of golden.mustInclude) {
        expect(draft, `missing “${needle}”`).toContain(needle.toLowerCase());
      }
      for (const needle of golden.mustNotInclude ?? []) {
        expect(draft, `unexpected “${needle}”`).not.toContain(needle.toLowerCase());
      }
    });
  }
});

describe("digest skip golden cases (signal over noise)", () => {
  for (const golden of DIGEST_SKIP_GOLDENS) {
    it(golden.id, () => {
      const brief = buildDailyBrief({
        connectionIssues: Array.from({ length: golden.connectionIssues }, (_, i) => ({
          label: `Conn ${i + 1}`,
          health: "failed",
        })),
        unreadDms: golden.unreadDms,
        overdueTasks: Array.from({ length: golden.overdueTasks }, (_, i) => ({
          title: `Task ${i + 1}`,
        })),
        dueTodayTasks: [],
        newRecommendations: [],
      });
      expect(brief.allClear).toBe(golden.expectAllClear);
      if (golden.expectAllClear) {
        expect(brief.actionCount).toBe(0);
      } else {
        expect(brief.actionCount).toBeGreaterThan(0);
      }
    });
  }
});
