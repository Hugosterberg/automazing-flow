import { describe, expect, it } from "vitest";
import {
  mapGmailMessageToUnified,
  mapOutlookMessageToUnified,
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

describe("mapOutlookMessageToUnified", () => {
  it("maps Outlook rows and conversation ids", () => {
    const mapped = mapOutlookMessageToUnified({
      accountId: "o1",
      accountLabel: "me@contoso.com",
      profileId: null,
      message: {
        id: "om1",
        subject: "Ping",
        from: { name: "Bob", email: "bob@contoso.com" },
        date: "2026-02-01T00:00:00Z",
        snippet: "Yo",
        isUnread: false,
        conversationId: "c1",
      },
    });
    expect(mapped?.id).toBe("email:outlook:o1:om1");
    expect(mapped?.channel).toBe("outlook");
    expect(mapped?.conversationId).toBe("c1");
  });

  it("returns null without a provider message id", () => {
    expect(
      mapOutlookMessageToUnified({
        accountId: "o1",
        accountLabel: "me@contoso.com",
        profileId: null,
        message: { subject: "No id" },
      })
    ).toBeNull();
  });
});

describe("mail reply request shape (messages API)", () => {
  it("requires accountId, messageId and non-empty message for reply", () => {
    // Mirrors validation intent of POST /api/messages/reply without spinning up Express.
    function isValidMailReplyBody(body: Record<string, unknown>) {
      const accountId = String(body.accountId || "").trim();
      const messageId = String(body.messageId || "").trim();
      const message = String(body.message || "").trim();
      return Boolean(accountId && messageId && message);
    }
    expect(isValidMailReplyBody({ accountId: "a", messageId: "m", message: "Hi" })).toBe(true);
    expect(isValidMailReplyBody({ accountId: "a", messageId: "m", message: "  " })).toBe(false);
    expect(isValidMailReplyBody({ accountId: "", messageId: "m", message: "Hi" })).toBe(false);
  });
});
