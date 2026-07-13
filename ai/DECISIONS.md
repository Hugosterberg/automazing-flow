# Decisions — standing choices and their rationale

_Lightweight ADR log. Newest first. Status: Active / Proposed / Reversed._

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
