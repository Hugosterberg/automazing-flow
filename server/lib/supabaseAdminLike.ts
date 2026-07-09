/**
 * Minimal Supabase admin-client surface shared by cron jobs and routes.
 * The full generic SupabaseClient type adds noise without safety here;
 * modules that need stronger guarantees can declare a narrower interface
 * (see scheduledPostsPublisher.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder chain is intentionally untyped for brevity
export type SupabaseAdminLike = { from: (table: string) => any };
