-- Quality-pass hardening: indexes for query patterns that already exist in
-- application code but never got a matching index, plus a missing CHECK
-- constraint on products.status.
--
-- All additive and idempotent (create index if not exists / guarded add
-- constraint). Safe to run multiple times.

-- =========================================================================
-- 1. connected_accounts(business_profile_id, platform) — every cron that
--    resolves "the Meta/Google/Shopify account for this profile" filters on
--    both columns together (server/lib/marketingCampaignActions.ts,
--    server/routes/cron/dailyDigest.js, server/routes/cron/marketingActions.js).
--    Only (business_profile_id) and (business_profile_id, disconnected_at)
--    exist today, so this lookup falls back to scanning every connection a
--    profile has instead of jumping straight to the one platform it wants.
-- =========================================================================
create index if not exists connected_accounts_bp_platform_idx
  on public.connected_accounts(business_profile_id, platform);

-- =========================================================================
-- 2. (business_profile_id, created_at desc) on tasks / leads /
--    ai_recommendations — the "list everything for this profile, newest
--    first" read (src/features/tasks/tasksService.ts,
--    src/features/leads/leadsService.ts,
--    src/features/ai-recommendations/aiRecommendationsService.ts) is a
--    different access pattern than the existing bp+status indexes: those
--    serve "give me the open ones" but not "give me all of them in order",
--    so today that query needs an explicit Sort step. This index lets
--    Postgres walk it back-to-front instead.
-- =========================================================================
create index if not exists tasks_bp_created_idx
  on public.tasks(business_profile_id, created_at desc);

create index if not exists leads_bp_created_idx
  on public.leads(business_profile_id, created_at desc);

create index if not exists ai_recs_bp_created_idx
  on public.ai_recommendations(business_profile_id, created_at desc);

-- =========================================================================
-- 3. automation_settings partial indexes for the opt-in flags every digest/
--    alert cron filters on (server/routes/cron/dailyDigest.js:
--    `.eq("daily_digest_enabled", true)`, marketingAlerts.js: `.eq
--    ("marketing_alerts_enabled", true)`). Both default to false and are
--    expected to stay a minority as the platform grows, which is exactly
--    the shape a partial index is for — mirrors the existing
--    `sync_runs_status_idx ... where status in ('queued','running')`
--    partial-index convention already used elsewhere in this schema.
-- =========================================================================
create index if not exists automation_settings_daily_digest_idx
  on public.automation_settings(business_profile_id)
  where daily_digest_enabled;

create index if not exists automation_settings_marketing_alerts_idx
  on public.automation_settings(business_profile_id)
  where marketing_alerts_enabled;

-- =========================================================================
-- 4. products.status CHECK constraint — every other status/kind/role column
--    in this schema is constrained (business_profiles.status, leads.status
--    enum, automation_runs.status, ...); products.status was left as bare
--    text. Values come straight from Shopify's product status
--    (`server/providers/shopify.ts:1001`: `active`/`draft`/`archived`) for
--    synced rows, and are left null for manual/Alibaba/Content-sourced
--    products that don't have a lifecycle state.
-- =========================================================================
do $$
begin
  alter table public.products
    add constraint products_status_check
    check (status is null or status in ('active', 'draft', 'archived'));
exception when duplicate_object then null;
end $$;
