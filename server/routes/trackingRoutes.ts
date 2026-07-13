/**
 * /api/track* — first-party website visitor tracking + stats.
 *
 * Public (no auth — embedded on tenants' websites):
 *   GET  /api/track.js          The tracking snippet (cacheable).
 *   POST /api/track/pageview    Beacon ingest (text/plain JSON, preflight-free).
 *
 * Member-scoped:
 *   GET  /api/tracking/site      Current site key for the active profile.
 *   POST /api/tracking/site      Create (or rotate with {rotate:true}) the key.
 *   GET  /api/tracking/summary   Visitor stats over ?days (default 30).
 *   GET  /api/insights/companies Cross-company overview for every business
 *                                profile the user is a member of.
 *
 * Ingest always answers 204 — an invalid or disabled key must be
 * indistinguishable from success so the endpoint can't be used to probe keys.
 */

import { text } from "express";
import { checkRateLimit } from "../lib/rateLimit.ts";
import type { SupabaseAdminLike } from "../lib/supabaseAdminLike.ts";
import {
  buildTrackerScript,
  deviceFromUserAgent,
  generateSiteKey,
  parsePageviewPayload,
  summariseSiteVisits,
  visitorHash,
  type VisitEventRow,
} from "../lib/siteVisits.ts";

interface RegisterTrackingRoutesDeps {
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  supabaseAdmin: SupabaseAdminLike | null;
  getSessionUserId: (req: unknown) => string | null;
}

/** Per-instance site-key cache so each pageview doesn't hit the database. */
const SITE_CACHE_TTL_MS = 60_000;
const siteCache = new Map<string, { businessProfileId: string; enabled: boolean; expiresAt: number }>();

/** Best-effort abuse caps (in-memory, per instance). */
const PER_VISITOR_LIMIT = { limit: 60, windowMs: 60_000 };
const PER_SITE_DAILY_LIMIT = { limit: 20_000, windowMs: 24 * 60 * 60 * 1000 };

function clientIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  return forwarded.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

function hashSecret(): string {
  return String(process.env.TRACKING_HASH_SECRET || process.env.CRON_SECRET || "automazing-track");
}

