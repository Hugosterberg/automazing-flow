-- Per-profile automation run schedules (weekdays + times per day).
-- Stored as JSON keyed by automation cron key; server gates cron handlers.

alter table public.automation_settings
  add column if not exists job_schedules jsonb not null default '{}'::jsonb;

comment on column public.automation_settings.job_schedules is
  'Per-automation schedule: enabled, timezone, days (1=Mon..7=Sun), timesPerDay, startTime, endTime. Keyed by cron automation_key.';
