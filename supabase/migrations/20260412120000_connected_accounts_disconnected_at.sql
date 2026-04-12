-- Soft-disconnect: keep row for "previously connected" UI (orange state on reconnect hub).
alter table public.connected_accounts
  add column if not exists disconnected_at timestamptz null;

comment on column public.connected_accounts.disconnected_at is
  'Set when user disconnects; null means active. Used to show historical connections.';
