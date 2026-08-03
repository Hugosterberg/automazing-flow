# Decisions — standing choices and their rationale

_Lightweight ADR log. Newest first. Status: Active / Proposed / Reversed._

## 2026-08-03 — Guided Connect Session until verified healthy — **Active**

Every account link goes through an interactive Connect Session
(`src/features/connections/ConnectSession.tsx`): why → prerequisites → connect
→ auto-probe (`POST /api/connections/:id/resync`) → done or fix-and-retry.
Pending session state lives in `sessionStorage` so full-page OAuth can resume
on verify. First-win and priority wizard treat a platform as done only when
health is `healthy` (not merely present). Deep links use
`/connections?session=<platform>`. Preferences API keys remain operator secrets
(labelled “Advanced”), not the user-facing connect path.

## 2026-07-16 — UI language: SE → sv, else en; Preferences override — **Active**

Default UI language follows request country from Vercel’s `x-vercel-ip-country`
via `GET /api/geo`: Sweden → Swedish, every other country (and missing header
locally) → English. Explicit choice in Preferences (`app-language` in
localStorage) always wins; geo result is cached (`app-language-geo`) to avoid
a first-paint flash. Stack is i18next + react-i18next (`src/lib/i18n.ts`);
chrome (nav, layout, command palette, language settings) is the migration
pattern — migrate page copy incrementally, never invent locale URL segments
or a separate i18n service.

## 2026-07-16 — SaaS trust without inventing billing/legal URLs — **Active**

Workspace first-goal is a profile document (`workspace-goal`), not a new column.
Delete-data is surfaced under Preferences → Data (existing cascade). Weekly
results are auth-only copy/print (no public token route until decided). Landing
uses a founder reference case (no fake logos). Agent module is always listed in
Activity so CMA visibility does not depend on prior events. Formal Terms/Privacy
URLs and Stripe remain founder decisions.

## 2026-07-16 — Trust surfaces: quiet Brief, reconnect chrome, pre-enable explainers — **Active**

All-clear Brief shows proof of health (last sync, overnight OK runs) instead of
a single static line; digests still skip empty days. Reconnect uses a sticky
Layout banner for expired/failed/missing connections and token toasts re-fire
after 24h (banner is session-dismissible). Automations catalog may include
`explainer` / `exampleDraft` / `trustNote` for draft-before-send jobs. Empty
pages use `ValueSellEmpty` (outcome → trust → connect CTA).

## 2026-07-16 — Demo mode is client sandbox via profile documents — **Active**

Demoläge (`demo-mode` profile doc) injects sample `UnifiedMessage`s and seeds
mail/outreach/review draft queues + in-doc DM drafts. No new tables, no OAuth.
Ids prefixed `demo-` never call provider send APIs — UI toasts “Demo — inget
skickades”. Brief overlay uses max(live, sample) so real data always wins.
Approve drafts hub lives on Home → Idag (compact), not only under Mer.

## 2026-07-16 — First-win onboarding via profile documents — **Active**

Post-create redirect goes to `/connections?wizard=1&next=company`. Home shows
a first-win checklist and a “klart idag” strip; Connections shows a short
priority wizard by profile kind. Checklist dismiss/progress is stored in
profile document `first-win-checklist` — no new DB columns. Mail empty states
sell draft-before-send trust, not just “koppla konto”.

## 2026-07-16 — Modular routes + file budgets keep the monolith maintainable — **Active**

OAuth and cron handlers are extracted into `server/routes/oauth/*` and
`server/routes/cron/*`; the parent `oauthRoutes.ts` / `cronRoutes.js` files are
wiring-only. Page gods stay thin via `src/features/*` hooks/components.
Guardrails: `npm run check:structure` (budgets, no inline handlers, vercel cron
↔ module sync) and `src/test/routeRegistration.test.ts` (registration smoke).
Prefer extracting a new module over growing a wiring file or page past budget.
Do not invent a full Express/supertest suite — registration + pure-helper tests
match the repo's reliability-over-ceremony style.

## 2026-07-16 — Agent output lands in activity_events via CRON_SECRET ingest — **Active**

CMA / external agents do not get a dedicated table. They POST
`/api/agent-activity` with `Authorization: Bearer <CRON_SECRET>` and a
`businessProfileId` + `summary`. Server writes `activity_events` with
`module=agent`. Daily Brief surfaces last-24h agent rows; Activity deep-links
via `?module=agent`. Keeps tenancy + RLS intact without inventing schema.

## 2026-07-16 — Inbox triage is client-side buckets, drafts stay human-gated — **Active**

Meddelanden classifies each unified message into four action buckets
(Idag / Denna vecka / FYI / Brus) with pure heuristics on fields we already
fetch (from, subject, snippet, body, kind, unread/starred). No new DB tables,
no auto-archive, no auto-send. Bulk/noreply signals act as a *ceiling* so
newsletters cannot land in Idag. Sort default remains "triage"; filter chips
and `?bucket=` deep-links let Daily Brief jump straight to Idag. Local snooze
(profile document `messages-snoozed`) can defer a row until tomorrow / next
week without touching the provider. Future AI re-rank or learned overrides can
layer on without changing the taxonomy.

