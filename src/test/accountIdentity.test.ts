import { describe, expect, it } from "vitest";
import {
  deterministicAccountId,
  pruneDuplicateAccountEntries,
} from "../../server/lib/accountIdentity.ts";

function makeStore(initial: Record<string, Record<string, unknown>>) {
  const entries = new Map(Object.entries(initial));
  return {
    entries: async () => [...entries.entries()] as Array<[string, Record<string, unknown>]>,
    delete: async (id: string) => entries.delete(id),
    has: (id: string) => entries.has(id),
    size: () => entries.size,
  };
}

describe("deterministicAccountId", () => {
  it("is stable for the same identity and differs across identities", () => {
    expect(deterministicAccountId("ig", "12345")).toBe(deterministicAccountId("ig", "12345"));
    expect(deterministicAccountId("ig", "12345")).not.toBe(deterministicAccountId("ig", "67890"));
    expect(deterministicAccountId("ig", "12345")).toMatch(/^ig_[0-9a-f]{20}$/);
  });
});

describe("pruneDuplicateAccountEntries", () => {
  it("deletes other entries pointing at the same external account", async () => {
    const store = makeStore({
      keep: { platform: "gmail", username: "a@b.se" },
      "legacy-1": { platform: "gmail", username: "A@B.SE" },
      other: { platform: "gmail", username: "c@d.se" },
      "wrong-platform": { platform: "outlook", username: "a@b.se" },
    });
    const removed = await pruneDuplicateAccountEntries({
      tokenStore: store,
      platform: "gmail",
      keepAccountId: "keep",
      matchers: [{ key: "username", value: "a@b.se" }],
    });
    expect(removed).toBe(1);
    expect(store.has("legacy-1")).toBe(false);
    expect(store.has("keep")).toBe(true);
    expect(store.has("other")).toBe(true);
    expect(store.has("wrong-platform")).toBe(true);
  });

  it("does nothing when no matcher values are provided", async () => {
    const store = makeStore({
      a: { platform: "gmail", username: "a@b.se" },
      b: { platform: "gmail", username: "a@b.se" },
    });
    const removed = await pruneDuplicateAccountEntries({
      tokenStore: store,
      platform: "gmail",
      keepAccountId: "a",
      matchers: [{ key: "username", value: "" }, { key: "userId", value: null }],
    });
    expect(removed).toBe(0);
    expect(store.size()).toBe(2);
  });

  it("leaves entries without matching identity fields alone", async () => {
    const store = makeStore({
      keep: { platform: "gmail", username: "a@b.se" },
      unnamed: { platform: "gmail" },
    });
    const removed = await pruneDuplicateAccountEntries({
      tokenStore: store,
      platform: "gmail",
      keepAccountId: "keep",
      matchers: [{ key: "username", value: "a@b.se" }],
    });
    expect(removed).toBe(0);
    expect(store.has("unnamed")).toBe(true);
  });

  it("respects sameProfileId: sibling links on other profiles survive", async () => {
    const store = makeStore({
      keep: { platform: "facebook", zernioAccountId: "z1", profileId: "p1" },
      "same-profile-dup": { platform: "facebook", zernioAccountId: "z1", profileId: "p1" },
      "other-profile-link": { platform: "facebook", zernioAccountId: "z1", profileId: "p2" },
      "no-profile-legacy": { platform: "facebook", zernioAccountId: "z1" },
    });
    const removed = await pruneDuplicateAccountEntries({
      tokenStore: store,
      platform: "facebook",
      keepAccountId: "keep",
      matchers: [{ key: "zernioAccountId", value: "z1" }],
      sameProfileId: "p1",
    });
    expect(removed).toBe(2);
    expect(store.has("same-profile-dup")).toBe(false);
    expect(store.has("no-profile-legacy")).toBe(false);
    expect(store.has("other-profile-link")).toBe(true);
  });
});
