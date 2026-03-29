# AGENTS.md

## Project overview
This project is a web application for social media automation, content creation, publishing, digital marketing workflows, and analytics.

The repository already contains working code and an existing structure. Preserve the current architecture unless there is a strong reason to change it.

## Product focus
The product is focused on:
- social media operations
- content workflows
- scheduling and publishing
- analytics and reporting
- integrations with third-party platforms
- internal operational tooling for marketing and automation

## Core engineering priorities
- reliability over cleverness
- minimal safe diffs
- preserve working behavior
- incremental refactoring over large rewrites
- readability and maintainability
- safe async flows and automation behavior
- explicit analytics definitions
- provider-specific logic should be isolated when possible

## Guidance for working in this repository
Before making changes:
- first understand the current repo structure and local patterns
- prefer improving the current codebase over replacing it with a new architecture
- reuse existing components, helpers, hooks, and utilities where reasonable
- preserve naming and structure unless there is a clear improvement

When making changes:
- prefer small, reviewable changes
- avoid renaming or moving many files unless clearly justified
- avoid introducing unnecessary abstractions
- avoid rewriting large sections of code without approval
- preserve backward compatibility unless explicitly asked otherwise

## Frontend guidance
- keep page components focused on screen composition and page-level behavior
- move reusable or overly complex logic into hooks, helpers, or services when clearly beneficial
- avoid putting too much business logic directly in UI components
- preserve current UX behavior unless changes are requested
- handle loading, empty, error, and success states explicitly

## Backend and shared logic guidance
- keep route and handler logic thin when possible
- move reusable business logic into dedicated modules
- isolate external API and provider-specific logic
- validate external input
- avoid hidden side effects
- prefer explicit data flow and clear return shapes

## Automation guidance
This product contains automation logic and async workflows.

When working on automation-related code:
- avoid duplicate triggers, posts, sends, or executions
- think about retries, race conditions, provider instability, and partial failures
- prefer idempotent behavior when possible
- make automation flows explicit and traceable
- do not hide critical workflow logic inside UI code unless unavoidable

## Integrations guidance
This product integrates with third-party providers.

When working on integrations:
- identify what is provider-specific and what is app-specific
- avoid scattering provider-specific logic across the codebase
- prefer dedicated modules or helpers for external providers
- handle rate limits, transient failures, and partial success cases explicitly
- never hardcode secrets, tokens, or account identifiers

## Analytics guidance
When working on analytics or reporting:
- define metrics explicitly
- distinguish raw provider data from derived metrics
- make date range and timezone assumptions explicit
- avoid mixing calculations with presentation formatting when possible
- improve naming and clarity before introducing new analytics abstractions

## What good changes look like
Examples of good improvements:
- extracting reusable logic from large page files
- reducing duplication
- improving naming
- isolating provider-specific logic
- improving type safety
- making async flows easier to understand
- improving error handling
- separating calculation logic from presentation logic

## What to avoid
Avoid:
- unnecessary architecture rewrites
- large file moves or renames without strong justification
- introducing patterns that do not match the current codebase
- inventing libraries, APIs, environment variables, or database fields
- changing working behavior unless explicitly requested

## Refactoring policy
For refactors:
- first explain the current responsibilities in the file or module
- identify what should stay and what should move
- prefer the smallest safe refactor that improves clarity
- preserve behavior unless explicitly asked to change it
- if a larger refactor is needed, propose the plan before implementing it