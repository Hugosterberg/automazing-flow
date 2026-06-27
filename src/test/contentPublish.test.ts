// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerContentRoutes } from "../../server/routes/contentRoutes.ts";

type Handler = (req: Record<string, unknown>, res: Record<string, unknown>) => unknown | Promise<unknown>;

function createResponse() {
  const res: Record<string, unknown> & {
    statusCode: number;
    payload: unknown;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  } = {
    statusCode: 200,
    payload: undefined,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.payload = body;
      return res;
    }),
  };
  return res;
}

function setupPublishRoute() {
  const posts = new Map<string, Handler>();
  const app = {
    get: vi.fn(),
    post: vi.fn((path: string, handler: Handler) => {
      posts.set(path, handler);
    }),
  };
  const tokenStore = {
    get: vi.fn(async () => ({
      platform: "instagram",
      ownerUserId: "user-1",
      profileId: "bp-1",
      zernioAccountId: "zernio-instagram-1",
    })),
    set: vi.fn(async () => undefined),
    entries: vi.fn(async () => []),
  };
  const zernio = {
    createPost: vi.fn(async () => ({ ok: true, status: 200, data: { id: "post-1" } })),
  };

  registerContentRoutes(app, {
    getSessionUserId: () => "user-1",
    tokenStore,
    getStoredAccountAccess: () => ({ allowed: true, migrate: false }),
    zernio: zernio as never,
  });

  const handler = posts.get("/api/content/publish");
  if (!handler) throw new Error("publish route was not registered");
  return { handler, zernio };
}

async function publish(body: Record<string, unknown>) {
  const { handler, zernio } = setupPublishRoute();
  const res = createResponse();
  await handler({ body }, res);
  return { res, zernio };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("content publish route", () => {
  it("rejects non-http media URLs before creating a Zernio post", async () => {
    const { res, zernio } = await publish({
      business_profile_id: "bp-1",
      accountIds: ["acct-1"],
      content: "Launch post",
      publishNow: true,
      mediaUrls: ["ftp://example.com/image.png"],
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ error: "invalid_media_url" });
    expect(zernio.createPost).not.toHaveBeenCalled();
  });

  it("rejects far-future schedules that use temporary generated media URLs", async () => {
    const { res, zernio } = await publish({
      business_profile_id: "bp-1",
      accountIds: ["acct-1"],
      content: "Launch post",
      publishNow: false,
      scheduledFor: new Date(Date.now() + 21 * 60 * 60 * 1000).toISOString(),
      mediaUrls: ["https://automazing.test/api/content/media/image-1"],
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ error: "media_url_expires_before_schedule" });
    expect(zernio.createPost).not.toHaveBeenCalled();
  });

  it("allows near-term generated media schedules and sends media items to Zernio", async () => {
    const scheduledFor = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { res, zernio } = await publish({
      business_profile_id: "bp-1",
      accountIds: ["acct-1"],
      content: "Launch post",
      publishNow: false,
      scheduledFor,
      mediaUrls: ["https://automazing.test/api/content/media/image-1"],
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, published: 1 });
    expect(zernio.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledFor,
        mediaItems: [{ type: "image", url: "https://automazing.test/api/content/media/image-1" }],
      })
    );
  });
});
