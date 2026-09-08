import type { SupabaseClient } from "@supabase/supabase-js";

type ChangePayload<Row> = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Row;
  old: Partial<Row>;
};

/**
 * Rebuilds Firestore's `onSnapshot(query)` on top of Supabase Realtime.
 *
 * Supabase only streams per-row change events with a single `col=eq.value`
 * server-side filter, so this helper does an initial ordered `select`, then keeps
 * a local id→item map that it patches on every INSERT/UPDATE/DELETE and re-sorts
 * client-side before calling `onChange`. RLS is enforced on both the select and
 * the stream, so nothing leaks.
 *
 * Returns an unsubscribe function, same as the Firestore `subscribe*` helpers.
 */
export interface SubscribeCollectionOptions<Row, T> {
  client: SupabaseClient;
  table: string;
  /** the one server-side filter, e.g. { column: "user_id", value: uid } */
  filterColumn: string;
  filterValue: string;
  /** id of a raw DB row — used to key the local map (INSERT/UPDATE/DELETE) */
  rowId: (row: Row) => string;
  /** raw DB row → domain object */
  map: (row: Row) => T;
  /** initial `select` ordering (client-side `sort` still runs after) */
  order?: { column: string; ascending?: boolean };
  /** final ordering of the array handed to `onChange` */
  sort?: (a: T, b: T) => number;
  onChange: (items: T[]) => void;
  onError?: (error: Error) => void;
}

export function subscribeCollection<Row, T>(opts: SubscribeCollectionOptions<Row, T>): () => void {
  const { client, table, filterColumn, filterValue, rowId, map, order, sort, onChange, onError } = opts;
  const byId = new Map<string, T>();
  let disposed = false;

  const emit = () => {
    const arr = [...byId.values()];
    if (sort) arr.sort(sort);
    onChange(arr);
  };

  void (async () => {
    let query = client.from(table).select("*").eq(filterColumn, filterValue);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    const { data, error } = await query;
    if (disposed) return;
    if (error) {
      onError?.(new Error(error.message));
      return;
    }
    for (const row of (data ?? []) as Row[]) byId.set(rowId(row), map(row));
    emit();
  })();

  const channel = client
    .channel(`${table}:${filterColumn}=${filterValue}`)
    .on(
      // supabase-js's overload for "postgres_changes" is awkward to satisfy from
      // a generic wrapper; the runtime contract is stable, so pin the types here.
      "postgres_changes" as never,
      { event: "*", schema: "public", table, filter: `${filterColumn}=eq.${filterValue}` } as never,
      (payload: ChangePayload<Row>) => {
        if (disposed) return;
        if (payload.eventType === "DELETE") {
          byId.delete(rowId(payload.old as Row));
        } else {
          byId.set(rowId(payload.new), map(payload.new));
        }
        emit();
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError?.(new Error(`Supabase realtime ${status} on ${table}`));
      }
    });

  return () => {
    disposed = true;
    void client.removeChannel(channel);
  };
}
