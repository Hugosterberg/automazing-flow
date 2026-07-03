# Architecture — current state and planned services

_Last updated: 2026-07-02._

## Current stack (the TypeScript monolith)

| Layer | Tech | Where |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript, Tailwind + shadcn/radix, TanStack Query, react-router 7 | `src/` |
| Backend | Express 5 on Node 22 (`--experimental-strip-types`, TS route files) | `server/` |
| Data | Supabase Postgres — RLS on **all** tables; generated types in `src/types/supabase.ts` | `supabase/migrations/` |
| Hosting | Vercel — SPA + one serverless function (`api/index.mjs` wraps the Express app), cron jobs in `vercel.json` | `api/`, `vercel.json` |
| Auth | Supabase Google sign-in (cloud mode) with a local dev mode fallback | `src/context/AuthContext.tsx` |

## Tenancy model (the most important invariant)

- **`business_profiles` is the tenant key.** One row per company/brand/client —
  or the user's personal space (`kind: "company" | "personal"`).
- Every data hook and query is keyed by the active business profile id; every
  table carries it and RLS enforces it.
- **Workspace mode** (Private/Business header tabs) is *derived* from the active
  profile's `kind`, never stored separately — `src/features/workspace-mode/`.
  Nav items declare `modes` in `src/components/navConfig.ts`.
- Per-tenant secrets are encrypted server-side (`server/lib/secretCrypto.ts`,
  `secretResolver.ts`) so each tenant can hold its own provider keys.

## Vertical slices

A feature = one slice: `src/features/<name>/` (+ a page in `src/pages/`),
a route module in `server/routes/`, provider logic in `server/providers/`,
and its migration. Current slices: activity, ai-recommendations, automation,
business-profiles, connections, content, customers, daily-brief, ecommerce,
leads, marketing, preferences, profile-documents, tasks, workspace-mode.

## Integrations (via `server/providers/` + `src/lib/connectionCatalog.ts`)

Zernio (social inbox/publish: Instagram, Facebook, WhatsApp, Google Business,
Tripadvisor…), Google (Gmail, Calendar, Drive, Ads, Business Profile, Reviews,
YouTube), Microsoft (Outlook mail + calendar), Shopify, Notion, Canva, Meta
Business, TikTok, X, Tripadvisor. Pattern: OAuth init/callback in
`server/routes/oauthRoutes.ts`, provider isolation in `server/providers/`,
one connected account per (profile, platform).

## Scheduled automation (Vercel Cron → `server/routes/cronRoutes.js`)

cleanup-oauth-pending · refresh-ai-recommendations · auto-reply (15 min) ·
daily-digest · marketing-alerts · marketing-snapshot · weekly-report.
All guarded by `CRON_SECRET`, all per-tenant-isolated, all fail-closed.

## Planned: C# data-ingest service (status: **proposed, not decided**)

The idea: a separate C# service that ingests data (heavier/streaming workloads)
and exposes an API the web app consumes. Standing guidance when/if this starts:

1. **Don't add it until a concrete workload demands it** — a real ingest job the
   Node monolith measurably can't serve well. The monolith stays the default.
2. **Contract-first.** The C# service exposes an OpenAPI spec; the TS side
   generates its client types from it. No shared DB writes — the service owns
   its data or writes through defined endpoints.
3. **Same tenancy rules.** Every ingested row carries `business_profile_id`;
   the service authenticates service-to-service, never with user tokens.
4. **Separate repo or `/services/ingest/`** — either works; pick separate repo
   if its deploy cadence differs from the web app.

## Possible next platform layer: Claude Managed Agents (CMA)

For "AI employee" style workers (scheduled research, digests, repo work), CMA
is the candidate harness: Anthropic hosts the loop + sandbox; we define agent,
outcome rubric, and schedule. First experiment tracked in ROADMAP.md.
