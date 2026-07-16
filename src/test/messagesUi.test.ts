import { beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import {
  channelBadge,
  formatWaitTime,
  inboxEmptyCopy,
  isUrgentWait,
  messageMatchesTab,
  providerMessageIdFor,
  senderInitial,
} from "@/features/messages/messagesUi";
import type { UnifiedMessage } from "@/features/messages/types";
import { initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  initI18n();
  await i18n.changeLanguage("sv");
});

function msg(
  partial: Pick<UnifiedMessage, "id" | "kind" | "channel"> & Partial<UnifiedMessage>
): UnifiedMessage {
  return {
    accountId: "a1",
    accountLabel: "me@example.com",
    subject: "",
    from: { name: "A", email: "a@example.com" },
    date: "2026-07-16T12:00:00Z",
    snippet: "",
    body: "",
    isUnread: false,
    ...partial,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("senderInitial", () => {
  it("uppercases the first character", () => {
    expect(senderInitial("anna")).toBe("A");
    expect(senderInitial("")).toBe("?");
  });
});

describe("formatWaitTime / isUrgentWait", () => {
  it("formats compact Swedish wait labels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));

    expect(formatWaitTime("2026-07-16T11:45:00Z")).toBe("15 min");
    expect(formatWaitTime("2026-07-16T09:00:00Z")).toBe("3 tim");
    expect(formatWaitTime("2026-07-14T12:00:00Z")).toBe("2 d");
  });

  it("returns null for empty or future timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));

    expect(formatWaitTime("")).toBeNull();
    expect(formatWaitTime("2026-07-16T13:00:00Z")).toBeNull();
  });

  it("flags waits of 24h or more as urgent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));

    expect(isUrgentWait("2026-07-15T12:00:00Z")).toBe(true);
    expect(isUrgentWait("2026-07-16T11:00:00Z")).toBe(false);
    expect(isUrgentWait("")).toBe(false);
  });
});

describe("channelBadge / messageMatchesTab", () => {
  it("labels email and DM channels", () => {
    expect(channelBadge(msg({ id: "1", kind: "email", channel: "gmail" }))).toBe("Gmail");
    expect(channelBadge(msg({ id: "2", kind: "email", channel: "outlook" }))).toBe("Outlook");
    expect(channelBadge(msg({ id: "3", kind: "dm", channel: "instagram" }))).toBe("Instagram");
    expect(channelBadge(msg({ id: "4", kind: "dm", channel: "facebook_messenger" }))).toBe(
      "Messenger"
    );
  });

  it("matches channel tabs", () => {
    expect(messageMatchesTab(msg({ id: "1", kind: "email", channel: "gmail" }), "mail")).toBe(
      true
    );
    expect(messageMatchesTab(msg({ id: "2", kind: "dm", channel: "ig" }), "instagram")).toBe(true);
    expect(
      messageMatchesTab(msg({ id: "3", kind: "dm", channel: "facebook_messenger" }), "messenger")
    ).toBe(true);
    expect(messageMatchesTab(msg({ id: "4", kind: "dm", channel: "wa" }), "whatsapp")).toBe(true);
    expect(messageMatchesTab(msg({ id: "5", kind: "dm", channel: "instagram" }), "mail")).toBe(
      false
    );
  });
});

describe("inboxEmptyCopy / providerMessageIdFor", () => {
  it("prefers search and filter empty states over tab defaults", () => {
    expect(
      inboxEmptyCopy({
        tab: "mail",
        filter: "all",
        search: "faktura",
        hasMessagesInTab: true,
      })
    ).toMatchObject({ title: "Inga träffar", showClearSearch: true });

    expect(
      inboxEmptyCopy({
        tab: "instagram",
        filter: "open",
        search: "",
        hasMessagesInTab: true,
      })
    ).toMatchObject({ title: "Inget kvar att svara på", showAutomations: true });

    expect(
      inboxEmptyCopy({
        tab: "mail",
        filter: "all",
        search: "",
        hasMessagesInTab: false,
      }).showConnect
    ).toBe(true);
  });

  it("never falls back to the composite unified id", () => {
    expect(
      providerMessageIdFor(
        msg({
          id: "email:gmail:abc",
          kind: "email",
          channel: "gmail",
          providerMessageId: "provider-1",
        })
      )
    ).toBe("provider-1");
    expect(
      providerMessageIdFor(msg({ id: "email:gmail:abc", kind: "email", channel: "gmail" }))
    ).toBe("");
  });
});
