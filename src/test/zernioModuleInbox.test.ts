// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createZernioModule } from "../../server/providers/zernioModule.ts";

function makeZernio() {
  return createZernioModule({
    apiBase: "https://zernio.test/api/v1",
    authHeaders: () => ({ Authorization: "Bearer test" }),
    normalizeAccountsPayload: () => [],
    mapPlatform: () => null,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Zernio inbox gateway", () => {
  it("queries account-scoped conversation endpoints before the generic inbox endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await makeZernio().listInboxConversations({
      accountId: "za-1",
      profileId: "zp-1",
      platform: "instagram",
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/accounts/za-1/inbox/conversations?");
    expect(url).toContain("accountId=za-1");
    expect(url).toContain("account_id=za-1");
    expect(url).toContain("profile_id=zp-1");
  });

  it("queries account-scoped conversation messages before old message endpoints", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await makeZernio().listInboxConversationMessages("conv-1", {
      accountId: "za-1",
      limit: 1,
      sortOrder: "desc",
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/accounts/za-1/inbox/conversations/conv-1/messages?"
    );
  });
});
