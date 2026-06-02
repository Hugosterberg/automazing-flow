import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import { createSecretCrypto } from "../../server/lib/secretCrypto.ts";
import { createSecretResolver } from "../../server/lib/secretResolver.ts";

type Row = {
  business_profile_id: string;
  key: string;
  value_ciphertext: string;
  value_iv: string;
  value_tag: string;
  updated_by?: string | null;
  updated_at?: string;
};

/** Minimal in-memory stand-in for the subset of supabase-js the resolver uses. */
function makeFakeSupabase() {
  const rows = new Map<string, Row>();
  const rowKey = (bp: string, key: string) => `${bp}::${key}`;
  return {
    rows,
    from() {
      return {
        select() {
          return {
            eq(_c1: string, bp: string) {
              return {
                eq(_c2: string, key: string) {
                  return {
                    async maybeSingle() {
                      return { data: rows.get(rowKey(bp, key)) ?? null, error: null };
                    },
                  };
                },
                async order() {
                  const out = [...rows.values()].filter((r) => r.business_profile_id === bp);
                  return { data: out.map((r) => ({ key: r.key })), error: null };
                },
              };
            },
          };
        },
        async upsert(row: Row) {
          rows.set(rowKey(row.business_profile_id, row.key), row);
          return { error: null };
        },
        delete() {
          return {
            eq(_c1: string, bp: string) {
              return {
                async eq(_c2: string, key: string) {
                  rows.delete(rowKey(bp, key));
                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const KEY = "TRIPADVISOR_API_KEY";
const BP = "bp-1";

describe("secretResolver", () => {
  beforeEach(() => {
    delete process.env[KEY];
  });
  afterEach(() => {
    delete process.env[KEY];
  });

  it("falls back to env when no tenant value exists", async () => {
    process.env[KEY] = "env-value";
    const resolver = createSecretResolver({
      supabaseAdmin: makeFakeSupabase() as never,
      crypto: createSecretCrypto(crypto.randomBytes(32).toString("base64")),
    });
    expect(await resolver.resolve(BP, KEY)).toBe("env-value");
  });

  it("prefers the per-tenant value over env, and stores it encrypted", async () => {
    process.env[KEY] = "env-value";
    const fake = makeFakeSupabase();
    const resolver = createSecretResolver({
      supabaseAdmin: fake as never,
      crypto: createSecretCrypto(crypto.randomBytes(32).toString("base64")),
    });

    await resolver.setSecret(BP, KEY, "tenant-value", "user-1");
    const stored = fake.rows.get(`${BP}::${KEY}`);
    expect(stored).toBeTruthy();
    expect(stored?.value_ciphertext).not.toContain("tenant-value");

    expect(await resolver.resolve(BP, KEY)).toBe("tenant-value");
    expect(await resolver.listConfiguredKeys(BP)).toContain(KEY);

    await resolver.deleteSecret(BP, KEY);
    expect(await resolver.resolve(BP, KEY)).toBe("env-value");
  });

  it("returns env value when no businessProfileId is given", async () => {
    process.env[KEY] = "env-value";
    const resolver = createSecretResolver({
      supabaseAdmin: makeFakeSupabase() as never,
      crypto: createSecretCrypto(crypto.randomBytes(32).toString("base64")),
    });
    expect(await resolver.resolve(null, KEY)).toBe("env-value");
    expect(await resolver.resolve("", KEY)).toBe("env-value");
  });

  it("degrades to env-only and refuses writes when not enabled", async () => {
    process.env[KEY] = "env-value";
    const resolver = createSecretResolver({ supabaseAdmin: null, crypto: null });
    expect(resolver.enabled).toBe(false);
    expect(await resolver.resolve(BP, KEY)).toBe("env-value");
    await expect(resolver.setSecret(BP, KEY, "x")).rejects.toThrow("secret_store_unavailable");
    expect(await resolver.listConfiguredKeys(BP)).toEqual([]);
  });
});
