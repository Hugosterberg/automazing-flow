import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
/** Matches Supabase dashboard / UI: publishable key (new) or legacy anon key names. */
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  ""
).trim();

export const supabaseEnabled = Boolean(supabaseUrl && supabaseKey);

/** Shared browser client (aligned with supabase.com/ui React Router block — uses @supabase/ssr). */
export const supabase: SupabaseClient | null = supabaseEnabled
  ? createBrowserClient(supabaseUrl, supabaseKey)
  : null;
