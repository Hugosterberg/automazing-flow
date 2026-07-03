# ai/ — context for AI agents working in this repo

This folder is the **business and product context** for any AI agent (Claude Code,
Cursor, CMA workers, future "AI employees") contributing to automazing. Read it
before making product decisions. Engineering rules live in the repo-root
[AGENTS.md](../AGENTS.md) — that file governs *how* to write code; this folder
explains *what we are building and why*.

## Contents

| File | What it holds | Update when |
|---|---|---|
| [VISION.md](./VISION.md) | BAI Digital + automazing.life — the company and product vision | The vision itself shifts (rare; founder-owned) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Current stack, tenancy model, integrations, planned services | Any structural change (new service, new tenancy rule, new integration class) |
| [ROADMAP.md](./ROADMAP.md) | Versioned plan: what's done, what's next, what's parked | A version ships or the plan reorders |
| [DECISIONS.md](./DECISIONS.md) | Log of standing decisions with rationale (lightweight ADRs) | A decision is made, changed, or reversed |

## Ways of working (the loop)

- **One founder, agent workforce.** Hugo is CEO and the only human; features are
  built by AI agents working in loops. Agents are expected to work autonomously
  end-to-end: explore → plan → implement → verify → document.
- **Vertical slices.** A feature owns its whole slice: UI (`src/features/<name>/`
  + page), server route (`server/routes/`), and data (Supabase migration). Don't
  scatter a feature across horizontal layers.
- **Definition of done.** `npm run verify` green (typecheck server+client, lint,
  tests, build) **and** the change observed working in the running app. New
  pages/nav items must declare workspace `modes` (private/business) in
  `src/components/navConfig.ts`.
- **Keep this folder true.** Updating ROADMAP.md and DECISIONS.md when your work
  changes them is part of a feature's definition of done — stale context is
  worse than no context.
- **Their account, their data.** Everything is tenant-scoped by
  `business_profiles.id`. Never write cross-tenant logic; RLS is on for all
  tables and must stay that way.
