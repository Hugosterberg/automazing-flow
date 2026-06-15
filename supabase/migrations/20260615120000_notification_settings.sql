-- Per-profile notification preferences for the automated updates (daily digest
-- + marketing alerts). Lives on automation_settings, the existing per-profile
-- switchboard, so the Company/Updates page reads and writes one row per tenant.
--
-- All default OFF so no email goes out until a profile explicitly opts in — the
-- digest/marketing-alert crons gate on these flags.

alter table public.automation_settings
  add column if not exists daily_digest_enabled boolean not null default false,
  add column if not exists marketing_alerts_enabled boolean not null default false,
  add column if not exists notification_email text;

comment on column public.automation_settings.notification_email is
  'Where automated updates are emailed. Falls back to the business profile email, then the owner login email.';
