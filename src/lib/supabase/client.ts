/**
 * Drop-in shape from Supabase UI / shadcn registry (`supabase-client-react-router`).
 * Returns the same singleton as `@/lib/supabase` — do not create multiple clients.
 */
import { supabase } from "@/lib/supabase";

export function createClient() {
  if (!supabase) {
    throw new Error("Missing VITE_SUPABASE_URL and a publishable or anon key (see .env.example).");
  }
  return supabase;
}
