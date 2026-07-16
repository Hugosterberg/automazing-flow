# Roadmap — versioned plan

_Numbered versions are deliberate increments, not a wish pile. When a version
ships, move its highlights to Shipped and renumber what's left. Last updated:
2026-07-16._

## Shipped (highlights)

- Multi-tenant core: business_profiles, RLS on all 19 tables, per-tenant
  encrypted secrets, memberships.
- Integrations: Zernio social suite, Google/Microsoft mail + calendar, Shopify,
  Notion, Canva, Meta/TikTok/X, reviews (Google/Tripadvisor).
- Automation layer: DM auto-reply engine, daily digest, marketing alerts +
  snapshots, weekly report, AI recommendations — all on Vercel Cron.
- **Private/Business workspace mode** (header tabs, mode derived from profile
  kind, per-mode nav/catalog) + Automations page gathering all automation
  toggles in one place.
- Home dashboard: Smart Daily Brief, Today tiles, business health score.
- **Custom mobile genvägar** (2026-07-13): users pin primary bottom-bar
  shortcuts and Hem “Gå till” cards per profile (Mer → Anpassa, Inställningar
  → Genvägar).
- **Remote MCP layer** (2026-07-02): 16 providers connectable (OAuth + keyed),
  tenant-scoped tool access (`mcpAccess`), Market pulse on the dashboard
  (LunarCrush), lead research in Sales (Exa/Sprouts).
- **First CMA agent live**: `bai-repo-engineer` passed its outcome rubric on
  run 1 (Automations run-status feature; patch in
  `c:\Code\launch-your-agent\my-agent\outputs\`, ready to review/apply).
- **Visitor & sales tracking** (2026-07-13, PR #26): first-party cookieless
  website analytics (site key + /api/track.js snippet + hashed pageview
  ingest), visitor charts and top pages/referrers on /insights, Shopify
  orders panel in the marketing trend chart, and a cross-company overview
  (7-day visitors/sales/followers per business profile).
- **Dashboards & daily-process batch** (2026-07-13): social stats snapshots
  (`social_stats_snapshots` + cron) with week-over-week deltas on the Social
  KPI cards; daily marketing/ROAS charts and AI cost-per-day chart from
  existing snapshot tables; data-freshness strip on Home with one-click
  resync; Daily Brief upgraded to done/snooze with progress; token-expiry
  nudges now name the platform and deep-link to its Connections card.
- **Inbox triage buckets** (2026-07-16): client-side classifier maps mail/DMs
  into Idag / Denna vecka / FYI / Brus; filter chips + sort on Meddelanden;
  Daily Brief deep-links to `?bucket=today`; local snooze (imorgon / nästa vecka);
  “Skapa uppgift” from message detail. Heuristics only (no new tables).
- **Agent activity ingest** (2026-07-16): `POST /api/agent-activity` (CRON_SECRET)
  → `activity_events` module=agent; Brief + Activity `?module=agent`.
- **UX chrome trim** (2026-07-16): SmartBar/AI strips scoped to when they help;
  Mer-collapsibles closed by default; Digital Brand website edit → Företag;
  Reviews/Ecommerce connection status hidden when healthy.

## v1 — Trust the automation (make what exists visibly reliable)

- [x] Automations page: per-automation last-run status + next-run time surfaced
      from cron runs (no silent failures). _Shipped: AutomationRunStatus +
      retry on the Automations page._
- [x] Connection health: proactive re-auth nudges before tokens die (expiry
      notifier exists; make it actionable per platform). _Shipped: toast names
      the platform and deep-links to its card via `/connections?filter=attention&q=…`._
- [x] Eval/regression habit: golden cases for auto-reply drafts and digests so
      prompt changes can't silently regress. _Shipped: `server/ai/evals/goldenCases.ts`
      + `src/test/aiEvalGolden.test.ts` (fallback drafts + brief all-clear)._

## v2 — First CMA "AI employee"

- [ ] Pick and launch the first Claude Managed Agent (candidates: scheduled
      business digest with real research; repo engineer issue→PR; data analyst
      over business exports). Working folder: `c:\Code\launch-your-agent\my-agent\`.
- [x] Wire its output into automazing (Activity feed entry or Daily Brief
      section) so agent work is visible inside the product. _Ingest:
      `POST /api/agent-activity` → `activity_events` (module=agent); Brief shows
      last-24h agent updates; Activity supports `?module=agent`. Still need the
      agent process to call the endpoint after each run._

## v2.5 — Product adoption (first win → habit)

_Make more people want to stay after day one. Checklist lives as profile
document `first-win-checklist` (no new tables)._

- [x] Guided first-win checklist on Home (connect mail → channel → inbox →
      automation → company when relevant).
- [x] Prioritized connect wizard on `/connections?wizard=1` (personal vs
      company recommendations).
- [x] Value-selling empty state on Meddelanden mail tab (draft-before-send).
- [x] Home “klart idag” strip from success activity events.
- [x] Demo / sample-data mode (profile doc `demo-mode`) — fake inbox + draft
      queues; send is no-op for `demo-*` ids.
- [x] Approve drafts hub on Home → Idag (DM/mail/outreach/reviews).
- [ ] Deeper empty-state pass (Kalender, E-handel, Content, Sales) with same
      value-selling pattern.
- [ ] Public landing / marketing site polish (outside app shell).

## v3 — Multi-user SaaS readiness

- [ ] Sign-up flow hardening (email domain capture; invite flow).
- [ ] Billing decision (Stripe?) + free-tier limits per business profile.
- [ ] Terms/privacy + data-deletion story (delete profile already cascades).

## v4 — C# ingest service (only if a workload demands it)

- [ ] Identify the concrete ingest workload (streaming/heavy ETL) that the Node
      monolith can't serve; write the ADR in DECISIONS.md before code.
- [ ] Contract-first OpenAPI + generated TS client; tenancy rules per
      ARCHITECTURE.md.

## Parked / ideas

- Bitcoin angle for BAI Digital (treasury dashboard? on-chain data slice?) —
  needs founder definition before it enters a version.
- Generated UI on top of CMA agents (results viewer inside automazing).
- Inbox triage v2: AI re-rank / learn-from-Klar overrides, server-side labels,
  header-aware bulk detection (List-Unsubscribe) once providers expose headers.
