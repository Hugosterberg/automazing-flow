import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../../server/lib/rateLimit.ts";

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Date.now()}-allow`;
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
  });

  it("blocks requests above the limit", () => {
    const key = `test-${Date.now()}-block`;
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(true);
    const blocked = checkRateLimit(key, 2, 60_000);
    expect(blocked.ok).toBe(false);
    expect("retryAfterMs" in blocked ? blocked.retryAfterMs : -1).toBeGreaterThanOrEqual(0);
  });
});
