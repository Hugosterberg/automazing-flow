import { describe, expect, it } from "vitest";
import {
  mapGmailMessageToUnified,
  parseUnifiedMessagesQuery,
} from "../../server/lib/unifiedMessageMap";

describe("parseUnifiedMessagesQuery", () => {
  it("defaults to all sources and inbox scope", () => {
    const q = parseUnifiedMessagesQuery({});
    expect(q.includeMail).toBe(true);
    expect(q.includeDm).toBe(true);
    expect(q.includeAllMail).toBe(false);
    expect(q.folderScoped).toBe(false);
  });

  it("parses includeAllMail and folder scope", () => {
    expect(parseUnifiedMessagesQuery({ includeAllMail: "1" }).includeAllMail).toBe(true);
    expect(
      parseUnifiedMessagesQuery({
        mailAccountId: "a",
        mailFolderId: "f",
        includeAllMail: "1",
      }).includeAllMail
    ).toBe(false);
  });

  it("respects progressive sources", () => {
    expect(parseUnifiedMessagesQuery({ sources: "mail" }).includeDm).toBe(false);
    expect(parseUnifiedMessagesQuery({ sources: "dm" }).includeMail).toBe(false);
  });
});

describe("mapGmailMessageToUnified", () => {
  it("maps provider rows into unified email shape", () => {
    const mapped = mapGmailMessageToUnified({
      accountId: "acc1",
      accountLabel: "me@example.com",
      profileId: "bp1",
      message: {
        id: "m1",
        subject: "Hello",
        from: { name: "Ada", email: "ada@example.com" },
        date: "2026-01-01T00:00:00Z",
        snippet: "Hi",
        body: "Hi there",
        isUnread: true,
        isStarred: false,
        threadId: "t1",
      },
    });
    expect(mapped?.id).toBe("email:gmail:acc1:m1");
    expect(mapped?.channel).toBe("gmail");
    expect(mapped?.from.name).toBe("Ada");
  });
});
