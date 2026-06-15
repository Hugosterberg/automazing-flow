import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "../lib/apiError";

describe("apiErrorMessage", () => {
  it("prefers the human message over the machine error code", () => {
    expect(
      apiErrorMessage({ error: "connection_not_found", message: "That connection no longer exists." }, "fallback")
    ).toBe("That connection no longer exists.");
  });

  it("falls back to the error code when no message is present", () => {
    expect(apiErrorMessage({ error: "disconnect_failed" }, "fallback")).toBe("disconnect_failed");
  });

  it("uses the fallback for empty, non-object, or messageless payloads", () => {
    expect(apiErrorMessage({}, "fallback")).toBe("fallback");
    expect(apiErrorMessage(null, "fallback")).toBe("fallback");
    expect(apiErrorMessage("oops", "fallback")).toBe("fallback");
    expect(apiErrorMessage({ error: "  " }, "fallback")).toBe("fallback");
  });
});
