# Vision — BAI Digital & automazing.life

## The company

**BAI Digital** is a Bitcoin & AI company built as: **Hugo as CEO, the rest AI
agents.** The agents are the workforce — they build features in a vertical slice
architecture, each working its own slice in loops, with Hugo directing and
approving. The company itself is the proof of the product: an organisation that
runs on automation.

## The product

**automazing** (deployed at [automazing.life](https://automazing.life)) automates
Hugo's entire life — private and business. In the founder's words:

> "automazing ska automatisera hela mitt privata liv och alla mina företag.
> Allt som jag lägger tid på och behöver hålla koll på ska den hålla koll på
> åt mig."

Concretely: everything Hugo spends time on or needs to keep track of — social
media, e-commerce, marketing, reviews, mail/DMs, calendar, tasks, leads,
customers — flows into one app that watches it, summarises it, and increasingly
acts on it (auto-replies, alerts, digests, scheduled agents).

## The two audiences

1. **Hugo today** — the app runs his private life (Private workspace) and his
   companies (Business workspace, one business profile per company/brand).
2. **Everyone else tomorrow** — the same product as multi-tenant SaaS: other
   founders and individuals sign up and get the same "it keeps track for you"
   experience. Multi-tenancy (business_profiles + RLS) is already built with
   this in mind; sign-up hardening, billing, and onboarding polish are the gap.

## Product principles

- **Signal over noise.** Digests, alerts, and badges only fire when there is
  something to act on (see the daily-digest "all-clear profiles are skipped"
  pattern). The app earns trust by being quiet when things are fine.
- **Automation must be safe.** Idempotent flows, no duplicate sends/posts,
  drafts-before-send where the blast radius is real. (AGENTS.md codifies this.)
- **One login, separate spaces.** Private and Business are one product with one
  identity, split by workspace mode — never two apps.
- **Integrations are the moat.** The value grows with every connected platform;
  provider-specific logic stays isolated so adding the next one stays cheap.
