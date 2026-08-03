import { describe, expect, it } from "vitest";
import { escapeHtml } from "../../server/lib/htmlEscape";

describe("escapeHtml", () => {
  it("neutralises markup injected through tenant-supplied text", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("escapes the ampersand first so entities are not double-decoded", () => {
    expect(escapeHtml("Tom & Jerry <b>")).toBe("Tom &amp; Jerry &lt;b&gt;");
  });

  it("escapes quotes so values stay inside their attribute", () => {
    expect(escapeHtml(`" onerror='x'`)).toBe("&quot; onerror=&#39;x&#39;");
  });

  it("tolerates null and undefined", () => {
    expect(escapeHtml(null as unknown as string)).toBe("");
    expect(escapeHtml(undefined as unknown as string)).toBe("");
  });
});
