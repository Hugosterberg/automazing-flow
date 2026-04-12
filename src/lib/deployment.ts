/**
 * Local-only auth (no Supabase) and "local mode" UI should only appear
 * when developing on this machine, not on Vercel/production.
 */
export function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return true;
  return import.meta.env.DEV;
}
