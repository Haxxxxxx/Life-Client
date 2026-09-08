import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationConnection, IntegrationProvider } from "../types";
import { subscribeCollection } from "./realtime";

const ALL_PROVIDERS: IntegrationProvider[] = ["github", "gitlab", "google_calendar", "strava"];

interface IntegrationRow {
  provider: IntegrationProvider;
  status: IntegrationConnection["status"];
  external_account_label: string | null;
  scopes: string[] | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

function rowToConnection(r: IntegrationRow): IntegrationConnection {
  return {
    provider: r.provider,
    status: r.status,
    externalAccountLabel: r.external_account_label ?? undefined,
    scopes: r.scopes ?? undefined,
    connectedAt: r.connected_at ?? undefined,
    lastSyncAt: r.last_sync_at ?? undefined,
    lastError: r.last_error ?? undefined,
  };
}

export function subscribeIntegrationsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (connections: Record<IntegrationProvider, IntegrationConnection>) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<IntegrationRow, IntegrationConnection>({
    client,
    table: "integrations",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.provider,
    map: rowToConnection,
    onChange: (rows) => {
      const byProvider = {} as Record<IntegrationProvider, IntegrationConnection>;
      for (const p of ALL_PROVIDERS) byProvider[p] = { provider: p, status: "disconnected" };
      for (const c of rows) byProvider[c.provider] = c;
      onChange(byProvider);
    },
    onError,
  });
}
