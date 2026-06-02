import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGetOrCreateZernioProfileIdForTenant } from "../../server/lib/zernioHelpers.ts";

type ProfileRow = { name?: string; zernio_profile_id?: string | null };

function makeFakeSupabase(initial: Record<string, ProfileRow>) {
  const rows: Record<string, ProfileRow> = { ...initial };
  return {
    rows,
    from() {
      return {
        select() {
          return {
            eq(_c: string, id: string) {
              return {
                async maybeSingle() {
                  return { data: rows[id] ?? null, error: null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_c: string, id: string) {
              rows[id] = { ...(rows[id] || {}), ...(patch as ProfileRow) };
              return { error: null };
            },
          };
        },
      };
    },
  };
}

const fallback = () => Promise.resolve("shared-profile");

describe("getOrCreateZernioProfileIdForTenant", () => {
  beforeEach(() => {
    process.env.ZERNIO_API_KEY = "sk_test_key";
  });
  afterEach(() => {
    delete process.env.ZERNIO_API_KEY;
    delete process.env.ZERNIO_PROFILE_ID;
  });

  it("uses the shared fallback when no businessProfileId is given", async () => {
    const zernio = { createProfile: vi.fn() } as never;
    const resolve = createGetOrCreateZernioProfileIdForTenant({
      zernio,
      supabaseAdmin: makeFakeSupabase({}) as never,
      fallbackResolver: fallback,
    });
    expect(await resolve()).toBe("shared-profile");
    expect(await resolve("")).toBe("shared-profile");
  });

  it("uses the shared fallback for local_ users and when supabase is absent", async () => {
    const zernio = { createProfile: vi.fn() } as never;
    const withDb = createGetOrCreateZernioProfileIdForTenant({
      zernio,
      supabaseAdmin: makeFakeSupabase({}) as never,
      fallbackResolver: fallback,
    });
    expect(await withDb("local_abc")).toBe("shared-profile");

    const noDb = createGetOrCreateZernioProfileIdForTenant({
      zernio,
      supabaseAdmin: null,
      fallbackResolver: fallback,
    });
    expect(await noDb("bp-1")).toBe("shared-profile");
  });

  it("returns an already-persisted zernio_profile_id without creating", async () => {
    const zernio = { createProfile: vi.fn() } as never;
    const fake = makeFakeSupabase({ "bp-1": { name: "Acme", zernio_profile_id: "prof_existing" } });
    const resolve = createGetOrCreateZernioProfileIdForTenant({
      zernio,
      supabaseAdmin: fake as never,
      fallbackResolver: fallback,
    });
    expect(await resolve("bp-1")).toBe("prof_existing");
    expect((zernio as { createProfile: ReturnType<typeof vi.fn> }).createProfile).not.toHaveBeenCalled();
  });

  it("creates a profile named after the business and persists it", async () => {
    const createProfile = vi.fn(async ({ name }: { name: string }) => ({
      ok: true,
      status: 200,
      data: { profile: { _id: `prof_${name}` } },
    }));
    const fake = makeFakeSupabase({ "bp-1": { name: "Acme", zernio_profile_id: null } });
    const resolve = createGetOrCreateZernioProfileIdForTenant({
      zernio: { createProfile } as never,
      supabaseAdmin: fake as never,
      fallbackResolver: fallback,
    });
    const id = await resolve("bp-1");
    expect(createProfile).toHaveBeenCalledWith({ name: "Acme" });
    expect(id).toBe("prof_Acme");
    expect(fake.rows["bp-1"].zernio_profile_id).toBe("prof_Acme");
  });

  it("falls back to shared resolver when profile creation fails", async () => {
    const createProfile = vi.fn(async () => ({ ok: false, status: 402, data: {}, details: {} }));
    const fake = makeFakeSupabase({ "bp-1": { name: "Acme", zernio_profile_id: null } });
    const resolve = createGetOrCreateZernioProfileIdForTenant({
      zernio: { createProfile } as never,
      supabaseAdmin: fake as never,
      fallbackResolver: fallback,
    });
    expect(await resolve("bp-1")).toBe("shared-profile");
  });
});
