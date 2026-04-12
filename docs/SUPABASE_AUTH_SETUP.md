# Supabase setup (Google login + user profiles)

## 1) Environment variables

Add these in `.env` (frontend uses Vite variables):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
# Prefer the publishable key name from Supabase UI; anon key still works.
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY

# Legacy name (still supported in code):
# VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY

# Optional server-side aliases (backend reads VITE_* as fallback)
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
# SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

## 2) SQL schema

Run in Supabase SQL editor:

```sql
create table if not exists public.profiles (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.connected_accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  platform text not null,
  username text not null,
  display_name text,
  avatar_url text,
  profile_url text,
  connected_at timestamptz not null default now(),
  is_oauth boolean not null default false,
  is_zernio boolean not null default false,
  zernio_account_id text,
  stats jsonb,
  analysis jsonb
);

alter table public.profiles enable row level security;
alter table public.connected_accounts enable row level security;

create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = user_id);

create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = user_id);

create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "profiles_delete_own" on public.profiles
for delete using (auth.uid() = user_id);

create policy "accounts_select_own" on public.connected_accounts
for select using (auth.uid() = user_id);

create policy "accounts_insert_own" on public.connected_accounts
for insert with check (auth.uid() = user_id);

create policy "accounts_update_own" on public.connected_accounts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "accounts_delete_own" on public.connected_accounts
for delete using (auth.uid() = user_id);
```

## 3) Enable Google provider

In Supabase dashboard:

- Authentication -> Providers -> Google -> Enable
- Add OAuth Client ID/Secret from Google Cloud
- Add redirect URL from Supabase config to Google OAuth consent settings

## 4) Behavior in app

- Unauthenticated users see a Google sign-in screen.
- Authenticated users load and persist profiles/accounts per `user_id`.
- If Supabase is missing config, app shows a setup message.

## 5) Deploy on Vercel (this repo)

1. **Create a Vercel project** from the Git repo. Root directory = repo root. Build uses `vercel.json` (`npm run build` → `dist`) and `api/index.mjs` for `/api/*`.

2. **Environment variables** (Vercel → Project → Settings → Environment Variables), at minimum:

   | Variable | Purpose |
   |----------|---------|
   | `VITE_SUPABASE_URL` | Same as Supabase project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` | Public Supabase key (UI often calls it publishable) |
   | `VITE_APP_URL` | Production site URL, e.g. `https://your-app.vercel.app` (used for OAuth redirect back to the app) |
   | `BASE_URL` | Same as `VITE_APP_URL` (server redirects after OAuth) |
   | `API_BASE_URL` | Same as `VITE_APP_URL` on same-origin deploy (OAuth callbacks hit `/api/auth/...` on this host) |
   | `CORS_ORIGINS` | Same as `BASE_URL` (comma-separate if you have multiple front-end origins) |
   | `NODE_OPTIONS` | `--experimental-strip-types` (lets the API bundle load `server/**/*.ts` on Node 22; set on Vercel for Production + Preview) |

   Also copy every secret the backend needs locally: `GOOGLE_CLIENT_*`, `MICROSOFT_*`, `ZERNIO_API_KEY`, `OPENAI_API_KEY`, etc.

3. **Supabase dashboard** → Authentication → URL configuration:

   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: add `https://your-app.vercel.app/**` (or exact paths your app uses after Google via Supabase).

4. **Google Cloud / other OAuth providers**: add authorized redirect URIs that match **this deployment**, e.g. `https://your-app.vercel.app/api/auth/gmail/callback`, `.../api/auth/instagram/callback`, etc. (same patterns as local but with production host).

5. **Limitations (serverless)**:

   - `server/tokens.json` is **not durable** on Vercel (ephemeral filesystem). OAuth tokens for Gmail, Instagram, etc. may **reset** when the function cold-starts or redeploys. For reliable production tokens, plan to move token storage to Supabase/Postgres, KV, or run the API on a VM with a persistent disk (Railway, Fly, etc.).
   - Prefer **same-origin** deploy: leave `VITE_API_URL` unset so the browser calls `/api` on the same Vercel hostname.

6. **Preview deployments**: add each preview URL to `CORS_ORIGINS` (comma-separated) and to Supabase redirect allow list if you test login on previews.

