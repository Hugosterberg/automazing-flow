import { describe, expect, it } from "vitest";
import {
  inboxCacheKey,
  mergeUnifiedByKind,
  sortUnifiedMessages,
} from "@/features/messages/inboxCache";
import type { UnifiedMessage } from "@/features/messages/types";

function msg(
  partial: Pick<UnifiedMessage, "id" | "kind" | "date"> & Partial<UnifiedMessage>
): UnifiedMessage {
  return {
    channel: partial.kind === "email" ? "gmail" : "instagram",
    accountId: "a1",
    accountLabel: "me@example.com",
    subject: "",
    from: { name: "A", email: "a@example.com" },
    snippet: "",
    body: "",
    isUnread: false,
    ...partial,
  };
}

describe("inboxCacheKey", () => {
  it("separates inbox, all-mail, and folder scopes", () => {
    expect(
      inboxCacheKey({ businessProfileId: "bp1", includeAllMail: false })
    ).toBe("bp1:inbox");
    expect(
      inboxCacheKey({ businessProfileId: "bp1", includeAllMail: true })
    ).toBe("bp1:all-mail");
    expect(
      inboxCacheKey({
        businessProfileId: "bp1",
        mailAccountId: "acc",
        mailFolderId: "label",
        includeAllMail: true,
      })
    ).toBe("bp1:acc:label");
  });

  it("falls back to default profile scope", () => {
    expect(inboxCacheKey({ businessProfileId: null })).toBe("default:inbox");
  });
});

describe("sortUnifiedMessages", () => {
  it("sorts newest first without mutating input", () => {
    const input = [
      msg({ id: "old", kind: "email", date: "2026-01-01T00:00:00Z" }),
      msg({ id: "new", kind: "dm", date: "2026-03-01T00:00:00Z" }),
      msg({ id: "mid", kind: "email", date: "2026-02-01T00:00:00Z" }),
    ];
    const sorted = sortUnifiedMessages(input);
    expect(sorted.map((m) => m.id)).toEqual(["new", "mid", "old"]);
    expect(input.map((m) => m.id)).toEqual(["old", "new", "mid"]);
  });
});

describe("mergeUnifiedByKind", () => {
  it("replaces one kind and keeps the other, then sorts", () => {
    const current = [
      msg({ id: "e1", kind: "email", date: "2026-01-01T00:00:00Z" }),
      msg({ id: "d1", kind: "dm", date: "2026-02-01T00:00:00Z" }),
    ];
    const incoming = [
      msg({ id: "e2", kind: "email", date: "2026-03-01T00:00:00Z" }),
    ];
    const merged = mergeUnifiedByKind(current, incoming, "email");
    expect(merged.map((m) => m.id)).toEqual(["e2", "d1"]);
  });

  it("can replace DMs while preserving mail", () => {
    const current = [
      msg({ id: "e1", kind: "email", date: "2026-01-01T00:00:00Z" }),
      msg({ id: "d1", kind: "dm", date: "2026-02-01T00:00:00Z" }),
    ];
    const merged = mergeUnifiedByKind(
      current,
      [msg({ id: "d2", kind: "dm", date: "2026-04-01T00:00:00Z" })],
      "dm"
    );
    expect(merged.map((m) => m.id)).toEqual(["d2", "e1"]);
  });
});
