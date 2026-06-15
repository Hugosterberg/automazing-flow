import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FETCH_TIMEOUT_MS, FetchError, fetchWithTimeout } from "../lib/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch() {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("attaches an abort signal even when the caller passes none", async () => {
    const spy = mockFetch();
    await fetchWithTimeout("/api/test");
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("exposes a sane default timeout", () => {
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(30_000);
  });

  it("combines a caller signal with the timeout so caller-abort still aborts", async () => {
    const spy = mockFetch();
    const controller = new AbortController();
    await fetchWithTimeout("/api/test", { signal: controller.signal });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal?.aborted).toBe(false);
    controller.abort();
    expect(init.signal?.aborted).toBe(true);
  });

  it("forwards method and headers unchanged", async () => {
    const spy = mockFetch();
    await fetchWithTimeout("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("throws a clear timeout error when the request exceeds the budget", async () => {
    // fetch that only settles when its signal aborts — mirrors a hung upstream.
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason ?? new DOMException("aborted", "AbortError")),
        );
      }),
    );
    const err = await fetchWithTimeout("/api/slow", {}, 10).catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect(err.kind).toBe("timeout");
    expect(err.message).toMatch(/timed out/i);
  });

  it("turns a connectivity TypeError into a clear network error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await fetchWithTimeout("/api/test").catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect(err.kind).toBe("network");
    expect(err.message).toMatch(/internet connection/i);
  });

  it("preserves an intentional caller abort as the original error", async () => {
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason ?? new DOMException("aborted", "AbortError")),
        );
      }),
    );
    const controller = new AbortController();
    const promise = fetchWithTimeout("/api/test", { signal: controller.signal });
    controller.abort();
    const err = await promise.catch((e) => e);
    expect(err).not.toBeInstanceOf(FetchError);
  });
});
