import { describe, expect, it } from "vitest";
import { inboxCacheKey } from "@/features/messages/inboxCache";

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
});