## 2026-07-13 — Integration UX: one status language, one connect home — **Active**

For multi-integration platforms, end users need a single vocabulary and a
single place to connect. Connections Center is the home for account linking;
Preferences “API-nycklar” is for secrets/tests. User-facing surfaces use
`ConnectionStatus` (`Kopplad` / `Kräver återanslutning` / …), not the DB health
labels (“Frisk”). Catalog `connectSteps` point to Kopplingar; section
checklists respect reconnect/error; dual OAuth paths lead with the recommended
default. Feature pages deep-link to Kopplingar (and `?filter=attention` when
relevant) instead of maintaining parallel English OAuth copy — defaults live in
`oauthErrors.ts`. Prefer fixing surfacing over inventing parallel connect UIs.
Stale sync (24 h) is freshness, not health: point users to attention filter /
resync, not the Health tab alone.

## 2026-07-13 — Logged-in mobile chrome aims for native app feel — **Active**

On phones: header drops duplicate mode tabs (mode lives in Mer), bottom tabs
use press/active affordances, Mer is a launcher-style bottom sheet with
grabber, and route changes use a short enter motion. Shared
`--app-tab-bar-offset` / `.pb-tab-bar` keep FAB/content clearance consistent.
Hem uses 2-col widget tiles + pressable Brief rows; Notiser and Sök open as
bottom sheets; drawer/sheets/tab language stays consistent. Do not invent a
second chrome system — extend Layout + MobileQuickNav + sheets + Hem.

## 2026-07-13 — Pre-login landing is kinetic B&W brand theater — **Active**

The logged-out landing leads with a full-bleed `automazing` brand mark,
minimal copy (“Automatiskt. Amazing.”), and a mechanical atmosphere
(SVG gears, bolts, speed streaks) instead of dashboard-style hero chrome.
Color stays black/white premium; motion conveys speed and efficiency.
Auth stays sticky on desktop below the fold / side rail so signup conversion
is preserved without polluting the first viewport.

## 2026-07-13 — Custom mobile quick-nav prefs per profile — **Active**

Users can choose primary bottom-bar shortcuts and Hem “Gå till” destinations.
Stored as a profile document (`quick-nav-prefs`) with localStorage legacy
fallback. Hem and Mer stay fixed; max three pins each; destinations that share
a path prefix (e.g. content + drive-library) cannot both be pinned. Defaults
differ by workspace mode (business includes Recensioner; private uses Innehåll).

## 2026-07-02 — MCP providers are config, features go through mcpAccess — **Active**

Remote MCP servers are described by descriptors (mcpOauth/mcpDirectory), not
bespoke modules; product features consume them via `server/lib/mcpAccess.ts`
(tenant lookup, token refresh, pattern-based tool picking) — never raw fetch.
Dashboard features fail QUIET (hide when not connected); user actions fail
LOUD (explicit errors with the connect path). Vendor tool names are matched by
pattern + inputSchema, never hardcoded. Google Drive/Gmail MCP endpoints were
deliberately skipped — the REST integrations already cover them.

## 2026-07-02 — Workspace mode is derived, never stored — **Active**

Private/Business is computed from the active profile's `kind` instead of being
its own state. Rationale: every data hook is already keyed on the active
profile, so deriving the mode makes all tenant scoping correct by construction;
a stored mode could drift from the active profile. Consequence: switching
workspace = switching profile; profile pickers stay within the current mode.

## 2026-07-02 — C# ingest service is Proposed, not started — **Proposed**

A separate C# data-ingest service is on the table (see ARCHITECTURE.md). Gate:
a concrete workload the Node monolith measurably can't serve. Until then, new
data work lands in `server/` as usual. Revisit when a real ingest job exists.

## 2026-06 — One connected account per (profile, platform) — **Active**

Connecting a platform replaces the previous account on that platform for the
profile. Rationale: predictable UX, no ambiguous "which account does this
section use" states; dedupe rules enforce it on read and write.

## 2026-06 — Per-tenant secrets, encrypted at rest — **Active**

Tenants can hold their own provider keys (`secretCrypto`/`secretResolver`),
resolved per business profile at call time. Rationale: multi-tenant SaaS can't
share one global provider credential set; encryption keeps the DB dump safe.

## 2026-05 — TypeScript monolith until proven otherwise — **Active**

One repo, one Express app, one SPA. Rationale: a solo founder + agent workforce
iterates fastest in a single deployable; service boundaries are added when a
workload demands them (see the C# proposal), not preemptively.

## 2026-05 — RLS on every table, no exceptions — **Active**

All tables carry `business_profile_id` (or user scoping) with row-level
security enabled. Audited 2026-06 (fixed memberships-insert escalation).
New tables must ship with their RLS policies in the same migration.
