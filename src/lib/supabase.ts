import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  redirectMismatchedAppOriginToCanonicalOrigin,
  redirectMismatchedAuthCallbackToCanonicalOrigin,
} from "@/lib/authRedirect";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
/** Matches Supabase dashboard / UI: publishable key (new) or legacy anon key names. */
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  ""
).trim();

const authCallbackRedirecting =
  redirectMismatchedAuthCallbackToCanonicalOrigin() || redirectMismatchedAppOriginToCanonicalOrigin();

export const supabaseEnabled = Boolean(supabaseUrl && supabaseKey && !authCallbackRedirecting);

/** Convenience alias: the app's fully-typed Supabase client. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Pure SPA client: session in localStorage (default). Avoids @supabase/ssr cookie storage,
 * which could lose session after external OAuth redirects (e.g. Instagram → back to /connect-accounts).
 *
 * Generic parameter `<Database>` binds the client to the schema in
 * `src/types/supabase.ts` so `.from(...)`, `.select(...)` etc. are type-checked
 * against the real DB schema.
 */
export const supabase: TypedSupabaseClient | null = supabaseEnabled
  ? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
