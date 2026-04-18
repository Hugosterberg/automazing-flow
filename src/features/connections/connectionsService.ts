import type { AccountPlatform } from "@/types/accounts";
import type { Connection, ConnectionHealth } from "@/types/connection";
import type { TypedSupabaseClient } from "@/lib/supabase";
import type { Tables } from "@/types/supabase";

/**
 * Row type comes directly from the generated schema — any DB change to the
 * `v_connection_health` view will surface as a TS error here.
 *
 * Columns `stats` and `analysis` are stored as jsonb, so the generated type
 * is `Json | null`. We narrow to the app-side shapes at the mapper below.
 */
type Row = Tables<"v_connection_health">;

function normalizeHealth(value: string | null | undefined): ConnectionHealth {
  switch ((value || "").toLowerCase()) {
    case "expired":
    case "failed":
    case "disconnected":
    case "pending":
    case "missing":
    case "healthy":
      return value as ConnectionHealth;
    default:
      return "healthy";
  }
}

function rowToDomain(row: Row): Connection {
  const integration =
    row.integration_name && row.integration_category && row.integration_provider
      ? {
          name: row.integration_name,
          category: row.integration_category,
          provider: row.integration_provider,
        }
      : undefined;

  return {
    id: row.id ?? "",
    businessProfileId: (row.business_profile_id ?? row.profile_id ?? "") as string,
    platform: (row.platform ?? "") as AccountPlatform,
    username: row.username ?? "",
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    profileUrl: row.profile_url ?? undefined,
    connectedAt: row.connected_at ?? "",
    disconnectedAt: row.disconnected_at,
    isOAuth: Boolean(row.is_oauth),
    isZernio: Boolean(row.is_zernio),
    zernioAccountId: row.zernio_account_id ?? undefined,
    health: row.disconnected_at ? "disconnected" : normalizeHealth(row.health),
    lastSyncedAt: row.last_synced_at ?? undefined,
    lastSuccessfulSyncAt: row.last_successful_sync_at ?? undefined,
    lastSyncError: row.last_sync_error ?? undefined,
    integration,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * List connections for a business profile. Reads from the `v_connection_health`
 * view so rows are enriched with integration catalog metadata in a single hop.
 *
 * Falls back across both id columns so legacy rows (which only have the text
 * `profile_id`) still surface.
 *
 * When the id is not a uuid (e.g. the legacy synthetic "default" profile id
 * from AccountsContext), we skip the business_profile_id filter entirely —
 * Postgres would otherwise reject it with "invalid input syntax for type uuid".
 */
export async function listConnectionsForBusinessProfile(
  supabase: TypedSupabaseClient,
  businessProfileId: string
): Promise<Connection[]> {
  // Select "*" so PostgREST returns every column in v_connection_health;
  // the Row type comes from the generated schema, so adding/removing
  // columns in the view is caught at compile-time.
  const base = supabase
    .from("v_connection_health")
    .select("*")
    .order("connected_at", { ascending: true });

  const response = UUID_RE.test(businessProfileId)
    ? await base.or(
        `business_profile_id.eq.${businessProfileId},profile_id.eq.${businessProfileId}`
      )
    : await base.eq("profile_id", businessProfileId);

  if (response.error) throw response.error;
  const rows: Row[] = response.data ?? [];
  return rows.map(rowToDomain);
}

export async function softDisconnect(
  supabase: TypedSupabaseClient,
  connectionId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("connected_accounts")
    .update({ disconnected_at: now, health: "disconnected" })
    .eq("id", connectionId);
  if (error) throw error;
}

/**
 * Un-pause a soft-disconnected connection. Clears `disconnected_at` and puts
 * the row back into a "pending" health state so the next reconcile/sync will
 * refresh its real status. We intentionally do NOT set health back to healthy
 * — the provider token may have expired while the connection was paused.
 *
 * Does not refresh tokens. If a paused connection needs new tokens, the user
 * should reconnect through the normal OAuth flow instead.
 */
export async function resumeConnection(
  supabase: TypedSupabaseClient,
  connectionId: string
): Promise<void> {
  const { error } = await supabase
    .from("connected_accounts")
    .update({ disconnected_at: null, health: "pending", last_sync_error: null })
    .eq("id", connectionId);
  if (error) throw error;
}
