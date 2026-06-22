import { describe, expect, it } from "vitest";
import { accountInBusinessProfile, readRequestBusinessProfileId } from "../../server/lib/profileScope.ts";

describe("profileScope", () => {
  it("reads business profile ids from account data query params", () => {
    expect(readRequestBusinessProfileId({ query: { business_profile_id: "bp-1" } })).toBe("bp-1");
    expect(readRequestBusinessProfileId({ query: { bp: "bp-2" } })).toBe("bp-2");
  });

  it("rejects stored accounts from another business profile", () => {
    expect(accountInBusinessProfile({ profileId: "lostios" }, "lostios")).toBe(true);
    expect(accountInBusinessProfile({ profileId: "bitcoinlivet" }, "lostios")).toBe(false);
  });

  it("rejects legacy unassigned accounts when a business profile is requested", () => {
    expect(accountInBusinessProfile({}, "lostios")).toBe(false);
  });
});
