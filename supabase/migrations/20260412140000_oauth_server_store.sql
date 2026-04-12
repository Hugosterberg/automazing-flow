-- Server-side OAuth CSRF state (shared across Vercel instances) and OAuth token payloads
-- (replaces ephemeral tokens.json when SUPABASE_SERVICE_ROLE_KEY is set on the API).

create table if not exists public.oauth_pending_states (
  state text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_pending_states_expires_at_idx
  on public.oauth_pending_states (expires_at);

create index if not exists oauth_pending_states_created_at_idx
  on public.oauth_pending_states (created_at desc);

comment on table public.oauth_pending_states is
  'Short-lived OAuth state (PKCE, userId, profileId). Written only by the API with service role.';

create table if not exists public.oauth_token_entries (
  account_id text primary key,
  user_id text not null default '',
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists oauth_token_entries_user_id_idx
  on public.oauth_token_entries (user_id);

comment on table public.oauth_token_entries is
  'OAuth tokens and connection metadata per app account_id; scoped by user_id for listing. Service role only.';

alter table public.oauth_pending_states enable row level security;
alter table public.oauth_token_entries enable row level security;
