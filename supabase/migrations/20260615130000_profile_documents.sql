-- Generic per-profile document store: one JSONB blob per (business_profile_id,
-- key). This is where everything that used to live only in the browser's
-- localStorage now persists, so a user sees the same data on every device.
--
-- Keys in use: "calendar-events", "customers", "goals", "content-selection",
-- "alibaba-import". Each page reads/writes its own key; the blob shape is owned
-- by the app, not the schema, so adding a new synced surface needs no migration.

create table if not exists public.profile_documents (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_profile_id, key)
);

create index if not exists profile_documents_bp_key_idx
  on public.profile_documents(business_profile_id, key);

drop trigger if exists profile_documents_touch_updated_at on public.profile_documents;
create trigger profile_documents_touch_updated_at
  before update on public.profile_documents
  for each row execute function public.touch_updated_at();

alter table public.profile_documents enable row level security;

drop policy if exists profile_documents_select on public.profile_documents;
create policy profile_documents_select on public.profile_documents
  for select using (public.is_member(business_profile_id));

drop policy if exists profile_documents_insert on public.profile_documents;
create policy profile_documents_insert on public.profile_documents
  for insert with check (public.is_member(business_profile_id));

drop policy if exists profile_documents_update on public.profile_documents;
create policy profile_documents_update on public.profile_documents
  for update using (public.is_member(business_profile_id))
  with check (public.is_member(business_profile_id));

drop policy if exists profile_documents_delete on public.profile_documents;
create policy profile_documents_delete on public.profile_documents
  for delete using (
    public.is_member_with_role(business_profile_id, array['owner','admin','editor'])
  );

comment on table public.profile_documents is
  'Per-profile JSONB documents (calendar events, customers CSV, goals, selections). Replaces device-local localStorage so data follows the user across devices.';
