import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, getApiOrigin } from "./apiBase";

describe("apiBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getApiOrigin returns empty when unset", () => {
    vi.stubEnv("VITE_API_URL", "");
    expect(getApiOrigin()).toBe("");
  });

  it("getApiOrigin trims and strips trailing slash", () => {
    vi.stubEnv("VITE_API_URL", "  http://127.0.0.1:3001/  ");
    expect(getApiOrigin()).toBe("http://127.0.0.1:3001");
  });

  it("apiUrl is same-origin path when origin empty", () => {
    vi.stubEnv("VITE_API_URL", "");
    expect(apiUrl("/api/health")).toBe("/api/health");
  });

  it("apiUrl prefixes origin when set", () => {
    vi.stubEnv("VITE_API_URL", "http://127.0.0.1:3001");
    expect(apiUrl("/api/health")).toBe("http://127.0.0.1:3001/api/health");
  });

  it("apiUrl normalizes path without leading slash", () => {
    vi.stubEnv("VITE_API_URL", "");
    expect(apiUrl("api/health")).toBe("/api/health");
  });
});
