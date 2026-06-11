-- Profile kind (company vs personal) + auto-reply automation.
--
-- 1. business_profiles.kind — a user can run several profiles in the same app:
--    one per company plus a personal/private one. `kind` only affects labels,
--    icons and AI tone defaults; all multi-tenant behaviour stays identical.
--
-- 2. automation_settings — per-profile switches for the auto-reply automation
--    (currently social DMs through the Zernio inbox). Mode 'draft' keeps a
--    human in the loop (AI drafts are logged, nothing is sent); mode 'send'
--    lets the server send the AI reply directly.
--
-- 3. auto_reply_log — idempotency + audit trail. One row per handled inbound
--    message; the unique (business_profile_id, kind, external_id) constraint is
--    what prevents duplicate replies across overlapping cron runs.
--
-- Access model: automation_settings and auto_reply_log are touched ONLY by the
-- server using the service role (same pattern as integration_secrets). RLS is
-- enabled with no permissive policies so anon/authenticated keys are denied.
--
-- Additive + idempotent: safe to run multiple times.

-- -------------------------------------------------------------------------
-- 1. business_profiles.kind
-- -------------------------------------------------------------------------
alter table public.business_profiles
  add column if not exists kind text not null default 'company';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profiles_kind_check'
  ) then
    alter table public.business_profiles
      add constraint business_profiles_kind_check
      check (kind in ('company', 'personal'));
  end if;
end $$;

comment on column public.business_profiles.kind is
  'Profile type: company (business/brand/client) or personal (private life). Affects labels and AI defaults only.';

-- -------------------------------------------------------------------------
-- 2. automation_settings (one row per business_profile)
-- -------------------------------------------------------------------------
create table if not exists public.automation_settings (
  business_profile_id uuid primary key references public.business_profiles(id) on delete cascade,
  dm_auto_reply_enabled boolean not null default false,
  dm_auto_reply_mode text not null default 'draft' check (dm_auto_reply_mode in ('draft', 'send')),
  tone text not null default 'warm, professional and concise',
  language text not null default 'the same language as the message',
  instructions text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.automation_settings is
  'Per-tenant auto-reply automation switches. Written by the server (service role only) via membership-gated routes.';

alter table public.automation_settings enable row level security;

-- -------------------------------------------------------------------------
-- 3. auto_reply_log (idempotency + audit)
-- -------------------------------------------------------------------------
create table if not exists public.auto_reply_log (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  kind text not null default 'dm' check (kind in ('dm', 'review')),
  external_id text not null,
  conversation_id text,
  zernio_account_id text,
  platform text,
  author_name text,
  incoming_text text,
  draft_text text,
  status text not null check (status in ('drafted', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (business_profile_id, kind, external_id)
);

create index if not exists auto_reply_log_bp_created_idx
  on public.auto_reply_log(business_profile_id, created_at desc);

comment on table public.auto_reply_log is
  'One row per inbound message handled by the auto-reply automation. The unique constraint on (business_profile_id, kind, external_id) is the idempotency guard.';

alter table public.auto_reply_log enable row level security;
