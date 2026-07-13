/**
 * First-party visitor tracking: pure helpers for the /api/track ingest and
 * the tracking summary endpoint. Everything here is deterministic and
 * side-effect free so it can be unit-tested; the route layer owns IO.
 *
 * Privacy model: no cookies, no raw IP/UA stored. A visitor is a SHA-256 of
 * secret + UTC day + site key + ip + user-agent, so hashes can't be joined
 * across days or sites and expire naturally at midnight UTC.
 */

import crypto from "crypto";

export interface PageviewPayload {
  siteKey: string;
  path: string;
  referrerHost: string | null;
}

/** Validate and normalise the beacon body (parsed JSON of unknown shape). */
export function parsePageviewPayload(raw: unknown): PageviewPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const siteKey = String(body.k ?? "").trim();
  // Site keys are server-generated hex; reject anything else early.
  if (!/^[a-f0-9]{24,64}$/.test(siteKey)) return null;

  let path = String(body.p ?? "/").trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.slice(0, 300);

  const pageHost = safeHost(String(body.h ?? ""));
  const referrerHost = safeHost(String(body.r ?? ""));
  // Internal navigation is not a referral — only keep external referrers.
  const external = referrerHost && referrerHost !== pageHost ? referrerHost : null;

  return { siteKey, path, referrerHost: external };
}

/** Hostname from a URL or bare host string, lowercased; null when unparsable. */
export function safeHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).hostname.toLowerCase() || null;
  } catch {
    if (/^[a-z0-9.-]+$/i.test(trimmed)) return trimmed.toLowerCase();
    return null;
  }
}

/** Coarse device class from the user-agent. */
export function deviceFromUserAgent(userAgent: string): "mobile" | "tablet" | "desktop" {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|android|iphone/.test(ua)) return "mobile";
  return "desktop";
}

/** Daily-rotating anonymous visitor hash (see privacy model above). */
export function visitorHash(
  secret: string,
  siteKey: string,
  ip: string,
  userAgent: string,
  now: Date = new Date()
): string {
  const day = now.toISOString().slice(0, 10);
  return crypto
    .createHash("sha256")
    .update(`${secret}|${day}|${siteKey}|${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

/** Random site key for the snippet (rotatable). */
export function generateSiteKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

export interface VisitEventRow {
  created_at: string;
  session_hash: string;
  path: string;
  referrer_host: string | null;
  device: string | null;
}

export interface VisitSummary {
  windowDays: number;
  totals: { pageviews: number; visitors: number };
  /** Oldest first; days without traffic are 0 so charts show gaps honestly. */
  byDay: Array<{ date: string; pageviews: number; visitors: number }>;
  topPages: Array<{ path: string; pageviews: number }>;
  topReferrers: Array<{ host: string; pageviews: number }>;
  devices: Array<{ device: string; pageviews: number }>;
}

/**
 * Aggregate raw events into the summary the Insights page renders. Unique
 * visitors are distinct daily hashes — summed across days they count a
 * returning visitor once per day, matching how the hash rotates.
 */
export function summariseSiteVisits(
  rows: VisitEventRow[],
  windowDays: number,
  now: Date = new Date()
): VisitSummary {
  const byDayMap = new Map<string, { pageviews: number; visitors: Set<string> }>();
  const pageMap = new Map<string, number>();
  const referrerMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  const allVisitors = new Set<string>();

  for (const row of rows) {
    const day = String(row.created_at || "").slice(0, 10);
    if (!day) continue;
    let stats = byDayMap.get(day);
    if (!stats) {
      stats = { pageviews: 0, visitors: new Set() };
      byDayMap.set(day, stats);
    }
    stats.pageviews += 1;
    stats.visitors.add(row.session_hash);
    allVisitors.add(`${day}:${row.session_hash}`);
    pageMap.set(row.path, (pageMap.get(row.path) ?? 0) + 1);
    if (row.referrer_host) {
      referrerMap.set(row.referrer_host, (referrerMap.get(row.referrer_host) ?? 0) + 1);
    }
    if (row.device) deviceMap.set(row.device, (deviceMap.get(row.device) ?? 0) + 1);
  }

  const byDay: VisitSummary["byDay"] = [];
  const todayMs = Date.parse(now.toISOString().slice(0, 10));
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = new Date(todayMs - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const stats = byDayMap.get(date);
    byDay.push({
      date,
      pageviews: stats?.pageviews ?? 0,
      visitors: stats?.visitors.size ?? 0,
    });
  }

  const top = (map: Map<string, number>, limit: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

  return {
    windowDays,
    totals: {
      pageviews: rows.length,
      visitors: allVisitors.size,
    },
    byDay,
    topPages: top(pageMap, 8).map(([path, pageviews]) => ({ path, pageviews })),
    topReferrers: top(referrerMap, 8).map(([host, pageviews]) => ({ host, pageviews })),
    devices: top(deviceMap, 3).map(([device, pageviews]) => ({ device, pageviews })),
  };
}

/**
 * The embeddable tracker, served as /api/track.js. Cookieless: one beacon per
 * page load plus SPA route changes (pushState/popstate). text/plain keeps the
 * cross-origin POST preflight-free; sendBeacon survives page unloads.
 */
export function buildTrackerScript(): string {
  return `(function(){var s=document.currentScript;if(!s)return;var k=s.getAttribute("data-site");if(!k)return;
var u=s.src.replace(/\\/track\\.js.*$/,"/track/pageview");var last="";
function hit(){var p=location.pathname||"/";if(p===last)return;last=p;
try{var b=JSON.stringify({k:k,p:p,h:location.hostname,r:document.referrer||""});
if(navigator.sendBeacon){navigator.sendBeacon(u,new Blob([b],{type:"text/plain"}));}
else{fetch(u,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},body:b});}}catch(e){}}
var ps=history.pushState;history.pushState=function(){ps.apply(this,arguments);hit();};
window.addEventListener("popstate",hit);hit();})();`;
}
