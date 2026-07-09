-- AI & MCP usage events: token estimates and tool-call attribution per tenant.
-- Append-only; written by the server (service role), readable by profile members.

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  run_id text,
  kind text not null check (kind in ('openai', 'mcp', 'apiai')),
  feature_id text not null,
  model text,
  provider text,
  tool_name text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_usd numeric(12, 6),
  query_preview text,
  tools_selected jsonb not null default '[]'::jsonb,
  selection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_bp_time_idx
  on public.ai_usage_events(business_profile_id, created_at desc);

create index if not exists ai_usage_events_feature_idx
  on public.ai_usage_events(business_profile_id, feature_id, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists ai_usage_events_select on public.ai_usage_events;
create policy ai_usage_events_select on public.ai_usage_events
  for select using (public.is_member(business_profile_id));

comment on table public.ai_usage_events is
  'Per-call AI/MCP usage with estimated USD cost and tool-selection rationale for transparency.';
