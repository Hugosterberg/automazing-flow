import { afterEach, describe, expect, it, vi } from "vitest";
import { apiJson } from "./apiJson";

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiJson", () => {
  it("GETs by default and returns the parsed body", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true, items: [1, 2] });
    const result = await apiJson<{ items: number[] }>("/api/things", "failed");
    expect(result.items).toEqual([1, 2]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/things");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
  });

  it("POSTs a JSON body when `body` is set", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true });
    await apiJson("/api/things", "failed", { body: { name: "a" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ name: "a" }));
  });

  it("honours an explicit method override", async () => {
    const fetchMock = mockFetchOnce(200, {});
    await apiJson("/api/things/1", "failed", { method: "DELETE" });
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("throws the server's message on non-OK responses", async () => {
    mockFetchOnce(400, { error: "bad_input", message: "Ogiltigt org.nr." });
    await expect(apiJson("/api/things", "fallback")).rejects.toThrow("Ogiltigt org.nr.");
  });

  it("falls back to the caller's message when the error body is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/things", "Kunde inte hämta data.")).rejects.toThrow(
      "Kunde inte hämta data."
    );
  });
});
