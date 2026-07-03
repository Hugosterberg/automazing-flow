# Roadmap — versioned plan

_Numbered versions are deliberate increments, not a wish pile. When a version
ships, move its highlights to Shipped and renumber what's left. Last updated:
2026-07-02._

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

## v1 — Trust the automation (make what exists visibly reliable)

- [ ] Automations page: per-automation last-run status + next-run time surfaced
      from cron runs (no silent failures).
- [ ] Connection health: proactive re-auth nudges before tokens die (expiry
      notifier exists; make it actionable per platform).
- [ ] Eval/regression habit: golden cases for auto-reply drafts and digests so
      prompt changes can't silently regress.

## v2 — First CMA "AI employee"

- [ ] Pick and launch the first Claude Managed Agent (candidates: scheduled
      business digest with real research; repo engineer issue→PR; data analyst
      over business exports). Working folder: `c:\Code\launch-your-agent\my-agent\`.
- [ ] Wire its output into automazing (Activity feed entry or Daily Brief
      section) so agent work is visible inside the product.

## v3 — Multi-user SaaS readiness

- [ ] Sign-up flow hardening (onboarding already exists; add email domain
      capture, empty-state polish per workspace).
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
- Inbox triage beyond auto-reply (bucketing, priority queue).
