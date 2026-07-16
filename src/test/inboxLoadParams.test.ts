import { describe, expect, it } from "vitest";
import { buildInboxLoadScope } from "@/features/messages/inboxLoadParams";

describe("buildInboxLoadScope", () => {
  it("defaults to inbox without folder or all-mail", () => {
    expect(
      buildInboxLoadScope({
        activeTab: "mail",
        selectedMailFolder: null,
        includeAllMail: false,
      })
    ).toEqual({
      folderScoped: false,
      allMailScope: false,
      mailAccountId: null,
      mailFolderId: null,
    });
  });

  it("enables all-mail only on mail tab without a folder", () => {
    expect(
      buildInboxLoadScope({
        activeTab: "mail",
        selectedMailFolder: null,
        includeAllMail: true,
      }).allMailScope
    ).toBe(true);

    expect(
      buildInboxLoadScope({
        activeTab: "instagram",
        selectedMailFolder: null,
        includeAllMail: true,
      }).allMailScope
    ).toBe(false);
  });

  it("folder scope wins over all-mail", () => {
    const scope = buildInboxLoadScope({
      activeTab: "mail",
      selectedMailFolder: { accountId: "acc", folderId: "INBOX", folderName: "Inkorg" },
      includeAllMail: true,
    });
    expect(scope.folderScoped).toBe(true);
    expect(scope.allMailScope).toBe(false);
    expect(scope.mailAccountId).toBe("acc");
    expect(scope.mailFolderId).toBe("INBOX");
  });
});