export function registerTrackingRoutes(
  app,
  { requireMembership, supabaseAdmin, getSessionUserId }: RegisterTrackingRoutesDeps
) {
  const trackerScript = buildTrackerScript();

  app.get("/api/track.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(trackerScript);
  });

  app.post("/api/track/pageview", text({ type: "*/*", limit: "2kb" }), async (req, res) => {
    // Always 204 from here on — see module docstring.
    const done = () => res.status(204).end();
    if (!supabaseAdmin) return done();

    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof req.body === "string" ? req.body : "{}");
    } catch {
      return done();
    }
    const payload = parsePageviewPayload(parsed);
    if (!payload) return done();

    const ip = clientIp(req);
    const userAgent = String(req.headers["user-agent"] || "");
    if (
      !checkRateLimit(`track:${payload.siteKey}:${ip}`, PER_VISITOR_LIMIT.limit, PER_VISITOR_LIMIT.windowMs).ok ||
      !checkRateLimit(`trackday:${payload.siteKey}`, PER_SITE_DAILY_LIMIT.limit, PER_SITE_DAILY_LIMIT.windowMs).ok
    ) {
      return done();
    }

    try {
      let site = siteCache.get(payload.siteKey);
      if (!site || site.expiresAt < Date.now()) {
        const { data } = await supabaseAdmin
          .from("site_tracking_sites")
          .select("business_profile_id,enabled")
          .eq("site_key", payload.siteKey)
          .maybeSingle();
        site = {
          businessProfileId: String(data?.business_profile_id || ""),
          enabled: Boolean(data?.enabled),
          expiresAt: Date.now() + SITE_CACHE_TTL_MS,
        };
        siteCache.set(payload.siteKey, site);
      }
      if (!site.businessProfileId || !site.enabled) return done();

      const { error } = await supabaseAdmin.from("site_visit_events").insert({
        business_profile_id: site.businessProfileId,
        session_hash: visitorHash(hashSecret(), payload.siteKey, ip, userAgent),
        path: payload.path,
        referrer_host: payload.referrerHost,
        device: deviceFromUserAgent(userAgent),
      });
      if (error) console.warn("[track] pageview insert failed:", error.message);
    } catch (e) {
      console.warn("[track] pageview unexpected:", e instanceof Error ? e.message : e);
    }
    return done();
  });

  app.get("/api/tracking/site", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });
    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");
    try {
      const { data, error } = await supabaseAdmin
        .from("site_tracking_sites")
        .select("site_key,enabled,created_at")
        .eq("business_profile_id", businessProfileId)
        .maybeSingle();
      if (error) return res.status(500).json({ error: "tracking_site_lookup_failed" });
      return res.json({
        siteKey: data?.site_key ?? null,
        enabled: data ? Boolean(data.enabled) : false,
        createdAt: data?.created_at ?? null,
      });
    } catch (e) {
      console.error("[tracking] site lookup:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "tracking_site_lookup_failed" });
    }
  });

  app.post("/api/tracking/site", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });
    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");
    const rotate = Boolean((req.body as { rotate?: boolean } | undefined)?.rotate);
    try {
      const { data: existing } = await supabaseAdmin
        .from("site_tracking_sites")
        .select("site_key")
        .eq("business_profile_id", businessProfileId)
        .maybeSingle();

      if (existing?.site_key && !rotate) {
        return res.json({ siteKey: existing.site_key, enabled: true, rotated: false });
      }

      const siteKey = generateSiteKey();
      const { error } = await supabaseAdmin.from("site_tracking_sites").upsert(
        {
          business_profile_id: businessProfileId,
          site_key: siteKey,
          enabled: true,
          rotated_at: existing?.site_key ? new Date().toISOString() : null,
        },
        { onConflict: "business_profile_id" }
      );
      if (error) return res.status(500).json({ error: "tracking_site_save_failed" });
      if (existing?.site_key) siteCache.delete(String(existing.site_key));
      return res.json({ siteKey, enabled: true, rotated: Boolean(existing?.site_key) });
    } catch (e) {
      console.error("[tracking] site save:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "tracking_site_save_failed" });
    }
  });

  app.get("/api/tracking/summary", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });
    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");
    const days = Math.min(90, Math.max(1, Number(req.query?.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { data, error } = await supabaseAdmin
        .from("site_visit_events")
        .select("created_at,session_hash,path,referrer_host,device")
        .eq("business_profile_id", businessProfileId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20_000);
      if (error) return res.status(500).json({ error: "tracking_summary_failed" });
      return res.json(summariseSiteVisits((data ?? []) as VisitEventRow[], days));
    } catch (e) {
      console.error("[tracking] summary:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "tracking_summary_failed" });
    }
  });

  /**
   * Cross-company overview: for each business profile the user belongs to,
   * the last 7 days of visitors, sales (from the daily marketing snapshots —
   * Shopify revenue/orders) and total followers (latest social snapshot).
   * Queries are bounded per profile; profiles are capped to keep the sweep
   * cheap.
   */
  app.get("/api/insights/companies", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });

    try {
      const { data: memberships, error: membErr } = await supabaseAdmin
        .from("memberships")
        .select("business_profile_id")
        .eq("user_id", userId)
        .limit(20);
      if (membErr) return res.status(500).json({ error: "companies_overview_failed" });

      const profileIds = [
        ...new Set(
          (memberships ?? [])
            .map((m: Record<string, unknown>) => String(m.business_profile_id || ""))
            .filter(Boolean)
        ),
      ].slice(0, 10);
      if (profileIds.length === 0) return res.json({ companies: [] });

      const { data: profiles } = await supabaseAdmin
        .from("business_profiles")
        .select("id,name")
        .in("id", profileIds);
      const nameById = new Map(
        (profiles ?? []).map((p: Record<string, unknown>) => [String(p.id), String(p.name || "")])
      );

      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const sinceDate7d = since7d.slice(0, 10);

      const companies = await Promise.all(
        profileIds.map(async (profileId) => {
          const [visits, snapshots, social] = await Promise.all([
            supabaseAdmin
              .from("site_visit_events")
              .select("created_at,session_hash")
              .eq("business_profile_id", profileId)
              .gte("created_at", since7d)
              .limit(10_000),
            supabaseAdmin
              .from("marketing_snapshots")
              .select("snapshot_date,revenue,orders,currency")
              .eq("business_profile_id", profileId)
              .gte("snapshot_date", sinceDate7d)
              .order("snapshot_date", { ascending: false })
              .limit(8),
            supabaseAdmin
              .from("social_stats_snapshots")
              .select("account_id,snapshot_date,followers")
              .eq("business_profile_id", profileId)
              .gte("snapshot_date", sinceDate7d)
              .order("snapshot_date", { ascending: false })
              .limit(200),
          ]);

          const visitRows = (visits.data ?? []) as Array<{ created_at: string; session_hash: string }>;
          const visitors = new Set(
            visitRows.map((r) => `${String(r.created_at).slice(0, 10)}:${r.session_hash}`)
          ).size;

          // Snapshots are cumulative windows, not daily deltas — the latest row
          // already covers the reporting window, so read it rather than summing.
          const latestSnapshot = ((snapshots.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;

          // Followers: latest snapshot per account, summed.
          const latestByAccount = new Map<string, number>();
          for (const row of (social.data ?? []) as Array<Record<string, unknown>>) {
            const accountId = String(row.account_id || "");
            if (!accountId || latestByAccount.has(accountId)) continue;
            if (row.followers != null) latestByAccount.set(accountId, Number(row.followers));
          }
          let followers = 0;
          for (const value of latestByAccount.values()) followers += value;

          return {
            businessProfileId: profileId,
            name: nameById.get(profileId) || "Namnlös profil",
            visitors7d: visitors,
            pageviews7d: visitRows.length,
            revenue: latestSnapshot?.revenue == null ? null : Number(latestSnapshot.revenue),
            orders: latestSnapshot?.orders == null ? null : Number(latestSnapshot.orders),
            currency: (latestSnapshot?.currency as string | null) ?? null,
            followers: latestByAccount.size > 0 ? followers : null,
          };
        })
      );

      return res.json({ companies });
    } catch (e) {
      console.error("[tracking] companies overview:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "companies_overview_failed" });
    }
  });
}
