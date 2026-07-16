import { describe, expect, it } from "vitest";
import {
  countPendingMailReplyDrafts,
  parseMailReplyQueue,
} from "../../server/lib/flowAutomationJobs";

describe("mail reply queue helpers", () => {
  it("parses and counts draft items", () => {
    const parsed = parseMailReplyQueue([
      {
        id: "1",
        messageKey: "gmail:a:m",
        accountId: "a",
        platform: "gmail",
        providerMessageId: "m",
        subject: "S",
        fromName: "A",
        fromEmail: "a@b.c",
        snippet: "x",
        draft: "Hi",
        status: "draft",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "2",
        messageKey: "gmail:a:m2",
        accountId: "a",
        platform: "gmail",
        providerMessageId: "m2",
        subject: "S2",
        fromName: "B",
        fromEmail: "b@b.c",
        snippet: "y",
        draft: "Yo",
        status: "sent",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(parsed).toHaveLength(2);
    expect(countPendingMailReplyDrafts(parsed)).toBe(1);
  });

  it("rejects malformed rows", () => {
    expect(parseMailReplyQueue([{ id: "x" }])).toHaveLength(0);
    expect(countPendingMailReplyDrafts(null)).toBe(0);
  });
});
