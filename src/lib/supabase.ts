import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
/** Matches Supabase dashboard / UI: publishable key (new) or legacy anon key names. */
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  ""
).trim();

export const supabaseEnabled = Boolean(supabaseUrl && supabaseKey);

/**
 * Pure SPA client: session in localStorage (default). Avoids @supabase/ssr cookie storage,
 * which could lose session after external OAuth redirects (e.g. Instagram → back to /connect-accounts).
 */
export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
