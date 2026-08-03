# Architecture — current state and planned services

_Last updated: 2026-07-16._

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
leads, marketing, messages, preferences, profile-documents, tasks,
workspace-mode.

Agent run visibility (no dedicated table): CMA / external agents POST
`/api/agent-activity` (CRON_SECRET) → `activity_events` with `module=agent`;
Daily Brief reads the last 24h of those rows.

```http
POST /api/agent-activity
Authorization: Bearer <CRON_SECRET>
Content-Type: application/json

{
  "businessProfileId": "<uuid>",
  "summary": "bai-repo-engineer: Automations run-status patch ready",
  "agent": "bai-repo-engineer",
  "runId": "run-42",
  "severity": "success"
}
```

## Integrations (via `server/providers/` + `src/lib/connectionCatalog.ts`)

Zernio (social inbox/publish: Instagram, Facebook, WhatsApp, Google Business,
Tripadvisor…), Google (Gmail, Calendar, Drive, Ads, Business Profile, Reviews,
YouTube), Microsoft (Outlook mail + calendar), Shopify, Notion, Canva, Meta
Business, TikTok, X, Tripadvisor. Pattern: OAuth **wiring** in
`server/routes/oauthRoutes.ts` (register* only); platform handlers live in
`server/routes/oauth/*OAuthRoutes.ts`. Provider isolation in
`server/providers/`. One connected account per (profile, platform).

Client side, an integration is declared in three places that are kept in sync by
tests: `src/lib/connectionCatalog.ts` (what it is, where it lives),
`connectAuthPath.ts` (which server route starts the flow — exhaustive over
non-MCP platforms, so a missing entry is a compile error), and
`connectGuides.ts` (the step-by-step guide shown on the Connections row).
`src/test/connectionRegistration.test.ts` asserts the three agree with the
routes the server actually registers. Checklist: `docs/KOPPLINGAR.md`.

## Scheduled automation (Vercel Cron → modular cron modules)

`vercel.json` lists cron paths. Implementations live in
`server/routes/cron/*.js` (`registerXCron`); `server/routes/cronRoutes.js` only
wires them. `npm run check:structure` fails if a vercel cron path has no
module, or if handlers are added inline to the wiring files.

All guarded by `CRON_SECRET`, all per-tenant-isolated, all fail-closed.

## Frontend page composition

Heavy screens (Messages, Content, Ecommerce, Calendar) are composition pages
under `src/pages/`; logic and UI live in `src/features/<area>/` hooks and
components. File budgets are enforced by `npm run check:structure`.

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

## Remote MCP integrations (added 2026-07-02)

automazing consumes remote MCP servers as tenant-scoped data providers:

- **Protocol client:** `server/lib/mcpClient.ts` (JSON-RPC over Streamable
  HTTP, initialize/tools-list/tools-call, SSE-or-JSON parsing).
- **Provider directories:** `server/providers/mcpOauth.ts` (OAuth + PKCE +
  dynamic client registration: Day.ai, Windsor, Era, Ahrefs, Canva MCP,
  Superhuman, Supermetrics) and `mcpDirectory.ts` (API-key/shop/keyless:
  Exa, Klarity, LunarCrush, Peec, Sprouts, Gamma, GoDaddy, Shopify
  Storefront, Twilio Docs). Adding a provider = one descriptor.
- **Account plumbing:** `server/routes/mcpRoutes.ts` (connect + per-account
  tools/call), OAuth flows via `registerMcpOAuthRoutes` under
  `/api/auth/mcp/:platform`.
- **Tenant access layer:** `server/lib/mcpAccess.ts` — find a profile's
  connected provider, transparent OAuth refresh, tool picking by pattern.
  **Product features must go through this layer**, never raw fetches.
- **Feature routes:** `server/routes/intelligenceRoutes.ts` — market pulse
  (LunarCrush → home dashboard) and lead research (Exa/Sprouts → Sales).
  Frontend feature: `src/features/intelligence/`.
- Catalog area "Intelligence & MCP" on the Connections page; platforms are
  `IntelligencePlatform` in `src/types/accounts.ts`.
- Deliberately NOT added: Google Drive/Gmail MCP endpoints — the REST
  integrations already cover them with the same tokens; revisit only when the
  AI layer needs tool-style access.

## Possible next platform layer: Claude Managed Agents (CMA)

For "AI employee" style workers (scheduled research, digests, repo work), CMA
is the candidate harness: Anthropic hosts the loop + sandbox; we define agent,
outcome rubric, and schedule. First experiment tracked in ROADMAP.md.
