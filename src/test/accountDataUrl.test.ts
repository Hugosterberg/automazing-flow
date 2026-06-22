import { describe, expect, it } from "vitest";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { appendOAuthProfileParams } from "@/lib/oauthProfile";

describe("accountDataUrl", () => {
  it("adds the active business profile id to account data requests", () => {
    expect(accountDataUrl("acc 1", "bp-1")).toBe(
      "/api/accounts/acc%201/data?business_profile_id=bp-1"
    );
  });

  it("keeps existing params while appending the active business profile id", () => {
    const params = new URLSearchParams({ folderId: "folder-1", view: "shared-with-me" });

    expect(accountDataUrl("drive", "bp-1", params)).toBe(
      "/api/accounts/drive/data?folderId=folder-1&view=shared-with-me&business_profile_id=bp-1"
    );
  });

  it("adds both OAuth legacy and tenant profile params to connect starts", () => {
    const params = new URLSearchParams();
    appendOAuthProfileParams(params, "bp-1");

    expect(params.get("profile_id")).toBe("bp-1");
    expect(params.get("business_profile_id")).toBe("bp-1");
  });
});
