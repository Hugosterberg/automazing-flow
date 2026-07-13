import { describe, expect, it } from "vitest";
import {
  buildTrackerScript,
  deviceFromUserAgent,
  parsePageviewPayload,
  safeHost,
  summariseSiteVisits,
  visitorHash,
  type VisitEventRow,
} from "../../server/lib/siteVisits";

const KEY = "a".repeat(32);

describe("parsePageviewPayload", () => {
  it("accepts a valid beacon body", () => {
    const payload = parsePageviewPayload({
      k: KEY,
      p: "/produkter",
      h: "example.se",
      r: "https://www.google.com/search?q=x",
    });
    expect(payload).toEqual({
      siteKey: KEY,
      path: "/produkter",
      referrerHost: "www.google.com",
    });
  });

  it("rejects malformed site keys", () => {
    expect(parsePageviewPayload({ k: "short", p: "/" })).toBeNull();
    expect(parsePageviewPayload({ k: "DROP TABLE;--", p: "/" })).toBeNull();
    expect(parsePageviewPayload(null)).toBeNull();
  });

  it("drops internal referrers and normalises paths", () => {
    const payload = parsePageviewPayload({
      k: KEY,
      p: "kontakt",
      h: "example.se",
      r: "https://example.se/start",
    });
    expect(payload?.path).toBe("/kontakt");
    expect(payload?.referrerHost).toBeNull();
  });

  it("caps absurdly long paths", () => {
    const payload = parsePageviewPayload({ k: KEY, p: "/" + "x".repeat(500) });
    expect(payload?.path.length).toBeLessThanOrEqual(300);
  });
});

describe("safeHost", () => {
  it("parses URLs and bare hosts", () => {
    expect(safeHost("https://T.co/abc")).toBe("t.co");
    expect(safeHost("news.ycombinator.com")).toBe("news.ycombinator.com");
    expect(safeHost("")).toBeNull();
    expect(safeHost("not a host!!")).toBeNull();
  });
});

describe("deviceFromUserAgent", () => {
  it("classifies coarse device types", () => {
    expect(deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mobile");
    expect(deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });
});

describe("visitorHash", () => {
  it("is stable within a day and changes across days/sites/visitors", () => {
    const now = new Date("2026-07-13T10:00:00Z");
    const later = new Date("2026-07-13T22:00:00Z");
    const nextDay = new Date("2026-07-14T01:00:00Z");
    const a = visitorHash("s", KEY, "1.2.3.4", "ua", now);
    expect(visitorHash("s", KEY, "1.2.3.4", "ua", later)).toBe(a);
    expect(visitorHash("s", KEY, "1.2.3.4", "ua", nextDay)).not.toBe(a);
    expect(visitorHash("s", KEY, "5.6.7.8", "ua", now)).not.toBe(a);
    expect(visitorHash("s", "b".repeat(32), "1.2.3.4", "ua", now)).not.toBe(a);
    expect(a).toHaveLength(32);
  });
});

function event(overrides: Partial<VisitEventRow>): VisitEventRow {
  return {
    created_at: "2026-07-13T10:00:00Z",
    session_hash: "v1",
    path: "/",
    referrer_host: null,
    device: "desktop",
    ...overrides,
  };
}

describe("summariseSiteVisits", () => {
  const now = new Date("2026-07-13T12:00:00Z");

  it("aggregates pageviews, uniques, top pages and referrers", () => {
    const summary = summariseSiteVisits(
      [
        event({ session_hash: "v1", path: "/" }),
        event({ session_hash: "v1", path: "/pris" }),
        event({ session_hash: "v2", path: "/", referrer_host: "google.com", device: "mobile" }),
        event({
          created_at: "2026-07-12T09:00:00Z",
          session_hash: "v1",
          path: "/",
          referrer_host: "google.com",
        }),
      ],
      7,
      now
    );
    expect(summary.totals.pageviews).toBe(4);
    // v1 counts once per day (hash rotates daily) → v1×2 days + v2×1 day.
    expect(summary.totals.visitors).toBe(3);
    expect(summary.byDay).toHaveLength(7);
    expect(summary.byDay[6]).toEqual({ date: "2026-07-13", pageviews: 3, visitors: 2 });
    expect(summary.byDay[5]).toEqual({ date: "2026-07-12", pageviews: 1, visitors: 1 });
    expect(summary.byDay[0].pageviews).toBe(0);
    expect(summary.topPages[0]).toEqual({ path: "/", pageviews: 3 });
    expect(summary.topReferrers[0]).toEqual({ host: "google.com", pageviews: 2 });
    expect(summary.devices.find((d) => d.device === "mobile")?.pageviews).toBe(1);
  });

  it("handles empty input", () => {
    const summary = summariseSiteVisits([], 7, now);
    expect(summary.totals).toEqual({ pageviews: 0, visitors: 0 });
    expect(summary.byDay).toHaveLength(7);
    expect(summary.topPages).toEqual([]);
  });
});

describe("buildTrackerScript", () => {
  it("targets the pageview endpoint next to the script URL", () => {
    const script = buildTrackerScript();
    expect(script).toContain('replace(/\\/track\\.js.*$/,"/track/pageview")');
    expect(script).toContain("sendBeacon");
    expect(script).toContain('data-site');
  });
});
