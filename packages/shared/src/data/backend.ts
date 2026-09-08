import type { SupabaseClient } from "@supabase/supabase-js";
import type { Firestore } from "firebase/firestore";

/**
 * Which store the `data.*` facade talks to. Configured once at app startup
 * (like `initFirebaseApp`), then every `data.subscribeX` / `data.createX` call
 * dispatches to the Firestore or Supabase implementation without the call site
 * knowing which. Lets the whole app flip on `NEXT_PUBLIC_DATA_BACKEND`.
 */
export type DataBackend =
  | { provider: "firebase"; firestore: Firestore }
  | { provider: "supabase"; client: SupabaseClient };

let current: DataBackend | null = null;

export function configureDataBackend(backend: DataBackend): void {
  current = backend;
}

export function getDataBackend(): DataBackend {
  if (!current) {
    throw new Error("configureDataBackend() must be called before using the data.* facade");
  }
  return current;
}

export function isDataBackendConfigured(): boolean {
  return current !== null;
}
