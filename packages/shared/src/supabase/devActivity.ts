import type { SupabaseClient } from "@supabase/supabase-js";
import type { DevActivitySummary, DevPullRequest } from "../types";
import { subscribeCollection } from "./realtime";

interface DevActivityRow {
  user_id: string;
  provider: "github" | "gitlab";
  open_pull_requests: DevPullRequest[] | null;
  total_merged_count: number | null;
  last_sync_at: string | null;
}

function rowToSummary(r: DevActivityRow): DevActivitySummary {
  return {
    provider: r.provider,
    openPullRequests: r.open_pull_requests ?? [],
    totalMergedCount: r.total_merged_count ?? 0,
    lastSyncAt: r.last_sync_at ?? "",
  };
}

export function subscribeDevActivitySb(
  client: SupabaseClient,
  userId: string,
  provider: "github" | "gitlab",
  onChange: (summary: DevActivitySummary | null) => void,
  onError?: (error: Error) => void,
): () => void {
  // realtime filters on a single column; fetch both of the user's rows and pick
  // the requested provider client-side (there are at most two).
  return subscribeCollection<DevActivityRow, DevActivitySummary>({
    client,
    table: "dev_activity",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.provider,
    map: rowToSummary,
    onChange: (rows) => onChange(rows.find((s) => s.provider === provider) ?? null),
    onError,
  });
}
