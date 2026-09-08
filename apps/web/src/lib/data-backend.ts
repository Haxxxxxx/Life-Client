import { configureDataBackend } from "@life-client/shared";
import { db } from "./firebase";
import { supabase } from "./supabase";

// Runs once as a client module side-effect (imported from auth-context, which is
// in every page's tree). Picks the store from NEXT_PUBLIC_DATA_BACKEND so pages
// can call `data.subscribeX(uid, …)` without knowing which backend is live.
// During SSR both clients are null and nothing is configured — that's fine, no
// page calls `data.*` outside an effect / event handler.
const wantSupabase = process.env.NEXT_PUBLIC_DATA_BACKEND === "supabase";

if (wantSupabase && supabase) {
  configureDataBackend({ provider: "supabase", client: supabase });
} else if (db) {
  configureDataBackend({ provider: "firebase", firestore: db });
}
