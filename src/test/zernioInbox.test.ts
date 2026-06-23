import { describe, expect, it } from "vitest";
import {
  parseZernioConversationList,
  parseZernioConversationMessages,
  textFromZernioMessage,
  zernioConversationAccountIds,
  zernioConversationPlatform,
  zernioConversationUnreadCount,
} from "../../server/lib/zernioInbox.ts";

describe("zernio inbox parsing", () => {
  it("reads conversations from newer nested collection shapes", () => {
    expect(parseZernioConversationList({ data: { items: [{ id: "c1" }] } })).toEqual([{ id: "c1" }]);
    expect(parseZernioConversationList({ results: [{ id: "c2" }] })).toEqual([{ id: "c2" }]);
  });

  it("extracts Instagram account ids and platform from newer fields", () => {
    const row = {
      instagram_account_id: "za-instagram",
      social_platform: "instagram_dm",
    };
    expect(zernioConversationAccountIds(row)).toContain("za-instagram");
    expect(zernioConversationPlatform(row)).toBe("instagram");
  });

  it("uses query account id when Zernio omits account fields from account-scoped results", () => {
    expect(zernioConversationAccountIds({ __queryZernioAccountId: "za-1" })).toEqual(["za-1"]);
  });

  it("normalizes unread and latest message fields from snake_case payloads", () => {
    const row = {
      unread_count: "2",
      latest_message: { text: "Hej från Instagram" },
    };
    expect(zernioConversationUnreadCount(row)).toBe(2);
    expect(textFromZernioMessage(row)).toBe("Hej från Instagram");
  });

  it("reads messages from data.results", () => {
    expect(parseZernioConversationMessages({ data: { results: [{ id: "m1" }] } })).toEqual([{ id: "m1" }]);
  });
});
