import { configureDataBackend } from "@life-client/shared";
import { db } from "./firebase";

// Configures the shared data.* facade on load (imported from auth-context).
// Knowledge stays on Firebase until the migration's "same Supabase project vs.
// its own" decision is made — then this grows a supabase branch like apps/web's.
if (db) {
  configureDataBackend({ provider: "firebase", firestore: db });
}
