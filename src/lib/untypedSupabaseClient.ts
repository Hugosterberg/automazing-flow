/**
 * Cast for querying a table that isn't in the generated Supabase types yet
 * (`src/types/supabase.ts` lags migrations — see `npm run supabase:gen:types`).
 * `.from(table)` on the real client only accepts known table names, so
 * `marketing_snapshots`, `social_stats_snapshots`, `leads`, etc. need this
 * escape hatch until the types are regenerated. One shared cast beats
 * re-declaring the same `{ from: (table: string) => any }` workaround with
 * its own eslint-disable comment in every file that touches such a table.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the migration
export type UntypedSupabaseClient = { from: (table: string) => any };

export function asUntypedSupabaseClient(client: unknown): UntypedSupabaseClient {
  return client as unknown as UntypedSupabaseClient;
}
