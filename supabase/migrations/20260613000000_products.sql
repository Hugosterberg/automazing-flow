-- Product catalogue: the products a tenant sells, built up from Alibaba/1688
-- imports, Content-tagged images, Shopify syncs, or by hand.
--
-- Access model: written and read ONLY by the server using the service role,
-- through membership-gated routes (productRoutes). RLS is enabled with no
-- permissive policies, so anon/authenticated keys are denied — same pattern as
-- automation_settings / integration_secrets.
--
-- Shape notes:
--   * images / versions / specs are stored as JSONB matching the frontend
--     types (ProductImage / ProductVersion) so the API is a thin pass-through.
--   * external_id holds the Shopify product id for synced rows. The unique
--     constraint on (business_profile_id, connected_account_id, external_id)
--     makes re-syncing idempotent (upsert). Manual/Alibaba/Content products
--     leave external_id null; Postgres treats nulls as distinct so they never
--     collide on that constraint.
--
-- Additive + idempotent: safe to run multiple times.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  price text,
  currency text,
  source text not null default 'manual'
    check (source in ('manual', 'alibaba', 'shopify', 'content')),
  source_url text,
  external_id text,
  connected_account_id text references public.connected_accounts(id) on delete set null,
  status text,
  vendor text,
  product_type text,
  tags text[] not null default '{}',
  specs jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  versions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_profile_id, connected_account_id, external_id)
);

create index if not exists products_bp_updated_idx
  on public.products(business_profile_id, updated_at desc);

create index if not exists products_bp_source_idx
  on public.products(business_profile_id, source);

comment on table public.products is
  'Per-tenant product catalogue. Written by the server (service role only) via membership-gated routes. Shopify-synced rows carry external_id for idempotent upserts.';

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

alter table public.products enable row level security;
-- No permissive policies: all access is server-side via the service role.
