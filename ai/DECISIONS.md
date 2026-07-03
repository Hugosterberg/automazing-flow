# Decisions — standing choices and their rationale

_Lightweight ADR log. Newest first. Status: Active / Proposed / Reversed._

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
