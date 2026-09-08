import { configureDataBackend } from "@life-client/shared";
import { db } from "./firebase";

// Configures the shared data.* facade on load (imported from auth-context).
// Mobile stays on Firebase until Phase 2 (Supabase auth on RN) — then this grows
// a supabase branch. The shared *Sb layer already avoids crypto.randomUUID so it
// is Hermes-safe when that lands.
if (db) {
  configureDataBackend({ provider: "firebase", firestore: db });
}
